#!/usr/bin/env node
// Test Java transpilation pipeline: Java → AET → Java → compile → run → compare
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, basename, dirname } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");
function count(s) { return enc.encode(s).length; }

const testDir = resolve(import.meta.dirname, "..", "tests", "java-rosettacode");
const cli = resolve(import.meta.dirname, "dist", "cli.js");
const jdkBin = "C:/Program Files/Eclipse Adoptium/jdk-25.0.2.10-hotspot/bin";
const env = { ...process.env, PATH: jdkBin + ";" + process.env.PATH };
const execOpts = { cwd: testDir, timeout: 60000, encoding: "utf-8", env };

const tests = ["Fizzbuzz", "Gcd", "Factorial", "Palindrome", "Doors100"];

let pass = 0, fail = 0;
const results = [];

for (const name of tests) {
  const javaFile = resolve(testDir, `${name}.java`);
  const aetFile = resolve(testDir, `${name}.aet`);
  const genDir = resolve(testDir, "gen");
  if (!existsSync(genDir)) { import("fs").then(f => f.mkdirSync(genDir, { recursive: true })); }
  try { execSync(`mkdir -p "${genDir}"`, { timeout: 5000 }); } catch {}
  const genJavaFile = resolve(genDir, `${name}.java`);

  if (!existsSync(javaFile)) {
    console.log(`SKIP: ${name}.java not found`);
    continue;
  }

  try {
    // Step 1: Get original Java output
    const origJava = readFileSync(javaFile, "utf-8");
    const javaTokens = count(origJava);

    execSync(`javac "${javaFile}"`, execOpts);
    const origOutput = execSync(`java ${name}`, execOpts).trim();

    // Step 2: Java → AET
    execSync(`node "${cli}" convert "${javaFile}" -o "${aetFile}"`, { ...execOpts, timeout: 60000 });
    const aet = readFileSync(aetFile, "utf-8");
    const aetTokens = count(aet);
    const saving = ((1 - aetTokens / javaTokens) * 100).toFixed(1);

    // Step 3: AET → Java
    execSync(`node "${cli}" compile "${aetFile}" --java -o "${genJavaFile}"`, { ...execOpts, timeout: 60000 });

    // Step 4: Compile + run generated Java
    execSync(`javac "${genJavaFile}"`, { ...execOpts, cwd: genDir });
    const genOutput = execSync(`java ${name}`, { ...execOpts, cwd: genDir }).trim();

    // Step 5: Compare outputs
    if (origOutput === genOutput) {
      console.log(`PASS: ${name} (${javaTokens} → ${aetTokens} tokens, ${saving}% saved)`);
      pass++;
    } else {
      console.log(`FAIL: ${name} — output mismatch`);
      console.log(`  Original: ${origOutput.substring(0, 100)}...`);
      console.log(`  Generated: ${genOutput.substring(0, 100)}...`);
      fail++;
    }

    results.push({ name, javaTokens, aetTokens, saving, status: origOutput === genOutput ? "PASS" : "FAIL" });
  } catch (e) {
    console.log(`ERROR: ${name} — ${e.message?.substring(0, 200)}`);
    fail++;
    results.push({ name, javaTokens: 0, aetTokens: 0, saving: "0", status: "ERROR" });
  }
}

console.log(`\n${pass} passed, ${fail} failed out of ${pass + fail} tests`);
console.log("\n| Test | Java Tokens | AET Tokens | Saving | Status |");
console.log("|------|-------------|------------|--------|--------|");
for (const r of results) {
  console.log(`| ${r.name} | ${r.javaTokens} | ${r.aetTokens} | ${r.saving}% | ${r.status} |`);
}

enc.free();
process.exit(fail > 0 ? 1 : 0);
