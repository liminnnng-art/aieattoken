# AET-Go v2: Compression Strategies Ranked by ROI

## Current Baseline

| Metric | v1 Value |
|--------|----------|
| Algorithmic code (Group A) | 32.5% savings |
| With Phase 4 optimizations | 39.4% savings |
| Real-world code (Group B) | 25.4% savings |
| Error-heavy code | ~50%+ savings |

## v2 Targets

| Metric | Target |
|--------|--------|
| Algorithmic code | >= 45% |
| Error-heavy code | >= 55% |

---

## Strategy Rankings (Highest ROI First)

### S1. Append Operator `+=` [CRITICAL]

**Change:** `slice = append(slice, elem)` (7 tokens) -> `slice+=elem` (3 tokens)

| Metric | Value |
|--------|-------|
| Per-instance saving | 4 tokens (57%) |
| Frequency | Very High (every Go program with slices) |
| Implementation difficulty | Medium (parser: `+=` on slice type -> append) |
| Risk | Low (unambiguous: `+=` on slice vs numeric) |
| Estimated total impact | **+2-4% overall savings** |

### S2. Error Return Sugar `->!T` [CRITICAL]

**Change:** `f()->(int,error)` (8 tokens) -> `f()->!int` (6 tokens)

| Metric | Value |
|--------|-------|
| Per-instance saving | 2-4 tokens (25-40%) per function signature |
| Frequency | Very High (60-80% of Go functions return error) |
| Implementation difficulty | Medium (parser + emitter change) |
| Risk | Low (unambiguous syntax) |
| Estimated total impact | **+2-3% algorithmic, +5-8% error-heavy** |

### S3. Type-Inferred Composite Literals [HIGH]

**Change:** `[]int{1,2,3}` (13 tokens) -> `[1,2,3]` (11 tokens)

| Metric | Value |
|--------|-------|
| Per-instance saving | 2-6 tokens (15-40%) per literal |
| Frequency | High (slices and maps in every program) |
| Implementation difficulty | High (type inference engine needed) |
| Risk | Medium (inference may be ambiguous in some contexts) |
| Estimated total impact | **+2-3% overall savings** |

Rules:
- `x:[]int=[1,2,3]` -> infer `[]int` from annotation
- Parameter context: `f(x:[]int)` called as `f([1,2,3])` -> infer from param type
- Map: `m:map[string]int={"a":1}` -> infer map type
- Standalone without context: require explicit type

### S4. Len Operator `#` [HIGH]

**Change:** `len(x)` (3 tokens) -> `#x` (2 tokens)

| Metric | Value |
|--------|-------|
| Per-instance saving | 1 token (33%) |
| Frequency | Very High (appears multiple times per function) |
| Implementation difficulty | Low (simple prefix operator) |
| Risk | Low (unambiguous) |
| Estimated total impact | **+1-2% overall savings** |

### S5. Restore Full Go Keywords [HIGH - AI Comprehension]

**Change:** `mk` -> `make`, `apl` -> `append`, `ln` -> `len`, `rng` -> `range`, `mp` -> `map`

| Metric | Value |
|--------|-------|
| Token saving | 0 (all are 1 token both ways) |
| Frequency | N/A |
| Implementation difficulty | Low (parser already uses full forms) |
| Risk | None |
| AI comprehension benefit | **Significant** (LLMs trained on Go recognize canonical keywords) |

Note: This is primarily an AI comprehension improvement, not a token saving.
The parser already uses full Go keywords; test files and spec need updating.

### S6. Expand Stdlib Aliases (50 -> ~89) [MEDIUM]

**Change:** Add ~39 new aliases for common Go stdlib functions.

| Metric | Value |
|--------|-------|
| Per-instance saving | 1-5 tokens per alias use |
| Frequency | Medium (depends on code style) |
| Implementation difficulty | Low (just add to JSON) |
| Risk | Low (aliases are optional) |
| Estimated total impact | **+1-2% overall, +3-5% real-world code** |

Key additions: `time.Millisecond`, `crypto/sha256.Sum256`, `http.NewServeMux`, `bufio.NewScanner`, `strings.ReplaceAll`, `json.MarshalIndent`, HTTP status codes.

### S7. Multi-Token Type Abbreviations [MEDIUM]

**Change:** `float64` -> `f64`, `int64` -> `i64`, `uint64` -> `u64`

| Metric | Value |
|--------|-------|
| Per-instance saving | 1 token (50%) per type usage |
| Frequency | Medium (common in numeric code) |
| Implementation difficulty | Low (simple token mapping) |
| Risk | Low |
| Estimated total impact | **+0.5-1% overall savings** |

### S8. Anonymous Goroutine/Defer Syntax [MEDIUM]

**Change:** Already `go{...}` and `defer{...}` in v1.

| Metric | Value |
|--------|-------|
| Per-instance saving | 3-4 tokens (43%) per anonymous block |
| Frequency | Medium |
| Implementation difficulty | Already done |
| Risk | None |
| Estimated total impact | Already captured in v1 |

### S9. `fallthrough` -> `ft` [LOW]

**Change:** Only keyword abbreviation that actually saves tokens (2 -> 1).

| Metric | Value |
|--------|-------|
| Per-instance saving | 1 token |
| Frequency | Very Low (rare in Go) |
| Estimated total impact | **< 0.1%** |

### S10. Variable Name Compression [REJECTED]

**Reason:** Net negative savings on typical files. Mapping overhead exceeds per-use savings. Only 7.7% of multi-token identifiers meet break-even threshold.

### S11. Additional Whitespace Compression [REJECTED]

**Reason:** AET files already have zero newlines and zero tabs. Nothing left to compress.

---

## Implementation Order and Projected Cumulative Savings

| Step | Strategy | Incremental | Cumulative (Algo) | Cumulative (Error-Heavy) |
|------|----------|------------|-------------------|-------------------------|
| 0 | v1 baseline | — | 39.4% | ~50% |
| 1 | S5: Full Go keywords | +0% (AI benefit) | 39.4% | ~50% |
| 2 | S1: Append `+=` | +2-4% | 41-43% | 52-54% |
| 3 | S4: Len `#` | +1-2% | 42-45% | 53-56% |
| 4 | S2: Error return `->!T` | +2-3% | 44-48% | 55-61% |
| 5 | S3: Type-inferred literals | +2-3% | 46-51% | 57-64% |
| 6 | S7: Type abbreviations | +0.5-1% | 47-52% | 58-65% |
| 7 | S6: Expanded aliases | +1-2% | 48-54% | 59-67% |
| 8 | S9: `ft` for fallthrough | +<0.1% | 48-54% | 59-67% |

## Target Assessment

| Target | Required | Projected | Status |
|--------|----------|-----------|--------|
| Algorithmic >= 45% | 45% | **48-54%** | **ACHIEVABLE** |
| Error-heavy >= 55% | 55% | **59-67%** | **ACHIEVABLE** |
| Round-trip 100% core | 100% | 100% (design constraint) | **ON TRACK** |
| Performance <= +10% | +10% | 0% (transpile to same Go) | **ON TRACK** |

## Risk Assessment

| Strategy | Risk | Mitigation |
|----------|------|------------|
| S1 (append `+=`) | Type confusion: `+=` on int vs slice | Parser checks receiver type in IR |
| S2 (error `!`) | Ambiguity with `!` (logical NOT) | `!` only valid after `->` in return type position |
| S3 (type inference) | Inference failure on complex nested types | Fallback to explicit type; conservative inference |
| S4 (len `#`) | `#` used as comment in some contexts | No comments in AET; unambiguous as prefix operator |
| S7 (type abbrev) | `f64` looks like an identifier | Reserve as keyword in lexer |

## File Format Change

- Extension: `.aetg` (AET-Go v2 specific)
- First line: `!go-v2`
- Backward compatibility: `.aet` files with `!v3` auto-detected as v1 Go syntax
