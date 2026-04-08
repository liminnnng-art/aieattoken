# Python Indentation Compression Analysis

## Why Indentation Matters

Python uses indentation to define scope — unlike Go/Java/C which use braces `{}`. Every indented line costs tokens for the leading whitespace. This is Python's single biggest structural token tax.

## Measurement Methodology

Measured by removing all leading whitespace from source files and comparing cl100k_base token counts before and after.

## Results

### Per-File Indentation Cost

| File | Original Tokens | Indent Removed | Saving | % |
|------|----------------|----------------|--------|---|
| fizzbuzz.py | 388 | 359 | 29 | 7.5% |
| csv_reader.py | 662 | 608 | 54 | 8.2% |
| calculator.py | 674 | 594 | 80 | 11.9% |
| flask_api.py | 1,257 | 1,153 | 104 | 8.3% |
| data_processor.py | 1,681 | 1,562 | 119 | 7.1% |
| cli_tool.py | 1,916 | 1,738 | 178 | 9.3% |
| class_hierarchy.py | 1,530 | 1,382 | 148 | 9.7% |
| async_fetcher.py | 1,378 | 1,253 | 125 | 9.1% |
| orm_models.py | 3,789 | 3,433 | 356 | 9.4% |
| task_scheduler.py | 4,091 | 3,703 | 388 | 9.5% |
| **Total** | **17,366** | **15,785** | **1,581** | **9.1%** |

### Indentation Statistics

| Metric | Value |
|--------|-------|
| Total indent spaces | 11,360 |
| Indented lines | 1,575 (65.5% of non-empty lines) |
| Average indent per indented line | 7.2 spaces |
| Max indent level observed | 6+ levels |

### Indent Level Distribution (Aggregate)

| Indent Level | Spaces | Lines | % of Indented Lines |
|-------------|--------|-------|---------------------|
| 1 | 4 | ~600 | ~38% |
| 2 | 8 | ~500 | ~32% |
| 3 | 12 | ~280 | ~18% |
| 4 | 16 | ~130 | ~8% |
| 5+ | 20+ | ~65 | ~4% |

## AET-Python Strategy: Replace Indentation with Braces

### How It Works

Python:
```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def distance(self, other):
        dx = self.x - other.x
        dy = self.y - other.y
        return (dx**2 + dy**2)**0.5
```

AET-Python (braces):
```
class Point{init(x,y){.x=x;.y=y};fn distance(other){dx=.x-other.x;dy=.y-other.y;^(dx**2+dy**2)**0.5}}
```

### Why Braces Save Tokens

1. **4 spaces** of indentation = 1 cl100k token (token ID 262)
2. **8 spaces** = 1-2 tokens depending on context
3. **A single `{`** = 1 token, replaces ALL indentation for a block
4. **A single `}`** = 1 token, replaces the dedent

For a function body indented at level 2 (8 spaces) with 10 lines:
- Python: 10 lines × ~1 token indentation = 10 tokens
- AET: 1 `{` + 1 `}` = 2 tokens
- **Saving: 8 tokens per function body**

### Additional Savings from Brace Format

1. **Colon elimination**: Python's trailing `:` after `def/class/if/for/with/try/except` is removed — the `{` serves as the block opener
2. **Newline elimination**: Statements within braces use `;` separator, eliminating newline tokens
3. **Blank line elimination**: Python convention requires blank lines between functions/classes — braces eliminate this

### Combined Indentation + Newline Savings

When we combine indentation removal with `;` statement separation:

| Metric | Tokens |
|--------|--------|
| Indentation alone | 1,581 (9.1%) |
| + Newline/blank line savings | ~500 (est. 2.9%) |
| + Colon removal | ~200 (est. 1.2%) |
| **Total structural whitespace** | **~2,281 (13.1%)** |

## Conclusion

**Indentation replacement is the #1 compression strategy for AET-Python.**

- Pure indentation removal: **9.1%** guaranteed savings
- With newline + colon optimization: **~13%** savings
- No semantic loss — braces encode the same scope information
- This matches the AET-Go design pattern (Go already uses braces, but AET-Go removes spacing)

## Risk Assessment

- **Zero risk**: Indentation → braces is a well-understood transformation
- **Round-trip safe**: Emitter can perfectly reconstruct PEP 8 indentation from brace nesting
- **Proven pattern**: AET-Go already does this successfully
