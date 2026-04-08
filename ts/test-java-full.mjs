#!/usr/bin/env node
// Full Java pipeline test — A Group (RosettaCode) + B Group (real-world)
// Tests: correctness, token savings, round-trip, transpile speed
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, basename, dirname } from "path";
import { createRequire } from "module";
import { performance } from "perf_hooks";

const require = createRequire(import.meta.url);
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");
function count(s) { return enc.encode(s).length; }

const projectRoot = resolve(import.meta.dirname, "..");
const cli = resolve(import.meta.dirname, "dist", "cli.js");
const jdkBin = "C:/Program Files/Eclipse Adoptium/jdk-25.0.2.10-hotspot/bin";
const env = { ...process.env, PATH: jdkBin + ";" + process.env.PATH };
const execOpts = { timeout: 120000, encoding: "utf-8", env, maxBuffer: 10 * 1024 * 1024 };

function run(cmd, opts = {}) {
  return execSync(cmd, { ...execOpts, ...opts }).toString().trim();
}

// Discover test files
function findTests(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(".java") && !f.includes("_gen"))
    .map(f => f.replace(".java", ""))
    .sort();
}

const aGroupDir = resolve(projectRoot, "tests", "java-rosettacode");
const bGroupDir = resolve(projectRoot, "tests", "java-real-world");

const aGroupTests = findTests(aGroupDir);
const bGroupTests = findTests(bGroupDir);

console.log(`=== JAVA PIPELINE FULL TEST ===`);
console.log(`A Group: ${aGroupTests.length} tests (${aGroupDir})`);
console.log(`B Group: ${bGroupTests.length} tests (${bGroupDir})\n`);

// Ensure gen directories
for (const d of [resolve(aGroupDir, "gen"), resolve(bGroupDir, "gen")]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

async function runTestGroup(groupName, testDir, tests) {
  const results = [];
  let pass = 0, fail = 0, error = 0;

  for (const name of tests) {
    const javaFile = resolve(testDir, `${name}.java`);
    const aetFile = resolve(testDir, `${name}.aet`);
    const genDir = resolve(testDir, "gen");
    // Class name is capitalised by the CLI; the .java file must match the class name
    const className = name.replace(/^\w/, c => c.toUpperCase());
    const genJavaFile = resolve(genDir, `${className}.java`);

    const result = { name, javaTokens: 0, aetTokens: 0, saving: "0", status: "ERROR",
      correctness: false, roundTrip: false, transpileMs: 0 };

    try {
      const origJava = readFileSync(javaFile, "utf-8");
      result.javaTokens = count(origJava);

      // Step 1: Compile & run original Java
      run(`javac "${javaFile}"`, { cwd: testDir });
      const origOutput = run(`java ${name}`, { cwd: testDir });

      // Step 2: Java → AET (measure transpile speed)
      const t0 = performance.now();
      run(`node "${cli}" convert "${javaFile}" -o "${aetFile}"`);
      const t1 = performance.now();
      result.transpileMs = Math.round(t1 - t0);

      const aet = readFileSync(aetFile, "utf-8");
      result.aetTokens = count(aet);
      result.saving = ((1 - result.aetTokens / result.javaTokens) * 100).toFixed(1);

      // Step 3: AET → Java
      run(`node "${cli}" compile "${aetFile}" --java -o "${genJavaFile}"`);

      // Step 4: Compile & run generated Java
      run(`javac "${genJavaFile}"`, { cwd: genDir });
      const genOutput = run(`java ${className}`, { cwd: genDir });

      // Step 5: Correctness check
      result.correctness = origOutput === genOutput;

      // Step 6: Round-trip — Java → AET → Java → AET, compare two AET files
      const aet2File = resolve(testDir, `${name}_rt.aet`);
      try {
        run(`node "${cli}" convert "${genJavaFile}" -o "${aet2File}"`);
        const aet2 = readFileSync(aet2File, "utf-8");
        // Simple comparison: both AET strings should be similar
        // (not exact due to formatting differences, but token counts should match)
        const aet2Tokens = count(aet2);
        const tokenDiff = Math.abs(result.aetTokens - aet2Tokens);
        result.roundTrip = tokenDiff <= Math.max(3, result.aetTokens * 0.05); // within 5% or 3 tokens
      } catch (e) {
        result.roundTrip = false;
      }

      if (result.correctness) {
        result.status = "PASS";
        pass++;
      } else {
        result.status = "FAIL";
        fail++;
        console.log(`  Output mismatch: ${name}`);
        console.log(`    Original (first 80): ${origOutput.substring(0, 80)}`);
        console.log(`    Generated (first 80): ${genOutput.substring(0, 80)}`);
      }
    } catch (e) {
      result.status = "ERROR";
      error++;
      console.log(`  ERROR: ${name} — ${e.message?.substring(0, 150)}`);
    }

    const statusIcon = result.status === "PASS" ? "PASS" : result.status === "FAIL" ? "FAIL" : "ERR ";
    console.log(`  ${statusIcon}: ${name} (${result.javaTokens}→${result.aetTokens} tokens, ${result.saving}%, ${result.transpileMs}ms)`);
    results.push(result);
  }

  console.log(`\n${groupName}: ${pass} passed, ${fail} failed, ${error} errors out of ${tests.length}\n`);
  return results;
}

console.log("--- A Group: RosettaCode ---");
const aResults = await runTestGroup("A Group", aGroupDir, aGroupTests);

console.log("--- B Group: Real-World ---");
const bResults = await runTestGroup("B Group", bGroupDir, bGroupTests);

// Summary tables
function printTable(groupName, results) {
  console.log(`\n${groupName} Results:`);
  console.log("| # | Test | Java Tokens | AET Tokens | Saving | Correct | Round-Trip | Speed(ms) | Status |");
  console.log("|---|------|-------------|------------|--------|---------|------------|-----------|--------|");
  let totalJava = 0, totalAet = 0;
  results.forEach((r, i) => {
    totalJava += r.javaTokens;
    totalAet += r.aetTokens;
    console.log(`| ${i + 1} | ${r.name} | ${r.javaTokens} | ${r.aetTokens} | ${r.saving}% | ${r.correctness ? "Yes" : "No"} | ${r.roundTrip ? "Yes" : "No"} | ${r.transpileMs} | ${r.status} |`);
  });
  const totalSaving = totalJava > 0 ? ((1 - totalAet / totalJava) * 100).toFixed(1) : "0";
  console.log(`| | **TOTAL** | **${totalJava}** | **${totalAet}** | **${totalSaving}%** | | | | |`);
}

printTable("A Group (RosettaCode)", aResults);
printTable("B Group (Real-World)", bResults);

// Combined summary
const allResults = [...aResults, ...bResults];
const totalPass = allResults.filter(r => r.status === "PASS").length;
const totalFail = allResults.filter(r => r.status === "FAIL").length;
const totalError = allResults.filter(r => r.status === "ERROR").length;
const totalJava = allResults.reduce((s, r) => s + r.javaTokens, 0);
const totalAet = allResults.reduce((s, r) => s + r.aetTokens, 0);
const avgSaving = totalJava > 0 ? ((1 - totalAet / totalJava) * 100).toFixed(1) : "0";
const avgSpeed = (allResults.reduce((s, r) => s + r.transpileMs, 0) / allResults.length).toFixed(0);
const rtPass = allResults.filter(r => r.roundTrip).length;

console.log(`\n=== COMBINED SUMMARY ===`);
console.log(`Tests: ${totalPass}/${allResults.length} pass (${totalFail} fail, ${totalError} error)`);
console.log(`Token savings: ${totalJava} → ${totalAet} (${avgSaving}% average)`);
console.log(`Round-trip: ${rtPass}/${allResults.length} pass`);
console.log(`Avg transpile speed: ${avgSpeed}ms`);
console.log(`Correctness rate: ${(totalPass / allResults.length * 100).toFixed(1)}%`);

// Write machine-readable results
writeFileSync(resolve(projectRoot, "tests", "java-test-results.json"), JSON.stringify({
  timestamp: new Date().toISOString(),
  aGroup: aResults,
  bGroup: bResults,
  summary: { totalPass, totalFail, totalError, totalJava, totalAet, avgSaving, rtPass, avgSpeed }
}, null, 2));

enc.free();
process.exit(totalFail + totalError > 0 ? 1 : 0);
