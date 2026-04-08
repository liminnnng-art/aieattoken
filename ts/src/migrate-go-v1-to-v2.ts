#!/usr/bin/env npx tsx
// migrate-go-v1-to-v2.ts: Migrates AET-Go v1 .aet files to v2 .aetg syntax
// Changes:
// 1. Version marker: !v1/!v2/!v3 -> !go-v2
// 2. Keywords: mk->make, apl->append, ln->len, rng->range, mp->map, flt->filter,
//             ty->type, fn->func, nw->new, cp/cpy->copy, dx->delete
// 3. len(x) -> #x
// 4. s=append(s,x) -> s+=x (when target matches first arg)
// 5. Type abbreviations: float64->f64, int64->i64
// 6. fallthrough -> ft
// 7. File extension: .aet -> .aetg

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, basename, extname } from "path";

function migrateContent(content: string): string {
  let s = content;

  // 1. Version marker
  s = s.replace(/^!v[0-9]+/, "!go-v2");

  // 2. Keyword migrations (word-boundary aware)
  // We must be careful not to replace inside identifiers or strings
  // Strategy: tokenize roughly and replace only standalone keywords

  // Replace abbreviated keywords with full Go forms
  const keywordMap: [RegExp, string][] = [
    // Order matters: longer patterns first
    [/\bcpy\b/g, "copy"],
    [/\bapl\b/g, "append"],
    [/\brng\b/g, "range"],
    [/\bflt\b/g, "filter"],
    [/\bmk\b/g, "make"],
    [/\bln\b/g, "len"],
    [/\bmp\b/g, "map"],
    [/\bty\b/g, "type"],
    [/\bfn\b/g, "func"],
    [/\bnw\b/g, "new"],
    [/\bcp\b/g, "copy"],
    [/\bdx\b/g, "delete"],
  ];

  // Apply outside of string literals
  s = replaceOutsideStrings(s, keywordMap);

  // 3. len(x) -> #x (simple single-arg cases)
  // Pattern: len(identifier) or len(expr.field) — not nested calls
  s = s.replace(/\blen\(([a-zA-Z_][a-zA-Z0-9_.]*)\)/g, "#$1");

  // 4. s=append(s,x) -> s+=x
  // Pattern: ident=append(ident,expr) where both idents match
  // Need to handle the closing paren by matching balanced parens
  s = replaceAppendPattern(s);

  // 5. Type abbreviations — DISABLED
  // f64/i64/f32/i32 are all 2 tokens in cl100k_base, same as float64/int64
  // No savings. Keep canonical Go types for readability.

  // 6. fallthrough -> ft
  s = s.replace(/\bfallthrough\b/g, "ft");

  return s;
}

function replaceAppendPattern(s: string): string {
  // Match: ident=append(ident,expr) where both idents are the same
  // Replace with: ident+=expr (removing the outer parens)
  const pattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)=append\(\1,/g;
  let result = "";
  let lastIdx = 0;
  let match;
  while ((match = pattern.exec(s)) !== null) {
    const name = match[1];
    const afterComma = match.index + match[0].length;
    // Find the matching closing paren
    let depth = 1;
    let j = afterComma;
    while (j < s.length && depth > 0) {
      if (s[j] === "(") depth++;
      else if (s[j] === ")") depth--;
      if (depth > 0) j++;
    }
    if (depth === 0) {
      // Extract the arguments after the comma, before the closing paren
      const args = s.slice(afterComma, j);
      result += s.slice(lastIdx, match.index) + name + "+=" + args;
      lastIdx = j + 1; // skip the closing paren
    }
  }
  result += s.slice(lastIdx);
  return result;
}

function replaceOutsideStrings(s: string, replacements: [RegExp, string][]): string {
  // Split into string literal and non-string segments
  const parts: { text: string; isString: boolean }[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"') {
      // Find end of string
      let j = i + 1;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\') j++; // skip escaped char
        j++;
      }
      parts.push({ text: s.slice(i, j + 1), isString: true });
      i = j + 1;
    } else if (s[i] === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== '`') j++;
      parts.push({ text: s.slice(i, j + 1), isString: true });
      i = j + 1;
    } else if (s[i] === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== "'") {
        if (s[j] === '\\') j++;
        j++;
      }
      parts.push({ text: s.slice(i, j + 1), isString: true });
      i = j + 1;
    } else {
      // Non-string: find next string start
      let j = i + 1;
      while (j < s.length && s[j] !== '"' && s[j] !== '`' && s[j] !== "'") j++;
      parts.push({ text: s.slice(i, j), isString: false });
      i = j;
    }
  }

  // Apply replacements only to non-string parts
  return parts.map(p => {
    if (p.isString) return p.text;
    let text = p.text;
    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }).join("");
}

function migrateFile(inputPath: string, outputPath: string): void {
  const content = readFileSync(inputPath, "utf-8");
  const migrated = migrateContent(content);
  writeFileSync(outputPath, migrated, "utf-8");
  console.log(`  ${basename(inputPath)} -> ${basename(outputPath)}`);
}

function migrateDirectory(dir: string): void {
  const files = readdirSync(dir).filter(f => f.endsWith(".aet"));
  if (files.length === 0) {
    console.log(`No .aet files found in ${dir}`);
    return;
  }

  console.log(`Migrating ${files.length} files in ${dir}:`);
  for (const file of files) {
    const inputPath = join(dir, file);
    const outputName = file.replace(/\.aet$/, ".aetg");
    const outputPath = join(dir, outputName);
    migrateFile(inputPath, outputPath);
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  // Default: migrate all test directories
  const root = join(process.cwd(), "..");
  const dirs = [
    join(root, "tests", "rosettacode"),
    join(root, "tests", "real-world"),
  ];
  for (const dir of dirs) {
    if (existsSync(dir)) {
      migrateDirectory(dir);
    }
  }
  // Also migrate root-level .aet files
  const rootAets = readdirSync(join(root, "tests")).filter(f => f.endsWith(".aet"));
  for (const file of rootAets) {
    const inputPath = join(root, "tests", file);
    const outputPath = join(root, "tests", file.replace(/\.aet$/, ".aetg"));
    migrateFile(inputPath, outputPath);
  }
} else {
  for (const path of args) {
    if (existsSync(path)) {
      migrateFile(path, path.replace(/\.aet$/, ".aetg"));
    } else {
      console.error(`File not found: ${path}`);
    }
  }
}

console.log("\nMigration complete.");
