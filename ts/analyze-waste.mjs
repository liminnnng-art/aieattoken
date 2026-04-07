// Analyze where tokens are being wasted in current AET vs what's theoretically possible
import { get_encoding } from "@dqbd/tiktoken";
import { readFileSync } from "fs";
import { resolve } from "path";

const enc = get_encoding("cl100k_base");
const t = (s) => enc.encode(s).length;
const tokens = (s) => enc.encode(s);

const dir = resolve(process.cwd(), "..", "tests", "rosettacode");

// Analyze fibonacci in detail
const fib = readFileSync(resolve(dir, "fibonacci.aet"), "utf-8");
console.log("=== Fibonacci AET Token Breakdown ===");
console.log(`Total: ${t(fib)} tokens`);
console.log(`Code: ${fib}`);

// Tokenize and show each token
const fibTokens = enc.encode(fib);
const decoded = [];
for (const tok of fibTokens) {
  const bytes = enc.decode(new Uint32Array([tok]));
  decoded.push({ id: tok, text: new TextDecoder().decode(bytes) });
}
console.log("\nToken-by-token:");
decoded.forEach((d, i) => console.log(`  ${i}: [${d.id}] "${d.text}"`));

// Identify compression opportunities
console.log("\n=== Compression Opportunities ===\n");

// 1. Type annotations that could be removed
const typeAnnotations = [
  { pattern: "(n:int)->int", bare: "(n)", savings: "remove type annotations" },
  { pattern: "(a:int,b:int)->int", bare: "(a,b)", savings: "remove type annotations" },
  { pattern: "(text:string,shift:int)->string", bare: "(text,shift)", savings: "remove types" },
  { pattern: "(s:string)->bool", bare: "(s)", savings: "remove types" },
  { pattern: "(limit:int)->[]int", bare: "(limit)", savings: "remove types" },
];
console.log("1. Type annotation removal:");
for (const ta of typeAnnotations) {
  const before = t(ta.pattern);
  const after = t(ta.bare);
  console.log(`   "${ta.pattern}" (${before}t) → "${ta.bare}" (${after}t) = -${before-after} tokens`);
}

// 2. Semicolons and structural tokens
console.log("\n2. Structural token costs:");
console.log(`   ";" = ${t(";")} token (statement separator)`);
console.log(`   "{" = ${t("{")} token`);
console.log(`   "}" = ${t("}")} token`);
console.log(`   "!v1" = ${t("!v1")} tokens (version marker)`);
console.log(`   "!v1;" = ${t("!v1;")} tokens`);

// 3. Common patterns that could be compressed
console.log("\n3. Pattern compression opportunities:");
const patterns = [
  ["for i:=0;i<n;i++{", "Typical C-for header"],
  ["for i:=0;i<len(x);i++{", "For with len()"],
  ["for _,v:=range items{", "Range loop"],
  ["if n<=1{^n}", "Base case return"],
  ["if n==0{^1}", "Base case return"],
  ["make([]bool,n)", "make slice"],
  ["make([]int,0)", "make empty slice"],
  ["append(result,x)", "append"],
  ["len(a)-1", "len minus 1"],
];
for (const [p, desc] of patterns) {
  console.log(`   "${p}" = ${t(p)} tokens (${desc})`);
}

// 4. Measure savings if we removed ALL type annotations from ALL files
console.log("\n4. Estimated savings from removing type annotations:");
const tasks = ["fibonacci","fizzbuzz","gcd","factorial","sieve","ackermann","hanoi",
  "bubblesort","binsearch","caesar","palindrome","doors100","reverse","tokenize","roman","luhn","matrix"];

let totalBefore = 0, totalEstAfter = 0;
for (const name of tasks) {
  const aetFile = resolve(dir, name + ".aet");
  const code = readFileSync(aetFile, "utf-8");
  const before = t(code);
  // Remove type annotations: :type patterns in param lists and ->type return types
  const stripped = code
    .replace(/:(?:int|string|bool|byte|float64|error|\[\]int|\[\]bool|\[\]byte|\[\]string|\[\]\[\]int|rune)/g, "")
    .replace(/->\(?(?:int|string|bool|byte|float64|error|\[\]int|\[\]bool|\[\]\[\]int)\)?/g, "");
  const after = t(stripped);
  totalBefore += before;
  totalEstAfter += after;
  if (before !== after) {
    console.log(`   ${name}: ${before} → ${after} (-${before-after} tokens, ${((before-after)/before*100).toFixed(1)}%)`);
  }
}
console.log(`   Total: ${totalBefore} → ${totalEstAfter} (-${totalBefore-totalEstAfter} tokens, ${((totalBefore-totalEstAfter)/totalBefore*100).toFixed(1)}%)`);

// 5. What if we also shorten common keywords?
console.log("\n5. Keyword shortening opportunities:");
const kwTests = [
  ["for", "f", "for loops"],
  ["range", "rn", "range keyword"],
  ["switch", "sw", "switch"],
  ["case", "cs", "case"],
  ["default", "df", "default"],
  ["make", "mk", "make builtin"],
  ["append", "ap", "append builtin"],
  ["len", "ln", "len builtin"],
  ["true", "T", "true literal"],
  ["false", "F", "false literal"],
];
for (const [orig, short, desc] of kwTests) {
  console.log(`   "${orig}" (${t(orig)}t) → "${short}" (${t(short)}t) = ${t(orig) === t(short) ? "NO SAVINGS" : `-${t(orig)-t(short)}`} (${desc})`);
}

enc.free();
