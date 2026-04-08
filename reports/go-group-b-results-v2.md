# Group B Test Results — Real-World Code (AET-Go v2)

Token counts using cl100k_base tokenizer.

| # | Task | Go | AET v1 | AET v2 | v1 Saving | v2 Saving | v2 vs v1 |
|---|------|---:|-------:|-------:|----------:|----------:|---------:|
| 1 | b01_maxmin | 308 | 207 | 208 | 32.8% | 32.5% | -1 |
| 2 | b02_wordcount | 316 | 253 | 243 | 19.9% | **23.1%** | 10 |
| 3 | b03_stack | 336 | 232 | 230 | 31.0% | **31.5%** | 2 |
| 4 | b04_celsius | 316 | 243 | 244 | 23.1% | 22.8% | -1 |
| 5 | b05_validate | 373 | 300 | 299 | 19.6% | **19.8%** | 1 |
| 6 | b06_kvstore | 669 | 517 | 514 | 22.7% | **23.2%** | 3 |
| 7 | b07_jsonapi | 740 | 425 | 426 | 42.6% | 42.4% | -1 |
| 8 | b08_csv | 1057 | 700 | 693 | 33.8% | **34.4%** | 7 |
| 9 | b09_retry | 878 | 679 | 680 | 22.7% | 22.6% | -1 |
| 10 | b10_pipeline | 983 | 772 | 770 | 21.5% | **21.7%** | 2 |
| | **TOTAL** | **5976** | **4328** | **4307** | **27.6%** | **27.9%** | **21** |

## v2 Improvements

6 files improved (total 25 tokens saved):
- b02_wordcount: +10 tokens from `#` and `+=` operators
- b08_csv: +7 tokens from multiple `#` and `+=` uses
- b06_kvstore: +3 tokens from `#` operator
- b03_stack: +2 tokens from `#` operator
- b10_pipeline: +2 tokens from keyword normalization
- b05_validate: +1 token

4 files regressed slightly (-4 tokens total):
- Keyword expansion: `mk` -> `make`, `mp` -> `map`, `fn` -> `func` (all 1 token) sometimes interact differently with BPE tokenizer in dense contexts, occasionally costing 1 extra token.

## Parse Status

- 3/10 v2 files parse successfully (b01_maxmin, b03_stack, b06_kvstore)
- 7/10 fail due to advanced syntax constructs not yet in parser (multi-struct files, channel receive expressions, etc.)
- These are pre-existing parser limitations, not v2 regressions
