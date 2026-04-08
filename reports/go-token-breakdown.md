# AET-Go Token Breakdown: The Remaining 60.6%

## Context

AET-Go v1 achieves 39.4% token savings on algorithmic code (Group A RosettaCode).
This report analyzes what the remaining 60.6% of AET tokens consists of.

## Analysis Method

Analyzed 6 representative RosettaCode files: fibonacci, sieve, caesar, bubblesort, binsearch, matrix.
Combined: Go = 1065 tokens, AET = 590 tokens (44.6% savings on this subset).

## Token Composition of AET Output

| Category | Est. Tokens | % of AET Total | Compressible? |
|----------|-------------|----------------|---------------|
| **Delimiters** `{,},(,),[,],;,,` | ~242 | **41.1%** | Partially (type inference can remove some `[]`) |
| **Variable/param names** | ~111 | **18.9%** | No (semantic content) |
| **Operators** `:=,==,<=,+,-,*,%` | ~73 | **12.4%** | No (already 1 token each) |
| **Number literals** | ~44 | **7.4%** | No (algorithm constants) |
| **Keywords** `if,for,switch,...` | ~39 | **6.6%** | No (already 1 token each) |
| **String/char literals** | ~30 | **5.1%** | No (data content) |
| **Function names** (user-defined) | ~21 | **3.5%** | No (semantic content) |
| **Residual whitespace** (in strings) | ~16 | **2.7%** | No (inside string literals) |
| **Type annotations** `int,bool,...` | ~12 | **2.1%** | Yes (type inference) |
| **Boolean literals** | ~2 | **0.2%** | No |

## Where the Savings Came From (Go -> AET)

| Compression Source | Tokens Saved | % of Total Savings |
|--------------------|-------------|-------------------|
| Whitespace removal (newlines, tabs, indentation) | ~220 | **46%** |
| Package/import elimination | ~80 | **17%** |
| `func` keyword elimination | ~30 | **6%** |
| `return` -> `^` / implicit return | ~25 | **5%** |
| Stdlib aliases (`fmt.Println` -> `pl`) | ~50 | **11%** |
| Type annotation removal | ~20 | **4%** |
| Space removal in expressions | ~50 | **11%** |

## BPE Merging Bonus

AET's dense, whitespace-free syntax triggers cl100k_base BPE merging:
- Adjacent tokens like `(){` or `(n` merge into single BPE tokens
- Across the 6 files, BPE merging gives ~26.8% bonus compression
- This is a hidden benefit of compact syntax that partially offsets semicolons

## Incompressible Floor

| Component | Minimum Tokens | Notes |
|-----------|---------------|-------|
| Identifiers (vars + funcs) | ~132 | User's semantic choices |
| Literals (numbers + strings) | ~75 | Algorithm data |
| Operators | ~73 | Already minimal |
| Structural brackets | ~100 | Needed for scope parsing |
| Keywords | ~39 | Already 1 token each |
| **Total incompressible** | **~419** | **71% of current AET** |

## Compressible Remaining (~29% of AET)

| Target | Est. Tokens | Strategy |
|--------|-------------|----------|
| Redundant delimiters (type annotations in literals) | ~40 | Type inference: `[]int{1,2,3}` -> `[1,2,3]` |
| `len(x)` calls | ~10 | `#x` operator |
| `append(s,x)` calls | ~15 | `s+=x` operator |
| `(T, error)` return signatures | ~20 | `->!T` sugar |
| Remaining type annotations | ~12 | Context-dependent inference |
| `map[K]V` type prefix in literals | ~10 | Inference from context |
| **Total compressible** | **~107** | **~18% further reduction possible** |

## Projected v2 Savings

Current AET: 590 tokens (44.6% vs Go)
Projected v2: 590 - 107 = ~483 tokens
Projected v2 savings: **~54.7% vs Go** (algorithmic code)

For error-heavy code: current ~50% + structural improvements = **~60%+**
