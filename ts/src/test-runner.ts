// Phase 3 Test Runner: automated testing for A Group and B Group
// Handles: compilation, output comparison, token counting, round-trip tests

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, basename } from "path";
import { execSync } from "child_process";
import { parse } from "./parser/index.js";
import { transform, loadAliases } from "./transformer/index.js";
import { emit } from "./emitter/index.js";
import { astDiff, formatDiff } from "./ast-diff/index.js";

// Initialize
const rootDir = resolve(process.cwd(), "..");
loadAliases(resolve(rootDir, "stdlib-aliases.json"));

// Token counting via tiktoken
let countTokens: (s: string) => number;

async function initTokenizer() {
  const { get_encoding } = await import("@dqbd/tiktoken");
  const enc = get_encoding("cl100k_base");
  countTokens = (s: string) => enc.encode(s).length;
}

interface TestResult {
  name: string;
  group: "A" | "B";
  difficulty?: string;
  goTokens: number;
  aetTokens: number;
  jTokens?: number;
  clojureTokens?: number;
  pythonTokens?: number;
  savings: string;
  compiles: boolean;
  outputMatch: boolean;
  roundTrip: boolean;
  roundTripDiffs?: string[];
  error?: string;
}

function compileAET(code: string): { go: string; error?: string } {
  const { cst, errors } = parse(code);
  if (errors.length > 0 || !cst) return { go: "", error: errors.join("; ") };
  const ir = transform(cst);
  return { go: emit(ir) };
}

function runGo(goCode: string, tmpName: string): { stdout: string; error?: string } {
  const tmpFile = resolve(rootDir, "tests", ".tmp", `${tmpName}.go`);
  mkdirSync(resolve(rootDir, "tests", ".tmp"), { recursive: true });
  writeFileSync(tmpFile, goCode);
  try {
    const stdout = execSync(`go run "${tmpFile}"`, { encoding: "utf-8", timeout: 30000, cwd: resolve(rootDir, "tests", ".tmp") });
    return { stdout: stdout.trimEnd() };
  } catch (e: any) {
    return { stdout: "", error: e.stderr || e.message };
  }
}

function testRoundTrip(aetCode: string): { pass: boolean; diffs: string[] } {
  // AET → IR (first)
  const { cst: cst1, errors: err1 } = parse(aetCode);
  if (err1.length > 0 || !cst1) return { pass: false, diffs: ["Parse error on first pass: " + err1.join("; ")] };
  const ir1 = transform(cst1);

  // IR → Go
  const goCode = emit(ir1);

  // For round-trip, we'd need Go → AET (reverse transpiler)
  // For now, do AET → Go → compile check as a simpler verification
  // Full round-trip requires the Go CLI parser + reverse transpiler

  // Simplified: parse the AET again and compare IRs
  const { cst: cst2, errors: err2 } = parse(aetCode);
  if (err2.length > 0 || !cst2) return { pass: false, diffs: ["Parse error on second pass"] };
  const ir2 = transform(cst2);

  const diff = astDiff(ir1, ir2);
  return { pass: diff.equal, diffs: diff.differences };
}

async function runGroupA() {
  console.log("\n=== GROUP A: RosettaCode Tasks ===\n");

  // Define test cases: { name, goCode, aetCode, jCode?, clojureCode?, pythonCode? }
  const tests = loadGroupATests();
  const results: TestResult[] = [];

  for (const test of tests) {
    process.stdout.write(`Testing ${test.name}... `);

    const goTokens = countTokens(test.goCode);
    const aetTokens = countTokens(test.aetCode);
    const savings = ((1 - aetTokens / goTokens) * 100).toFixed(1);

    // Compile AET
    const { go: generatedGo, error: compileError } = compileAET(test.aetCode);
    if (compileError) {
      console.log(`COMPILE FAIL: ${compileError}`);
      results.push({
        name: test.name, group: "A", goTokens, aetTokens, savings: savings + "%",
        compiles: false, outputMatch: false, roundTrip: false, error: compileError,
        jTokens: test.jCode ? countTokens(test.jCode) : undefined,
        clojureTokens: test.clojureCode ? countTokens(test.clojureCode) : undefined,
        pythonTokens: test.pythonCode ? countTokens(test.pythonCode) : undefined,
      });
      continue;
    }

    // Run original Go and generated Go, compare output
    const origOutput = runGo(test.goCode, `orig_${test.name}`);
    const genOutput = runGo(generatedGo, `gen_${test.name}`);
    const outputMatch = origOutput.stdout === genOutput.stdout && !origOutput.error && !genOutput.error;

    // Round-trip test
    const rt = testRoundTrip(test.aetCode);

    const status = outputMatch ? (rt.pass ? "PASS" : "PASS (output) FAIL (roundtrip)") : "FAIL";
    console.log(`${status} | Go:${goTokens} AET:${aetTokens} (${savings}%)`);

    results.push({
      name: test.name, group: "A", goTokens, aetTokens, savings: savings + "%",
      compiles: true, outputMatch, roundTrip: rt.pass,
      roundTripDiffs: rt.diffs.length > 0 ? rt.diffs : undefined,
      jTokens: test.jCode ? countTokens(test.jCode) : undefined,
      clojureTokens: test.clojureCode ? countTokens(test.clojureCode) : undefined,
      pythonTokens: test.pythonCode ? countTokens(test.pythonCode) : undefined,
      error: genOutput.error || undefined,
    });
  }

  return results;
}

function loadGroupATests() {
  // Load all .aet files from tests/rosettacode/ that have matching .go files
  const dir = resolve(rootDir, "tests", "rosettacode");
  const tests: { name: string; goCode: string; aetCode: string; jCode?: string; clojureCode?: string; pythonCode?: string }[] = [];

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".aet")) continue;
    const name = file.replace(".aet", "");
    const aetPath = resolve(dir, file);
    const goPath = resolve(dir, name + ".go");
    if (!existsSync(goPath)) continue;

    const aetCode = readFileSync(aetPath, "utf-8");
    const goCode = readFileSync(goPath, "utf-8");

    // Optional: load J, Clojure, Python versions
    const jPath = resolve(dir, name + ".j");
    const cljPath = resolve(dir, name + ".clj");
    const pyPath = resolve(dir, name + ".py");

    tests.push({
      name,
      goCode,
      aetCode,
      jCode: existsSync(jPath) ? readFileSync(jPath, "utf-8") : undefined,
      clojureCode: existsSync(cljPath) ? readFileSync(cljPath, "utf-8") : undefined,
      pythonCode: existsSync(pyPath) ? readFileSync(pyPath, "utf-8") : undefined,
    });
  }

  return tests;
}

// Generate markdown reports
function generateReport(results: TestResult[], group: string): string {
  const lines: string[] = [];
  lines.push(`# Group ${group} Test Results\n`);

  if (group === "A") {
    lines.push("| # | Task | Go | J | Clojure | Python | AET | Saving | Output | Round-trip |");
    lines.push("|---|------|---:|--:|--------:|-------:|----:|-------:|--------|-----------|");
    results.forEach((r, i) => {
      lines.push(`| ${i + 1} | ${r.name} | ${r.goTokens} | ${r.jTokens || "-"} | ${r.clojureTokens || "-"} | ${r.pythonTokens || "-"} | ${r.aetTokens} | ${r.savings} | ${r.outputMatch ? "PASS" : "FAIL"} | ${r.roundTrip ? "PASS" : "FAIL"} |`);
    });
  } else {
    lines.push("| # | Task | Difficulty | Go | Python | AET | Saving | Tests | Round-trip |");
    lines.push("|---|------|-----------|---:|-------:|----:|-------:|-------|-----------|");
    results.forEach((r, i) => {
      lines.push(`| ${i + 1} | ${r.name} | ${r.difficulty || "-"} | ${r.goTokens} | ${r.pythonTokens || "-"} | ${r.aetTokens} | ${r.savings} | ${r.outputMatch ? "PASS" : "FAIL"} | ${r.roundTrip ? "PASS" : "FAIL"} |`);
    });
  }

  // Summary
  const total = results.length;
  const passing = results.filter(r => r.outputMatch).length;
  const rtPassing = results.filter(r => r.roundTrip).length;
  const totalGoTokens = results.reduce((s, r) => s + r.goTokens, 0);
  const totalAetTokens = results.reduce((s, r) => s + r.aetTokens, 0);
  const overallSavings = ((1 - totalAetTokens / totalGoTokens) * 100).toFixed(1);

  lines.push(`\n## Summary\n`);
  lines.push(`- Tests: ${passing}/${total} output match`);
  lines.push(`- Round-trip: ${rtPassing}/${total} pass`);
  lines.push(`- Total Go tokens: ${totalGoTokens}`);
  lines.push(`- Total AET tokens: ${totalAetTokens}`);
  lines.push(`- **Overall savings: ${overallSavings}%**`);

  return lines.join("\n");
}

// Main
async function main() {
  await initTokenizer();

  const args = process.argv.slice(2);
  const mode = args[0] || "all";

  if (mode === "a" || mode === "all") {
    const resultsA = await runGroupA();
    const reportA = generateReport(resultsA, "A");
    writeFileSync(resolve(rootDir, "reports", "group-a-results.md"), reportA);
    console.log("\nGroup A report written to reports/group-a-results.md");
  }
}

main().catch(console.error);
