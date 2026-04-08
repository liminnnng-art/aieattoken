# Python Token Composition Analysis (cl100k_base)

## Test Corpus

| # | File | Category | Lines | cl100k Tokens |
|---|------|----------|-------|---------------|
| 1 | fizzbuzz.py | Simple | 51 | 388 |
| 2 | csv_reader.py | Simple | 85 | 662 |
| 3 | calculator.py | Simple | 113 | 674 |
| 4 | flask_api.py | Medium | 179 | 1,257 |
| 5 | data_processor.py | Medium | 187 | 1,681 |
| 6 | cli_tool.py | Medium | 257 | 1,916 |
| 7 | class_hierarchy.py | Medium | 213 | 1,530 |
| 8 | async_fetcher.py | Medium | 189 | 1,378 |
| 9 | orm_models.py | Complex | 526 | 3,789 |
| 10 | task_scheduler.py | Complex | 604 | 4,091 |
| **Total** | | | **2,404** | **17,366** |

Average: **7.2 tokens per line** (non-empty lines: ~8.4 tokens/line)

## Token Category Breakdown (Aggregate)

| Category | Tokens | % of Total | Python Token Count | Notes |
|----------|--------|-----------|-------------------|-------|
| **Delimiters** | 5,305 | 30.5% | 5,305 | `()[]{},:;.` — mostly incompressible |
| **Identifiers** | 4,873 | 28.1% | 3,616 | Variable/function/class names |
| **String literals** | 1,502 | 8.6% | 350 | String content — incompressible |
| **Docstrings** | 1,363 | 7.8% | 100 | Triple-quoted strings — **fully removable** |
| **Keywords** | 1,304 | 7.5% | 1,304 | def, return, class, if, for, etc. |
| **Operators** | 1,043 | 6.0% | 1,042 | `= + - * / == != < >` etc. |
| **Other** | 861 | 5.0% | 410 | Misc tokens |
| **Builtins** | 584 | 3.4% | 571 | print, len, range, etc. — alias candidates |
| **self** | 420 | 2.4% | 420 | `self` keyword — **fully removable** |
| **Comments** | 390 | 2.2% | 88 | `# ...` — **fully removable** |
| **Magic methods** | 282 | 1.6% | 88 | `__init__`, `__str__` etc. — compressible |
| **Number literals** | 255 | 1.5% | 181 | Incompressible |
| **Indentation** | 98 | 0.6% | 928 | Whitespace at line start |
| **Whitespace** | 87 | 0.5% | 2,340 | Newlines — compressible with `;` |
| **cls** | 62 | 0.4% | 62 | `cls` keyword — removable in methods |

## Per-File Breakdown

| File | Tokens | Keywords% | Idents% | Self% | Docstr% | Import% | Decor% | TypeHint% |
|------|--------|-----------|---------|-------|---------|---------|--------|-----------|
| fizzbuzz.py | 388 | 6.7 | 21.6 | 0.0 | 29.1 | 2.1 | 0.0 | 4.9 |
| csv_reader.py | 662 | 6.8 | 23.7 | 0.5 | 14.2 | 2.1 | 2.0 | 5.3 |
| calculator.py | 674 | 7.4 | 17.1 | 2.4 | 21.5 | 1.2 | 0.4 | 3.1 |
| flask_api.py | 1,257 | 6.8 | 31.5 | 1.0 | 7.2 | 2.9 | 5.5 | 8.0 |
| data_processor.py | 1,681 | 5.0 | 26.7 | 0.2 | 8.7 | 2.1 | 1.0 | 6.1 |
| cli_tool.py | 1,916 | 6.8 | 30.5 | 0.2 | 5.7 | 2.1 | 0.3 | 3.2 |
| class_hierarchy.py | 1,530 | 7.9 | 22.9 | 4.8 | 6.5 | 2.5 | 2.8 | 8.2 |
| async_fetcher.py | 1,378 | 7.7 | 29.2 | 2.3 | 8.3 | 2.7 | 1.2 | 8.1 |
| orm_models.py | 3,789 | 8.8 | 27.1 | 3.7 | 5.0 | 1.1 | 1.8 | 14.2 |
| task_scheduler.py | 4,091 | 7.8 | 32.0 | 3.3 | 6.3 | 1.4 | 2.0 | 11.0 |

## Key Observations

1. **Delimiters (30.5%)** are the largest category but mostly incompressible — `(){}[]` are structural
2. **Identifiers (28.1%)** are user-defined names — not compressible without losing semantics
3. **Removable content (12.4%)**: docstrings (7.8%) + comments (2.2%) + self (2.4%) = guaranteed savings
4. **Keywords (7.5%)** are mostly already single cl100k tokens — keyword shortening has near-zero ROI
5. **Indentation** appears small (0.6%) but this is misleading — see indentation analysis for the true cost when measured as structural whitespace (9.1% measured via removal)
6. **Type hints** vary wildly: 3.1% in simple code to 14.2% in heavily-typed ORM code
7. **Builtins (3.4%)** are alias candidates — potential 1-2% total savings

## Compressibility Summary

| Category | Compressibility | Est. Saving |
|----------|----------------|-------------|
| Docstrings | 100% removable | 7.8% |
| Indentation | Replaceable with `{}` | 9.1% |
| Comments | 100% removable | 2.2% |
| Self | 100% removable | 1.9% |
| Type hints | 100% removable (default) | 4.8% |
| Imports | Auto-resolvable | 2.1% |
| Newlines | Replaceable with `;` | ~3% |
| Magic methods | Compressible | 0.4% |
| Builtins | Aliasable | ~1% |
| Keywords | Already single tokens | ~0% |
| **Total compressible** | | **~32%** |
