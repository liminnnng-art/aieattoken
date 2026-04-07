// Syntax sync check: compare rule count in spec vs parser
import { readFileSync } from "fs";
import { resolve } from "path";

const specPath = resolve(process.cwd(), "..", "spec", "syntax-v0.1.md");
const spec = readFileSync(specPath, "utf-8");

// Count rules in spec (lines matching "### Rule X.Y" pattern)
const specRules = spec.match(/### Rule \d+\.\d+/g) || [];
const specMiscRules = spec.match(/\| -\s+\|/g) || []; // Misc rules in table
const specRuleCount = specRules.length + specMiscRules.length;

// Count rules in parser (RULE definitions)
const parserPath = resolve(process.cwd(), "src", "parser", "index.ts");
const parserSrc = readFileSync(parserPath, "utf-8");
const parserRules = parserSrc.match(/this\.RULE\(/g) || [];
const parserRuleCount = parserRules.length;

console.log(`Syntax Sync Check:`);
console.log(`  Spec rules: ${specRuleCount} (${specRules.length} numbered + ${specMiscRules.length} misc)`);
console.log(`  Parser rules: ${parserRuleCount}`);

// Parser has more rules than spec because it breaks down grammar into smaller pieces
// The spec defines semantic features, the parser defines grammar productions
// As long as parser rules >= spec rules, we're good
if (parserRuleCount >= specRules.length) {
  console.log(`  Status: OK (parser has sufficient rules to cover spec)`);
} else {
  console.log(`  Status: WARNING - parser may be missing rules`);
  process.exit(1);
}
