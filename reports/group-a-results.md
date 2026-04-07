# Group A Test Results — RosettaCode Tasks

Token counts using cl100k_base tokenizer. All 17 programs compile and produce correct output.

| # | Task | Go | J | Clojure | Python | **AET** | **Saving** |
|---|------|---:|--:|--------:|-------:|--------:|-----------:|
| 1 | fibonacci | 72 | 43 | 60 | 54 | **56** | **22.2%** |
| 2 | fizzbuzz | 88 | 77 | 78 | 73 | **58** | **34.1%** |
| 3 | gcd | 54 | 24 | 44 | 45 | **38** | **29.6%** |
| 4 | factorial | 73 | 34 | 54 | 35 | **57** | **21.9%** |
| 5 | sieve | 191 | 32 | 98 | 130 | **114** | **40.3%** |
| 6 | ackermann | 94 | 104 | 89 | 99 | **71** | **24.5%** |
| 7 | hanoi | 117 | 130 | 84 | 106 | **77** | **34.2%** |
| 8 | bubblesort | 144 | 79 | 127 | 116 | **102** | **29.2%** |
| 9 | binsearch | 198 | 69 | 165 | 170 | **115** | **41.9%** |
| 10 | caesar | 242 | 203 | 208 | 186 | **135** | **44.2%** |
| 11 | palindrome | 110 | 54 | 55 | 49 | **94** | **14.5%** |
| 12 | doors100 | 107 | 35 | 90 | 81 | **70** | **34.6%** |
| 13 | reverse | 113 | 35 | 42 | 32 | **73** | **35.4%** |
| 14 | tokenize | 53 | 33 | 38 | 32 | **32** | **39.6%** |
| 15 | roman | 186 | 201 | 188 | 163 | **150** | **19.4%** |
| 16 | luhn | 160 | 100 | 143 | 117 | **123** | **23.1%** |
| 17 | matrix | 218 | 62 | 111 | 112 | **134** | **38.5%** |
| | **TOTAL** | **2220** | **1315** | **1674** | **1600** | **1499** | **32.5%** |

## Summary

- **17/17 programs** compile and produce correct output
- **17/17 round-trip tests** pass (AET → Go → AET, AST identical)

### Token Savings vs Go

| Language | Total Tokens | Savings vs Go |
|----------|-------------|---------------|
| Go | 2220 | baseline |
| J | 1315 | 40.8% |
| Clojure | 1674 | 24.6% |
| Python | 1600 | 27.9% |
| **AET** | **1499** | **32.5%** |

### Validation

- Transpile correctness: All Go output from AET matches original Go stdout
- Round-trip: AET → IR → AET produces identical AST on re-parse