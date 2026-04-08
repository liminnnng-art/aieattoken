/**
 * Python Token Counter using cl100k_base
 * Takes JSON output from python-token-analyzer.py and counts tokens per category.
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../ts/node_modules/.package-lock.json"));
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");

function countTokens(text) {
  if (!text) return 0;
  return enc.encode(text).length;
}

function analyzeFile(fileData) {
  const { file, lines, non_empty_lines, source, category_tokens, indent_text,
    indent_info, structure_info, self_info, docstring_info, identifier_frequency } = fileData;

  // Count total tokens for the full source
  const totalTokens = countTokens(source);

  // Count tokens per category by joining category token strings
  const categoryTokenCounts = {};
  let categorizedTotal = 0;

  for (const [category, tokens] of Object.entries(category_tokens)) {
    // For indentation, count the actual indentation text
    if (category === 'indentation') {
      const indentTokens = countTokens(indent_text);
      categoryTokenCounts[category] = {
        count: tokens.length,
        cl100k_tokens: indentTokens,
        examples: tokens.slice(0, 3),
      };
      categorizedTotal += indentTokens;
      continue;
    }

    // For whitespace (newlines), each newline is typically part of surrounding context
    if (category === 'whitespace') {
      const wsText = tokens.join('');
      const wsTokens = countTokens(wsText);
      categoryTokenCounts[category] = {
        count: tokens.length,
        cl100k_tokens: wsTokens,
        examples: [],
      };
      categorizedTotal += wsTokens;
      continue;
    }

    // For other categories, count tokens for each string individually
    // This is more accurate because tiktoken merges adjacent characters
    let catTokens = 0;
    for (const tok of tokens) {
      catTokens += countTokens(tok);
    }

    categoryTokenCounts[category] = {
      count: tokens.length,
      cl100k_tokens: catTokens,
      examples: [...new Set(tokens)].slice(0, 10),
    };
    categorizedTotal += catTokens;
  }

  // Variable name analysis
  const identTokens = category_tokens.identifier || [];
  const uniqueIdents = new Set(identTokens);
  let totalIdentTokens = 0;
  const identDetails = {};
  for (const ident of uniqueIdents) {
    const freq = identifier_frequency[ident] || 0;
    const tokCount = countTokens(ident);
    totalIdentTokens += tokCount * freq;
    identDetails[ident] = { frequency: freq, cl100k_tokens: tokCount };
  }

  // self analysis
  const selfTokens = category_tokens.self || [];
  const selfClTokens = selfTokens.length; // 'self' is 1 token in cl100k_base

  // Docstring token analysis
  let docstringTokens = 0;
  if (docstring_info && docstring_info.docstrings) {
    for (const ds of docstring_info.docstrings) {
      docstringTokens += countTokens('"""' + ds + '"""');
    }
  }

  // Keyword analysis - count per keyword
  const keywords = category_tokens.keyword || [];
  const keywordFreq = {};
  for (const kw of keywords) {
    keywordFreq[kw] = (keywordFreq[kw] || 0) + 1;
  }
  let keywordTokens = 0;
  for (const [kw, freq] of Object.entries(keywordFreq)) {
    keywordTokens += countTokens(kw) * freq;
  }

  // Type hint token estimation
  // Count annotations from the source using regex
  const typeHintMatches = source.match(/:\s*(?:Optional|Union|List|Dict|Tuple|Set|Callable|Iterator|AsyncIterator|Generator|Any|int|str|float|bool|None|bytes)\b[^\n=]*/g) || [];
  const returnAnnotations = source.match(/->\s*[^\n:]+(?=:)/g) || [];
  let typeHintTokens = 0;
  for (const th of [...typeHintMatches, ...returnAnnotations]) {
    typeHintTokens += countTokens(th);
  }

  // Import analysis
  const importLines = source.split('\n').filter(l => l.trim().startsWith('import ') || l.trim().startsWith('from '));
  let importTokens = 0;
  for (const il of importLines) {
    importTokens += countTokens(il);
  }

  // Decorator analysis
  const decoratorLines = source.split('\n').filter(l => l.trim().startsWith('@'));
  let decoratorTokens = 0;
  for (const dl of decoratorLines) {
    decoratorTokens += countTokens(dl);
  }

  return {
    file,
    lines,
    non_empty_lines,
    total_cl100k_tokens: totalTokens,
    category_breakdown: categoryTokenCounts,
    summary: {
      total_tokens: totalTokens,
      keyword_tokens: keywordTokens,
      keyword_pct: (keywordTokens / totalTokens * 100).toFixed(1),
      identifier_tokens: totalIdentTokens,
      identifier_pct: (totalIdentTokens / totalTokens * 100).toFixed(1),
      self_tokens: selfClTokens,
      self_pct: (selfClTokens / totalTokens * 100).toFixed(1),
      docstring_tokens: docstringTokens,
      docstring_pct: (docstringTokens / totalTokens * 100).toFixed(1),
      import_tokens: importTokens,
      import_pct: (importTokens / totalTokens * 100).toFixed(1),
      decorator_tokens: decoratorTokens,
      decorator_pct: (decoratorTokens / totalTokens * 100).toFixed(1),
      type_hint_tokens: typeHintTokens,
      type_hint_pct: (typeHintTokens / totalTokens * 100).toFixed(1),
    },
    keyword_frequency: keywordFreq,
    self_info: self_info,
    structure_info: structure_info,
    indent_info: indent_info,
    docstring_info: {
      count: docstring_info?.count || 0,
      total_tokens: docstringTokens,
    },
    top_identifiers: Object.entries(identDetails)
      .sort((a, b) => b[1].frequency - a[1].frequency)
      .slice(0, 30),
  };
}

// Main
const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: node python-tiktoken-counter.mjs <analysis.json>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(inputFile, 'utf-8'));
const results = data.map(analyzeFile);

// Print results
console.log(JSON.stringify(results, null, 2));
