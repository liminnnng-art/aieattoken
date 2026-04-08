/**
 * Python Structure Token Analysis
 * Analyzes cl100k_base token counts for 27 Python patterns vs AET-Python compressed forms.
 * Uses tiktoken from the project's ts/node_modules directory.
 */
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../ts/node_modules/.package-lock.json"));
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");

function countTokens(text) {
  if (!text) return 0;
  return enc.encode(text).length;
}

function tokenDetail(text) {
  const tokens = enc.encode(text);
  const decoded = [];
  for (const t of tokens) {
    decoded.push(Buffer.from(enc.decode(new Uint32Array([t]))).toString("utf-8"));
  }
  return { count: tokens.length, pieces: decoded };
}

// ============================================================
// Define all 27 patterns with original Python and proposed AET-Python
// ============================================================
const patterns = [
  // 1. def/return
  {
    id: 1,
    name: "def/return",
    python: `def calculate_total(price: float, tax_rate: float) -> float:\n    return price * (1 + tax_rate)`,
    aet: `fn calculate_total(price:float,tax_rate:float)->float{ret price*(1+tax_rate)}`,
    notes: "def->fn, return->ret, braces instead of colon+indent"
  },

  // 2. class boilerplate
  {
    id: 2,
    name: "class boilerplate",
    python: `class Point:\n    def __init__(self, x, y):\n        self.x = x\n        self.y = y`,
    aet: `class Point{init(x,y){.x=x;.y=y}}`,
    notes: "Eliminate __init__, self, self. prefix -> dot prefix"
  },

  // 3. self parameter
  {
    id: 3,
    name: "self parameter",
    python: `def process(self, x, y):\n        self.x = x\n        self.result = self.compute(x, y)`,
    aet: `fn process(x,y){.x=x;.result=.compute(x,y)}`,
    notes: "Remove self from params, self. -> dot notation"
  },

  // 4. __init__/__str__/__repr__
  {
    id: 4,
    name: "magic methods (__init__/__str__/__repr__)",
    python: `    def __init__(self, name, value):\n        self.name = name\n        self.value = value\n\n    def __str__(self):\n        return f"{self.name}: {self.value}"\n\n    def __repr__(self):\n        return f"Item({self.name!r}, {self.value!r})"`,
    aet: `init(name,value){.name=name;.value=value}\nstr(){ret f"{.name}: {.value}"}\nrepr(){ret f"Item({.name!r}, {.value!r})"}`,
    notes: "__init__->init, __str__->str, __repr__->repr, remove self"
  },

  // 5. import/from
  {
    id: 5,
    name: "import/from statements",
    python: `from collections import defaultdict\nimport json\nfrom typing import Optional, List, Dict`,
    aet: `use collections.defaultdict\nuse json\nuse typing{Optional,List,Dict}`,
    notes: "from...import -> use with dot, import -> use, grouped imports with braces"
  },

  // 6. type hints
  {
    id: 6,
    name: "type hints",
    python: `def process(x: int, y: str = "default") -> Optional[List[int]]:`,
    aet: `fn process(x:int,y:str="default")->int[]?:`,
    notes: "Optional[X]->X?, List[X]->X[], remove spaces around colons"
  },

  // 7. decorators
  {
    id: 7,
    name: "decorators",
    python: `@staticmethod\n@property\n@dataclass\n@app.route("/path", methods=["GET"])`,
    aet: `@static\n@prop\n@data\n@app.route("/path",methods=["GET"])`,
    notes: "@staticmethod->@static, @property->@prop, @dataclass->@data"
  },

  // 8. list comprehension
  {
    id: 8,
    name: "list comprehension",
    python: `result = [x * 2 for x in items if x > 0]`,
    aet: `result=[x*2 for x in items if x>0]`,
    notes: "Remove spaces around operators (already fairly compact)"
  },

  // 9. nested comprehension
  {
    id: 9,
    name: "nested comprehension",
    python: `matrix = [[j * i for j in range(5)] for i in range(5)]`,
    aet: `matrix=[[j*i for j in 0..5]for i in 0..5]`,
    notes: "range(N)->0..N, remove spaces"
  },

  // 10. dict comprehension
  {
    id: 10,
    name: "dict comprehension",
    python: `counts = {k: v for k, v in items.items() if v > 0}`,
    aet: `counts={k:v for k,v in items.items()if v>0}`,
    notes: "Remove spaces after colons and commas"
  },

  // 11. generator expression
  {
    id: 11,
    name: "generator expression",
    python: `total = sum(x * x for x in items if x > 0)`,
    aet: `total=sum(x*x for x in items if x>0)`,
    notes: "Remove spaces around operators"
  },

  // 12. with statement
  {
    id: 12,
    name: "with statement",
    python: `with open(filename, 'r') as f:\n    data = f.read()`,
    aet: `with open(filename,'r')as f{data=f.read()}`,
    notes: "Braces replace colon+indent, remove spaces"
  },

  // 13. try/except full
  {
    id: 13,
    name: "try/except/else/finally",
    python: `try:\n    result = fetch_data(url)\n    parsed = json.loads(result)\nexcept ConnectionError as e:\n    log_error(e)\n    result = None\nexcept ValueError:\n    result = default_value\nelse:\n    cache.store(result)\nfinally:\n    connection.close()`,
    aet: `try{result=fetch_data(url);parsed=json.loads(result)}catch ConnectionError as e{log_error(e);result=None}catch ValueError{result=default_value}else{cache.store(result)}finally{connection.close()}`,
    notes: "except->catch, braces replace indent, semicolons separate statements"
  },

  // 14. f-string
  {
    id: 14,
    name: "f-string",
    python: "message = f\"Hello {name}, you have {count} items worth ${total:.2f}\"",
    aet: "message=f\"Hello {name}, you have {count} items worth ${total:.2f}\"",
    notes: "f-strings are already token-efficient; just remove assignment spaces"
  },

  // 15. lambda
  {
    id: 15,
    name: "lambda",
    python: `sorter = lambda x, y: x.value - y.value`,
    aet: `sorter=|x,y|x.value-y.value`,
    notes: "lambda->pipe syntax, remove spaces"
  },

  // 16. *args/**kwargs
  {
    id: 16,
    name: "*args/**kwargs",
    python: `def wrapper(*args, **kwargs):\n    return func(*args, **kwargs)`,
    aet: `fn wrapper(*a,**kw){ret func(*a,**kw)}`,
    notes: "fn, short param names, braces, ret"
  },

  // 17. unpacking
  {
    id: 17,
    name: "unpacking",
    python: `a, b, *rest = [1, 2, 3, 4, 5]\nmerged = {**defaults, **overrides}`,
    aet: `a,b,*rest=[1,2,3,4,5]\nmerged={**defaults,**overrides}`,
    notes: "Remove spaces around assignment and after commas"
  },

  // 18. async/await
  {
    id: 18,
    name: "async/await",
    python: `async def fetch_data(url):\n    async with aiohttp.ClientSession() as session:\n        response = await session.get(url)\n        return await response.json()`,
    aet: `async fn fetch_data(url){async with aiohttp.ClientSession()as session{response=await session.get(url);ret await response.json()}}`,
    notes: "def->fn, braces, ret, semicolons"
  },

  // 19. dataclass
  {
    id: 19,
    name: "dataclass",
    python: `@dataclass\nclass Config:\n    host: str = "localhost"\n    port: int = 8080\n    debug: bool = False\n    tags: List[str] = field(default_factory=list)`,
    aet: `@data class Config{host:str="localhost";port:int=8080;debug:bool=False;tags:str[]=field(default_factory=list)}`,
    notes: "@dataclass->@data, braces, semicolons, List[str]->str[]"
  },

  // 20. property getter/setter
  {
    id: 20,
    name: "property getter/setter",
    python: `    @property\n    def name(self):\n        return self._name\n\n    @name.setter\n    def name(self, value):\n        if not isinstance(value, str):\n            raise TypeError("name must be str")\n        self._name = value`,
    aet: `@prop fn name(){ret ._name}\n@name.setter fn name(value){if !isinstance(value,str){raise TypeError("name must be str")};._name=value}`,
    notes: "@property->@prop, self.->dot, braces, ret"
  },

  // 21. enumerate/zip
  {
    id: 21,
    name: "enumerate/zip",
    python: `for i, item in enumerate(items):\n    print(f"{i}: {item}")\n\nfor name, score in zip(names, scores):\n    results[name] = score`,
    aet: `for i,item in enumerate(items){print(f"{i}: {item}")}\nfor name,score in zip(names,scores){results[name]=score}`,
    notes: "Braces replace indent, remove spaces"
  },

  // 22. if __name__ == "__main__"
  {
    id: 22,
    name: 'if __name__ == "__main__"',
    python: `if __name__ == "__main__":\n    main()`,
    aet: `@main{main()}`,
    notes: 'Entire guard pattern -> @main decorator/macro'
  },

  // 23. walrus operator
  {
    id: 23,
    name: "walrus operator",
    python: `if (n := len(data)) > 10:\n    process(n)`,
    aet: `if(n:=len(data))>10{process(n)}`,
    notes: "Braces, remove spaces"
  },

  // 24. match/case
  {
    id: 24,
    name: "match/case",
    python: `match command:\n    case "quit":\n        sys.exit(0)\n    case "hello":\n        print("Hello!")\n    case str(s) if s.startswith("go"):\n        navigate(s)\n    case _:\n        print("Unknown")`,
    aet: `match command{"quit"=>sys.exit(0);"hello"=>print("Hello!");str(s)if s.startswith("go")=>navigate(s);_=>print("Unknown")}`,
    notes: "case X: block -> X => expr; compact with braces"
  },

  // 25. multiple inheritance
  {
    id: 25,
    name: "multiple inheritance",
    python: `class MyWidget(QWidget, Serializable, metaclass=ABCMeta):\n    pass`,
    aet: `class MyWidget(QWidget,Serializable,metaclass=ABCMeta){}`,
    notes: "pass->{}, remove spaces"
  },

  // 26. yield from
  {
    id: 26,
    name: "yield from",
    python: `def flatten(nested):\n    for item in nested:\n        if isinstance(item, list):\n            yield from flatten(item)\n        else:\n            yield item`,
    aet: `fn flatten(nested){for item in nested{if isinstance(item,list){yield from flatten(item)}else{yield item}}}`,
    notes: "def->fn, braces replace indent"
  },

  // 27. __slots__
  {
    id: 27,
    name: "__slots__",
    python: `class Vector:\n    __slots__ = ('x', 'y', 'z')\n    def __init__(self, x, y, z):\n        self.x = x\n        self.y = y\n        self.z = z`,
    aet: `class Vector{slots(x,y,z);init(x,y,z){.x=x;.y=y;.z=z}}`,
    notes: "__slots__=('x','y','z') -> slots(x,y,z), __init__->init, self.->dot"
  },
];

// ============================================================
// Run analysis
// ============================================================
console.log("=".repeat(100));
console.log("PYTHON STRUCTURE TOKEN ANALYSIS - cl100k_base encoder");
console.log("=".repeat(100));
console.log();

let totalPythonTokens = 0;
let totalAetTokens = 0;
const results = [];

for (const p of patterns) {
  const pyDetail = tokenDetail(p.python);
  const aetDetail = tokenDetail(p.aet);
  const saving = pyDetail.count - aetDetail.count;
  const pct = pyDetail.count > 0 ? ((saving / pyDetail.count) * 100).toFixed(1) : "0.0";

  totalPythonTokens += pyDetail.count;
  totalAetTokens += aetDetail.count;

  results.push({
    id: p.id,
    name: p.name,
    pyTokens: pyDetail.count,
    aetTokens: aetDetail.count,
    saving,
    pct: parseFloat(pct),
    pyPieces: pyDetail.pieces,
    aetPieces: aetDetail.pieces,
    notes: p.notes,
  });
}

// ============================================================
// Print detailed results
// ============================================================
for (const r of results) {
  const p = patterns[r.id - 1];

  console.log("-".repeat(100));
  console.log(`#${r.id}. ${r.name}`);
  console.log("-".repeat(100));
  console.log();

  // Python original
  console.log("  PYTHON ORIGINAL:");
  for (const line of p.python.split("\n")) {
    console.log(`    ${line}`);
  }
  console.log(`  Tokens: ${r.pyTokens}`);
  console.log(`  Token pieces: [${r.pyPieces.map(t => JSON.stringify(t)).join(", ")}]`);
  console.log();

  // AET-Python compressed
  console.log("  AET-PYTHON COMPRESSED:");
  for (const line of p.aet.split("\n")) {
    console.log(`    ${line}`);
  }
  console.log(`  Tokens: ${r.aetTokens}`);
  console.log(`  Token pieces: [${r.aetPieces.map(t => JSON.stringify(t)).join(", ")}]`);
  console.log();

  // Savings
  const bar = r.saving > 0 ? "#".repeat(Math.min(r.saving, 40)) : "-";
  console.log(`  SAVING: ${r.saving} tokens (${r.pct}%)  ${bar}`);
  console.log(`  Strategy: ${r.notes}`);
  console.log();
}

// ============================================================
// Summary table
// ============================================================
console.log("=".repeat(100));
console.log("SUMMARY TABLE");
console.log("=".repeat(100));
console.log();

const hdr = [
  "# ".padStart(4),
  "Pattern".padEnd(38),
  "Py Tok".padStart(7),
  "AET Tok".padStart(8),
  "Saved".padStart(6),
  "Saved%".padStart(7),
  "Visual".padStart(2),
];
console.log(hdr.join(" | "));
console.log("-".repeat(100));

for (const r of results) {
  const bar = r.saving > 0 ? "#".repeat(Math.min(Math.round(r.pct / 2.5), 20)) : "";
  const row = [
    String(r.id).padStart(4),
    r.name.padEnd(38),
    String(r.pyTokens).padStart(7),
    String(r.aetTokens).padStart(8),
    String(r.saving).padStart(6),
    (r.pct + "%").padStart(7),
    bar,
  ];
  console.log(row.join(" | "));
}

console.log("-".repeat(100));

const totalSaving = totalPythonTokens - totalAetTokens;
const totalPct = ((totalSaving / totalPythonTokens) * 100).toFixed(1);
console.log(
  [
    "    ",
    "TOTAL".padEnd(38),
    String(totalPythonTokens).padStart(7),
    String(totalAetTokens).padStart(8),
    String(totalSaving).padStart(6),
    (totalPct + "%").padStart(7),
    "",
  ].join(" | ")
);
console.log();

// ============================================================
// Top savings ranking
// ============================================================
console.log("=".repeat(100));
console.log("TOP SAVINGS BY ABSOLUTE TOKENS");
console.log("=".repeat(100));
const byAbsolute = [...results].sort((a, b) => b.saving - a.saving);
for (let i = 0; i < byAbsolute.length; i++) {
  const r = byAbsolute[i];
  console.log(`  ${(i + 1 + ".").padEnd(4)} ${r.name.padEnd(40)} -${r.saving} tokens (${r.pct}%)`);
}
console.log();

console.log("=".repeat(100));
console.log("TOP SAVINGS BY PERCENTAGE");
console.log("=".repeat(100));
const byPercent = [...results].sort((a, b) => b.pct - a.pct);
for (let i = 0; i < byPercent.length; i++) {
  const r = byPercent[i];
  console.log(`  ${(i + 1 + ".").padEnd(4)} ${r.name.padEnd(40)} ${r.pct}% (-${r.saving} tokens)`);
}
console.log();

// ============================================================
// Compression strategy breakdown
// ============================================================
console.log("=".repeat(100));
console.log("COMPRESSION STRATEGY ANALYSIS");
console.log("=".repeat(100));
console.log();

// Measure individual micro-optimizations
const microOpts = [
  { name: "def -> fn", pairs: [["def ", "fn "]] },
  { name: "return -> ret", pairs: [["return ", "ret "]] },
  { name: "self", pairs: [["self", ""]] },
  { name: "self.", pairs: [["self.", "."]] },
  { name: "__init__", pairs: [["__init__", "init"]] },
  { name: "__str__", pairs: [["__str__", "str"]] },
  { name: "__repr__", pairs: [["__repr__", "repr"]] },
  { name: "__slots__", pairs: [["__slots__", "slots"]] },
  { name: "__name__", pairs: [['__name__', '@name']] },
  { name: "from X import Y -> use X.Y", pairs: [["from collections import defaultdict", "use collections.defaultdict"]] },
  { name: "import X -> use X", pairs: [["import json", "use json"]] },
  { name: "@staticmethod -> @static", pairs: [["@staticmethod", "@static"]] },
  { name: "@property -> @prop", pairs: [["@property", "@prop"]] },
  { name: "@dataclass -> @data", pairs: [["@dataclass", "@data"]] },
  { name: "lambda x,y: -> |x,y|", pairs: [["lambda x, y: ", "|x,y|"]] },
  { name: "except -> catch", pairs: [["except ", "catch "]] },
  { name: "Optional[List[int]]", pairs: [["Optional[List[int]]", "int[]?"]] },
  { name: "List[str]", pairs: [["List[str]", "str[]"]] },
  { name: 'if __name__=="__main__":\\n    main()', pairs: [['if __name__ == "__main__":\n    main()', "@main{main()}"]] },
  { name: "range(5) -> 0..5", pairs: [["range(5)", "0..5"]] },
  { name: "case X: block -> X=>expr", pairs: [['case "quit":\n        sys.exit(0)', '"quit"=>sys.exit(0)']] },
  { name: ":\\n    indent -> {}", pairs: [[":\n    ", "{"]] },
  { name: "pass -> {}", pairs: [[":\n    pass", "{}"]] },
];

console.log("  Individual micro-optimization token costs:");
console.log();
console.log(
  "  " +
    "Optimization".padEnd(45) +
    "Before".padStart(8) +
    "After".padStart(8) +
    "Saved".padStart(8) +
    "%".padStart(8)
);
console.log("  " + "-".repeat(77));

for (const opt of microOpts) {
  const [orig, compressed] = opt.pairs[0];
  const origTok = countTokens(orig);
  const compTok = countTokens(compressed);
  const saved = origTok - compTok;
  const pct = origTok > 0 ? ((saved / origTok) * 100).toFixed(1) : "0.0";
  console.log(
    "  " +
      opt.name.padEnd(45) +
      String(origTok).padStart(8) +
      String(compTok).padStart(8) +
      String(saved).padStart(8) +
      (pct + "%").padStart(8)
  );
}

console.log();

// ============================================================
// Realistic code block analysis
// ============================================================
console.log("=".repeat(100));
console.log("REALISTIC CODE BLOCK - COMBINED SAVINGS DEMO");
console.log("=".repeat(100));
console.log();

const realisticPython = `from typing import Optional, List, Dict
from dataclasses import dataclass, field
import json
import logging

logger = logging.getLogger(__name__)

@dataclass
class UserProfile:
    username: str
    email: str
    age: int = 0
    tags: List[str] = field(default_factory=list)

    def __str__(self):
        return f"{self.username} ({self.email})"

    def __repr__(self):
        return f"UserProfile({self.username!r}, {self.email!r})"

class UserService:
    def __init__(self, db_connection, cache=None):
        self.db = db_connection
        self.cache = cache
        self._users: Dict[str, UserProfile] = {}

    @property
    def user_count(self):
        return len(self._users)

    async def get_user(self, user_id: str) -> Optional[UserProfile]:
        if user_id in self._users:
            return self._users[user_id]
        try:
            data = await self.db.fetch_one(user_id)
            if data is not None:
                user = UserProfile(**data)
                self._users[user_id] = user
                return user
        except ConnectionError as e:
            logger.error(f"DB error: {e}")
            return None

    async def search_users(self, query: str) -> List[UserProfile]:
        results = await self.db.search(query)
        return [UserProfile(**r) for r in results if r.get("active")]

    def get_stats(self) -> Dict[str, int]:
        active = sum(1 for u in self._users.values() if u.age > 0)
        return {"total": len(self._users), "active": active}

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())`;

const realisticAet = `use typing{Optional,List,Dict}
use dataclasses{dataclass,field}
use json
use logging

logger=logging.getLogger(@name)

@data class UserProfile{username:str;email:str;age:int=0;tags:str[]=field(default_factory=list)
str(){ret f"{.username} ({.email})"}
repr(){ret f"UserProfile({.username!r}, {.email!r})"}}

class UserService{init(db_connection,cache=None){.db=db_connection;.cache=cache;._users:Dict[str,UserProfile]={}}
@prop fn user_count(){ret len(._users)}
async fn get_user(user_id:str)->UserProfile?{if user_id in ._users{ret ._users[user_id]}try{data=await .db.fetch_one(user_id);if data is not None{user=UserProfile(**data);._users[user_id]=user;ret user}}catch ConnectionError as e{logger.error(f"DB error: {e}");ret None}}
async fn search_users(query:str)->UserProfile[]{results=await .db.search(query);ret[UserProfile(**r)for r in results if r.get("active")]}
fn get_stats()->Dict[str,int]{active=sum(1 for u in ._users.values()if u.age>0);ret{"total":len(._users),"active":active}}}

@main{use asyncio;asyncio.run(main())}`;

const pyTok = countTokens(realisticPython);
const aetTok = countTokens(realisticAet);
const realisticSaving = pyTok - aetTok;
const realisticPct = ((realisticSaving / pyTok) * 100).toFixed(1);

console.log("  ORIGINAL PYTHON:");
for (const line of realisticPython.split("\n")) {
  console.log(`    ${line}`);
}
console.log();
console.log(`  Python tokens: ${pyTok}`);
console.log(`  Python chars:  ${realisticPython.length}`);
console.log();

console.log("  AET-PYTHON COMPRESSED:");
for (const line of realisticAet.split("\n")) {
  console.log(`    ${line}`);
}
console.log();
console.log(`  AET tokens:    ${aetTok}`);
console.log(`  AET chars:     ${realisticAet.length}`);
console.log();
console.log(`  TOKEN SAVING:  ${realisticSaving} tokens (${realisticPct}%)`);
console.log(`  CHAR SAVING:   ${realisticPython.length - realisticAet.length} chars (${((realisticPython.length - realisticAet.length) / realisticPython.length * 100).toFixed(1)}%)`);
console.log();

// ============================================================
// Frequency-weighted impact estimate
// ============================================================
console.log("=".repeat(100));
console.log("FREQUENCY-WEIGHTED IMPACT ESTIMATE (per 1000 lines of typical Python)");
console.log("=".repeat(100));
console.log();

const freqEstimates = [
  { pattern: "def/return", occurrences: 80, savingPer: null },
  { pattern: "class boilerplate", occurrences: 10, savingPer: null },
  { pattern: "self parameter", occurrences: 120, savingPer: null },
  { pattern: "magic methods (__init__/__str__/__repr__)", occurrences: 15, savingPer: null },
  { pattern: "import/from statements", occurrences: 15, savingPer: null },
  { pattern: "type hints", occurrences: 40, savingPer: null },
  { pattern: "decorators", occurrences: 20, savingPer: null },
  { pattern: "list comprehension", occurrences: 15, savingPer: null },
  { pattern: "dict comprehension", occurrences: 8, savingPer: null },
  { pattern: "with statement", occurrences: 12, savingPer: null },
  { pattern: "try/except/else/finally", occurrences: 10, savingPer: null },
  { pattern: "f-string", occurrences: 25, savingPer: null },
  { pattern: "lambda", occurrences: 8, savingPer: null },
  { pattern: "*args/**kwargs", occurrences: 10, savingPer: null },
  { pattern: "async/await", occurrences: 15, savingPer: null },
  { pattern: "dataclass", occurrences: 5, savingPer: null },
  { pattern: "property getter/setter", occurrences: 8, savingPer: null },
  { pattern: "enumerate/zip", occurrences: 12, savingPer: null },
  { pattern: 'if __name__ == "__main__"', occurrences: 2, savingPer: null },
  { pattern: "match/case", occurrences: 3, savingPer: null },
];

// Map results by name for lookup
const resultByName = {};
for (const r of results) {
  resultByName[r.name] = r;
}

let totalWeightedSaving = 0;
console.log(
  "  " +
    "Pattern".padEnd(43) +
    "Occur".padStart(6) +
    "Save/ea".padStart(8) +
    "Total Save".padStart(11)
);
console.log("  " + "-".repeat(68));

for (const fe of freqEstimates) {
  const r = resultByName[fe.pattern];
  if (!r) continue;
  const totalSave = r.saving * fe.occurrences;
  totalWeightedSaving += totalSave;
  console.log(
    "  " +
      fe.pattern.padEnd(43) +
      String(fe.occurrences).padStart(6) +
      String(r.saving).padStart(8) +
      String(totalSave).padStart(11)
  );
}

console.log("  " + "-".repeat(68));
console.log("  " + "TOTAL ESTIMATED SAVINGS / 1000 lines:".padEnd(57) + String(totalWeightedSaving).padStart(11) + " tokens");
console.log();

// Assume ~8 tokens per line on average for Python
const estimatedTotalTokensPer1000 = 1000 * 8;
const weightedPct = ((totalWeightedSaving / estimatedTotalTokensPer1000) * 100).toFixed(1);
console.log(`  Assuming ~8 tokens/line average: ~${estimatedTotalTokensPer1000} tokens per 1000 lines`);
console.log(`  Estimated compression: ${weightedPct}% token reduction from structure optimization alone`);
console.log();

// Clean up
enc.free();
console.log("Analysis complete.");
