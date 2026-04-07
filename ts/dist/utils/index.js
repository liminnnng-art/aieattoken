import { performance } from "perf_hooks";
export function timeExecution(fn, iterations = 10) {
    const runs = [];
    let result;
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        result = fn();
        const end = performance.now();
        runs.push(end - start);
    }
    const avgMs = runs.reduce((a, b) => a + b, 0) / runs.length;
    return { result: result, avgMs, runs };
}
