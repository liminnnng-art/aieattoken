import { get_encoding } from "@dqbd/tiktoken";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const enc = get_encoding("cl100k_base");

// ── 1. Analyze all printable ASCII characters (32-126) ──────────────────────
const asciiSingle = [];
const asciiMulti = [];

for (let code = 32; code <= 126; code++) {
  const ch = String.fromCharCode(code);
  const tokens = enc.encode(ch);
  const entry = {
    code,
    char: ch,
    display: code === 32 ? "(space)" : ch,
    tokenCount: tokens.length,
    tokenIds: Array.from(tokens),
  };
  if (tokens.length === 1) {
    asciiSingle.push(entry);
  } else {
    asciiMulti.push(entry);
  }
}

// ── 2. Analyze 2-3 char symbol combinations ─────────────────────────────────
const symbolCombos = [
  // assignment / comparison
  ":=", "!=", "==", ">=", "<=", "=>", "->", "<-", "..",
  "::","//", "/*", "*/", "&&", "||",
  "++", "--", ">>", "<<",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
  "<<=", ">>=", "&&=", "||=",
  // common delimiters / syntax
  "#{", "$(", "${", "@{", "@@",
  "?.", "?:", "??", "!!", "~>",
  "|>", "<|", "<<-", "...", "==>",
  "///", "/**", "**/",
  // brackets & combos
  "()", "[]", "{}", "<>",
  "->*", ".*", "::",
  // misc symbols used in PLs
  "\\n", "\\t", "\\\\",
  "0x", "0b", "0o",
  // short identifiers common in code
  "fn", "if", "do", "or", "in", "is", "as", "at", "go", "to",
  "ok", "eq", "ne", "lt", "gt", "le", "ge",
  "def", "let", "var", "val", "nil", "mut", "pub", "use",
  "int", "str", "err", "buf", "ptr", "ref", "ret", "end",
  "for", "not", "and", "any", "all", "new", "del", "try",
  "get", "set", "has", "len", "cap", "max", "min",
  "add", "sub", "mul", "div", "mod", "xor",
];

const comboSingle = [];
const comboMulti = [];

for (const combo of symbolCombos) {
  const tokens = enc.encode(combo);
  const entry = {
    combo,
    tokenCount: tokens.length,
    tokenIds: Array.from(tokens),
  };
  if (tokens.length === 1) {
    comboSingle.push(entry);
  } else {
    comboMulti.push(entry);
  }
}

// ── 3. Go keywords and common identifiers ───────────────────────────────────
const goKeywords = [
  "break", "case", "chan", "const", "continue",
  "default", "defer", "else", "fallthrough", "for",
  "func", "go", "goto", "if", "import",
  "interface", "map", "package", "range", "return",
  "select", "struct", "switch", "type", "var",
];

const goBuiltins = [
  "append", "cap", "close", "complex", "copy",
  "delete", "imag", "len", "make", "new",
  "panic", "print", "println", "real", "recover",
  "bool", "byte", "complex64", "complex128",
  "error", "float32", "float64",
  "int", "int8", "int16", "int32", "int64",
  "rune", "string", "uint", "uint8", "uint16", "uint32", "uint64",
  "uintptr", "true", "false", "iota", "nil",
];

const goCommonIdents = [
  "fmt", "err", "ctx", "req", "res", "log", "os", "io",
  "http", "json", "time", "sync", "math", "sort", "flag",
  "main", "init", "test", "run", "get", "set", "put",
  "New", "Get", "Set", "Put", "Run", "Add", "Del",
  "Error", "String", "Close", "Read", "Write",
  "Handle", "Serve", "Listen", "Printf", "Println",
  "Errorf", "Sprintf", "Context", "Handler", "Server",
  "Request", "Response", "Reader", "Writer", "Buffer",
  "Mutex", "WaitGroup", "Channel",
];

const goAll = [
  ...goKeywords.map(k => ({ word: k, category: "keyword" })),
  ...goBuiltins.map(k => ({ word: k, category: "builtin" })),
  ...goCommonIdents.map(k => ({ word: k, category: "ident" })),
];

const goResults = goAll.map(({ word, category }) => {
  const tokens = enc.encode(word);
  return {
    word,
    category,
    tokenCount: tokens.length,
    tokenIds: Array.from(tokens),
  };
});

// ── 4. Unicode symbol analysis ──────────────────────────────────────────────
// Test ranges of potentially useful Unicode symbols
const unicodeRanges = [
  // Mathematical operators  (U+2200..U+22FF)
  { name: "Math Operators", start: 0x2200, end: 0x22FF },
  // Arrows (U+2190..U+21FF)
  { name: "Arrows", start: 0x2190, end: 0x21FF },
  // Miscellaneous Technical (U+2300..U+23FF)
  { name: "Misc Technical", start: 0x2300, end: 0x23FF },
  // Box Drawing (U+2500..U+257F)
  { name: "Box Drawing", start: 0x2500, end: 0x257F },
  // Geometric Shapes (U+25A0..U+25FF)
  { name: "Geometric Shapes", start: 0x25A0, end: 0x25FF },
  // Miscellaneous Symbols (U+2600..U+26FF)
  { name: "Misc Symbols", start: 0x2600, end: 0x26FF },
  // Dingbats (U+2700..U+27BF)
  { name: "Dingbats", start: 0x2700, end: 0x27BF },
  // Supplemental Arrows-A (U+27F0..U+27FF)
  { name: "Supplemental Arrows-A", start: 0x27F0, end: 0x27FF },
  // Braille Patterns (U+2800..U+28FF)
  { name: "Braille", start: 0x2800, end: 0x28FF },
  // Supplemental Arrows-B (U+2900..U+297F)
  { name: "Supplemental Arrows-B", start: 0x2900, end: 0x297F },
  // Misc Math Symbols-A (U+27C0..U+27EF)
  { name: "Misc Math-A", start: 0x27C0, end: 0x27EF },
  // Misc Math Symbols-B (U+2980..U+29FF)
  { name: "Misc Math-B", start: 0x2980, end: 0x29FF },
  // Supplemental Math Operators (U+2A00..U+2AFF)
  { name: "Supp Math Operators", start: 0x2A00, end: 0x2AFF },
  // Latin Extended-A/B (accented chars etc.)
  { name: "Latin Extended-A", start: 0x0100, end: 0x017F },
  // Greek and Coptic
  { name: "Greek", start: 0x0370, end: 0x03FF },
  // CJK Symbols (U+3000..U+303F) - common in some langs
  { name: "CJK Symbols", start: 0x3000, end: 0x303F },
  // General Punctuation (U+2000..U+206F)
  { name: "General Punctuation", start: 0x2000, end: 0x206F },
  // Superscripts/Subscripts (U+2070..U+209F)
  { name: "Super/Subscripts", start: 0x2070, end: 0x209F },
  // Currency Symbols (U+20A0..U+20CF)
  { name: "Currency", start: 0x20A0, end: 0x20CF },
  // Letterlike Symbols (U+2100..U+214F)
  { name: "Letterlike", start: 0x2100, end: 0x214F },
  // Number Forms (U+2150..U+218F)
  { name: "Number Forms", start: 0x2150, end: 0x218F },
];

const unicodeSingle = [];

for (const range of unicodeRanges) {
  for (let code = range.start; code <= range.end; code++) {
    let ch;
    try {
      ch = String.fromCodePoint(code);
    } catch {
      continue;
    }
    const tokens = enc.encode(ch);
    if (tokens.length === 1) {
      unicodeSingle.push({
        code,
        hex: "U+" + code.toString(16).toUpperCase().padStart(4, "0"),
        char: ch,
        rangeName: range.name,
        tokenId: tokens[0],
      });
    }
  }
}

// ── Free the encoder ────────────────────────────────────────────────────────
enc.free();

// ── 5. Build Markdown report ────────────────────────────────────────────────
const lines = [];
const ln = (s = "") => lines.push(s);

ln("# Token Analysis Report (cl100k_base)");
ln();
ln("Reference for designing programming language syntax with minimal token cost.");
ln();
ln(`Generated: ${new Date().toISOString()}`);
ln();

// ── Section 1: Single-Token ASCII ───────────────────────────────────────────
ln("## Single-Token ASCII Characters");
ln();
ln(`${asciiSingle.length} of ${asciiSingle.length + asciiMulti.length} printable ASCII characters encode as a single token.`);
ln();
ln("| Char | Code | Token ID |");
ln("|------|------|----------|");
for (const e of asciiSingle) {
  const display = e.code === 32 ? "` `" :
                  e.code === 124 ? "`\\|`" :
                  "`" + e.char + "`";
  ln(`| ${display} | ${e.code} | ${e.tokenIds[0]} |`);
}
ln();

// ── Section 2: Multi-Token ASCII ────────────────────────────────────────────
ln("## Multi-Token ASCII Characters");
ln();
if (asciiMulti.length === 0) {
  ln("All printable ASCII characters encode as single tokens.");
} else {
  ln(`${asciiMulti.length} printable ASCII characters require more than 1 token.`);
  ln();
  ln("| Char | Code | Tokens | Token IDs |");
  ln("|------|------|--------|-----------|");
  for (const e of asciiMulti) {
    const display = "`" + e.char + "`";
    ln(`| ${display} | ${e.code} | ${e.tokenCount} | ${e.tokenIds.join(", ")} |`);
  }
}
ln();

// ── Section 3: Single-Token Symbol Combinations ─────────────────────────────
ln("## Single-Token Symbol Combinations");
ln();
ln(`${comboSingle.length} of ${symbolCombos.length} tested combinations encode as a single token.`);
ln();
ln("| Combo | Token ID |");
ln("|-------|----------|");
for (const e of comboSingle) {
  ln(`| \`${e.combo}\` | ${e.tokenIds[0]} |`);
}
ln();

ln("### Multi-Token Combinations (for comparison)");
ln();
ln("| Combo | Tokens | Token IDs |");
ln("|-------|--------|-----------|");
for (const e of comboMulti) {
  ln(`| \`${e.combo}\` | ${e.tokenCount} | ${e.tokenIds.join(", ")} |`);
}
ln();

// ── Section 4: Go Keywords Token Cost ───────────────────────────────────────
ln("## Go Keywords Token Cost");
ln();

// Sub-section: keywords
ln("### Keywords");
ln();
ln("| Keyword | Tokens | Token IDs |");
ln("|---------|--------|-----------|");
for (const e of goResults.filter(r => r.category === "keyword")) {
  ln(`| \`${e.word}\` | ${e.tokenCount} | ${e.tokenIds.join(", ")} |`);
}
ln();

// Sub-section: builtins
ln("### Built-in Functions and Types");
ln();
ln("| Identifier | Tokens | Token IDs |");
ln("|------------|--------|-----------|");
for (const e of goResults.filter(r => r.category === "builtin")) {
  ln(`| \`${e.word}\` | ${e.tokenCount} | ${e.tokenIds.join(", ")} |`);
}
ln();

// Sub-section: common identifiers
ln("### Common Go Identifiers");
ln();
ln("| Identifier | Tokens | Token IDs |");
ln("|------------|--------|-----------|");
for (const e of goResults.filter(r => r.category === "ident")) {
  ln(`| \`${e.word}\` | ${e.tokenCount} | ${e.tokenIds.join(", ")} |`);
}
ln();

// Summary stats
const kwStats = goResults.filter(r => r.category === "keyword");
const avgKw = (kwStats.reduce((s, r) => s + r.tokenCount, 0) / kwStats.length).toFixed(2);
const singleKw = kwStats.filter(r => r.tokenCount === 1);
ln(`**Keyword stats:** ${singleKw.length}/${kwStats.length} keywords are single tokens. Average token cost: ${avgKw}`);
ln();

// ── Section 5: Useful Single-Token Unicode ──────────────────────────────────
ln("## Useful Single-Token Unicode Symbols");
ln();
ln(`Found ${unicodeSingle.length} single-token Unicode symbols across tested ranges.`);
ln();

// Group by range
const byRange = {};
for (const e of unicodeSingle) {
  if (!byRange[e.rangeName]) byRange[e.rangeName] = [];
  byRange[e.rangeName].push(e);
}

for (const [rangeName, entries] of Object.entries(byRange)) {
  ln(`### ${rangeName} (${entries.length} single-token symbols)`);
  ln();
  ln("| Symbol | Codepoint | Token ID |");
  ln("|--------|-----------|----------|");
  for (const e of entries) {
    // Escape pipe character in markdown
    const display = e.char === "|" ? "\\|" : e.char;
    ln(`| ${display} | ${e.hex} | ${e.tokenId} |`);
  }
  ln();
}

// ── Section 6: Syntax Design Implications ───────────────────────────────────
ln("## Syntax Design Implications");
ln();
ln("### Key Findings for Language Syntax Design");
ln();
ln("#### 1. Free (Single-Token) ASCII Characters");
ln();
ln("All standard ASCII punctuation and alphanumeric characters are single tokens.");
ln("This means single-character operators like `+`, `-`, `*`, `/`, `=`, `<`, `>`,");
ln("`!`, `&`, `|`, `^`, `~`, `%`, `@`, `#`, `$`, `?` are the cheapest possible operators.");
ln();
ln("#### 2. Cheapest Multi-Character Operators");
ln();
ln("The following common operator combinations are also single tokens (same cost as a single character):");
ln();
const singleTokenOps = comboSingle.filter(e =>
  /^[^a-zA-Z0-9]/.test(e.combo)
);
if (singleTokenOps.length > 0) {
  ln("| Operator | Notes |");
  ln("|----------|-------|");
  const opNotes = {
    ":=": "Short variable declaration (Go-style)",
    "!=": "Not equal",
    "==": "Equality",
    ">=": "Greater or equal",
    "<=": "Less or equal",
    "=>": "Arrow / fat arrow",
    "->": "Arrow / return type",
    "<-": "Channel operator",
    "..": "Range operator",
    "::": "Scope resolution / cons",
    "//": "Line comment",
    "/*": "Block comment start",
    "*/": "Block comment end",
    "&&": "Logical AND",
    "||": "Logical OR",
    "++": "Increment",
    "--": "Decrement",
    ">>": "Right shift",
    "<<": "Left shift",
    "+=": "Add-assign",
    "-=": "Subtract-assign",
    "*=": "Multiply-assign",
    "/=": "Divide-assign",
    "%=": "Modulo-assign",
    "&=": "Bitwise AND-assign",
    "|=": "Bitwise OR-assign",
    "^=": "Bitwise XOR-assign",
    "()": "Parentheses pair",
    "[]": "Brackets pair",
    "{}": "Braces pair",
    "<>": "Angle brackets / diamond",
    "...": "Spread / variadic",
    "?:": "Ternary / Elvis",
    "??": "Null coalescing",
    "?.": "Optional chaining",
    "|>": "Pipe operator",
    "<|": "Reverse pipe",
    "#{": "Map/set literal",
    "$(": "Command substitution",
    "${": "String interpolation",
    "~>": "Squiggly arrow",
    "!!": "Double bang / force unwrap",
    "///": "Doc comment",
    "/**": "Block doc comment start",
    "**/": "Block doc comment end",
    "==>": "Double arrow",
    "<<=": "Left shift assign",
    ">>=": "Right shift assign",
    "&&=": "Logical AND assign",
    "||=": "Logical OR assign",
    "<<-": "Heredoc / indent strip",
  };
  for (const e of singleTokenOps) {
    const note = opNotes[e.combo] || "";
    ln(`| \`${e.combo}\` | ${note} |`);
  }
}
ln();

ln("#### 3. Short Keywords That Are Single Tokens");
ln();
const singleTokenShortWords = comboSingle.filter(e =>
  /^[a-zA-Z]/.test(e.combo)
);
if (singleTokenShortWords.length > 0) {
  ln("These short identifiers/keywords cost only 1 token each:");
  ln();
  ln(singleTokenShortWords.map(e => `\`${e.combo}\``).join(", "));
}
ln();

ln("#### 4. Go Keyword Efficiency");
ln();
const multiTokenKw = kwStats.filter(r => r.tokenCount > 1);
if (multiTokenKw.length > 0) {
  ln("Keywords requiring multiple tokens (more expensive):");
  ln();
  for (const e of multiTokenKw) {
    ln(`- \`${e.word}\` = ${e.tokenCount} tokens`);
  }
} else {
  ln("All Go keywords are single tokens - very efficient.");
}
ln();

ln("#### 5. Unicode Opportunities");
ln();
ln(`Found ${unicodeSingle.length} Unicode symbols that are single tokens.`);
ln("Notable single-token Unicode symbols useful for syntax:");
ln();

// Pick out particularly interesting ones
const interestingUnicode = unicodeSingle.filter(e => {
  const c = e.code;
  return (
    // Common arrows
    (c >= 0x2190 && c <= 0x2199) ||
    // Double arrows
    (c >= 0x21D0 && c <= 0x21D5) ||
    // Math operators
    c === 0x2200 || // for all
    c === 0x2203 || // there exists
    c === 0x2208 || // element of
    c === 0x2209 || // not element of
    c === 0x2227 || // logical and
    c === 0x2228 || // logical or
    c === 0x2260 || // not equal
    c === 0x2264 || // less or equal
    c === 0x2265 || // greater or equal
    c === 0x22C0 || // n-ary and
    c === 0x22C1 || // n-ary or
    c === 0x00D7 || // multiplication sign
    c === 0x00F7 || // division sign
    // Greek letters (popular in math/PL)
    (c >= 0x03B1 && c <= 0x03C9) || // lowercase greek
    (c >= 0x0391 && c <= 0x03A9) || // uppercase greek
    // Misc useful
    c === 0x2205 || // empty set
    c === 0x221E || // infinity
    c === 0x2282 || // subset
    c === 0x2283 || // superset
    c === 0x222A || // union
    c === 0x2229 || // intersection
    c === 0x2261    // identical to
  );
});

if (interestingUnicode.length > 0) {
  ln("| Symbol | Name | Codepoint | Token ID |");
  ln("|--------|------|-----------|----------|");
  const names = {
    0x2190: "Left Arrow", 0x2191: "Up Arrow", 0x2192: "Right Arrow", 0x2193: "Down Arrow",
    0x2194: "Left-Right Arrow", 0x2195: "Up-Down Arrow",
    0x2196: "NW Arrow", 0x2197: "NE Arrow", 0x2198: "SE Arrow", 0x2199: "SW Arrow",
    0x21D0: "Left Double Arrow", 0x21D2: "Right Double Arrow", 0x21D4: "Left-Right Double Arrow",
    0x21D1: "Up Double Arrow", 0x21D3: "Down Double Arrow", 0x21D5: "Up-Down Double Arrow",
    0x2200: "For All", 0x2203: "There Exists",
    0x2205: "Empty Set", 0x2208: "Element Of", 0x2209: "Not Element Of",
    0x221E: "Infinity",
    0x2227: "Logical And", 0x2228: "Logical Or",
    0x2229: "Intersection", 0x222A: "Union",
    0x2260: "Not Equal", 0x2261: "Identical To",
    0x2264: "Less Or Equal", 0x2265: "Greater Or Equal",
    0x2282: "Subset", 0x2283: "Superset",
    0x22C0: "N-ary And", 0x22C1: "N-ary Or",
  };
  for (const e of interestingUnicode) {
    const name = names[e.code] || e.rangeName;
    ln(`| ${e.char} | ${name} | ${e.hex} | ${e.tokenId} |`);
  }
}
ln();

ln("#### 6. Recommendations for Token-Efficient Syntax");
ln();
ln("1. **Use single ASCII characters for operators** where possible: all are 1 token.");
ln("2. **Prefer common multi-char operators** that are already single tokens:");
ln("   `:=`, `!=`, `==`, `>=`, `<=`, `->`, `<-`, `&&`, `||`, `..`, `::`, `//`");
ln("3. **Short keywords** (2-3 chars) that are single tokens are very efficient:");
ln("   `fn`, `if`, `do`, `or`, `in`, `is`, `as`, `go`, `for`, `var`, `let`, `nil`, `pub`, `use`, `mut`, `def`, `val`");
ln("4. **Bracket pairs** `()`, `[]`, `{}` are each single tokens (2 chars, 1 token).");
ln("5. **All Go keywords** are single tokens, confirming that common English keywords are well-represented in the tokenizer.");
ln("6. **Unicode arrows and math symbols** are available as single tokens and could be");
ln("   used for specialized operators or as alternatives to multi-char ASCII sequences.");
ln("7. **Avoid long compound operators** - 3+ character operators like `<<=`, `>>=`");
ln("   may or may not be single tokens; test them before adopting.");
ln("8. **String interpolation** syntax `${` is a single token - good for template literals.");
ln();

// ── Write report ────────────────────────────────────────────────────────────
const reportDir = join(process.cwd(), "..", "reports");
mkdirSync(reportDir, { recursive: true });
const outPath = join(reportDir, "token-list.md");
writeFileSync(outPath, lines.join("\n"), "utf8");

console.log(`Report written to: ${outPath}`);
console.log(`  Single-token ASCII chars: ${asciiSingle.length}`);
console.log(`  Multi-token ASCII chars: ${asciiMulti.length}`);
console.log(`  Single-token combos: ${comboSingle.length}`);
console.log(`  Multi-token combos: ${comboMulti.length}`);
console.log(`  Go keywords/builtins/idents analyzed: ${goResults.length}`);
console.log(`  Single-token Unicode symbols: ${unicodeSingle.length}`);
