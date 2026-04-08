# AET-Go v2: Variable Name Compression Feasibility Analysis

## Concept

Variable name mapping: define short aliases at file header, reuse throughout.
Example: `!map{fibonacci:f,result:r}` at file start, then use `f` and `r` everywhere.

## Data: Variable Tokens in Go Source Files

| File | Var Tokens | Total Tokens | % of Total | Unique Idents | Avg Repetitions |
|------|-----------|-------------|-----------|----------------|-----------------|
| sieve.go | 57 | 191 | 29.8% | 7 | 6.3 |
| caesar.go | 88 | 242 | 36.4% | 27 | 2.7 |
| bubblesort.go | 34 | 144 | 23.6% | 7 | 4.6 |
| binsearch.go | 44 | 198 | 22.2% | 14 | 3.0 |
| matrix.go | 46 | 218 | 21.1% | 14 | 3.0 |
| **Average** | — | — | **26.6%** | — | **3.9** |

## Key Finding: Go Variables Are Already Short

Go programmers favor short names: `i`, `j`, `n`, `c`, `s`, `m`, `t`, `lo`, `hi`, `mid`, `arr`.
Most variable names in RosettaCode are already **1 token** in cl100k_base.

Multi-token names are rare:
- `caesarEncrypt` (3 tokens), `caesarDecrypt` (3 tokens)
- `binarySearch` (2 tokens), `bubbleSort` (2 tokens), `printMatrix` (2 tokens)
- `primes` (2 tokens), `is_prime` (2 tokens), `decrypted` (2 tokens)

## Break-Even Analysis

Mapping overhead per entry: `name:alias` costs ~3 tokens in the header.

| Name Token Count | Occurrences Needed for Break-Even |
|------------------|----------------------------------|
| 2-token name | 6+ occurrences |
| 3-token name | 4+ occurrences |
| 4-token name | 3+ occurrences |

Across all 17 Go test files: **only 2 of 26 multi-token identifiers (7.7%) meet break-even**.

## Net Savings Estimate

| File | Net Token Change | % Change |
|------|-----------------|----------|
| sieve.aet | -4 tokens | -3.8% (worse) |
| caesar.aet | -2 tokens | -1.6% (worse) |
| bubblesort.aet | -3 tokens | -3.2% (worse) |
| binsearch.aet | -3 tokens | -2.9% (worse) |
| matrix.aet | 0 tokens | 0.0% (neutral) |
| **Average** | **-2.4 tokens** | **-2.3% (worse)** |

## When Variable Compression WOULD Work

- Large production files (500+ lines)
- Descriptive variable names (`httpResponseHandler`, `databaseConnectionPool`)
- Same long name repeated 20+ times
- Enterprise codebases (not algorithm code)

## Decision: NOT RECOMMENDED for v2

**Reasons:**
1. Net negative savings on typical files
2. Adds complexity to parser (mapping table syntax)
3. Reduces AI comprehension (AI must track alias mappings)
4. Go's naming convention already favors short names
5. Only 7.7% of multi-token identifiers benefit

**Alternative:** Leave variable names as-is. Focus compression effort on structural patterns (operators, type inference, boilerplate elimination) which have much higher ROI.
