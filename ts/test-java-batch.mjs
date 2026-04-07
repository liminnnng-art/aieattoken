#!/usr/bin/env node
// Fast batch test — Java → AET conversion + AET → Java compilation
// Focuses on what we can test quickly: convert + compile (skip running originals)
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, basename } from "path";
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

function run(cmd) {
  return execSync(cmd, { timeout: 120000, encoding: "utf-8", env, stdio: "pipe", maxBuffer: 10*1024*1024 });
}

function findTests(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith(".java") && !f.includes("_gen")).map(f => f.replace(".java","")).sort();
}

const groups = [
  { name: "A Group (RosettaCode)", dir: resolve(projectRoot, "tests/java-rosettacode") },
  { name: "B Group (Real-World)", dir: resolve(projectRoot, "tests/java-real-world") },
];

const allResults = [];

for (const group of groups) {
  const tests = findTests(group.dir);
  const genDir = resolve(group.dir, "gen");
  if (!existsSync(genDir)) mkdirSync(genDir, { recursive: true });

  console.log(`\n=== ${group.name} (${tests.length} tests) ===`);

  for (const name of tests) {
    const javaFile = resolve(group.dir, `${name}.java`);
    const aetFile = resolve(group.dir, `${name}.aet`);
    const genJavaFile = resolve(genDir, `${name}.java`);
    const origJava = readFileSync(javaFile, "utf-8");
    const javaTokens = count(origJava);

    let aetTokens = 0, saving = "0", status = "ERROR", phase = "";

    try {
      // Phase 1: Java → AET
      const t0 = performance.now();
      run(`node "${cli}" convert "${javaFile}" -o "${aetFile}"`);
      const convertMs = Math.round(performance.now() - t0);

      const aet = readFileSync(aetFile, "utf-8");
      aetTokens = count(aet);
      saving = ((1 - aetTokens / javaTokens) * 100).toFixed(1);

      // Phase 2: AET → Java
      phase = "compile";
      run(`node "${cli}" compile "${aetFile}" --java -o "${genJavaFile}"`);

      // Phase 3: javac generated Java
      phase = "javac";
      run(`javac "${genJavaFile}"`);

      // Phase 4: run generated + original, compare
      phase = "run-orig";
      run(`javac "${javaFile}"`);
      const origOut = run(`java -cp "${group.dir}" ${name}`).trim();

      phase = "run-gen";
      const genOut = run(`java -cp "${genDir}" ${name}`).trim();

      if (origOut === genOut) {
        status = "PASS";
      } else {
        status = "DIFF";
        const o = origOut.substring(0, 60).replace(/\n/g, "\\n");
        const g = genOut.substring(0, 60).replace(/\n/g, "\\n");
        phase = `orig="${o}" gen="${g}"`;
      }
    } catch (e) {
      const msg = e.stderr?.substring(0, 100) || e.message?.substring(0, 100) || "";
      phase += ": " + msg.replace(/\n/g, " ").substring(0, 80);
    }

    const icon = status === "PASS" ? "PASS" : status === "DIFF" ? "DIFF" : "ERR ";
    console.log(`  ${icon} ${name.padEnd(20)} ${String(javaTokens).padStart(4)}→${String(aetTokens).padStart(4)} (${saving.padStart(5)}%) ${status !== "PASS" ? phase : ""}`);
    allResults.push({ group: group.name, name, javaTokens, aetTokens, saving, status });
  }
}

// Summary
const passed = allResults.filter(r => r.status === "PASS");
const failed = allResults.filter(r => r.status !== "PASS");
const totalJ = allResults.reduce((s, r) => s + r.javaTokens, 0);
const totalA = allResults.filter(r => r.status === "PASS").reduce((s, r) => s + r.aetTokens, 0);
const passJ = passed.reduce((s, r) => s + r.javaTokens, 0);

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed.length}/${allResults.length}`);
if (passJ > 0) {
  console.log(`Token savings (passing tests): ${passJ}→${totalA} (${((1-totalA/passJ)*100).toFixed(1)}%)`);
}
if (failed.length > 0) {
  console.log(`\nFailed tests:`);
  failed.forEach(r => console.log(`  ${r.name}: ${r.status}`));
}

// Write results JSON
writeFileSync(resolve(projectRoot, "tests/java-test-results.json"), JSON.stringify({
  timestamp: new Date().toISOString(), results: allResults,
  summary: { passed: passed.length, total: allResults.length,
    passingTokenSaving: passJ > 0 ? ((1-totalA/passJ)*100).toFixed(1) : "0" }
}, null, 2));

enc.free();
process.exit(failed.length > 0 ? 1 : 0);
