// Iteration 3: Remove version marker !v1; from all AET files
// Version can be specified externally (metadata) rather than in-band
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { get_encoding } from "@dqbd/tiktoken";

const enc = get_encoding("cl100k_base");
const t = (s) => enc.encode(s).length;
const dir = resolve(process.cwd(), "..", "tests", "rosettacode");

const tasks = ["fibonacci","fizzbuzz","gcd","factorial","sieve","ackermann","hanoi",
  "bubblesort","binsearch","caesar","palindrome","doors100","reverse","tokenize","roman","luhn","matrix"];

let totalBefore = 0, totalAfter = 0;

for (const name of tasks) {
  const file = resolve(dir, name + ".aet");
  const code = readFileSync(file, "utf-8");
  const before = t(code);

  // Remove !v1; prefix
  const compressed = code.replace(/^!v1;?/, "");
  const after = t(compressed);
  totalBefore += before;
  totalAfter += after;

  if (before !== after) {
    console.log(`${name}: ${before} → ${after} (-${before-after} tokens)`);
    writeFileSync(file, compressed);
  }
}

console.log(`\nTotal: ${totalBefore} → ${totalAfter} (-${totalBefore-totalAfter} tokens, ${((totalBefore-totalAfter)/totalBefore*100).toFixed(1)}%)`);

// Also update counts vs Go
const totalGo = tasks.reduce((s, name) => s + t(readFileSync(resolve(dir, name + ".go"), "utf-8")), 0);
console.log(`Overall: Go ${totalGo} → AET ${totalAfter} = ${((1-totalAfter/totalGo)*100).toFixed(1)}% savings`);
enc.free();
