#!/usr/bin/env node
// Transpile speed test — target: 1000 lines Java < 1 second
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { performance } from "perf_hooks";

const projectRoot = resolve(import.meta.dirname, "..");
const cli = resolve(import.meta.dirname, "dist", "cli.js");
const jdkBin = "C:/Program Files/Eclipse Adoptium/jdk-25.0.2.10-hotspot/bin";
const env = { ...process.env, PATH: jdkBin + ";" + process.env.PATH };

// Generate a ~1000 line Java file
function generateLargeJavaFile(path) {
  const lines = [];
  lines.push("public class SpeedTest {");
  // Generate 50 methods, each ~20 lines
  for (let m = 0; m < 50; m++) {
    lines.push(`    public static int method${m}(int x) {`);
    lines.push(`        int result = 0;`);
    for (let i = 0; i < 15; i++) {
      lines.push(`        if (x > ${i * 10}) { result += x * ${i + 1}; }`);
    }
    lines.push(`        return result;`);
    lines.push(`    }`);
    lines.push("");
  }
  lines.push("    public static void main(String[] args) {");
  lines.push("        int sum = 0;");
  for (let m = 0; m < 50; m++) {
    lines.push(`        sum += method${m}(${m});`);
  }
  lines.push("        System.out.println(sum);");
  lines.push("    }");
  lines.push("}");
  const content = lines.join("\n");
  writeFileSync(path, content);
  return { content, lineCount: lines.length };
}

const testDir = resolve(projectRoot, "tests", "java-rosettacode", "gen");
if (!existsSync(testDir)) { execSync(`mkdir -p "${testDir}"`); }
const javaFile = resolve(testDir, "SpeedTest.java");
const aetFile = resolve(testDir, "SpeedTest.aet");

// Generate
const { content, lineCount } = generateLargeJavaFile(javaFile);
console.log(`Generated ${lineCount} line Java file (${content.length} bytes)\n`);

// Compile to verify it's valid Java
try {
  execSync(`javac "${javaFile}"`, { timeout: 30000, env });
  console.log("javac compilation: OK");
} catch (e) {
  console.log("javac compilation: FAILED — " + e.message?.substring(0, 200));
}

// Run 10 iterations of Java → AET
console.log(`\nRunning 10 iterations of Java → AET conversion...`);
const times = [];
for (let i = 0; i < 10; i++) {
  const t0 = performance.now();
  try {
    execSync(`node "${cli}" convert "${javaFile}" -o "${aetFile}"`, {
      timeout: 60000, env, encoding: "utf-8", stdio: "pipe"
    });
  } catch (e) {
    console.log(`  Iteration ${i + 1}: ERROR — ${e.message?.substring(0, 100)}`);
    continue;
  }
  const t1 = performance.now();
  const ms = Math.round(t1 - t0);
  times.push(ms);
  console.log(`  Iteration ${i + 1}: ${ms}ms`);
}

if (times.length > 0) {
  const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(0);
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(`\nResults:`);
  console.log(`  Lines: ${lineCount}`);
  console.log(`  Iterations: ${times.length}`);
  console.log(`  Average: ${avg}ms`);
  console.log(`  Min: ${min}ms`);
  console.log(`  Max: ${max}ms`);
  console.log(`  Target: <1000ms`);
  console.log(`  Status: ${Number(avg) < 1000 ? "PASS" : "FAIL"}`);
} else {
  console.log("\nAll iterations failed.");
}
