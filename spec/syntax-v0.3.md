# Aieattoken Syntax Specification v0.3

**Tokenizer**: cl100k_base (GPT-4 compatible)
**Target**: >=50% token savings vs Go/Java
**Compilation targets**: Go AND Java source code via IR
**Backwards compatibility**: transpiler accepts `!v1`, `!v2`, and `!v3` version markers

## Design Principles

1. Tokenizer-aware: every keyword/operator chosen from cl100k_base single-token vocabulary
2. Structural brackets `{ } [ ] ( )` preserved for AI scope understanding
3. Machine-first, human-recoverable via transpiler
4. No comments — logic expressed entirely by syntax
5. No package/import declarations — transpiler auto-resolves
6. Target-agnostic surface syntax — same `.aet` source emits Go or Java via IR
7. Target-specific features isolated in IR nodes, not in AET syntax

## File Format

- Extension: `.aet`
- First line: `!v3` (version marker, 3 tokens; `!v1` and `!v2` also accepted for backwards compatibility)
- Statements separated by `;`
- No required whitespace (spaces allowed but not required between tokens)

---

## 1. Error Propagation (P0) — Biggest Win

### Rule 1.1: `?` operator (error propagation)
```
val := expr?
```
**Expands to (Go):**
```go
val, err := expr
if err != nil {
    return <zero-values>..., err
}
```
**Expands to (Java):**
```java
try { val = expr; } catch (Exception e) { throw e; }
```

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `result, err := fn()\nif err != nil {\n\treturn nil, err\n}` | 18 | `result:=fn()?` | 5 | 72.2% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `try { result = fn(); } catch (Exception e) { throw e; }` | 19 | `result:=fn()?` | 5 | 73.7% |

### Rule 1.2: `?!` operator (error wrapping)
```
val := expr?!"context message"
```
**Expands to (Go):**
```go
val, err := expr
if err != nil {
    return <zero-values>..., fmt.Errorf("context message: %w", err)
}
```
**Expands to (Java):**
```java
try { val = expr; } catch (Exception e) { throw new RuntimeException("context message", e); }
```

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `result, err := fn()\nif err != nil {\n\treturn nil, fmt.Errorf("failed: %w", err)\n}` | 26 | `result:=fn()?!"failed"` | 8 | 69.2% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `try { result = fn(); } catch (Exception e) { throw new RuntimeException("failed", e); }` | 24 | `result:=fn()?!"failed"` | 8 | 66.7% |

### Rule 1.3: Error propagation chain
Multiple `?` operators compose naturally:
```
a:=step1()?;b:=step2(a)?;c:=step3(b)?
```

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| 3x error check blocks | 50 | chain with `?` | 19 | 62.0% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| 3x try-catch blocks | 57 | chain with `?` | 19 | 66.7% |

---

## 2. Function Declarations (P1)

### Rule 2.1: Function declaration
```
name(params){body}
```
- No `fn` keyword required (previously `func` in v1/v2)
- Last expression is implicit return value
- `^` for early return (replaces `return`)

### Rule 2.2: Typed parameters (when inference insufficient)
```
name(a:int,b:int)->int{body}
```
- `:` separates param name from ty
- `->` before return ty
- Types may be omitted when inferable from context

### Rule 2.3: Method declaration
```
TypeName.methodName(params){body}
```
- Receiver auto-generated as first letter of ty (lowercased)
- Pointer receiver is default (covers most Go methods)
- For Java target: emitted as instance method on the class

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `func add(a int, b int) int {\n\treturn a + b\n}` | 16 | `add(a:int,b:int)->int{a+b}` | 11 | 31.3% |
| `func (s *Server) Handle(w, r) {...}` | 24 | `Server.Handle(w,r){...}` | 12 | 50.0% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `public static int add(int a, int b) {\n\treturn a + b;\n}` | 16 | `add(a:int,b:int)->int{a+b}` | 11 | 31.3% |
| `public void handle(Request w, Response r) {...}` | 14 | `Server.Handle(w,r){...}` | 12 | 14.3% |

### Rule 2.4: Lambda / anonymous functions
```
{params|body}
```
- Pipe `|` separates parameter list from body
- Used in callbacks: `Hf("/path",{w,r|body})`
- Go target: anonymous function
- Java target: lambda expression `(params) -> { body }`

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
- `@` replaces `ty ... struct` (previously `type ... struct` in v1/v2)
- Fields separated by `;`
- JSON tags auto-generated (lowercase field name) — omit from AET
- For Java target: generates full class with constructor, getters, setters, toString (see Rule 12.3)

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `type User struct {\n\tName string\n\t...}` | 24 | `@User{Name:string;...}` | 15 | 37.5% |
| With JSON tags | 32 | Without (auto-gen) | 11 | 65.6% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| Full Java class (fields + constructor + getters + setters + toString) | 120+ | `@User{Name:String;Age:int;Email:String}` | 15 | 87.5% |

### Rule 3.2: Interface declaration
```
@TypeName[method1(params)->ret;method2(params)->ret]
```
- `[...]` for interfaces (vs `{...}` for structs)

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `type Reader interface {\n\tRead(p []byte) (n int, err error)\n}` | 17 | `@Reader[Read(p:[]byte)->(int,error)]` | 13 | 23.5% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `public interface Reader {\n\tint read(byte[] p) throws Exception;\n}` | 15 | `@Reader[Read(p:[]byte)->(int,error)]` | 13 | 13.3% |

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
- Stdlib alias usage (from `stdlib-aliases.json` for Go, `stdlib-aliases-java.json` for Java)
- Qualified identifiers (e.g., `strings.Split` -> `"strings"`)
- Type references (e.g., `http.ResponseWriter` -> `"net/http"`)
- Java type usage (e.g., `Map` -> `java.util.Map`, `List` -> `java.util.List`)

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `package main\nimport (\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"os"\n\t"strings"\n)` | 23 | `!v3` | 3 | 87.0% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `import java.util.*;\nimport java.io.*;\nimport java.nio.file.*;\nimport java.net.http.*;` | 28 | `!v3` | 3 | 89.3% |

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
for k,v:=rng expr{body}        // range (v3: `rng`, previously `range`)
for{body}                       // infinite
```

### Rule 5.3: Switch
```
switch expr{case val1:stmts;case val2:stmts;default:stmts}
switch{case cond1:stmts;case cond2:stmts}   // tagless switch
```

### Rule 5.4: Select (Go target only)
```
select{case expr:stmts;case expr:stmts;default:stmts}
```
Note: `select` is Go-only. Java emitter errors on select IR nodes.

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| C-style for loop | 20 | compressed | 17 | 15.0% |
| Range loop | 22 | compressed | 19 | 13.6% |
| If-else chain | 30 | compressed | 19 | 36.7% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| Enhanced for loop | 16 | `for _,v:=rng items{...}` | 13 | 18.8% |
| C-style for loop | 20 | compressed | 17 | 15.0% |
| If-else chain | 30 | compressed | 19 | 36.7% |

### Rule 5.5: Collection operations (pipe operator)
```
items|mp(fn)
items|flt(fn)
items|reduce(fn,init)
items|flt(.Active)|mp(.Name)    // dot-shorthand for field access
```
Transpiler expands to Go `for` loops or Java streams.

| Go Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| filter+map with for loop | 32 | pipe syntax | 12 | 62.5% |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `.stream().filter(...).map(...).collect(...)` | 22 | pipe syntax | 12 | 45.5% |

---

## 6. Standard Library Aliases (P5)

### Rule 6.1: Alias resolution
Aliases defined in `stdlib-aliases.json` (Go) and `stdlib-aliases-java.json` (Java) are resolved at transpile time.
Every alias MUST be a single cl100k_base token.

See `stdlib-aliases.json` for the complete Go mapping.
See `stdlib-aliases-java.json` for the complete Java mapping.

Key Go examples:
- `Pn` -> `fmt.Println`
- `Pf` -> `fmt.Printf`
- `Sf` -> `fmt.Sprintf`
- `Ef` -> `fmt.Errorf`
- `Jm` -> `json.Marshal`
- `Ju` -> `json.Unmarshal`

Key Java examples:
- `pl` -> `System.out.println`
- `Pi` -> `Integer.parseInt`
- `Fr` -> `Files.readString`
- `Fw` -> `Files.writeString`
- `Sc` -> `new Scanner(System.in)`

---

## 7. Concurrency

### Rule 7.1: Goroutines (Go target only)
```
go fn()                     // named function (v3: `fn`, previously `func`)
go{body}                    // anonymous goroutine
```
Note: No Java equivalent. Java emitter errors on goroutine IR nodes.

### Rule 7.2: Channels (Go target only)
```
ch:=mk(chan ty,size)        // buffered (v3: `mk`/`ty`, previously `make`/`type`)
ch:=mk(chan ty)             // unbuffered
ch<-value                   // send
v:=<-ch                     // receive
```
Note: No Java equivalent. Java emitter errors on chan IR nodes.

### Rule 7.3: Defer
```
defer fn()
defer{body}                // anonymous defer
```
Note: For Java target, `defer` maps to try-with-resources or try-finally blocks.

---

## 8. Variables and Constants

### Rule 8.1: Short declaration
```
x:=value
```
Same as Go `:=` (already 1 token).
Java target: `var x = value` (local variable type inference).

### Rule 8.2: Typed declaration
```
x:type=value
```
Transpiles to `var x type = value` (Go) or `type x = value` (Java).

### Rule 8.3: Constants
```
const x=value
const(x=1;y=2;z=iota)
```
Java target: `static final` fields. `iota` expanded to explicit integer values.

---

## 9. Expressions

### Rule 9.1: Operators
All Go operators preserved (already single tokens in cl100k_base):
`:=` `=` `+=` `-=` `*=` `/=` `%=` `==` `!=` `<` `>` `<=` `>=`
`&&` `||` `!` `+` `-` `*` `/` `%` `&` `|` `^` `~` `<<` `>>`
`<-` `++` `--` `...`

Note: `<-` is Go-only (channel operations). Java emitter errors on `<-` usage.

### Rule 9.2: Composite literals
```
[]int{1,2,3}
mp[string]int{"a":1,"b":2}
User{Name:"Alice",Age:30}
```
Same as Go (already efficient). v3 uses `mp` instead of `map`.
Java target: see Rule 12.9 for mk/nw mapping.

### Rule 9.3: Slice operations
```
s[1:3]
s[:5]
s[2:]
```
Same as Go. Java target: maps to `Arrays.copyOfRange()` or `List.subList()`.

### Rule 9.4: Type assertions
```
val:=x.(Type)
val,ok:=x.(Type)
```
Same as Go. Java target: maps to `instanceof` check and cast.

### Rule 9.5: Map lookup
```
val:=m[key]
val,ok:=m[key]
```
Same as Go. Java target: `m.get(key)` and `m.containsKey(key)`.

---

## 10. Error Messages

Format: `Error at Statement #N (maps to Go/Java lines X-Y): message`

Statement index is used instead of line numbers since AET may have no newlines.

---

## 11. Go-Specific Notes

All rules in sections 1-10 apply to the Go target as defined in v0.1. The following features are Go-only and produce errors when targeting Java:

- `select` statement (Rule 5.4)
- Goroutines (Rule 7.1)
- Channels (Rule 7.2)
- `<-` operator (Rule 9.1)
- `chan T` types
- `iota` (expanded to integers for Java, Rule 8.3)

---

## 12. Java Target Extensions

### Rule 12.1: Class wrapper elimination
- AET code without explicit class -> Java emitter wraps in `public class Main { ... }` with static methods
- Class name derived from filename (e.g., `server.aet` -> `public class Server { ... }`)
- No `public class X {}` in AET — entirely auto-generated

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `public class Main {\n\tpublic static void main(String[] args) {\n\t\t...\n\t}\n}` | 16 | (auto-generated, 0 AET tokens) | 0 | 100% |

### Rule 12.2: Access modifier elimination
All access modifiers (`public`, `private`, `protected`, `static`) are auto-inferred:
- Top-level functions -> `public static`
- Struct fields -> `private`
- Methods (with receiver via `TypeName.method`) -> `public`
- `main()` -> `public static void main(String[] args)`

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `public static void main(String[] args)` | 8 | `main()` | 3 | 62.5% |
| `public static int add(int a, int b)` | 8 | `add(a:int,b:int)->int` | 9 | — |
| `private String name;` | 4 | (in @Struct) `Name:String` | 3 | 25.0% |

### Rule 12.3: @Struct -> Java class generation
```
@User{Name:String;Age:int;Email:String}
```
Generates:
- Private fields
- All-args constructor
- Getters and setters
- `toString()` method

Reuses existing Go @Struct syntax (Rule 3.1) — no new syntax needed.

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| Full Java class: private fields + constructor + getters + setters + toString (~40 lines) | 120+ | `@User{Name:String;Age:int;Email:String}` | 15 | 87.5% |

### Rule 12.4: Exception handling -> error propagation
Reuses existing AET `?` / `?!` syntax (Rules 1.1, 1.2) — no new syntax needed.

- `val:=expr?` maps to:
  ```java
  try { val = expr; } catch (Exception e) { throw e; }
  ```

- `val:=expr?!"context"` maps to:
  ```java
  try { val = expr; } catch (Exception e) { throw new RuntimeException("context", e); }
  ```

- Checked exceptions auto-added to method signatures by emitter (`throws` clauses)

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `try { val = expr; } catch (Exception e) { throw e; }` | 19 | `val:=expr?` | 4 | 78.9% |
| `try { val = expr; } catch (Exception e) { throw new RuntimeException("ctx", e); }` | 22 | `val:=expr?!"ctx"` | 7 | 68.2% |
| Method with `throws IOException, SQLException` | 5 | (auto-generated) | 0 | 100% |

### Rule 12.5: Import auto-resolution
Same mechanism as Go (Rule 4.2) — transpiler auto-detects needed imports from:
- Stdlib alias usage (from `stdlib-aliases-java.json`)
- Type usage (`String`, `List`, `Map`, etc.)
- Method calls on known types

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `import java.util.HashMap;\nimport java.util.List;\nimport java.io.IOException;` | 18 | (auto-resolved) | 0 | 100% |

### Rule 12.6: Type mapping (AET <-> Java)

| AET Type | Java Type |
|----------|-----------|
| `int` | `int` |
| `int64` | `long` |
| `float64` | `double` |
| `string` | `String` |
| `bool` | `boolean` |
| `byte` | `byte` |
| `[]int` | `int[]` |
| `[]string` | `String[]` |
| `[]byte` | `byte[]` |
| `mp[K]V` | `Map<K, V>` |
| `*Type` | `Type` (Java uses reference semantics) |
| `_in{}` | `Object` |
| `error` | `Exception` |
| `chan T` | (not supported for Java target) |

### Rule 12.7: Java stdlib aliases
Defined in `stdlib-aliases-java.json`. Same resolution mechanism as Go aliases (Rule 6.1).
All 30 aliases are single cl100k_base tokens.

Key mappings:

| Alias | Expands To | Java Import |
|-------|-----------|-------------|
| `pl` | `System.out.println` | (none, java.lang) |
| `pf` | `System.out.printf` | (none, java.lang) |
| `Pi` | `Integer.parseInt` | (none, java.lang) |
| `Pd` | `Double.parseDouble` | (none, java.lang) |
| `Fr` | `Files.readString` | `java.nio.file.Files` |
| `Fw` | `Files.writeString` | `java.nio.file.Files` |
| `Pp` | `Path.of` | `java.nio.file.Path` |
| `Hc` | `HttpClient.newHttpClient` | `java.net.http.HttpClient` |
| `Hr` | `HttpRequest.newBuilder` | `java.net.http.HttpRequest` |
| `Sc` | `new Scanner(System.in)` | `java.util.Scanner` |
| `Sb` | `new StringBuilder` | (none, java.lang) |
| `Al` | `new ArrayList<>` | `java.util.ArrayList` |
| `Hm` | `new HashMap<>` | `java.util.HashMap` |
| `Hs` | `new HashSet<>` | `java.util.HashSet` |
| `Ar` | `Arrays` | `java.util.Arrays` |
| `Co` | `Collections` | `java.util.Collections` |
| `Om` | `ObjectMapper` | `com.fasterxml.jackson.databind.ObjectMapper` |
| `Lr` | `new BufferedReader` | `java.io.BufferedReader` |
| `Lw` | `new BufferedWriter` | `java.io.BufferedWriter` |
| `Re` | `Pattern.compile` | `java.util.regex.Pattern` |
| `Ts` | `Instant.now` | `java.time.Instant` |
| `Dt` | `LocalDateTime.now` | `java.time.LocalDateTime` |
| `Df` | `DateTimeFormatter.ofPattern` | `java.time.format.DateTimeFormatter` |
| `Th` | `Thread.start` | (none, java.lang) |
| `Ex` | `Executors.newFixedThreadPool` | `java.util.concurrent.Executors` |
| `Cf` | `CompletableFuture` | `java.util.concurrent.CompletableFuture` |
| `Lk` | `new ReentrantLock` | `java.util.concurrent.locks.ReentrantLock` |
| `Jw` | `new JsonWriter` | `com.google.gson.stream.JsonWriter` |
| `Bs` | `Base64.getEncoder` | `java.util.Base64` |
| `Lg` | `Logger.getLogger` | `java.util.logging.Logger` |

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `System.out.println(msg)` | 7 | `pl(msg)` | 4 | 42.9% |
| `Integer.parseInt(s)` | 5 | `Pi(s)` | 4 | 20.0% |
| `Files.readString(Path.of(f))` | 9 | `Fr(Pp(f))` | 6 | 33.3% |
| `new HashMap<String, Integer>()` | 9 | `Hm()` | 4 | 55.6% |
| `CompletableFuture.supplyAsync(...)` | 5 | `Cf.supplyAsync(...)` | 5 | 0% |

### Rule 12.8: Range/enhanced-for mapping
AET range syntax maps to Java enhanced-for and index-based loops:

- `for _,item:=rng items{...}` -> `for (var item : items) { ... }`
- `for i,v:=rng items{...}` -> `for (int i = 0; i < items.length; i++) { var v = items[i]; ... }`
- `for k,v:=rng m{...}` -> `for (var entry : m.entrySet()) { var k = entry.getKey(); var v = entry.getValue(); ... }`

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `for (var item : items) { ... }` | 10 | `for _,item:=rng items{...}` | 10 | 0% |
| `for (int i = 0; i < items.length; i++) { ... }` | 16 | `for i,v:=rng items{...}` | 10 | 37.5% |
| `for (var entry : map.entrySet()) { var k = entry.getKey(); ... }` | 18 | `for k,v:=rng m{...}` | 10 | 44.4% |

### Rule 12.9: mk/nw mapping
AET `mk()` and composite literal syntax maps to Java constructors and array initializers:

- `mk(mp[string]int)` -> `new HashMap<String, Integer>()`
- `mk([]int,n)` -> `new int[n]`
- `[]int{1,2,3}` -> `new int[]{1, 2, 3}`
- `mp[string]int{"a":1,"b":2}` -> `new HashMap<>(Map.of("a", 1, "b", 2))`

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `new HashMap<String, Integer>()` | 9 | `mk(mp[string]int)` | 7 | 22.2% |
| `new int[n]` | 5 | `mk([]int,n)` | 7 | — |
| `new int[]{1, 2, 3}` | 9 | `[]int{1,2,3}` | 7 | 22.2% |
| `new HashMap<>(Map.of("a", 1, "b", 2))` | 15 | `mp[string]int{"a":1,"b":2}` | 11 | 26.7% |

### Rule 12.10: Lambda mapping
AET lambda syntax maps to Java lambda expressions:

- `{params|body}` -> `(params) -> { body }` in Java
- Same AET syntax as Go anonymous functions (Rule 2.4)

| Java Pattern | Tokens | AET Pattern | Tokens | Saving |
|-----------|--------|-------------|--------|--------|
| `(x, y) -> { return x + y; }` | 12 | `{x,y|x+y}` | 7 | 41.7% |
| `list.forEach(item -> { System.out.println(item); })` | 12 | `list.forEach({item|pl(item)})` | 9 | 25.0% |
| `list.stream().map(s -> s.toUpperCase()).collect(Collectors.toList())` | 16 | `list|mp({s|s.toUpperCase()})` | 11 | 31.3% |

---

## 13. Java-Specific IR Nodes

All Java IR nodes are prefixed with `Java_` to isolate from Go IR:

| IR Node | Purpose | Source AET Syntax |
|---------|---------|-------------------|
| `JavaClassDecl` | Auto-generated class wrapper | (implicit from file) |
| `JavaTryCatch` | Exception handling from `?` / `?!` | `expr?`, `expr?!"msg"` |
| `JavaNewExpr` | Constructor calls from `mk()` | `mk(ty)` |
| `JavaEnhancedFor` | Enhanced-for from `rng` | `for _,v:=rng expr{...}` |
| `JavaAnnotation` | Auto-generated annotations | (emitter-generated) |
| `JavaThrows` | Checked exception signatures | (emitter-inferred) |
| `JavaLambda` | Lambda expressions | `{params|body}` |

Cross-target safety:
- Go emitter errors on any `Java_` prefixed IR node
- Java emitter errors on Go-only IR nodes: `GoSelect`, `GoChan`, `GoGoroutine`, `GoDefer` (defer has Java mapping via try-finally but uses separate IR)

---

## 14. v3 Keyword Table

### All v3 keywords

| v3 Keyword | Meaning | Go equivalent | Java equivalent |
|-----------|---------|---------------|-----------------|
| `if` | conditional | `if` | `if` |
| `else` | else branch | `else` | `else` |
| `for` | loop | `for` | `for`/`while` |
| `rng` | range iteration | `range` | enhanced-for |
| `switch` | switch statement | `switch` | `switch` |
| `case` | switch case | `case` | `case` |
| `default` | default case | `default` | `default` |
| `select` | channel select (Go only) | `select` | N/A |
| `^` | return | `return` | `return` |
| `const` | constant | `const` | `static final` |
| `var` | variable declaration | `var` | `var` |
| `fn` | function type | `func` | lambda/method ref |
| `ty` | type keyword | `type` | (class/interface) |
| `@` | struct/interface decl | `type X struct`/`interface` | `class`/`interface` |
| `_in` | interface type | `interface` | `Object` |
| `mk` | allocate/initialize | `make` | `new` |
| `nw` | new allocation | `new` | `new` |
| `mp` | map type | `map` | `Map` |
| `ln` | length | `len` | `.length`/`.size()` |
| `cp` | capacity | `cap` | N/A |
| `apl` | append to slice | `append` | `.add()` |
| `dx` | delete from map | `delete` | `.remove()` |
| `cpy` | copy slice | `copy` | `System.arraycopy` |
| `flt` | filter collection | `filter` (pipe) | `.stream().filter()` |
| `defer` | deferred call | `defer` | try-finally |
| `go` | goroutine (Go only) | `go` | N/A |
| `break` | break loop | `break` | `break` |
| `cnt` | continue loop | `continue` | `continue` |
| `fth` | fallthrough | `fallthrough` | N/A |
| `nil` | null value | `nil` | `null` |
| `true` | boolean true | `true` | `true` |
| `false` | boolean false | `false` | `false` |
| `iota` | enum counter | `iota` | (expanded) |

---

## 15. Keyword Migration (v1/v2 -> v3)

The following keywords were shortened in v3 for improved token efficiency:

| v1/v2 Keyword | v3 Keyword | Rationale |
|--------------|-----------|-----------|
| `append` | `apl` | 1 token vs 1 token, but shorter for context window |
| `len` | `ln` | Single cl100k_base token |
| `cap` | `cp` | Single cl100k_base token |
| `delete` | `dx` | Single cl100k_base token |
| `copy` | `cpy` | Single cl100k_base token |
| `new` | `nw` | Single cl100k_base token |
| `map` | `mp` | Single cl100k_base token |
| `filter` | `flt` | Single cl100k_base token |
| `make` | `mk` | Single cl100k_base token |
| `func` | `fn` | Single cl100k_base token |
| `type` | `ty` | Single cl100k_base token |
| `interface` | `_in` | Single cl100k_base token |
| `range` | `rng` | Single cl100k_base token |

A migration script (`ts/src/migrate-v3.ts`) is provided to automatically update `.aet` files:
```
node ts/dist/migrate-v3.js <file-or-directory> [--dry-run]
```

The migration script:
1. Replaces the version marker (`!v1` or `!v2` -> `!v3`)
2. Replaces keywords only in code segments (string literals are preserved)
3. Uses word-boundary-aware matching to avoid modifying identifiers that contain keyword substrings
4. Processes longer keywords before shorter ones to prevent partial replacements

---

## 16. Backward Compatibility

The parser accepts `!v1`, `!v2`, and `!v3` version markers and understands both old and new keyword forms:

| Feature | v1/v2 Form | v3 Form | Parser Accepts |
|---------|-----------|---------|----------------|
| Version marker | `!v1`, `!v2` | `!v3` | All three |
| Append | `append` | `apl` | Both |
| Length | `len` | `ln` | Both |
| Capacity | `cap` | `cp` | Both |
| Delete | `delete` | `dx` | Both |
| Copy | `copy` | `cpy` | Both |
| New | `new` | `nw` | Both |
| Map type | `map` | `mp` | Both |
| Filter | `filter` | `flt` | Both |
| Make | `make` | `mk` | Both |
| Function type | `func` | `fn` | Both |
| Type keyword | `type` | `ty` | Both |
| Interface | `interface` | `_in` | Both |
| Range | `range` | `rng` | Both |

This means:
- Existing v1/v2 `.aet` files continue to work without modification
- New code should use v3 keywords for optimal token efficiency
- Mixed v1/v2 and v3 keywords within a single file are accepted but discouraged
- The migration script can be used to convert existing files to v3

---

## 17. Grammar Rule Summary

Total grammar rules: 47

| # | Rule ID | Description | Target |
|---|---------|-------------|--------|
| 1 | 1.1 | Error propagation `?` | Go + Java |
| 2 | 1.2 | Error wrapping `?!` | Go + Java |
| 3 | 1.3 | Error chain | Go + Java |
| 4 | 2.1 | Function declaration | Go + Java |
| 5 | 2.2 | Typed parameters | Go + Java |
| 6 | 2.3 | Method declaration | Go + Java |
| 7 | 2.4 | Lambda expression | Go + Java |
| 8 | 2.5 | Early return `^` | Go + Java |
| 9 | 3.1 | Struct declaration | Go + Java |
| 10 | 3.2 | Interface declaration | Go + Java |
| 11 | 3.3 | Type alias | Go + Java |
| 12 | 4.1 | No package declaration | Go + Java |
| 13 | 4.2 | No import declaration | Go + Java |
| 14 | 5.1 | If/else | Go + Java |
| 15 | 5.2 | For loops | Go + Java |
| 16 | 5.3 | Switch | Go + Java |
| 17 | 5.4 | Select | Go only |
| 18 | 5.5 | Collection pipe operators | Go + Java |
| 19 | 6.1 | Stdlib alias resolution | Go + Java |
| 20 | 7.1 | Goroutines | Go only |
| 21 | 7.2 | Channels | Go only |
| 22 | 7.3 | Defer | Go + Java |
| 23 | 8.1 | Short declaration | Go + Java |
| 24 | 8.2 | Typed declaration | Go + Java |
| 25 | 8.3 | Constants | Go + Java |
| 26 | 9.1 | Operators | Go + Java |
| 27 | 9.2 | Composite literals | Go + Java |
| 28 | 9.3 | Slice operations | Go + Java |
| 29 | 9.4 | Type assertions | Go + Java |
| 30 | 9.5 | Map lookup | Go + Java |
| 31 | 10 | Error messages | Go + Java |
| 32 | — | Version marker `!v1` / `!v2` / `!v3` | Go + Java |
| 33 | — | Statement separator `;` | Go + Java |
| 34 | — | Block scope `{ }` | Go + Java |
| 35 | — | Blank identifier `_` | Go + Java |
| 36 | 12.1 | Class wrapper elimination | Java only |
| 37 | 12.2 | Access modifier elimination | Java only |
| 38 | 12.3 | @Struct -> Java class generation | Java only |
| 39 | 12.4 | Exception handling mapping | Java only |
| 40 | 12.5 | Import auto-resolution (Java) | Java only |
| 41 | 12.6 | Type mapping (AET <-> Java) | Java only |
| 42 | 12.7 | Java stdlib aliases | Java only |
| 43 | 12.8 | Range/enhanced-for mapping | Java only |
| 44 | 12.9 | mk/nw mapping | Java only |
| 45 | 12.10 | Lambda mapping | Java only |
| 46 | 13 | Java IR nodes | Java only |
| 47 | — | Cross-target IR safety | Go + Java |

---

## 18. Aggregate Token Savings

### Go Target (unchanged from v0.1)

| Category | Avg Saving |
|----------|-----------|
| Error propagation | 62-72% |
| Function declarations | 31-50% |
| Struct/Interface | 24-66% |
| Import/Package elimination | 87% |
| Control flow | 13-37% |
| Stdlib aliases | varies |

### Java Target (new in v0.2)

| Category | Avg Saving | Key Driver |
|----------|-----------|------------|
| Error propagation (`?` / `?!`) | 69-79% | Eliminates try-catch boilerplate |
| Class wrapper elimination | 100% | Entire class declaration auto-generated |
| Access modifier elimination | 25-63% | All modifiers auto-inferred |
| @Struct -> full Java class | 87%+ | Constructor + getters + setters + toString |
| Import elimination | 89-100% | Auto-resolved from aliases and types |
| Exception `throws` clauses | 100% | Auto-added by emitter |
| Stdlib aliases | 20-56% | Single-token aliases for verbose Java APIs |
| Lambda expressions | 25-42% | Compact `{params|body}` syntax |
| Range/enhanced-for | 0-44% | Biggest win on mp iteration |
| mk/nw mapping | 22-27% | Modest savings on constructors |

### End-to-End Example: Java Hello World

**Standard Java (27 tokens):**
```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

**AET equivalent (7 tokens):**
```
!v3
main(){pl("Hello, World!")}
```

**Saving: 74.1%**

### End-to-End Example: Java CRUD struct

**Standard Java (~130 tokens):**
```java
public class User {
    private String name;
    private int age;
    private String email;

    public User(String name, int age, String email) {
        this.name = name;
        this.age = age;
        this.email = email;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    @Override
    public String toString() {
        return "User{name=" + name + ", age=" + age + ", email=" + email + "}";
    }
}
```

**AET equivalent (15 tokens):**
```
!v3
@User{Name:String;Age:int;Email:String}
```

**Saving: 88.5%**

### End-to-End Example: Java file read with error handling

**Standard Java (~45 tokens):**
```java
public class Main {
    public static void main(String[] args) throws Exception {
        String content;
        try {
            content = Files.readString(Path.of("input.txt"));
        } catch (Exception e) {
            throw new RuntimeException("read failed", e);
        }
        System.out.println(content);
    }
}
```

**AET equivalent (14 tokens):**
```
!v3
main(){c:=Fr(Pp("input.txt"))?!"read failed";pl(c)}
```

**Saving: 68.9%**

### End-to-End Example: Go KV store with v3 keywords

**AET v3:**
```
!v3
@KVStore{data:mp[string]string}
KVStore.Set(k:string,v:string){s.data[k]=v}
KVStore.Get(k:string)->(string,error){v,ok:=s.data[k];if !ok{^"",Ef("not found")};^v,nil}
KVStore.Delete(k:string){dx(s.data,k)}
KVStore.Keys()->[]string{keys:=mk([]string,0,ln(s.data));for k:=rng s.data{keys=apl(keys,k)};^keys}
```

This example demonstrates the v3 shortened keywords: `mp`, `dx`, `mk`, `ln`, `rng`, `apl`.
