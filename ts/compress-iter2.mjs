// Iteration 2: Remove trailing ^ (implicit last-expression return)
// When the last statement in a function body is ^expr, change to just expr
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

  // Find patterns: ;^expr} at the end of function bodies
  // Replace with ;expr} (remove the ^ before the last expression before })
  // Pattern: the last ^expr before } in a function body
  let compressed = code;

  // Remove trailing ^ before } at end of function body
  // Match: ^expr} where expr doesn't contain unbalanced braces
  // This handles: ^a};  ^fibonacci(n-1)+fibonacci(n-2)};  ^string(result)};  etc.
  compressed = compressed.replace(/;\^([^{}]*)\}/g, (match, expr) => {
    return `;${expr}}`;
  });

  // Also handle the case where ^ is the only statement: {^expr}
  compressed = compressed.replace(/\{(\^)([^{}]*)\}/g, (match, caret, expr) => {
    // Only remove ^ if this looks like it's the ONLY statement (no ; before)
    return `{${expr}}`;
  });

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
