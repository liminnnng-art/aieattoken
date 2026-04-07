// Iteration 4: Compact C-style for loops using range syntax
// for i:=0;i<N;i++{ → for i:=0..N{
// for i:=X;i<=Y;i++{ → for i:=X..Y+1{  (keep as-is if complex)
// for i:=X;i>=Y;i--{ → keep as-is (downward loops don't compress well)
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

  let compressed = code;

  // Pattern: for VAR:=START;VAR<END;VAR++{  →  for VAR:=START..END{
  compressed = compressed.replace(
    /for (\w+):=(\w+);(\1)<(\w+);\1\+\+\{/g,
    'for $1:=$2..$4{'
  );

  // Pattern: for VAR:=START;VAR<len(EXPR);VAR++{  →  for VAR:=START..len(EXPR){
  compressed = compressed.replace(
    /for (\w+):=(\w+);(\1)<(len\([^)]+\));\1\+\+\{/g,
    'for $1:=$2..$4{'
  );

  const after = t(compressed);
  totalBefore += before;
  totalAfter += after;

  if (before !== after) {
    console.log(`${name}: ${before} → ${after} (-${before-after}) | ${compressed.substring(0, 80)}...`);
    writeFileSync(file, compressed);
  } else {
    console.log(`${name}: ${before} (no change)`);
  }
}

console.log(`\nTotal: ${totalBefore} → ${totalAfter} (-${totalBefore-totalAfter} tokens, ${((totalBefore-totalAfter)/totalBefore*100).toFixed(1)}%)`);
const totalGo = tasks.reduce((s, name) => s + t(readFileSync(resolve(dir, name + ".go"), "utf-8")), 0);
console.log(`Overall: Go ${totalGo} → AET ${totalAfter} = ${((1-totalAfter/totalGo)*100).toFixed(1)}% savings`);
enc.free();
