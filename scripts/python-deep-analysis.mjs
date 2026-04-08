/**
 * Deep compression potential analysis for Python code.
 * Measures actual token savings by stripping each category and comparing.
 */
import { createRequire } from "module";
import { readFileSync, readdirSync } from "fs";
import { dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../ts/node_modules/.package-lock.json"));
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");

function countTokens(text) {
  if (!text) return 0;
  return enc.encode(text).length;
}

function verifyToken(text) {
  const tokens = enc.encode(text);
  return { text, tokens: tokens.length, tokenIds: [...tokens] };
}

// Read all Python test files
const testDir = resolve(__dirname, "../tests/python-real-world");
const files = readdirSync(testDir).filter(f => f.endsWith(".py"));

const allResults = [];
const aggregateCompression = {};

for (const file of files) {
  const path = resolve(testDir, file);
  const source = readFileSync(path, "utf-8");
  const originalTokens = countTokens(source);
  const lines = source.split("\n");
  const nonEmptyLines = lines.filter(l => l.trim()).length;

  // === 1. INDENTATION ANALYSIS ===
  // Remove all leading whitespace, replace with { } scope markers
  let noIndent = "";
  let prevIndent = 0;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!trimmed) {
      noIndent += "\n";
      continue;
    }
    const indent = line.length - trimmed.length;
    noIndent += trimmed + "\n";
  }
  const noIndentTokens = countTokens(noIndent);
  const indentSaving = originalTokens - noIndentTokens;

  // Replace indentation with { } braces (AET style)
  let bracedCode = "";
  let currentIndent = 0;
  const indentStack = [0];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!trimmed) continue;
    const indent = line.length - trimmed.length;
    if (indent > currentIndent) {
      bracedCode += "{";
      indentStack.push(indent);
    } else if (indent < currentIndent) {
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
        bracedCode += "}";
        indentStack.pop();
      }
    }
    currentIndent = indent;
    // Remove colon at end of block starters
    let cleanLine = trimmed;
    if (/^(def |class |if |elif |else|for |while |with |try|except|finally|async |match |case )/.test(trimmed)) {
      cleanLine = trimmed.replace(/:$/, "");
    }
    bracedCode += cleanLine + ";";
  }
  while (indentStack.length > 1) {
    bracedCode += "}";
    indentStack.pop();
  }
  const bracedTokens = countTokens(bracedCode);

  // === 2. DOCSTRING REMOVAL ===
  const noDocstrings = source.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, (match, offset) => {
    // Only remove if it's at the start of a function/class/module body
    // Simplified: remove all triple-quoted strings
    return "";
  });
  const noDocstringTokens = countTokens(noDocstrings);
  const docstringSaving = originalTokens - noDocstringTokens;

  // === 3. TYPE HINT REMOVAL ===
  // Remove parameter annotations, return annotations
  let noTypeHints = source;
  // Remove return type annotations: -> Type
  noTypeHints = noTypeHints.replace(/->\s*[^\n:]+(?=\s*:)/g, "");
  // Remove parameter annotations: param: Type (but not assignments like x: int = 5 in class body)
  // This is tricky - do line-level analysis
  const noTypeHintLines = [];
  for (const line of noTypeHints.split("\n")) {
    let processed = line;
    // In def signatures, remove ": Type" from parameters
    if (/^\s*(async\s+)?def\s/.test(line)) {
      // Remove param annotations in function signature
      processed = processed.replace(/(\w+)\s*:\s*(?:Optional|Union|List|Dict|Tuple|Set|Callable|Iterator|AsyncIterator|Generator|Any|int|str|float|bool|bytes|None|Type|Sequence|Mapping|Iterable|Awaitable|Coroutine|Protocol|ClassVar|Final|Literal|TypeVar|Generic|Annotated|Self|Never|TypeAlias|TypeGuard|ParamSpec|Concatenate|Unpack|TypeVarTuple|override|dataclass_transform|runtime_checkable|SupportsFloat|SupportsInt|SupportsIndex|SupportsAbs|SupportsRound|SupportsBytes|SupportsComplex|Pattern|Match|IO|TextIO|BinaryIO|NamedTuple|TypedDict|OrderedDict|DefaultDict|Counter|Deque|ChainMap)\b[^,\)=]*/g, (match, name) => {
        return name;
      });
    }
    noTypeHintLines.push(processed);
  }
  noTypeHints = noTypeHintLines.join("\n");
  const noTypeHintTokens = countTokens(noTypeHints);
  const typeHintSaving = originalTokens - noTypeHintTokens;

  // === 4. SELF REMOVAL ===
  // Replace self.x with .x, remove self from params
  let noSelf = source;
  // Remove 'self' as first parameter
  noSelf = noSelf.replace(/\(self,\s*/g, "(");
  noSelf = noSelf.replace(/\(self\)/g, "()");
  // Replace self. with .
  noSelf = noSelf.replace(/self\./g, ".");
  const noSelfTokens = countTokens(noSelf);
  const selfSaving = originalTokens - noSelfTokens;

  // === 5. IMPORT REMOVAL ===
  const noImports = lines.filter(l => !l.trim().startsWith("import ") && !l.trim().startsWith("from ")).join("\n");
  const noImportTokens = countTokens(noImports);
  const importSaving = originalTokens - noImportTokens;

  // === 6. COMMENT REMOVAL ===
  const noComments = lines.map(l => {
    const idx = l.indexOf("#");
    if (idx >= 0) {
      // Make sure it's not inside a string
      const before = l.slice(0, idx);
      const singleCount = (before.match(/'/g) || []).length;
      const doubleCount = (before.match(/"/g) || []).length;
      if (singleCount % 2 === 0 && doubleCount % 2 === 0) {
        return l.slice(0, idx).trimEnd();
      }
    }
    return l;
  }).join("\n");
  const noCommentTokens = countTokens(noComments);
  const commentSaving = originalTokens - noCommentTokens;

  // === 7. KEYWORD COMPRESSION ===
  // Simulate replacing verbose keywords with shorter ones
  let compressed = source;
  const kwReplacements = [
    [/\bdef\b/g, "fn"],
    [/\breturn\b/g, "^"],
    [/\bclass\b/g, "@"],
    [/\belif\b/g, "ei"],
    [/\blambda\b/g, "\\"],
    [/\bimport\b/g, "im"],
    [/\bexcept\b/g, "ex"],
    [/\braise\b/g, "!"],
    [/\basync\b/g, "ac"],
    [/\bawait\b/g, "aw"],
    [/\byield\b/g, "yd"],
    [/\bcontinue\b/g, "cn"],
    [/\bfinally\b/g, "fy"],
    [/\bglobal\b/g, "gl"],
    [/\bnonlocal\b/g, "nl"],
    [/\bbreaker\b/g, "br"],
    [/\bassert\b/g, "as!"],
    [/\bNone\b/g, "nil"],
    [/\bTrue\b/g, "T"],
    [/\bFalse\b/g, "F"],
    [/\bisinstance\b/g, "is?"],
  ];
  // Don't actually apply all - just estimate
  let kwSaving = 0;
  // def (207 uses) → fn saves ~0 tokens each (both are 1 token)
  // return (186 uses) → ^ saves 0 tokens (return is 1 token, ^ is 1 token)
  // None (121 uses) → nil saves 0 tokens
  // class (52 uses) → @ saves 0 tokens
  // Keyword compression has limited ROI because most Python keywords are already 1 cl100k_base token!

  // === 8. DECORATOR ANALYSIS ===
  const decoratorLines = lines.filter(l => l.trim().startsWith("@"));
  let decoratorTokens = 0;
  for (const dl of decoratorLines) {
    decoratorTokens += countTokens(dl);
  }

  // === 9. __init__ / magic method compression ===
  let noMagic = source;
  noMagic = noMagic.replace(/__init__/g, "new");
  noMagic = noMagic.replace(/__str__/g, "str");
  noMagic = noMagic.replace(/__repr__/g, "rp");
  noMagic = noMagic.replace(/__eq__/g, "eq");
  noMagic = noMagic.replace(/__hash__/g, "hs");
  noMagic = noMagic.replace(/__enter__/g, "en");
  noMagic = noMagic.replace(/__exit__/g, "ex");
  noMagic = noMagic.replace(/__aenter__/g, "aen");
  noMagic = noMagic.replace(/__aexit__/g, "aex");
  noMagic = noMagic.replace(/__lt__/g, "lt");
  noMagic = noMagic.replace(/__le__/g, "le");
  noMagic = noMagic.replace(/__gt__/g, "gt");
  noMagic = noMagic.replace(/__ge__/g, "ge");
  noMagic = noMagic.replace(/__len__/g, "ln");
  noMagic = noMagic.replace(/__iter__/g, "it");
  noMagic = noMagic.replace(/__next__/g, "nx");
  noMagic = noMagic.replace(/__getitem__/g, "gi");
  noMagic = noMagic.replace(/__setitem__/g, "si");
  noMagic = noMagic.replace(/__contains__/g, "ct");
  noMagic = noMagic.replace(/__call__/g, "cl");
  noMagic = noMagic.replace(/__set_name__/g, "sn");
  noMagic = noMagic.replace(/__get__/g, "get");
  noMagic = noMagic.replace(/__set__/g, "set");
  const noMagicTokens = countTokens(noMagic);
  const magicSaving = originalTokens - noMagicTokens;

  // === 10. COMBINED COMPRESSION (all strategies) ===
  // Start with source, apply everything
  let fullyCompressed = source;
  // Remove docstrings
  fullyCompressed = fullyCompressed.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, "");
  // Remove comments
  fullyCompressed = fullyCompressed.split("\n").map(l => {
    const idx = l.indexOf("#");
    if (idx >= 0) {
      const before = l.slice(0, idx);
      const singleCount = (before.match(/'/g) || []).length;
      const doubleCount = (before.match(/"/g) || []).length;
      if (singleCount % 2 === 0 && doubleCount % 2 === 0) {
        return l.slice(0, idx).trimEnd();
      }
    }
    return l;
  }).join("\n");
  // Remove imports
  fullyCompressed = fullyCompressed.split("\n").filter(l => !l.trim().startsWith("import ") && !l.trim().startsWith("from ")).join("\n");
  // Remove self
  fullyCompressed = fullyCompressed.replace(/\(self,\s*/g, "(");
  fullyCompressed = fullyCompressed.replace(/\(self\)/g, "()");
  fullyCompressed = fullyCompressed.replace(/self\./g, ".");
  // Compress magic methods
  fullyCompressed = fullyCompressed.replace(/__init__/g, "new");
  fullyCompressed = fullyCompressed.replace(/__str__/g, "$s");
  fullyCompressed = fullyCompressed.replace(/__repr__/g, "$r");
  fullyCompressed = fullyCompressed.replace(/__eq__/g, "$eq");
  fullyCompressed = fullyCompressed.replace(/__hash__/g, "$h");
  fullyCompressed = fullyCompressed.replace(/__\w+__/g, m => "$" + m.slice(2, -2).slice(0, 2));
  // Remove leading whitespace (braces would be added by parser)
  fullyCompressed = fullyCompressed.split("\n").map(l => l.trimStart()).filter(l => l).join(";");
  // Remove trailing colons on block starters
  fullyCompressed = fullyCompressed.replace(/(def |class |if |elif |else|for |while |with |try|except|finally|async |match |case .*?);/g, "$1;");
  // Remove empty lines
  fullyCompressed = fullyCompressed.replace(/;{2,}/g, ";");

  const fullyCompressedTokens = countTokens(fullyCompressed);
  const totalSaving = originalTokens - fullyCompressedTokens;
  const savingPct = (totalSaving / originalTokens * 100).toFixed(1);

  const result = {
    file,
    original_tokens: originalTokens,
    lines: lines.length,
    non_empty_lines: nonEmptyLines,
    compression: {
      indentation: { saving: indentSaving, pct: (indentSaving / originalTokens * 100).toFixed(1) },
      braces_vs_indent: { braced_tokens: bracedTokens, vs_original: originalTokens - bracedTokens, pct: ((originalTokens - bracedTokens) / originalTokens * 100).toFixed(1) },
      docstrings: { saving: docstringSaving, pct: (docstringSaving / originalTokens * 100).toFixed(1) },
      type_hints: { saving: typeHintSaving, pct: (typeHintSaving / originalTokens * 100).toFixed(1) },
      self: { saving: selfSaving, pct: (selfSaving / originalTokens * 100).toFixed(1) },
      imports: { saving: importSaving, pct: (importSaving / originalTokens * 100).toFixed(1) },
      comments: { saving: commentSaving, pct: (commentSaving / originalTokens * 100).toFixed(1) },
      magic_methods: { saving: magicSaving, pct: (magicSaving / originalTokens * 100).toFixed(1) },
      decorators: { tokens: decoratorTokens, pct: (decoratorTokens / originalTokens * 100).toFixed(1) },
    },
    combined: {
      compressed_tokens: fullyCompressedTokens,
      saving: totalSaving,
      saving_pct: savingPct,
    },
  };

  allResults.push(result);
}

// Print results
console.log("=== COMPRESSION POTENTIAL PER FILE ===\n");
console.log("File | Orig | Indent% | Docstr% | TypeH% | Self% | Import% | Comment% | Magic% | Combined% ");
console.log("---|---|---|---|---|---|---|---|---|---");

let totalOrig = 0, totalCompressed = 0;
for (const r of allResults) {
  const c = r.compression;
  console.log(`${r.file} | ${r.original_tokens} | ${c.indentation.pct} | ${c.docstrings.pct} | ${c.type_hints.pct} | ${c.self.pct} | ${c.imports.pct} | ${c.comments.pct} | ${c.magic_methods.pct} | ${r.combined.saving_pct}`);
  totalOrig += r.original_tokens;
  totalCompressed += r.combined.compressed_tokens;
}

console.log("");
const totalSavingPct = ((totalOrig - totalCompressed) / totalOrig * 100).toFixed(1);
console.log(`TOTAL: ${totalOrig} → ${totalCompressed} tokens (${totalSavingPct}% saving)`);

// Aggregate savings by category
console.log("\n=== AGGREGATE SAVINGS BY CATEGORY ===\n");
const cats = ["indentation", "docstrings", "type_hints", "self", "imports", "comments", "magic_methods"];
for (const cat of cats) {
  let totalSaving = 0;
  for (const r of allResults) {
    totalSaving += r.compression[cat].saving;
  }
  console.log(`${cat}: ${totalSaving} tokens (${(totalSaving / totalOrig * 100).toFixed(1)}%)`);
}

// cl100k_base token verification for proposed AET-Python keywords
console.log("\n=== CL100K_BASE TOKEN VERIFICATION ===\n");
const candidates = [
  "fn", "^", "@", "ei", "\\", "im", "ex", "!", "ac", "aw", "yd",
  "cn", "fy", "gl", "nl", "br", "nil", "T", "F", "{", "}", ";",
  "new", "$s", "$r", "$eq", "$h", ".x", "->", ":=", "?", "?!",
  "if", "for", "in", "is", "or", "and", "not", "with", "as",
  "def", "return", "class", "import", "from", "yield", "async",
  "await", "raise", "try", "except", "finally", "lambda", "pass",
  "break", "continue", "elif", "else", "while", "del", "assert",
  "global", "nonlocal", "True", "False", "None", "match", "case",
  "isinstance", "self", "property", "staticmethod", "classmethod",
  "abstractmethod", "dataclass", "super", "print", "len", "range",
  "enumerate", "zip", "map", "filter", "sorted", "reversed",
  "isinstance", "issubclass", "hasattr", "getattr", "setattr",
  "__init__", "__str__", "__repr__", "__eq__", "__hash__",
  "__enter__", "__exit__", "__len__", "__iter__", "__next__",
  "__getitem__", "__setitem__", "__contains__", "__call__",
];

console.log("Token | cl100k tokens | Token IDs");
for (const c of candidates) {
  const info = verifyToken(c);
  const marker = info.tokens === 1 ? "OK" : "MULTI";
  console.log(`${c} | ${info.tokens} [${marker}] | ${JSON.stringify(info.tokenIds)}`);
}

// Output full results as JSON
const fs = await import("fs");
fs.writeFileSync("scripts/python-deep-results.json", JSON.stringify(allResults, null, 2));
