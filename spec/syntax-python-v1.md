# AET-Python v1 Syntax Specification

**Version**: 1.0
**Tokenizer**: cl100k_base (GPT-4 / Claude compatible)
**File Extension**: `.aetp`
**Version Marker**: `!py-v1` (first line)
**Target**: ≥40% token savings (algorithmic), ≥55% (boilerplate-heavy)

## Design Principles

1. **Tokenizer-aware**: Every keyword/operator verified as single cl100k_base token
2. **Python-optimized**: Syntax designed for Python's unique structures (indentation, self, dunder methods, docstrings, type hints)
3. **Braces replace indentation**: `{}` for scope, `;` for statement separation
4. **Self eliminated**: `.attr` for instance access, no `self` in parameter lists
5. **Docstrings eliminated**: AI reads code, not documentation
6. **Type hints eliminated by default**: `--typed` flag restores shortened form
7. **Imports eliminated**: Transpiler auto-resolves from usage + alias map
8. **Comments eliminated**: AI reads code directly

## Section 1: File Structure

```
!py-v1
<top-level declarations and statements>
```

Top-level elements: class declarations, function definitions, assignments, expressions, `@main{}` blocks.

No imports, no docstrings, no comments — all auto-resolved or eliminated.

## Section 2: Function Definitions

### Basic Function
```
# Python: def greet(name):
#             return f"Hello, {name}!"
greet(name){^f"Hello, {name}!"}
```

### With Return Value
```
# Python: def add(a, b):
#             return a + b
add(a,b){^a+b}
```

### Multi-statement
```
# Python: def process(data):
#             result = transform(data)
#             save(result)
#             return result
process(data){result=transform(data);save(result);^result}
```

Token analysis:
- `def` → eliminated (function detected by `name(params){body}` pattern)
- `return` → `^` (both 1 token, but `^` saves the space before it)
- `:` + newline + indent → `{`
- dedent → `}`

### cl100k_base verification
| Symbol | Tokens | IDs |
|--------|--------|-----|
| `^` | 1 | [61] |
| `{` | 1 | [90] |
| `}` | 1 | [92] |
| `;` | 1 | [26] |

## Section 3: Class Definitions

### Basic Class
```
# Python: class Point:
#             def __init__(self, x, y):
#                 self.x = x
#                 self.y = y
class Point{init(x,y){.x=x;.y=y}}
```

### Class with Methods
```
# Python: class Circle:
#             def __init__(self, radius):
#                 self.radius = radius
#             def area(self):
#                 return 3.14159 * self.radius ** 2
#             def __str__(self):
#                 return f"Circle(r={self.radius})"
class Circle{init(radius){.radius=radius};area(){^3.14159*.radius**2};str(){^f"Circle(r={.radius})"}}
```

### Inheritance
```
# Python: class Dog(Animal):
class Dog(Animal){...}

# Python: class Child(Parent1, Parent2, metaclass=Meta):
class Child(Parent1,Parent2,metaclass=Meta){...}
```

### Magic Method Compression

| Python | AET-Python | Saving |
|--------|-----------|--------|
| `__init__` (3 tokens) | `init` (1 token) | 2 |
| `__str__` (3 tokens) | `str` (1 token) | 2 |
| `__repr__` (3 tokens) | `repr` (1 token) | 2 |
| `__eq__` (3 tokens) | `eq` (1 token) | 2 |
| `__hash__` (3 tokens) | `hash` (1 token) | 2 |
| `__len__` (3 tokens) | `ln` (1 token) | 2 |
| `__iter__` (3 tokens) | `iter` (1 token) | 2 |
| `__next__` (3 tokens) | `next` (1 token) | 2 |
| `__enter__` (3 tokens) | `enter` (1 token) | 2 |
| `__exit__` (3 tokens) | `exit` (1 token) | 2 |
| `__getitem__` (3 tokens) | `gi` (1 token) | 2 |
| `__setitem__` (4 tokens) | `si` (1 token) | 3 |
| `__contains__` (3 tokens) | `ct` (1 token) | 2 |
| `__call__` (3 tokens) | `call` (1 token) | 2 |
| `__lt__` (3 tokens) | `lt` (1 token) | 2 |
| `__le__` (3 tokens) | `le` (1 token) | 2 |
| `__gt__` (3 tokens) | `gt` (1 token) | 2 |
| `__ge__` (3 tokens) | `ge` (1 token) | 2 |
| `__get__` (3 tokens) | `$get` (1 token) | 2 |
| `__set__` (3 tokens) | `$set` (1 token) | 2 |
| `__set_name__` (4 tokens) | `$sn` (1 token) | 3 |
| `__bool__` (3 tokens) | `bool` (1 token) | 2 |
| `__del__` (3 tokens) | `del` (1 token) | 2 |
| `__aenter__` (3 tokens) | `aenter` (1 token) | 2 |
| `__aexit__` (3 tokens) | `aexit` (1 token) | 2 |
| `__aiter__` (3 tokens) | `aiter` (1 token) | 2 |
| `__anext__` (3 tokens) | `anext` (1 token) | 2 |

### Self Elimination

- `self` as parameter: **removed entirely**
- `self.attr` → `.attr`
- `self.method()` → `.method()`
- `cls` as parameter: **removed entirely** (for @classmethod)
- `cls.attr` → `@.attr` (class attribute via classmethod)

### `__slots__`
```
# Python: __slots__ = ('x', 'y', 'z')
slots(x,y,z)
```

### `__name__` Guard
```
# Python: if __name__ == "__main__":
#             main()
@main{main()}
```

## Section 4: Decorators

Decorators are preserved with abbreviated forms where beneficial:

| Python | AET-Python | cl100k tokens |
|--------|-----------|--------------|
| `@staticmethod` | `@staticmethod` | 2 (no gain from `@static`) |
| `@classmethod` | `@classmethod` | 2 |
| `@property` | `@property` | 1 (already optimal!) |
| `@dataclass` | `@dc` | 2 → 2 (save the 3-token `@dataclass`) |
| `@abstractmethod` | `@abstractmethod` | 2 |
| `@name.setter` | `@name.setter` | preserved |
| `@app.route(...)` | `@app.route(...)` | preserved |

`@dc` is verified single cl100k token.

### Dataclass Shorthand
```
# Python: @dataclass
#         class Config:
#             host: str = "localhost"
#             port: int = 8080
@dc class Config{host:str="localhost";port:int=8080}
```

## Section 5: Control Flow

### If / Elif / Else
```
# Python: if x > 0:
#             print("positive")
#         elif x < 0:
#             print("negative")
#         else:
#             print("zero")
if x>0{print("positive")}elif x<0{print("negative")}else{print("zero")}
```

### For Loop
```
# Python: for item in items:
#             process(item)
for item in items{process(item)}

# Python: for i, item in enumerate(items):
for i,item in enumerate(items){process(i,item)}

# Python: for i in range(10):
for i in range(10){process(i)}
```

### While Loop
```
# Python: while condition:
#             do_something()
while condition{do_something()}
```

### Match / Case (Python 3.10+)
```
# Python: match command:
#             case "quit":
#                 return
#             case "hello":
#                 print("Hi!")
#             case _:
#                 print("Unknown")
match command{case "quit"{^};case "hello"{print("Hi!")};case _{print("Unknown")}}
```

### With Statement
```
# Python: with open(file, 'r') as f:
#             data = f.read()
with open(file,'r')as f{data=f.read()}

# Python: async with session() as s:
async with session()as s{...}
```

## Section 6: Error Handling

### Try / Except / Else / Finally
```
# Python: try:
#             result = process()
#         except ValueError as e:
#             handle(e)
#         except (TypeError, KeyError):
#             fallback()
#         else:
#             save(result)
#         finally:
#             cleanup()
try{result=process()}except ValueError as e{handle(e)}except(TypeError,KeyError){fallback()}else{save(result)}finally{cleanup()}
```

### Raise
```
# Python: raise ValueError("bad input")
raise ValueError("bad input")
```

## Section 7: Lambda / Comprehensions / Generators

### Lambda
```
# Python: lambda x, y: x + y
|x,y|x+y

# Python: lambda x: x * 2
|x|x*2

# Python: sorted(items, key=lambda x: x.name)
sorted(items,key=|x|x.name)
```

cl100k verification: `|` = 1 token [91]

### List Comprehension
```
# Python: [x * 2 for x in items if x > 0]
[x*2 for x in items if x>0]
```
Comprehensions preserved as-is (already compact). Only whitespace removed.

### Dict Comprehension
```
# Python: {k: v for k, v in items.items()}
{k:v for k,v in items.items()}
```

### Generator Expression
```
# Python: sum(x for x in items if x > 0)
sum(x for x in items if x>0)
```

### Yield / Yield From
```
yield value
yield from iterable
```
Preserved as-is (both are single cl100k tokens).

## Section 8: Async / Await

```
# Python: async def fetch(url):
#             result = await get(url)
#             return result
async fetch(url){result=await get(url);^result}
```

`async` and `await` are both single cl100k tokens — preserved.

## Section 9: Type Hints (Optional, `--typed` mode)

Default mode: ALL type hints removed.

With `--typed` flag, shortened syntax:

| Python | AET-Python (typed) |
|--------|-------------------|
| `Optional[int]` | `int?` |
| `List[str]` | `str[]` |
| `Dict[str, int]` | `dict[str,int]` |
| `Tuple[int, str]` | `tuple[int,str]` |
| `Set[int]` | `set[int]` |
| `Union[int, str]` | `int\|str` |
| `Callable[[int], str]` | `(int)->str` |
| `-> ReturnType` | `->ReturnType` |
| `param: Type` | `param:Type` |

Example:
```
# Python: def process(x: int, items: List[str]) -> Optional[Dict[str, int]]:
# AET (default): process(x,items){...}
# AET (--typed): process(x:int,items:str[])->dict[str,int]?{...}
```

## Section 10: Import Elimination

All imports are eliminated. The transpiler auto-resolves them from:
1. Stdlib alias map (`stdlib-aliases-python.json`)
2. Usage detection (import names that appear in the code)
3. Third-party alias map (`popular-aliases-python.json`)

When emitting Python, the emitter reconstructs the correct `import` / `from X import Y` statements at the top of the file.

## Section 11: Stdlib Aliases

### Standard Library Aliases (`stdlib-aliases-python.json`)

| Alias | Expands To | Package |
|-------|-----------|---------|
| `jd` | `json.dumps` | json |
| `jl` | `json.loads` | json |
| `pj` | `os.path.join` | os.path |
| `pe` | `os.path.exists` | os.path |
| `gl` | `logging.getLogger` | logging |
| `ar` | `asyncio.run` | asyncio |
| `ag` | `asyncio.gather` | asyncio |
| `dd` | `defaultdict` | collections |
| `Ct` | `Counter` | collections |
| `Pa` | `Path` | pathlib |

### Popular Third-Party Aliases (`popular-aliases-python.json`)

| Alias | Expands To | Package |
|-------|-----------|---------|
| `rg` | `requests.get` | requests |
| `rp` | `requests.post` | requests |
| `DF` | `pd.DataFrame` | pandas |
| `na` | `np.array` | numpy |

All aliases verified as single cl100k_base tokens.

## Section 12: Miscellaneous

### Pass
```
# Python: pass
# AET-Python: {} (empty block)
```

### Assert
```
# Python: assert condition, "message"
assert condition,"message"
```

### Delete
```
# Python: del item
del item
```

### Global / Nonlocal
```
global x
nonlocal y
```
Preserved as-is (both multi-character keywords already verified).

### Star Expressions
```
# Python: a, b, *rest = [1, 2, 3, 4]
a,b,*rest=[1,2,3,4]

# Python: {**dict1, **dict2}
{**dict1,**dict2}

# Python: def func(*args, **kwargs):
func(*args,**kwargs){...}
```

### Walrus Operator
```
# Python: if (n := len(data)) > 10:
if(n:=len(data))>10{...}
```

### F-strings
```
# Python: f"Hello {name}, you have {count} items"
f"Hello {name}, you have {count} items"
```
Preserved as-is (already efficient).

## Section 13: Statement Separation

- Statements within `{}` blocks separated by `;`
- Top-level statements separated by `;`
- `;` before `}` is optional
- Multiple statements on same conceptual level: `stmt1;stmt2;stmt3`

## Section 14: Grammar (EBNF)

```ebnf
program         = "!py-v1" (topLevelStmt ";"?)* ;
topLevelStmt    = classDecl | funcDef | decoratedDef | assignStmt | exprStmt | mainBlock
                | forStmt | whileStmt | ifStmt | tryStmt | matchStmt | withStmt
                | assertStmt | "del" expr | "global" identList | "nonlocal" identList ;

classDecl       = "class" IDENT ("(" argList ")")? "{" classBody "}" ;
classBody       = (classMember ";"?)* ;
classMember     = funcDef | decoratedDef | assignStmt | slotsDecl | exprStmt | classDecl ;
slotsDecl       = "slots" "(" identList ")" ;

funcDef         = ("async")? IDENT "(" paramList? ")" ("->" typeExpr)? "{" stmtList "}" ;
decoratedDef    = ("@" decoratorExpr)+ (funcDef | classDecl) ;
decoratorExpr   = IDENT ("." IDENT)* ("(" argList ")")? ;

paramList       = param ("," param)* ;
param           = ("*" | "**")? IDENT (":" typeExpr)? ("=" expr)? ;

stmtList        = (stmt ";"?)* ;
stmt            = assignStmt | exprStmt | returnStmt | ifStmt | forStmt | whileStmt
                | tryStmt | withStmt | matchStmt | raiseStmt | assertStmt
                | "del" expr | "break" | "continue" | "pass" | "yield" expr?
                | "yield" "from" expr | "global" identList | "nonlocal" identList ;

returnStmt      = "^" expr? ;
raiseStmt       = "raise" expr? ("from" expr)? ;
assignStmt      = targetList assignOp expr ;
assignOp        = "=" | "+=" | "-=" | "*=" | "/=" | "//=" | "%=" | "**=" | "&=" | "|=" | "^=" | "<<=" | ">>=" ;

ifStmt          = "if" expr "{" stmtList "}" ("elif" expr "{" stmtList "}")* ("else" "{" stmtList "}")? ;
forStmt         = ("async")? "for" targetList "in" expr "{" stmtList "}" ("else" "{" stmtList "}")? ;
whileStmt       = "while" expr "{" stmtList "}" ("else" "{" stmtList "}")? ;
withStmt        = ("async")? "with" withItems "{" stmtList "}" ;
withItems       = withItem ("," withItem)* ;
withItem        = expr ("as" IDENT)? ;
tryStmt         = "try" "{" stmtList "}" exceptClause* ("else" "{" stmtList "}")? ("finally" "{" stmtList "}")? ;
exceptClause    = "except" (exprList ("as" IDENT)?)? "{" stmtList "}" ;
matchStmt       = "match" expr "{" matchCase* "}" ;
matchCase       = "case" pattern ("if" expr)? "{" stmtList "}" ;

expr            = ternaryExpr | lambdaExpr | "await" expr | yieldExpr ;
ternaryExpr     = orExpr ("if" orExpr "else" expr)? ;
lambdaExpr      = "|" paramList? "|" expr ;
orExpr          = andExpr ("or" andExpr)* ;
andExpr         = notExpr ("and" notExpr)* ;
notExpr         = "not" notExpr | compExpr ;
compExpr        = orBitExpr (compOp orBitExpr)* ;
compOp          = "==" | "!=" | "<" | ">" | "<=" | ">=" | "in" | "not" "in" | "is" | "is" "not" ;
orBitExpr       = xorExpr ("|" xorExpr)* ;
xorExpr         = andBitExpr ("^" andBitExpr)* ;
andBitExpr      = shiftExpr ("&" shiftExpr)* ;
shiftExpr       = addExpr (("<<" | ">>") addExpr)* ;
addExpr         = mulExpr (("+" | "-") mulExpr)* ;
mulExpr         = unaryExpr (("*" | "/" | "//" | "%" | "@") unaryExpr)* ;
unaryExpr       = ("+" | "-" | "~") unaryExpr | powerExpr ;
powerExpr       = awaitExpr ("**" unaryExpr)? ;
awaitExpr       = "await" primaryExpr | primaryExpr ;
primaryExpr     = atom trailer* ;
atom            = IDENT | NUMBER | STRING | FSTRING | "True" | "False" | "None"
                | "(" (expr | comprehension | starExprs)? ")"
                | "[" (expr | comprehension | starExprs)? "]"
                | "{" (dictComp | setComp | keyValues | starExprs)? "}" ;
trailer         = "(" argList? ")" | "[" subscript "]" | "." IDENT ;
```

## Section 15: Token Savings Analysis

### Per-Pattern Savings

| Pattern | Python Tokens | AET-Python | Saving % |
|---------|-------------|-----------|---------|
| Indentation (per indented line) | 1-3 | 0 | 100% |
| Block structure (`:` + indent) | 2 | 1 (`{`) | 50% |
| `self` parameter | 1 | 0 | 100% |
| `self.attr` | 2 | 1 (`.attr`) | 50% |
| `__init__(self, ...)` | 5+ | `init(...)` 1 | 80%+ |
| Docstring (avg) | 13.6 | 0 | 100% |
| Type hint (avg) | 3-5 | 0 | 100% |
| Import line | 3-6 | 0 | 100% |
| Comment | 3-10 | 0 | 100% |
| `lambda x: expr` | 4 | `\|x\|expr` 3 | 25% |
| `if __name__...` | 11 | `@main{}` 5 | 54.5% |

### Expected File-Level Savings

| Code Type | Target |
|-----------|--------|
| Algorithmic (sorting, math) | 35-42% |
| Medium (data processing, CLI) | 38-45% |
| OOP-heavy (classes, patterns) | 42-50% |
| Boilerplate-heavy (frameworks) | 48-58% |

## Section 16: CLI Integration

```
aet convert input.py             # Python → AET-Python (.aetp)
aet compile input.aetp           # AET-Python → Python (.py)
aet compile input.aetp --typed   # AET-Python → Python with type hints
aet compile input.aetp --docs    # AET-Python → Python with stub docstrings
aet stats input.py               # Show token savings
aet diff a.aetp b.aetp           # AST diff
```

Auto-detection: `.py` → Python pipeline, `.aetp` → AET-Python parser

## Section 17: Round-Trip Guarantees

- **100% round-trip**: All core Python constructs (function, class, control flow, comprehensions, error handling, async, generators, decorators, magic methods)
- **≥99.9% edge cases**: Complex decorators with arguments, nested classes, advanced pattern matching, metaclasses
- **AST-level comparison**: Whitespace/comment/docstring/import order differences ignored
- **Functional equivalence**: Emitted Python executes identically to original

## Section 18: Transpile Pipeline

```
Forward (compress):
  Python (.py) → ast_dumper.py (Python ast module) → JSON AST
               → reverse/python.ts → IR
               → IR collapser → AET-Python (.aetp)

Backward (emit):
  AET-Python (.aetp) → parser/python.ts (Chevrotain) → CST
                     → transformer/python.ts → IR
                     → emitter/python.ts → Python (.py)
```
