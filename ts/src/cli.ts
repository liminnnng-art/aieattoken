#!/usr/bin/env node
// Aieattoken CLI — AI-native Go compression tool
// Compress Go code for minimal LLM token usage, transpile back to Go for compilation

import { readFileSync, writeFileSync, watch, existsSync, mkdirSync } from "fs";
import { resolve, dirname, basename, extname, join } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { parse } from "./parser/index.js";
import { transform, loadAliases } from "./transformer/index.js";
import { emit } from "./emitter/index.js";
import { astDiff, formatDiff } from "./ast-diff/index.js";
import { parseGoFile, goAstToIR, irToAET, loadReverseAliases } from "./reverse/index.js";

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

const args = process.argv.slice(2);
const command = args[0];

const VERSION = "0.1.0";

function usage() {
  console.log(`aieattoken v${VERSION} — Compress Go code for AI token efficiency

Usage:
  aet convert <file.go>              Go → AET (saves to .aet file)
  aet convert <file.go> -o <out>     Go → AET (custom output path)
  aet build <file.aet>               AET → Go → compile (produces binary)
  aet build <file.aet> -o <out>      AET → Go → compile (custom binary name)
  aet stats <file.go>                Show token savings analysis
  aet watch <dir>                    Watch directory, auto-convert .go → .aet
  aet compile <file.aet>             AET → Go source (stdout)
  aet compile <file.aet> -o <out>    AET → Go source (file)
  aet diff <f1.aet> <f2.aet>        AST diff between two AET files

Options:
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
  if (!file) { console.error("Usage: aet convert <file.go>"); process.exit(1); }
  const absPath = resolve(file);
  if (!existsSync(absPath)) { console.error(`File not found: ${file}`); process.exit(1); }

  const goCode = readFileSync(absPath, "utf-8");
  const aet = convertGoToAET(absPath, goCode);
  if (!aet) process.exit(1);

  const outIdx = args.indexOf("-o");
  const outPath = outIdx !== -1 && args[outIdx + 1]
    ? resolve(args[outIdx + 1])
    : absPath.replace(/\.go$/, ".aet");

  writeFileSync(outPath, aet);
  console.log(`Converted: ${basename(absPath)} → ${basename(outPath)}`);

  // Show token stats
  const goTokens = countTokensSync(goCode);
  const aetTokens = countTokensSync(aet);
  const savings = ((1 - aetTokens / goTokens) * 100).toFixed(1);
  console.log(`Tokens: ${goTokens} → ${aetTokens} (${savings}% saved)`);
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
  if (!file) { console.error("Usage: aet stats <file.go>"); process.exit(1); }
  const absPath = resolve(file);
  if (!existsSync(absPath)) { console.error(`File not found: ${file}`); process.exit(1); }

  const goCode = readFileSync(absPath, "utf-8");
  const goTokens = countTokensSync(goCode);

  // Convert to AET
  const aet = convertGoToAET(absPath, goCode);
  if (!aet) { console.error("Conversion failed"); process.exit(1); }
  const aetTokens = countTokensSync(aet);

  const savings = ((1 - aetTokens / goTokens) * 100).toFixed(1);
  const saved = goTokens - aetTokens;

  // Display stats
  console.log(`\n  File: ${basename(absPath)}`);
  console.log(`  Go tokens:  ${goTokens}`);
  console.log(`  AET tokens: ${aetTokens}`);
  console.log(`  Saved:      ${saved} tokens (${savings}%)`);
  console.log(`  Lines:      ${goCode.split("\n").length} Go → 1 AET`);

  // Bar visualization
  const barWidth = 40;
  const goBar = "█".repeat(barWidth);
  const aetBar = "█".repeat(Math.round(barWidth * aetTokens / goTokens));
  console.log(`\n  Go:  [${goBar}] ${goTokens}`);
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
  if (!file) { console.error("Usage: aet compile <file.aet>"); process.exit(1); }
  const code = readFileSync(resolve(file), "utf-8");
  const result = compileAET(code);
  if (result.error) { console.error(result.error); process.exit(1); }

  const outIdx = args.indexOf("-o");
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(resolve(args[outIdx + 1]), result.go!);
    console.log(`Written to ${args[outIdx + 1]}`);
  } else {
    process.stdout.write(result.go!);
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
    // Fallback: if go-parser binary not found, give helpful error
    if (e.message?.includes("Failed to parse")) {
      console.error("Error: Go parser not found. Run 'cd go-parser && go build -o goparser' first.");
      console.error("  Or install Go and the parser will be built automatically.");
    } else {
      console.error(`Conversion error: ${e.message}`);
    }
    return null;
  }
}

function compileAET(code: string): { go?: string; error?: string } {
  const ir = compileToIR(code);
  if (ir.error) return { error: ir.error };
  return { go: emit(ir.ir!) };
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
export { compileAET, compileToIR, convertGoToAET };
