# Python Variable Name Compression Feasibility Analysis

## Overview

Identifiers (variable/function/class names) constitute **28.1%** of all tokens (4,873 tokens out of 17,366) across our 10-file test corpus. This is the second-largest token category after delimiters.

## Identifier Statistics

### Frequency Distribution (Top 30 Across All Files)

| Identifier | Freq | cl100k Tokens/ea | Total Tokens | Multi-token? |
|------------|------|-------------------|-------------|-------------|
| Any | 60 | 1 | 60 | No |
| r | 58 | 1 | 58 | No |
| task | 51 | 1 | 51 | No |
| args | 50 | 1 | 50 | No |
| name | 47 | 1 | 47 | No |
| path | 46 | 1 | 46 | No |
| TaskState | 33 | 2 | 66 | **Yes** |
| value | 30 | 1 | 30 | No |
| Dict | 29 | 1 | 29 | No |
| result | 28 | 1 | 28 | No |
| logger | 26 | 1 | 26 | No |
| auto | 26 | 1 | 26 | No |
| json | 24 | 1 | 24 | No |
| FieldDescriptor | 24 | 2 | 48 | **Yes** |
| records | 23 | 1 | 23 | No |
| func | 22 | 1 | 22 | No |
| asyncio | 22 | 2 | 44 | **Yes** |
| TaskBase | 22 | 2 | 44 | **Yes** |
| Response | 21 | 1 | 21 | No |
| Color | 21 | 1 | 21 | No |
| table | 21 | 1 | 21 | No |
| List | 21 | 1 | 21 | No |
| M | 20 | 1 | 20 | No |
| rows | 20 | 1 | 20 | No |
| kwargs | 20 | 1 | 20 | No |
| body | 19 | 1 | 19 | No |
| help | 18 | 1 | 18 | No |
| Path | 17 | 1 | 17 | No |
| request | 17 | 1 | 17 | No |
| config | 17 | 1 | 17 | No |

### Key Observations

1. **Most identifiers are already single cl100k tokens**: Common variable names like `task`, `name`, `path`, `value`, `result` are all 1 token
2. **Multi-token identifiers are rare**: Only `TaskState` (2), `FieldDescriptor` (2), `asyncio` (2), `TaskBase` (2) in the top 30
3. **CamelCase class names** tend to be multi-token: `TaskState` = `Task` + `State` = 2 tokens
4. **snake_case names** are usually single-token: `default_factory`, `task_scheduler` etc.

## Compression Feasibility Assessment

### Option A: Variable Name Mapping (Short Aliases)

Map frequently-used identifiers to single-character names (like minification).

**Pros**: Could save tokens for multi-token identifiers
**Cons**:
- Destroys readability for AI — the whole point of AET is AI consumption
- Most identifiers are already 1 token — mapping `task` → `t` saves 0 tokens
- Only multi-token names benefit, and they're rare
- Requires mapping table in the file header, which costs tokens itself

**Estimated saving**: < 1% (too few multi-token identifiers)

**Verdict**: ❌ NOT WORTH IT — the mapping table overhead would likely exceed savings

### Option B: Implicit Type Name Shortening

For type annotations only (not variable names), shorten standard type names:
- `Optional[X]` → `X?` (4 tokens → 2 tokens)
- `List[X]` → `X[]` (3 tokens → 2 tokens)
- `Dict[K,V]` → already compact
- `Tuple[X,Y]` → `(X,Y)` (marginal)

**Estimated saving**: 1-2% on type-heavy code

**Verdict**: ✅ WORTH IT — included in type hint compression strategy

### Option C: Import Name Elimination

Standard library module names that appear many times (e.g., `json`, `asyncio`, `logging`) could be shortened via stdlib aliases.

**Estimated saving**: < 0.5%

**Verdict**: ⚠️ MARGINAL — addressed by stdlib alias system

## Conclusion

**Variable name compression is NOT a viable strategy for AET-Python.**

Reasons:
1. 87% of the most-used identifiers are already single cl100k tokens
2. The few multi-token identifiers would need a mapping table that costs tokens
3. Shortening names defeats the purpose of AI-readable code
4. The ROI is estimated at < 1%, far below the effort threshold

The identifier token budget (28.1%) should be treated as **incompressible** — this is the semantic content that AI needs to understand the code.
