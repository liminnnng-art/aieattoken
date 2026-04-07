// Iteration 1: Remove type annotations from all AET files
// Type inference: the transpiler will need to infer types from context
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

  // Remove type annotations from function parameters and return types
  // Pattern: (name:type,...) -> (name,...)
  // Pattern: ->type or ->(type,type) -> removed
  let compressed = code;

  // Remove return type annotations: ->type or ->(type,...)
  compressed = compressed.replace(/->\(([^)]+)\)/g, (match) => {
    // Keep multi-return types if they include error — transpiler needs this hint
    if (match.includes("error")) return match;
    return "";
  });
  compressed = compressed.replace(/->(?:int|string|bool|byte|float64|\[\]int|\[\]bool|\[\]\[\]int|\[\]string|\[\]rune)/g, "");

  // Remove parameter type annotations: name:type -> name
  // But keep the first occurrence in each param list for functions that NEED type info
  // Actually, for maximum compression, remove ALL type annotations
  compressed = compressed.replace(/:(?:int|string|bool|byte|float64|error|\[\]int|\[\]bool|\[\]byte|\[\]string|\[\]\[\]int|\[\]rune)/g, "");

  const after = t(compressed);
  totalBefore += before;
  totalAfter += after;

  if (before !== after) {
    console.log(`${name}: ${before} → ${after} (-${before-after} tokens, ${((before-after)/before*100).toFixed(1)}%)`);
    writeFileSync(file, compressed);
  } else {
    console.log(`${name}: ${before} (no change)`);
  }
}

console.log(`\nTotal: ${totalBefore} → ${totalAfter} (-${totalBefore-totalAfter} tokens, ${((totalBefore-totalAfter)/totalBefore*100).toFixed(1)}%)`);
enc.free();
