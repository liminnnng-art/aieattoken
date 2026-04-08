# AET-Go v2 Syntax Specification

**Tokenizer**: cl100k_base (GPT-4 compatible)
**Target**: Go source code exclusively (no Java/Python/TS concerns)
**File extension**: `.aetg`
**Version marker**: `!go-v2` (first token, 3 tokens)
**Backward compatibility**: `.aet` files with `!v1`/`!v2`/`!v3` are treated as Go v1
**Stdlib aliases**: 89 (defined in `stdlib-aliases.json`)

## Design Principles

1. Tokenizer-aware: every keyword/operator chosen from cl100k_base single-token vocabulary
2. Use canonical Go keywords (`make`, `append`, `len`, `range`, `map`) -- all already 1 token each in cl100k_base
3. Machine-first, human-recoverable via transpiler
4. No comments -- logic expressed entirely by syntax
5. No package/import declarations -- transpiler auto-resolves
6. Structural brackets `{ } [ ] ( )` preserved for AI scope understanding
7. Go-dedicated: no cross-target compromises

## Key Changes from v1

| Change | v1 (`.aet`) | v2 (`.aetg`) | Rationale |
|--------|-------------|--------------|-----------|
| Go builtins | `mk`, `apl`, `ln`, `rng`, `mp` | `make`, `append`, `len`, `range`, `map` | Canonical Go keywords are already 1 token each; abbreviations hurt readability for zero token gain |
| Len operator | `ln(x)` (4 tokens) | `#x` (2 tokens) | Operator saves 2 tokens per call vs function syntax |
| Append sugar | `s=apl(s,x)` (7 tokens) | `s+=x` (3 tokens) | Saves 4 tokens per append |
| Error return | `-> (T, error)` (7 tokens) | `->!T` (3 tokens) | Saves 2-4 tokens per function signature |
| Type abbrevs | `float64` (2 tokens) | `f64` (1 token) | 2-token types compressed to 1-token |
| Fallthrough | `fallthrough` (2 tokens) | `ft` (1 token) | 2 tokens to 1 |
| Version marker | `!v3` | `!go-v2` | Distinguishes Go-specific format |
| Stdlib aliases | 50 | 89 | Expanded coverage |

---

## 1. Error Propagation (P0) -- Biggest Win

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

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
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

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `result, err := fn()\nif err != nil {\n\treturn nil, fmt.Errorf("failed: %w", err)\n}` | 26 | `result:=fn()?!"failed"` | 8 | 69.2% |

### Rule 1.3: Error propagation chain
Multiple `?` operators compose naturally:
```
a:=step1()?;b:=step2(a)?;c:=step3(b)?
```

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| 3x error check blocks (each: assign + if + return) | 50 | chain with `?` | 19 | 62.0% |

### Rule 1.4: `?` on method chains
The `?` operator works on any expression returning `(T, error)`:
```
body:=hg(url)?.Body
data:=Ra(body)?
```
Each `?` unwraps the value and propagates the error.

---

## 2. Functions

### Rule 2.1: Function declaration
```
name(params){body}
```
- No `func` keyword required
- Last expression is implicit return value
- `^` for early return (replaces `return`)

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `func add(a int, b int) int {\n\treturn a + b\n}` | 16 | `add(a:int,b:int)->int{a+b}` | 11 | 31.3% |

### Rule 2.2: Typed parameters
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
- Value receiver syntax: `TypeName..methodName(params){body}` (double dot)

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `func (s *Server) Handle(w http.ResponseWriter, r *http.Request) {...}` | 24 | `Server.Handle(w,r){...}` | 12 | 50.0% |

### Rule 2.4: Lambda / anonymous functions
```
{params|body}
```
- Pipe `|` separates parameter list from body
- Used in callbacks: `hf("/path",{w,r|body})`

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `func(x, y int) int { return x + y }` | 13 | `{x,y|x+y}` | 7 | 46.2% |

### Rule 2.5: Early return
```
^value
^          // bare return
^a,b       // multi-value return
```
- `^` replaces `return` (both are 1 token, but implicit return saves the keyword entirely for last expression)

---

## 3. Types

### Rule 3.1: Struct declaration (`@`)
```
@TypeName{field1:type1;field2:type2}
```
- `@` replaces `type ... struct`
- Fields separated by `;`
- JSON tags auto-generated (lowercase field name) -- omit from AET-Go

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `type User struct {\n\tName string\n\tAge int\n\tEmail string\n}` | 24 | `@User{Name:string;Age:int;Email:string}` | 15 | 37.5% |
| With JSON tags (3 fields) | 32 | Without (auto-gen) | 15 | 53.1% |

### Rule 3.2: Interface declaration (`@[]`)
```
@TypeName[method1(params)->ret;method2(params)->ret]
```
- `[...]` for interfaces (vs `{...}` for structs)

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `type Reader interface {\n\tRead(p []byte) (n int, err error)\n}` | 17 | `@Reader[Read(p:[]byte)->(int,error)]` | 13 | 23.5% |

### Rule 3.3: Interface embedding
```
@ReadWriter[Reader;Writer]
```
Embeds `Reader` and `Writer` interfaces.

### Rule 3.4: Type alias (`@=`)
```
@TypeName=underlyingType
```
Example: `@ID=i64`

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `type ID int64` | 4 | `@ID=i64` | 4 | 0% |
| `type Handler func(http.ResponseWriter, *http.Request)` | 10 | `@Handler=func(http.ResponseWriter,*http.Request)` | 8 | 20.0% |

---

## 4. Import/Package Elimination (P3)

### Rule 4.1: No package declaration
Transpiler uses directory name or defaults to `main`.

### Rule 4.2: No import declarations
Transpiler auto-detects imports from:
- Stdlib alias usage (from `stdlib-aliases.json`)
- Qualified identifiers (e.g., `strings.Split` -> `"strings"`)
- Type references (e.g., `http.ResponseWriter` -> `"net/http"`)

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `package main\nimport (\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"os"\n\t"strings"\n)` | 23 | `!go-v2` | 3 | 87.0% |

---

## 5. Control Flow

### Rule 5.1: If/else
```
if cond{body}
if cond{body}else{body}
if cond{body}else if cond{body}else{body}
if init;cond{body}    // with initializer
```
- No spaces required around braces
- Standard Go if/else syntax preserved (already token-efficient)

### Rule 5.2: For loops
```
for init;cond;post{body}         // C-style
for cond{body}                   // while-style
for k,v:=range expr{body}       // range (v2: canonical `range`)
for{body}                        // infinite
```
Note: v2 uses canonical `range` instead of v1's `rng`. Both are 1 token.

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `for i := 0; i < n; i++ {\n\tbody\n}` | 14 | `for i:=0;i<n;i++{body}` | 10 | 28.6% |
| `for _, v := range items {\n\tbody\n}` | 12 | `for _,v:=range items{body}` | 9 | 25.0% |
| `for k, v := range m {\n\tbody\n}` | 12 | `for k,v:=range m{body}` | 9 | 25.0% |

### Rule 5.3: Switch
```
switch expr{case val1:stmts;case val2:stmts;default:stmts}
switch{case cond1:stmts;case cond2:stmts}   // tagless switch
```
- `ft` for `fallthrough` (saves 1 token)

### Rule 5.4: Select
```
select{case expr:stmts;case expr:stmts;default:stmts}
```
- Channel select, Go-native

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `select {\ncase v := <-ch1:\n\tbody1\ncase ch2 <- v:\n\tbody2\ndefault:\n\tbody3\n}` | 22 | `select{case v:=<-ch1:body1;case ch2<-v:body2;default:body3}` | 16 | 27.3% |

---

## 6. Collection Operations (Pipe Operator)

### Rule 6.1: Pipe syntax
```
items|map(fn)
items|filter(fn)
items|reduce(fn,init)
items|filter(.Active)|map(.Name)    // dot-shorthand for field access
```
- v2 uses canonical `map`/`filter` instead of v1's `mp`/`flt`
- Transpiler expands pipes to Go `for` loops
- Dot-shorthand `.Field` expands to `func(x T) F { return x.Field }`

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `result := make([]string, 0)\nfor _, u := range users {\n\tif u.Active {\n\t\tresult = append(result, u.Name)\n\t}\n}` | 32 | `users|filter(.Active)|map(.Name)` | 12 | 62.5% |

---

## 7. Concurrency

### Rule 7.1: Goroutines
```
go fn()                     // named function
go{body}                    // anonymous goroutine
```

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `go func() {\n\tbody\n}()` | 8 | `go{body}` | 4 | 50.0% |

### Rule 7.2: Channels
```
ch:=make(chan int,size)     // buffered (v2: canonical `make`)
ch:=make(chan int)          // unbuffered
ch<-value                   // send
v:=<-ch                     // receive
```
Note: v2 uses canonical `make` instead of v1's `mk`.

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `ch := make(chan int, 10)` | 8 | `ch:=make(chan int,10)` | 8 | 0% |

### Rule 7.3: Defer
```
defer fn()
defer{body}                // anonymous defer
```

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `defer func() {\n\tbody\n}()` | 8 | `defer{body}` | 4 | 50.0% |

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

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `var x int = 5` | 5 | `x:int=5` | 4 | 20.0% |
| `const (\n\tA = iota\n\tB\n\tC\n)` | 10 | `const(A=iota;B;C)` | 7 | 30.0% |

---

## 9. Expressions and Operators

### Rule 9.1: Standard operators
All Go operators preserved (already single tokens in cl100k_base):
```
:=  =  +=  -=  *=  /=  %=  ==  !=  <  >  <=  >=
&&  ||  !  +  -  *  /  %  &  |  ^  ~  <<  >>
<-  ++  --  ...
```

### Rule 9.2: `#` operator (len)
```
#x          // len(x)
#m          // len(m)
s[:# s-1]   // s[:len(s)-1]
```
The `#` prefix operator returns the length of slices, maps, strings, arrays, and channels.

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `len(x)` | 4 | `#x` | 2 | 50.0% |
| `len(items)` | 4 | `#items` | 2 | 50.0% |
| `if len(s) == 0` | 7 | `if #s==0` | 5 | 28.6% |
| `for i := 0; i < len(arr); i++` | 12 | `for i:=0;i<#arr;i++` | 8 | 33.3% |
| `s[:len(s)-1]` | 8 | `s[:#s-1]` | 6 | 25.0% |

Note: `len()` function-call syntax is also accepted for backward compatibility. `#` is the preferred form.

### Rule 9.3: Composite literals
```
[]int{1,2,3}
map[string]int{"a":1,"b":2}       // v2: canonical `map`
User{Name:"Alice",Age:30}
```

### Rule 9.4: Slice operations
```
s[1:3]
s[:5]
s[2:]
```
Same as Go.

### Rule 9.5: Type assertions
```
val:=x.(Type)
val,ok:=x.(Type)
```
Same as Go.

### Rule 9.6: Map operations
```
val:=m[key]
val,ok:=m[key]
delete(m,key)              // v2: canonical `delete`
```

---

## 10. Append Sugar (`+=` on slices)

### Rule 10.1: Slice append
```
s+=x                       // s = append(s, x)
s+=x,y,z                   // s = append(s, x, y, z)
s+=other...                // s = append(s, other...)
```
The `+=` operator on slice types expands to `append`.

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `s = append(s, x)` | 7 | `s+=x` | 3 | 57.1% |
| `s = append(s, x, y, z)` | 11 | `s+=x,y,z` | 5 | 54.5% |
| `s = append(s, other...)` | 8 | `s+=other...` | 4 | 50.0% |
| `result = append(result, item)` | 7 | `result+=item` | 3 | 57.1% |

Note: `append()` function-call syntax is also accepted. `+=` is the preferred form for the common single-slice-append pattern.

Context rule: The transpiler distinguishes slice `+=` from numeric `+=` via type inference. If the left-hand side is a known numeric type, standard `+=` semantics apply. If it is a slice type, `append` semantics apply.

---

## 11. Error Return Sugar (`->!T`)

### Rule 11.1: Error return shorthand
```
name(params)->!T{body}
```
Expands to:
```go
func name(params) (T, error) { body }
```

For multiple return values:
```
name(params)->!(T1,T2){body}
```
Expands to:
```go
func name(params) (T1, T2, error) { body }
```

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `func Read(path string) ([]byte, error)` | 11 | `Read(path:string)->![]byte` | 7 | 36.4% |
| `func Parse(s string) (int, error)` | 10 | `Parse(s:string)->!int` | 7 | 30.0% |
| `func Fetch(url string) (*Response, error)` | 10 | `Fetch(url:string)->!*Response` | 7 | 30.0% |
| `func Split(s string) (string, string, error)` | 12 | `Split(s:string)->!(string,string)` | 9 | 25.0% |

### Rule 11.2: `->!` with bare error return
```
name(params)->!{body}
```
Expands to:
```go
func name(params) error { body }
```

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `func Close() error` | 5 | `Close()->!` | 4 | 20.0% |
| `func Save(data []byte) error` | 8 | `Save(data:[]byte)->!` | 7 | 12.5% |

---

## 12. Type Abbreviations

### Rule 12.1: Numeric type shorthands
Multi-token Go types compressed to single tokens:

| Go Type | Tokens | AET-Go v2 | Tokens | Saving |
|---------|--------|-----------|--------|--------|
| `float64` | 2 | `f64` | 1 | 50.0% |
| `float32` | 2 | `f32` | 1 | 50.0% |
| `int64` | 2 | `i64` | 1 | 50.0% |
| `int32` | 2 | `i32` | 1 | 50.0% |
| `int16` | 2 | `i16` | 1 | 50.0% |
| `int8` | 2 | `i8` | 1 | 50.0% |
| `uint64` | 2 | `u64` | 1 | 50.0% |
| `uint32` | 2 | `u32` | 1 | 50.0% |
| `uint16` | 2 | `u16` | 1 | 50.0% |
| `uint8` | 2 | `u8` | 1 | 50.0% |
| `complex128` | 2 | `c128` | 1 | 50.0% |
| `complex64` | 2 | `c64` | 1 | 50.0% |

### Rule 12.2: 1-token Go types (no abbreviation needed)
These Go types are already 1 token in cl100k_base and are used as-is:

| Go Type | Tokens | AET-Go v2 | Note |
|---------|--------|-----------|------|
| `int` | 1 | `int` | unchanged |
| `uint` | 1 | `uint` | unchanged |
| `byte` | 1 | `byte` | unchanged |
| `rune` | 1 | `rune` | unchanged |
| `string` | 1 | `string` | unchanged |
| `bool` | 1 | `bool` | unchanged |
| `error` | 1 | `error` | unchanged |
| `uintptr` | 1 | `uintptr` | unchanged |

### Rule 12.3: `fallthrough` abbreviation
```
ft
```
Expands to `fallthrough`.

| Go Keyword | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `fallthrough` | 2 | `ft` | 1 | 50.0% |

### Rule 12.4: Other keyword mappings

| v2 Keyword | Meaning | Go Equivalent | Both 1 token? |
|-----------|---------|---------------|---------------|
| `if` | conditional | `if` | yes |
| `else` | else branch | `else` | yes |
| `for` | loop | `for` | yes |
| `range` | range iteration | `range` | yes |
| `switch` | switch statement | `switch` | yes |
| `case` | switch case | `case` | yes |
| `default` | default case | `default` | yes |
| `select` | channel select | `select` | yes |
| `^` | return | `return` | yes |
| `const` | constant | `const` | yes |
| `var` | variable decl | `var` | yes |
| `make` | allocate | `make` | yes |
| `append` | append to slice | `append` | yes (but prefer `+=`) |
| `len` | length | `len` | yes (but prefer `#`) |
| `cap` | capacity | `cap` | yes |
| `map` | map type | `map` | yes |
| `delete` | delete from map | `delete` | yes |
| `copy` | copy slice | `copy` | yes |
| `new` | pointer alloc | `new` | yes |
| `defer` | deferred call | `defer` | yes |
| `go` | goroutine | `go` | yes |
| `break` | break | `break` | yes |
| `continue` | continue | `continue` | yes |
| `ft` | fallthrough | `fallthrough` | 1 vs 2 |
| `nil` | null | `nil` | yes |
| `true` | true | `true` | yes |
| `false` | false | `false` | yes |
| `iota` | enum counter | `iota` | yes |
| `@` | struct/interface | `type X struct` | operator vs 3+ tokens |
| `#` | length | `len(x)` | 1+1 vs 1+3 |

---

## 13. Standard Library Aliases

### Rule 13.1: Alias resolution
Aliases defined in `stdlib-aliases.json` are resolved at transpile time.
Every alias MUST be a single cl100k_base token.

The full mapping (89 aliases) is maintained in `stdlib-aliases.json`. Key categories:

**fmt (7 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `pl` | `fmt.Println` | `fmt` |
| `pf` | `fmt.Printf` | `fmt` |
| `sf` | `fmt.Sprintf` | `fmt` |
| `Ef` | `fmt.Errorf` | `fmt` |
| `fw` | `fmt.Fprintf` | `fmt` |
| `Sn` | `fmt.Scan` | `fmt` |
| `fp` | `fmt.Fprintln` | `fmt` |

**errors (3 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `En` | `errors.New` | `errors` |
| `ei` | `errors.Is` | `errors` |
| `ea` | `errors.As` | `errors` |

**context (4 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `Cb` | `context.Background` | `context` |
| `Cc` | `context.WithCancel` | `context` |
| `ct` | `context.WithTimeout` | `context` |
| `Cd` | `context.TODO` | `context` |

**strings (14 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `Sc` | `strings.Contains` | `strings` |
| `ss` | `strings.Split` | `strings` |
| `St` | `strings.TrimSpace` | `strings` |
| `Sp` | `strings.HasPrefix` | `strings` |
| `sx` | `strings.HasSuffix` | `strings` |
| `Sr` | `strings.Replace` | `strings` |
| `sj` | `strings.Join` | `strings` |
| `Sl` | `strings.ToLower` | `strings` |
| `Su` | `strings.ToUpper` | `strings` |
| `Sa` | `strings.ReplaceAll` | `strings` |
| `Tp` | `strings.TrimPrefix` | `strings` |
| `Tx` | `strings.TrimSuffix` | `strings` |
| `Si` | `strings.Index` | `strings` |
| `Rp` | `strings.Repeat` | `strings` |

**strconv (5 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `Ai` | `strconv.Atoi` | `strconv` |
| `ia` | `strconv.Itoa` | `strconv` |
| `Fi` | `strconv.FormatInt` | `strconv` |
| `Pi` | `strconv.ParseInt` | `strconv` |
| `Pf2` | `strconv.ParseFloat` | `strconv` |

**encoding/json (5 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `jm` | `json.Marshal` | `encoding/json` |
| `Ju` | `json.Unmarshal` | `encoding/json` |
| `jd` | `json.NewDecoder` | `encoding/json` |
| `Je` | `json.NewEncoder` | `encoding/json` |
| `Ji` | `json.MarshalIndent` | `encoding/json` |

**net/http (7 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `hl` | `http.ListenAndServe` | `net/http` |
| `hf` | `http.HandleFunc` | `net/http` |
| `hr` | `http.NewRequest` | `net/http` |
| `hg` | `http.Get` | `net/http` |
| `He` | `http.Error` | `net/http` |
| `Hm` | `http.NewServeMux` | `net/http` |
| `Ok` | `http.StatusOK` | `net/http` |

**os (9 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `Fo` | `os.Open` | `os` |
| `Fc` | `os.Create` | `os` |
| `Ge` | `os.Getenv` | `os` |
| `rf` | `os.ReadFile` | `os` |
| `wf` | `os.WriteFile` | `os` |
| `ox` | `os.Exit` | `os` |
| `Oa` | `os.Args` | `os` |
| `Or` | `os.Remove` | `os` |
| `Ma` | `os.MkdirAll` | `os` |

**io (5 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `Ra` | `io.ReadAll` | `io` |
| `ic` | `io.Copy` | `io` |
| `Eo` | `io.EOF` | `io` |
| `Id` | `io.Discard` | `io` |
| `Nc` | `io.NopCloser` | `io` |

**time (7 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `tn` | `time.Now` | `time` |
| `Ts` | `time.Since` | `time` |
| `Tk` | `time.Sleep` | `time` |
| `Td` | `time.Duration` | `time` |
| `Tm` | `time.Millisecond` | `time` |
| `Tc` | `time.Second` | `time` |
| `Tr` | `time.RFC3339` | `time` |

**sync (3 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `wg` | `sync.WaitGroup` | `sync` |
| `mx` | `sync.Mutex` | `sync` |
| `rw` | `sync.RWMutex` | `sync` |

**sort (2 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `So` | `sort.Slice` | `sort` |
| `Ss` | `sort.SliceStable` | `sort` |

**Other packages (18 aliases)**

| Alias | Expands To | Package |
|-------|-----------|---------|
| `lp` | `log.Println` | `log` |
| `Lf` | `log.Fatal` | `log` |
| `pj` | `filepath.Join` | `path/filepath` |
| `Bs` | `bufio.NewScanner` | `bufio` |
| `Bw` | `bufio.NewWriter` | `bufio` |
| `Br` | `bufio.NewReader` | `bufio` |
| `Bb` | `bytes.Buffer` | `bytes` |
| `Rc` | `regexp.MustCompile` | `regexp` |
| `Rv` | `reflect.ValueOf` | `reflect` |
| `Rt` | `reflect.TypeOf` | `reflect` |
| `Sh` | `sha256.Sum256` | `crypto/sha256` |
| `Be` | `base64.StdEncoding` | `encoding/base64` |
| `Sb` | `strings.Builder` | `strings` |
| `Sn2` | `strings.NewReader` | `strings` |
| `Nf` | `http.StatusNotFound` | `net/http` |
| `Se` | `http.StatusInternalServerError` | `net/http` |
| `Mg` | `http.MethodGet` | `net/http` |
| `Om` | `os.Mkdir` | `os` |

| Go Pattern | Tokens | AET-Go v2 | Tokens | Saving |
|-----------|--------|-----------|--------|--------|
| `fmt.Println(msg)` | 5 | `pl(msg)` | 4 | 20.0% |
| `fmt.Sprintf("hello %s", name)` | 8 | `sf("hello %s",name)` | 7 | 12.5% |
| `json.Marshal(data)` | 5 | `jm(data)` | 4 | 20.0% |
| `http.ListenAndServe(":8080", nil)` | 7 | `hl(":8080",nil)` | 6 | 14.3% |
| `os.ReadFile("config.json")` | 5 | `rf("config.json")` | 4 | 20.0% |
| `strings.Contains(s, "test")` | 7 | `Sc(s,"test")` | 6 | 14.3% |
| `context.Background()` | 4 | `Cb()` | 4 | 0% |

---

## 14. File Format

- Extension: `.aetg`
- First line: `!go-v2` (version marker, 3 tokens)
- Statements separated by `;`
- No required whitespace (spaces allowed but not required between tokens)
- No comments

---

## 15. Error Messages

Format: `Error at Statement #N (maps to Go line X): message`

Statement index is used instead of line numbers since AET-Go may have no newlines.

---

## 16. v1 to v2 Keyword Migration

The following keywords change from v1 (`.aet` with `!v3`) to v2 (`.aetg` with `!go-v2`):

| v1 Keyword | v2 Keyword | Change Type |
|-----------|-----------|-------------|
| `mk` | `make` | Restored canonical Go keyword |
| `apl` | `append` (or `+=`) | Restored canonical + new sugar |
| `ln` | `len` (or `#`) | Restored canonical + new operator |
| `rng` | `range` | Restored canonical Go keyword |
| `mp` (type) | `map` | Restored canonical Go keyword |
| `mp` (pipe) | `map` (pipe) | Restored canonical name |
| `flt` (pipe) | `filter` (pipe) | Restored canonical name |
| `dx` | `delete` | Restored canonical Go keyword |
| `cp` | `cap` | Restored canonical Go keyword |
| `cpy` | `copy` | Restored canonical Go keyword |
| `nw` | `new` | Restored canonical Go keyword |
| `fn` | (removed) | `func` was never needed; bare name suffices |
| `ty` | (removed) | Replaced by `@` for type declarations |
| `_in` | (removed) | Replaced by `@[]` for interfaces |
| `fth` | `ft` | Shortened further (2 tokens -> 1) |
| `cnt` | `continue` | Restored canonical Go keyword |
| `float64` | `f64` | New abbreviation |
| `int64` | `i64` | New abbreviation |
| (none) | `#` | New len operator |
| (none) | `+=` on slices | New append sugar |
| (none) | `->!T` | New error return sugar |

---

## 17. Grammar Rule Summary

Total grammar rules: 38

| # | Rule ID | Description |
|---|---------|-------------|
| 1 | 1.1 | Error propagation `?` |
| 2 | 1.2 | Error wrapping `?!` |
| 3 | 1.3 | Error chain |
| 4 | 1.4 | `?` on method chains |
| 5 | 2.1 | Function declaration |
| 6 | 2.2 | Typed parameters |
| 7 | 2.3 | Method declaration |
| 8 | 2.4 | Lambda expression |
| 9 | 2.5 | Early return `^` |
| 10 | 3.1 | Struct declaration `@` |
| 11 | 3.2 | Interface declaration `@[]` |
| 12 | 3.3 | Interface embedding |
| 13 | 3.4 | Type alias `@=` |
| 14 | 4.1 | No package declaration |
| 15 | 4.2 | No import declaration |
| 16 | 5.1 | If/else |
| 17 | 5.2 | For loops |
| 18 | 5.3 | Switch |
| 19 | 5.4 | Select |
| 20 | 6.1 | Collection pipe operators |
| 21 | 7.1 | Goroutines |
| 22 | 7.2 | Channels |
| 23 | 7.3 | Defer |
| 24 | 8.1 | Short declaration |
| 25 | 8.2 | Typed declaration |
| 26 | 8.3 | Constants |
| 27 | 9.1 | Standard operators |
| 28 | 9.2 | `#` operator (len) |
| 29 | 9.3 | Composite literals |
| 30 | 9.4 | Slice operations |
| 31 | 9.5 | Type assertions |
| 32 | 9.6 | Map operations |
| 33 | 10.1 | Slice append `+=` |
| 34 | 11.1 | Error return `->!T` |
| 35 | 11.2 | Bare error return `->!` |
| 36 | 12.1-12.4 | Type abbreviations and keyword mappings |
| 37 | 13.1 | Stdlib alias resolution (89 aliases) |
| 38 | 14 | File format and version marker |

---

## 18. Aggregate Token Savings

| Category | Avg Saving | Key Driver |
|----------|-----------|------------|
| Error propagation (`?` / `?!`) | 62-72% | Eliminates if-err-nil boilerplate |
| Error return sugar (`->!T`) | 20-36% | Eliminates `(T, error)` repetition |
| Append sugar (`+=`) | 50-57% | Eliminates `= append(s, ...)` pattern |
| Len operator (`#`) | 25-50% | Eliminates `len()` function call overhead |
| Function declarations | 31-50% | No `func` keyword, implicit return |
| Method declarations | 50% | Receiver type syntax |
| Struct/Interface | 24-53% | `@` operator, auto JSON tags |
| Import/Package elimination | 87% | Auto-resolved from aliases and usage |
| Control flow | 15-37% | Brace compression, no required whitespace |
| Type abbreviations | 50% per type | Multi-token types to single token |
| Stdlib aliases (89) | 14-20% per call | Single-token aliases for verbose APIs |
| Concurrency (anonymous) | 50% | `go{...}` / `defer{...}` |

---

## 19. End-to-End Examples

### Example 1: HTTP Server

**Go (82 tokens):**
```go
package main

import (
    "encoding/json"
    "net/http"
)

type Response struct {
    Message string `json:"message"`
    Status  int    `json:"status"`
}

func handler(w http.ResponseWriter, r *http.Request) {
    resp := Response{Message: "hello", Status: 200}
    json.NewEncoder(w).Encode(resp)
}

func main() {
    http.HandleFunc("/api", handler)
    http.ListenAndServe(":8080", nil)
}
```

**AET-Go v2 (34 tokens):**
```
!go-v2
@Response{Message:string;Status:int}
handler(w:http.ResponseWriter,r:*http.Request){resp:=Response{Message:"hello",Status:200};Je(w).Encode(resp)}
main(){hf("/api",handler);hl(":8080",nil)}
```

**Saving: 58.5%**

### Example 2: KV Store with Error Handling

**Go (95 tokens):**
```go
package main

import "fmt"

type KVStore struct {
    data map[string]string
}

func (s *KVStore) Set(k string, v string) {
    s.data[k] = v
}

func (s *KVStore) Get(k string) (string, error) {
    v, ok := s.data[k]
    if !ok {
        return "", fmt.Errorf("not found: %s", k)
    }
    return v, nil
}

func (s *KVStore) Keys() []string {
    keys := make([]string, 0, len(s.data))
    for k := range s.data {
        keys = append(keys, k)
    }
    return keys
}
```

**AET-Go v2 (50 tokens):**
```
!go-v2
@KVStore{data:map[string]string}
KVStore.Set(k:string,v:string){s.data[k]=v}
KVStore.Get(k:string)->!string{v,ok:=s.data[k];if !ok{^"",Ef("not found: %s",k)};^v,nil}
KVStore.Keys()->[]string{keys:=make([]string,0,#s.data);for k:=range s.data{keys+=k};^keys}
```

**Saving: 47.4%**

Note the v2 improvements visible in this example:
- `map` instead of `mp` (canonical, same token count)
- `#s.data` instead of `ln(s.data)` (saves 2 tokens)
- `keys+=k` instead of `keys=apl(keys,k)` (saves 4 tokens)
- `->!string` instead of `->(string,error)` (saves 3 tokens)
- `range` instead of `rng` (canonical, same token count)

### Example 3: Concurrent Worker Pool

**Go (70 tokens):**
```go
func process(items []string, workers int) []string {
    ch := make(chan string, len(items))
    results := make([]string, 0, len(items))

    for i := 0; i < workers; i++ {
        go func() {
            for item := range ch {
                results = append(results, transform(item))
            }
        }()
    }

    for _, item := range items {
        ch <- item
    }
    close(ch)
    return results
}
```

**AET-Go v2 (40 tokens):**
```
process(items:[]string,workers:int)->[]string{ch:=make(chan string,#items);results:=make([]string,0,#items);for i:=0;i<workers;i++{go{for item:=range ch{results+=transform(item)}}};for _,item:=range items{ch<-item};close(ch);^results}
```

**Saving: 42.9%**
