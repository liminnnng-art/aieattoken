# aieattoken (AET)

Compress Go, Java, Python, and TypeScript source code into a compact, AI-native format that LLMs can read and write directly -- saving 25-55% of tokens while preserving full semantic fidelity.

## Why?

LLMs don't need `public static void main(String[] args)` to understand your code. They don't need `func`, `def`, curly braces around single-statement blocks, or redundant type annotations that the compiler already infers. AET strips the syntactic ceremony that exists for human readability and keeps only what matters for machine comprehension.

The result: the same program, fully round-trippable back to compilable source, at a fraction of the token cost.

## Compression Results

Token counts measured with cl100k_base (GPT-4 / Claude tokenizer).

### Go (.go -> .aet)

| Benchmark | Files | Avg Savings |
|-----------|-------|-------------|
| RosettaCode algorithms | 17 | **40.9%** |
| Error-heavy code | -- | **50-72%** per error pattern |

### Java (.java -> .aetj)

| Benchmark | Files | Avg Savings |
|-----------|-------|-------------|
| RosettaCode algorithms | 17 | **31.8%** |
| Real-world utilities | 10 | **34.4%** |
| Boilerplate-heavy (DTOs, VOs) | 5 | **44-56%** |
| Spring Boot controllers | 2 | **40%+** |

### Python (.py -> .aetp)

| Benchmark | Files | Avg Savings |
|-----------|-------|-------------|
| Real-world scripts | 5 | **38.2%** |

### TypeScript (.ts -> .aets, .tsx -> .aetx)

| Benchmark | Files | Avg Savings |
|-----------|-------|-------------|
| Algorithms | 7 | **36.6%** |
| React components | 2 | **30.6%** |
| Backend services | 2 | **40.1%** |
| Utility types | 1 | **24.8%** |
| Overall | 12 | **35.2%** |

## Install

```bash
npm install -g aieattoken
```

**Prerequisites:**

- Node.js >= 18
- Go toolchain (for `aet convert *.go` and `aet build`)
- JDK 17+ (for `aet convert *.java`)
- Python 3.10+ (for `aet convert *.py`)
- No extra tools for `aet convert *.ts` / `*.tsx` — uses the bundled TypeScript compiler API

The `compile` command (AET -> source) requires only Node.js.

## Usage

### Convert source to AET

```bash
# Go -> AET
aet convert server.go
# Output: server.aet (tokens: 1204 -> 712, 40.9% saved)

# Java -> AETJ
aet convert UserService.java
# Output: UserService.aetj

# Python -> AETP
aet convert app.py
# Output: app.aetp

# TypeScript -> AETS / AETX
aet convert service.ts
# Output: service.aets
aet convert App.tsx
# Output: App.aetx
```

### Compile AET back to source

```bash
# AET -> Go
aet compile server.aet

# AETJ -> Java
aet compile UserService.aetj

# AETP -> Python
aet compile app.aetp

# AETP -> Python with type hints
aet compile app.aetp --typed

# AETS -> TypeScript
aet compile service.aets

# AETS -> TypeScript with restored type annotations
aet compile service.aets --typed

# AETX -> TSX
aet compile App.aetx

# Write to file
aet compile server.aet -o server.go
```

### Show token savings

```bash
aet stats server.go
aet stats UserService.java
aet stats app.py
```

### Build (Go only)

```bash
# AET -> Go -> compiled binary
aet build server.aet
aet build server.aet -o myapp
```

### Watch mode (Go)

```bash
aet watch ./src
```

### AST diff

```bash
aet diff v1.aet v2.aet
```

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

## How It Works

1. **Parse** source code into a language-specific AST (using Go's `go/parser`, Java's `com.sun.source`, or Python's `ast` module)
2. **Lower** the AST into a shared IR (Intermediate Representation)
3. **Compress** the IR into AET format: strip redundant keywords, apply stdlib aliases, use shorthand notations
4. **Reverse**: parse AET back to IR, emit valid source code in the target language

The entire pipeline is deterministic and round-trippable.

## License

AGPL-3.0-only
