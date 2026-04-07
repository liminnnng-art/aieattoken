#!/usr/bin/env node
// Aieattoken CLI — AI-native code compression tool
// Compress Go/Java code for minimal LLM token usage, transpile back for compilation

import { readFileSync, writeFileSync, watch, existsSync, mkdirSync } from "fs";
import { resolve, dirname, basename, extname, join } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { parse } from "./parser/index.js";
import { transform, loadAliases } from "./transformer/index.js";
import { emit } from "./emitter/index.js";
import { emit as emitJava } from "./emitter/java.js";
import { astDiff, formatDiff } from "./ast-diff/index.js";
import { parseGoFile, goAstToIR, irToAET, loadReverseAliases } from "./reverse/index.js";
import { parseJavaFile, javaAstToIR, javaIrToAET, loadJavaReverseAliases } from "./reverse/java.js";

// Resolve paths relative to this package (works for global npm install)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgRoot = resolve(__dirname, "..");   // ts/dist/ → ts/
const projectRoot = resolve(pkgRoot, ".."); // ts/ → aieattoken/

// Find aliases file — check multiple locations
function findAliases(): string | undefined {
  const candidates = [
    resolve(projectRoot, "stdlib-aliases.json"),
    resolve(pkgRoot, "stdlib-aliases.json"),
    resolve(process.cwd(), "stdlib-aliases.json"),
  ];
  return candidates.find(p => existsSync(p));
}

function findJavaAliases(): string | undefined {
  const candidates = [
    resolve(projectRoot, "stdlib-aliases-java.json"),
    resolve(pkgRoot, "stdlib-aliases-java.json"),
    resolve(process.cwd(), "stdlib-aliases-java.json"),
  ];
  return candidates.find(p => existsSync(p));
}

// Find go-parser binary
function findGoParser(): string | undefined {
  const candidates = [
    resolve(projectRoot, "go-parser", "goparser.exe"),
    resolve(projectRoot, "go-parser", "goparser"),
    resolve(pkgRoot, "go-parser", "goparser.exe"),
    resolve(pkgRoot, "go-parser", "goparser"),
  ];
  return candidates.find(p => existsSync(p));
}

// Initialize
const aliasPath = findAliases();
if (aliasPath) {
  loadAliases(aliasPath);
  loadReverseAliases(aliasPath);
}
const javaAliasPath = findJavaAliases();
if (javaAliasPath) {
  loadJavaReverseAliases(javaAliasPath);
}

const args = process.argv.slice(2);
const command = args[0];

const VERSION = "0.2.0";

function usage() {
  console.log(`aieattoken v${VERSION} — Compress Go/Java code for AI token efficiency

Usage:
  aet convert <file.go|.java>        Go/Java → AET (saves to .aet file)
  aet convert <file> -o <out>        Go/Java → AET (custom output path)
  aet build <file.aet>               AET → Go → compile (produces binary)
  aet build <file.aet> -o <out>      AET → Go → compile (custom binary name)
  aet stats <file.go|.java>          Show token savings analysis
  aet watch <dir>                    Watch directory, auto-convert .go/.java → .aet
  aet compile <file.aet>             AET → Go source (stdout, default)
  aet compile <file.aet> --java      AET → Java source (stdout)
  aet compile <file.aet> -o <out>    AET → source (file)
  aet diff <f1.aet> <f2.aet>        AST diff between two AET files

Options:
  --java                             Target Java output (for compile command)
  --version, -v                      Show version
  --help, -h                         Show this help`);
}

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(command ? 0 : 1);
}

if (command === "--version" || command === "-v") {
  console.log(VERSION);
  process.exit(0);
}

switch (command) {
  case "convert":
    cmdConvert();
    break;
  case "build":
    cmdBuild();
    break;
  case "stats":
    cmdStats();
    break;
  case "watch":
    cmdWatch();
    break;
  case "compile":
    cmdCompile();
    break;
  case "diff":
    cmdDiff();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
}

// ============= COMMANDS =============

function cmdConvert() {
  const file = args[1];
  if (!file) { console.error("Usage: aet convert <file.go|.java>"); process.exit(1); }
  const absPath = resolve(file);
  if (!existsSync(absPath)) { console.error(`File not found: ${file}`); process.exit(1); }

  const ext = extname(absPath).toLowerCase();
  const sourceCode = readFileSync(absPath, "utf-8");
  let aet: string | null = null;

  if (ext === ".go") {
    aet = convertGoToAET(absPath, sourceCode);
  } else if (ext === ".java") {
    aet = convertJavaToAET(absPath, sourceCode);
  } else {
    console.error(`Unsupported file type: ${ext} (expected .go or .java)`);
    process.exit(1);
  }

  if (!aet) process.exit(1);

  const outIdx = args.indexOf("-o");
  const outPath = outIdx !== -1 && args[outIdx + 1]
    ? resolve(args[outIdx + 1])
    : absPath.replace(/\.(go|java)$/, ".aet");

  writeFileSync(outPath, aet);
  console.log(`Converted: ${basename(absPath)} → ${basename(outPath)}`);

  // Show token stats
  const srcTokens = countTokensSync(sourceCode);
  const aetTokens = countTokensSync(aet);
  const savings = ((1 - aetTokens / srcTokens) * 100).toFixed(1);
  console.log(`Tokens: ${srcTokens} → ${aetTokens} (${savings}% saved)`);
}

function cmdBuild() {
  const file = args[1];
  if (!file) { console.error("Usage: aet build <file.aet>"); process.exit(1); }
  const absPath = resolve(file);
  if (!existsSync(absPath)) { console.error(`File not found: ${file}`); process.exit(1); }

  const aetCode = readFileSync(absPath, "utf-8");
  const result = compileAET(aetCode);
  if (result.error) { console.error(result.error); process.exit(1); }

  // Write Go source to temp file
  const goFile = absPath.replace(/\.aet$/, ".go");
  writeFileSync(goFile, result.go!);

  // Determine output binary name
  const outIdx = args.indexOf("-o");
  const binName = outIdx !== -1 && args[outIdx + 1]
    ? resolve(args[outIdx + 1])
    : absPath.replace(/\.aet$/, process.platform === "win32" ? ".exe" : "");

  // Compile with Go
  try {
    execSync(`go build -o "${binName}" "${goFile}"`, { stdio: "inherit" });
    console.log(`Built: ${basename(binName)}`);
  } catch {
    console.error("Go compilation failed");
    process.exit(1);
  }
}

function cmdStats() {
  const file = args[1];
  if (!file) { console.error("Usage: aet stats <file.go|.java>"); process.exit(1); }
  const absPath = resolve(file);
  if (!existsSync(absPath)) { console.error(`File not found: ${file}`); process.exit(1); }

  const ext = extname(absPath).toLowerCase();
  const sourceCode = readFileSync(absPath, "utf-8");
  const srcTokens = countTokensSync(sourceCode);

  // Convert to AET
  let aet: string | null;
  if (ext === ".java") {
    aet = convertJavaToAET(absPath, sourceCode);
  } else {
    aet = convertGoToAET(absPath, sourceCode);
  }
  if (!aet) { console.error("Conversion failed"); process.exit(1); }
  const aetTokens = countTokensSync(aet);

  const lang = ext === ".java" ? "Java" : "Go";
  const savings = ((1 - aetTokens / srcTokens) * 100).toFixed(1);
  const saved = srcTokens - aetTokens;

  // Display stats
  console.log(`\n  File: ${basename(absPath)}`);
  console.log(`  ${lang} tokens:  ${srcTokens}`);
  console.log(`  AET tokens: ${aetTokens}`);
  console.log(`  Saved:      ${saved} tokens (${savings}%)`);
  console.log(`  Lines:      ${sourceCode.split("\n").length} ${lang} → 1 AET`);

  // Bar visualization
  const barWidth = 40;
  const srcBar = "█".repeat(barWidth);
  const aetBar = "█".repeat(Math.round(barWidth * aetTokens / srcTokens));
  console.log(`\n  ${lang}:  [${srcBar}] ${srcTokens}`);
  console.log(`  AET: [${aetBar.padEnd(barWidth)}] ${aetTokens}\n`);
}

function cmdWatch() {
  const dir = args[1] || ".";
  const absDir = resolve(dir);
  if (!existsSync(absDir)) { console.error(`Directory not found: ${dir}`); process.exit(1); }

  console.log(`Watching ${absDir} for .go file changes...`);
  console.log("Press Ctrl+C to stop.\n");

  const debounce = new Map<string, NodeJS.Timeout>();

  watch(absDir, { recursive: true }, (event, filename) => {
    if (!filename || !filename.endsWith(".go")) return;
    if (filename.endsWith("_test.go")) return; // Skip test files

    const filePath = resolve(absDir, filename);

    // Debounce: wait 200ms after last change
    if (debounce.has(filePath)) clearTimeout(debounce.get(filePath)!);
    debounce.set(filePath, setTimeout(() => {
      debounce.delete(filePath);
      try {
        const goCode = readFileSync(filePath, "utf-8");
        const aet = convertGoToAET(filePath, goCode);
        if (aet) {
          const aetPath = filePath.replace(/\.go$/, ".aet");
          writeFileSync(aetPath, aet);
          const goTokens = countTokensSync(goCode);
          const aetTokens = countTokensSync(aet);
          const savings = ((1 - aetTokens / goTokens) * 100).toFixed(1);
          console.log(`${filename} → ${basename(aetPath)} (${savings}% saved)`);
        }
      } catch (e: any) {
        console.error(`Error converting ${filename}: ${e.message}`);
      }
    }, 200));
  });
}

function cmdCompile() {
  const file = args[1];
  if (!file) { console.error("Usage: aet compile <file.aet> [--java]"); process.exit(1); }
  const code = readFileSync(resolve(file), "utf-8");
  const targetJava = args.includes("--java");

  const ir = compileToIR(code);
  if (ir.error) { console.error(ir.error); process.exit(1); }

  let output: string;
  if (targetJava) {
    const className = basename(file, ".aet").replace(/^\w/, c => c.toUpperCase());
    output = emitJava(ir.ir!, { className });
  } else {
    output = emit(ir.ir!);
  }

  const outIdx = args.indexOf("-o");
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(resolve(args[outIdx + 1]), output);
    console.log(`Written to ${args[outIdx + 1]}`);
  } else {
    process.stdout.write(output);
  }
}

function cmdDiff() {
  const file1 = args[1];
  const file2 = args[2];
  if (!file1 || !file2) { console.error("Usage: aet diff <f1.aet> <f2.aet>"); process.exit(1); }
  const code1 = readFileSync(resolve(file1), "utf-8");
  const code2 = readFileSync(resolve(file2), "utf-8");
  const ir1 = compileToIR(code1);
  const ir2 = compileToIR(code2);
  if (ir1.error) { console.error(`File 1: ${ir1.error}`); process.exit(1); }
  if (ir2.error) { console.error(`File 2: ${ir2.error}`); process.exit(1); }
  const diff = astDiff(ir1.ir!, ir2.ir!);
  console.log(formatDiff(diff));
  process.exit(diff.equal ? 0 : 1);
}

// ============= CORE FUNCTIONS =============

function convertGoToAET(goFilePath: string, goCode: string): string | null {
  try {
    const goAst = parseGoFile(goFilePath);
    const ir = goAstToIR(goAst);
    return irToAET(ir);
  } catch (e: any) {
    if (e.message?.includes("Failed to parse")) {
      console.error("Error: Go parser not found. Run 'cd go-parser && go build -o goparser' first.");
    } else {
      console.error(`Go conversion error: ${e.message}`);
    }
    return null;
  }
}

function convertJavaToAET(javaFilePath: string, javaCode: string): string | null {
  try {
    const javaAst = parseJavaFile(javaFilePath);
    const ir = javaAstToIR(javaAst);
    return javaIrToAET(ir);
  } catch (e: any) {
    if (e.message?.includes("Failed to parse") || e.message?.includes("ASTDumper")) {
      console.error("Error: Java parser not found. Run 'cd java-parser && javac ASTDumper.java' first.");
      console.error("  Requires JDK 17+.");
    } else {
      console.error(`Java conversion error: ${e.message}`);
    }
    return null;
  }
}

function compileAET(code: string): { go?: string; error?: string } {
  const ir = compileToIR(code);
  if (ir.error) return { error: ir.error };
  return { go: emit(ir.ir!) };
}

function compileAETToJava(code: string, className?: string): { java?: string; error?: string } {
  const ir = compileToIR(code);
  if (ir.error) return { error: ir.error };
  return { java: emitJava(ir.ir!, { className }) };
}

function compileToIR(code: string): { ir?: ReturnType<typeof transform>; error?: string } {
  const parseResult = parse(code);
  if (parseResult.errors.length > 0) {
    return { error: `Parse error: ${parseResult.errors.join("; ")}` };
  }
  if (!parseResult.cst) return { error: "No CST produced" };
  return { ir: transform(parseResult.cst) };
}

// Token counting — imported from isolated module
import { countTokens as countTokensSync } from "./utils/tokencount.js";

// Export for programmatic use
export { compileAET, compileAETToJava, compileToIR, convertGoToAET, convertJavaToAET };
