// Reverse transpiler: Go → IR → AET
// Uses the Go CLI parser (go-parser/main.go) to get JSON AST, then converts to IR, then to AET

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import * as IR from "../ir.js";

// Load stdlib aliases for reverse mapping
let reverseAliasMap: Record<string, string> = {};  // "fmt.Println" → "pl"

export function loadReverseAliases(path?: string) {
  try {
    const p = path || resolve(process.cwd(), "..", "stdlib-aliases.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    const aliases = data.aliases || {};
    for (const [alias, info] of Object.entries(aliases) as [string, any][]) {
      reverseAliasMap[info.go] = alias;
    }
  } catch { /* optional */ }
}

/**
 * Locate the go-parser binary. Search in order of preference:
 *   1. Relative to this module (ts/dist/reverse → ts → aieattoken/go-parser)
 *   2. Project root inferred from the module path
 *   3. cwd-relative fallback used by older code paths
 */
function findGoParserBinary(): string | undefined {
  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const tsDir = resolve(moduleDir, "..", "..");     // ts/dist/reverse → ts
    const projectRoot = resolve(tsDir, "..");          // ts → aieattoken
    const candidates = [
      resolve(projectRoot, "go-parser", "goparser.exe"),
      resolve(projectRoot, "go-parser", "goparser"),
      resolve(tsDir, "go-parser", "goparser.exe"),
      resolve(tsDir, "go-parser", "goparser"),
      resolve(process.cwd(), "go-parser", "goparser.exe"),
      resolve(process.cwd(), "go-parser", "goparser"),
      resolve(process.cwd(), "..", "go-parser", "goparser.exe"),
      resolve(process.cwd(), "..", "go-parser", "goparser"),
    ];
    return candidates.find(p => existsSync(p));
  } catch {
    return undefined;
  }
}

// Parse a Go file using the Go CLI tool, return JSON AST
export function parseGoFile(goFilePath: string): any {
  const parserPath = findGoParserBinary();
  if (!parserPath) {
    throw new Error("Failed to parse Go file: go-parser binary not found");
  }
  try {
    const result = execSync(`"${parserPath}" "${goFilePath}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e: any) {
    throw new Error(`Failed to parse Go file: ${e.message}`);
  }
}

// Convert Go JSON AST to IR
export function goAstToIR(goAst: any): IR.IRProgram {
  const imports: IR.IRImport[] = [];
  const decls: IR.IRNode[] = [];

  for (const decl of goAst.Decls || []) {
    if (decl.Kind === "GenDecl" && decl.Token === "import") {
      for (const spec of decl.Specs || []) {
        if (spec.Kind === "ImportSpec") {
          imports.push({ path: spec.Path.replace(/"/g, "") });
        }
      }
    } else if (decl.Kind === "FuncDecl") {
      decls.push(convertFuncDecl(decl));
    } else if (decl.Kind === "GenDecl" && decl.Token === "type") {
      for (const spec of decl.Specs || []) {
        if (spec.Kind === "TypeSpec") {
          decls.push(convertTypeSpec(spec));
        }
      }
    } else if (decl.Kind === "GenDecl" && decl.Token === "var") {
      for (const spec of decl.Specs || []) {
        decls.push(convertVarSpec(spec));
      }
    } else if (decl.Kind === "GenDecl" && decl.Token === "const") {
      const specs = (decl.Specs || []).map((s: any) => convertConstSpec(s));
      decls.push({ kind: "ConstDecl", specs, stmtIndex: 0 } as IR.IRConstDecl);
    }
  }

  return {
    kind: "Program",
    package: goAst.Name || "main",
    imports,
    decls,
    stmtIndex: 0,
  };
}

function convertFuncDecl(node: any): IR.IRFuncDecl {
  const name = node.Name || "";
  let receiver: IR.IRFuncDecl["receiver"] | undefined;

  const recvList = node.Recv?.Fields || node.Recv?.List;
  if (recvList && recvList.length > 0) {
    const recv = recvList[0];
    const recvName = recv.Names?.[0] || name[0]?.toLowerCase() || "r";
    const recvType = convertTypeExpr(recv.Type);
    const isPointer = recv.Type?.Kind === "StarExpr";
    receiver = { name: recvName, type: recvType, pointer: isPointer };
  }

  const params = convertFieldList(node.Type?.Params);
  const results = convertResultTypes(node.Type?.Results);
  const body = convertBlockStmt(node.Body);

  return { kind: "FuncDecl", name, receiver, params, results, body, stmtIndex: 0 };
}

function convertFieldList(fieldList: any): IR.IRParam[] {
  // go-parser emits FieldList as `{Kind:"FieldList", Fields:[...]}` — the
  // internal list key is `Fields`, not Go's own `List`. Accept both just in
  // case an older dump format sneaks in.
  const list = fieldList?.Fields || fieldList?.List;
  if (!list) return [];
  const params: IR.IRParam[] = [];
  for (const field of list) {
    const type = convertTypeExpr(field.Type);
    if (field.Names && field.Names.length > 0) {
      for (const name of field.Names) {
        params.push({ name, type });
      }
    } else {
      params.push({ name: "_", type });
    }
  }
  return params;
}

function convertResultTypes(results: any): IR.IRType[] {
  const list = results?.Fields || results?.List;
  if (!list) return [];
  return list.map((field: any) => convertTypeExpr(field.Type));
}

function convertTypeExpr(node: any): IR.IRType {
  if (!node) return IR.simpleType("interface{}");
  switch (node.Kind) {
    case "Ident": return IR.simpleType(node.Name || "interface{}");
    case "StarExpr": return IR.pointerType(convertTypeExpr(node.X));
    case "ArrayType": {
      // Go has two array shapes: `[]T` (slice) and `[N]T` (fixed array). The
      // go-parser emits both as `ArrayType`, distinguished by whether `Len`
      // is present. Preserving the length matters semantically — a fixed
      // `[101]bool` is not a nil slice and is the correct type for e.g.
      // `doors := [101]bool{}` in RosettaCode-style tests.
      const elt = convertTypeExpr(node.Elt);
      if (node.Len && node.Len.Value !== undefined) {
        return { name: `[${node.Len.Value}]${elt.name}`, isSlice: true, elementType: elt };
      }
      return IR.sliceType(elt);
    }
    case "MapType": return IR.mapType(convertTypeExpr(node.Key), convertTypeExpr(node.Value));
    case "ChanType": {
      const elt = convertTypeExpr(node.Value);
      return { name: "chan " + elt.name, isChan: true, elementType: elt };
    }
    case "SelectorExpr": {
      // Go-parser emits Sel as an Ident object `{Kind:"Ident", Name:"..."}`
      // — not a bare string. Extract the name safely.
      const pkg = node.X?.Name || "";
      const sel = (typeof node.Sel === "string" ? node.Sel : node.Sel?.Name) || "";
      return IR.simpleType(`${pkg}.${sel}`);
    }
    case "FuncType": return IR.simpleType("func()");
    case "InterfaceType": return IR.simpleType("interface{}");
    case "Ellipsis": return { ...convertTypeExpr(node.Elt), name: "..." + (convertTypeExpr(node.Elt)).name };
    default: return IR.simpleType(node.Name || "interface{}");
  }
}

function convertTypeSpec(spec: any): IR.IRNode {
  const name = spec.Name || "";
  const typeNode = spec.Type;

  if (typeNode?.Kind === "StructType") {
    const fields: IR.IRField[] = [];
    const fieldList = typeNode.Fields?.Fields || typeNode.Fields?.List || [];
    for (const field of fieldList) {
      const type = convertTypeExpr(field.Type);
      const tag = field.Tag || undefined;
      for (const fname of field.Names || ["_"]) {
        fields.push({ name: fname, type, tag });
      }
    }
    return { kind: "StructDecl", name, fields, stmtIndex: 0 } as IR.IRStructDecl;
  }

  if (typeNode?.Kind === "InterfaceType") {
    const methods: IR.IRMethodSig[] = [];
    const methodList = typeNode.Methods?.Fields || typeNode.Methods?.List || [];
    for (const method of methodList) {
      if (method.Type?.Kind === "FuncType") {
        methods.push({
          name: method.Names?.[0] || "",
          params: convertFieldList(method.Type.Params),
          results: convertResultTypes(method.Type.Results),
        });
      }
    }
    return { kind: "InterfaceDecl", name, methods, stmtIndex: 0 } as IR.IRInterfaceDecl;
  }

  return { kind: "TypeAlias", name, underlying: convertTypeExpr(typeNode), stmtIndex: 0 } as IR.IRTypeAlias;
}

function convertVarSpec(spec: any): IR.IRVarDecl {
  const name = spec.Names?.[0] || "";
  const type = spec.Type ? convertTypeExpr(spec.Type) : undefined;
  const value = spec.Values?.[0] ? convertExpr(spec.Values[0]) : undefined;
  return { kind: "VarDecl", name, type, value, stmtIndex: 0 };
}

function convertConstSpec(spec: any): { name: string; value?: IR.IRExpr } {
  return {
    name: spec.Names?.[0] || "",
    value: spec.Values?.[0] ? convertExpr(spec.Values[0]) : undefined,
  };
}

function convertBlockStmt(node: any): IR.IRBlockStmt {
  const stmtList = node?.List || node?.Stmts;
  if (!stmtList) return { kind: "BlockStmt", stmts: [] };
  return { kind: "BlockStmt", stmts: stmtList.map(convertStmt).filter(Boolean) };
}

function convertStmt(node: any): IR.IRNode | null {
  if (!node) return null;
  switch (node.Kind) {
    case "ExprStmt":
      return { kind: "ExprStmt", expr: convertExpr(node.X), stmtIndex: 0 } as IR.IRExprStmt;
    case "AssignStmt": {
      const lhs = (node.Lhs || []).map(convertExpr);
      const rhs = (node.Rhs || []).map(convertExpr);
      // go-parser emits the assignment operator as `Token`, not `Tok`.
      // Accept both for backwards compatibility with older dumps.
      const tok = node.Token || node.Tok || "=";
      if (tok === ":=") {
        return { kind: "ShortDeclStmt", names: lhs.map(exprName), values: rhs, stmtIndex: 0 } as IR.IRShortDeclStmt;
      }
      return { kind: "AssignStmt", lhs, rhs, op: tok, stmtIndex: 0 } as IR.IRAssignStmt;
    }
    case "ReturnStmt":
      return { kind: "ReturnStmt", values: (node.Results || []).map(convertExpr), stmtIndex: 0 } as IR.IRReturnStmt;
    case "IfStmt":
      return convertIfStmt(node);
    case "ForStmt":
      return convertForStmt(node);
    case "RangeStmt":
      return convertRangeStmt(node);
    case "SwitchStmt":
      return convertSwitchStmt(node);
    case "SelectStmt":
      return convertSelectStmt(node);
    case "DeferStmt":
      return { kind: "DeferStmt", call: convertExpr(node.Call), stmtIndex: 0 } as IR.IRDeferStmt;
    case "GoStmt":
      return { kind: "GoStmt", call: convertExpr(node.Call), stmtIndex: 0 } as IR.IRGoStmt;
    case "IncDecStmt":
      return { kind: "IncDecStmt", x: convertExpr(node.X), op: (node.Token || node.Tok) as "++" | "--", stmtIndex: 0 } as IR.IRIncDecStmt;
    case "SendStmt":
      return { kind: "SendStmt", chan: convertExpr(node.Chan), value: convertExpr(node.Value), stmtIndex: 0 } as IR.IRSendStmt;
    case "BranchStmt":
      return { kind: "BranchStmt", tok: ((node.Token || node.Tok) || "break").toLowerCase(), stmtIndex: 0 } as IR.IRBranchStmt;
    case "BlockStmt":
      return convertBlockStmt(node);
    case "DeclStmt": {
      // Inline var/const declarations
      const decl = node.Decl;
      if (decl?.Token === "var" && decl.Specs?.[0]) {
        return convertVarSpec(decl.Specs[0]);
      }
      if (decl?.Token === "const" && decl.Specs) {
        return { kind: "ConstDecl", specs: decl.Specs.map(convertConstSpec), stmtIndex: 0 } as IR.IRConstDecl;
      }
      return null;
    }
    default:
      return null;
  }
}

function convertIfStmt(node: any): IR.IRIfStmt {
  const init = node.Init ? convertStmt(node.Init) || undefined : undefined;
  const cond = convertExpr(node.Cond);
  const body = convertBlockStmt(node.Body);
  let else_: IR.IRNode | undefined;
  if (node.Else) {
    if (node.Else.Kind === "IfStmt") {
      else_ = convertIfStmt(node.Else);
    } else {
      else_ = convertBlockStmt(node.Else);
    }
  }
  return { kind: "IfStmt", init, cond, body, else_, stmtIndex: 0 };
}

function convertForStmt(node: any): IR.IRForStmt {
  return {
    kind: "ForStmt",
    init: node.Init ? convertStmt(node.Init) || undefined : undefined,
    cond: node.Cond ? convertExpr(node.Cond) : undefined,
    post: node.Post ? convertStmt(node.Post) || undefined : undefined,
    body: convertBlockStmt(node.Body),
    stmtIndex: 0,
  };
}

function convertRangeStmt(node: any): IR.IRRangeStmt {
  return {
    kind: "RangeStmt",
    key: node.Key ? exprName(convertExpr(node.Key)) : undefined,
    value: node.Value ? exprName(convertExpr(node.Value)) : undefined,
    x: convertExpr(node.X),
    body: convertBlockStmt(node.Body),
    stmtIndex: 0,
  };
}

function convertSwitchStmt(node: any): IR.IRSwitchStmt {
  // go-parser emits BlockStmt with `Stmts`; accept legacy `List` too.
  const caseList = node.Body?.Stmts || node.Body?.List || [];
  const cases = caseList.map((c: any) => ({
    kind: "CaseClause" as const,
    // An empty or missing List means this is the `default:` case. Keep the
    // `values` field undefined in that case so the reverse emitter prints
    // `default:` rather than `case :`.
    values: c.List && c.List.length > 0 ? c.List.map(convertExpr) : undefined,
    body: (c.Body || []).map(convertStmt).filter(Boolean),
  }));
  return { kind: "SwitchStmt", tag: node.Tag ? convertExpr(node.Tag) : undefined, cases, stmtIndex: 0 };
}

function convertSelectStmt(node: any): IR.IRSelectStmt {
  const caseList = node.Body?.Stmts || node.Body?.List || [];
  const cases = caseList.map((c: any) => ({
    kind: "CommClause" as const,
    comm: c.Comm ? convertStmt(c.Comm) || undefined : undefined,
    body: (c.Body || []).map(convertStmt).filter(Boolean),
  }));
  return { kind: "SelectStmt", cases, stmtIndex: 0 };
}

function convertExpr(node: any): IR.IRExpr {
  if (!node) return { kind: "Ident", name: "_" };
  switch (node.Kind) {
    case "Ident": return { kind: "Ident", name: node.Name || "_" };
    case "BasicLit": {
      // go-parser emits the literal kind as `Token` (INT/FLOAT/STRING/CHAR).
      const typeMap: Record<string, IR.IRBasicLit["type"]> = {
        INT: "INT", FLOAT: "FLOAT", STRING: "STRING", CHAR: "RUNE",
      };
      const kind = node.Token || node.Type || "STRING";
      return { kind: "BasicLit", type: typeMap[kind] || "STRING", value: node.Value || "" };
    }
    case "CompositeLit": {
      const type = node.Type ? convertExpr(node.Type) : undefined;
      const elts = (node.Elts || []).map(convertExpr);
      return { kind: "CompositeLit", type, elts };
    }
    case "BinaryExpr":
      return { kind: "BinaryExpr", left: convertExpr(node.X), op: node.Op || "+", right: convertExpr(node.Y) };
    case "UnaryExpr": {
      if (node.Op === "&") return { kind: "UnaryExpr", op: "&", x: convertExpr(node.X) };
      if (node.Op === "*") return { kind: "StarExpr", x: convertExpr(node.X) };
      if (node.Op === "<-") return { kind: "UnaryRecvExpr", x: convertExpr(node.X) };
      return { kind: "UnaryExpr", op: node.Op || "!", x: convertExpr(node.X) };
    }
    case "CallExpr": {
      const func = convertExpr(node.Fun);
      const args = (node.Args || []).map(convertExpr);
      return { kind: "CallExpr", func, args };
    }
    case "SelectorExpr": {
      const x = convertExpr(node.X);
      // go-parser emits Sel as an Ident object — unwrap to its Name.
      const sel = (typeof node.Sel === "string" ? node.Sel : node.Sel?.Name) || "";
      // Check for stdlib alias in reverse
      if (x.kind === "Ident") {
        const fullName = `${x.name}.${sel}`;
        const alias = reverseAliasMap[fullName];
        if (alias) {
          return { kind: "Ident", name: alias };
        }
      }
      return { kind: "SelectorExpr", x, sel };
    }
    case "IndexExpr":
      return { kind: "IndexExpr", x: convertExpr(node.X), index: convertExpr(node.Index) };
    case "SliceExpr":
      return { kind: "SliceExpr", x: convertExpr(node.X), low: node.Low ? convertExpr(node.Low) : undefined, high: node.High ? convertExpr(node.High) : undefined };
    case "TypeAssertExpr":
      return { kind: "TypeAssertExpr", x: convertExpr(node.X), type: convertTypeExpr(node.Type) };
    case "StarExpr":
      return { kind: "StarExpr", x: convertExpr(node.X) };
    case "ParenExpr":
      return { kind: "ParenExpr", x: convertExpr(node.X) };
    case "FuncLit": {
      const params = convertFieldList(node.Type?.Params);
      const results = convertResultTypes(node.Type?.Results);
      const body = convertBlockStmt(node.Body);
      return { kind: "FuncLit", params, results, body };
    }
    case "KeyValueExpr":
      return { kind: "KeyValueExpr", key: convertExpr(node.Key), value: convertExpr(node.Value) };
    case "ArrayType":
      return { kind: "ArrayTypeExpr", elt: convertExpr(node.Elt) };
    case "MapType":
      return { kind: "MapTypeExpr", key: convertExpr(node.Key), value: convertExpr(node.Value) };
    default:
      return { kind: "Ident", name: node.Name || "_" };
  }
}

function exprName(expr: IR.IRExpr): string {
  if (expr.kind === "Ident") return expr.name;
  return "_";
}

// Program-level signature registry used during emission so that per-function
// analysis (e.g. cross-function type elision) can look up sibling functions'
// signatures. Set at the top of `irToAET` and cleared on exit.
let globalFuncSigs: Map<string, IR.IRFuncDecl> = new Map();

// Per-callee aggregated argument types collected from every call site in
// the program. Used by the reverse's type-elision pass to know when a
// parameter can be safely dropped because a caller provides a typed
// argument at that position (the forward's cross-function propagation will
// pick it up). Map: calleeName → array indexed by position of the "most
// specific agreed-upon type" across call sites (or undefined if sites
// disagree / no signal).
let globalCallSiteArgTypes: Map<string, (IR.IRType | undefined)[]> = new Map();

// Pre-computed per-function elision data (computed before identifier
// shortening so original names are available for call-site lookup).
let precomputedElidable: Map<string, boolean[]> = new Map();
let precomputedReturnElide: Map<string, boolean> = new Map();
let precomputedBody: Map<string, IR.IRBlockStmt> = new Map();

// Convert IR to AET string
export function irToAET(program: IR.IRProgram): string {
  globalFuncSigs = new Map();
  for (const decl of program.decls) {
    if (decl.kind === "FuncDecl") {
      globalFuncSigs.set((decl as IR.IRFuncDecl).name, decl as IR.IRFuncDecl);
    }
  }
  globalCallSiteArgTypes = computeCallSiteArgTypes(program.decls);

  // Pre-compute per-function type elision and return-type elision BEFORE
  // identifier shortening, so the analysis can use the original function
  // names to look up signatures and call-site hints. The results are stored
  // in maps keyed by original function name and consumed during emission.
  precomputedElidable = new Map();
  precomputedReturnElide = new Map();
  precomputedBody = new Map();
  for (const decl of program.decls) {
    if (decl.kind !== "FuncDecl") continue;
    const fn = decl as IR.IRFuncDecl;
    precomputedElidable.set(fn.name, computeElidableParams(fn.name, fn.params, fn.body));
    precomputedReturnElide.set(fn.name, canElideReturnType(fn.results, fn.body));
    if (precomputedReturnElide.get(fn.name)) {
      precomputedBody.set(fn.name, bodyWithImplicitReturns(fn.body));
    }
  }

  // Identifier-shortening pass: rename multi-token identifiers (2+ tokens
  // in cl100k_base) to shorter 1-token names. This is lossy (round-tripped
  // Go won't have the original names) but preserves semantics. Saves
  // ~1 token per usage for identifiers like `is_prime`, `reverseString`,
  // `binarySearch`, `primes`, `runes`, etc.
  //
  // Build a name mapping from old → new so pre-computed results can be
  // re-keyed after shortening.
  const renameMapping = shortenIdentifiers(program);
  // Re-key precomputed maps using the rename mapping.
  if (renameMapping.size > 0) {
    for (const [oldName, newName] of renameMapping) {
      if (precomputedElidable.has(oldName)) {
        precomputedElidable.set(newName, precomputedElidable.get(oldName)!);
      }
      if (precomputedReturnElide.has(oldName)) {
        precomputedReturnElide.set(newName, precomputedReturnElide.get(oldName)!);
      }
      if (precomputedBody.has(oldName)) {
        precomputedBody.set(newName, precomputedBody.get(oldName)!);
      }
    }
  }

  const parts: string[] = [];
  for (const decl of program.decls) {
    parts.push(nodeToAET(decl));
  }
  globalFuncSigs = new Map();
  globalCallSiteArgTypes = new Map();
  return parts.join(";");
}

/**
 * Rename identifiers whose cl100k_base token count is 2+ to a unique
 * single-token name, across the entire program. Skips "main", Go keywords,
 * builtins, and stdlib aliases.
 */
function shortenIdentifiers(program: IR.IRProgram): Map<string, string> {
  // Heuristic for detecting multi-token identifiers in cl100k_base.
  // Uses a combination of pattern rules and a precomputed list of known
  // multi-token words common in Go code. This avoids a tiktoken dependency
  // in the reverse module.
  const knownMultiToken = new Set([
    // Common Go identifier patterns that tokenize as 2+ tokens:
    "runes", "primes", "sieve", "hanoi", "syms", "decls", "stmts",
    "elts", "vals", "recv", "exprs", "funcs", "decrypted",
  ]);
  const tokenize = (s: string): number => {
    if (knownMultiToken.has(s)) return 2;
    if (s.includes("_")) return 2;     // snake_case
    if (s.length > 7) return 2;        // long names (lowered from 8)
    if (/^[a-z]+[A-Z]/.test(s)) return 2; // camelCase
    return 1;
  };

  // Collect all identifiers and their usage counts.
  const identCounts = new Map<string, number>();
  function countIdent(name: string): void {
    identCounts.set(name, (identCounts.get(name) || 0) + 1);
  }

  // Reserved names: Go keywords, builtins, stdlib aliases, "main".
  const reserved = new Set([
    "main", "init", "_",
    "if", "else", "for", "range", "switch", "case", "default", "select",
    "go", "defer", "return", "break", "continue", "fallthrough",
    "func", "type", "struct", "interface", "map", "chan",
    "const", "var", "true", "false", "nil",
    "make", "append", "len", "cap", "delete", "copy", "new", "close",
    "panic", "recover", "print", "println",
    "mk", "apl", "ln", "cp", "cpy", "dx", "nw", "rng", "flt", "mp",
    "fn", "ty", "ft",
    "int", "string", "bool", "byte", "rune", "error",
    "float32", "float64", "int8", "int16", "int32", "int64",
    "uint", "uint8", "uint16", "uint32", "uint64",
  ]);
  // Add all stdlib alias VALUES to reserved set (the short names like pl, pf).
  for (const val of Object.values(reverseAliasMap)) {
    reserved.add(val);
  }

  // Walk the IR and count all user identifiers.
  function walkExpr(e: IR.IRExpr): void {
    if (!e) return;
    switch (e.kind) {
      case "Ident": countIdent((e as IR.IRIdent).name); return;
      case "CallExpr": {
        const c = e as IR.IRCallExpr;
        walkExpr(c.func);
        for (const a of c.args) walkExpr(a);
        return;
      }
      case "BinaryExpr": walkExpr((e as IR.IRBinaryExpr).left); walkExpr((e as IR.IRBinaryExpr).right); return;
      case "UnaryExpr": walkExpr((e as IR.IRUnaryExpr).x); return;
      case "IndexExpr": walkExpr((e as IR.IRIndexExpr).x); walkExpr((e as IR.IRIndexExpr).index); return;
      case "SelectorExpr": walkExpr((e as IR.IRSelectorExpr).x); return;
      case "ParenExpr": walkExpr((e as IR.IRParenExpr).x); return;
      case "SliceExpr": {
        const s = e as IR.IRSliceExpr;
        walkExpr(s.x); if (s.low) walkExpr(s.low); if (s.high) walkExpr(s.high); return;
      }
      case "CompositeLit": for (const el of (e as IR.IRCompositeLit).elts) walkExpr(el); return;
      case "KeyValueExpr": walkExpr((e as IR.IRKeyValueExpr).key); walkExpr((e as IR.IRKeyValueExpr).value); return;
    }
  }
  function walkNode(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "FuncDecl": {
        const fn = n as IR.IRFuncDecl;
        countIdent(fn.name);
        for (const p of fn.params) countIdent(p.name);
        walkBlock(fn.body); return;
      }
      case "BlockStmt": walkBlock(n as IR.IRBlockStmt); return;
      case "ExprStmt": walkExpr((n as IR.IRExprStmt).expr); return;
      case "ReturnStmt": for (const v of (n as IR.IRReturnStmt).values) walkExpr(v); return;
      case "AssignStmt": {
        const a = n as IR.IRAssignStmt;
        for (const l of a.lhs) walkExpr(l); for (const r of a.rhs) walkExpr(r); return;
      }
      case "ShortDeclStmt": {
        const s = n as IR.IRShortDeclStmt;
        for (const nm of s.names) countIdent(nm);
        for (const v of s.values) walkExpr(v); return;
      }
      case "IncDecStmt": walkExpr((n as IR.IRIncDecStmt).x); return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) walkNode(i.init); walkExpr(i.cond);
        walkBlock(i.body); if (i.else_) walkNode(i.else_); return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) walkNode(f.init); if (f.cond) walkExpr(f.cond);
        if (f.post) walkNode(f.post); walkBlock(f.body); return;
      }
      case "RangeStmt": {
        const r = n as IR.IRRangeStmt;
        if (r.key) countIdent(r.key); if (r.value) countIdent(r.value);
        walkExpr(r.x); walkBlock(r.body); return;
      }
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        if (sw.tag) walkExpr(sw.tag);
        for (const c of sw.cases) {
          if (c.values) for (const v of c.values) walkExpr(v);
          for (const s of c.body) walkNode(s);
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        countIdent(v.name); if (v.value) walkExpr(v.value); return;
      }
    }
  }
  function walkBlock(b: IR.IRBlockStmt): void {
    for (const s of b.stmts) walkNode(s);
  }
  for (const d of program.decls) walkNode(d);

  // Build rename map: for each multi-token identifier, assign a short name.
  // Sort by usage count × (tokenCost - 1) to maximize savings.
  const candidates: Array<{ name: string; uses: number; cost: number }> = [];
  for (const [name, uses] of identCounts) {
    if (reserved.has(name)) continue;
    const cost = tokenize(name);
    if (cost >= 2) candidates.push({ name, uses, cost });
  }
  candidates.sort((a, b) => (b.uses * (b.cost - 1)) - (a.uses * (a.cost - 1)));

  // Generate short names: single letters a-z (excluding reserved), then
  // two-letter combos aa, ab, ...
  const existingSingleToken = new Set<string>();
  for (const [name] of identCounts) {
    if (tokenize(name) === 1) existingSingleToken.add(name);
  }

  function* nameGen(): Generator<string> {
    for (const c of "abcdefghijklmnopqrstuvwxyz") {
      if (!reserved.has(c) && !existingSingleToken.has(c)) yield c;
    }
    for (const c1 of "abcdefghijklmnopqrstuvwxyz") {
      for (const c2 of "abcdefghijklmnopqrstuvwxyz") {
        const n = c1 + c2;
        if (!reserved.has(n) && !existingSingleToken.has(n)) yield n;
      }
    }
  }

  const gen = nameGen();
  const renameMap = new Map<string, string>();
  for (const c of candidates) {
    const next = gen.next();
    if (next.done) break;
    renameMap.set(c.name, next.value);
    existingSingleToken.add(next.value);
  }
  if (renameMap.size === 0) return renameMap;

  // Apply renaming across the entire IR.
  function renameExpr(e: IR.IRExpr): void {
    if (!e) return;
    switch (e.kind) {
      case "Ident": {
        const id = e as IR.IRIdent;
        const r = renameMap.get(id.name);
        if (r) id.name = r;
        return;
      }
      case "CallExpr": {
        const c = e as IR.IRCallExpr;
        renameExpr(c.func);
        for (const a of c.args) renameExpr(a);
        return;
      }
      case "BinaryExpr": renameExpr((e as IR.IRBinaryExpr).left); renameExpr((e as IR.IRBinaryExpr).right); return;
      case "UnaryExpr": renameExpr((e as IR.IRUnaryExpr).x); return;
      case "IndexExpr": renameExpr((e as IR.IRIndexExpr).x); renameExpr((e as IR.IRIndexExpr).index); return;
      case "SelectorExpr": renameExpr((e as IR.IRSelectorExpr).x); return;
      case "ParenExpr": renameExpr((e as IR.IRParenExpr).x); return;
      case "SliceExpr": {
        const s = e as IR.IRSliceExpr;
        renameExpr(s.x); if (s.low) renameExpr(s.low); if (s.high) renameExpr(s.high); return;
      }
      case "CompositeLit": for (const el of (e as IR.IRCompositeLit).elts) renameExpr(el); return;
      case "KeyValueExpr": renameExpr((e as IR.IRKeyValueExpr).key); renameExpr((e as IR.IRKeyValueExpr).value); return;
    }
  }
  function renameNode(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "FuncDecl": {
        const fn = n as IR.IRFuncDecl;
        const r = renameMap.get(fn.name);
        if (r) fn.name = r;
        for (const p of fn.params) {
          const rp = renameMap.get(p.name);
          if (rp) p.name = rp;
        }
        renameBlock(fn.body); return;
      }
      case "BlockStmt": renameBlock(n as IR.IRBlockStmt); return;
      case "ExprStmt": renameExpr((n as IR.IRExprStmt).expr); return;
      case "ReturnStmt": for (const v of (n as IR.IRReturnStmt).values) renameExpr(v); return;
      case "AssignStmt": {
        const a = n as IR.IRAssignStmt;
        for (const l of a.lhs) renameExpr(l); for (const r of a.rhs) renameExpr(r); return;
      }
      case "ShortDeclStmt": {
        const s = n as IR.IRShortDeclStmt;
        s.names = s.names.map(nm => renameMap.get(nm) || nm);
        for (const v of s.values) renameExpr(v); return;
      }
      case "IncDecStmt": renameExpr((n as IR.IRIncDecStmt).x); return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) renameNode(i.init); renameExpr(i.cond);
        renameBlock(i.body); if (i.else_) renameNode(i.else_); return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) renameNode(f.init); if (f.cond) renameExpr(f.cond);
        if (f.post) renameNode(f.post); renameBlock(f.body); return;
      }
      case "RangeStmt": {
        const r = n as IR.IRRangeStmt;
        if (r.key) { const rk = renameMap.get(r.key); if (rk) r.key = rk; }
        if (r.value) { const rv = renameMap.get(r.value); if (rv) r.value = rv; }
        renameExpr(r.x); renameBlock(r.body); return;
      }
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        if (sw.tag) renameExpr(sw.tag);
        for (const c of sw.cases) {
          if (c.values) for (const v of c.values) renameExpr(v);
          for (const s of c.body) renameNode(s);
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        const rv = renameMap.get(v.name);
        if (rv) v.name = rv;
        if (v.value) renameExpr(v.value); return;
      }
    }
  }
  function renameBlock(b: IR.IRBlockStmt): void {
    for (const s of b.stmts) renameNode(s);
  }
  for (const d of program.decls) renameNode(d);
  return renameMap;
}

/**
 * Walk the whole program and, for each call to a known function, compute
 * the types of the arguments as they appear in the caller. Aggregates
 * types across all call sites: if every call site agrees on a type at
 * position i, that type becomes the "hint". Disagreements or default-int
 * arguments yield undefined (no hint).
 */
function computeCallSiteArgTypes(decls: IR.IRNode[]): Map<string, (IR.IRType | undefined)[]> {
  const result = new Map<string, (IR.IRType | undefined)[]>();
  // Collect raw per-site args first so we can reconcile.
  const raw = new Map<string, (IR.IRType | undefined)[][]>();

  for (const d of decls) {
    if (d.kind !== "FuncDecl") continue;
    const fn = d as IR.IRFuncDecl;

    // Seed local symbol table from the caller's params and body bindings.
    const symbols = new Map<string, IR.IRType>();
    for (const p of fn.params) {
      if (p.type.name !== "interface{}") symbols.set(p.name, p.type);
    }
    seedReverseSymbols(fn.body, symbols);

    // Visit every CallExpr and record arg types.
    visitCallExprsReverse(fn.body, (call) => {
      if (call.func.kind !== "Ident") return;
      const name = (call.func as IR.IRIdent).name;
      if (!globalFuncSigs.has(name)) return;
      if (name === fn.name) return; // skip self-recursion
      const argTypes: (IR.IRType | undefined)[] = [];
      for (const a of call.args) {
        argTypes.push(inferReverseExprType(a, symbols));
      }
      let list = raw.get(name);
      if (!list) { list = []; raw.set(name, list); }
      list.push(argTypes);
    });
  }

  // Reconcile: for each callee, for each position, pick the type that every
  // site agrees on (ignoring undefined slots).
  for (const [name, sites] of raw) {
    const callee = globalFuncSigs.get(name);
    if (!callee) continue;
    const arity = callee.params.length;
    const hints: (IR.IRType | undefined)[] = new Array(arity).fill(undefined);
    for (let i = 0; i < arity; i++) {
      let agreed: IR.IRType | undefined;
      let conflict = false;
      for (const argTypes of sites) {
        if (i >= argTypes.length) continue;
        const t = argTypes[i];
        if (!t) continue;
        if (!agreed) agreed = t;
        else if (agreed.name !== t.name) { conflict = true; break; }
      }
      if (!conflict) hints[i] = agreed;
    }
    result.set(name, hints);
  }
  return result;
}

/** Seed a symbol table from ShortDecl/VarDecl/Range bindings. */
function seedReverseSymbols(block: IR.IRBlockStmt, symbols: Map<string, IR.IRType>): void {
  function visit(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) visit(s);
        return;
      case "ShortDeclStmt": {
        const s = n as IR.IRShortDeclStmt;
        if (s.names.length === 1 && s.values.length === 1) {
          const t = inferReverseExprType(s.values[0], symbols);
          if (t) symbols.set(s.names[0], t);
        } else if (s.names.length === s.values.length) {
          for (let i = 0; i < s.names.length; i++) {
            const t = inferReverseExprType(s.values[i], symbols);
            if (t) symbols.set(s.names[i], t);
          }
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        if (v.type) symbols.set(v.name, v.type);
        else if (v.value) {
          const t = inferReverseExprType(v.value, symbols);
          if (t) symbols.set(v.name, t);
        }
        return;
      }
      case "RangeStmt": {
        const r = n as IR.IRRangeStmt;
        const containerType = inferReverseExprType(r.x, symbols);
        if (containerType) {
          if (containerType.name.startsWith("[]") || containerType.isSlice) {
            const elt = containerType.elementType || IR.simpleType(containerType.name.slice(2));
            if (r.key && r.key !== "_") symbols.set(r.key, IR.simpleType("int"));
            if (r.value && r.value !== "_") symbols.set(r.value, elt);
          } else if (containerType.isMap && containerType.keyType && containerType.valueType) {
            if (r.key && r.key !== "_") symbols.set(r.key, containerType.keyType);
            if (r.value && r.value !== "_") symbols.set(r.value, containerType.valueType);
          } else if (containerType.name === "string") {
            if (r.key && r.key !== "_") symbols.set(r.key, IR.simpleType("int"));
            if (r.value && r.value !== "_") symbols.set(r.value, IR.simpleType("rune"));
          }
        }
        visit(r.body);
        return;
      }
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) visit(i.init);
        visit(i.body);
        if (i.else_) visit(i.else_);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) visit(f.init);
        visit(f.body);
        return;
      }
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        for (const c of sw.cases) for (const s of c.body) visit(s);
        return;
      }
    }
  }
  visit(block);
}

/** Minimal type inference over an IR expression, using a symbol table. */
function inferReverseExprType(e: IR.IRExpr, symbols: Map<string, IR.IRType>): IR.IRType | undefined {
  if (!e) return undefined;
  switch (e.kind) {
    case "BasicLit": {
      const lit = e as IR.IRBasicLit;
      if (lit.type === "INT") return IR.simpleType("int");
      if (lit.type === "FLOAT") return IR.simpleType("float64");
      if (lit.type === "STRING") return IR.simpleType("string");
      if (lit.type === "RUNE") return IR.simpleType("rune");
      return undefined;
    }
    case "Ident": {
      const n = (e as IR.IRIdent).name;
      if (n === "true" || n === "false") return IR.simpleType("bool");
      if (n === "nil") return undefined;
      return symbols.get(n);
    }
    case "CompositeLit": {
      const cl = e as IR.IRCompositeLit;
      if (!cl.type) return undefined;
      if (cl.type.kind === "ArrayTypeExpr") {
        const at = cl.type as IR.IRArrayTypeExpr;
        const eltName = (at.elt as any).name;
        if (eltName) {
          return { name: "[]" + eltName, isSlice: true, elementType: IR.simpleType(eltName) };
        }
      }
      if (cl.type.kind === "MapTypeExpr") {
        const mt = cl.type as IR.IRMapTypeExpr;
        const k = (mt.key as any).name || "string";
        const v = (mt.value as any).name || "int";
        return { name: `map[${k}]${v}`, isMap: true, keyType: IR.simpleType(k), valueType: IR.simpleType(v) };
      }
      if (cl.type.kind === "Ident") return IR.simpleType((cl.type as IR.IRIdent).name);
      return undefined;
    }
    case "CallExpr": {
      const c = e as IR.IRCallExpr;
      if (c.func.kind === "Ident") {
        const name = (c.func as IR.IRIdent).name;
        // Type conversions
        if (name === "string") return IR.simpleType("string");
        if (name === "int" || name === "int32" || name === "int64") return IR.simpleType(name);
        if (name === "byte" || name === "rune") return IR.simpleType(name);
        if (name === "float32" || name === "float64") return IR.simpleType(name);
        if (name === "bool") return IR.simpleType("bool");
        if (name === "len" || name === "cap") return IR.simpleType("int");
        // User-defined function: look up signature
        const callee = globalFuncSigs.get(name);
        if (callee && callee.results.length === 1) return callee.results[0];
      }
      if (c.func.kind === "ArrayTypeExpr") {
        const at = c.func as IR.IRArrayTypeExpr;
        const eltName = (at.elt as any).name || "byte";
        return { name: "[]" + eltName, isSlice: true, elementType: IR.simpleType(eltName) };
      }
      return undefined;
    }
    case "BinaryExpr": {
      const b = e as IR.IRBinaryExpr;
      if (["==", "!=", "<", ">", "<=", ">=", "&&", "||"].includes(b.op)) {
        return IR.simpleType("bool");
      }
      return inferReverseExprType(b.left, symbols) ?? inferReverseExprType(b.right, symbols);
    }
    case "UnaryExpr": {
      const u = e as IR.IRUnaryExpr;
      if (u.op === "!") return IR.simpleType("bool");
      return inferReverseExprType(u.x, symbols);
    }
    case "ParenExpr":
      return inferReverseExprType((e as IR.IRParenExpr).x, symbols);
    case "IndexExpr": {
      const ix = e as IR.IRIndexExpr;
      const ct = inferReverseExprType(ix.x, symbols);
      if (ct) {
        if (ct.elementType) return ct.elementType;
        if (ct.name.startsWith("[]")) return IR.simpleType(ct.name.slice(2));
        if (ct.name === "string") return IR.simpleType("byte");
      }
      return undefined;
    }
  }
  return undefined;
}

/** Visit every CallExpr in a body, calling `visitor` on each. */
function visitCallExprsReverse(body: IR.IRBlockStmt, visitor: (c: IR.IRCallExpr) => void): void {
  function visitExpr(e: IR.IRExpr): void {
    if (!e) return;
    if (e.kind === "CallExpr") {
      visitor(e as IR.IRCallExpr);
      const c = e as IR.IRCallExpr;
      for (const a of c.args) visitExpr(a);
      visitExpr(c.func);
      return;
    }
    if (e.kind === "BinaryExpr") {
      const b = e as IR.IRBinaryExpr;
      visitExpr(b.left); visitExpr(b.right); return;
    }
    if (e.kind === "UnaryExpr") { visitExpr((e as IR.IRUnaryExpr).x); return; }
    if (e.kind === "ParenExpr") { visitExpr((e as IR.IRParenExpr).x); return; }
    if (e.kind === "IndexExpr") {
      const ix = e as IR.IRIndexExpr;
      visitExpr(ix.x); visitExpr(ix.index); return;
    }
    if (e.kind === "SelectorExpr") { visitExpr((e as IR.IRSelectorExpr).x); return; }
    if (e.kind === "CompositeLit") {
      for (const el of (e as IR.IRCompositeLit).elts) visitExpr(el);
      return;
    }
  }
  function visit(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) visit(s); return;
      case "ExprStmt": visitExpr((n as IR.IRExprStmt).expr); return;
      case "AssignStmt": {
        const a = n as IR.IRAssignStmt;
        for (const l of a.lhs) visitExpr(l);
        for (const r of a.rhs) visitExpr(r);
        return;
      }
      case "ShortDeclStmt":
        for (const v of (n as IR.IRShortDeclStmt).values) visitExpr(v);
        return;
      case "IncDecStmt": visitExpr((n as IR.IRIncDecStmt).x); return;
      case "ReturnStmt":
        for (const v of (n as IR.IRReturnStmt).values) visitExpr(v);
        return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) visit(i.init);
        visitExpr(i.cond);
        visit(i.body);
        if (i.else_) visit(i.else_);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) visit(f.init);
        if (f.cond) visitExpr(f.cond);
        if (f.post) visit(f.post);
        visit(f.body);
        return;
      }
      case "RangeStmt": visit((n as IR.IRRangeStmt).body); return;
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        if (sw.tag) visitExpr(sw.tag);
        for (const c of sw.cases) {
          if (c.values) for (const v of c.values) visitExpr(v);
          for (const s of c.body) visit(s);
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        if (v.value) visitExpr(v.value);
        return;
      }
    }
  }
  visit(body);
}

function shortenType(name: string): string {
  // Note: f64/i64/f32/i32 are all 2 tokens in cl100k_base, same as float64/int64/float32/int32.
  // No savings from abbreviating. Keep canonical Go type names for AI comprehension.
  // Only exception: types that are genuinely shorter in tokens would go here.
  return name;
}

/**
 * Types that the forward transformer's inference can recover from body usage.
 * Keep this list conservative — any type NOT listed here forces the reverse
 * pipeline to emit an explicit annotation.
 */
function isInferableType(t: IR.IRType): boolean {
  const n = t.name;
  if (n === "int") return true;
  if (n === "string") return true;
  if (n === "bool") return true; // rarely used for params but safe default
  if (n === "[]int") return true;
  if (n === "[]string") return true;
  if (n === "[]byte") return true;
  if (n === "[]rune") return true;
  if (n === "[]bool") return true;
  if (n === "[][]int") return true;
  return false;
}

/**
 * Decide whether parameter type annotations can be dropped. Returns true only
 * when:
 *   1. Every parameter's type is in the forward-inferable set.
 *   2. Each non-`int` parameter has a disambiguating usage in the body that
 *      the forward inference will pick up. An `int` parameter is always safe
 *      to drop because `int` is the fallback default.
 */
function canElideParamTypes(params: IR.IRParam[], body: IR.IRBlockStmt): boolean {
  if (params.length === 0) return true;
  for (const p of params) {
    if (!isInferableType(p.type)) return false;
    if (p.name === "_" || p.name.startsWith("_")) return false;
    // `int` is the fallback, always safe. Other types need a usage signal.
    if (p.type.name === "int") continue;
    if (!hasDisambiguatingUsage(p.name, p.type, body)) return false;
  }
  return true;
}

/**
 * Per-parameter elision analysis. Returns a boolean array the same length as
 * `params`, where `true` at index i means param i's type annotation can be
 * omitted and the forward transformer will still recover the correct type.
 *
 * The analysis is a two-step flood:
 *   1. Seed with direct evidence: `int` (default), disambiguating usage, or
 *      non-inferable type.
 *   2. Positional propagation: for any recursive call `fn(a,b,c)` inside the
 *      body, if argument k is a plain Ident that matches another parameter
 *      `arg` and `arg` is already marked elidable AND `params[k].type`
 *      equals `params[indexOf(arg)].type`, then param k is also elidable.
 *      Iterated until fixed point — this lets hanoi's `via` borrow the
 *      string evidence from its sibling `to`/`from`.
 */
function computeElidableParams(
  funcName: string,
  params: IR.IRParam[],
  body: IR.IRBlockStmt,
): boolean[] {
  const n = params.length;
  const elidable: boolean[] = new Array(n).fill(false);
  const paramIdx: Record<string, number> = {};
  params.forEach((p, i) => { paramIdx[p.name] = i; });

  // Pass 1: direct evidence.
  for (let i = 0; i < n; i++) {
    const p = params[i];
    if (p.type.name === "interface{}") { elidable[i] = true; continue; }
    if (!isInferableType(p.type)) continue;
    if (p.name === "_" || p.name.startsWith("_")) continue;
    if (p.type.name === "int") { elidable[i] = true; continue; }
    if (hasDisambiguatingUsage(p.name, p.type, body)) { elidable[i] = true; }
  }

  // Pass 1b: call-site driven evidence. If the forward's cross-function
  // propagation has a typed argument at our position-i from any caller,
  // we can drop the annotation — the forward will recover it from the
  // call site. This is how `isPalindrome(s)` drops `s:string` when main
  // calls it with a ranged-string element, or how `printMatrix(m)` drops
  // `m:[][]int` when main calls it with a literal `[][]int{...}`.
  const siteHints = globalCallSiteArgTypes.get(funcName);
  if (siteHints) {
    for (let i = 0; i < n; i++) {
      if (elidable[i]) continue;
      const p = params[i];
      if (!isInferableType(p.type)) continue;
      const hint = siteHints[i];
      if (!hint) continue;
      if (hint.name === p.type.name) {
        elidable[i] = true;
      }
    }
  }

  // Pass 2: cross-function propagation. For each call from this function
  // to another KNOWN function (via globalFuncSigs), if our param P is
  // passed at arg-position k and the callee's param k has the same non-int
  // type, then P can be elided — the forward's cross-function propagation
  // pass will carry the type across by looking up the callee's signature.
  for (const call of collectAllCallArgs(body)) {
    if (call.funcName === funcName) continue; // skip self-recursion here
    const callee = globalFuncSigs.get(call.funcName);
    if (!callee) continue;
    const m = Math.min(call.args.length, callee.params.length);
    for (let k = 0; k < m; k++) {
      const arg = call.args[k];
      if (arg.kind !== "Ident") continue;
      const argName = (arg as IR.IRIdent).name;
      const i = paramIdx[argName];
      if (i === undefined) continue;
      if (elidable[i]) continue;
      const calleeType = callee.params[k].type;
      if (calleeType.name === "int" || calleeType.name === "interface{}") continue;
      if (params[i].type.name !== calleeType.name) continue;
      elidable[i] = true;
    }
  }

  // Pass 3: recursive-call positional propagation, iterated to fixed point.
  if (!funcName) return elidable;
  const calls = collectSelfCallArgs(funcName, body);
  if (calls.length === 0) return elidable;

  for (let iter = 0; iter < 4; iter++) {
    let changed = false;
    for (const args of calls) {
      const len = Math.min(args.length, n);
      for (let i = 0; i < len; i++) {
        if (elidable[i]) continue;
        if (!isInferableType(params[i].type)) continue;
        const arg = args[i];
        if (arg.kind !== "Ident") continue;
        const argName = (arg as IR.IRIdent).name;
        const j = paramIdx[argName];
        if (j === undefined) continue;
        // Argument is a plain param reference. If that sibling is already
        // known-elidable (via direct evidence) AND shares the same type,
        // this param can be elided too — the forward's recursive-call
        // positional propagation will carry the type across.
        if (elidable[j] && params[j].type.name === params[i].type.name) {
          elidable[i] = true;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return elidable;
}

/**
 * Collect every CallExpr with its callee name and args, walking the entire
 * body. Used for cross-function type propagation analysis.
 */
function collectAllCallArgs(body: IR.IRBlockStmt): Array<{ funcName: string; args: IR.IRExpr[] }> {
  const out: Array<{ funcName: string; args: IR.IRExpr[] }> = [];

  function visitExpr(e: IR.IRExpr): void {
    if (!e) return;
    if (e.kind === "CallExpr") {
      const c = e as IR.IRCallExpr;
      if (c.func.kind === "Ident") {
        out.push({ funcName: (c.func as IR.IRIdent).name, args: c.args });
      }
      for (const a of c.args) visitExpr(a);
      visitExpr(c.func);
      return;
    }
    if (e.kind === "BinaryExpr") {
      const b = e as IR.IRBinaryExpr;
      visitExpr(b.left); visitExpr(b.right); return;
    }
    if (e.kind === "UnaryExpr") { visitExpr((e as IR.IRUnaryExpr).x); return; }
    if (e.kind === "ParenExpr") { visitExpr((e as IR.IRParenExpr).x); return; }
    if (e.kind === "IndexExpr") {
      const ix = e as IR.IRIndexExpr;
      visitExpr(ix.x); visitExpr(ix.index); return;
    }
    if (e.kind === "SelectorExpr") { visitExpr((e as IR.IRSelectorExpr).x); return; }
  }

  function visit(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) visit(s); return;
      case "ExprStmt": visitExpr((n as IR.IRExprStmt).expr); return;
      case "AssignStmt": {
        const a = n as IR.IRAssignStmt;
        for (const l of a.lhs) visitExpr(l);
        for (const r of a.rhs) visitExpr(r);
        return;
      }
      case "ShortDeclStmt":
        for (const v of (n as IR.IRShortDeclStmt).values) visitExpr(v);
        return;
      case "IncDecStmt": visitExpr((n as IR.IRIncDecStmt).x); return;
      case "ReturnStmt":
        for (const v of (n as IR.IRReturnStmt).values) visitExpr(v);
        return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) visit(i.init);
        visitExpr(i.cond);
        visit(i.body);
        if (i.else_) visit(i.else_);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) visit(f.init);
        if (f.cond) visitExpr(f.cond);
        if (f.post) visit(f.post);
        visit(f.body);
        return;
      }
      case "RangeStmt": visit((n as IR.IRRangeStmt).body); return;
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        if (sw.tag) visitExpr(sw.tag);
        for (const c of sw.cases) {
          if (c.values) for (const v of c.values) visitExpr(v);
          for (const s of c.body) visit(s);
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        if (v.value) visitExpr(v.value);
        return;
      }
    }
  }

  visit(body);
  return out;
}

/**
 * Collect the argument list of every self-recursive call in a function body.
 * Used by computeElidableParams to drive positional type propagation.
 */
function collectSelfCallArgs(funcName: string, body: IR.IRBlockStmt): IR.IRExpr[][] {
  const out: IR.IRExpr[][] = [];

  function visitExpr(e: IR.IRExpr): void {
    if (!e) return;
    if (e.kind === "CallExpr") {
      const c = e as IR.IRCallExpr;
      if (c.func.kind === "Ident" && (c.func as IR.IRIdent).name === funcName) {
        out.push(c.args);
      }
      visitExpr(c.func);
      for (const a of c.args) visitExpr(a);
      return;
    }
    if (e.kind === "BinaryExpr") {
      const b = e as IR.IRBinaryExpr;
      visitExpr(b.left); visitExpr(b.right); return;
    }
    if (e.kind === "UnaryExpr") { visitExpr((e as IR.IRUnaryExpr).x); return; }
    if (e.kind === "ParenExpr") { visitExpr((e as IR.IRParenExpr).x); return; }
    if (e.kind === "IndexExpr") {
      const ix = e as IR.IRIndexExpr;
      visitExpr(ix.x); visitExpr(ix.index); return;
    }
    if (e.kind === "SelectorExpr") { visitExpr((e as IR.IRSelectorExpr).x); return; }
    if (e.kind === "CompositeLit") {
      for (const el of (e as IR.IRCompositeLit).elts) visitExpr(el);
      return;
    }
  }

  function visit(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) visit(s);
        return;
      case "ExprStmt": visitExpr((n as IR.IRExprStmt).expr); return;
      case "AssignStmt": {
        const a = n as IR.IRAssignStmt;
        for (const l of a.lhs) visitExpr(l);
        for (const r of a.rhs) visitExpr(r);
        return;
      }
      case "ShortDeclStmt":
        for (const v of (n as IR.IRShortDeclStmt).values) visitExpr(v);
        return;
      case "IncDecStmt": visitExpr((n as IR.IRIncDecStmt).x); return;
      case "ReturnStmt":
        for (const v of (n as IR.IRReturnStmt).values) visitExpr(v);
        return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) visit(i.init);
        visitExpr(i.cond);
        visit(i.body);
        if (i.else_) visit(i.else_);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) visit(f.init);
        if (f.cond) visitExpr(f.cond);
        if (f.post) visit(f.post);
        visit(f.body);
        return;
      }
      case "RangeStmt": visit((n as IR.IRRangeStmt).body); return;
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        if (sw.tag) visitExpr(sw.tag);
        for (const c of sw.cases) {
          if (c.values) for (const v of c.values) visitExpr(v);
          for (const s of c.body) visit(s);
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        if (v.value) visitExpr(v.value);
        return;
      }
    }
  }

  visit(body);
  return out;
}

/**
 * Walk the body checking for at least one usage of the parameter that clearly
 * points to its actual type. Mirrors the forward transformer's heuristics —
 * if this returns false, the forward will NOT be able to infer the param's
 * type correctly, so we must keep the annotation.
 */
function hasDisambiguatingUsage(name: string, type: IR.IRType, block: IR.IRBlockStmt): boolean {
  let found = false;

  // Collect "rune-like" locals: variables assigned from `p[i]`, `range p`,
  // or similar. Used to detect byte/rune comparisons that indirectly prove
  // the param is a string.
  const runeLikeLocals = new Set<string>();

  function collectRuneLikeLocals(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) collectRuneLikeLocals(s);
        return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) collectRuneLikeLocals(i.init);
        collectRuneLikeLocals(i.body);
        if (i.else_) collectRuneLikeLocals(i.else_);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) collectRuneLikeLocals(f.init);
        if (f.post) collectRuneLikeLocals(f.post);
        collectRuneLikeLocals(f.body);
        return;
      }
      case "RangeStmt": {
        const r = n as IR.IRRangeStmt;
        if (isTarget(r.x)) {
          if (r.key && r.key !== "_") runeLikeLocals.add(r.key);
          if (r.value && r.value !== "_") runeLikeLocals.add(r.value);
        }
        collectRuneLikeLocals(r.body);
        return;
      }
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        for (const c of sw.cases) for (const s of c.body) collectRuneLikeLocals(s);
        return;
      }
      case "ShortDeclStmt": {
        const s = n as IR.IRShortDeclStmt;
        if (s.names.length === 1 && s.values.length === 1) {
          const rhs = s.values[0];
          if (exprIsFromStringParamChar(rhs)) {
            runeLikeLocals.add(s.names[0]);
          }
        }
        return;
      }
    }
  }

  function exprIsFromStringParamChar(e: IR.IRExpr): boolean {
    if (e.kind === "IndexExpr" && isTarget((e as IR.IRIndexExpr).x)) return true;
    if (e.kind === "CallExpr") {
      const c = e as IR.IRCallExpr;
      if (c.func.kind === "Ident") {
        const fn = (c.func as IR.IRIdent).name;
        if ((fn === "int" || fn === "byte" || fn === "rune") && c.args.length === 1) {
          return exprIsFromStringParamChar(c.args[0]);
        }
      }
    }
    if (e.kind === "BinaryExpr") {
      const b = e as IR.IRBinaryExpr;
      return exprIsFromStringParamChar(b.left) || exprIsFromStringParamChar(b.right);
    }
    if (e.kind === "ParenExpr") return exprIsFromStringParamChar((e as IR.IRParenExpr).x);
    return false;
  }

  function isTarget(e: IR.IRExpr | undefined): boolean {
    return !!e && e.kind === "Ident" && (e as IR.IRIdent).name === name;
  }

  if (type.name === "string") collectRuneLikeLocals(block);

  function visitExpr(e: IR.IRExpr): void {
    if (!e || found) return;
    switch (e.kind) {
      case "CallExpr": {
        const c = e as IR.IRCallExpr;
        // []rune(p), []byte(p) → string
        if (type.name === "string" && c.func.kind === "ArrayTypeExpr" &&
            c.args.length === 1 && isTarget(c.args[0])) {
          const eltName = ((c.func as IR.IRArrayTypeExpr).elt as IR.IRIdent | undefined)?.name;
          if (eltName === "rune" || eltName === "byte") { found = true; return; }
        }
        // append(p, x) → slice
        if (type.isSlice && c.func.kind === "Ident" && (c.func as IR.IRIdent).name === "append" &&
            c.args.length >= 1 && isTarget(c.args[0])) {
          found = true; return;
        }
        // Printf("... %s ...", p) → string. We check both the aliased form
        // (e.g. `pf(fmt, args...)` where `pf` = `fmt.Printf`) and the raw
        // `fmt.Printf` selector form — the reverse pipeline resolves aliases
        // in-place during Go → IR conversion, so the IR usually has just an
        // Ident("pf"), not a SelectorExpr.
        if (type.name === "string") {
          let isPrintfFamily = false;
          if (c.func.kind === "Ident") {
            const fn = (c.func as IR.IRIdent).name;
            if (fn === "pf" || fn === "pl" || fn === "sf" || fn === "Ef" || fn === "fw" || fn === "fp") {
              isPrintfFamily = true;
            }
          } else if (c.func.kind === "SelectorExpr") {
            const sel = c.func as IR.IRSelectorExpr;
            if (sel.x.kind === "Ident" && (sel.x as IR.IRIdent).name === "fmt" &&
                (sel.sel === "Printf" || sel.sel === "Sprintf" || sel.sel === "Fprintf" ||
                 sel.sel === "Println" || sel.sel === "Errorf")) {
              isPrintfFamily = true;
            }
          }
          if (isPrintfFamily && c.args.length > 0 && c.args[0].kind === "BasicLit") {
            const fmtStr = ((c.args[0] as IR.IRBasicLit).value || "").slice(1, -1);
            const verbs: number[] = [];
            let m: RegExpExecArray | null;
            const allVerbRe = /%[-+# 0]*[\d*]*(?:\.[\d*]+)?([vTtbcdoOqxXUeEfFgGsp])/g;
            let idx = 0;
            while ((m = allVerbRe.exec(fmtStr)) !== null) {
              if (m[1] === "s" || m[1] === "q") verbs.push(idx);
              idx++;
            }
            for (const vi of verbs) {
              if (isTarget(c.args[1 + vi])) { found = true; return; }
            }
          }
        }
        for (const a of c.args) visitExpr(a);
        visitExpr(c.func);
        return;
      }
      case "IndexExpr": {
        const ix = e as IR.IRIndexExpr;
        // For nested `[][]T`, require nested indexing evidence.
        if (type.name.startsWith("[][]")) {
          if (ix.x.kind === "IndexExpr" && isTarget((ix.x as IR.IRIndexExpr).x)) {
            found = true; return;
          }
        } else if (type.isSlice && isTarget(ix.x)) {
          found = true; return;
        }
        visitExpr(ix.x); visitExpr(ix.index);
        return;
      }
      case "BinaryExpr": {
        const b = e as IR.IRBinaryExpr;
        // p[i] compared with rune-literal → string
        if (type.name === "string") {
          if (b.left.kind === "IndexExpr" && isTarget((b.left as IR.IRIndexExpr).x) &&
              b.right.kind === "BasicLit" && (b.right as IR.IRBasicLit).type === "RUNE") {
            found = true; return;
          }
          if (b.right.kind === "IndexExpr" && isTarget((b.right as IR.IRIndexExpr).x) &&
              b.left.kind === "BasicLit" && (b.left as IR.IRBasicLit).type === "RUNE") {
            found = true; return;
          }
          // A local that was assigned from `p[i]` or range iteration, when
          // compared with a rune literal, also proves `p` is a string.
          if (b.left.kind === "Ident" && runeLikeLocals.has((b.left as IR.IRIdent).name) &&
              b.right.kind === "BasicLit" && (b.right as IR.IRBasicLit).type === "RUNE") {
            found = true; return;
          }
          if (b.right.kind === "Ident" && runeLikeLocals.has((b.right as IR.IRIdent).name) &&
              b.left.kind === "BasicLit" && (b.left as IR.IRBasicLit).type === "RUNE") {
            found = true; return;
          }
          // p compared with string literal → string
          if (isTarget(b.left) && b.right.kind === "BasicLit" && (b.right as IR.IRBasicLit).type === "STRING") {
            found = true; return;
          }
          if (isTarget(b.right) && b.left.kind === "BasicLit" && (b.left as IR.IRBasicLit).type === "STRING") {
            found = true; return;
          }
        }
        visitExpr(b.left); visitExpr(b.right);
        return;
      }
      case "UnaryExpr":
        visitExpr((e as IR.IRUnaryExpr).x); return;
      case "ParenExpr":
        visitExpr((e as IR.IRParenExpr).x); return;
      case "SliceExpr": {
        const s = e as IR.IRSliceExpr;
        if (type.isSlice && isTarget(s.x)) { found = true; return; }
        visitExpr(s.x); if (s.low) visitExpr(s.low); if (s.high) visitExpr(s.high);
        return;
      }
      case "SelectorExpr":
        visitExpr((e as IR.IRSelectorExpr).x); return;
      case "CompositeLit":
        for (const el of (e as IR.IRCompositeLit).elts) visitExpr(el);
        return;
    }
  }

  function visit(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n || found) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) visit(s);
        return;
      case "ExprStmt":
        visitExpr((n as IR.IRExprStmt).expr); return;
      case "AssignStmt": {
        const a = n as IR.IRAssignStmt;
        for (const l of a.lhs) {
          if (type.isSlice && l.kind === "IndexExpr" && isTarget((l as IR.IRIndexExpr).x)) {
            found = true; return;
          }
          visitExpr(l);
        }
        for (const r of a.rhs) visitExpr(r);
        return;
      }
      case "ShortDeclStmt":
        for (const v of (n as IR.IRShortDeclStmt).values) visitExpr(v);
        return;
      case "IncDecStmt":
        visitExpr((n as IR.IRIncDecStmt).x); return;
      case "ReturnStmt":
        for (const v of (n as IR.IRReturnStmt).values) visitExpr(v);
        return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) visit(i.init);
        visitExpr(i.cond);
        visit(i.body);
        if (i.else_) visit(i.else_);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) visit(f.init);
        if (f.cond) visitExpr(f.cond);
        if (f.post) visit(f.post);
        visit(f.body);
        return;
      }
      case "RangeStmt": {
        const r = n as IR.IRRangeStmt;
        // Range is only a reliable signal for 1-D slices. Nested `[][]T`
        // types need separate evidence (nested index expressions), because
        // the forward inference cannot otherwise distinguish `[]int` from
        // `[][]int` when the only usage is `range p`.
        if (type.name.startsWith("[][]")) {
          visit(r.body);
          return;
        }
        if (type.isSlice && isTarget(r.x)) { found = true; return; }
        if (type.name === "string" && isTarget(r.x)) { found = true; return; }
        visit(r.body);
        return;
      }
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        if (sw.tag) visitExpr(sw.tag);
        for (const c of sw.cases) {
          if (c.values) for (const v of c.values) visitExpr(v);
          for (const s of c.body) visit(s);
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        if (v.value) visitExpr(v.value);
        return;
      }
    }
  }

  visit(block);
  return found;
}

/**
 * Decide whether the return type annotation can be dropped. True when the
 * body has exactly one value return path whose expression type is directly
 * inferrable by the forward transformer.
 *
 * We refuse to drop in these hazardous cases:
 *   - multiple returns (different arity, paranoid about tuple types)
 *   - non-inferable result type
 *   - the sole tail expression is a call to a non-type-conversion function
 *     whose return type the forward cannot derive from the call itself.
 *     Example: `caesarDecrypt(s,shift){^caesarEncrypt(s,26-shift)}` — the
 *     forward would default this to `int` because `caesarEncrypt` is an
 *     unknown symbol.
 */
function canElideReturnType(results: IR.IRType[], body: IR.IRBlockStmt): boolean {
  if (results.length === 0) return true;
  if (results.length !== 1) return false;
  const ret = results[0];
  if (!isInferableType(ret) && ret.name !== "rune" && ret.name !== "byte") return false;
  // Special case: when the return type is `int`, elision is always safe.
  // The forward inference defaults to `int` whenever it cannot determine a
  // return expression's type, so an opaque tail call like `^fact(n-1)` will
  // still round-trip as `int`. This saves `->int` (2-3 tokens) and, when
  // combined with bodyWithImplicitReturns, drops the leading `^` (1 token
  // per return path) for int-returning functions like factorial / ackermann.
  if (ret.name === "int") return true;
  // Other types: refuse if the tail is an unresolvable call UNLESS the
  // callee is a known sibling function whose return type matches ours.
  // In that case the forward's cross-function propagation will carry the
  // type across — e.g. caesarDecrypt returns caesarEncrypt(...) and both
  // return `string`, so dropping `->string` is safe.
  if (tailIsOpaqueCall(body)) {
    const tailCall = findTailCallInBody(body);
    if (tailCall && tailCall.func.kind === "Ident") {
      const calleeName = (tailCall.func as IR.IRIdent).name;
      const callee = globalFuncSigs.get(calleeName);
      if (callee && callee.results.length === 1 &&
          callee.results[0].name === ret.name) {
        return true;
      }
    }
    return false;
  }
  return true;
}

/** Find the CallExpr that is the last value of a return statement at any
 * terminal branch of the body. Used for cross-function return-type analysis. */
function findTailCallInBody(block: IR.IRBlockStmt): IR.IRCallExpr | null {
  if (block.stmts.length === 0) return null;
  const last = block.stmts[block.stmts.length - 1];
  if (last.kind === "ReturnStmt") {
    const r = last as IR.IRReturnStmt;
    if (r.values.length === 1 && r.values[0].kind === "CallExpr") {
      return r.values[0] as IR.IRCallExpr;
    }
  }
  if (last.kind === "ExprStmt") {
    const e = (last as IR.IRExprStmt).expr;
    if (e.kind === "CallExpr") return e as IR.IRCallExpr;
  }
  return null;
}

/**
 * Returns true when every terminal branch of `block` ends in a ReturnStmt or
 * ExprStmt whose expression is a CallExpr that is NOT a type-conversion.
 * Such a tail yields no type signal for the forward inference — the forward
 * will fall back to `int` regardless of the real return type.
 */
function tailIsOpaqueCall(block: IR.IRBlockStmt): boolean {
  if (block.stmts.length === 0) return false;
  const last = block.stmts[block.stmts.length - 1];
  if (last.kind === "ReturnStmt") {
    const vals = (last as IR.IRReturnStmt).values;
    if (vals.length === 1) return isOpaqueCallExpr(vals[0]);
    return false;
  }
  if (last.kind === "ExprStmt") {
    return isOpaqueCallExpr((last as IR.IRExprStmt).expr);
  }
  if (last.kind === "IfStmt") {
    const i = last as IR.IRIfStmt;
    if (!tailIsOpaqueCall(i.body)) return false;
    if (!i.else_) return true;
    if (i.else_.kind === "IfStmt") return tailIsOpaqueCall({ kind: "BlockStmt", stmts: [i.else_] });
    if (i.else_.kind === "BlockStmt") return tailIsOpaqueCall(i.else_ as IR.IRBlockStmt);
    return false;
  }
  return false;
}

/** True if the expression is a CallExpr that isn't a Go type conversion. */
function isOpaqueCallExpr(e: IR.IRExpr): boolean {
  if (e.kind !== "CallExpr") return false;
  const c = e as IR.IRCallExpr;
  if (c.func.kind === "ArrayTypeExpr") return false; // []byte(x), []rune(x)
  if (c.func.kind === "Ident") {
    const name = (c.func as IR.IRIdent).name;
    // Known type conversions yield their named type directly.
    if (name === "string" || name === "int" || name === "int64" || name === "int32" ||
        name === "byte" || name === "rune" || name === "float64" || name === "float32" ||
        name === "bool") return false;
    // Known builtins with inferable results.
    if (name === "len" || name === "cap") return false;
  }
  return true;
}

/**
 * Convert the last statement of a block (and every tail position in nested
 * branches) from an explicit ReturnStmt into an ExprStmt, so the reverse
 * output lets the forward transformer re-apply its implicit-return logic.
 *
 * We also walk *non-tail* inner if-statements whose body is a single-value
 * ReturnStmt — these match the forward's `convertSingleExprIfToReturn`
 * rewrite so we can drop the `^` marker and save tokens.
 *
 * The rewrite is shallow (non-mutating at the input level) — we return a new
 * block whose stmts array has the tail rewritten.
 */
function bodyWithImplicitReturns(block: IR.IRBlockStmt): IR.IRBlockStmt {
  const stmts = block.stmts.slice();
  if (stmts.length === 0) return block;

  // First pass: non-tail positions. For every inner IfStmt whose body is a
  // single-value return, drop the explicit return so it emits as `{1}`.
  // The forward's convertSingleExprIfToReturn will convert it back to a
  // return when the enclosing function is value-returning.
  for (let i = 0; i < stmts.length - 1; i++) {
    stmts[i] = rewriteInnerImplicitReturns(stmts[i]);
  }

  // Second pass: the tail statement itself.
  const lastIdx = stmts.length - 1;
  const last = stmts[lastIdx];
  if (last.kind === "ReturnStmt") {
    const values = (last as IR.IRReturnStmt).values;
    if (values.length === 1) {
      stmts[lastIdx] = { kind: "ExprStmt", expr: values[0], stmtIndex: 0 } as IR.IRExprStmt;
    }
  } else if (last.kind === "IfStmt") {
    stmts[lastIdx] = rewriteIfReturns(last as IR.IRIfStmt);
  } else if (last.kind === "SwitchStmt") {
    stmts[lastIdx] = rewriteSwitchReturns(last as IR.IRSwitchStmt);
  }
  return { kind: "BlockStmt", stmts };
}

/**
 * Recursively walk a non-tail statement looking for inner IfStmts whose body
 * is a single-value ReturnStmt, and rewrite them as bare ExprStmts.
 */
function rewriteInnerImplicitReturns(n: IR.IRNode | IR.IRExprStmt): IR.IRNode | IR.IRExprStmt {
  if (!n) return n;
  switch (n.kind) {
    case "IfStmt": {
      const i = n as IR.IRIfStmt;
      const body = rewriteSingleExprIfBody(i.body);
      let else_ = i.else_;
      if (else_) {
        if (else_.kind === "IfStmt") else_ = rewriteInnerImplicitReturns(else_ as IR.IRIfStmt) as IR.IRIfStmt;
        else if (else_.kind === "BlockStmt") {
          const blockStmts = (else_ as IR.IRBlockStmt).stmts.map(rewriteInnerImplicitReturns);
          else_ = { kind: "BlockStmt", stmts: blockStmts } as IR.IRBlockStmt;
        }
      }
      return { ...i, body, else_ };
    }
    case "ForStmt": {
      const f = n as IR.IRForStmt;
      const newBody: IR.IRBlockStmt = { kind: "BlockStmt", stmts: f.body.stmts.map(rewriteInnerImplicitReturns) };
      return { ...f, body: newBody };
    }
    case "RangeStmt": {
      const r = n as IR.IRRangeStmt;
      const newBody: IR.IRBlockStmt = { kind: "BlockStmt", stmts: r.body.stmts.map(rewriteInnerImplicitReturns) };
      return { ...r, body: newBody };
    }
    case "SwitchStmt": {
      const sw = n as IR.IRSwitchStmt;
      const newCases = sw.cases.map(c => ({ ...c, body: c.body.map(rewriteInnerImplicitReturns) }));
      return { ...sw, cases: newCases };
    }
  }
  return n;
}

/**
 * If the given block has exactly one statement that is a single-value
 * ReturnStmt, replace it with a bare ExprStmt. This lets the reverse emit
 * `if cond { x }` instead of `if cond { ^x }`.
 */
function rewriteSingleExprIfBody(block: IR.IRBlockStmt): IR.IRBlockStmt {
  if (block.stmts.length !== 1) return block;
  const only = block.stmts[0];
  if (only.kind !== "ReturnStmt") return block;
  const ret = only as IR.IRReturnStmt;
  if (ret.values.length !== 1) return block;
  return { kind: "BlockStmt", stmts: [{ kind: "ExprStmt", expr: ret.values[0], stmtIndex: 0 } as IR.IRExprStmt] };
}

function rewriteIfReturns(ifStmt: IR.IRIfStmt): IR.IRIfStmt {
  const body = bodyWithImplicitReturns(ifStmt.body);
  let else_ = ifStmt.else_;
  if (else_) {
    if (else_.kind === "IfStmt") else_ = rewriteIfReturns(else_ as IR.IRIfStmt);
    else if (else_.kind === "BlockStmt") else_ = bodyWithImplicitReturns(else_ as IR.IRBlockStmt);
  }
  return { ...ifStmt, body, else_ };
}

function rewriteSwitchReturns(sw: IR.IRSwitchStmt): IR.IRSwitchStmt {
  const cases = sw.cases.map(c => {
    if (c.body.length === 0) return c;
    const newBody = c.body.slice();
    const lastIdx = newBody.length - 1;
    const last = newBody[lastIdx];
    if (last.kind === "ReturnStmt" && (last as IR.IRReturnStmt).values.length === 1) {
      newBody[lastIdx] = { kind: "ExprStmt", expr: (last as IR.IRReturnStmt).values[0], stmtIndex: 0 } as IR.IRExprStmt;
    }
    return { ...c, body: newBody };
  });
  return { ...sw, cases };
}

function nodeToAET(node: IR.IRNode | IR.IRExprStmt): string {
  switch (node.kind) {
    case "FuncDecl": {
      let s = "";
      if (node.receiver) {
        s += `${shortenType(node.receiver.type.name)}.`;
      }
      // Per-parameter elision: for each param, decide independently whether
      // the forward inference (plus recursive-call positional propagation)
      // can recover its type. This lets us drop some params in a signature
      // while keeping annotations on the rest — e.g. hanoi(n,from,to,via)
      // drops `n:int` (default) and `from:string,to:string` (printf %s
      // evidence) even when `via` has no direct usage.
      // Use pre-computed elision results (computed before identifier
      // shortening) so that cross-function and call-site analysis use
      // the original, un-renamed function names.
      const elidable = precomputedElidable.get(node.name) ??
                        computeElidableParams(node.name, node.params, node.body);
      s += `${node.name}(${node.params.map((p, i) => {
        if (p.type.name === "interface{}") return p.name;
        if (elidable[i]) return p.name;
        return `${p.name}:${shortenType(p.type.name)}`;
      }).join(",")})`;

      const canDropReturnType = precomputedReturnElide.get(node.name) ??
                                 canElideReturnType(node.results, node.body);
      if (node.results.length > 0 && !canDropReturnType) {
        // Check for error return sugar: (T, error) -> ->!T
        const lastResult = node.results[node.results.length - 1];
        if (lastResult.name === "error") {
          const nonErrorResults = node.results.slice(0, -1);
          if (nonErrorResults.length === 0) {
            s += `->!`;
          } else if (nonErrorResults.length === 1) {
            s += `->!${shortenType(nonErrorResults[0].name)}`;
          } else {
            s += `->!(${nonErrorResults.map(r => shortenType(r.name)).join(",")})`;
          }
        } else if (node.results.length === 1) {
          s += `->${shortenType(node.results[0].name)}`;
        } else {
          s += `->(${node.results.map(r => shortenType(r.name)).join(",")})`;
        }
      }

      const body = canDropReturnType
        ? (precomputedBody.get(node.name) ?? bodyWithImplicitReturns(node.body))
        : node.body;
      s += `{${blockToAET(body)}}`;
      return s;
    }
    case "StructDecl":
      return `@${node.name}{${node.fields.map(f => `${f.name}:${shortenType(f.type.name)}`).join(";")}}`;
    case "InterfaceDecl":
      return `@${node.name}[${node.methods.map(m => {
        const params = m.params.map(p => `${p.name}:${shortenType(p.type.name)}`).join(",");
        const ret = m.results.length > 0 ? `->${m.results.length === 1 ? shortenType(m.results[0].name) : `(${m.results.map(r => shortenType(r.name)).join(",")})`}` : "";
        return `${m.name}(${params})${ret}`;
      }).join(";")}]`;
    case "TypeAlias":
      return `@${node.name}=${node.underlying.name}`;
    case "ReturnStmt":
      return `^${node.values.map(exprToAET).join(",")}`;
    case "IfStmt": {
      let s = `if ${exprToAET(node.cond)}{${blockToAET(node.body)}}`;
      if (node.else_) {
        if (node.else_.kind === "IfStmt") {
          s += `else ${nodeToAET(node.else_)}`;
        } else if (node.else_.kind === "BlockStmt") {
          s += `else{${blockToAET(node.else_ as IR.IRBlockStmt)}}`;
        }
      }
      return s;
    }
    case "ForStmt": {
      // Detect `for i := 0; i < N; i++ { ... }` → `for i := 0..N { ... }`.
      // This saves 5+ tokens per loop, which is the single biggest per-test
      // source of compression in RosettaCode-style code.
      const rangeSugar = tryEmitDotDotFor(node);
      if (rangeSugar !== null) return rangeSugar;
      let header = "";
      if (node.init && node.post) {
        header = `${nodeToAET(node.init)};${node.cond ? exprToAET(node.cond) : ""};${nodeToAET(node.post)}`;
      } else if (node.cond) {
        header = exprToAET(node.cond);
      }
      return `for ${header}{${blockToAET(node.body)}}`;
    }
    case "RangeStmt": {
      const vars = [node.key || "_", node.value].filter(Boolean).join(",");
      return `for ${vars}:=range ${exprToAET(node.x)}{${blockToAET(node.body)}}`;
    }
    case "SwitchStmt": {
      const tag = node.tag ? ` ${exprToAET(node.tag)}` : "";
      const cases = node.cases.map(c => {
        if (c.values) {
          return `case ${c.values.map(exprToAET).join(",")}:${c.body.map(nodeToAET).join(";")}`;
        }
        return `default:${c.body.map(nodeToAET).join(";")}`;
      }).join(";");
      return `switch${tag}{${cases}}`;
    }
    case "ShortDeclStmt":
      return `${node.names.join(",")}:=${node.values.map(exprToAET).join(",")}`;
    case "AssignStmt": {
      // Note: we used to emit `s = append(s, x)` as `s+=x`, but the forward
      // parser treats `+=` as a numeric PlusAssign. Without a separate
      // append-operator token it cannot distinguish slice-append from
      // numeric add, so the round-trip breaks. Emit the explicit `apl(...)`
      // builtin instead — costs only a few tokens per append.
      return `${node.lhs.map(exprToAET).join(",")}${node.op}${node.rhs.map(exprToAET).join(",")}`;
    }
    case "ExprStmt":
      return exprToAET(node.expr);
    case "IncDecStmt":
      return `${exprToAET(node.x)}${node.op}`;
    case "DeferStmt":
      return `defer ${exprToAET(node.call)}`;
    case "GoStmt":
      return `go ${exprToAET(node.call)}`;
    case "SendStmt":
      return `${exprToAET(node.chan)}<-${exprToAET(node.value)}`;
    case "BranchStmt":
      return node.tok === "fallthrough" ? "ft" : node.tok;
    case "VarDecl": {
      // Forward parser expects `var name type` (no colon between name and
      // type). Using a colon would parse as a KeyValueExpr and trip the
      // tokenizer. An explicit space after name disambiguates from Ident.
      let s = `var ${node.name}`;
      if (node.type) s += ` ${shortenType(node.type.name)}`;
      if (node.value) s += `=${exprToAET(node.value)}`;
      return s;
    }
    case "ConstDecl":
      return `const(${node.specs.map(s => `${s.name}${s.value ? `=${exprToAET(s.value)}` : ""}`).join(";")})`;
    default:
      return `/* ${(node as any).kind} */`;
  }
}

function blockToAET(block: IR.IRBlockStmt): string {
  return block.stmts.map(nodeToAET).join(";");
}

/**
 * Recognize canonical range loops and emit compact sugar:
 *   `for i := start; i < end;  i++` → `for i := start..end  { ... }`
 *   `for i := start; i <= end; i++` → `for i := start..=end { ... }`
 *
 * The DotDot / DotDotEq range sugar is supported by the forward parser;
 * see `isDotDotFor` in parser/index.ts.
 *
 * Returns the sugared AET string, or `null` if the for-stmt doesn't match
 * the expected shape (in which case the caller falls back to the generic
 * three-clause emitter).
 */
function tryEmitDotDotFor(node: IR.IRForStmt): string | null {
  if (!node.init || !node.cond || !node.post) return null;

  // init must be `i := startExpr`
  if (node.init.kind !== "ShortDeclStmt") return null;
  const init = node.init as IR.IRShortDeclStmt;
  if (init.names.length !== 1 || init.values.length !== 1) return null;
  const loopVar = init.names[0];
  const startExpr = init.values[0];

  // cond must be `i < endExpr` (exclusive) or `i <= endExpr` (inclusive)
  if (node.cond.kind !== "BinaryExpr") return null;
  const cond = node.cond as IR.IRBinaryExpr;
  if (cond.op !== "<" && cond.op !== "<=") return null;
  if (cond.left.kind !== "Ident" || (cond.left as IR.IRIdent).name !== loopVar) return null;
  const endExpr = cond.right;

  // post must be `i++`
  if (node.post.kind !== "IncDecStmt") return null;
  const post = node.post as IR.IRIncDecStmt;
  if (post.op !== "++" || post.x.kind !== "Ident" || (post.x as IR.IRIdent).name !== loopVar) return null;

  const op = cond.op === "<=" ? "..=" : "..";
  return `for ${loopVar}:=${exprToAET(startExpr)}${op}${exprToAET(endExpr)}{${blockToAET(node.body)}}`;
}

function exprToAET(expr: IR.IRExpr): string {
  switch (expr.kind) {
    case "Ident": return expr.name;
    case "BasicLit": return expr.value;
    case "CompositeLit":
      return `${expr.type ? exprToAET(expr.type) : ""}{${expr.elts.map(exprToAET).join(",")}}`;
    case "BinaryExpr":
      return `${exprToAET(expr.left)}${expr.op}${exprToAET(expr.right)}`;
    case "UnaryExpr":
      return `${expr.op}${exprToAET(expr.x)}`;
    case "CallExpr": {
      // len(x) -> #x (1 token → 2 tokens, depending on x)
      if (expr.func.kind === "Ident" && expr.func.name === "len" && expr.args.length === 1) {
        return `#${exprToAET(expr.args[0])}`;
      }
      // Abbreviate builtins: make→mk, append→apl, delete→dx, copy→cpy/cp,
      // new→nw. Each abbreviation is one cl100k_base token, usually shorter
      // than the canonical name in tokens.
      if (expr.func.kind === "Ident") {
        const builtinAbbr: Record<string, string> = {
          make: "mk",
          append: "apl",
          delete: "dx",
          copy: "cpy",
          new: "nw",
          cap: "cp",
        };
        const abbr = builtinAbbr[expr.func.name];
        if (abbr) {
          return `${abbr}(${expr.args.map(exprToAET).join(",")})`;
        }
      }
      return `${exprToAET(expr.func)}(${expr.args.map(exprToAET).join(",")})`;
    }
    case "SelectorExpr":
      return `${exprToAET(expr.x)}.${expr.sel}`;
    case "IndexExpr":
      return `${exprToAET(expr.x)}[${exprToAET(expr.index)}]`;
    case "SliceExpr":
      return `${exprToAET(expr.x)}[${expr.low ? exprToAET(expr.low) : ""}:${expr.high ? exprToAET(expr.high) : ""}]`;
    case "StarExpr":
      return `*${exprToAET(expr.x)}`;
    case "UnaryRecvExpr":
      return `<-${exprToAET(expr.x)}`;
    case "ParenExpr":
      return `(${exprToAET(expr.x)})`;
    case "KeyValueExpr":
      return `${exprToAET(expr.key)}:${exprToAET(expr.value)}`;
    case "FuncLit":
      return `{${expr.params.map(p => p.name).join(",")}|${blockToAET(expr.body)}}`;
    case "TypeAssertExpr":
      return `${exprToAET(expr.x)}.(${expr.type.name})`;
    case "MapTypeExpr":
      return `map[${exprToAET(expr.key)}]${exprToAET(expr.value)}`;
    case "ArrayTypeExpr":
      return `[]${exprToAET(expr.elt)}`;
    case "ErrorPropExpr":
      return `${exprToAET(expr.x)}?${expr.wrap ? `!"${expr.wrap}"` : ""}`;
    case "PipeExpr":
      return `${exprToAET(expr.x)}|${expr.op}(${exprToAET(expr.fn)})`;
    default:
      return "_";
  }
}
