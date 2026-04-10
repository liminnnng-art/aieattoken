// End-to-end TypeScript test runner — runs inside a single Node process
// to avoid the 90-second Chevrotain parser boot time per file.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { get_encoding } from "@dqbd/tiktoken";
import ts from "typescript";
import { parseTypescriptSource, typescriptToAET, loadTypescriptReverseAliases } from "./dist/reverse/typescript.js";
import { parseTypescriptAET } from "./dist/parser/typescript.js";
import { emitTypescript } from "./dist/emitter/typescript.js";
import { loadTypescriptAliases } from "./dist/transformer/typescript.js";

// Load aliases
const aliasPath = resolve("../stdlib-aliases-typescript.json");
loadTypescriptAliases(aliasPath);
loadTypescriptReverseAliases(aliasPath);

const enc = get_encoding("cl100k_base");
const countTokens = (s) => enc.encode(s).length;

const suites = [
  { name: "algorithms", dir: "../tests/typescript-algorithms", ext: ".ts" },
  { name: "react", dir: "../tests/typescript-react", ext: ".tsx" },
  { name: "backend", dir: "../tests/typescript-backend", ext: ".ts" },
  { name: "types", dir: "../tests/typescript-types", ext: ".ts" },
];

const allRows = [];

function tsToAet(srcPath, ext) {
  const src = readFileSync(srcPath, "utf-8");
  const sf = parseTypescriptSource(src, srcPath);
  const aet = typescriptToAET(sf, { jsx: ext === ".tsx" });
  return { src, aet };
}

function aetToTs(aet) {
  const parseResult = parseTypescriptAET(aet);
  if (parseResult.errors.length > 0) {
    throw new Error(parseResult.errors.join("; "));
  }
  const isJsx = aet.startsWith("!tsx1") || aet.startsWith("!tsx-v");
  return emitTypescript(parseResult.ir, { jsx: isJsx });
}

for (const suite of suites) {
  const dir = resolve(suite.dir);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter(f => f.endsWith(suite.ext) && !f.includes(".rt."));

  for (const file of files) {
    const srcPath = join(dir, file);
    let src, aet, compiled;
    try {
      ({ src, aet } = tsToAet(srcPath, suite.ext));
    } catch (e) {
      allRows.push({ suite: suite.name, file, status: "convert-fail", err: e.message });
      continue;
    }
    const tsTokens = countTokens(src);
    const aetTokens = countTokens(aet);
    const saving = ((tsTokens - aetTokens) / tsTokens * 100).toFixed(1);

    // Save AET output
    const aetExt = suite.ext === ".tsx" ? ".aetx" : ".aets";
    const aetPath = srcPath.replace(/\.(ts|tsx)$/, aetExt);
    writeFileSync(aetPath, aet);

    // Round-trip
    let roundtrip = "OK";
    let rtErr = "";
    try {
      compiled = aetToTs(aet);
    } catch (e) {
      roundtrip = "PARSE-FAIL";
      rtErr = e.message;
    }

    // Check TS parses the compiled output
    if (compiled && roundtrip === "OK") {
      try {
        const sf2 = ts.createSourceFile(
          file,
          compiled,
          ts.ScriptTarget.Latest,
          false,
          suite.ext === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
        if (sf2.parseDiagnostics && sf2.parseDiagnostics.length > 0) {
          // parseDiagnostics is actually the internal diagnostics — any errors here mean malformed
          roundtrip = "EMIT-INVALID";
          rtErr = sf2.parseDiagnostics.map(d => d.messageText).join("; ");
        }
      } catch (e) {
        roundtrip = "EMIT-PARSE-FAIL";
        rtErr = e.message;
      }
    }

    // Save the round-tripped output for inspection
    if (compiled) {
      const rtPath = srcPath.replace(/\.(ts|tsx)$/, `.rt$1`);
      writeFileSync(rtPath, compiled);
    }

    allRows.push({
      suite: suite.name,
      file,
      tsTokens,
      aetTokens,
      saving,
      roundtrip,
      rtErr,
    });
  }
}

// Report
console.log("\n============== SUMMARY ==============\n");
console.log(`${"suite".padEnd(12)}${"file".padEnd(28)}${"TS".padStart(6)}${"AET".padStart(7)}${"save%".padStart(9)}  rt`);
console.log("-".repeat(75));

let totalTs = 0, totalAet = 0, okCount = 0, failCount = 0;
const suiteAgg = {};

for (const row of allRows) {
  if (row.tsTokens === undefined) {
    console.log(`${row.suite.padEnd(12)}${row.file.padEnd(28)}    -     -        -  ${row.status}`);
    failCount++;
    continue;
  }
  totalTs += row.tsTokens;
  totalAet += row.aetTokens;
  if (row.roundtrip === "OK") okCount++; else failCount++;
  if (!suiteAgg[row.suite]) suiteAgg[row.suite] = { ts: 0, aet: 0, count: 0, ok: 0 };
  suiteAgg[row.suite].ts += row.tsTokens;
  suiteAgg[row.suite].aet += row.aetTokens;
  suiteAgg[row.suite].count++;
  if (row.roundtrip === "OK") suiteAgg[row.suite].ok++;
  console.log(
    row.suite.padEnd(12) +
    row.file.padEnd(28) +
    String(row.tsTokens).padStart(6) +
    String(row.aetTokens).padStart(7) +
    (row.saving + "%").padStart(9) +
    "  " + row.roundtrip,
  );
  if (row.rtErr) console.log("             " + row.rtErr);
}

console.log("-".repeat(75));
console.log("\nBy suite:");
for (const [name, a] of Object.entries(suiteAgg)) {
  const sav = ((a.ts - a.aet) / a.ts * 100).toFixed(1);
  console.log(`  ${name.padEnd(12)} ${a.count} files, TS ${a.ts} → AET ${a.aet}, ${sav}% saved, ${a.ok}/${a.count} round-trip OK`);
}

const totalSav = totalTs > 0 ? ((totalTs - totalAet) / totalTs * 100).toFixed(1) : "0";
console.log(`\nOVERALL: ${allRows.length} files, TS ${totalTs} → AET ${totalAet}, ${totalSav}% saved, ${okCount}/${allRows.length} round-trip OK`);

enc.free();
