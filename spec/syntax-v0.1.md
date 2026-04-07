# Aieattoken Syntax Specification v0.1

**Tokenizer**: cl100k_base (GPT-4 compatible)
**Target**: ≥50% token savings vs Go
**Compilation target**: Go source code via IR

## Design Principles

1. Tokenizer-aware: every keyword/operator chosen from cl100k_base single-token vocabulary
2. Structural brackets `{ } [ ] ( )` preserved for AI scope understanding
3. Machine-first, human-recoverable via transpiler
4. No comments — logic expressed entirely by syntax
5. No package/import declarations — transpiler auto-resolves

## File Format

- Extension: `.aet`
- First line: `!v1` (version marker, 3 tokens)
- Statements separated by `;`
- No required whitespace (spaces allowed but not required between tokens)

---

## 1. Error Propagation (P0) — Biggest Win

### Rule 1.1: `?` operator (error propagation)
```
val := expr?
```
**Expands to:**
```go
val, err := expr
if err != nil {
    return <zero-values>..., err
}
```

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `result, err := fn()\nif err != nil {\n\treturn nil, err\n}` | 18 | `result:=fn()?` | 5 | 72.2% |

### Rule 1.2: `?!` operator (error wrapping)
```
val := expr?!"context message"
```
**Expands to:**
```go
val, err := expr
if err != nil {
    return <zero-values>..., fmt.Errorf("context message: %w", err)
}
```

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `result, err := fn()\nif err != nil {\n\treturn nil, fmt.Errorf("failed: %w", err)\n}` | 26 | `result:=fn()?!"failed"` | 8 | 69.2% |

### Rule 1.3: Error propagation chain
Multiple `?` operators compose naturally:
```
a:=step1()?;b:=step2(a)?;c:=step3(b)?
```

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| 3× error check blocks | 50 | chain with `?` | 19 | 62.0% |

---

## 2. Function Declarations (P1)

### Rule 2.1: Function declaration
```
name(params){body}
```
- No `func` keyword
- Last expression is implicit return value
- `^` for early return (replaces `return`)

### Rule 2.2: Typed parameters (when inference insufficient)
```
name(a:int,b:int)->int{body}
```
- `:` separates param name from type
- `->` before return type
- Types may be omitted when inferable from context

### Rule 2.3: Method declaration
```
TypeName.methodName(params){body}
```
- Receiver auto-generated as first letter of type (lowercased)
- Pointer receiver is default (covers most Go methods)

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `func add(a int, b int) int {\n\treturn a + b\n}` | 16 | `add(a:int,b:int)->int{a+b}` | 11 | 31.3% |
| `func (s *Server) Handle(w, r) {...}` | 24 | `Server.Handle(w,r){...}` | 12 | 50.0% |

### Rule 2.4: Lambda / anonymous functions
```
{params|body}
```
- Pipe `|` separates parameter list from body
- Used in callbacks: `Hf("/path",{w,r|body})`

### Rule 2.5: Early return
```
^value
^          // bare return
^a,b       // multi-value return
```
- `^` replaces `return` (both are 1 token, but implicit return saves the keyword entirely for last expression)

---

## 3. Type Declarations (P2)

### Rule 3.1: Struct declaration
```
@TypeName{field1:type1;field2:type2}
```
- `@` replaces `type ... struct`
- Fields separated by `;`
- JSON tags auto-generated (lowercase field name) — omit from AET

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `type User struct {\n\tName string\n\t...}` | 24 | `@User{Name:string;...}` | 15 | 37.5% |
| With JSON tags | 32 | Without (auto-gen) | 11 | 65.6% |

### Rule 3.2: Interface declaration
```
@TypeName[method1(params)->ret;method2(params)->ret]
```
- `[...]` for interfaces (vs `{...}` for structs)

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `type Reader interface {\n\tRead(p []byte) (n int, err error)\n}` | 17 | `@Reader[Read(p:[]byte)->(int,error)]` | 13 | 23.5% |

### Rule 3.3: Type alias
```
@TypeName=underlyingType
```
Example: `@ID=int64`

---

## 4. Import/Package Elimination (P3)

### Rule 4.1: No package declaration
Transpiler uses directory name or defaults to `main`.

### Rule 4.2: No import declarations
Transpiler auto-detects imports from:
- Stdlib alias usage (from stdlib-aliases.json)
- Qualified identifiers (e.g., `strings.Split` → `"strings"`)
- Type references (e.g., `http.ResponseWriter` → `"net/http"`)

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `package main\nimport (\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"os"\n\t"strings"\n)` | 23 | `!v1` | 3 | 87.0% |

---

## 5. Control Flow (P4)

### Rule 5.1: If/else
```
if cond{body}
if cond{body}else{body}
if cond{body}else if cond{body}else{body}
if init;cond{body}    // with initializer
```
- No spaces required around braces

### Rule 5.2: For loops
```
for init;cond;post{body}        // C-style
for cond{body}                  // while-style
for k,v:=range expr{body}      // range
for{body}                       // infinite
```

### Rule 5.3: Switch
```
switch expr{case val1:stmts;case val2:stmts;default:stmts}
switch{case cond1:stmts;case cond2:stmts}   // tagless switch
```

### Rule 5.4: Select
```
select{case expr:stmts;case expr:stmts;default:stmts}
```

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| C-style for loop | 20 | compressed | 17 | 15.0% |
| Range loop | 22 | compressed | 19 | 13.6% |
| If-else chain | 30 | compressed | 19 | 36.7% |

### Rule 5.5: Collection operations (pipe operator)
```
items|map(fn)
items|filter(fn)
items|reduce(fn,init)
items|filter(.Active)|map(.Name)    // dot-shorthand for field access
```
Transpiler expands to Go `for` loops.

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| filter+map with for loop | 32 | pipe syntax | 12 | 62.5% |

---

## 6. Standard Library Aliases (P5)

### Rule 6.1: Alias resolution
Aliases defined in `stdlib-aliases.json` are resolved at transpile time.
Every alias MUST be a single cl100k_base token.

See `stdlib-aliases.json` for the complete mapping.

Key examples:
- `Pn` → `fmt.Println`
- `Pf` → `fmt.Printf`
- `Sf` → `fmt.Sprintf`
- `Ef` → `fmt.Errorf`
- `Jm` → `json.Marshal`
- `Ju` → `json.Unmarshal`

---

## 7. Concurrency

### Rule 7.1: Goroutines
```
go fn()                     // named function
go{body}                    // anonymous goroutine
```

### Rule 7.2: Channels
```
ch:=make(chan type,size)    // buffered
ch:=make(chan type)         // unbuffered
ch<-value                  // send
v:=<-ch                    // receive
```

### Rule 7.3: Defer
```
defer fn()
defer{body}                // anonymous defer
```

---

## 8. Variables and Constants

### Rule 8.1: Short declaration
```
x:=value
```
Same as Go `:=` (already 1 token).

### Rule 8.2: Typed declaration
```
x:type=value
```
Transpiles to `var x type = value`.

### Rule 8.3: Constants
```
const x=value
const(x=1;y=2;z=iota)
```

---

## 9. Expressions

### Rule 9.1: Operators
All Go operators preserved (already single tokens in cl100k_base):
`:=` `=` `+=` `-=` `*=` `/=` `%=` `==` `!=` `<` `>` `<=` `>=`
`&&` `||` `!` `+` `-` `*` `/` `%` `&` `|` `^` `~` `<<` `>>`
`<-` `++` `--` `...`

### Rule 9.2: Composite literals
```
[]int{1,2,3}
map[string]int{"a":1,"b":2}
User{Name:"Alice",Age:30}
```
Same as Go (already efficient).

### Rule 9.3: Slice operations
```
s[1:3]
s[:5]
s[2:]
```
Same as Go.

### Rule 9.4: Type assertions
```
val:=x.(Type)
val,ok:=x.(Type)
```
Same as Go.

### Rule 9.5: Map lookup
```
val:=m[key]
val,ok:=m[key]
```
Same as Go.

---

## 10. Error Messages

Format: `Error at Statement #N (maps to Go lines X-Y): message`

Statement index is used instead of line numbers since AET may have no newlines.

---

## 11. Grammar Rule Summary

Total grammar rules: 35

| # | Rule ID | Description |
|---|---------|-------------|
| 1 | 1.1 | Error propagation `?` |
| 2 | 1.2 | Error wrapping `?!` |
| 3 | 1.3 | Error chain |
| 4 | 2.1 | Function declaration |
| 5 | 2.2 | Typed parameters |
| 6 | 2.3 | Method declaration |
| 7 | 2.4 | Lambda expression |
| 8 | 2.5 | Early return `^` |
| 9 | 3.1 | Struct declaration |
| 10 | 3.2 | Interface declaration |
| 11 | 3.3 | Type alias |
| 12 | 4.1 | No package declaration |
| 13 | 4.2 | No import declaration |
| 14 | 5.1 | If/else |
| 15 | 5.2 | For loops |
| 16 | 5.3 | Switch |
| 17 | 5.4 | Select |
| 18 | 5.5 | Collection pipe operators |
| 19 | 6.1 | Stdlib alias resolution |
| 20 | 7.1 | Goroutines |
| 21 | 7.2 | Channels |
| 22 | 7.3 | Defer |
| 23 | 8.1 | Short declaration |
| 24 | 8.2 | Typed declaration |
| 25 | 8.3 | Constants |
| 26 | 9.1 | Operators |
| 27 | 9.2 | Composite literals |
| 28 | 9.3 | Slice operations |
| 29 | 9.4 | Type assertions |
| 30 | 9.5 | Map lookup |
| 31 | 10 | Error messages |
| 32 | - | Version marker `!v1` |
| 33 | - | Statement separator `;` |
| 34 | - | Block scope `{ }` |
| 35 | - | Blank identifier `_` |
