# AET-TypeScript v1 Syntax Specification

**Version**: 1.0
**Tokenizer**: cl100k_base (GPT-4 / Claude compatible)
**File Extensions**: `.aets` (.ts) / `.aetx` (.tsx)
**Version Markers**: `!ts-v1` (first line, plain) / `!tsx-v1` (first line, JSX-enabled)
**Target**: >= 30% token savings (React components), >= 40% (algorithmic / backend)

## Design Principles

1. **Tokenizer-aware**: every keyword/operator verified as a single cl100k_base token.
2. **Eliminate, do not rename**: most TS keywords are already single tokens, so compression comes from positional elimination (drop `function`, `const`, `let`, `var`, `interface`, etc.).
3. **Types optional by default**: inferrable type annotations are dropped; `--typed` flag restores public API signatures.
4. **No imports**: transpiler resolves all external dependencies from alias map + usage.
5. **No JSX attribute renaming**: cl100k_base pre-merges `className`, `onClick`, etc. Rewriting them breaks BPE and hurts compression.
6. **Round-trippable**: parse back to AST produces the same semantic structure.
7. **Internal parser**: uses `ts.createSourceFile` — no external compiler binary required.

## File Structure

```
!ts-v1
<top-level declarations>
```

or

```
!tsx-v1
<top-level declarations>
```

Top-level elements: interface/type/class/enum declarations, function declarations, const/let/var declarations, expression statements. No imports, no comments.

Statements separated by `;` or newline. Whitespace is not significant.

---

## Section 1: Token Verification Table

Every symbol is validated against cl100k_base. Rejected tokens (multi-token) are listed at the bottom.

| Token | cl100k_base | Usage |
|-------|:-----------:|-------|
| `@` | 1 | class / interface declaration marker |
| `=` | 1 | type alias prefix / assignment |
| `#` | 1 | enum declaration marker |
| `+` | 1 | public / export modifier |
| `-` | 1 | private modifier |
| `~` | 1 | protected modifier |
| `$` | 1 | static modifier |
| `!` | 1 | readonly modifier |
| `^` | 1 | return / override |
| `->` | 1 | return type / arrow body |
| `=>` | 1 | arrow function (preserved from TS) |
| `:=` | 1 | const/let declaration |
| `:` | 1 | extends / type annotation / ternary |
| `?` | 1 | optional / ternary |
| `?.` | 1 | optional chaining |
| `??` | 1 | nullish coalescing |
| `...` | 1 | spread / rest |
| `\|` | 1 | union type / bitwise OR |
| `&` | 1 | intersection type / bitwise AND |
| `as` | 1 | type assertion |
| `is` | 1 | type guard / instanceof |
| `in` | 1 | for-in / mapped type |
| `of` | 1 | for-of |
| `new` | 1 | constructor call |
| `this` | 1 | self reference |
| `super` | 1 | parent reference |
| `null` | 1 | null literal |
| `true` | 1 | boolean literal |
| `false` | 1 | boolean literal |
| `async` | 1 | async function |
| `await` | 1 | await expression |
| `yield` | 1 | yield expression |
| `if` | 1 | conditional |
| `else` | 1 | else branch |
| `for` | 1 | loop |
| `while` | 1 | while loop |
| `do` | 1 | do-while loop |
| `switch` | 1 | switch statement |
| `case` | 1 | switch case |
| `default` | 1 | default case |
| `break` | 1 | break statement |
| `continue` | 1 | continue statement |
| `try` | 1 | try block |
| `catch` | 1 | catch clause |
| `finally` | 1 | finally clause |
| `throw` | 1 | throw statement |
| `return` | 1 | return statement |
| `void` | 1 | void type / operator |
| `typeof` | 1 | typeof type operator |
| `ko` | 1 | `keyof` (replaces 2-token `keyof`) |
| `sat` | 1 | `satisfies` (replaces 3-token bare form) |
| `ac` | 1 | `as const` (replaces 2-token form) |
| `dc` | 1 | `declare` |
| `ns` | 1 | `namespace` |
| `ab` | 1 | `abstract` |
| **Type aliases (positional)** | | |
| `s` | 1 | `string` |
| `n` | 1 | `number` |
| `b` | 1 | `boolean` |
| `v` | 1 | `void` |
| `u` | 1 | `undefined` |
| `A` | 1 | `any` |
| `uk` | 1 | `unknown` |
| `nv` | 1 | `never` |
| `bi` | 1 | `bigint` |
| `sy` | 1 | `symbol` |
| **Utility type aliases** | | |
| `RA` | 1 | `ReadonlyArray` (saves 2) |
| `NN` | 1 | `NonNullable` (saves 1) |
| `Ro` | 1 | `Readonly` (saves 1) |
| `Om` | 1 | `Omit` (saves 1) |
| `Aw` | 1 | `Awaited` (saves 1) |
| `WM` | 1 | `WeakMap` (saves 1) |
| `WS` | 1 | `WeakSet` (saves 1) |
| `FC` | 1 | `React.FC` / `FunctionComponent` (saves 1) |
| `RN` | 1 | `ReactNode` (saves 1) |
| `JE` | 1 | `JSX.Element` (saves 2) |
| **Stdlib alias heads** | | |
| `pl` | 1 | `console.log` |
| `Se` | 1 | `console.error` |
| `cw` | 1 | `console.warn` |
| `ci` | 1 | `console.info` |
| `cd` | 1 | `console.debug` |
| `jd` | 1 | `JSON.stringify` |
| `jl` | 1 | `JSON.parse` |
| `Ok` | 1 | `Object.keys` |
| `Of` | 1 | `Object.freeze` |
| `Af` | 1 | `Array.from` |
| `Ai` | 1 | `Array.isArray` |
| `Ma` | 1 | `Math.abs` |
| `Mc` | 1 | `Math.ceil` |
| `Mr` | 1 | `Math.round` |
| `Ms` | 1 | `Math.sqrt` |
| `Mp` | 1 | `Math.pow` |
| `Pas` | 1 | `Promise.allSettled` (saves 4) |
| `Pal` | 1 | `Promise.all` (saves 1) |
| `Pr` | 1 | `Promise.resolve` (saves 1) |
| `Pan` | 1 | `Promise.any` (saves 1) |
| `rf` | 1 | `fs.readFileSync` |
| `wf` | 1 | `fs.writeFileSync` |
| `ef` | 1 | `fs.existsSync` |
| `rd` | 1 | `fs.readdirSync` (saves 2) |
| `pj` | 1 | `path.join` |
| `pres` | 1 | `path.resolve` |
| `pb` | 1 | `path.basename` |
| `pd` | 1 | `path.dirname` |
| `pe` | 1 | `path.extname` (saves 2) |
| `ue` | 1 | `useEffect` |
| `uC` | 1 | `useCallback` |

**Rejected (do not use)**:
- `keyof`* (2 tokens when alone)
- `satisfies`* (3 tokens when alone)
- `Record` / `Partial` / `Pick` / `Promise` / `Array` / `Map` / `Set` — already single tokens, aliasing reduces or breaks merging
- `className` / `onClick` / `onChange` / `onSubmit` — cl100k_base pre-merges with leading space; renaming hurts
- `Math.max` / `Math.min` / `Math.floor` — candidate 2-char aliases are also 2 tokens

---

## Section 2: Interface Declaration

```
@Name{field:type;method():type;...}
```

Expands to:
```ts
interface Name { field: type; method(): type; ... }
```

### Simple
```
@User{id:n;name:s;email:s}
```
→
```ts
interface User {
  id: number;
  name: string;
  email: string;
}
```

### Optional fields
```
@Props{onClick?:()->v;children?:RN}
```
→
```ts
interface Props {
  onClick?: () => void;
  children?: ReactNode;
}
```

### Readonly fields
```
@Point{!x:n;!y:n}
```
→
```ts
interface Point {
  readonly x: number;
  readonly y: number;
}
```

### Generic
```
@Box<T>{value:T;map<U>(fn:(x:T)->U)->Box<U>}
```

### Extends
```
@Admin:User{role:s}
@Admin:User,Timestamped{role:s}
```

### Index signature
```
@Dict{[k:s]:A}
```
→
```ts
interface Dict { [k: string]: any; }
```

### Exported
```
+@User{id:n}
```
→
```ts
export interface User { id: number; }
```

---

## Section 3: Type Alias

```
=Name=TypeExpr
```

### Simple
```
=ID=s|n
```
→ `type ID = string | number;`

### Generic
```
=Callback<T>=(err:E|null,data:T)->v
```

### Union
```
=Status="pending"|"ok"|"fail"
```

### Conditional
```
=If<C,T,F>=C:true?T:F
```
→ `type If<C, T, F> = C extends true ? T : F;`

### Mapped
```
=Ro<T>={![P in ko T]:T[P]}
```
→ `type Readonly<T> = { readonly [P in keyof T]: T[P] };`

### Exported
```
+=ID=s|n
```

---

## Section 4: Function Declaration

The `function` keyword is **eliminated**. A top-level `name(params){body}` is recognized as a function declaration. The `return` keyword is replaced with `^`.

### Basic
```
greet(name){^"hi "+name}
```
→
```ts
function greet(name) {
  return "hi " + name;
}
```

### Typed (when type cannot be inferred)
```
greet(name:s)->s{^"hi "+name}
```

### Async
```
a fetchUser(id:n)->Pr<User>{^w api.get(id)}
```
→
```ts
async function fetchUser(id: number): Promise<User> {
  return await api.get(id);
}
```

- `a` prefix on a function declaration or arrow function marks it `async`.
- `w` prefix on an expression marks it `await`.

### Generic
```
map<T,U>(xs:T[],f:(x:T)->U)->U[]{^xs.map(f)}
```

### Exported
```
+greet(name){^"hi "+name}
+d App(){^<div/>}
```

`+` = `export`, `+d` = `export default`.

### Declare (ambient)
```
dc f log(msg:s)->v
```

`dc` is single-token shorthand for `declare`.

---

## Section 5: Variable Declaration

```
:=name=value
:=name:type=value
```

The keyword `const` is default. `let` and `var` are spelled out when mutability matters.

```
:=count=0
:=[a,b]=pair
:={x,y}=point
let mutable=1
```

→
```ts
const count = 0;
const [a, b] = pair;
const { x, y } = point;
let mutable = 1;
```

### Exported
```
+:=PI=3.14
```

---

## Section 6: Arrow Functions

Same `->` return type / `=>` body syntax as TypeScript.

```
add=(a,b)=>a+b
:=add=(a,b)=>a+b
:=add=(a:n,b:n)->n=>a+b
```

### Async arrow
```
:=fetchData=a ()=>{^w fetch(url)}
```

### Block body
```
:=handler=(e)=>{pl(e);^e.value}
```

---

## Section 7: Class Declaration

```
@Name{members}
@Name:Parent{members}
@Name:Parent[Iface1,Iface2]{members}
```

### Modifiers (prefix)
- `+` public (default, rarely needed)
- `-` private
- `~` protected
- `$` static
- `!` readonly
- `^` override
- `ab` abstract

### Field
```
@User{-id:n;+name:s;$!MAX=100}
```
→
```ts
class User {
  private id: number;
  public name: string;
  static readonly MAX = 100;
}
```

### Constructor
```
@User{init(id:n,name:s){.id=id;.name=name}}
```

`init` is the special name for constructor (same convention as AET-Python).

### Constructor auto-field shorthand (TS constructor parameter properties)
```
@User{init(-id:n,+name:s)}
```
→
```ts
class User {
  constructor(private id: number, public name: string) {}
}
```

### Method
```
@Circle{init(r:n){.r=r};area()->n{^3.14*.r**2}}
```

Inside methods, `.name` means `this.name`. (Same convention as AET-Python.)

### Abstract
```
ab @Shape{ab area()->n}
```

### Exported
```
+@User{id:n;name:s}
+d @App{render(){^<div/>}}
```

### Generic class
```
@Box<T>{init(value:T){.value=value};get()->T{^.value}}
```

### Decorator
```
@Injectable() @UserService{...}
```

Decorators appear before the `@Name{}` declaration.

---

## Section 8: Enum

```
#Color{RED,GREEN,BLUE}
#Status{ACTIVE=1,INACTIVE=0}
```

### Const enum
```
cn #Color{RED,GREEN,BLUE}
```

---

## Section 9: Control Flow

### If / else
```
if cond{body}
if cond{body}else{body}
if cond{body}else if cond{body}else{body}
```

Braces are required (unlike TS, which allows single-statement bodies without braces).

### For
```
for :=i=0;i<10;i++{body}
for x of items{body}
for k in obj{body}
for a x of stream{body}     // for await ... of
```

### While / do-while
```
while cond{body}
do{body}while cond
```

### Switch
```
switch tag{
  case 1:body1;
  case 2:body2;
  _:default_body
}
```

`_` = default case (same as AET-Java convention).

### Try / catch / finally
```
try{body}catch e{handler}
try{body}catch e:E{handler}finally{cleanup}
```

### Throw
```
throw E("bad value")
```

`new` is elided before class calls that start with an uppercase letter.

---

## Section 10: Expressions

### Operators (unchanged from TS)
```
+ - * / % ** == != === !== < > <= >= && || ?? ?. ! & | ^ << >> >>> ~
```

### Ternary
```
cond?a:b
```

### Object literal (unchanged)
```
{a:1,b:2,...rest}
```

### Array literal (unchanged)
```
[1,2,3,...more]
```

### Template literal (unchanged)
```
`Hello, ${name}!`
```

### Type assertion
```
x as User
x as const       // written as x ac
```

### Satisfies
```
config sat Config
```

### Non-null assertion
```
user!
```

### Optional chaining
```
user?.profile?.name
```

### await / yield
```
^w fetch(url)
yield value
yield* iter
```

---

## Section 11: JSX (`.aetx` only)

JSX is kept **near-verbatim** from TypeScript. The only compressions are:

1. **Self-closing form preferred** — `<Tag/>` when empty.
2. **Tag name inference for closing tag** — if the open tag matches, closing tag can use `</>` to mean "close whatever was opened" (disabled by default for safety; enabled with `!tsx-v1-agg` marker in future).
3. **No attribute renaming** — `className`, `onClick`, etc. kept verbatim (they are pre-merged tokens).

### Example
```
Button:FC<Props>=({onClick,children})=><button onClick={onClick}>{children}</button>
```

### Fragment
```
<>
  <Header/>
  <Main/>
</>
```

### Expression children
```
<ul>{items.map(x=>( <li key={x.id}>{x.name}</li> ))}</ul>
```

---

## Section 12: Decorators

Decorators are preserved verbatim (they already compress well).

```
@Injectable() +@UserService{
  init(-api:ApiClient){}
  getUser(id:s)->Pr<User>{^.api.get(`/users/${id}`)}
}
```

---

## Section 13: Imports Eliminated

All `import`/`export ... from` statements are **removed** during conversion. The transpiler auto-resolves dependencies at emit time using:

1. The stdlib alias map (`stdlib-aliases-typescript.json`) — provides the original module + named import for each alias.
2. Known global names (`console`, `JSON`, `Math`, `Object`, `Array`, `Promise`) — no import needed.
3. React hooks and types — auto-imported from `"react"` when used.
4. Node builtins — `fs`, `path`, `os`, `process` — auto-imported when used.

User-defined imports (from local paths or unknown packages) are captured during `aet convert` and stored in the file header as a hint line:
```
!ts-v1
!r:./utils:parseData,formatDate
@Config{...}
```

`!r:` lines are parsed as "required imports" and emitted back as `import { parseData, formatDate } from "./utils";`.

---

## Section 14: Type Annotation Elimination Rules

On TS → AET-TS conversion, type annotations are erased in the following positions (restored only with `--typed`):

| Position | Default | `--typed` |
|----------|---------|-----------|
| Local `const`/`let`/`var` type | **Erased** | Kept |
| Arrow function params (when used as value) | **Erased** | Kept |
| Function return type (when body has a single `return`) | **Erased** | Kept |
| Function/method params (named function / method) | **Kept** | Kept |
| Interface / type alias bodies | **Kept** | Kept |
| Generic type parameters | **Kept** | Kept |
| Class field types | **Kept** | Kept |
| `export` function signatures | **Kept** | Kept |

---

## Section 15: Round-Trip Guarantees

1. `AET-TS → TS source` is always syntactically valid TypeScript.
2. `TS source → AET-TS → TS source → parse` produces the same AST structure (modulo comments and docstrings, which are dropped).
3. `--typed` mode additionally preserves public API type annotations in the reverse direction.
4. Imports are restored based on alias usage; missing imports can be hinted via `!r:` lines.
5. Comments are dropped. Attribute order in JSX elements is preserved.

---

## Section 16: Comparison with Other AET Variants

| Feature | AET-Go | AET-Java | AET-Python | **AET-TS** |
|---------|--------|----------|------------|------------|
| `@Name{}` decl | struct/interface | class | — | interface/class |
| `=Name=` decl | type alias | — | — | type alias |
| `#Name{}` decl | — | enum | — | enum |
| `^` | return | return | return | return |
| `->` | return type | return type | return type | return type |
| `:=` | short decl | — | — | const/let |
| `+`/`-`/`~`/`$`/`!` | — | pub/priv/prot/static/final | — | pub/priv/prot/static/readonly |
| `init` | — | — | `__init__` | constructor |
| `.attr` inside method | — | — | self.attr | this.attr |
| Imports | eliminated | eliminated | eliminated | eliminated |
| External parser | `go/parser` (CGO) | `javac ASTDumper` | `python3 ast_dumper` | **`ts.createSourceFile` (bundled)** |

---

## Section 17: Sample Comparisons (measured with cl100k_base)

### Algorithm
```ts
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
```
= **27 tokens**

```
fibonacci(n){if n<=1{^n};^fibonacci(n-1)+fibonacci(n-2)}
```
= **17 tokens** → **37% saved**

### Interface
```ts
interface User { id: number; name: string; email: string; }
```
= **12 tokens** → `@User{id:n;name:s;email:s}` = **8 tokens** → **33% saved**

### React component
```ts
const Button: React.FC<Props> = ({ onClick, children }) => {
  return <button onClick={onClick}>{children}</button>;
};
```
= **27 tokens** → `Button:FC<Props>=({onClick,children})=><button onClick={onClick}>{children}</button>` = **23 tokens** → **15% saved**

### Express route
```ts
app.get('/users/:id', async (req: Request, res: Response) => {
  const user = await db.findUser(req.params.id);
  res.json(user);
});
```
= **35 tokens** → `ag('/users/:id',a(q,rs)=>{:=user=w db.findUser(q.params.id);rs.json(user)})` = **28 tokens** → **20% saved**

Overall target: **30-45% for typical TypeScript files**.
