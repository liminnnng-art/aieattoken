# AET-Go v2 Keyword Restoration Analysis

## Background

AET-Go v1/v2 renamed several Go keywords to avoid conflicts with Java/Python/TypeScript.
Now each language has its own dedicated syntax — Go no longer needs to avoid conflicts.

## Critical Finding: Abbreviations Save Zero Tokens

In cl100k_base (GPT-4 tokenizer), **almost every Go keyword and its abbreviation are both 1 token**.
Keyword abbreviation was solving the wrong problem — it was about namespace conflicts, not token savings.

## Complete Keyword Decision Table

| Go Original | Tokens | v1 Abbreviation | Tokens | Decision | Reason |
|-------------|--------|-----------------|--------|----------|--------|
| `func` | 1 | `fn` | 1 | **Use `func`** | Same cost; canonical Go; better LLM recognition |
| `type` | 1 | `ty` | 1 | **Use `type`** | Same cost; canonical Go |
| `range` | 1 | `rng` | 1 | **Use `range`** | Same cost; canonical Go |
| `map` | 1 | `mp` | 1 | **Use `map`** | Same cost; canonical Go |
| `make` | 1 | `mk` | 1 | **Use `make`** | Same cost; canonical Go |
| `append` | 1 | `apl` | 1 | **REPLACE with `+=`** | Operator saves 4 tokens per `slice=append(slice,x)` |
| `len` | 1 | `ln` | 1 | **REPLACE with `#`** | `#x` saves 1 token vs `len(x)` |
| `cap` | 1 | `cp` | 1 | **Use `cap`** | Same cost; low frequency |
| `copy` | 1 | `cpy` | 1 | **Use `copy`** | Same cost; canonical Go |
| `delete` | 1 | `dx` | 1 | **Use `delete`** | Same cost; canonical Go |
| `new` | 1 | `nw` | 1 | **Use `new`** | Same cost; canonical Go |
| `filter` | 1 | `flt` | 1 | **Use `filter`** | Same cost; universally understood |
| `chan` | 1 | — | — | **Use `chan`** | Already 1 token |
| `interface` | 1 | `_in` | 1 | **Use `@Name[...]`** | Already replaced by `@` syntax |
| `continue` | 1 | `cnt` | 1 | **Use `continue`** | Same cost; `cnt` is ambiguous |
| `fallthrough` | **2** | `fth` | **2** | **Use `ft`** (1 token) | Only keyword where abbreviation saves a token |
| `select` | 1 | — | — | **Use `select`** | Already 1 token |
| `switch` | 1 | — | — | **Use `switch`** | Already 1 token |
| `case` | 1 | — | — | **Use `case`** | Already 1 token |
| `default` | 1 | — | — | **Use `default`** | Already 1 token |
| `defer` | 1 | — | — | **Use `defer`** | Already 1 token |
| `go` | 1 | — | — | **Use `go`** | Already 1 token |
| `break` | 1 | — | — | **Use `break`** | Already 1 token |
| `const` | 1 | — | — | **Use `const`** | Already 1 token |
| `var` | 1 | — | — | **Use `var`** | Already 1 token |
| `return` / `^` | 1 / 1 | — | — | **Use `^`** | Same cost; implicit return eliminates keyword entirely |
| `panic` | 1 | — | — | **Use `panic`** | Already 1 token |
| `recover` | 1 | — | — | **Use `recover`** | Already 1 token |

## Multi-Token Type Names (Worth Abbreviating)

| Type | Tokens | Proposed | Tokens | Saving |
|------|--------|----------|--------|--------|
| `float64` | 2 | `f64` | 1 | 1 token |
| `int64` | 2 | `i64` | 1 | 1 token |
| `fallthrough` | 2 | `ft` | 1 | 1 token |
| `iota` | 2 | keep `iota` | 2 | 0 (rare) |

## Parser vs Spec Mismatch (Current State)

The current parser (`ts/src/parser/index.ts`) recognizes **full Go keywords only**.
The spec (`spec/syntax-v0.3.md`) documents abbreviated keywords (`rng`, `mk`, `mp`).
The test `.aet` files use the abbreviated forms.

**v2 Decision**: Align everything on full Go keywords (matching the parser), plus the new operators (`+=` for append, `#` for len, `!T` for error returns).

## Summary

- **0 keywords** benefit from abbreviation (both forms are 1 token)
- **2 type names** benefit from abbreviation (`float64` -> `f64`, `int64` -> `i64`)
- **1 keyword** benefits from abbreviation (`fallthrough` -> `ft`)
- **3 keywords** replaced by operators (`append` -> `+=`, `len` -> `#`, `return` -> `^`)
- **All other keywords**: use canonical Go forms for maximum AI comprehension
