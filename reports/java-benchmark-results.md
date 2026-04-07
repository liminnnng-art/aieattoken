# Java Benchmark Results

**Status: Pending**

Benchmarking requires a working full round-trip pipeline to produce meaningful results. Currently, 8 of 16 Group A tests and 0 of 10 Group B tests complete the full round-trip (Java to AET to Java with correct output).

## Prerequisites

Before benchmarking can proceed, the following AET parser issues must be resolved:

1. **Ternary operator support** -- add `? :` to AET grammar (Go has no ternary)
2. **Array initializer syntax** -- handle `new int[]{}` patterns
3. **Java stdlib method patterns** -- StringBuilder.append, .reverse, .length
4. **switch/case semantics** -- align Java switch behavior with AET representation
5. **Generics in parser** -- handle `<T>` type parameters in reverse path
6. **Enhanced for-each** -- Java `for (Type x : collection)` pattern
7. **Access modifiers** -- reconstruct `public`, `private`, `static` from AET

## Planned Benchmarks

Once round-trip is fixed, benchmarks will measure:

| Metric | Description |
|--------|-------------|
| Token savings | Java vs AET token counts (already measured: 31.6% Group A, 30.5% Group B) |
| AI comprehension | LLM accuracy on tasks using AET vs Java source |
| Conversion speed | End-to-end latency excluding JVM startup |
| Scaling | Token savings vs program size correlation |

## Current Token Data (Pre-Benchmark)

| Group | Java Tokens | AET Tokens | Saving |
|-------|------------:|-----------:|-------:|
| A (RosettaCode, 16 tests) | 2476 | 1694 | 31.6% |
| B (Real-World, 10 tests) | 12164 | 8450 | 30.5% |
| **Combined (26 tests)** | **14640** | **10144** | **30.7%** |

These savings are lower than the Phase 1 projection of 55-65% because the test programs lack the major Java waste sources: POJO boilerplate, import blocks, try-catch chains, and getter/setter patterns. Real production code with these patterns would see higher savings.
