# Python Docstring Analysis

## Overview

Python docstrings (triple-quoted strings at the start of modules, classes, and functions) are a significant source of token overhead. For AI consumption, docstrings are redundant — the AI can understand the code itself.

## Measurements

### Aggregate Statistics

| Metric | Value |
|--------|-------|
| Total docstrings found | 100 |
| Total docstring tokens | 1,363 |
| % of total tokens | **7.8%** |
| Avg tokens per docstring | 13.6 |

### Per-File Docstring Token Cost

| File | Total Tokens | Docstring Tokens | % |
|------|-------------|-----------------|---|
| fizzbuzz.py | 388 | 113 | **29.1%** |
| calculator.py | 674 | 145 | **21.5%** |
| csv_reader.py | 662 | 94 | **14.2%** |
| data_processor.py | 1,681 | 146 | 8.7% |
| async_fetcher.py | 1,378 | 114 | 8.3% |
| flask_api.py | 1,257 | 91 | 7.2% |
| class_hierarchy.py | 1,530 | 100 | 6.5% |
| task_scheduler.py | 4,091 | 258 | 6.3% |
| cli_tool.py | 1,916 | 109 | 5.7% |
| orm_models.py | 3,789 | 189 | 5.0% |

### Key Observations

1. **Simple scripts have the highest docstring ratio**: fizzbuzz.py has 29.1% docstrings — nearly 1/3 of all tokens!
2. **Complex code has lower ratios**: ORM models at 5.0% — the code itself dominates
3. **Well-documented code pays a huge token tax**: A project following PEP 257 conventions can have 10-30% of tokens in docstrings

## Docstring Types Encountered

| Type | Count | Typical Length |
|------|-------|---------------|
| Module docstrings | 10 | 10-30 tokens |
| Class docstrings | 15 | 5-20 tokens |
| Method/function docstrings | 75 | 5-15 tokens |

## AET-Python Strategy

### Default: Remove All Docstrings

Docstrings serve human readers, not AI. For AI consumption:
- The function signature tells what it does
- The code body shows how it does it
- Variable names provide semantic context

**Saving: 7.8% (1,363 tokens)**

### Optional: `--docs` Flag

When converting AET-Python → Python, a `--docs` flag can attempt to reconstruct minimal docstrings from function signatures. This is optional and not needed for the default AI-consumption use case.

### Implementation Notes

- Python `ast` module reliably identifies docstrings (first `ast.Constant` in a body)
- Reverse parser: strip docstrings when converting Python → AET-Python
- Emitter: skip docstring generation (default) or generate stubs (`--docs`)

## Conclusion

**Docstring removal is the #2 compression strategy (after indentation), saving 7.8%.**

- Zero semantic loss for AI consumption
- Guaranteed 100% safe — docstrings have no effect on code execution
- Highly variable: 5-29% per file depending on documentation level
- For boilerplate-heavy, well-documented code, this alone can save 15-30%
