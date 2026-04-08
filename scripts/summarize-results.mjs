import { readFileSync } from "fs";
import { resolve, basename } from "path";

const data = JSON.parse(readFileSync("scripts/python-tiktoken-results.json", "utf-8"));

console.log("=== PER-FILE SUMMARY ===");
console.log("File | Lines | Tokens | Keywords% | Idents% | Self% | Docstr% | Import% | Decor% | TypeHint%");
console.log("---|---|---|---|---|---|---|---|---|---");

let totalTokens = 0;
let totalLines = 0;

for (const f of data) {
  const s = f.summary;
  const name = basename(f.file);
  console.log(`${name} | ${f.lines} | ${s.total_tokens} | ${s.keyword_pct} | ${s.identifier_pct} | ${s.self_pct} | ${s.docstring_pct} | ${s.import_pct} | ${s.decorator_pct} | ${s.type_hint_pct}`);
  totalTokens += s.total_tokens;
  totalLines += f.lines;
}

console.log("");
console.log(`TOTAL: ${totalLines} lines, ${totalTokens} tokens`);
console.log("");

// Aggregate category breakdown
const allCats = {};
for (const f of data) {
  for (const [cat, info] of Object.entries(f.category_breakdown)) {
    if (!allCats[cat]) allCats[cat] = { count: 0, tokens: 0 };
    allCats[cat].count += info.count;
    allCats[cat].tokens += info.cl100k_tokens;
  }
}

console.log("=== AGGREGATE CATEGORY BREAKDOWN ===");
const sorted = Object.entries(allCats).sort((a, b) => b[1].tokens - a[1].tokens);
for (const [cat, info] of sorted) {
  console.log(`${cat}: ${info.tokens} tokens (${(info.tokens / totalTokens * 100).toFixed(1)}%), count=${info.count}`);
}

// Keyword frequency
console.log("");
console.log("=== AGGREGATE KEYWORD FREQUENCY ===");
const kwFreq = {};
for (const f of data) {
  for (const [kw, count] of Object.entries(f.keyword_frequency)) {
    kwFreq[kw] = (kwFreq[kw] || 0) + count;
  }
}
const kwSorted = Object.entries(kwFreq).sort((a, b) => b[1] - a[1]);
for (const [kw, count] of kwSorted) {
  console.log(`  ${kw}: ${count}`);
}

// Self analysis
console.log("");
console.log("=== SELF USAGE AGGREGATE ===");
let totalSelfParam = 0, totalSelfAttr = 0, totalSelfMethod = 0;
for (const f of data) {
  if (f.self_info) {
    totalSelfParam += f.self_info.self_param;
    totalSelfAttr += f.self_info.self_attr;
    totalSelfMethod += f.self_info.self_method;
  }
}
console.log(`self as parameter: ${totalSelfParam}`);
console.log(`self.attr access: ${totalSelfAttr}`);
console.log(`self.method() call: ${totalSelfMethod}`);
console.log(`total self: ${totalSelfParam + totalSelfAttr + totalSelfMethod}`);

// Indent analysis
console.log("");
console.log("=== INDENTATION AGGREGATE ===");
let totalIndentSpaces = 0, totalIndentedLines = 0;
for (const f of data) {
  if (f.indent_info) {
    totalIndentSpaces += f.indent_info.total_indent_spaces;
    totalIndentedLines += f.indent_info.indented_lines;
  }
}
console.log(`total indent spaces: ${totalIndentSpaces}`);
console.log(`indented lines: ${totalIndentedLines}`);
console.log(`avg indent per indented line: ${(totalIndentSpaces / totalIndentedLines).toFixed(1)} spaces`);

// Structure analysis
console.log("");
console.log("=== STRUCTURE COUNTS AGGREGATE ===");
const structs = {};
for (const f of data) {
  if (f.structure_info && f.structure_info.structures) {
    for (const [s, count] of Object.entries(f.structure_info.structures)) {
      structs[s] = (structs[s] || 0) + count;
    }
  }
}
const structSorted = Object.entries(structs).sort((a, b) => b[1] - a[1]);
for (const [s, count] of structSorted) {
  console.log(`  ${s}: ${count}`);
}

// Top identifiers (most frequent across all files)
console.log("");
console.log("=== TOP 30 IDENTIFIERS (by total frequency) ===");
const allIdents = {};
for (const f of data) {
  if (f.top_identifiers) {
    for (const [ident, info] of f.top_identifiers) {
      if (!allIdents[ident]) allIdents[ident] = { freq: 0, tokens: info.cl100k_tokens };
      allIdents[ident].freq += info.frequency;
    }
  }
}
const identSorted = Object.entries(allIdents).sort((a, b) => b[1].freq - a[1].freq);
for (const [ident, info] of identSorted.slice(0, 30)) {
  console.log(`  ${ident}: freq=${info.freq}, cl100k=${info.tokens} tokens each, total=${info.freq * info.tokens}`);
}

// Docstring analysis
console.log("");
console.log("=== DOCSTRING AGGREGATE ===");
let totalDocCount = 0, totalDocTokens = 0;
for (const f of data) {
  if (f.docstring_info) {
    totalDocCount += f.docstring_info.count;
    totalDocTokens += f.docstring_info.total_tokens;
  }
}
console.log(`docstring count: ${totalDocCount}`);
console.log(`docstring tokens: ${totalDocTokens} (${(totalDocTokens / totalTokens * 100).toFixed(1)}%)`);
