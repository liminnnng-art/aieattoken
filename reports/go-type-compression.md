# AET-Go v2: Type System Compression Analysis

## 1. Composite Literal Type Inference (HIGH VALUE)

### Slice Literals

| Pattern | Tokens | Strategy |
|---------|--------|----------|
| `[]int{1, 2, 3, 4, 5}` | 17 | Go original |
| `[]int{1,2,3,4,5}` | 13 | Space removal |
| `[1,2,3,4,5]` | 11 | **Type inference** |

**Saving: 35% (6 tokens)** per typed slice literal.

Rule: When assigned to a typed context (`x:[]int=[1,2,3]`) or passed to a typed parameter, infer the slice type. Standalone literals require explicit type.

### Map Literals

| Pattern | Tokens | Strategy |
|---------|--------|----------|
| `map[string]int{"a": 1, "b": 2}` | 15 | Go original |
| `map[string]int{"a":1,"b":2}` | 12 | Space removal |
| `{"a":1,"b":2}` | 9 | **Type inference** |

**Saving: 40% (6 tokens)** per typed map literal.

Rule: Same as slices — infer from assignment target or parameter type.

### Struct Literals

| Pattern | Tokens | Strategy |
|---------|--------|----------|
| `User{Name:"Alice",Age:30}` | 8 | Already compact |
| `{Name:"Alice",Age:30}` | 7 | Drop type name in context |

**Saving: 1 token** per struct literal in typed context.

## 2. Error Return Sugar `->!T` (VERY HIGH VALUE)

The `(T, error)` return pattern is the most common function signature in Go.

| Pattern | Tokens | Strategy |
|---------|--------|----------|
| `func Open(name string) (*File, error)` | 10 | Go original |
| `Open(name:string)->(*File,error)` | 8 | AET v1 |
| `Open(name:string)->!*File` | 6 | **v2 `!` sugar** |

**Saving: 40% (4 tokens)** per function signature.

Rule: `->!T` means `-> (T, error)`. The `!` prefix signals an error-returning function.
- `->!int` expands to `-> (int, error)`
- `->!*File` expands to `-> (*File, error)`
- `->!` (bare) expands to `-> error` (void function that may fail)

### Frequency Analysis
In typical Go codebases, 60-80% of non-trivial functions return `(T, error)`.
A 100-function codebase saves ~200-400 tokens from this sugar alone.

## 3. Append Operator `+=` (HIGHEST VALUE)

| Pattern | Tokens | Strategy |
|---------|--------|----------|
| `slice = append(slice, elem)` | 7 | Go original |
| `slice+=elem` | 3 | **v2 `+=` for append** |

**Saving: 57% (4 tokens)** per append call.

Rule: `s+=x` expands to `s = append(s, x)` when `s` is a slice type.
- `s+=x` -> `s = append(s, x)` (single element)
- `s+=x...` -> `s = append(s, x...)` (spread)

This is the single highest-ROI compression in the entire analysis. `append` is used in virtually every non-trivial Go program.

## 4. Len Operator `#` (HIGH VALUE)

| Pattern | Tokens | Strategy |
|---------|--------|----------|
| `len(slice)` | 3 | Go original |
| `#slice` | 2 | **v2 `#` prefix** |

**Saving: 33% (1 token)** per len call.

Rule: `#x` expands to `len(x)`. Applies to slices, maps, strings, channels.

Note: `cap(x)` stays as `cap(x)` — too infrequent to warrant a special operator.

## 5. Interface Definition (Already Optimized)

| Pattern | Tokens | Saving |
|---------|--------|--------|
| `type Reader interface { Read(p []byte) (n int, err error) }` | 17 | baseline |
| `@Reader[Read(p:[]byte)->(int,error)]` | 13 | 24% |
| `@Reader[Read(p:[]byte)->!(int)]` | 11 | 35% (with `!` sugar) |

`@Name[...]` syntax already handles interfaces well. Adding `!` sugar helps further.

## 6. Type Assertion (Minimal Opportunity)

| Pattern | Tokens | Saving |
|---------|--------|--------|
| `val, ok := x.(string)` | 8 | baseline |
| `val,ok:=x.(string)` | 8 | 0% |

Already well-tokenized. No structural improvement available.

## 7. Type Switch (Minimal Opportunity)

| Pattern | Tokens | Saving |
|---------|--------|--------|
| Go type switch (2 cases) | 25 | baseline |
| AET type switch | 21 | 16% |

Savings come from whitespace/alias compression, not structural changes.

## 8. Multi-Return Values

| Pattern | Tokens | Strategy |
|---------|--------|----------|
| `func f() (int, string, error)` | 9 | Go original |
| `f()->(int,string,error)` | 8 | AET v1 |
| `f()->!(int,string)` | 6 | **v2: `!` wraps tuple + error** |

Rule: `->!(T1,T2)` expands to `-> (T1, T2, error)`.

## 9. Multiple Assignment (Already Optimal)

| Pattern | Tokens |
|---------|--------|
| `a, b := f()` | 6 |
| `a,b:=f()` | 5 |

1 token saving from space removal. Already at limit.

## 10. Multi-Token Type Abbreviations

| Type | Tokens | v2 Short Form | Tokens | Saving |
|------|--------|---------------|--------|--------|
| `float64` | 2 | `f64` | 1 | 1 token |
| `int64` | 2 | `i64` | 1 | 1 token |
| `uint64` | 2 | `u64` | 1 | 1 token |
| `float32` | 2 | `f32` | 1 | 1 token |
| `int32` | 2 | `i32` | 1 | 1 token |
| `int16` | 2 | `i16` | 1 | 1 token |
| `int8` | 2 | `i8` | 1 | 1 token |
| `[]byte` | 2 | `bytes` | 1 | 1 token |

Note: `int`, `string`, `bool`, `byte`, `error`, `rune` are already 1 token each.

## Summary: Type Compression ROI Rankings

| Rank | Strategy | Per-Instance Saving | Frequency | ROI |
|------|----------|-------------------|-----------|-----|
| 1 | `s+=x` (append operator) | 4 tokens (57%) | Very High | **CRITICAL** |
| 2 | `->!T` (error return sugar) | 4 tokens (40%) | Very High | **CRITICAL** |
| 3 | Type-inferred slice `[1,2,3]` | 6 tokens (35%) | High | **HIGH** |
| 4 | Type-inferred map `{"k":v}` | 6 tokens (40%) | High | **HIGH** |
| 5 | `#x` (len operator) | 1 token (33%) | Very High | **HIGH** |
| 6 | `f64`/`i64` type abbreviations | 1 token (50%) | Medium | **MEDIUM** |
| 7 | Interface with `!` sugar | 2 tokens | Medium | **MEDIUM** |
| 8 | Struct literal type inference | 1 token | Medium | **LOW** |
| 9 | Type assertion changes | 0 tokens | Medium | **ZERO** |
