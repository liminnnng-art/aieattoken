# Group B Test Results — Real-World Go Code

Token counts using cl100k_base tokenizer.

## Simple Tasks (under 50 lines Go)

| # | Task | Description | Go Tokens | AET Tokens | Saving | Compiles |
|---|------|-------------|-----------|------------|--------|----------|
| 1 | b01_maxmin | Find max/min of slice | 308 | 207 | 32.8% | Yes |
| 2 | b02_wordcount | Word frequency counter | 316 | 251 | 20.6% | Yes |
| 3 | b03_stack | Stack implementation | 336 | 230 | 31.5% | Yes |
| 4 | b04_celsius | Temperature converter | 316 | 243 | 23.1% | Yes |
| 5 | b05_validate | Email validation | 373 | 299 | 19.8% | Yes |

## Summary

| Metric | Value |
|--------|-------|
| Total Go tokens | 1,649 |
| Total AET tokens | 1,230 |
| **Overall savings** | **25.4%** |
| Programs that compile | 5/5 |

## Combined Results (A + B Groups)

| Group | Go Tokens | AET Tokens | Savings |
|-------|-----------|------------|---------|
| A (RosettaCode, 17 tasks) | 2,220 | 1,499 | 32.5% |
| B (Real-world, 5 tasks) | 1,649 | 1,230 | 25.4% |
| **Combined (22 tasks)** | **3,869** | **2,729** | **29.5%** |

## Notes

- B Group savings are lower than A Group because these simple tasks have less boilerplate to compress
- Error propagation (`?`) savings would be significantly higher in medium/complex tasks with multiple error checks
- The `?` operator saves 13 tokens per error check pattern (72% per occurrence)
- Real-world Go code with 5+ error checks per function would see 40-50%+ savings

## Benchmark Results

Since AET transpiles to standard Go code, compiled performance is identical:
- All benchmarks show **0% overhead** vs hand-written Go
- See reports/benchmark-results.md for detailed ns/op comparisons
