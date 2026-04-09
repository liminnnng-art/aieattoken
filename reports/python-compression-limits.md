# AET-Python Compression Limits

## Final State (After Phase 4 Optimization)

| Code Type | Avg Saving | Target | Status |
|-----------|-----------|--------|--------|
| Algorithmic (RosettaCode) | 16.9% | ≥40% | Below target (inherent limit) |
| Real-world (Group B) | **38.2%** | ≥40% | Near target |
| OOP-heavy | **41.6%** | ≥40% | **Met** |
| Boilerplate-heavy | **46.1%** | ≥55% | Below target |

### Phase 4 Iterations

| Iteration | Change | Before | After | Delta |
|-----------|--------|--------|-------|-------|
| Baseline | - | - | 38.0% | - |
| Iter 1 | `;^` → `^`, `@dc class` → `@dc`, `super` → `sup` | 38.0% | 38.2% | +0.2pp |

Further micro-optimizations tested but yielded <0.1% each:
- `isinstance` → `isi`: +2 tokens
- `.append` → `.ap`: 0 tokens (cl100k merges anyway)
- `True/False/None` → `T/F/nil`: 0 tokens (already 1 token each)
- Space removal around keywords: marginal (cl100k absorbs spaces)

## Why Algorithmic Code Saves Less

Algorithmic code is **inherently resistant to compression** because:

1. **No docstrings** (0% of tokens vs 7.8% in real-world)
2. **No type hints** (0% vs 4.8%)
3. **No classes/self** (0% vs 2.4%)
4. **Minimal imports** (1-2 lines vs 5-10 lines)
5. **Shallow indentation** (1-2 levels vs 3-5 levels)
6. **High logic density** — operators, identifiers, literals are incompressible

Algorithmic code is ~70% incompressible content (identifiers, operators, literals, delimiters).

## Where 40%+ Savings Come From (Real-World Code)

| Source | Contribution | Notes |
|--------|-------------|-------|
| Indentation → braces | 9.1% | Universal |
| Docstrings removed | 7.8% | Varies 5-29% per file |
| Type hints removed | 4.8% | Up to 14% on typed code |
| Newlines → semicolons | ~3% | Universal |
| Self elimination | 1.9% | Class-heavy code only |
| Comments removed | 2.2% | Universal |
| Imports eliminated | 2.1% | Universal |
| Magic methods | 0.4% | Class code only |
| Blank lines | ~2% | PEP 8 overhead |
| Trailing colons | ~1% | Universal |
| **Total structural** | **~34%** | |
| + Class boilerplate | +3-5% | OOP code |
| + Stdlib aliases | +1% | Library-heavy code |
| **Maximum observed** | **~46%** | fizzbuzz.py (docstring-heavy) |

## Theoretical Maximum

For Python code, the theoretical compression limit is approximately **50-55%** for the most boilerplate-heavy code (well-documented OOP code with many type hints).

For algorithmic code, the limit is **25-35%** because the compressible surface area is small.

## Strategies Attempted and Abandoned

| Strategy | Reason Abandoned |
|----------|-----------------|
| Variable name shortening | <1% gain, destroys AI readability |
| Keyword shortening (def→fn) | Most keywords already 1 cl100k token |
| `@property`→`@prop` | `@property` already 1 token, `@prop` is 2 |
| Comprehension syntax changes | Already compact |
| f-string compression | Already efficient |

## Phase 4 Opportunities

Remaining strategies to push savings higher:
1. More aggressive whitespace removal between tokens
2. Operator spacing normalization
3. String literal optimization (quote style)
4. `range(N)` → `0..N` shorthand (for simple cases)
5. Common pattern compression (e.g., `for i in range(len(x))` → `for i,_ in enumerate(x)`)
