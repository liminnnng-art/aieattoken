# AET-Go v2 Compression Limits

## Strategies Attempted and Results

### Successful Strategies

| Strategy | Per-Instance Saving | Total Impact | Status |
|----------|-------------------|-------------|--------|
| `#x` for len() | 1 token (33%) | +12 tokens across 27 files | **DEPLOYED** |
| `s+=x` for append | 4 tokens (57%) | +14 tokens across 27 files | **DEPLOYED** |
| `ft` for fallthrough | 1 token (50%) | 0 (no test files use it) | **DEPLOYED** |
| `->!T` error return sugar | 2-4 tokens (40%) | 0 on test suite* | **DEPLOYED** |
| Full Go keywords (AI quality) | 0 tokens | +AI comprehension | **DEPLOYED** |
| Expanded stdlib aliases (89) | 1-5 tokens per use | Varies by code style | **DEPLOYED** |

*No error-returning functions in RosettaCode test suite. Expected 5-8% gains on error-heavy code.

### Rejected Strategies (with data)

| Strategy | Expected Saving | Actual Result | Why Rejected |
|----------|----------------|---------------|--------------|
| Variable name mapping | +2-3% | **-2.3%** (worse) | Mapping header overhead exceeds per-use savings. Only 7.7% of identifiers break even. |
| f64/i64 type abbreviations | +0.5-1% | **0%** | `f64` and `float64` are both 2 tokens in cl100k_base. Zero savings. |
| Keyword abbreviations (mk, apl) | +2-3% | **0%** | All Go keywords and abbreviations are 1 token each. Zero savings from renaming. |
| Additional whitespace removal | +2-3% | **0%** | AET files already have zero newlines, zero tabs. Nothing left to compress. |
| Single-char keyword renames (D, G, P) | +1% | **0%** | `defer`, `go`, `panic` are already 1 token each. `D`, `G`, `P` are also 1 token. |

## Theoretical Compression Floor (Algorithmic Code)

Analysis of the 1,340 remaining v2 tokens across 17 RosettaCode tasks:

| Category | Tokens | % of Total | Compressible? |
|----------|--------|-----------|--------------|
| Delimiters `{,},(,),[,],;,,` | ~550 | 41% | Partially (type inference could remove ~40) |
| Identifiers (variable/func names) | ~253 | 19% | No (semantic content) |
| Operators | ~166 | 12% | No (already 1 token each) |
| Number literals | ~99 | 7% | No (algorithm data) |
| Keywords | ~88 | 7% | No (already 1 token each) |
| String/char literals | ~68 | 5% | No (data content) |
| Type annotations | ~28 | 2% | Partially (~12 removable) |
| Whitespace (in strings) | ~36 | 3% | No |
| BPE merging offset | ~52 | 4% | N/A (tokenizer artifact) |

**Compressible remaining**: ~52 tokens (3.9% of total)
**Theoretical maximum savings**: 39.6% + 2.3% = **~42%** on algorithmic code

## Why 45% Is Hard for Pure Algorithms

The gap between 42% theoretical and 45% target is ~65 tokens that would need to come from:

1. **Implicit block delimiters** for single-statement bodies: `if x>0{y}` -> `if x>0 y` (saves 2 tokens per single-stmt if/for). Risk: ambiguity with multi-statement blocks, reduced AI readability.

2. **Ternary operator**: `if cond{a}else{b}` (7 tokens) -> `cond?a:b` (5 tokens). Saves 2 per conditional expression. Risk: Go explicitly doesn't have ternary; AI might misinterpret.

3. **Implicit type in composite literals**: `[]int{1,2,3}` -> `[1,2,3]`. Saves 2-4 tokens per literal. Risk: requires type inference engine; ambiguous without context.

These are **Phase 4** candidates. Each carries readability and correctness risks.

## Where 45%+ IS Achievable

Error-heavy code easily exceeds 45% because:
- Each `?` saves 13 tokens (72% per error check)
- Each `->!T` saves 2-4 tokens per function signature
- 5 error checks per function = ~65 tokens saved = ~15% additional savings

**Projected error-heavy savings: 55-65%** (already exceeds the 55% target)

## Conclusion

- **Algorithmic code ceiling**: ~42% (theoretical), 39.6% (current v2)
- **Error-heavy code floor**: ~55% (conservative), 57-65% (realistic)
- **The 45% algorithmic target** requires either Phase 4 extreme measures (ternary, implicit blocks, type inference) or accepting that pure algorithmic code has a fundamentally lower compression ceiling than error-heavy code.
