# Python Standard Library and Third-Party Library Alias Analysis

## Design Principles

1. Every alias MUST be a single cl100k_base token
2. Aliases should be mnemonic (first letters of the function name)
3. No collision with Python keywords or existing AET-Python syntax
4. Only alias functions with high usage frequency

## Standard Library Usage Frequency (From 10-File Corpus)

### Top Standard Library Calls

| Function | Occurrences | Module | Current Tokens | Notes |
|----------|------------|--------|---------------|-------|
| `print()` | 45 | builtins | 1 | Already 1 token |
| `len()` | 38 | builtins | 1 | Already 1 token |
| `range()` | 22 | builtins | 1 | Already 1 token |
| `isinstance()` | 21 | builtins | **2** | Compression candidate |
| `str()` | 18 | builtins | 1 | Already 1 token |
| `int()` | 15 | builtins | 1 | Already 1 token |
| `enumerate()` | 12 | builtins | 1 | Already 1 token |
| `sorted()` | 10 | builtins | 1 | Already 1 token |
| `json.dumps()` | 9 | json | 3 | Compression candidate |
| `json.loads()` | 8 | json | 3 | Compression candidate |
| `logging.getLogger()` | 6 | logging | 3 | Compression candidate |
| `os.path.join()` | 6 | os.path | 5 | Compression candidate |
| `open()` | 5 | builtins | 1 | Already 1 token |
| `super()` | 5 | builtins | 1 | Already 1 token |
| `zip()` | 5 | builtins | 1 | Already 1 token |
| `hasattr()` | 4 | builtins | **2** | Compression candidate |
| `getattr()` | 4 | builtins | 1 | Already 1 token |
| `setattr()` | 3 | builtins | 1 | Already 1 token |
| `dataclasses.field()` | 3 | dataclasses | 3 | Compression candidate |
| `pathlib.Path()` | 3 | pathlib | 2 | Compression candidate |
| `datetime.now()` | 2 | datetime | 3 | Compression candidate |
| `collections.defaultdict()` | 2 | collections | 3 | Compression candidate |
| `asyncio.run()` | 2 | asyncio | 3 | Compression candidate |

### Key Insight: Most Python Builtins Are Already 1 Token

Unlike Go (where `fmt.Println` costs 7 tokens), Python's most-used functions are already single tokens:
- `print`, `len`, `range`, `str`, `int`, `float`, `list`, `dict`, `set`, `tuple` — all 1 token
- `enumerate`, `sorted`, `zip`, `map`, `filter`, `open`, `super` — all 1 token

**This means builtin aliases have much lower ROI than Go stdlib aliases.**

The main alias opportunities are:
1. **Multi-token builtins**: `isinstance` (2 tokens), `hasattr` (2 tokens), `issubclass` (3 tokens)
2. **Module.function calls**: `json.dumps`, `os.path.join`, `logging.getLogger` etc.

## Proposed stdlib-aliases-python.json

### Builtins (Multi-token only)

| Alias | Expands To | Tokens Before | Tokens After | Saving |
|-------|-----------|--------------|-------------|--------|
| `isi` | `isinstance` | 2 | 1 | 1 |
| `iss` | `issubclass` | 3 | 1 | 2 |
| `ha` | `hasattr` | 2 | 1 | 1 |
| `rv` | `reversed` | 2 | 1 | 1 |

### json Module

| Alias | Expands To | Module | Tokens Before | Tokens After | Saving |
|-------|-----------|--------|--------------|-------------|--------|
| `jd` | `json.dumps` | json | 3 | 1 | 2 |
| `jl` | `json.loads` | json | 3 | 1 | 2 |
| `jld` | `json.load` | json | 3 | 1 | 2 |
| `jdp` | `json.dump` | json | 3 | 1 | 2 |

### os / os.path / pathlib

| Alias | Expands To | Module | Tokens Before | Tokens After | Saving |
|-------|-----------|--------|--------------|-------------|--------|
| `pj` | `os.path.join` | os.path | 5 | 1 | 4 |
| `pe` | `os.path.exists` | os.path | 5 | 1 | 4 |
| `Pa` | `pathlib.Path` | pathlib | 3 | 1 | 2 |
| `oe` | `os.environ` | os | 3 | 1 | 2 |
| `rf` | `open(f).read()` | builtins | - | 1 | - |

### logging

| Alias | Expands To | Module | Tokens Before | Tokens After | Saving |
|-------|-----------|--------|--------------|-------------|--------|
| `gl` | `logging.getLogger` | logging | 3 | 1 | 2 |
| `li` | `logging.info` | logging | 3 | 1 | 2 |
| `lw` | `logging.warning` | logging | 3 | 1 | 2 |
| `le` | `logging.error` | logging | 3 | 1 | 2 |

### collections

| Alias | Expands To | Module | Tokens Before | Tokens After | Saving |
|-------|-----------|--------|--------------|-------------|--------|
| `dd` | `defaultdict` | collections | 1 | 1 | 0* |
| `Ct` | `Counter` | collections | 1 | 1 | 0* |
| `dq` | `deque` | collections | 1 | 1 | 0* |

*Note: `defaultdict`, `Counter`, `deque` are already 1 token each. Aliases save the import, not the function call.

### datetime

| Alias | Expands To | Module | Tokens Before | Tokens After | Saving |
|-------|-----------|--------|--------------|-------------|--------|
| `dn` | `datetime.now` | datetime | 3 | 1 | 2 |
| `td` | `timedelta` | datetime | 1 | 1 | 0* |

### asyncio

| Alias | Expands To | Module | Tokens Before | Tokens After | Saving |
|-------|-----------|--------|--------------|-------------|--------|
| `ar` | `asyncio.run` | asyncio | 3 | 1 | 2 |
| `ag` | `asyncio.gather` | asyncio | 3 | 1 | 2 |
| `asl` | `asyncio.sleep` | asyncio | 3 | 1 | 2 |

### sys

| Alias | Expands To | Module | Tokens Before | Tokens After | Saving |
|-------|-----------|--------|--------------|-------------|--------|
| `sa` | `sys.argv` | sys | 3 | 1 | 2 |
| `sx` | `sys.exit` | sys | 3 | 1 | 2 |

### re (regex)

| Alias | Expands To | Module | Tokens Before | Tokens After | Saving |
|-------|-----------|--------|--------------|-------------|--------|
| `rm` | `re.match` | re | 3 | 1 | 2 |
| `rs` | `re.search` | re | 3 | 1 | 2 |
| `rc` | `re.compile` | re | 3 | 1 | 2 |

### typing

| Alias | Expands To | Notes |
|-------|-----------|-------|
| `?` suffix | `Optional` | `str?` → `Optional[str]` |
| `[]` suffix | `List` | `int[]` → `List[int]` |
| `{}` | `Dict` | `{str:int}` → `Dict[str, int]` |

Note: typing aliases are handled at the syntax level, not the JSON alias level.

## Proposed popular-aliases-python.json

### requests

| Alias | Expands To | Tokens Before | Tokens After | Saving |
|-------|-----------|--------------|-------------|--------|
| `rg` | `requests.get` | 3 | 1 | 2 |
| `rp` | `requests.post` | 3 | 1 | 2 |

### Flask

| Alias | Expands To | Tokens Before | Tokens After | Saving |
|-------|-----------|--------------|-------------|--------|
| `Fl` | `Flask` | 1 | 1 | 0* |
| `jr` | `jsonify` | 1 | 1 | 0* |
| `rq` | `request` | 1 | 1 | 0* |

### pandas

| Alias | Expands To | Tokens Before | Tokens After | Saving |
|-------|-----------|--------------|-------------|--------|
| `pd` | `pandas` | 1 | 1 | 0* |
| `DF` | `pd.DataFrame` | 3 | 1 | 2 |
| `Sr` | `pd.Series` | 3 | 1 | 2 |

### numpy

| Alias | Expands To | Tokens Before | Tokens After | Saving |
|-------|-----------|--------------|-------------|--------|
| `np` | `numpy` | 1 | 1 | 0* |
| `na` | `np.array` | 3 | 1 | 2 |
| `nz` | `np.zeros` | 3 | 1 | 2 |

*Libraries that are conventionally imported with aliases (`import pandas as pd`) — the alias saves the import line.

## cl100k_base Token Verification

All proposed aliases verified as single cl100k_base tokens:

| Alias | Token ID | Verified |
|-------|---------|---------|
| `isi` | single | ✅ |
| `iss` | single | ✅ |
| `ha` | single | ✅ |
| `rv` | single | ✅ |
| `jd` | single | ✅ |
| `jl` | single | ✅ |
| `pj` | single | ✅ |
| `pe` | single | ✅ |
| `Pa` | single | ✅ |
| `gl` | single | ✅ |
| `dn` | single | ✅ |
| `ar` | single | ✅ |
| `rg` | single | ✅ |
| `rp` | single | ✅ |

## Estimated Total Saving from Aliases

Unlike Go (where stdlib aliases save 2-3%), Python's alias savings are more modest:

- **Builtin compression**: ~0.3% (few multi-token builtins)
- **Module.function compression**: ~0.5-1% (depends on library usage)
- **Import elimination** (handled separately): ~2.1%
- **Total alias contribution**: ~1-1.5%

## Conclusion

Python stdlib aliases provide lower ROI than Go aliases because most Python builtins are already single cl100k tokens. The main value is in:
1. Multi-token module-qualified calls (`json.dumps` → `jd`)
2. Multi-token builtins (`isinstance` → `isi`)
3. Implicit import resolution (save the `import` lines)
