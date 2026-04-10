// Round 1 bottleneck analysis for TypeScript AET.
// For each test file, measure:
//   - what tokens the AET file still contains (categorized)
//   - where the comparable Go file saves more
//   - simulate specific optimizations and report their ROI
import { readFileSync } from "fs";
import { resolve, join } from "path";
import { get_encoding } from "@dqbd/tiktoken";

const enc = get_encoding("cl100k_base");
const count = (s) => enc.encode(s).length;

const suites = [
  { name: "algorithms", dir: "../tests/typescript-algorithms", srcExt: ".ts", aetExt: ".aets" },
  { name: "react",      dir: "../tests/typescript-react",      srcExt: ".tsx", aetExt: ".aetx" },
  { name: "backend",    dir: "../tests/typescript-backend",    srcExt: ".ts", aetExt: ".aets" },
  { name: "types",      dir: "../tests/typescript-types",      srcExt: ".ts", aetExt: ".aets" },
];

// ----- Simulated optimizations -----

// O1: implicit return — remove `^` when it's the first char of a block
//     (approximation: `{^` → `{` where next char is start of expression; drop `;^}` → `;}` for last stmt)
function simImplicitReturn(s) {
  // More aggressive: `{^expr}` where expr has no nested `;^` stays as `{expr}`
  // Approximation: replace `{^` with `{` and `;^` with `;` where a `}` follows after expr.
  // Safer approximation: just count how many `^` tokens there are.
  return s.replace(/;\^/g, ";").replace(/\{\^/g, "{");
}

// O2: JSX text unwrap — `{"word"}` → `word` when word is a safe identifier-like
function simJsxTextUnwrap(s) {
  // Match `{"text"}` where text is alphanumeric + simple punct; replace with raw text.
  return s.replace(/\{"([A-Za-z0-9 +\-:.!?]+)"\}/g, "$1");
}

// O3: range for — `for :=i=0;i<N;i++` → `for i:=0..N`
function simRangeFor(s) {
  return s.replace(/for :=([a-zA-Z_]\w*)=0;\1<([^;{]+);\1\+\+/g, "for $1:=0..$2");
}

// O4: drop trailing standalone expression call like `;main()` at end
function simDropTrailingCall(s) {
  // Only drop if the last statement is just `name()` and there's another earlier decl of the same name
  return s.replace(/;([a-zA-Z_]\w*)\(\)$/gm, "");
}

// O5: drop `->v` (void return type) in interface method signatures
function simDropVoidReturn(s) {
  return s.replace(/->v([;\}\)])/g, "$1");
}

// O6: `Date.now()` → `Dn()`, `new Date()` → `Dt()` (but `Dt` is 1 token, `new Date` is 2)
function simDateAliases(s) {
  return s.replace(/Date\.now/g, "Dn").replace(/new Date\(\)/g, "Dt()");
}

// O7: implicit return for single-statement-body functions — `f(x){^expr}` → `f(x){expr}`
function simSingleStmtReturn(s) {
  // Match: name(params){^expr} where expr has no nested `;`
  // Non-trivial regex; approximate by replacing `{^` with `{` — same as O1.
  return s; // subsumed by O1
}

import { readdirSync, existsSync } from "fs";

const results = [];
let grandTotalTs = 0, grandTotalAet = 0;

for (const suite of suites) {
  const dir = resolve(suite.dir);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter(f => f.endsWith(suite.srcExt));
  for (const file of files) {
    const srcPath = join(dir, file);
    const aetPath = srcPath.replace(/\.(ts|tsx)$/, suite.aetExt);
    if (!existsSync(aetPath)) continue;

    const src = readFileSync(srcPath, "utf-8");
    const aet = readFileSync(aetPath, "utf-8");
    const srcTok = count(src);
    const aetTok = count(aet);
    grandTotalTs += srcTok;
    grandTotalAet += aetTok;

    // Category counts (approximate — based on regex pattern presence)
    const cats = {
      header: count("!ts-v1\n"),
      caret: (aet.match(/\^/g) || []).length, // return prefix
      colonAssign: (aet.match(/:=/g) || []).length, // := for const
      semi: (aet.match(/;/g) || []).length,
      brace: (aet.match(/[{}]/g) || []).length,
      paren: (aet.match(/[()]/g) || []).length,
      bracket: (aet.match(/[\[\]]/g) || []).length,
      angle: (aet.match(/[<>]/g) || []).length,
    };

    // Simulated optimizations
    const opts = {
      O1_implicitRet: count(simImplicitReturn(aet)),
      O2_jsxText: count(simJsxTextUnwrap(aet)),
      O3_rangeFor: count(simRangeFor(aet)),
      O4_dropTrailCall: count(simDropTrailingCall(aet)),
      O5_dropVoidReturn: count(simDropVoidReturn(aet)),
      O6_dateAliases: count(simDateAliases(aet)),
    };

    results.push({
      suite: suite.name,
      file,
      srcTok,
      aetTok,
      savePct: ((srcTok - aetTok) / srcTok * 100).toFixed(1),
      caret: cats.caret,
      opts,
      aetLen: aet.length,
    });
  }
}

// Print per-file report
console.log("\n======== RESIDUAL TOKEN BREAKDOWN ========\n");
console.log(`${"file".padEnd(28)}${"TS".padStart(5)}${"AET".padStart(5)}${"save%".padStart(8)}${"^count".padStart(8)}${"O1".padStart(6)}${"O2".padStart(6)}${"O3".padStart(6)}${"O4".padStart(6)}${"O5".padStart(6)}${"O6".padStart(6)}`);
console.log("-".repeat(94));
for (const r of results) {
  console.log(
    r.file.padEnd(28) +
    String(r.srcTok).padStart(5) +
    String(r.aetTok).padStart(5) +
    (r.savePct + "%").padStart(8) +
    String(r.caret).padStart(8) +
    String(r.opts.O1_implicitRet).padStart(6) +
    String(r.opts.O2_jsxText).padStart(6) +
    String(r.opts.O3_rangeFor).padStart(6) +
    String(r.opts.O4_dropTrailCall).padStart(6) +
    String(r.opts.O5_dropVoidReturn).padStart(6) +
    String(r.opts.O6_dateAliases).padStart(6)
  );
}

// Optimization roll-up
console.log("\n\n======== ESTIMATED TOKENS SAVED PER OPTIMIZATION ========\n");
const optimizations = [
  ["O1", "implicit return (drop `{^` and `;^`)", "opts.O1_implicitRet"],
  ["O2", "unwrap JSX text `{\"word\"}` → `word`", "opts.O2_jsxText"],
  ["O3", "range for: `for :=i=0;i<N;i++` → `for i:=0..N`", "opts.O3_rangeFor"],
  ["O4", "drop trailing main() call", "opts.O4_dropTrailCall"],
  ["O5", "drop `->v` void returns in interface/class", "opts.O5_dropVoidReturn"],
  ["O6", "aliases: Date.now → Dn, new Date → Dt", "opts.O6_dateAliases"],
];
for (const [id, desc, key] of optimizations) {
  let saved = 0;
  for (const r of results) {
    const path = key.split(".");
    let v = r;
    for (const p of path) v = v[p];
    saved += r.aetTok - v;
  }
  const pct = (saved / grandTotalAet * 100).toFixed(1);
  console.log(`  ${id}  ${desc.padEnd(46)} saves ${String(saved).padStart(4)} tokens (${pct}% of current AET)`);
}

// Combined: apply all simultaneously
let combinedTotal = 0;
for (const r of results) {
  const srcPath = join(resolve(suites.find(s => s.name === r.suite).dir), r.file);
  const aetPath = srcPath.replace(/\.(ts|tsx)$/, suites.find(s => s.name === r.suite).aetExt);
  let aet = readFileSync(aetPath, "utf-8");
  aet = simImplicitReturn(aet);
  aet = simJsxTextUnwrap(aet);
  aet = simRangeFor(aet);
  aet = simDropTrailingCall(aet);
  aet = simDropVoidReturn(aet);
  aet = simDateAliases(aet);
  combinedTotal += count(aet);
}
const combinedSave = grandTotalAet - combinedTotal;
const combinedPct = (combinedSave / grandTotalAet * 100).toFixed(1);
const newOverallPct = ((grandTotalTs - combinedTotal) / grandTotalTs * 100).toFixed(1);
console.log(`\n  COMBINED  all 6 optimizations                  saves ${combinedSave} tokens (${combinedPct}% of current AET)`);
console.log(`           new overall compression: ${newOverallPct}% (was ${((grandTotalTs - grandTotalAet) / grandTotalTs * 100).toFixed(1)}%)`);

// Per-suite projected
console.log("\n======== PROJECTED PER-SUITE AFTER COMBINED OPTIMIZATIONS ========\n");
const bySuite = {};
for (const r of results) {
  const srcPath = join(resolve(suites.find(s => s.name === r.suite).dir), r.file);
  const aetPath = srcPath.replace(/\.(ts|tsx)$/, suites.find(s => s.name === r.suite).aetExt);
  let aet = readFileSync(aetPath, "utf-8");
  aet = simImplicitReturn(aet);
  aet = simJsxTextUnwrap(aet);
  aet = simRangeFor(aet);
  aet = simDropTrailingCall(aet);
  aet = simDropVoidReturn(aet);
  aet = simDateAliases(aet);
  const newAet = count(aet);
  if (!bySuite[r.suite]) bySuite[r.suite] = { ts: 0, oldAet: 0, newAet: 0 };
  bySuite[r.suite].ts += r.srcTok;
  bySuite[r.suite].oldAet += r.aetTok;
  bySuite[r.suite].newAet += newAet;
}
for (const [name, a] of Object.entries(bySuite)) {
  const oldPct = ((a.ts - a.oldAet) / a.ts * 100).toFixed(1);
  const newPct = ((a.ts - a.newAet) / a.ts * 100).toFixed(1);
  console.log(`  ${name.padEnd(12)} ${oldPct}% → ${newPct}%  (ts ${a.ts} → old ${a.oldAet} → new ${a.newAet})`);
}

enc.free();
