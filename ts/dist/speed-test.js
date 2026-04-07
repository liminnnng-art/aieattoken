// Transpile speed test: measure time to convert AET → Go
import { performance } from "perf_hooks";
import { parse } from "./parser/index.js";
import { transform, loadAliases } from "./transformer/index.js";
import { emit } from "./emitter/index.js";
import { resolve } from "path";
loadAliases(resolve(process.cwd(), "..", "stdlib-aliases.json"));
// Generate a ~100-line AET program (will measure at various sizes)
function generateAET(functionCount) {
    const parts = ["!v1"];
    for (let i = 0; i < functionCount; i++) {
        parts.push(`calc${i}(x:int)->int{if x<=1{^x};^calc${i}(x-1)+calc${i}(x-2)}`);
    }
    parts.push(`main(){for i:=0;i<10;i++{pl(i)}}`);
    return parts.join(";");
}
function compile(code) {
    const { cst, errors } = parse(code);
    if (errors.length > 0 || !cst)
        return null;
    const ir = transform(cst);
    return emit(ir);
}
// Run speed test
const sizes = [
    { name: "Small (~10 functions)", count: 10 },
    { name: "Medium (~50 functions)", count: 50 },
    { name: "Large (~100 functions)", count: 100 },
    { name: "XL (~200 functions)", count: 200 },
];
console.log("Transpile Speed Test (10 runs each)\n");
console.log("| Size | Avg (ms) | Min (ms) | Max (ms) | Status |");
console.log("|------|----------|----------|----------|--------|");
for (const size of sizes) {
    const code = generateAET(size.count);
    const runs = [];
    for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const result = compile(code);
        const end = performance.now();
        if (!result) {
            console.log(`| ${size.name} | FAILED | - | - | FAIL |`);
            break;
        }
        runs.push(end - start);
    }
    if (runs.length === 10) {
        const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
        const min = Math.min(...runs);
        const max = Math.max(...runs);
        const status = avg < 1000 ? "PASS" : "FAIL (>1s)";
        console.log(`| ${size.name} | ${avg.toFixed(1)} | ${min.toFixed(1)} | ${max.toFixed(1)} | ${status} |`);
    }
}
// Also test with the fibonacci example
const fibCode = "!v1;fibonacci(n:int)->int{if n<=1{^n};^fibonacci(n-1)+fibonacci(n-2)};main(){for i:=0;i<10;i++{pf(\"%d \",fibonacci(i))};pl()}";
const fibRuns = [];
for (let i = 0; i < 10; i++) {
    const start = performance.now();
    compile(fibCode);
    const end = performance.now();
    fibRuns.push(end - start);
}
const fibAvg = fibRuns.reduce((a, b) => a + b, 0) / fibRuns.length;
console.log(`| Fibonacci program | ${fibAvg.toFixed(1)} | ${Math.min(...fibRuns).toFixed(1)} | ${Math.max(...fibRuns).toFixed(1)} | ${fibAvg < 1000 ? "PASS" : "FAIL"} |`);
