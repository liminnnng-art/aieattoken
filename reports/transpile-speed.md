# Transpile Speed Test Results

Requirement: 1000 lines of Go code conversion in < 1 second.
Method: Node.js `performance.now()`, 10 runs averaged.

## Results

| Size | Avg (ms) | Min (ms) | Max (ms) | Status |
|------|----------|----------|----------|--------|
| Small (~10 functions) | 1.9 | 0.9 | 6.6 | PASS |
| Medium (~50 functions) | 3.2 | 2.3 | 4.9 | PASS |
| Large (~100 functions) | 4.8 | 3.9 | 6.2 | PASS |
| XL (~200 functions) | 7.6 | 6.6 | 8.7 | PASS |
| Fibonacci program | 0.4 | 0.3 | 0.7 | PASS |

## Analysis

- 200 functions transpile in ~8ms average
- Linear scaling: roughly 0.04ms per function
- 1000 lines would take approximately 20-40ms
- **Well within the 1-second requirement** (50x margin)
- First run includes JIT warmup; subsequent runs are faster

## Environment

- Node.js v24.14.1
- Windows 11 Pro
- Chevrotain parser + hand-written transformer + emitter
