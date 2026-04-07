# aieattoken

Compress Go source code into an AI-native format that uses **39% fewer LLM tokens** while compiling to identical Go binaries with zero performance overhead.

## Install

```bash
npm install -g aieattoken
```

Requires [Node.js](https://nodejs.org/) >= 18. For `aet convert` (Go to AET), you also need [Go](https://go.dev/dl/) installed.

## Quick Start

```bash
# See how many tokens you'd save
aet stats myserver.go

# Convert Go to compressed AET format
aet convert myserver.go

# Build AET back to a Go binary
aet build myserver.aet

# Watch a directory for changes
aet watch ./src
```

## What It Does

Aieattoken is an **LLM-optimized serialization format for Go ASTs**. It compresses Go source code by:

- Eliminating `package`, `import`, `func` boilerplate (auto-inferred)
- Replacing `if err != nil { return err }` with `?` (72% savings per pattern)
- Using single-token stdlib aliases (`pl` = `fmt.Println`, `Ef` = `fmt.Errorf`)
- Removing whitespace, newlines, type annotations where inferable
- Preserving `{ } [ ] ( )` brackets for AI scope comprehension

The transpiled Go code is **identical** to hand-written Go — same compiled binary, same performance.

## Example

**Go (72 tokens):**
```go
package main

import "fmt"

func fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    return fibonacci(n-1) + fibonacci(n-2)
}

func main() {
    for i := 0; i < 10; i++ {
        fmt.Printf("%d ", fibonacci(i))
    }
    fmt.Println()
}
```

**AET (43 tokens, 40% saved):**
```
fibonacci(n){if n<=1{n};fibonacci(n-1)+fibonacci(n-2)};main(){for i:=0..10{pf("%d ",fibonacci(i))};pl()}
```

## Error-Heavy Code (Where AET Shines)

```go
// Go: 50 tokens for 3 error checks
a, err := step1()
if err != nil { return err }
b, err := step2(a)
if err != nil { return err }
c, err := step3(b)
if err != nil { return err }
```

```
// AET: 19 tokens (62% saved)
a:=step1()?;b:=step2(a)?;c:=step3(b)?
```

## Test Results

Tested on 17 RosettaCode algorithms + 10 real-world Go programs:

| Metric | Result |
|--------|--------|
| Token savings (algorithms) | **39.4%** |
| Token savings (error-heavy) | **50-72%** per error pattern |
| Round-trip accuracy | **100%** (17/17 AST-identical) |
| Performance overhead | **0%** (same compiled Go) |
| Transpile speed | **8ms** per 200 functions |

### Comparison with Other Languages (cl100k_base tokens)

| Language | Total Tokens (17 tasks) | vs Go |
|----------|------------------------|-------|
| Go | 2,220 | baseline |
| J | 1,315 | -40.8% |
| **AET** | **1,346** | **-39.4%** |
| Python | 1,600 | -27.9% |
| Clojure | 1,674 | -24.6% |

AET approaches J-level token density while compiling to Go performance.

## Commands

### `aet convert <file.go>`

Convert a Go file to AET format. Output saved as `.aet` alongside the Go file.

```bash
aet convert server.go           # Creates server.aet
aet convert server.go -o out.aet  # Custom output path
```

### `aet build <file.aet>`

Convert AET to Go and compile to a binary.

```bash
aet build server.aet           # Creates server.exe / server
aet build server.aet -o myapp  # Custom binary name
```

### `aet stats <file.go>`

Display token savings analysis for a Go file.

```bash
$ aet stats fibonacci.go

  File: fibonacci.go
  Go tokens:  72
  AET tokens: 43
  Saved:      29 tokens (40.3%)

  Go:  [########################################] 72
  AET: [########################                ] 43
```

### `aet watch <dir>`

Watch a directory for `.go` file changes, automatically converting to `.aet`.

```bash
aet watch ./src
```

### `aet compile <file.aet>`

Convert AET to Go source code (without compiling).

```bash
aet compile server.aet          # Print Go to stdout
aet compile server.aet -o out.go  # Write to file
```

## AET Syntax Reference

| Feature | Go | AET |
|---------|-----|-----|
| Function | `func add(a, b int) int { return a + b }` | `add(a,b){a+b}` |
| Error propagation | `val, err := fn(); if err != nil { return err }` | `val:=fn()?` |
| Struct | `type User struct { Name string }` | `@User{Name:string}` |
| Method | `func (u *User) Greet() string { ... }` | `User.Greet(){...}` |
| Return | `return x` | `^x` (or implicit last expr) |
| Println | `fmt.Println(x)` | `pl(x)` |
| Sprintf | `fmt.Sprintf(...)` | `sf(...)` |
| Range loop | `for i := 0; i < n; i++ { ... }` | `for i:=0..n{...}` |

## How It Works

```
Go source → [go/ast parser] → JSON AST → [transformer] → IR → [emitter] → AET
AET source → [Chevrotain parser] → CST → [transformer] → IR → [emitter] → Go source
```

Three-layer architecture: AET (compressed) <-> IR (typed AST) <-> Go (compilable)

## License

MIT
