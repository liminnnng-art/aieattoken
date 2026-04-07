# Java Transpile Speed Results

## Test Configuration

- **Input size:** 1056 lines of Java source across 26 test files
- **Direction:** Java to AET (forward path)
- **Platform:** Windows 11, TypeScript runtime

## Results

| Metric | Time |
|--------|-----:|
| Total wall-clock time | ~30s |
| JVM startup overhead | ~29s |
| Actual TS processing | <1s |

## JVM Overhead Analysis

The conversion pipeline invokes `javac` to validate Java source before conversion. JVM startup dominates total execution time at approximately 29 seconds per invocation, while the actual TypeScript tokenization and AET emission complete in under 1 second.

| Phase | Time | % of Total |
|-------|-----:|-----------:|
| JVM cold start | ~29s | ~97% |
| Java parsing/validation | <0.5s | ~1% |
| AET tokenization + emission | <0.5s | ~1% |
| File I/O | <0.1s | <1% |

## Throughput (Excluding JVM Startup)

| Metric | Value |
|--------|------:|
| Lines per second | ~1000+ |
| Tokens per second | ~14000+ |
| Files per second | ~26+ |

When JVM startup is excluded, the TypeScript processing is effectively instantaneous for codebases of this size.

## Mitigation Options

| Approach | Expected Improvement |
|----------|---------------------|
| JVM daemon (keep javac process warm) | Eliminate 29s cold start |
| GraalVM native-image for javac | Reduce startup to <1s |
| Skip javac validation (trust input) | Eliminate JVM dependency entirely |
| Batch processing (one JVM invocation) | Amortize startup across files |

For batch conversion of large codebases, a JVM daemon or batched invocation would reduce per-file overhead to near zero, making the <1s TS processing time the dominant cost.
