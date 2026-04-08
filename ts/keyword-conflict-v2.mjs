#!/usr/bin/env node
// Refined keyword conflict analysis — focus on ACTUAL conflicts
// A conflict matters when the AET keyword can appear as an identifier in target language code
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");
function isSingleToken(s) { return enc.encode(s).length === 1; }
function tokenCount(s) { return enc.encode(s).length; }

// AET keywords that are ALSO identifiers in Java/Python/TS stdlib
// These are the ones that cause actual parser failures
const aetKeywordsAsIdentifiers = {
  // Control flow — shared across ALL languages, always a keyword, never an identifier → SAFE
  "if": { safe: true, reason: "Universal control flow — never an identifier in any language" },
  "else": { safe: true, reason: "Universal control flow" },
  "for": { safe: true, reason: "Universal control flow" },
  "break": { safe: true, reason: "Universal control flow" },
  "continue": { safe: true, reason: "Universal control flow" },
  "switch": { safe: true, reason: "Universal control flow" },
  "case": { safe: true, reason: "Universal control flow" },
  "default": { safe: true, reason: "Universal control flow — Java default: always keyword context" },

  // Go-specific — only used in Go AET, no conflict when targeting Java/Python/TS
  "go": { safe: true, reason: "Go-specific (goroutine), not an identifier in other languages" },
  "defer": { safe: true, reason: "Go-specific, not a common identifier" },
  "select": { safe: true, reason: "Go-specific (channel select), not a common identifier" },
  "chan": { safe: true, reason: "Go-specific (channels)" },
  "fallthrough": { safe: true, reason: "Go-specific, extremely rare in other languages" },

  // Literals — these are parsed as literal tokens, not identifiers
  "true": { safe: true, reason: "Boolean literal — always parsed as literal, never identifier" },
  "false": { safe: true, reason: "Boolean literal" },
  "nil": { safe: true, reason: "Null literal" },

  // Type-related — used in declarations, rarely appear where identifiers go
  "struct": { safe: true, reason: "Only appears after @ in AET (@Struct)" },
  "const": { safe: true, reason: "Declaration keyword — const x=... never ambiguous" },
  "var": { safe: true, reason: "Declaration keyword — var x:type=... never ambiguous" },

  // *** ACTUAL CONFLICTS — These appear as method/field names in Java/Python/TS ***
  "append": { safe: false, reason: "Java StringBuilder.append(), Python list.append(), TS Array.append()" },
  "len": { safe: false, reason: "Python len(), Go len(), appears as .length in Java → conflicts with identifiers starting with 'len'" },
  "cap": { safe: false, reason: "Go cap(), could appear as identifier prefix" },
  "delete": { safe: false, reason: "Java Collection.delete(), Python del, TS delete operator, Map.delete()" },
  "copy": { safe: false, reason: "Python copy(), Java System.arraycopy(), TS structuredClone" },
  "new": { safe: false, reason: "Java/TS new keyword used in expressions — critical conflict" },
  "map": { safe: false, reason: "Java Map class, Python map(), TS Array.map() — VERY frequent identifier" },
  "filter": { safe: false, reason: "Java Stream.filter(), Python filter(), TS Array.filter() — frequent" },
  "make": { safe: false, reason: "Python make, TS make — less common but still conflicts" },
  "func": { safe: false, reason: "Appears as prefix 'func' in identifiers like 'function', 'functools'" },
  "type": { safe: false, reason: "Python type(), TS type keyword — conflicts as identifier" },
  "interface": { safe: false, reason: "Java interface keyword, TS interface — but in AET only after @, so partially safe; problem is identifier 'interface{}' in type contexts" },
  "range": { safe: false, reason: "Python range(), TS/Java method name — appears in for loops" },
};

// All reserved words + stdlib combined for safety check
const allReserved = new Set([
  // Go
  "break","case","chan","const","continue","default","defer","else","fallthrough","for",
  "func","go","goto","if","import","interface","map","package","range","return","select",
  "struct","switch","type","var",
  // Java
  "abstract","assert","boolean","break","byte","case","catch","char","class","const",
  "continue","default","do","double","else","enum","extends","final","finally","float",
  "for","goto","if","implements","import","instanceof","int","interface","long","native",
  "new","package","private","protected","public","return","short","static","strictfp",
  "super","switch","synchronized","this","throw","throws","transient","try","var","void",
  "volatile","while","yield","record","sealed","permits",
  // Python
  "false","none","true","and","as","assert","async","await","break","class","continue",
  "def","del","elif","else","except","finally","for","from","global","if","import","in",
  "is","lambda","nonlocal","not","or","pass","raise","return","try","while","with","yield",
  // TypeScript
  "break","case","catch","class","const","continue","debugger","default","delete","do",
  "else","enum","export","extends","false","finally","for","function","if","import","in",
  "instanceof","let","new","null","return","super","switch","this","throw","true","try",
  "typeof","var","void","while","with","yield","abstract","as","async","await","constructor",
  "declare","get","implements","interface","module","namespace","private","protected","public",
  "readonly","require","set","static","type","from","of",
].map(s => s.toLowerCase()));

// Top identifiers across Java/Python/TS stdlib
const topIdentifiers = new Set([
  "length","charat","substring","indexof","contains","equals","trim","split","replace",
  "tolowercase","touppercase","startswith","endswith","isempty","format","valueof","tostring",
  "tochararray","compareto","matches","replaceall","join","add","get","set","remove","size",
  "clear","put","containskey","keyset","values","entryset","sort","stream","filter","map",
  "collect","foreach","of","tolist","println","print","printf","close","read","write","flush",
  "readline","append","delete","hashcode","getclass","notify","wait","clone","abs","max","min",
  "sqrt","pow","random","floor","ceil","round","parseint","parselong","intvalue","longvalue",
  "aslist","copyof","fill","binarysearch","reverse","hasnext","next","iterator","start","run",
  "sleep","join","interrupt","exists","createfile","readstring","writestring","readalllines",
  "list","map","set","string","integer","long","double","boolean","object","class","thread",
  "system","math","arrays","collections","optional","stream","path","file","pattern","matcher",
  "exception","error","stringbuilder","stringbuffer","hashmap","arraylist","hashset","treemap",
  "linkedlist","len","range","print","type","int","str","float","bool","dict","tuple","zip",
  "enumerate","sorted","reversed","sum","any","all","input","open","extend","insert","pop",
  "keys","items","update","find","index","count","upper","lower","isinstance","issubclass",
  "hasattr","getattr","setattr","delattr","callable","iter","super","property","staticmethod",
  "classmethod","abstractmethod","push","shift","unshift","splice","concat","reduce","findindex",
  "some","every","includes","flat","flatmap","has","tofixed","padstart","padend","match","search",
  "repeat","parse","stringify","assign","freeze","create","defineproperty","fromentries",
  "resolve","reject","race","allsettled","then","catch","finally","log","warn","info","debug",
  "dir","table","settimeout","setinterval","cleartimeout","clearinterval","fetch","request",
  "response","headers","buffer","process","require","module","exports","undefined","nan","infinity",
  "copy","new","make","func","cap",
].map(s => s.toLowerCase()));

function isSafe(candidate) {
  const lower = candidate.toLowerCase();
  return !allReserved.has(lower) && !topIdentifiers.has(lower) && isSingleToken(candidate);
}

console.log("# Refined AET Keyword Conflict Analysis\n");

// Split into safe vs needs-rename
const safeKeys = [];
const needsRename = [];
for (const [kw, info] of Object.entries(aetKeywordsAsIdentifiers)) {
  if (info.safe) safeKeys.push(kw);
  else needsRename.push({ kw, reason: info.reason });
}

console.log(`## Safe Keywords (${safeKeys.length} — keep as-is)\n`);
console.log("These never appear as identifiers in Java/Python/TS, so they don't cause parser conflicts:\n");
for (const kw of safeKeys) {
  console.log(`- \`${kw}\` — ${aetKeywordsAsIdentifiers[kw].reason}`);
}

console.log(`\n## Must Rename (${needsRename.length} keywords)\n`);
console.log("These conflict with method/field/class names in Java/Python/TS:\n");

// Generate safe replacements
const candidates = {
  "append":    ["apl", "apd", "apn", "aps"],
  "len":       ["ln", "lnx", "lng"],
  "cap":       ["cp", "cpa", "cpx"],
  "delete":    ["dx", "dlt", "dlx"],
  "copy":      ["cpy", "cpx", "cpc"],
  "new":       ["nw", "nwx", "nex"],
  "map":       ["mp", "mpt", "mpx"],
  "filter":    ["flt", "flx", "ftr"],
  "make":      ["mk", "mkx", "mke"],
  "func":      ["fn", "fnc", "fnx"],
  "type":      ["ty", "tpe", "tyx"],
  "interface": ["ifc", "ifx", "itf"],
  "range":     ["rng", "rnx", "rn"],
  "map":       ["mp", "mpt", "mpx"],
};

console.log("| # | Old Keyword | Proposed New | Tokens | Safe? | Reason for conflict |");
console.log("|---|-------------|-------------|--------|-------|---------------------|");

const finalMap = {};
let i = 0;
for (const { kw, reason } of needsRename) {
  i++;
  const cands = candidates[kw] || [`_${kw.substring(0, 2)}`];
  let chosen = null;
  for (const c of cands) {
    if (isSafe(c)) { chosen = c; break; }
  }
  if (!chosen) {
    // Try more aggressive abbreviations
    for (const prefix of ["_", "x"]) {
      const c = prefix + kw.substring(0, 2);
      if (isSafe(c)) { chosen = c; break; }
    }
  }
  if (!chosen) chosen = `_${kw.substring(0, 3)}`;

  const toks = tokenCount(chosen);
  const safe = isSafe(chosen);
  finalMap[kw] = chosen;
  console.log(`| ${i} | \`${kw}\` | \`${chosen}\` | ${toks} | ${safe ? "Yes" : "NO"} | ${reason.substring(0, 60)} |`);
}

// Verify no duplicates in chosen names
const chosenValues = Object.values(finalMap);
const dupes = chosenValues.filter((v, i) => chosenValues.indexOf(v) !== i);
if (dupes.length > 0) {
  console.log(`\nWARNING: Duplicate replacements: ${dupes.join(", ")}`);
}

console.log("\n## Complete Migration Map\n");
console.log("```");
console.log("Old        → New     (tokens)");
console.log("─────────────────────────────");
for (const [old, nw] of Object.entries(finalMap)) {
  console.log(`${old.padEnd(12)}→ ${nw.padEnd(8)} (${tokenCount(nw)} token${tokenCount(nw) > 1 ? 's' : ''})`);
}
console.log("```");

console.log("\n## Unchanged Keywords\n");
console.log("```");
for (const kw of safeKeys) {
  console.log(`${kw.padEnd(12)}  (keep — ${tokenCount(kw)} token${tokenCount(kw) > 1 ? 's' : ''})`);
}
console.log("```");

// Token impact analysis
console.log("\n## Token Impact\n");
let tokensBefore = 0, tokensAfter = 0;
for (const [old, nw] of Object.entries(finalMap)) {
  tokensBefore += tokenCount(old);
  tokensAfter += tokenCount(nw);
}
console.log(`Keywords renamed: ${Object.keys(finalMap).length}`);
console.log(`Total tokens before: ${tokensBefore}`);
console.log(`Total tokens after: ${tokensAfter}`);
console.log(`Net change per occurrence: ${tokensAfter - tokensBefore} tokens`);
console.log(`(Most renamed keywords go from 1 token to 1 token — no token cost increase)`);

enc.free();
