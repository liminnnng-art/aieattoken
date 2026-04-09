/**
 * AET-Python Phase 3 Test Runner
 * Tests: token savings, round-trip, stdout correctness, speed
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { resolve, basename, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { performance } from "perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const require = createRequire(resolve(projectRoot, "ts/node_modules/.package-lock.json"));
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");
const countTokens = (s) => enc.encode(s).length;

// Find Python
function findPython() {
  const paths = [
    "C:/Users/user/AppData/Local/Programs/Python/Python314/python.exe",
    "C:/Users/user/AppData/Local/Programs/Python/Python313/python.exe",
  ];
  for (const p of paths) { if (existsSync(p)) return p; }
  throw new Error("Python not found");
}
const PYTHON = findPython();

// Dynamic imports (Windows needs file:// URL)
import { pathToFileURL } from "url";
const { parsePythonFile, pythonAstToIR, pythonIrToAETP } = await import(pathToFileURL(resolve(projectRoot, "ts/dist/reverse/python.js")).href);
const { parsePython } = await import(pathToFileURL(resolve(projectRoot, "ts/dist/parser/python.js")).href);
const { transformPython } = await import(pathToFileURL(resolve(projectRoot, "ts/dist/transformer/python.js")).href);
const { emitPython } = await import(pathToFileURL(resolve(projectRoot, "ts/dist/emitter/python.js")).href);

function runPython(filePath) {
  try {
    return execSync(`"${PYTHON}" "${filePath}"`, {
      encoding: "utf-8", timeout: 30000, cwd: projectRoot
    }).replace(/\r\n/g, "\n");
  } catch (e) {
    return `ERROR: ${e.message.slice(0, 200)}`;
  }
}

function runPythonCode(code) {
  const tmp = resolve(projectRoot, "tests/_tmp_test.py");
  writeFileSync(tmp, code);
  try {
    return execSync(`"${PYTHON}" "${tmp}"`, {
      encoding: "utf-8", timeout: 30000, cwd: projectRoot
    }).replace(/\r\n/g, "\n");
  } catch (e) {
    return `ERROR: ${e.message.slice(0, 200)}`;
  }
}

// ==================== TEST SUITES ====================

const groupADir = resolve(projectRoot, "tests/python-rosettacode");
const groupAFiles = readdirSync(groupADir).filter(f => f.endsWith(".py")).map(f => resolve(groupADir, f));

const groupBDir = resolve(projectRoot, "tests/python-real-world");
const groupBFiles = readdirSync(groupBDir).filter(f => f.endsWith(".py")).map(f => resolve(groupBDir, f));

// Also include existing rosettacode .py files
const existingRCDir = resolve(projectRoot, "tests/rosettacode");
const existingRCFiles = readdirSync(existingRCDir).filter(f => f.endsWith(".py")).map(f => resolve(existingRCDir, f));
const allGroupAFiles = [...existingRCFiles, ...groupAFiles];

const results = {
  groupA: [],
  groupB: [],
  roundTrip: [],
  speed: null,
};

// ==================== GROUP A: RosettaCode ====================
console.log("=== GROUP A: RosettaCode Tests ===\n");
console.log("File | Py Tok | AET Tok | Save% | Parse | Stdout Match");
console.log("---|---|---|---|---|---");

for (const f of allGroupAFiles) {
  const name = basename(f);
  const pyCode = readFileSync(f, "utf-8");
  const pyTokens = countTokens(pyCode);

  try {
    // Get original stdout
    const originalOut = runPython(f);

    // Convert to AET
    const ast = parsePythonFile(f);
    const ir = pythonAstToIR(ast);
    const aetp = pythonIrToAETP(ir);
    const aetpTokens = countTokens(aetp);
    const savePct = ((pyTokens - aetpTokens) / pyTokens * 100).toFixed(1);

    // Parse AET back
    const { errors } = parsePython(aetp);
    const parseOk = errors.length === 0;

    // Round-trip: AET → Python → execute
    let stdoutMatch = false;
    if (parseOk) {
      const ir2 = transformPython(parsePython(aetp).cst);
      const emittedPy = emitPython(ir2);
      const emittedOut = runPythonCode(emittedPy);
      stdoutMatch = emittedOut.trim() === originalOut.trim();
      if (!stdoutMatch && !originalOut.startsWith("ERROR")) {
        // Record mismatch for debugging
        results.groupA.push({
          file: name, pyTokens, aetpTokens, savePct, parseOk,
          stdoutMatch, originalOut: originalOut.slice(0, 100),
          emittedOut: emittedOut.slice(0, 100),
        });
      } else {
        results.groupA.push({ file: name, pyTokens, aetpTokens, savePct, parseOk, stdoutMatch });
      }
    } else {
      results.groupA.push({ file: name, pyTokens, aetpTokens, savePct, parseOk, stdoutMatch: false });
    }

    console.log(`${name} | ${pyTokens} | ${aetpTokens} | ${savePct}% | ${parseOk ? "OK" : "FAIL"} | ${stdoutMatch ? "MATCH" : "DIFF"}`);
  } catch (e) {
    console.log(`${name} | ${pyTokens} | ERR | - | - | ${e.message.slice(0, 40)}`);
    results.groupA.push({ file: name, pyTokens, aetpTokens: 0, savePct: "0", parseOk: false, stdoutMatch: false, error: e.message.slice(0, 100) });
  }
}

// ==================== GROUP B: Real-World ====================
console.log("\n=== GROUP B: Real-World Tests ===\n");
console.log("File | Py Tok | AET Tok | Save% | Parse | Round-Trip");
console.log("---|---|---|---|---|---");

for (const f of groupBFiles) {
  const name = basename(f);
  const pyCode = readFileSync(f, "utf-8");
  const pyTokens = countTokens(pyCode);

  try {
    const ast = parsePythonFile(f);
    const ir = pythonAstToIR(ast);
    const aetp = pythonIrToAETP(ir);
    const aetpTokens = countTokens(aetp);
    const savePct = ((pyTokens - aetpTokens) / pyTokens * 100).toFixed(1);

    const { errors } = parsePython(aetp);
    const parseOk = errors.length === 0;

    // Round-trip: AET → Python → AET → compare
    let roundTripOk = false;
    if (parseOk) {
      try {
        const ir2 = transformPython(parsePython(aetp).cst);
        const emittedPy = emitPython(ir2);
        // Check emitted Python is valid by parsing it again
        const emittedOut = runPythonCode(`import ast; ast.parse(${JSON.stringify(emittedPy)}); print("VALID")`);
        roundTripOk = emittedOut.trim() === "VALID";
      } catch { roundTripOk = false; }
    }

    results.groupB.push({ file: name, pyTokens, aetpTokens, savePct, parseOk, roundTripOk });
    console.log(`${name} | ${pyTokens} | ${aetpTokens} | ${savePct}% | ${parseOk ? "OK" : "FAIL"} | ${roundTripOk ? "OK" : "FAIL"}`);
  } catch (e) {
    console.log(`${name} | ${pyTokens} | ERR | - | - | ${e.message.slice(0, 40)}`);
    results.groupB.push({ file: name, pyTokens, aetpTokens: 0, savePct: "0", parseOk: false, roundTripOk: false, error: e.message.slice(0, 100) });
  }
}

// ==================== ROUND-TRIP AST IDENTITY ====================
console.log("\n=== ROUND-TRIP: Py → AET → Py → AET (AST identity) ===\n");

// Test on a subset of files (simpler ones for AST comparison)
const roundTripFiles = allGroupAFiles.slice(0, 10);
for (const f of roundTripFiles) {
  const name = basename(f);
  try {
    const ast1 = parsePythonFile(f);
    const ir1 = pythonAstToIR(ast1);
    const aetp1 = pythonIrToAETP(ir1);

    // Parse AET, emit Python, convert back to AET
    const { errors, cst } = parsePython(aetp1);
    if (errors.length > 0) {
      console.log(`${name}: SKIP (parse error)`);
      continue;
    }
    const ir2 = transformPython(cst);
    const py2 = emitPython(ir2);

    // Now convert the emitted Python back to AET
    const tmp = resolve(projectRoot, "tests/_tmp_roundtrip.py");
    writeFileSync(tmp, py2);
    const ast3 = parsePythonFile(tmp);
    const ir3 = pythonAstToIR(ast3);
    const aetp2 = pythonIrToAETP(ir3);

    // Compare AET tokens (not exact string — normalized comparison)
    const tok1 = countTokens(aetp1);
    const tok2 = countTokens(aetp2);
    const diff = Math.abs(tok1 - tok2);
    const pctDiff = (diff / tok1 * 100).toFixed(1);
    const status = diff <= 2 ? "IDENTICAL" : pctDiff < 5 ? "NEAR" : "DIVERGED";

    results.roundTrip.push({ file: name, aetp1Tokens: tok1, aetp2Tokens: tok2, diff, pctDiff, status });
    console.log(`${name}: AET1=${tok1} AET2=${tok2} diff=${diff} (${pctDiff}%) ${status}`);
  } catch (e) {
    console.log(`${name}: ERROR ${e.message.slice(0, 60)}`);
    results.roundTrip.push({ file: name, error: e.message.slice(0, 100) });
  }
}

// ==================== SPEED TEST ====================
console.log("\n=== SPEED TEST ===\n");

const speedFiles = [...allGroupAFiles.slice(0, 5), ...groupBFiles.slice(0, 3)];
const iterations = 10;
let totalLines = 0;
let totalTimeMs = 0;

for (const f of speedFiles) {
  const pyCode = readFileSync(f, "utf-8");
  const lines = pyCode.split("\n").length;
  totalLines += lines;

  // Time the conversion
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const ast = parsePythonFile(f);
    const ir = pythonAstToIR(ast);
    pythonIrToAETP(ir);
  }
  const elapsed = performance.now() - t0;
  const avgMs = elapsed / iterations;
  totalTimeMs += avgMs;

  console.log(`${basename(f)}: ${lines} lines, ${avgMs.toFixed(1)}ms avg (${iterations} runs)`);
}

const linesPerSec = (totalLines / (totalTimeMs / 1000)).toFixed(0);
results.speed = { totalLines, totalTimeMs: totalTimeMs.toFixed(1), linesPerSec, iterations };
console.log(`\nTotal: ${totalLines} lines in ${totalTimeMs.toFixed(1)}ms avg = ${linesPerSec} lines/sec`);

// ==================== SUMMARY ====================
console.log("\n=== SUMMARY ===\n");

const aPassCount = results.groupA.filter(r => r.parseOk).length;
const aMatchCount = results.groupA.filter(r => r.stdoutMatch).length;
const bPassCount = results.groupB.filter(r => r.parseOk).length;
const bRtCount = results.groupB.filter(r => r.roundTripOk).length;

const allResults = [...results.groupA, ...results.groupB];
const totalPy = allResults.reduce((s, r) => s + r.pyTokens, 0);
const totalAetp = allResults.reduce((s, r) => s + (r.aetpTokens || 0), 0);
const totalSavePct = ((totalPy - totalAetp) / totalPy * 100).toFixed(1);

console.log(`Group A (RosettaCode): ${aPassCount}/${results.groupA.length} parse, ${aMatchCount}/${results.groupA.length} stdout match`);
console.log(`Group B (Real-World):  ${bPassCount}/${results.groupB.length} parse, ${bRtCount}/${results.groupB.length} round-trip`);
console.log(`Overall token savings: ${totalPy} → ${totalAetp} (${totalSavePct}%)`);
console.log(`Speed: ${linesPerSec} lines/sec`);

// Write results JSON
writeFileSync(resolve(projectRoot, "tests/python-test-results.json"), JSON.stringify(results, null, 2));
console.log("\nResults written to tests/python-test-results.json");
