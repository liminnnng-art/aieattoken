# Go Syntax Token Heatmap

Analysis of Go syntax structures and their token contribution using cl100k_base tokenizer.
Goal: Find which structures consume the most tokens, prioritize compression efforts.

## Key Finding: Error Handling is the #1 Token Waste

In a representative 68-line Go HTTP server program (395 total tokens):
- **Error-related lines: 10/68 (14.7% of code) but consume 126/395 tokens (31.9%)**
- This confirms error handling is the highest-ROI compression target

## Complete Program Token Breakdown

| Section | Tokens | % of Total | Lines | Tokens/Line |
|---------|--------|------------|-------|-------------|
| HTTP handler (with error handling) | 123 | 31.1% | 16 | 7.7 |
| main function | 81 | 20.5% | 9 | 9.0 |
| Get method (with error handling) | 64 | 16.2% | 9 | 7.1 |
| Struct definitions | 51 | 12.9% | 10 | 5.1 |
| Set method | 30 | 7.6% | 5 | 6.0 |
| Constructor | 26 | 6.6% | 5 | 5.2 |
| Import block | 17 | 4.3% | 6 | 2.8 |
| Package declaration | 2 | 0.5% | 1 | 2.0 |

**80/20 Rule Confirmed**: Top 3 sections (HTTP handler, main, Get method) = 67.8% of tokens

## Token Cost by Category (Averaged Across Patterns)

| Rank | Category | Avg Tokens/Line | Total Sample Tokens | # Patterns |
|------|----------|----------------|---------------------|------------|
| 1 | **String Operations** | **14.0** | 28 | 2 |
| 2 | **HTTP** | **10.3** | 49 | 2 |
| 3 | **Testing** | **8.0** | 48 | 1 |
| 4 | **Function Declaration** | **6.8** | 83 | 3 |
| 5 | **Collection Operations** | **6.2** | 72 | 3 |
| 6 | Control Flow | 5.5 | 150 | 6 |
| 7 | Type Declaration | 5.4 | 73 | 3 |
| 8 | Concurrency | 5.2 | 75 | 4 |
| 9 | Variable Declaration | 4.9 | 34 | 3 |
| 10 | JSON | 4.9 | 39 | 2 |
| 11 | Error Handling | 4.6 | 46 | 3 |
| 12 | Defer/Panic/Recover | 4.6 | 23 | 1 |
| 13 | Import/Package | 2.5 | 30 | 2 |

Note: Error Handling appears low per-line because patterns are short, but it appears VERY frequently. Its total contribution (31.9%) dwarfs everything else.

## Individual Pattern Token Costs (Top 15)

| Rank | Pattern | Category | Tokens | Lines | Tokens/Line |
|------|---------|----------|--------|-------|-------------|
| 1 | Test function | Testing | 48 | 6 | 8.0 |
| 2 | Multi-return function | Function Decl | 43 | 6 | 7.2 |
| 3 | WaitGroup pattern | Concurrency | 41 | 9 | 4.6 |
| 4 | HTTP handler | HTTP | 38 | 4 | 9.5 |
| 5 | Struct with JSON tags | Type Decl | 32 | 5 | 6.4 |
| 6 | Select on channels | Control Flow | 32 | 8 | 4.0 |
| 7 | Filter+map pattern | Collection | 32 | 6 | 5.3 |
| 8 | If-else chain | Control Flow | 30 | 7 | 4.3 |
| 9 | Method on struct | Function Decl | 24 | 3 | 8.0 |
| 10 | Basic struct | Type Decl | 24 | 6 | 4.0 |
| 11 | Multiple var decls | Var Decl | 24 | 5 | 4.8 |
| 12 | Map create+populate | Collection | 24 | 3 | 8.0 |
| 13 | Multiple imports | Import/Package | 23 | 9 | 2.6 |
| 14 | Map range loop | Control Flow | 23 | 3 | 7.7 |
| 15 | Switch statement | Control Flow | 23 | 8 | 2.9 |

## Boilerplate Token Costs (Per Occurrence)

| Expression | Tokens | Frequency | Notes |
|-----------|--------|-----------|-------|
| `if err != nil { return err }` | 8 | Very High | #1 waste - appears 3-5× per function |
| `if err != nil` | 4 | Very High | Just the check, no body |
| `err != nil` | 3 | Very High | Just the comparison |
| `fmt.Errorf(` | 3 | High | Error wrapping |
| `map[string]` | 3 | High | Generic map type |
| `sync.WaitGroup` | 3 | Medium | Concurrency |
| `http.ResponseWriter` | 2 | Medium | HTTP handlers |
| `http.Request` | 2 | Medium | HTTP handlers |
| `json.Marshal` | 2 | High | JSON operations |
| `json.Unmarshal` | 2 | High | JSON operations |
| `context.Context` | 2 | High | Context passing |
| `[]byte` | 2 | High | Byte slices |
| `package main` | 2 | Always | Every file |
| `:=` | 1 | Very High | Already efficient |
| `func` | 1 | Very High | Already efficient |
| `return` | 1 | Very High | Already efficient |
| `type` | 1 | High | Already efficient |
| `interface` | 1 | Medium | Already efficient |
| `string` | 1 | Very High | Already efficient |
| `int` | 1 | Very High | Already efficient |
| `error` | 1 | Very High | Already efficient |
| `bool` | 1 | High | Already efficient |

## Compression Priority Matrix (ROI Ranking)

| Priority | Target | Est. Token Savings | Strategy |
|----------|--------|-------------------|----------|
| **P0** | Error handling boilerplate | **20-30%** | Implicit error propagation (Rust `?`). `if err != nil { return err }` (8 tokens) → `?` (1 token) |
| **P1** | Function signatures | **8-12%** | Drop `func` keyword (1 token saved/fn but also eliminate explicit types via inference). `func (s *Server) Handle(w http.ResponseWriter, r *http.Request)` → compressed form |
| **P2** | Type declarations | **5-8%** | `type X struct {` → minimal form, drop explicit field types where inferable |
| **P3** | Import/package | **4-5%** | Completely auto-inferred by transpiler |
| **P4** | Control flow verbosity | **3-5%** | Compress `for range`, provide map/filter/reduce primitives |
| **P5** | Stdlib function names | **3-5%** | Alias mapping: `fmt.Println` (2 tokens) → single-token alias |
| **P6** | Whitespace/formatting | **2-3%** | Eliminate newlines, tabs (these cost tokens!) |

**Estimated total compressible**: 45-68% of tokens

## Whitespace Token Cost (Often Overlooked)

In the 395-token program:
- Newlines and tabs contribute ~15-20 tokens (4-5%)
- A format that eliminates unnecessary whitespace saves tokens
- Semicolons as statement separators (1 token each) are cheaper than newlines in many cases
