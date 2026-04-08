#!/usr/bin/env node
// Keyword conflict analysis: AET keywords vs Go/Java/Python/TypeScript
// Checks: language reserved words + stdlib top 100 method/class names
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");
function isSingleToken(s) { return enc.encode(s).length === 1; }

// ============= AET KEYWORDS =============
const aetKeywords = [
  "if", "else", "for", "range", "switch", "case", "default", "select",
  "go", "defer", "make", "append", "len", "cap", "delete", "copy",
  "new", "map", "chan", "const", "var", "true", "false", "nil",
  "struct", "interface", "break", "continue", "fallthrough", "func", "type", "filter",
];

// ============= GO RESERVED WORDS =============
const goReserved = [
  "break", "case", "chan", "const", "continue", "default", "defer", "else",
  "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
  "map", "package", "range", "return", "select", "struct", "switch", "type", "var",
];

// ============= JAVA RESERVED WORDS =============
const javaReserved = [
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new", "package",
  "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient",
  "try", "var", "void", "volatile", "while", "yield", "record", "sealed", "permits",
];

// ============= PYTHON RESERVED WORDS =============
const pythonReserved = [
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally",
  "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
];

// ============= TYPESCRIPT RESERVED WORDS =============
const tsReserved = [
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally",
  "for", "function", "if", "import", "in", "instanceof", "let", "new", "null",
  "return", "super", "switch", "this", "throw", "true", "try", "typeof",
  "var", "void", "while", "with", "yield",
  // TS-specific
  "abstract", "as", "async", "await", "constructor", "declare", "get", "implements",
  "interface", "module", "namespace", "private", "protected", "public", "readonly",
  "require", "set", "static", "type", "from", "of",
];

// ============= JAVA STDLIB TOP 100 method/class names =============
// Methods and class names that commonly appear as identifiers in Java code
const javaStdlibTop100 = [
  // String methods
  "length", "charAt", "substring", "indexOf", "contains", "equals", "trim",
  "split", "replace", "toLowerCase", "toUpperCase", "startsWith", "endsWith",
  "isEmpty", "format", "valueOf", "toString", "toCharArray", "compareTo",
  "matches", "replaceAll", "join",
  // Collection methods
  "add", "get", "set", "remove", "size", "clear", "contains", "isEmpty",
  "put", "containsKey", "keySet", "values", "entrySet", "sort", "stream",
  "filter", "map", "collect", "forEach", "of", "toList",
  // System/IO
  "println", "print", "printf", "close", "read", "write", "flush",
  "readLine", "append", "delete",
  // Object methods
  "hashCode", "getClass", "notify", "wait", "clone",
  // Math
  "abs", "max", "min", "sqrt", "pow", "random", "floor", "ceil", "round",
  // Integer/Long
  "parseInt", "parseLong", "intValue", "longValue",
  // Array/Collections
  "asList", "copyOf", "fill", "sort", "binarySearch", "reverse",
  // Iterator
  "hasNext", "next", "iterator",
  // Thread
  "start", "run", "sleep", "join", "interrupt",
  // File/Path
  "exists", "createFile", "readString", "writeString", "readAllLines",
  // Common class names used as identifiers
  "List", "Map", "Set", "String", "Integer", "Long", "Double", "Boolean",
  "Object", "Class", "Thread", "System", "Math", "Arrays", "Collections",
  "Optional", "Stream", "Path", "File", "Pattern", "Matcher",
  "Exception", "Error", "StringBuilder", "StringBuffer",
  "HashMap", "ArrayList", "HashSet", "TreeMap", "LinkedList",
];

// ============= PYTHON STDLIB TOP 100 =============
const pythonStdlibTop100 = [
  "len", "range", "print", "type", "int", "str", "float", "bool", "list",
  "dict", "set", "tuple", "map", "filter", "zip", "enumerate", "sorted",
  "reversed", "min", "max", "sum", "abs", "round", "any", "all", "input",
  "open", "close", "read", "write", "append", "extend", "insert", "remove",
  "pop", "clear", "copy", "keys", "values", "items", "get", "update",
  "format", "join", "split", "strip", "replace", "find", "index", "count",
  "upper", "lower", "startswith", "endswith", "isinstance", "issubclass",
  "hasattr", "getattr", "setattr", "delattr", "callable", "iter", "next",
  "super", "property", "staticmethod", "classmethod", "abstractmethod",
  "os", "sys", "json", "re", "math", "datetime", "collections", "functools",
  "itertools", "pathlib", "io", "threading", "logging", "unittest",
  "dataclass", "field", "namedtuple", "defaultdict", "Counter",
  "Path", "compile", "match", "search", "sub",
  "sleep", "time", "random", "choice", "randint",
  "dump", "load", "dumps", "loads",
  "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
  "FileNotFoundError", "AttributeError", "RuntimeError",
  "None", "True", "False", "self", "cls",
  "new", "delete", "make",
];

// ============= TYPESCRIPT STDLIB TOP 100 =============
const tsStdlibTop100 = [
  "length", "push", "pop", "shift", "unshift", "splice", "slice", "concat",
  "map", "filter", "reduce", "forEach", "find", "findIndex", "some", "every",
  "includes", "indexOf", "join", "sort", "reverse", "fill", "flat", "flatMap",
  "keys", "values", "entries", "has", "get", "set", "delete", "clear", "size",
  "add", "toString", "valueOf", "charAt", "substring", "split", "replace",
  "trim", "padStart", "padEnd", "startsWith", "endsWith", "match", "search",
  "toLowerCase", "toUpperCase", "repeat", "includes",
  "parse", "stringify", "assign", "freeze", "create", "defineProperty",
  "keys", "values", "entries", "fromEntries", "is",
  "resolve", "reject", "all", "race", "allSettled", "any",
  "then", "catch", "finally",
  "log", "error", "warn", "info", "debug", "dir", "table",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "fetch", "Request", "Response", "Headers",
  "Array", "Object", "String", "Number", "Boolean", "Symbol", "BigInt",
  "Map", "Set", "WeakMap", "WeakSet", "Promise", "Proxy", "Reflect",
  "Date", "RegExp", "Error", "JSON", "Math", "console",
  "Buffer", "process", "require", "module", "exports",
  "new", "delete", "typeof", "instanceof", "void",
  "undefined", "null", "NaN", "Infinity",
  "async", "await", "yield", "super", "this",
  "append", "copy", "len", "cap", "make", "chan", "go", "defer", "select",
];

// ============= ANALYSIS =============

console.log("# AET Keyword Conflict Analysis\n");
console.log(`AET keywords: ${aetKeywords.length}\n`);

const allLanguageReserved = {
  Go: new Set(goReserved.map(s => s.toLowerCase())),
  Java: new Set(javaReserved.map(s => s.toLowerCase())),
  Python: new Set(pythonReserved.map(s => s.toLowerCase())),
  TypeScript: new Set(tsReserved.map(s => s.toLowerCase())),
};

const allStdlib = {
  Go: new Set(), // Go stdlib doesn't conflict since AET was designed for Go
  Java: new Set(javaStdlibTop100.map(s => s.toLowerCase())),
  Python: new Set(pythonStdlibTop100.map(s => s.toLowerCase())),
  TypeScript: new Set(tsStdlibTop100.map(s => s.toLowerCase())),
};

// Categorize each AET keyword
console.log("## Per-Keyword Conflict Report\n");
console.log("| AET Keyword | Go Reserved | Java Reserved | Java Stdlib | Python Reserved | Python Stdlib | TS Reserved | TS Stdlib | Risk Level |");
console.log("|-------------|-------------|---------------|-------------|-----------------|---------------|-------------|-----------|------------|");

const conflicts = [];

for (const kw of aetKeywords) {
  const kwLower = kw.toLowerCase();
  const goRes = allLanguageReserved.Go.has(kwLower) ? "Yes" : "";
  const javaRes = allLanguageReserved.Java.has(kwLower) ? "YES" : "";
  const javaStd = allStdlib.Java.has(kwLower) ? "YES" : "";
  const pyRes = allLanguageReserved.Python.has(kwLower) ? "YES" : "";
  const pyStd = allStdlib.Python.has(kwLower) ? "YES" : "";
  const tsRes = allLanguageReserved.TypeScript.has(kwLower) ? "YES" : "";
  const tsStd = allStdlib.TypeScript.has(kwLower) ? "YES" : "";

  // Risk: how many non-Go languages conflict
  let risk = 0;
  if (javaRes || javaStd) risk++;
  if (pyRes || pyStd) risk++;
  if (tsRes || tsStd) risk++;

  const riskLabel = risk === 0 ? "None" : risk === 1 ? "Low" : risk === 2 ? "Medium" : "HIGH";
  const isGoOnly = goRes && !javaRes && !javaStd && !pyRes && !pyStd && !tsRes && !tsStd;

  console.log(`| \`${kw}\` | ${goRes || "-"} | ${javaRes || "-"} | ${javaStd || "-"} | ${pyRes || "-"} | ${pyStd || "-"} | ${tsRes || "-"} | ${tsStd || "-"} | ${riskLabel} |`);

  if (risk > 0) {
    conflicts.push({ kw, risk, riskLabel, javaRes: !!javaRes, javaStd: !!javaStd, pyRes: !!pyRes, pyStd: !!pyStd, tsRes: !!tsRes, tsStd: !!tsStd });
  }
}

console.log(`\n## Conflicting Keywords (${conflicts.length}/${aetKeywords.length})\n`);
console.log("Keywords that conflict with at least one non-Go language:\n");

// Sort by risk level
conflicts.sort((a, b) => b.risk - a.risk);

for (const c of conflicts) {
  const langs = [];
  if (c.javaRes) langs.push("Java(reserved)");
  if (c.javaStd) langs.push("Java(stdlib)");
  if (c.pyRes) langs.push("Python(reserved)");
  if (c.pyStd) langs.push("Python(stdlib)");
  if (c.tsRes) langs.push("TS(reserved)");
  if (c.tsStd) langs.push("TS(stdlib)");
  console.log(`- **\`${c.kw}\`** [${c.riskLabel}]: conflicts with ${langs.join(", ")}`);
}

// Now generate safe replacements
console.log("\n## Proposed Replacements\n");
console.log("For each conflicting keyword, propose a replacement that:");
console.log("1. Is a single cl100k_base token");
console.log("2. Does NOT conflict with any of the 4 languages' reserved words or stdlib top 100");
console.log("3. Is mnemonic (recognizable)\n");

// All reserved + stdlib combined for conflict check
const allConflicts = new Set();
for (const lang of Object.values(allLanguageReserved)) lang.forEach(w => allConflicts.add(w));
for (const lang of Object.values(allStdlib)) lang.forEach(w => allConflicts.add(w));

function isSafe(candidate) {
  return !allConflicts.has(candidate.toLowerCase()) && isSingleToken(candidate);
}

// Proposed replacements (manually chosen, mnemonic)
const proposals = {
  // Must rename — these conflict with Java/Python/TS stdlib or reserved
  "append":      ["apd", "apl", "apn"],
  "len":         ["ln", "lnx"],
  "cap":         ["cp", "cpa"],
  "delete":      ["del", "dx", "dlt"],
  "copy":        ["cpy", "cpx"],
  "new":         ["nw", "nex"],
  "map":         ["mp", "mx", "mpt"],
  "filter":      ["flt", "flx"],
  "type":        ["ty", "tp", "tpe"],
  "var":         ["vr", "vx"],
  "const":       ["cn", "cst"],
  "true":        ["tru", "tt"],
  "false":       ["fls", "ff"],
  "nil":         ["nl", "nul"],
  "struct":      ["stc", "stx"],
  "interface":   ["ifc", "ifx"],
  "break":       ["brk", "bk"],
  "continue":    ["cnt", "ct"],
  "fallthrough": ["fth", "fthr"],
  "func":        ["fn", "fnc"],
  "switch":      ["sw", "swc"],
  "case":        ["cs", "cse"],
  "default":     ["df", "dft"],
  "select":      ["sel", "slc"],
  "if":          ["if"],  // Keep — universal across all languages
  "else":        ["else"], // Keep — universal
  "for":         ["for"],  // Keep — universal
  "range":       ["rng", "rn"],
  "go":          ["go"],   // Go-specific, low conflict
  "defer":       ["dfr", "df"],
  "make":        ["mk", "mkx"],
  "chan":         ["ch", "chx"],
};

console.log("| Old Keyword | New Keyword | Single Token? | Conflicts? | Mnemonic |");
console.log("|-------------|-------------|---------------|------------|----------|");

const finalMap = {};
for (const c of conflicts) {
  const candidates = proposals[c.kw] || [`${c.kw[0]}${c.kw[1]}`];
  let chosen = null;
  for (const cand of candidates) {
    if (isSafe(cand)) {
      chosen = cand;
      break;
    }
  }
  if (!chosen) chosen = `_${c.kw.substring(0, 2)}`;
  const singleTok = isSingleToken(chosen) ? "Yes" : "NO";
  const safe = isSafe(chosen) ? "None" : "CONFLICT";
  finalMap[c.kw] = chosen;
  console.log(`| \`${c.kw}\` | \`${chosen}\` | ${singleTok} | ${safe} | ${c.kw}→${chosen} |`);
}

// Also check non-conflicting keywords that should stay
console.log("\n## Keywords to Keep (No Conflicts)\n");
for (const kw of aetKeywords) {
  if (!conflicts.find(c => c.kw === kw)) {
    console.log(`- \`${kw}\` — safe, no conflicts with Java/Python/TS`);
  }
}

console.log("\n## Final Migration Map\n");
console.log("```json");
console.log(JSON.stringify(finalMap, null, 2));
console.log("```");

enc.free();
