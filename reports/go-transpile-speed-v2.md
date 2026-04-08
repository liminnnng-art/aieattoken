# Transpile Speed Test (AET-Go v2)

## Test Configuration

- **Input**: 17 RosettaCode .aetg files
- **Pipeline**: Parse (Chevrotain) -> Transform -> Emit Go
- **Runs**: 10 iterations
- **Platform**: Node.js on Windows 11

## Results

| Metric | Value |
|--------|-------|
| Avg time per run | **20.5 ms** |
| Min time | 16.8 ms |
| Max time | 33.2 ms (JIT warmup) |
| Avg output lines | 353 lines |
| Throughput | **17,255 lines/sec** |

## Individual Run Times (ms)

| Run | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-----|---|---|---|---|---|---|---|---|---|---|
| ms | 33.2 | 22.3 | 19.9 | 20.0 | 18.5 | 17.3 | 18.8 | 19.0 | 18.8 | 16.8 |

## Target Assessment

| Target | Required | Actual | Status |
|--------|----------|--------|--------|
| 1000 lines / 1 sec | 1,000 lines/sec | **17,255 lines/sec** | **PASS (17x faster)** |

## Notes

- First run is ~2x slower (JIT warmup)
- Steady-state throughput is ~17K lines/sec
- v2 parser additions (Hash, Bang, v1 compat keywords) add negligible overhead
- Chevrotain parser is the bottleneck; transform and emit are very fast
