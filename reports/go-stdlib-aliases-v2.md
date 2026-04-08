# AET-Go v2: Standard Library Aliases Analysis

## Current State

- **50 aliases** defined in `stdlib-aliases.json`
- All are single cl100k_base tokens (2 characters)
- Average saving: 1.20 tokens per use
- **1,413 available** single-token 2-char combinations remain unused

## Coverage Analysis

Across all test .go files:
- **211 total stdlib function calls** found
- **160 covered** by existing aliases (75.8%)
- **51 not covered** (24.2%), across 24 unique functions

## Current Aliases: Token Efficiency

### Highest Saving (3 tokens saved per use)

| Alias | Expands To | Alias Tokens | Go Tokens | Saving |
|-------|-----------|-------------|-----------|--------|
| `rw` | `sync.RWMutex` | 1 | 4 | 3 |

### Good Saving (2 tokens saved per use)

| Alias | Expands To | Saving |
|-------|-----------|--------|
| `Cc` | `context.WithCancel` | 2 |
| `ct` | `context.WithTimeout` | 2 |
| `sx` | `strings.HasSuffix` | 2 |
| `jd` | `json.NewDecoder` | 2 |
| `Je` | `json.NewEncoder` | 2 |
| `hl` | `http.ListenAndServe` | 2 |
| `wf` | `os.WriteFile` | 2 |
| `wg` | `sync.WaitGroup` | 2 |

### Standard Saving (1 token saved per use)

41 aliases save 1 token each (2-token Go expression -> 1-token alias).

## Missing High-Priority Aliases

### Priority 1: High frequency in codebase, not yet aliased

| Proposed Alias | Function | Frequency | Tokens | Saving/Use |
|---------------|----------|-----------|--------|------------|
| `Tm` | `time.Millisecond` | 13 | 2 | 1 |
| `Td` | `time.Duration` | 7 | 2 | 1 |
| `Tc` | `time.Second` | 5 | 2 | 1 |
| `ox` | `os.Exit` | 3 | 2 | 1 |
| `oe` | `os.Stderr` | 3 | 2 | 1 |

### Priority 2: High token savings per use (common in real-world Go)

| Proposed Alias | Function | Tokens | Saving/Use |
|---------------|----------|--------|------------|
| `Sh` | `crypto/sha256.Sum256` | 6 | 5 |
| `Be` | `encoding/base64.StdEncoding` | 5 | 4 |
| `Hm` | `http.NewServeMux` | 5 | 4 |
| `Tr` | `time.RFC3339` | 5 | 4 |
| `Nc` | `io.NopCloser` | 5 | 4 |
| `Ma` | `os.MkdirAll` | 4 | 3 |
| `Ss` | `sort.SliceStable` | 4 | 3 |

### Priority 3: Common Go patterns (2 tokens saved each)

| Proposed Alias | Function |
|---------------|----------|
| `Fi` | `strconv.FormatInt` |
| `Pi` | `strconv.ParseInt` |
| `Pf` | `strconv.ParseFloat` |
| `Sa` | `strings.ReplaceAll` |
| `Tp` | `strings.TrimPrefix` |
| `Tx` | `strings.TrimSuffix` |
| `Ji` | `json.MarshalIndent` |
| `fp` | `fmt.Fprintln` |
| `Bs` | `bufio.NewScanner` |
| `Bw` | `bufio.NewWriter` |
| `Rc` | `regexp.MustCompile` |
| `Rv` | `reflect.ValueOf` |
| `Rt` | `reflect.TypeOf` |
| `Su` | `strings.ToUpper` |
| `Sb` | `strings.Builder` |
| `Si` | `strings.Index` |
| `Sc2`| `strings.Count` |
| `Rp` | `strings.Repeat` |
| `Br` | `bufio.NewReader` |
| `Bb` | `bytes.Buffer` |

### Priority 4: HTTP status codes and methods (common in web services)

| Proposed Alias | Constant | Tokens | Saving |
|---------------|----------|--------|--------|
| `Ok` | `http.StatusOK` | 3 | 2 |
| `Nf` | `http.StatusNotFound` | 3 | 2 |
| `Se` | `http.StatusInternalServerError` | 4 | 3 |
| `Mg` | `http.MethodGet` | 3 | 2 |
| `Mp` | `http.MethodPost` | 3 | 2 |
| `Hs` | `http.ServeMux` | 3 | 2 |

### Priority 5: IO and OS constants

| Proposed Alias | Value | Tokens | Saving |
|---------------|-------|--------|--------|
| `Eo` | `io.EOF` | 2 | 1 |
| `Id` | `io.Discard` | 2 | 1 |
| `Oa` | `os.Args` | 2 | 1 |
| `Oi` | `os.Stdin` | 2 | 1 |
| `Oo` | `os.Stdout` | 2 | 1 |
| `Or` | `os.Remove` | 2 | 1 |
| `Om` | `os.Mkdir` | 2 | 1 |

## Updated Alias Count Summary

| Category | Current | Proposed New | Total |
|----------|---------|-------------|-------|
| fmt | 6 | 1 | 7 |
| errors | 3 | 0 | 3 |
| context | 4 | 0 | 4 |
| strings | 8 | 7 | 15 |
| strconv | 2 | 3 | 5 |
| json | 4 | 1 | 5 |
| http | 5 | 6 | 11 |
| os | 5 | 5 | 10 |
| io | 2 | 3 | 5 |
| time | 4 | 3 | 7 |
| sync | 3 | 0 | 3 |
| sort | 1 | 1 | 2 |
| log | 2 | 0 | 2 |
| filepath | 1 | 0 | 1 |
| bufio | 0 | 3 | 3 |
| bytes | 0 | 1 | 1 |
| regexp | 0 | 1 | 1 |
| reflect | 0 | 2 | 2 |
| math | 0 | 0 | 0 (use Go's math.X directly) |
| crypto | 0 | 1 | 1 |
| encoding | 0 | 1 | 1 |
| **Total** | **50** | **~39** | **~89** |

## Recommendation

Expand from 50 to ~89 aliases for v2. Focus on:
1. Functions that save 3+ tokens per use (highest ROI)
2. Functions used frequently in real-world Go (HTTP, JSON, strings)
3. Keep aliases mnemonic (first letters of package + function)
4. All aliases must remain single cl100k_base tokens
