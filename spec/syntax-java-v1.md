# AET-Java Syntax Specification v1.0

**Tokenizer**: cl100k_base (GPT-4 compatible)
**Target**: >= 50% token savings vs Java source
**Input**: `.java` files
**Output**: `.aetj` files (AET-Java compressed syntax)
**Compilation**: AET-Java -> IR (shared) -> Java source
**Reverse**: Java source -> ASTDumper JSON -> IR -> AET-Java

## Java Construct Frequency Analysis (26 Test Files)

Analysis of all 26 test files (16 A-group RosettaCode + 10 B-group real-world) to identify
compression targets by frequency and token impact.

| Java Construct | Occurrences | Files | Token Impact | AET-Java Strategy |
|---------------|:-----------:|:-----:|:------------:|-------------------|
| `public class` declaration | 26 | 26 | 2 per occurrence | `@Name{...}` |
| `static class` (nested) | 10+ | 8 | 2 per occurrence | `@Name{...}` (nested=static) |
| `private` keyword | 30+ | 10 | 1 per occurrence | default (omit) |
| `public` keyword | 50+ | 26 | 1 per occurrence | `+` prefix |
| `static` keyword | 40+ | 26 | 1 per occurrence | `$` prefix |
| `final` keyword | 20+ | 8 | 1 per occurrence | `!` prefix |
| `public static void main(...)` | 26 | 26 | 6 per file | `main(){...}` |
| `new ClassName(args)` | 60+ | 20 | 1 per call | `ClassName(args)` |
| `import` statements | 20+ | 8 | 5-7 per import | eliminated |
| `@Override` annotation | 15+ | 4 | 2 per occurrence | auto-detected |
| Generics `<T>` usage | 25+ | 8 | varies | kept `<>` |
| Collection generics | 40+ | 10 | varies | kept, `var` for locals |
| `this.x = x` in constructors | 20+ | 8 | 4 per assignment | auto-constructor |
| Constructor declarations | 12+ | 8 | 8N+4 per ctor (N fields) | auto-generated |
| Enum declarations | 2 | 2 | 1 per enum | `#Name{...}` |
| Record declarations | 4 | 1 | 1 per record | `@Name(...)` |
| Sealed interface | 1 | 1 | 3+ (sealed+permits) | `@Name[+...]` |
| `non-sealed` modifier | 2 | 1 | 3 per occurrence | auto-inferred |
| Switch expression (Java 14+) | 6 | 2 | 3 per switch + 1 per case | eliminate `case`, `()` |
| Lambda expressions | 5+ | 3 | 1 per lambda (-> vs \|) | `{params\|body}` |
| Stream operations | 5+ | 2 | 4+ per chain | pipe syntax |
| Try-catch blocks | 15+ | 7 | 5+ per block | `tc{...}(...)` |
| `throw new ...` | 20+ | 10 | 1 per throw | `throw ...` (no new) |
| For-each loops | 20+ | 15 | 3 per loop | `for(item:col){...}` |
| `instanceof` | 3 | 1 | 1 per occurrence | `is` |
| Pattern matching instanceof | 3 | 1 | 0 (same tokens in context) | `is Type name` |
| `var` keyword | 5 | 3 | 0 (already 1 token) | kept |
| Diamond operator `<>` | 8+ | 5 | 0 | kept |
| Type casting | 10+ | 5 | 0 | kept |
| Method references `::` | 3+ | 2 | 0 | kept |
| Array declarations | 25+ | 12 | 0 | kept |
| Ternary operator | 15+ | 8 | 0 | kept |
| StringBuilder usage | 8+ | 6 | via stdlib alias | `Sb()` |

**Highest-impact targets** (ordered by total token savings across all files):
1. Constructor auto-generation: ~200+ tokens total
2. Import elimination: ~120+ tokens total
3. Access modifier elimination: ~100+ tokens total
4. `main()` special form: ~156 tokens total (6 per file × 26 files)
5. `new` keyword elimination: ~60+ tokens total
6. `@Override` elimination: ~30+ tokens total
7. Switch expression compression: ~30+ tokens total
8. Class wrapper compression: ~72+ tokens total
9. For-each simplification: ~60+ tokens total
10. `var` for local type inference: ~100+ tokens total (estimated)

---

## Design Principles

1. **Tokenizer-aware**: every keyword/operator is a verified cl100k_base single token
2. **Java-optimized**: syntax designed for Java's unique structures, not adapted from Go
3. **Separate parser**: AET-Java parser is independent from AET-Go parser
4. **Shared IR**: both AET-Go and AET-Java compile to the same IR (with language-specific nodes)
5. **Boilerplate annihilation**: class ceremony, constructors, getters/setters, modifiers eliminated
6. **Machine-first**: optimized for LLM token consumption, human-recoverable via transpiler
7. **No comments, no imports**: transpiler auto-resolves all dependencies

## File Format

- Extension: `.aetj`
- First line: `!java-v1` (version marker)
- Statements separated by `;`
- No required whitespace (spaces allowed but not required between tokens)
- No comments
- No import declarations
- No package declarations

---

## Token Verification Table

All keywords and operators verified against cl100k_base. Items marked with * were verified to be multi-token and are NOT used.

| Token | cl100k_base | Usage |
|-------|:-----------:|-------|
| `@` | 1 | class/record/interface declaration |
| `#` | 1 | enum declaration |
| `^` | 1 | return (early return) |
| `?` | 1 | error propagation |
| `?!` | 1 | error wrapping |
| `\|` | 1 | pipe / bitwise OR |
| `:` | 1 | type annotation / for-each separator |
| `;` | 1 | statement separator |
| `->` | 1 | return type / switch case arrow |
| `:=` | 1 | short declaration |
| `=>` | 1 | (reserved) |
| `::` | 1 | method reference |
| `[]` | 1 | array type suffix |
| `<` `>` | 1 each | generic type brackets |
| `+` | 1 | public modifier |
| `-` | 1 | private modifier |
| `~` | 1 | protected modifier |
| `$` | 1 | static modifier |
| `!` | 1 | final modifier |
| `tc` | 1 | try-catch |
| `tw` | 1 | try-with-resources |
| `is` | 1 | instanceof (pattern matching) |
| `var` | 1 | local type inference |
| `for` | 1 | loop |
| `if` | 1 | conditional |
| `else` | 1 | else branch |
| `while` | 1 | while loop |
| `switch` | 1 | switch expression/statement |
| `throw` | 1 | throw exception |
| `this` | 1 | self reference |
| `super` | 1 | parent reference |
| `new` | 1 | explicit new (rarely needed) |
| `null` | 1 | null literal |
| `true` | 1 | boolean literal |
| `false` | 1 | boolean literal |
| `main` | 1 | main method |
| `break` | 1 | break statement |
| `continue` | 1 | continue statement |
| `default` | 1 | default case (or use `_`) |
| `_` | 1 | default case (shorthand) |
| `abs` | 1 | abstract modifier |
| `ord` | 1 | stream sorted (replaces `srt` which is 2 tokens) |
| `flt` | 1 | stream filter |
| `mp` | 1 | stream map |
| `fm` | 1 | stream flatMap |
| `col` | 1 | stream collect |
| `red` | 1 | stream reduce |
| `fe` | 1 | stream forEach |
| **Rejected** | | |
| `instanceof`* | 2 | replaced by `is` |
| `permits`* | 2 | replaced by `+` prefix in interface |
| `srt`* | 2 | replaced by `ord` |
| `non-sealed`* | 3 | auto-inferred from context |

---

## 1. Type Declarations

### 1.1 Class Declaration (`@`)

```
@ClassName{body}
```

**Expands to:**
```java
public class ClassName {
    body
}
```

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `public class Temperature { ... }` | 5+body | `@Temperature{...}` | 3+body | 40% |
| Full class with 2 fields + constructor + getters | 40 | `@Temperature{!double value;!Unit unit}` | 9 | **78%** |

**Rules:**
- Top-level `@Name{...}` -> `public class Name { ... }`
- Nested `@Name{...}` inside another class -> `static class Name { ... }` (default)
- The class body contains field declarations, method declarations, constructors, and nested types

### 1.2 Generic Class

```
@ClassName<T>{body}
@ClassName<K,V>{body}
@ClassName<T:Comparable<T>>{body}
```

- Type parameters in `< >` after class name
- Bounded type: `T:Bound` (`:` means `extends` for type bounds)
- Multiple bounds: `T:Bound1&Bound2` (& for intersection)

**Expands to:**
```java
public class ClassName<T> { body }
public class ClassName<K, V> { body }
public class ClassName<T extends Comparable<T>> { body }
```

### 1.3 Inheritance

```
@Child:Parent{body}                    // extends
@Child[Interface]{body}                // implements
@Child[Iface1,Iface2]{body}           // implements multiple
@Child:Parent[Iface1,Iface2]{body}    // extends + implements
```

- `:Parent` after class name = extends
- `[Iface1,Iface2]` after class name (or after `:Parent`) = implements
- Combined: `@Name:Parent[Iface]{body}`

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `static class DoublyLinkedList<T> implements Iterable<T> { ... }` | 10+ | `@DoublyLinkedList<T>[Iterable<T>]{...}` | 8+ | 20% |
| `static non-sealed class JsonArray implements JsonValue { ... }` | 9+ | `@JsonArray[JsonValue]{...}` | 5+ | **44%** |

### 1.4 Record Declaration (`@(...)`)

```
@RecordName(Type field1,Type field2)
@RecordName(Type field1,Type field2)[Interface]
```

- Parentheses `(...)` after `@Name` = record (vs braces `{...}` for class)
- Parameters use Java order: `Type name`
- Auto-generates: constructor, toString, equals, hashCode, accessors
- Optional `[Interface]` for implements

**Expands to:**
```java
record RecordName(Type field1, Type field2) {}
record RecordName(Type field1, Type field2) implements Interface {}
```

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `record JsonString(String value) implements JsonValue { }` | 11 | `@JsonString(String value)[JsonValue]` | 7 | **36%** |

### 1.5 Enum Declaration (`#`)

```
#EnumName{VALUE1,VALUE2,VALUE3}
```

- `#` replaces `enum` keyword
- Values comma-separated inside braces

**Enum with fields and constructor:**
```
#EnumName{VALUE1(arg1),VALUE2(arg2);Type field;(Type param){body}}
```
- `;` separates enum values from fields/methods
- Constructor and methods follow the `;`

**Expands to:**
```java
enum EnumName { VALUE1, VALUE2, VALUE3 }
```

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `enum Unit { CELSIUS, FAHRENHEIT, KELVIN }` | 17 | `#Unit{CELSIUS,FAHRENHEIT,KELVIN}` | 17 | 0% |
| `enum TokenType { NUMBER, PLUS, MINUS, STAR, SLASH, LPAREN, RPAREN, EOF }` | 19 | `#TokenType{NUMBER,PLUS,MINUS,STAR,SLASH,LPAREN,RPAREN,EOF}` | 18 | 5% |

Note: Enum savings are minimal because enum value names dominate the token count. Savings come from eliminating `enum` keyword (1 token) and whitespace.

### 1.6 Interface Declaration (`@[...]`)

```
@InterfaceName[method1(Type param)->RetType;method2(Type param)]
```

- Square brackets `[...]` after `@Name` = interface
- Method signatures separated by `;`
- Void methods omit `->RetType`

**Expands to:**
```java
public interface InterfaceName {
    RetType method1(Type param);
    void method2(Type param);
}
```

### 1.7 Sealed Interface (`+` permits)

```
@SealedName[+Permitted1,Permitted2,Permitted3]
@SealedName[+Permitted1,Permitted2;method()->RetType]
```

- `+` prefix before the first identifier in `[...]` = sealed interface with permits
- Permitted classes listed after `+`, comma-separated
- `;` separates permits list from method signatures
- Implementing classes are auto-marked as `non-sealed` (no explicit keyword needed)

**Expands to:**
```java
sealed interface SealedName permits Permitted1, Permitted2, Permitted3 {}
sealed interface SealedName permits Permitted1, Permitted2 {
    RetType method();
}
```

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `sealed interface JsonValue permits JsonString, JsonNumber, JsonBool, JsonNull { }` | 18 | `@JsonValue[+JsonString,JsonNumber,JsonBool,JsonNull]` | 16 | 11% |

---

## 2. Access & Other Modifiers

AET-Java replaces verbose Java modifier keywords with single-character prefixes.

### 2.1 Access Modifier Prefixes

| AET-Java | Java | Tokens |
|----------|------|--------|
| (none) | package-private | 0 |
| `+` | `public` | 1 |
| `-` | `private` | 1 |
| `~` | `protected` | 1 |

### 2.2 Other Modifier Prefixes

| AET-Java | Java | Tokens |
|----------|------|--------|
| `$` | `static` | 1 |
| `!` | `final` | 1 |
| `abs` | `abstract` | 1 |

### 2.3 Modifier Combinations

Modifiers stack as prefixes before the declaration:
- `$+` = `public static` (2 tokens vs 2 tokens — same count, shorter text)
- `$!` = `static final`
- `-!` = `private final`

### 2.4 Default Conventions

To maximize token savings, AET-Java uses sensible defaults:

| Context | Default | Override |
|---------|---------|----------|
| Top-level class | `public` | (always public in Java) |
| Nested class | `static` | (all inner classes default to static) |
| Fields | `private` (no modifier needed) | `+` for public, `~` for protected |
| Methods | package-private (no modifier) | `+` for public, `-` for private |
| `main()` | `public static void` | (always this signature) |
| `toString()` matching override | `@Override public` | (auto-detected) |
| `equals()` matching override | `@Override public` | (auto-detected) |
| `hashCode()` matching override | `@Override public` | (auto-detected) |
| `iterator()` from Iterable | `@Override public` | (auto-detected) |

### 2.5 @Override Elimination

The `@Override` annotation is **auto-detected** by the emitter. It is never written in AET-Java.

**Rule:** If a method signature matches a method in a superclass or implemented interface, the emitter adds `@Override`.

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `@Override public String toString() { ... }` | 7 | `+toString()->String{...}` | 5 | 29% |

---

## 3. Field Declarations

Fields are declared inside class bodies using Java-order type notation.

### 3.1 Basic Syntax

```
Type name                    // private field (default)
Type name = expr             // private field with initializer
!Type name                   // private final field
$Type name                   // static field (package-private)
$!Type name = expr           // static final field with initializer
+Type name                   // public field
```

**Separator:** Fields are separated by `;` inside the class body.

### 3.2 Examples

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `private final double value;` | 5 | `!double value` | 3 | **40%** |
| `private final Map<K, V> store = new HashMap<>();` | 14 | `!Map<K,V> store = HashMap<>()` | 9 | **36%** |
| `private static int passed = 0;` | 7 | `$int passed = 0` | 5 | 29% |
| `static final String[] VALUES = {...};` | 8+ | `$!String[] VALUES = {...}` | 6+ | 25% |

### 3.3 Generic Fields

```
List<String> items = ArrayList<>()          // new eliminated
Map<String,JsonValue> fields = LinkedHashMap<>()
```

Note: `new` is eliminated from constructor calls. See Section 6.1.

---

## 4. Method Declarations

Methods are declared inside class bodies.

### 4.1 Basic Syntax

```
name(params){body}                  // void, package-private
name(params)->RetType{body}         // typed return, package-private
+name(params)->RetType{body}        // public
-name(params)->RetType{body}        // private
$name(params)->RetType{body}        // static
$+name(params)->RetType{body}       // public static
```

### 4.2 Parameter Syntax

Parameters use **Java-order** notation (type before name):

```
methodName(Type1 param1, Type2 param2)
```

This saves 1 token per ~4 parameters compared to `name:Type` notation (no `:` separator needed).

When types are inferable or not critical for round-trip, they may be omitted:
```
methodName(param1, param2)
```

### 4.3 Return Type

Return type follows `->` after the parameter list:

```
add(int a, int b)->int{^a+b}
```

Void methods omit `->RetType`:

```
doSomething(int x){body}
```

### 4.4 Examples

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `public static int add(int a, int b) { return a + b; }` | 17 | `$+add(int a,int b)->int{^a+b}` | 12 | **29%** |
| `private double toCelsius() { return value; }` | 10 | `-toCelsius()->double{^value}` | 6 | **40%** |
| `public static void main(String[] args) { ... }` | 10+ | `main(){...}` | 3+ | **70%** |
| `@Override public String toString() { ... }` | 7+ | `+toString()->String{...}` | 5+ | 29% |
| `static boolean approxEqual(double a, double b) { ... }` | 10+ | `$approxEqual(double a,double b)->boolean{...}` | 8+ | 20% |

---

## 5. Constructor Declarations & Auto-Generation

### 5.1 Explicit Constructor Syntax

Inside a class body, a constructor is declared WITHOUT a name (just parameters and body):

```
(Type param1, Type param2){body}
```

This distinguishes constructors from methods (which always have a name).

**Expands to:**
```java
ClassName(Type param1, Type param2) {
    body
}
```

### 5.2 Constructor Chaining

```
(TokenType type){this(type,0)}
```

**Expands to:**
```java
Token(TokenType type) { this(type, 0); }
```

### 5.3 Auto-Constructor Generation

**Rule:** If a class has `!` (final) fields without initializers and no explicit constructor, an all-fields constructor is auto-generated.

```
@Temperature{!double value;!Unit unit}
```

**Auto-generates:**
```java
public class Temperature {
    private final double value;
    private final Unit unit;

    Temperature(double value, Unit unit) {
        this.value = value;
        this.unit = unit;
    }
}
```

**Rules:**
1. `!` (final) fields WITHOUT initializers -> constructor parameters (auto-assigned via `this.x = x`)
2. Fields WITH initializers -> NOT constructor parameters (initialized at declaration)
3. Mutable fields (no `!`) -> NOT constructor parameters (default-initialized)
4. If ANY explicit constructor exists -> no auto-generation

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| Full class: 2 final fields + constructor (all `this.x = x`) | 40 | `@Temperature{!double value;!Unit unit}` | 9 | **78%** |
| Class: 3 fields + constructor + 3 getters + toString | 80+ | `@KVStore{!Map<K,V> store}` | 7 | **91%** |

### 5.4 Auto-Generated Methods (POJO Convention)

For classes with `!` fields and auto-constructor, the emitter ALSO auto-generates:
- **toString()**: returns `ClassName{field1=value1, field2=value2, ...}`
- **equals()**: field-by-field comparison using Objects.equals()
- **hashCode()**: Objects.hash(field1, field2, ...)

If the class provides an explicit `toString()`, `equals()`, or `hashCode()` method, the explicit version takes precedence (no auto-generation for that method).

---

## 6. Expression Optimizations

### 6.1 `new` Keyword Elimination

Constructor calls omit the `new` keyword:

```
Temperature(value, unit)        // -> new Temperature(value, unit)
ArrayList<>()                   // -> new ArrayList<>()
HashMap<>()                     // -> new HashMap<>()
StringBuilder()                 // -> new StringBuilder()
RuntimeException("msg")         // -> new RuntimeException("msg")
Node<>(item)                    // -> new Node<>(item)
```

**Rule:** The emitter adds `new` when:
1. The identifier starts with an uppercase letter, AND
2. It's used in an expression context (not a method call on an existing object), AND
3. It's not a known static method (from stdlib aliases)

For ambiguous cases, explicit `new` can be used:
```
new ClassName(args)             // explicit new when needed
```

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `new Temperature(0, Unit.CELSIUS)` | 8 | `Temperature(0,Unit.CELSIUS)` | 7 | 13% |
| `new ArrayList<>()` | 5 | `ArrayList<>()` | 4 | 20% |
| `throw new RuntimeException("msg")` | 5 | `throw RuntimeException("msg")` | 4 | 20% |

### 6.2 `instanceof` -> `is`

```
expr is Type varName
```

**Expands to:**
```java
expr instanceof Type varName
```

`instanceof` is 2 tokens in cl100k_base; `is` is 1 token. In full-string context, savings may vary (0-1 token depending on surrounding characters).

| Java | Tokens | AET-Java | Tokens |
|------|--------|----------|--------|
| `v instanceof JsonObject obj` | 4 | `v is JsonObject obj` | 4 |

Note: In full-string context, savings are minimal. `is` is used primarily for shorter source text.

### 6.3 `var` Local Type Inference

```
var name = expr
```

Replaces explicit type declarations for local variables with initializers:

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `Temperature t1 = new Temperature(0, Unit.CELSIUS)` | 10 | `var t1 = Temperature(0,Unit.CELSIUS)` | 8 | 20% |
| `Node<T> current = head` | 6 | `var current = head` | 4 | **33%** |
| `List<Map<String, String>> rows = new ArrayList<>()` | 14 | `var rows = ArrayList<>()` | 5 | **64%** |

**When to use `var`:**
- Local variables with initializers where the type is obvious from the RHS
- Especially effective when the type is a long generic type

**When NOT to use `var`:**
- Fields (Java doesn't allow `var` for fields)
- Method parameters (Java doesn't allow `var` for params)
- Variables without initializers

### 6.4 Ternary Operator

Kept as-is (Java syntax):
```
cond ? trueExpr : falseExpr
```

Both `?:` (combined) and `?` + `:` (separate) are single tokens. No changes needed.

### 6.5 Cast Expressions

```
(Type)expr
```

Kept as-is (Java syntax). `(int)`, `(double)`, `(char)` are all 2 tokens in cl100k_base.

### 6.6 Method References

```
Class::method
instance::method
```

Kept as-is. `::` is 1 token in cl100k_base.

---

## 7. Error Handling

### 7.1 `?` Operator (Error Propagation)

```
val := expr?
```

**Expands to:**
```java
Type val;
try {
    val = expr;
} catch (Exception e) {
    throw e;
}
```

### 7.2 `?!` Operator (Error Wrapping)

```
val := expr?!"context message"
```

**Expands to:**
```java
Type val;
try {
    val = expr;
} catch (Exception e) {
    throw new RuntimeException("context message", e);
}
```

### 7.3 `tc` (Try-Catch)

```
tc{body}(ExceptionType e){handler}
```

**Expands to:**
```java
try {
    body
} catch (ExceptionType e) {
    handler
}
```

**Multi-catch:**
```
tc{body}(IOException|SQLException e){handler}
```

**Multiple catch clauses:**
```
tc{body}(TypeA e){handlerA}(TypeB e){handlerB}
```

**With finally:**
```
tc{body}(ExType e){handler}!{finallyBody}
```

- `!{...}` after catch clause(s) = finally block
- `!` prefix chosen because `finally` would be an extra keyword token

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `try { doSomething(); } catch (Exception e) { println(e); }` | 18 | `tc{doSomething()}(Exception e){pl(e)}` | 12 | **33%** |

### 7.4 `tw` (Try-With-Resources)

```
tw(var name = expr){body}(ExType e){handler}
```

**Expands to:**
```java
try (Type name = expr) {
    body
} catch (ExType e) {
    handler
}
```

---

## 8. Control Flow

### 8.1 If/Else

```
if cond{body}
if cond{body}else{body}
if cond{body}else if cond2{body}else{body}
```

Same as AET-Go. No parentheses around condition (saves 2 tokens vs Java).

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `if (x > 0) { ... }` | 8 | `if x>0{...}` | 6 | 25% |

### 8.2 Traditional For Loop

```
for(init;cond;post){body}
```

Same as Java but with AET-Java expression syntax inside.

### 8.3 Enhanced For-Each

```
for(Type item : collection){body}
for(item : collection){body}           // type inferred
```

- Uses `:` to separate variable from iterable (same as Java)
- Type is OPTIONAL — can be omitted when inferable

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `for (double c : values) { System.out.println(c); }` | 14 | `for(c:values){pl(c)}` | 9 | **36%** |

### 8.4 While Loop

```
while cond{body}
```

No parentheses around condition.

### 8.5 Switch Expression

```
switch expr{
    value1->result1;
    value2->result2;
    _->defaultResult
}
```

**Key differences from Java:**
1. No `(` `)` around switch expression (saves 2 tokens)
2. No `case` keyword (saves 1 token per case)
3. `_` for default case (or `default`, both are 1 token)
4. `->` used for case arrows (same as Java, 1 token)
5. `;` separates cases (same as Java)

**Expands to:**
```java
switch (expr) {
    case value1 -> result1;
    case value2 -> result2;
    default -> defaultResult;
}
```

**Switch as expression (assigned to variable):**
```
var result = switch expr{A->val1;B->val2;_->val3}
```

**Switch with block bodies:**
```
switch expr{
    A->{stmt1;stmt2;yield result1};
    B->result2;
    _->result3
}
```

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `switch (unit) { case CELSIUS -> value; case FAHRENHEIT -> expr; case KELVIN -> expr; }` | 51* | `switch unit{CELSIUS->value;FAHRENHEIT->expr;KELVIN->expr}` | 41* | **20%** |

(*token counts for full expressions with arithmetic)

---

## 9. Lambda Expressions

### 9.1 Block Lambda

```
{params|body}
```

- Pipe `|` separates parameter list from body
- Used for multi-statement lambdas and callbacks

**Expands to:**
```java
(params) -> { body }
```

### 9.2 Expression Lambda

```
{param|expr}
```

- If body contains no `;`, emitted as expression lambda

**Expands to:**
```java
param -> expr              // single param
(p1, p2) -> expr          // multiple params
```

### 9.3 Examples

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `x -> x * 2` | 6 | `{x\|x*2}` | 5 | 17% |
| `e -> System.out.println(e)` | 7 | `{e\|pl(e)}` | 6 | 14% |
| `(a, b) -> a + b` | 9 | `{a,b\|a+b}` | 7 | 22% |

---

## 10. Stream Operations (Pipe Syntax)

Stream operations use the pipe `|` operator from AET, emitting Java Stream API calls.

### 10.1 Basic Pipe Operations

```
collection|mp({x|transform})          // .stream().map(x -> transform)
collection|flt({x|condition})         // .stream().filter(x -> condition)
collection|red(init,{a,b|combine})    // .stream().reduce(init, (a,b) -> combine)
collection|ord()                      // .stream().sorted()
collection|ord({a,b|compare})         // .stream().sorted((a,b) -> compare)
collection|fe({x|action})             // .stream().forEach(x -> action)
collection|col()                      // .stream().collect(Collectors.toList())
collection|fm({x|streamExpr})         // .stream().flatMap(x -> streamExpr)
```

### 10.2 Pipe Chaining

```
items|flt({x|x>0})|mp({x|x*2})|col()
```

**Expands to:**
```java
items.stream().filter(x -> x > 0).map(x -> x * 2).collect(Collectors.toList())
```

### 10.3 Stream Alias Table

| AET-Java | Java Stream Method | cl100k_base |
|----------|-------------------|:-----------:|
| `mp` | `.map()` | 1 |
| `flt` | `.filter()` | 1 |
| `red` | `.reduce()` | 1 |
| `ord` | `.sorted()` | 1 |
| `fe` | `.forEach()` | 1 |
| `col` | `.collect(Collectors.toList())` | 1 |
| `fm` | `.flatMap()` | 1 |

---

## 11. Import & Annotation Elimination

### 11.1 Import Elimination

All imports are auto-detected by the transpiler from:
1. **Stdlib alias usage** (from `stdlib-aliases-java.json`)
2. **Type references** (`List` -> `java.util.List`, `Map` -> `java.util.Map`)
3. **Exception types** (`IOException` -> `java.io.IOException`)
4. **Pattern/Regex** (`Pattern` -> `java.util.regex.Pattern`)
5. **Collections** (`ArrayList`, `HashMap`, `LinkedHashMap`, etc.)

**Auto-import rules:**
- `java.lang.*` — never emitted (implicit in Java)
- `java.util.*` — when ANY collection type is used
- `java.util.stream.*` — when stream/pipe operations are used
- Specific imports for less common types

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `import java.util.*;` | 5 | (eliminated) | 0 | **100%** |
| `import java.util.regex.Pattern;` | 7 | (eliminated) | 0 | **100%** |
| 4 import statements | ~24 | (eliminated) | 0 | **100%** |

### 11.2 Annotation Elimination

| Annotation | AET-Java | Rule |
|------------|----------|------|
| `@Override` | eliminated | Auto-detected when method matches superclass/interface |
| `@SuppressWarnings` | eliminated | Informational only |
| `@FunctionalInterface` | eliminated | Informational only |
| Custom annotations | preserved | `#AnnotName(args)` syntax |

---

## 12. Main Method Special Form

```
main(){body}
```

**Expands to:**
```java
public static void main(String[] args) {
    body
}
```

- `args` is implicitly available in the body (resolves to `String[] args` parameter)
- No need for `$+`, `void`, `String[]`, or `args` declaration

| Java | Tokens | AET-Java | Tokens | Saving |
|------|--------|----------|--------|--------|
| `public static void main(String[] args) { System.out.println("hello"); }` | 17 | `main(){pl("hello")}` | 6 | **65%** |

---

## 13. Stdlib Aliases

Existing aliases from `stdlib-aliases-java.json` (30 aliases). All verified as single cl100k_base tokens.

### 13.1 Current Aliases

| Alias | Java Expansion | Package |
|-------|---------------|---------|
| `pl` | `System.out.println` | java.lang |
| `pr` | `System.out.print` | java.lang |
| `pf` | `System.out.printf` | java.lang |
| `sf` | `String.format` | java.lang |
| `Se` | `System.err.println` | java.lang |
| `Sx` | `System.exit` | java.lang |
| `Pi` | `Integer.parseInt` | java.lang |
| `Sv` | `String.valueOf` | java.lang |
| `Mx` | `Math.max` | java.lang |
| `Mn` | `Math.min` | java.lang |
| `Ma` | `Math.abs` | java.lang |
| `Mr` | `Math.random` | java.lang |
| `Cs` | `Collections.sort` | java.util |
| `Al` | `Arrays.asList` | java.util |
| `Ia` | `Arrays.sort` | java.util |
| `Fr` | `Files.readString` | java.nio.file |
| `Fw` | `Files.writeString` | java.nio.file |
| `Fl` | `Files.readAllLines` | java.nio.file |
| `Po` | `Path.of` | java.nio.file |
| `Ls` | `List.of` | java.util |
| `Ms` | `Map.of` | java.util |
| `Ge` | `System.getenv` | java.lang |
| `Tn` | `System.nanoTime` | java.lang |
| `Tm` | `System.currentTimeMillis` | java.lang |
| `Tp` | `Thread.sleep` | java.lang |
| `Ps` | `Pattern.compile` | java.util.regex |
| `Sb` | `new StringBuilder` | java.lang |
| `Oe` | `Optional.empty` | java.util |
| `Oo` | `Optional.of` | java.util |
| `Hc` | `HttpClient.newHttpClient` | java.net.http |

### 13.2 Proposed Additional Aliases for AET-Java

| Alias | Java Expansion | cl100k_base | Package |
|-------|---------------|:-----------:|---------|
| `On` | `Optional.ofNullable` | 1 | java.util |
| `Og` | `Optional.get` | 1 | java.util |
| `Or` | `Optional.orElse` | 1 | java.util |
| `At` | `Arrays.toString` | 1 | java.util |
| `Ac` | `Arrays.copyOf` | 1 | java.util |
| `Oe` | `Objects.equals` | 1 | java.util |
| `Rn` | `Objects.requireNonNull` | 1 | java.util |
| `Oh` | `Objects.hash` | 1 | java.util |

---

## 14. Token Savings Analysis by Construct

### 14.1 Per-Construct Savings

| Java Construct | Typical Java Tokens | AET-Java Tokens | Savings |
|---------------|:-------------------:|:---------------:|:-------:|
| Class wrapper (2 fields + ctor + toString) | 80+ | 9 | **89%** |
| Record declaration | 11 | 7 | **36%** |
| Main method | 17 | 6 | **65%** |
| Private method decl | 11 | 10 | 9% |
| Static public method decl | 26 | 21 | 19% |
| For-each loop | 14 | 9 | **36%** |
| Switch expression (3 cases) | 51 | 41 | 20% |
| Try-catch block | 18 | 12 | **33%** |
| Import statement (each) | 5-7 | 0 | **100%** |
| `new TypeName(args)` | N+1 | N | per-call |
| `@Override public` | 3 | 0 | **100%** |
| `private final` field | 5 | 3 | **40%** |
| Constructor (N fields, all this.x=x) | 8N+4 | 0 | **100%** |

### 14.2 Expected File-Level Savings

Based on analysis of 26 test files:

| File Type | Java Tokens | Expected AET-Java | Expected Saving |
|-----------|:-----------:|:-----------------:|:---------------:|
| Simple algorithm (Factorial, Gcd) | 80-100 | 35-50 | 40-55% |
| Medium algorithm (Caesar, Luhn) | 200-230 | 90-120 | 45-55% |
| Class-heavy (Temperature, Stack) | 400-1000 | 160-450 | 50-60% |
| Complex class hierarchy (JsonLike) | 1300+ | 550-650 | 50-55% |
| Large system (Calculator, LinkedList) | 1800-3100 | 800-1500 | 48-55% |

### 14.3 Aggregate Target

- **Total Java tokens** (26 files): 14,640
- **Target AET-Java tokens**: <= 7,320 (50%)
- **Previous AET tokens** (shared syntax): 10,406 (28.9% saving)
- **Expected improvement**: ~40% reduction of previous AET output

---

## 15. Example Transformations

### 15.1 Simple Algorithm (Gcd.java -> Gcd.aetj)

**Java (79 tokens):**
```java
public class Gcd {
    static int gcd(int a, int b) {
        while (b != 0) {
            int temp = b;
            b = a % b;
            a = temp;
        }
        return a;
    }

    public static void main(String[] args) {
        System.out.println("gcd(12, 8) = " + gcd(12, 8));
        System.out.println("gcd(100, 75) = " + gcd(100, 75));
    }
}
```

**AET-Java (~35 tokens):**
```
!java-v1
@Gcd{$gcd(int a,int b)->int{while b!=0{var temp=b;b=a%b;a=temp};^a}
main(){pl("gcd(12, 8) = "+gcd(12,8));pl("gcd(100, 75) = "+gcd(100,75))}}
```

**Savings: ~56%**

### 15.2 Class with Enum and Switch (b04_celsius.java fragment)

**Java:**
```java
enum Unit { CELSIUS, FAHRENHEIT, KELVIN }

static class Temperature {
    private final double value;
    private final Unit unit;

    Temperature(double value, Unit unit) {
        this.value = value;
        this.unit = unit;
    }

    private double toCelsius() {
        return switch (unit) {
            case CELSIUS -> value;
            case FAHRENHEIT -> (value - 32.0) * 5.0 / 9.0;
            case KELVIN -> value - 273.15;
        };
    }

    Temperature convertTo(Unit target) {
        double celsius = toCelsius();
        double result = switch (target) {
            case CELSIUS -> celsius;
            case FAHRENHEIT -> celsius * 9.0 / 5.0 + 32.0;
            case KELVIN -> celsius + 273.15;
        };
        return new Temperature(result, target);
    }

    @Override
    public String toString() {
        String symbol = switch (unit) {
            case CELSIUS -> "C";
            case FAHRENHEIT -> "F";
            case KELVIN -> "K";
        };
        return String.format("%.2f %s", value, symbol);
    }
}
```

**AET-Java:**
```
#Unit{CELSIUS,FAHRENHEIT,KELVIN}
@Temperature{!double value;!Unit unit;
-toCelsius()->double{^switch unit{CELSIUS->value;FAHRENHEIT->(value-32.0)*5.0/9.0;KELVIN->value-273.15}}
convertTo(Unit target)->Temperature{var celsius=toCelsius();var result=switch target{CELSIUS->celsius;FAHRENHEIT->celsius*9.0/5.0+32.0;KELVIN->celsius+273.15};^Temperature(result,target)}
+toString()->String{var symbol=switch unit{CELSIUS->"C";FAHRENHEIT->"F";KELVIN->"K"};^sf("%.2f %s",value,symbol)}}
```

**Key savings:**
- `enum Unit { ... }` -> `#Unit{...}` (1 token)
- `static class Temperature { ... }` -> `@Temperature{...}` (2 tokens)
- `private final double value/unit` -> `!double value;!Unit unit` (4 tokens)
- Constructor auto-generated (19 tokens saved)
- `return switch (unit) { case X -> ...` -> `^switch unit{X->...` (3 tokens per switch)
- `@Override public String toString()` -> `+toString()->String` (2 tokens)
- `new Temperature(result, target)` -> `Temperature(result,target)` (1 token)
- `String.format(...)` -> `sf(...)` (2 tokens)

### 15.3 Sealed Interface with Records (b07_jsonlike.java fragment)

**Java:**
```java
sealed interface JsonValue permits JsonString, JsonNumber, JsonBool, JsonNull, JsonArray, JsonObject {}

record JsonString(String value) implements JsonValue {
    @Override public String toString() { return "\"" + escapeString(value) + "\""; }
    static String escapeString(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\t", "\\t");
    }
}

record JsonNumber(double value) implements JsonValue {
    @Override public String toString() { ... }
}

record JsonBool(boolean value) implements JsonValue {
    @Override public String toString() { return String.valueOf(value); }
}

record JsonNull() implements JsonValue {
    @Override public String toString() { return "null"; }
}
```

**AET-Java:**
```
@JsonValue[+JsonString,JsonNumber,JsonBool,JsonNull,JsonArray,JsonObject]
@JsonString(String value)[JsonValue]{
+toString()->String{^"\""+escapeString(value)+"\""}
$escapeString(String s)->String{^s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\t","\\t")}}
@JsonNumber(double value)[JsonValue]{
+toString()->String{if value==Math.floor(value)&&!Double.isInfinite(value){^Sv((long)value)};^Sv(value)}}
@JsonBool(boolean value)[JsonValue]{+toString()->String{^Sv(value)}}
@JsonNull()[JsonValue]{+toString()->String{^"null"}}
```

### 15.4 Generic Class with Generics (b10_linkedlist.java fragment)

**Java:**
```java
static class DoublyLinkedList<T> implements Iterable<T> {
    private static class Node<T> {
        T data;
        Node<T> prev;
        Node<T> next;
        Node(T data) { this.data = data; }
    }

    private Node<T> head;
    private Node<T> tail;
    private int size;

    void add(T item) {
        Node<T> node = new Node<>(item);
        if (tail == null) {
            head = tail = node;
        } else {
            tail.next = node;
            node.prev = tail;
            tail = node;
        }
        size++;
    }
    ...
}
```

**AET-Java:**
```
@DoublyLinkedList<T>[Iterable<T>]{
@Node<T>{T data;Node<T> prev;Node<T> next;(T data){this.data=data}}
Node<T> head;Node<T> tail;int size;
add(T item){var node=Node<>(item);if tail==null{head=tail=node}else{tail.next=node;node.prev=tail;tail=node};size++}
...}
```

**Key savings:**
- `static class DoublyLinkedList<T> implements Iterable<T>` -> `@DoublyLinkedList<T>[Iterable<T>]` (4 tokens)
- `private static class Node<T>` -> `@Node<T>` (3 tokens)
- `Node<T> node = new Node<>(item)` -> `var node=Node<>(item)` (3 tokens)
- Multiple `private` field modifiers eliminated
- `if (tail == null)` -> `if tail==null` (2 tokens per if)

---

## 16. IR Integration

### 16.1 Architecture

```
AET-Java (.aetj)  -->  [Java Parser]    -->  IR  -->  [Java Emitter]  -->  Java (.java)
Java (.java)       -->  [ASTDumper.java] -->  IR  -->  [Java Reverse]  -->  AET-Java (.aetj)
```

### 16.2 Java-Specific IR Nodes

The following IR nodes are used exclusively by the Java parser/emitter:

**Statement Nodes:**
- `Java_ClassDecl` — class with modifiers, fields, methods, constructors, inner classes
- `Java_TryCatch` — try-catch-finally with optional resources
- `Java_EnhancedFor` — for-each loop
- `Java_ThrowStmt` — throw statement

**Expression Nodes:**
- `Java_NewExpr` — new constructor calls
- `Java_LambdaExpr` — lambda expressions
- `Java_InstanceofExpr` — instanceof checks
- `Java_CastExpr` — type casts
- `Java_TernaryExpr` — ternary conditional

### 16.3 New IR Nodes Required

The following new IR nodes are needed for AET-Java:

- `Java_RecordDecl` — record declarations (name, fields, implements, methods)
- `Java_EnumDecl` — enum declarations (name, values, fields, methods)
- `Java_SealedInterfaceDecl` — sealed interface (name, permits, methods)
- `Java_SwitchExpr` — switch expression (tag, cases with arrow syntax)
- `Java_PatternInstanceof` — instanceof with pattern binding (expr, type, binding var)

### 16.4 CLI Integration

```
aet convert input.java           # Java -> AET-Java (.aetj)
aet convert input.java -o out.aetj
aet compile input.aetj --java    # AET-Java -> Java
aet compile input.aetj -o out.java
aet stats input.java             # Show token savings
aet diff a.aetj b.aetj           # AST diff
```

**Auto-detection rules:**
- `.java` input -> use Java ASTDumper + Java reverse parser
- `.aetj` input -> use AET-Java parser + Java emitter
- `.aet` input -> use AET-Go parser (backwards compatible)
- `.go` input -> use Go parser + Go reverse parser
- First line `!java-v1` -> AET-Java syntax
- First line `!v3` / `!v2` / `!v1` -> AET-Go syntax

---

## 17. Round-Trip Guarantees

### 17.1 Core Syntax (100% round-trip)

The following constructs MUST round-trip perfectly (Java -> AET-Java -> Java -> compile -> same behavior):

- Class declarations with fields and methods
- Record declarations
- Enum declarations
- Interface declarations
- Sealed interfaces with permits
- Generic types and type parameters
- Constructor declarations
- Switch expressions (arrow syntax)
- Lambda expressions
- Enhanced for-each loops
- Try-catch-finally blocks
- All access modifiers (public/private/protected/static/final)
- All operators and expressions
- All control flow (if/else, for, while, switch, break, continue)
- String literals, numeric literals, boolean literals
- Array declarations and access
- Type casting
- Method references (::)

### 17.2 Edge Cases (>= 99.9% round-trip)

- Complex nested generic types (`Map<String, List<Map<Integer, Set<String>>>>`)
- Multiple constructor overloads with chaining
- Enum with abstract methods and per-constant implementations
- Anonymous inner classes
- Complex lambda body with nested lambdas
- Switch expression with block cases and yield
- Try-with-resources with multiple resources
- Pattern matching in switch (Java 21+)

### 17.3 AST-Level Comparison

Round-trip correctness is verified at the AST level, not source text level:
- Whitespace differences are ignored
- Comment differences are ignored (AET has no comments)
- Import order differences are ignored (auto-resolved)
- Semantically equivalent transformations are allowed (e.g., `var` -> explicit type)

---

## 18. Performance Requirements

- **Transpile speed**: 1000 lines Java / 1 second (10x runs averaged)
- **Round-trip overhead**: <= +10% vs native Java compilation
- **Token counting**: exact cl100k_base counts using tiktoken

---

## Appendix A: Complete Grammar (EBNF-like)

```
program         = "!java-v1" ";" topDecl*
topDecl         = classDecl | recordDecl | enumDecl | interfaceDecl | funcDecl

classDecl       = modifiers "@" IDENT typeParams? inheritance? "{" classBody "}"
recordDecl      = modifiers "@" IDENT "(" paramList ")" implements? recordBody?
enumDecl        = modifiers "#" IDENT "{" enumValues (";" classBody)? "}"
interfaceDecl   = modifiers "@" IDENT typeParams? "[" interfaceBody "]"

modifiers       = ("+" | "-" | "~" | "$" | "!" | "abs")*
typeParams      = "<" typeParam ("," typeParam)* ">"
typeParam       = IDENT (":" type ("&" type)*)?
inheritance     = (":" type)? ("[" type ("," type)* "]")?
implements      = "[" type ("," type)* "]"

classBody       = (fieldDecl | methodDecl | ctorDecl | classDecl | enumDecl | recordDecl)*
fieldDecl       = modifiers type IDENT ("=" expr)? ";"?
methodDecl      = modifiers IDENT "(" paramList ")" ("->" type)? block
ctorDecl        = modifiers "(" paramList ")" block
paramList       = (type IDENT ("," type IDENT)*)?

interfaceBody   = (sealedPermits ";" )? (methodSig (";" methodSig)*)?
sealedPermits   = "+" IDENT ("," IDENT)*
methodSig       = IDENT "(" paramList ")" ("->" type)?

enumValues      = IDENT ("(" exprList ")")? ("," IDENT ("(" exprList ")")?)*

block           = "{" stmt* "}"
stmt            = ifStmt | forStmt | whileStmt | switchExpr | tryCatch | tryWith
                | throwStmt | returnStmt | breakStmt | continueStmt
                | varDecl | assignStmt | exprStmt | block
                | ";"

ifStmt          = "if" expr block ("else" (ifStmt | block))?
forStmt         = "for" "(" (forInit ";" expr? ";" forPost | type? IDENT ":" expr) ")" block
whileStmt       = "while" expr block
switchExpr      = "switch" expr "{" switchCase (";" switchCase)* "}"
switchCase      = (exprList | "_" | "default") "->" (expr | block)
tryCatch        = "tc" block catchClause+ finallyClause?
tryWith         = "tw" "(" resourceDecl ")" block catchClause* finallyClause?
catchClause     = "(" type ("|" type)* IDENT ")" block
finallyClause   = "!" block
throwStmt       = "throw" expr
returnStmt      = "^" expr?
varDecl         = "var" IDENT "=" expr

expr            = ternary | binary | unary | primary | lambda | pipeExpr
ternary         = expr "?" expr ":" expr
binary          = expr binOp expr
unary           = unaryOp expr
primary         = literal | IDENT | callExpr | selectorExpr | indexExpr
                | castExpr | instanceofExpr | "(" expr ")" | switchExpr | newExpr
lambda          = "{" paramNames "|" (expr | stmt*) "}"
pipeExpr        = expr "|" pipeOp "(" exprList ")"
pipeOp          = "mp" | "flt" | "red" | "ord" | "fe" | "col" | "fm"

callExpr        = expr "(" exprList? ")"
selectorExpr    = expr "." IDENT
indexExpr       = expr "[" expr "]"
castExpr        = "(" type ")" expr
instanceofExpr  = expr "is" type IDENT?
newExpr         = "new" type "(" exprList? ")"   // explicit new (rarely needed)

type            = primitiveType | IDENT typeArgs? arrayDims?
                | type "<" typeList ">" arrayDims?
primitiveType   = "int" | "long" | "double" | "float" | "boolean" | "char" | "byte" | "short"
typeArgs        = "<" (type | "?" (":" type)? ("^" type)?) ("," ...)* ">"
arrayDims       = "[]"+

literal         = INT | FLOAT | STRING | CHAR | "true" | "false" | "null"
```

---

## Appendix B: File Naming Convention

| Extension | Language | Version Marker | Parser |
|-----------|----------|----------------|--------|
| `.aet` | Go (legacy) | `!v3` / `!v2` / `!v1` | AET-Go parser |
| `.aetg` | Go (explicit) | `!go-v1` | AET-Go parser |
| `.aetj` | Java | `!java-v1` | AET-Java parser |

Legacy `.aet` files without a language-specific version marker are treated as AET-Go for backwards compatibility.

---

## Appendix C: Comparison with Previous Shared AET

| Feature | Previous (shared AET) | New (AET-Java) | Improvement |
|---------|:---------------------:|:--------------:|:-----------:|
| Average savings | 28.9% | 50%+ target | +21% |
| Class boilerplate | basic struct->class | full auto-gen | major |
| Access modifiers | kept verbose | single-char | major |
| `new` keyword | kept | eliminated | minor |
| Constructors | manual | auto-generated | **major** |
| Getters/setters | manual | auto-generated | **major** |
| Switch expression | Go-style | Java-native | medium |
| Generics | limited | full support | **major** |
| Enum | not supported | `#` syntax | medium |
| Record | not supported | `@(...)` syntax | medium |
| Sealed interface | not supported | `@[+...]` syntax | medium |
| Pattern matching | not supported | `is` keyword | minor |
| Parameter syntax | `name:type` | `type name` (Java-order) | minor |
| Imports | eliminated | eliminated | same |
| Stdlib aliases | 30 | 30+ expanded | minor |
