// Phase 3 Test Runner for AET-Java transpiler
// Tests: A-Group (RosettaCode), B-Group (Real-world), Round-trip, Speed
// Usage: node tests/run-java-phase3.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "fs";
import { resolve, basename, dirname } from "path";
import { execSync } from "child_process";
import { performance } from "perf_hooks";
import { fileURLToPath } from "url";

// Import transpiler modules
import { parseJavaFile, javaAstToIR, javaIrToAETJ, loadJavaReverseAliases } from "../ts/dist/reverse/java.js";
import { parseJava } from "../ts/dist/parser/java.js";
import { transformJava, loadJavaAliases } from "../ts/dist/transformer/java.js";
import { emit as emitJava } from "../ts/dist/emitter/java.js";
import { countTokens } from "../ts/dist/utils/tokencount.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ROSETTA_DIR = resolve(__dirname, "java-rosettacode");
const REALWORLD_DIR = resolve(__dirname, "java-real-world");
const TMP_DIR = resolve(__dirname, ".tmp-java");
const RESULTS_FILE = resolve(__dirname, "java-test-results.json");
const ALIASES_FILE = resolve(ROOT, "stdlib-aliases-java.json");

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------
console.log("=== AET-Java Phase 3 Comprehensive Test Runner ===\n");

// Load aliases
loadJavaReverseAliases(ALIASES_FILE);
loadJavaAliases(ALIASES_FILE);
console.log("[init] Aliases loaded from", ALIASES_FILE);

// Create temp directory
mkdirSync(TMP_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Run javac + java on a .java file, return stdout */
function compileAndRunJava(javaCode, className) {
  const dir = resolve(TMP_DIR, `run_${className}_${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const javaFile = resolve(dir, `${className}.java`);
  writeFileSync(javaFile, javaCode);

  try {
    execSync(`javac "${javaFile}"`, {
      encoding: "utf-8",
      timeout: 30000,
      cwd: dir,
      stdio: "pipe",
    });
  } catch (e) {
    return { stdout: "", error: `javac error: ${e.stderr || e.message}` };
  }

  try {
    const stdout = execSync(`java -cp "${dir}" ${className}`, {
      encoding: "utf-8",
      timeout: 30000,
      cwd: dir,
      stdio: "pipe",
    });
    return { stdout: stdout.trimEnd() };
  } catch (e) {
    return { stdout: "", error: `java error: ${e.stderr || e.message}` };
  }
}

/** Compile and run original Java file (already on disk) */
function runOriginalJava(javaFilePath, className) {
  const dir = resolve(TMP_DIR, `orig_${className}_${Date.now()}`);
  mkdirSync(dir, { recursive: true });

  // Copy java file to temp dir
  const javaCode = readFileSync(javaFilePath, "utf-8");
  const javaFile = resolve(dir, `${className}.java`);
  writeFileSync(javaFile, javaCode);

  try {
    execSync(`javac "${javaFile}"`, {
      encoding: "utf-8",
      timeout: 30000,
      cwd: dir,
      stdio: "pipe",
    });
  } catch (e) {
    return { stdout: "", error: `javac error: ${e.stderr || e.message}` };
  }

  try {
    const stdout = execSync(`java -cp "${dir}" ${className}`, {
      encoding: "utf-8",
      timeout: 30000,
      cwd: dir,
      stdio: "pipe",
    });
    return { stdout: stdout.trimEnd() };
  } catch (e) {
    return { stdout: "", error: `java error: ${e.stderr || e.message}` };
  }
}

/** Compare two outputs line by line (trimmed) */
function compareOutputs(a, b) {
  if (a === b) return { match: true, details: "" };
  const linesA = a.split("\n").map(l => l.trimEnd());
  const linesB = b.split("\n").map(l => l.trimEnd());

  if (linesA.join("\n") === linesB.join("\n")) return { match: true, details: "" };

  const diffs = [];
  const maxLines = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < maxLines; i++) {
    const la = linesA[i] || "(missing)";
    const lb = linesB[i] || "(missing)";
    if (la.trim() !== lb.trim()) {
      diffs.push(`  line ${i + 1}: expected="${la}" got="${lb}"`);
      if (diffs.length >= 5) {
        diffs.push("  ... (more diffs)");
        break;
      }
    }
  }
  return { match: false, details: diffs.join("\n") };
}

/** Extract class name from java file path */
function classNameFromFile(filePath) {
  const name = basename(filePath, ".java");
  // Read the file to find the actual public class name
  const content = readFileSync(filePath, "utf-8");
  const match = content.match(/public\s+class\s+(\w+)/);
  return match ? match[1] : name;
}

/** Full pipeline: Java -> AETJ -> IR -> Java (emitted) */
function fullPipeline(javaFilePath, className) {
  const errors = [];

  // Step 1: Java -> IR (via reverse parser / ASTDumper)
  let javaAst, ir1, aetjCode;
  try {
    javaAst = parseJavaFile(javaFilePath);
  } catch (e) {
    return { error: `reverse parse failed: ${e.message}`, aetjCode: "", emittedJava: "", errors: [e.message] };
  }

  try {
    ir1 = javaAstToIR(javaAst);
  } catch (e) {
    return { error: `IR conversion failed: ${e.message}`, aetjCode: "", emittedJava: "", errors: [e.message] };
  }

  // Step 2: IR -> AETJ
  try {
    aetjCode = javaIrToAETJ(ir1);
  } catch (e) {
    return { error: `AETJ emission failed: ${e.message}`, aetjCode: "", emittedJava: "", errors: [e.message] };
  }

  // Step 3: Parse AETJ with forward parser
  let parseResult;
  try {
    parseResult = parseJava(aetjCode);
    if (parseResult.errors.length > 0) {
      return { error: `AETJ parse errors: ${parseResult.errors.join("; ")}`, aetjCode, emittedJava: "", errors: parseResult.errors };
    }
  } catch (e) {
    return { error: `AETJ parse failed: ${e.message}`, aetjCode, emittedJava: "", errors: [e.message] };
  }

  // Step 4: Transform CST to IR
  let ir2;
  try {
    ir2 = transformJava(parseResult.cst);
  } catch (e) {
    return { error: `transform failed: ${e.message}`, aetjCode, emittedJava: "", errors: [e.message] };
  }

  // Step 5: Emit Java
  let emittedJava;
  try {
    emittedJava = emitJava(ir2, { className });
  } catch (e) {
    return { error: `emit failed: ${e.message}`, aetjCode, emittedJava: "", errors: [e.message] };
  }

  return { error: null, aetjCode, emittedJava, errors };
}

// ---------------------------------------------------------------------------
// Test processing function
// ---------------------------------------------------------------------------

function processFile(javaFilePath, name) {
  const className = classNameFromFile(javaFilePath);
  const javaCode = readFileSync(javaFilePath, "utf-8");
  const javaTokens = countTokens(javaCode);

  const result = {
    name,
    javaTokens,
    aetTokens: 0,
    saving: "0",
    status: "ERROR",
    correctness: false,
    roundTrip: false,
    transpileMs: 0,
    error: undefined,
    aetjSnippet: undefined,
    emittedSnippet: undefined,
    outputDiff: undefined,
  };

  // Measure transpile time
  const t0 = performance.now();

  // Run full pipeline
  const pipeline = fullPipeline(javaFilePath, className);
  const t1 = performance.now();
  result.transpileMs = Math.round(t1 - t0);

  if (pipeline.error) {
    result.error = pipeline.error;
    // Still count AETJ tokens if we got that far
    if (pipeline.aetjCode) {
      result.aetTokens = countTokens(pipeline.aetjCode);
      result.saving = javaTokens > 0 ? ((1 - result.aetTokens / javaTokens) * 100).toFixed(1) : "0";
    }
    return result;
  }

  // Count tokens
  result.aetTokens = countTokens(pipeline.aetjCode);
  result.saving = javaTokens > 0 ? ((1 - result.aetTokens / javaTokens) * 100).toFixed(1) : "0";

  // Compile and run original Java
  const origRun = runOriginalJava(javaFilePath, className);
  if (origRun.error) {
    result.error = `original java failed: ${origRun.error}`;
    return result;
  }

  // Compile and run emitted Java
  const emitRun = compileAndRunJava(pipeline.emittedJava, className);
  if (emitRun.error) {
    result.error = `emitted java failed: ${emitRun.error}`;
    result.emittedSnippet = pipeline.emittedJava.substring(0, 300);
    return result;
  }

  // Compare outputs
  const cmp = compareOutputs(origRun.stdout, emitRun.stdout);
  result.correctness = cmp.match;
  if (!cmp.match) {
    result.error = `output mismatch`;
    result.outputDiff = cmp.details;
    result.status = "FAIL";
  } else {
    result.status = "PASS";
  }

  return result;
}

// ---------------------------------------------------------------------------
// Round-trip test
// ---------------------------------------------------------------------------

function roundTripTest(javaFilePath, name) {
  const className = classNameFromFile(javaFilePath);

  try {
    // Pass 1: Java -> AETJ
    const ast1 = parseJavaFile(javaFilePath);
    const ir1 = javaAstToIR(ast1);
    const aetj1 = javaIrToAETJ(ir1);

    // AETJ -> IR -> Java (forward path)
    const parseResult = parseJava(aetj1);
    if (parseResult.errors.length > 0) {
      return { pass: false, reason: `parse error on forward pass: ${parseResult.errors.join("; ")}` };
    }
    const ir2 = transformJava(parseResult.cst);
    const emittedJava = emitJava(ir2, { className });

    // Write emitted Java to temp file for second reverse pass
    const tmpDir = resolve(TMP_DIR, `rt_${name}_${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = resolve(tmpDir, `${className}.java`);
    writeFileSync(tmpFile, emittedJava);

    // Verify emitted java compiles
    try {
      execSync(`javac "${tmpFile}"`, { encoding: "utf-8", timeout: 30000, cwd: tmpDir, stdio: "pipe" });
    } catch (e) {
      return { pass: false, reason: `emitted java compile failed: ${e.stderr || e.message}` };
    }

    // Pass 2: Emitted Java -> AETJ (second reverse)
    const ast2 = parseJavaFile(tmpFile);
    const ir3 = javaAstToIR(ast2);
    const aetj2 = javaIrToAETJ(ir3);

    // Compare AETJ1 and AETJ2
    const aetj1Trimmed = aetj1.trim();
    const aetj2Trimmed = aetj2.trim();

    if (aetj1Trimmed === aetj2Trimmed) {
      return { pass: true, reason: "identical" };
    }

    // Check semantic equivalence: both should produce same output
    // Normalize whitespace and compare
    const norm1 = aetj1Trimmed.replace(/\s+/g, " ");
    const norm2 = aetj2Trimmed.replace(/\s+/g, " ");
    if (norm1 === norm2) {
      return { pass: true, reason: "equivalent (whitespace)" };
    }

    // Check if token counts are at least close (within 5%)
    const t1 = countTokens(aetj1);
    const t2 = countTokens(aetj2);
    const diff = Math.abs(t1 - t2);
    const pct = t1 > 0 ? (diff / t1 * 100).toFixed(1) : "0";

    return {
      pass: false,
      reason: `AETJ differs (tokens: ${t1} vs ${t2}, ${pct}% diff)`,
      aetj1: aetj1Trimmed.substring(0, 200),
      aetj2: aetj2Trimmed.substring(0, 200),
    };
  } catch (e) {
    return { pass: false, reason: e.message };
  }
}

// ---------------------------------------------------------------------------
// Speed test
// ---------------------------------------------------------------------------

function speedTest(javaFilePath, iterations = 10) {
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    try {
      const ast = parseJavaFile(javaFilePath);
      const ir = javaAstToIR(ast);
      const aetj = javaIrToAETJ(ir);
    } catch (e) {
      // still count time even on error
    }
    const t1 = performance.now();
    times.push(t1 - t0);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  return { avg: Math.round(avg), min: Math.round(min), max: Math.round(max), times: times.map(t => Math.round(t)) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const aGroupResults = [];
  const bGroupResults = [];

  // =========================================================================
  // 1. A-Group (RosettaCode)
  // =========================================================================
  console.log("\n" + "=".repeat(60));
  console.log("  GROUP A: RosettaCode Tests");
  console.log("=".repeat(60) + "\n");

  const rosettaFiles = readdirSync(ROSETTA_DIR)
    .filter(f => f.endsWith(".java") && !f.endsWith("_gen.java"))
    .sort();

  console.log(`Found ${rosettaFiles.length} Java files in rosettacode\n`);

  for (const file of rosettaFiles) {
    const name = basename(file, ".java");
    const filePath = resolve(ROSETTA_DIR, file);

    process.stdout.write(`  [A] ${name.padEnd(15)} `);

    const result = processFile(filePath, name);
    aGroupResults.push(result);

    const statusIcon = result.status === "PASS" ? "PASS" : result.status === "FAIL" ? "FAIL" : "ERR ";
    console.log(
      `${statusIcon} | Java:${String(result.javaTokens).padStart(5)} AETJ:${String(result.aetTokens).padStart(5)} ` +
      `Save:${result.saving.padStart(5)}% | ${result.transpileMs}ms` +
      (result.error ? ` | ${result.error.substring(0, 80)}` : "")
    );
  }

  // =========================================================================
  // 2. B-Group (Real-world)
  // =========================================================================
  console.log("\n" + "=".repeat(60));
  console.log("  GROUP B: Real-World Tests");
  console.log("=".repeat(60) + "\n");

  const realWorldFiles = readdirSync(REALWORLD_DIR)
    .filter(f => f.endsWith(".java"))
    .sort();

  console.log(`Found ${realWorldFiles.length} Java files in real-world\n`);

  for (const file of realWorldFiles) {
    const name = basename(file, ".java");
    const filePath = resolve(REALWORLD_DIR, file);

    process.stdout.write(`  [B] ${name.padEnd(20)} `);

    const result = processFile(filePath, name);
    bGroupResults.push(result);

    const statusIcon = result.status === "PASS" ? "PASS" : result.status === "FAIL" ? "FAIL" : "ERR ";
    console.log(
      `${statusIcon} | Java:${String(result.javaTokens).padStart(5)} AETJ:${String(result.aetTokens).padStart(5)} ` +
      `Save:${result.saving.padStart(5)}% | ${result.transpileMs}ms` +
      (result.error ? ` | ${result.error.substring(0, 80)}` : "")
    );
  }

  // =========================================================================
  // 3. Round-trip tests
  // =========================================================================
  console.log("\n" + "=".repeat(60));
  console.log("  ROUND-TRIP TESTS");
  console.log("=".repeat(60) + "\n");

  const allFiles = [
    ...rosettaFiles.map(f => ({ path: resolve(ROSETTA_DIR, f), name: basename(f, ".java"), group: "A" })),
    ...realWorldFiles.map(f => ({ path: resolve(REALWORLD_DIR, f), name: basename(f, ".java"), group: "B" })),
  ];

  let rtPass = 0;
  let rtFail = 0;

  for (const { path: filePath, name, group } of allFiles) {
    process.stdout.write(`  [RT:${group}] ${name.padEnd(20)} `);

    const rt = roundTripTest(filePath, name);

    if (rt.pass) {
      rtPass++;
      console.log(`PASS (${rt.reason})`);

      // Update the corresponding result
      const arr = group === "A" ? aGroupResults : bGroupResults;
      const entry = arr.find(r => r.name === name);
      if (entry) entry.roundTrip = true;
    } else {
      rtFail++;
      console.log(`FAIL: ${rt.reason.substring(0, 100)}`);

      const arr = group === "A" ? aGroupResults : bGroupResults;
      const entry = arr.find(r => r.name === name);
      if (entry) entry.roundTrip = false;
    }
  }

  // =========================================================================
  // 4. Speed test
  // =========================================================================
  console.log("\n" + "=".repeat(60));
  console.log("  TRANSPILE SPEED TEST");
  console.log("=".repeat(60) + "\n");

  const speedFile = resolve(REALWORLD_DIR, "b10_linkedlist.java");
  console.log(`  File: b10_linkedlist.java (${countTokens(readFileSync(speedFile, "utf-8"))} Java tokens)`);
  console.log(`  Iterations: 10\n`);

  const speed = speedTest(speedFile, 10);
  console.log(`  Average: ${speed.avg}ms`);
  console.log(`  Min:     ${speed.min}ms`);
  console.log(`  Max:     ${speed.max}ms`);
  console.log(`  All:     [${speed.times.join(", ")}]ms`);

  // =========================================================================
  // Summary
  // =========================================================================
  const allResults = [...aGroupResults, ...bGroupResults];
  const totalPass = allResults.filter(r => r.status === "PASS").length;
  const totalFail = allResults.filter(r => r.status === "FAIL").length;
  const totalError = allResults.filter(r => r.status === "ERROR").length;
  const totalJava = allResults.reduce((s, r) => s + r.javaTokens, 0);
  const totalAet = allResults.reduce((s, r) => s + r.aetTokens, 0);
  const avgSaving = totalJava > 0 ? ((1 - totalAet / totalJava) * 100).toFixed(1) : "0";
  const rtPassCount = allResults.filter(r => r.roundTrip).length;
  const transpileTimes = allResults.filter(r => r.transpileMs > 0).map(r => r.transpileMs);
  const avgSpeed = transpileTimes.length > 0
    ? Math.round(transpileTimes.reduce((a, b) => a + b, 0) / transpileTimes.length)
    : 0;

  console.log("\n" + "=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  console.log();
  console.log("  +-----------+-------+");
  console.log("  | Metric    | Value |");
  console.log("  +-----------+-------+");
  console.log(`  | PASS      | ${String(totalPass).padStart(5)} |`);
  console.log(`  | FAIL      | ${String(totalFail).padStart(5)} |`);
  console.log(`  | ERROR     | ${String(totalError).padStart(5)} |`);
  console.log(`  | Total     | ${String(allResults.length).padStart(5)} |`);
  console.log("  +-----------+-------+");
  console.log(`  | Java tok  | ${String(totalJava).padStart(5)} |`);
  console.log(`  | AETJ tok  | ${String(totalAet).padStart(5)} |`);
  console.log(`  | Avg save  | ${avgSaving.padStart(4)}% |`);
  console.log("  +-----------+-------+");
  console.log(`  | RT pass   | ${String(rtPassCount).padStart(5)} |`);
  console.log(`  | RT fail   | ${String(allResults.length - rtPassCount).padStart(5)} |`);
  console.log("  +-----------+-------+");
  console.log(`  | Avg speed | ${String(avgSpeed).padStart(4)}ms |`);
  console.log(`  | Spd(big)  | ${String(speed.avg).padStart(4)}ms |`);
  console.log("  +-----------+-------+");

  // Print per-file summary table
  console.log("\n  Detailed Results:");
  console.log("  " + "-".repeat(90));
  console.log("  " + "Name".padEnd(22) + "Java".padStart(6) + "AETJ".padStart(6) + "Save%".padStart(7) +
    "Status".padStart(8) + "  Correct".padStart(9) + "  RT".padStart(5) + "  Time".padStart(7));
  console.log("  " + "-".repeat(90));

  for (const r of allResults) {
    console.log(
      "  " + r.name.padEnd(22) +
      String(r.javaTokens).padStart(6) +
      String(r.aetTokens).padStart(6) +
      (r.saving + "%").padStart(7) +
      r.status.padStart(8) +
      (r.correctness ? "yes" : "no").padStart(9) +
      (r.roundTrip ? "yes" : "no").padStart(5) +
      (r.transpileMs + "ms").padStart(7)
    );
  }
  console.log("  " + "-".repeat(90));

  // =========================================================================
  // Save results
  // =========================================================================

  // Clean up result objects for JSON (remove undefined fields)
  function cleanResult(r) {
    return {
      name: r.name,
      javaTokens: r.javaTokens,
      aetTokens: r.aetTokens,
      saving: r.saving,
      status: r.status,
      correctness: r.correctness,
      roundTrip: r.roundTrip,
      transpileMs: r.transpileMs,
      ...(r.error ? { error: r.error } : {}),
    };
  }

  const output = {
    timestamp: new Date().toISOString(),
    aGroup: aGroupResults.map(cleanResult),
    bGroup: bGroupResults.map(cleanResult),
    summary: {
      totalPass,
      totalFail,
      totalError,
      totalJava,
      totalAet,
      avgSaving,
      rtPass: rtPassCount,
      avgSpeed: String(avgSpeed),
    },
    speedTest: {
      file: "b10_linkedlist.java",
      iterations: 10,
      avgMs: speed.avg,
      minMs: speed.min,
      maxMs: speed.max,
    },
  };

  writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2));
  console.log(`\n  Results saved to ${RESULTS_FILE}`);

  // Cleanup temp dir
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch { /* ignore cleanup errors */ }

  console.log("\n=== Phase 3 tests complete ===\n");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
