# Group A Test Results — RosettaCode Tasks (AET-Go v2)

Token counts using cl100k_base tokenizer. All 17 programs parse and transform.

| # | Task | Go | AET v1 | AET v2 | v1 Saving | v2 Saving | v2 vs v1 |
|---|------|---:|-------:|-------:|----------:|----------:|---------:|
| 1 | fibonacci | 72 | 43 | 43 | 40.3% | 40.3% | 0 |
| 2 | fizzbuzz | 88 | 54 | 54 | 38.6% | 38.6% | 0 |
| 3 | gcd | 54 | 29 | 29 | 46.3% | 46.3% | 0 |
| 4 | factorial | 73 | 48 | 48 | 34.2% | 34.2% | 0 |
| 5 | sieve | 191 | 106 | 103 | 44.5% | **46.1%** | 3 |
| 6 | ackermann | 94 | 59 | 59 | 37.2% | 37.2% | 0 |
| 7 | hanoi | 117 | 69 | 69 | 41.0% | 41.0% | 0 |
| 8 | bubblesort | 144 | 93 | 90 | 35.4% | **37.5%** | 3 |
| 9 | binsearch | 198 | 104 | 104 | 47.5% | 47.5% | 0 |
| 10 | caesar | 242 | 127 | 126 | 47.5% | **47.9%** | 1 |
| 11 | palindrome | 110 | 86 | 85 | 21.8% | **22.7%** | 1 |
| 12 | doors100 | 107 | 66 | 66 | 38.3% | 38.3% | 0 |
| 13 | reverse | 113 | 66 | 65 | 41.6% | **42.5%** | 1 |
| 14 | tokenize | 53 | 28 | 28 | 47.2% | 47.2% | 0 |
| 15 | roman | 186 | 139 | 139 | 25.3% | 25.3% | 0 |
| 16 | luhn | 160 | 115 | 115 | 28.1% | 28.1% | 0 |
| 17 | matrix | 218 | 117 | 117 | 46.3% | 46.3% | 0 |
| | **TOTAL** | **2220** | **1349** | **1340** | **39.2%** | **39.6%** | **9** |

## v2 Improvements (5 files affected)

| Task | v1 Token | v2 Token | Saved | Source |
|------|---------|---------|-------|--------|
| sieve | 106 | 103 | 3 | `apl(primes,i)` -> `primes+=i` |
| bubblesort | 93 | 90 | 3 | `ln(a)` -> `#a`, `apl(a,...)` -> `a+=...` |
| caesar | 127 | 126 | 1 | `ln(text)` -> `#text` |
| palindrome | 86 | 85 | 1 | `ln(runes)` -> `#runes` |
| reverse | 66 | 65 | 1 | `ln(runes)` -> `#runes` |

## Parse + Transform Verification

- **17/17 v2 files parse** successfully
- **15/17 round-trip** produce equivalent Go function count
- **2 warnings** (caesar, matrix): emit 2 functions vs original 3 (pre-existing limitation of one-pass transform, not v2-related)
- **24/24 v1 files** still parse (backward compatibility intact)
