// Additional bottleneck opportunities — checking the residual hot spots
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { get_encoding } from "@dqbd/tiktoken";

const enc = get_encoding("cl100k_base");
const count = (s) => enc.encode(s).length;

// ----- Header cost -----
console.log("========= HEADER COST =========");
const headers = [
  "!ts-v1\n", "!ts-v1", "!ts1\n", "!ts1", "!t1\n", "!t1",
  "!tsx-v1\n", "!tsx-v1", "!tsx1\n", "!tsx1", "!x1\n", "!x1",
];
for (const h of headers) {
  console.log(`  ${JSON.stringify(h).padEnd(15)} = ${count(h)} tokens`);
}

// ----- Check : for type annot vs range for conflict -----
console.log("\n========= SINGLE-ARG ARROW PAREN DROP =========");
const tests = [
  [".map((u)=>u.id)", ".map(u=>u.id)"],
  [".map((t)=>t.id===id)", ".map(t=>t.id===id)"],
  [".find((u)=>u.id===id)", ".find(u=>u.id===id)"],
  [".filter((t)=>t.id!==id)", ".filter(t=>t.id!==id)"],
  ["(e)=>setInput(e.target.value)", "e=>setInput(e.target.value)"],
];
for (const [a, b] of tests) {
  console.log(`  ${a.padEnd(30)} ${count(a)}t  vs  ${b.padEnd(30)} ${count(b)}t  (save ${count(a)-count(b)})`);
}

// ----- Consecutive := merge -----
console.log("\n========= CONSECUTIVE := MERGE =========");
const mergeTests = [
  [":=a=1;:=b=2;:=c=3", ":=a=1,b=2,c=3"],
  [":=rows=a.length;:=cols=b.length;:=inner=b[0].length", ":=rows=a.length,cols=b.length,inner=b[0].length"],
];
for (const [a, b] of mergeTests) {
  console.log(`  ${count(a)}t ${a}\n  ${count(b)}t ${b}  (save ${count(a)-count(b)})`);
}

// ----- Check `:` shorthand for if/else one-liner -----
console.log("\n========= IF-EXPRESSION FORM =========");
const ifTests = [
  ["if n<=1{^n}", "if n<=1:n"],
  ["if n%15===0{^\"FizzBuzz\"}", "if n%15===0:\"FizzBuzz\""],
];
for (const [a, b] of ifTests) {
  console.log(`  ${count(a)}t ${a}\n  ${count(b)}t ${b}  (save ${count(a)-count(b)})`);
}

// ----- Check ternary vs if-expr -----
console.log("\n========= TERNARY VS IF =========");
const tTests = [
  ["if n<=1{^n};^fibonacci(n-1)+fibonacci(n-2)", "^n<=1?n:fibonacci(n-1)+fibonacci(n-2)"],
];
for (const [a, b] of tTests) {
  console.log(`  ${count(a)}t ${a}\n  ${count(b)}t ${b}  (save ${count(a)-count(b)})`);
}

// ----- Trailing main() — define cost -----
console.log("\n========= TRAILING main() =========");
const mainTests = [
  ["};main()", "}"],
  [";main()", ""],
];
for (const [a, b] of mainTests) {
  console.log(`  ${count(a)}t ${JSON.stringify(a)}  vs  ${count(b)}t ${JSON.stringify(b)}  (save ${count(a)-count(b)})`);
}

// ----- JSX text in context -----
console.log("\n========= JSX TEXT =========");
const jsxTests = [
  [">Add<", ">{\"Add\"}<"],
  [">Count: <", ">{\"Count: \"}<"],
  [">Reset<", ">{\"Reset\"}<"],
];
for (const [a, b] of jsxTests) {
  console.log(`  ${count(a)}t ${a}  vs  ${count(b)}t ${b}  (save ${count(a)-count(b)})`);
}

// ----- Look for frequent patterns in actual aets -----
console.log("\n========= FREQUENT PATTERNS IN ACTUAL AETS =========");
const suites = [
  "../tests/typescript-algorithms",
  "../tests/typescript-react",
  "../tests/typescript-backend",
  "../tests/typescript-types",
];
const patterns = {
  "{^": 0,
  ";^": 0,
  "((": 0,
  "))": 0,
  "()=>": 0,
  ")=>": 0,
  "(e)=>": 0,
  "(t)=>": 0,
  "(u)=>": 0,
  "({": 0,
  "})": 0,
  ";:=": 0,
  "main()": 0,
  "document.": 0,
  "window.": 0,
  "Date.now": 0,
  "new Date": 0,
  ".length": 0,
  ".push(": 0,
  ".map(": 0,
  ".filter(": 0,
  ".find(": 0,
  ".findIndex(": 0,
  ".splice(": 0,
  ".forEach(": 0,
  ".reduce(": 0,
  ".join(": 0,
  ".split(": 0,
  ".trim(": 0,
  ".replace(": 0,
  ".toLowerCase(": 0,
  ".toUpperCase(": 0,
  ".includes(": 0,
  ".startsWith(": 0,
  ".endsWith(": 0,
  ".indexOf(": 0,
  "useState(": 0,
  "setCount": 0,
  "setTodos": 0,
  "setInput": 0,
};
for (const suite of suites) {
  const dir = resolve(suite);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".aets") && !file.endsWith(".aetx")) continue;
    const aet = readFileSync(join(dir, file), "utf-8");
    for (const pat of Object.keys(patterns)) {
      let i = 0, n = 0;
      while ((i = aet.indexOf(pat, i)) !== -1) { n++; i++; }
      patterns[pat] += n;
    }
  }
}
const sorted = Object.entries(patterns).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
for (const [pat, n] of sorted) {
  console.log(`  ${JSON.stringify(pat).padEnd(25)} × ${n}`);
}

enc.free();
