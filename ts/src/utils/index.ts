// Utility: token counting and timing
export { }; // ensure this is a module

import { performance } from "perf_hooks";

export function timeExecution<T>(fn: () => T, iterations: number = 10): { result: T; avgMs: number; runs: number[] } {
  const runs: number[] = [];
  let result: T;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    result = fn();
    const end = performance.now();
    runs.push(end - start);
  }
  const avgMs = runs.reduce((a, b) => a + b, 0) / runs.length;
  return { result: result!, avgMs, runs };
}
