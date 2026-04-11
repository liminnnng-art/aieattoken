// Transformer: Converts Chevrotain CST to IR nodes
// Also handles: stdlib alias expansion, import resolution, type inference

import { CstNode, IToken } from "chevrotain";
import * as IR from "../ir.js";

// Load stdlib aliases
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

let aliasMap: Record<string, { go: string; pkg: string; isType?: boolean }> = {};

export function loadAliases(path?: string) {
  try {
    const p = path || resolve(process.cwd(), "stdlib-aliases.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    aliasMap = data.aliases || {};
  } catch { /* aliases optional */ }
}

// Collected imports during transformation
let collectedImports: Set<string>;

function addImport(pkg: string) {
  collectedImports.add(pkg);
}

function resolveAlias(name: string): { goFunc: string; pkg: string } | null {
  const entry = aliasMap[name];
  if (!entry) return null;
  addImport(entry.pkg);
  return { goFunc: entry.go, pkg: entry.pkg };
}

// Helper to extract token image from CST children
function tok(node: CstNode, tokenName: string, idx = 0): string | undefined {
  const tokens = node.children[tokenName] as IToken[] | undefined;
  return tokens?.[idx]?.image;
}

function tokAll(node: CstNode, tokenName: string): string[] {
  const tokens = node.children[tokenName] as IToken[] | undefined;
  return tokens?.map(t => t.image) || [];
}

function child(node: CstNode, ruleName: string, idx = 0): CstNode | undefined {
  const nodes = node.children[ruleName] as CstNode[] | undefined;
  return nodes?.[idx];
}

function children(node: CstNode, ruleName: string): CstNode[] {
  return (node.children[ruleName] as CstNode[]) || [];
}

let stmtCounter = 0;
function nextStmtIndex(): number {
  return stmtCounter++;
}

// Main transform entry point
export function transform(cst: CstNode): IR.IRProgram {
  collectedImports = new Set();
  stmtCounter = 0;
  const decls = transformProgram(cst);
  return {
    kind: "Program",
    package: "main",
    imports: Array.from(collectedImports).sort().map(p => ({ path: p })),
    decls,
    stmtIndex: 0,
  };
}

function transformProgram(node: CstNode): IR.IRNode[] {
  const decls: IR.IRNode[] = [];
  for (const tld of children(node, "topLevelDecl")) {
    const d = transformTopLevelDecl(tld);
    if (d) decls.push(d);
  }
  return decls;
}

function transformTopLevelDecl(node: CstNode): IR.IRNode | null {
  const sd = child(node, "structDecl");
  if (sd) return transformStructDecl(sd);
  const cd = child(node, "constDecl");
  if (cd) return transformConstDecl(cd);
  const vd = child(node, "varDecl");
  if (vd) return transformVarDecl(vd);
  const fd = child(node, "funcOrMethodDecl");
  if (fd) return transformFuncOrMethodDecl(fd);
  return null;
}

function transformStructDecl(node: CstNode): IR.IRNode {
  const name = tok(node, "Ident") || "";
  const si = nextStmtIndex();

  // Struct: @Name{fields}
  const fl = child(node, "fieldList");
  if (fl) {
    const fields = transformFieldList(fl);
    return { kind: "StructDecl", name, fields, stmtIndex: si } as IR.IRStructDecl;
  }

  // Interface: @Name[methods]
  const ml = child(node, "methodSigList");
  if (ml) {
    const methods = transformMethodSigList(ml);
    return { kind: "InterfaceDecl", name, methods, stmtIndex: si } as IR.IRInterfaceDecl;
  }

  // Type alias: @Name=type
  const te = child(node, "typeExpr");
  if (te) {
    return { kind: "TypeAlias", name, underlying: transformTypeExpr(te), stmtIndex: si } as IR.IRTypeAlias;
  }

  return { kind: "StructDecl", name, fields: [], stmtIndex: si } as IR.IRStructDecl;
}

function transformFieldList(node: CstNode): IR.IRField[] {
  return children(node, "fieldDecl").map(fd => {
    const name = tok(fd, "Ident") || "";
    const te = child(fd, "typeExpr");
    const type = te ? transformTypeExpr(te) : IR.simpleType("interface{}");
    // Auto-generate JSON tag from field name
    const tag = name[0] >= "A" && name[0] <= "Z"
      ? `json:"${name[0].toLowerCase() + name.slice(1)}"`
      : undefined;
    return { name, type, tag };
  });
}

function transformMethodSigList(node: CstNode): IR.IRMethodSig[] {
  return children(node, "methodSig").map(ms => {
    const name = tok(ms, "Ident") || "";
    const pl = child(ms, "paramList");
    const params = pl ? transformParamList(pl) : [];
    const rt = child(ms, "returnType");
    const results = rt ? transformReturnType(rt) : [];
    return { name, params, results };
  });
}

// Sentinel marker for params with no explicit type in source AET.
// Replaced by inferred types during transformFuncOrMethodDecl (or defaults to int).
const PARAM_INFER_MARKER = "__aet_infer__";

function transformFuncOrMethodDecl(node: CstNode): IR.IRFuncDecl {
  const idents = tokAll(node, "Ident");
  const si = nextStmtIndex();
  const hasDot = tok(node, "Dot") !== undefined;

  let name: string;
  let receiver: IR.IRFuncDecl["receiver"] | undefined;

  if (hasDot && idents.length >= 2) {
    // Method: TypeName.methodName
    const typeName = idents[0];
    name = idents[1];
    const recvName = typeName[0].toLowerCase();
    receiver = {
      name: recvName,
      type: IR.simpleType(typeName),
      pointer: true,
    };
  } else {
    name = idents[0] || "";
  }

  const pl = child(node, "paramList") || child(node, "paramList", 1);
  const params = pl ? transformParamList(pl) : [];

  const rt = child(node, "returnType") || child(node, "returnType", 1);
  const results = rt ? transformReturnType(rt) : [];
  const hasExplicitReturnType = results.length > 0;

  const sl = child(node, "stmtList") || child(node, "stmtList", 1);
  const body = sl ? transformStmtList(sl) : { kind: "BlockStmt" as const, stmts: [] };

  // Check if the function returns error (for ? operator)
  // If body contains ErrorPropExpr and no explicit error return type, add it
  if (hasErrorProp(body) && !results.some(r => r.name === "error")) {
    results.push(IR.simpleType("error"));
  }

  // Implicit return: convert tail expression statements in the body (and its
  // terminal branches) into ReturnStmt nodes when the function does not
  // already have explicit returns everywhere. This implements the compact AET
  // convention where the last bare expression in a function body is an
  // implicit return (e.g. `factorial(n){if n==0{1};n*factorial(n-1)}`).
  //
  // We only apply this to *value-returning* functions. A function is deemed
  // procedural (returns nothing) when its top-level body contains a bare
  // CallExpr statement — that is a fire-and-forget call whose result is
  // discarded, which is incompatible with value-returning semantics. Such
  // functions skip tail-expr conversion and return-type inference.
  const isProcedural = !hasExplicitReturnType && isProceduralBody(body);
  if (name !== "main" && !isProcedural) {
    convertTailExprsToReturns(body);
  }

  // Build a symbol table of local variables by walking declarations.
  // This is used by both parameter and return-type inference so that e.g.
  // returning a local variable `result:=""` produces a `string` return type.
  const symbols: SymbolTable = new Map();
  // Seed symbols with the current best-guess type for each param — starts as
  // the sentinel marker so we don't pollute inference with a wrong assumption.
  for (const p of params) symbols.set(p.name, p.type);
  collectLocalSymbols(body, symbols);

  // Infer untyped parameter types using both usage heuristics and the symbol
  // table, re-running the symbol collection once each param narrows so that
  // downstream variable assignments see the refined type.
  for (const p of params) {
    if (p.type.name === PARAM_INFER_MARKER) {
      const inferredType = inferParamType(p.name, body, symbols);
      p.type = inferredType;
      symbols.set(p.name, inferredType);
    }
  }

  // Recursive-call positional propagation: a recursive `f(a,b,c)` where the
  // function is `f` constrains argument a to match param[0], b to param[1],
  // etc. When an argument is a bare ident referring to another param, the
  // two params must share a type. We iterate until fixed point.
  //
  // Example: `hanoi(n,from,to,via)` with body containing
  // `hanoi(n-1,from,via,to)`. After direct inference from/to are `string` (via
  // the %s format in Printf). The recursive call says via ≡ to → via=string.
  propagateRecursiveCallTypes(name, params, body);

  // Second pass to pick up refined local types.
  collectLocalSymbols(body, symbols);

  // Infer return type from return statements if no explicit return type.
  // Procedural functions stay void.
  if (!hasExplicitReturnType && !isProcedural) {
    const inferred = inferReturnTypes(body, symbols);
    if (inferred.length > 0) {
      results.push(...inferred);
    }
  }

  return { kind: "FuncDecl", name, receiver, params, results, body, stmtIndex: si };
}

// Symbol table: maps local variable name → inferred IR type.
type SymbolTable = Map<string, IR.IRType>;

/**
 * Walk a block and record the inferred type of every variable introduced by a
 * short declaration (`x := ...`) or a typed var declaration. Existing entries
 * are not overwritten with worse information (e.g. an unknown ident).
 */
function collectLocalSymbols(block: IR.IRBlockStmt, symbols: SymbolTable): void {
  function visitExpr(e: IR.IRExpr): void {
    if (!e) return;
    if (e.kind === "CallExpr") {
      const c = e as IR.IRCallExpr;
      // Parser builds `[]rune(x)` as a CallExpr with ArrayTypeExpr func and
      // the inner expression as arg. Seed the type of that inner arg's name
      // whenever it's a bare identifier — covers `runes:=[]rune(s)` style.
      visitExpr(c.func);
      for (const a of c.args) visitExpr(a);
    }
  }

  function visit(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "ShortDeclStmt": {
        const s = n as IR.IRShortDeclStmt;
        // Single assignment: record inferred type.
        if (s.names.length === 1 && s.values.length === 1) {
          const t = inferExprType(s.values[0], symbols);
          if (t) symbols.set(s.names[0], t);
        } else if (s.names.length === s.values.length) {
          for (let i = 0; i < s.names.length; i++) {
            const t = inferExprType(s.values[i], symbols);
            if (t) symbols.set(s.names[i], t);
          }
        }
        for (const v of s.values) visitExpr(v);
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        if (v.type) symbols.set(v.name, v.type);
        else if (v.value) {
          const t = inferExprType(v.value, symbols);
          if (t) symbols.set(v.name, t);
        }
        if (v.value) visitExpr(v.value);
        return;
      }
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) visit(s);
        return;
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
        if (f.post) visit(f.post);
        visit(f.body);
        return;
      }
      case "RangeStmt":
        visit((n as IR.IRRangeStmt).body);
        return;
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        for (const c of sw.cases) for (const s of c.body) visit(s);
        return;
      }
    }
  }

  for (const s of block.stmts) visit(s);
}

function hasErrorProp(block: IR.IRBlockStmt): boolean {
  return JSON.stringify(block).includes('"ErrorPropExpr"');
}

/**
 * A function body is "procedural" (returns nothing) when no evidence is found
 * that it produces a value. Evidence includes:
 *   - a tail expression that isn't a CallExpr (e.g. BinaryExpr, Ident, literal)
 *   - a tail CallExpr that is a type conversion like `string(x)` or `[]rune(x)`
 *   - any explicit `^expr` return with values
 *
 * We examine every "tail position" — the last statement of the body plus the
 * last statement of every if/else-branch and switch-case. If none of them
 * looks like a value return, the function is procedural and we skip both the
 * tail-expression rewrite and return-type inference.
 *
 * This distinguishes:
 *   - hanoi(): all tails are `hanoi(...)` calls → procedural
 *   - ackermann(): one `if` has a `n+1` tail (non-call) → value-returning
 *   - caesar(): tail is `string(result)` (type conversion) → value-returning
 */
function isProceduralBody(block: IR.IRBlockStmt): boolean {
  return !hasValueReturningSignal(block);
}

/** Recognise `int(x)`, `string(x)`, `[]rune(x)`, etc. */
function isTypeConversionCall(e: IR.IRExpr): boolean {
  if (e.kind !== "CallExpr") return false;
  const c = e as IR.IRCallExpr;
  if (c.func.kind === "ArrayTypeExpr") return true;
  if (c.func.kind === "Ident") {
    const name = (c.func as IR.IRIdent).name;
    return name === "string" || name === "int" || name === "int8" || name === "int16" ||
           name === "int32" || name === "int64" || name === "uint" || name === "uint8" ||
           name === "uint16" || name === "uint32" || name === "uint64" || name === "uintptr" ||
           name === "byte" || name === "rune" || name === "float32" || name === "float64" ||
           name === "bool" || name === "complex64" || name === "complex128";
  }
  return false;
}

/** An expression that obviously produces a value (not a call-with-discarded-result). */
function isValueExpr(e: IR.IRExpr): boolean {
  if (!e) return false;
  switch (e.kind) {
    case "BasicLit":
    case "Ident":
    case "BinaryExpr":
    case "UnaryExpr":
    case "IndexExpr":
    case "SliceExpr":
    case "SelectorExpr":
    case "CompositeLit":
    case "ParenExpr":
    case "TypeAssertExpr":
      return true;
    case "CallExpr":
      return isTypeConversionCall(e);
  }
  return false;
}

function hasValueReturningSignal(n: IR.IRNode | IR.IRExprStmt | IR.IRBlockStmt | undefined): boolean {
  if (!n) return false;
  switch (n.kind) {
    case "BlockStmt": {
      const b = n as IR.IRBlockStmt;
      // Check each non-tail statement's nested structures for signals.
      for (let i = 0; i < b.stmts.length; i++) {
        const s = b.stmts[i];
        if (i < b.stmts.length - 1) {
          // Non-tail: still examine nested if/switch bodies for their own tails.
          if (hasValueReturningSignal(s)) return true;
        } else {
          // Tail statement.
          if (s.kind === "ExprStmt") {
            if (isValueExpr((s as IR.IRExprStmt).expr)) return true;
          } else if (s.kind === "ReturnStmt") {
            if ((s as IR.IRReturnStmt).values.length > 0) return true;
          } else {
            if (hasValueReturningSignal(s)) return true;
          }
        }
      }
      return false;
    }
    case "IfStmt": {
      const i = n as IR.IRIfStmt;
      if (hasValueReturningSignal(i.body)) return true;
      if (i.else_) return hasValueReturningSignal(i.else_ as any);
      return false;
    }
    case "ForStmt":
      return hasValueReturningSignal((n as IR.IRForStmt).body);
    case "RangeStmt":
      return hasValueReturningSignal((n as IR.IRRangeStmt).body);
    case "SwitchStmt": {
      const sw = n as IR.IRSwitchStmt;
      for (const c of sw.cases) {
        if (c.body.length === 0) continue;
        const last = c.body[c.body.length - 1];
        if (last.kind === "ExprStmt" && isValueExpr((last as IR.IRExprStmt).expr)) return true;
        if (last.kind === "ReturnStmt" && (last as IR.IRReturnStmt).values.length > 0) return true;
        if (hasValueReturningSignal(last)) return true;
      }
      return false;
    }
    case "ReturnStmt":
      return (n as IR.IRReturnStmt).values.length > 0;
    case "ExprStmt":
      return isValueExpr((n as IR.IRExprStmt).expr);
  }
  return false;
}

/**
 * Type-strength ranking: a higher number means we are "more confident" the
 * type is correct, so that when two constraints conflict the stronger one
 * wins. Types like `int` are the default fallback → low strength.
 */
function typeStrength(t: IR.IRType): number {
  if (!t) return 0;
  if (t.name === PARAM_INFER_MARKER) return 0;
  if (t.name === "int") return 1;
  // String, slices, maps are more specific → stronger evidence.
  return 5;
}

/**
 * Walk the body looking for calls to `funcName` and align the parameter types
 * transitively: if argument i at a call site is a bare identifier matching
 * another param j, then params i and j must share a type. When one side has a
 * stronger type than the other, upgrade the weaker one. Iterates until fixed
 * point (bounded to a few passes).
 */
function propagateRecursiveCallTypes(funcName: string, params: IR.IRParam[], body: IR.IRBlockStmt): void {
  if (params.length === 0 || !funcName) return;
  const paramNames = new Set(params.map(p => p.name));

  const calls: IR.IRExpr[][] = [];

  function collectCalls(e: IR.IRExpr): void {
    if (!e) return;
    switch (e.kind) {
      case "CallExpr": {
        const c = e as IR.IRCallExpr;
        if (c.func.kind === "Ident" && (c.func as IR.IRIdent).name === funcName) {
          calls.push(c.args);
        }
        collectCalls(c.func);
        for (const a of c.args) collectCalls(a);
        return;
      }
      case "BinaryExpr":
        collectCalls((e as IR.IRBinaryExpr).left);
        collectCalls((e as IR.IRBinaryExpr).right);
        return;
      case "UnaryExpr":
        collectCalls((e as IR.IRUnaryExpr).x);
        return;
      case "ParenExpr":
        collectCalls((e as IR.IRParenExpr).x);
        return;
      case "IndexExpr":
        collectCalls((e as IR.IRIndexExpr).x);
        collectCalls((e as IR.IRIndexExpr).index);
        return;
      case "SelectorExpr":
        collectCalls((e as IR.IRSelectorExpr).x);
        return;
      case "CompositeLit":
        for (const el of (e as IR.IRCompositeLit).elts) collectCalls(el);
        return;
      case "KeyValueExpr":
        collectCalls((e as IR.IRKeyValueExpr).key);
        collectCalls((e as IR.IRKeyValueExpr).value);
        return;
    }
  }

  function walk(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) walk(s);
        return;
      case "ExprStmt":
        collectCalls((n as IR.IRExprStmt).expr);
        return;
      case "AssignStmt": {
        const a = n as IR.IRAssignStmt;
        for (const l of a.lhs) collectCalls(l);
        for (const r of a.rhs) collectCalls(r);
        return;
      }
      case "ShortDeclStmt":
        for (const v of (n as IR.IRShortDeclStmt).values) collectCalls(v);
        return;
      case "IncDecStmt":
        collectCalls((n as IR.IRIncDecStmt).x);
        return;
      case "ReturnStmt":
        for (const v of (n as IR.IRReturnStmt).values) collectCalls(v);
        return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        collectCalls(i.cond);
        walk(i.body);
        if (i.else_) walk(i.else_);
        if (i.init) walk(i.init);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) walk(f.init);
        if (f.cond) collectCalls(f.cond);
        if (f.post) walk(f.post);
        walk(f.body);
        return;
      }
      case "RangeStmt":
        walk((n as IR.IRRangeStmt).body);
        return;
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        if (sw.tag) collectCalls(sw.tag);
        for (const c of sw.cases) {
          if (c.values) for (const v of c.values) collectCalls(v);
          for (const s of c.body) walk(s);
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        if (v.value) collectCalls(v.value);
        return;
      }
    }
  }

  walk(body);
  if (calls.length === 0) return;

  // Iterate until fixed point.
  for (let iter = 0; iter < 4; iter++) {
    let changed = false;
    for (const args of calls) {
      const len = Math.min(args.length, params.length);
      for (let i = 0; i < len; i++) {
        const arg = args[i];
        if (arg.kind !== "Ident") continue;
        const argName = (arg as IR.IRIdent).name;
        if (!paramNames.has(argName)) continue;
        const argParam = params.find(p => p.name === argName)!;
        const paramI = params[i];
        const strA = typeStrength(argParam.type);
        const strB = typeStrength(paramI.type);
        if (strA > strB) {
          paramI.type = argParam.type;
          changed = true;
        } else if (strB > strA) {
          argParam.type = paramI.type;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * Convert tail expression statements into return statements recursively.
 *
 * For the compact AET format (`factorial(n){if n==0{1};n*factorial(n-1)}`),
 * a trailing bare expression is an implicit return. We walk every "tail
 * position" in the block tree and rewrite `ExprStmt(e)` to `ReturnStmt(e)`.
 *
 * Tail positions:
 *   - last statement of a function body block
 *   - last statement of each branch of a terminal if/else chain
 *   - last statement of each case in a terminal switch
 */
function convertTailExprsToReturns(block: IR.IRBlockStmt): void {
  const stmts = block.stmts;
  if (stmts.length === 0) return;

  // Walk non-tail statements too: inner if/switch/for/range can themselves
  // contain single-bare-expression implicit returns like `if c!=c2{false}`.
  for (let i = 0; i < stmts.length; i++) {
    convertInnerImplicitReturns(stmts[i]);
  }

  // Now handle the true tail statement.
  const lastIdx = stmts.length - 1;
  const last = stmts[lastIdx];
  if (last.kind === "ExprStmt") {
    stmts[lastIdx] = {
      kind: "ReturnStmt",
      values: [last.expr],
      stmtIndex: (last as IR.IRExprStmt).stmtIndex ?? 0,
    } as IR.IRReturnStmt;
  } else if (last.kind === "IfStmt") {
    convertTailExprsInIf(last);
  } else if (last.kind === "SwitchStmt") {
    convertTailExprsInSwitch(last);
  } else if (last.kind === "BlockStmt") {
    convertTailExprsToReturns(last as IR.IRBlockStmt);
  }
}

/**
 * Recursively walk a statement subtree looking for single-bare-expression
 * `if`/`switch` children and rewrite them as returns. Unlike
 * `convertTailExprsToReturns` this does NOT touch the last-statement
 * position — it only handles nested cases that are NOT in tail position.
 */
function convertInnerImplicitReturns(n: IR.IRNode | IR.IRExprStmt): void {
  if (!n) return;
  switch (n.kind) {
    case "IfStmt":
      convertSingleExprIfToReturn(n as IR.IRIfStmt);
      return;
    case "SwitchStmt":
      convertSingleExprSwitchToReturns(n as IR.IRSwitchStmt);
      return;
    case "ForStmt":
      for (const s of (n as IR.IRForStmt).body.stmts) convertInnerImplicitReturns(s);
      return;
    case "RangeStmt":
      for (const s of (n as IR.IRRangeStmt).body.stmts) convertInnerImplicitReturns(s);
      return;
    case "BlockStmt":
      for (const s of (n as IR.IRBlockStmt).stmts) convertInnerImplicitReturns(s);
      return;
  }
}

/**
 * Convert `if cond { x }` where the `then` branch is a single bare expression
 * into a return statement. Used for mid-function if-statements like the
 * `if n==0 { 1 }` guard in a compact-AET factorial.
 */
function convertSingleExprIfToReturn(ifStmt: IR.IRIfStmt): void {
  const thenStmts = ifStmt.body.stmts;
  if (thenStmts.length === 1 && thenStmts[0].kind === "ExprStmt") {
    const expr = (thenStmts[0] as IR.IRExprStmt).expr;
    thenStmts[0] = {
      kind: "ReturnStmt",
      values: [expr],
      stmtIndex: 0,
    } as IR.IRReturnStmt;
  }
  // Recurse: nested if/switch inside the then-branch can themselves have
  // single-expression implicit returns.
  for (const s of ifStmt.body.stmts) {
    if (s.kind === "IfStmt") convertSingleExprIfToReturn(s);
    if (s.kind === "SwitchStmt") convertSingleExprSwitchToReturns(s);
  }
}

/**
 * Convert any case clause whose body is a single bare expression into a
 * return statement. Used for switch cases like `case a[mid]<target: mid+1`
 * where the case body is a sole expression.
 */
function convertSingleExprSwitchToReturns(sw: IR.IRSwitchStmt): void {
  for (const c of sw.cases) {
    if (c.body.length === 1 && c.body[0].kind === "ExprStmt") {
      const expr = (c.body[0] as IR.IRExprStmt).expr;
      c.body[0] = {
        kind: "ReturnStmt",
        values: [expr],
        stmtIndex: 0,
      } as IR.IRReturnStmt;
    }
  }
}

/**
 * Recursively convert the tail of every branch of an if/else chain to a
 * return statement.
 */
function convertTailExprsInIf(ifStmt: IR.IRIfStmt): void {
  convertTailExprsToReturns(ifStmt.body);
  if (ifStmt.else_) {
    if (ifStmt.else_.kind === "IfStmt") {
      convertTailExprsInIf(ifStmt.else_ as IR.IRIfStmt);
    } else if (ifStmt.else_.kind === "BlockStmt") {
      convertTailExprsToReturns(ifStmt.else_ as IR.IRBlockStmt);
    }
  }
}

/**
 * Recursively convert the tail of every case body in a switch statement.
 */
function convertTailExprsInSwitch(sw: IR.IRSwitchStmt): void {
  for (const c of sw.cases) {
    if (c.body.length === 0) continue;
    const lastIdx = c.body.length - 1;
    const last = c.body[lastIdx];
    if (last.kind === "ExprStmt") {
      c.body[lastIdx] = {
        kind: "ReturnStmt",
        values: [(last as IR.IRExprStmt).expr],
        stmtIndex: 0,
      } as IR.IRReturnStmt;
    }
  }
}

/**
 * Walk every ReturnStmt in the block tree and collect the inferred Go type of
 * each return value's first expression. Used when a function has no explicit
 * return type.
 *
 * Returns an empty array if no return statements are found, or if the only
 * returns are bare `return` with no values.
 */
function inferReturnTypes(block: IR.IRBlockStmt, symbols: SymbolTable): IR.IRType[] {
  const samples: IR.IRExpr[][] = [];
  collectReturns(block, samples);
  if (samples.length === 0) return [];

  // Determine arity from the widest non-empty sample.
  let arity = 0;
  for (const s of samples) if (s.length > arity) arity = s.length;
  if (arity === 0) return [];

  const result: IR.IRType[] = [];
  for (let i = 0; i < arity; i++) {
    let inferred: IR.IRType | undefined;
    for (const s of samples) {
      if (i >= s.length) continue;
      const t = inferExprType(s[i], symbols);
      if (t && t.name !== PARAM_INFER_MARKER) {
        if (!inferred) inferred = t;
        // Widen `int` <> `int64` etc. later if needed; for now, first wins.
      }
    }
    result.push(inferred ?? IR.simpleType("int"));
  }
  return result;
}

function collectReturns(node: IR.IRNode | IR.IRExprStmt, out: IR.IRExpr[][]): void {
  switch (node.kind) {
    case "ReturnStmt":
      out.push((node as IR.IRReturnStmt).values);
      return;
    case "BlockStmt":
      for (const s of (node as IR.IRBlockStmt).stmts) collectReturns(s, out);
      return;
    case "IfStmt": {
      const n = node as IR.IRIfStmt;
      collectReturns(n.body, out);
      if (n.else_) collectReturns(n.else_, out);
      return;
    }
    case "ForStmt":
      collectReturns((node as IR.IRForStmt).body, out);
      return;
    case "RangeStmt":
      collectReturns((node as IR.IRRangeStmt).body, out);
      return;
    case "SwitchStmt": {
      const sw = node as IR.IRSwitchStmt;
      for (const c of sw.cases) {
        for (const s of c.body) collectReturns(s, out);
      }
      return;
    }
  }
}

/**
 * Best-effort Go type inference for a single IR expression. Returns undefined
 * when the type cannot be determined. The optional symbol table lets us
 * resolve identifier references to their declared type.
 */
function inferExprType(expr: IR.IRExpr, symbols?: SymbolTable): IR.IRType | undefined {
  switch (expr.kind) {
    case "BasicLit": {
      const t = (expr as IR.IRBasicLit).type;
      if (t === "INT") return IR.simpleType("int");
      if (t === "FLOAT") return IR.simpleType("float64");
      if (t === "STRING") return IR.simpleType("string");
      if (t === "RUNE") return IR.simpleType("rune");
      return undefined;
    }
    case "Ident": {
      const name = (expr as IR.IRIdent).name;
      if (name === "true" || name === "false") return IR.simpleType("bool");
      if (name === "nil") return undefined;
      if (symbols) {
        const t = symbols.get(name);
        if (t && t.name !== PARAM_INFER_MARKER) return t;
      }
      return undefined;
    }
    case "UnaryExpr": {
      const u = expr as IR.IRUnaryExpr;
      if (u.op === "!") return IR.simpleType("bool");
      return inferExprType(u.x, symbols) ?? IR.simpleType("int");
    }
    case "BinaryExpr": {
      const b = expr as IR.IRBinaryExpr;
      if (b.op === "==" || b.op === "!=" || b.op === "<" || b.op === ">" ||
          b.op === "<=" || b.op === ">=" || b.op === "&&" || b.op === "||") {
        return IR.simpleType("bool");
      }
      // `+` on strings stays string; otherwise numeric.
      const lt = inferExprType(b.left, symbols);
      const rt = inferExprType(b.right, symbols);
      if (b.op === "+" && (lt?.name === "string" || rt?.name === "string")) {
        return IR.simpleType("string");
      }
      return lt ?? rt ?? IR.simpleType("int");
    }
    case "CallExpr": {
      const c = expr as IR.IRCallExpr;
      // Type conversions: string(x), int(x), []rune(x), []byte(x), float64(x)
      if (c.func.kind === "Ident") {
        const fname = (c.func as IR.IRIdent).name;
        if (fname === "string") return IR.simpleType("string");
        if (fname === "int") return IR.simpleType("int");
        if (fname === "int64") return IR.simpleType("int64");
        if (fname === "float64") return IR.simpleType("float64");
        if (fname === "float32") return IR.simpleType("float32");
        if (fname === "byte") return IR.simpleType("byte");
        if (fname === "rune") return IR.simpleType("rune");
        if (fname === "bool") return IR.simpleType("bool");
        if (fname === "len" || fname === "cap") return IR.simpleType("int");
        // `make([]T, ...)` → []T
        if (fname === "make" && c.args.length >= 1) {
          const t = inferExprType(c.args[0], symbols);
          if (t) return t;
          // The first arg may be a type expression — derive its name directly.
          const first = c.args[0];
          if (first.kind === "ArrayTypeExpr") {
            const at = first as IR.IRArrayTypeExpr;
            const eltName = (at.elt as any).name || "int";
            return { name: "[]" + eltName, isSlice: true, elementType: IR.simpleType(eltName) };
          }
          if (first.kind === "MapTypeExpr") {
            const mt = first as IR.IRMapTypeExpr;
            const k = (mt.key as any).name || "string";
            const v = (mt.value as any).name || "int";
            return IR.mapType(IR.simpleType(k), IR.simpleType(v));
          }
        }
        // `append(x, ...)` → same type as x
        if (fname === "append" && c.args.length >= 1) {
          return inferExprType(c.args[0], symbols);
        }
      }
      if (c.func.kind === "ArrayTypeExpr") {
        // []rune(x), []byte(x)
        const at = c.func as IR.IRArrayTypeExpr;
        const eltName = (at.elt as any).name || "byte";
        return { name: "[]" + eltName, isSlice: true, elementType: IR.simpleType(eltName) };
      }
      return undefined;
    }
    case "CompositeLit": {
      const cl = expr as IR.IRCompositeLit;
      if (cl.type) {
        if (cl.type.kind === "ArrayTypeExpr") {
          const at = cl.type as IR.IRArrayTypeExpr;
          const eltName = (at.elt as any).name || "int";
          return { name: "[]" + eltName, isSlice: true, elementType: IR.simpleType(eltName) };
        }
        if (cl.type.kind === "MapTypeExpr") {
          const mt = cl.type as IR.IRMapTypeExpr;
          const k = (mt.key as any).name || "string";
          const v = (mt.value as any).name || "int";
          return IR.mapType(IR.simpleType(k), IR.simpleType(v));
        }
        if (cl.type.kind === "Ident") return IR.simpleType((cl.type as IR.IRIdent).name);
      }
      return undefined;
    }
    case "IndexExpr": {
      const ix = expr as IR.IRIndexExpr;
      // If we know the container type, its element type is the result.
      const ct = inferExprType(ix.x, symbols);
      if (ct) {
        if (ct.isSlice && ct.elementType) return ct.elementType;
        if (ct.name.startsWith("[]")) {
          const eltName = ct.name.slice(2);
          return IR.simpleType(eltName);
        }
        if (ct.name === "string") return IR.simpleType("byte");
        if (ct.isMap && ct.valueType) return ct.valueType;
      }
      return undefined;
    }
    case "ParenExpr":
      return inferExprType((expr as IR.IRParenExpr).x, symbols);
  }
  return undefined;
}

/**
 * Infer an untyped parameter's type by scanning the function body for
 * characteristic usages. Returns an IRType; defaults to `int` when the body
 * gives no clear signal.
 *
 * Heuristics — once any of these matches, its classification wins because
 * strongest evidence should dominate:
 *   - `[]rune(p)` / `[]byte(p)` → `string`
 *   - `p[i] == rune-literal`, `p[i] - rune-literal`, `p[i] >= rune-literal` → `string`
 *   - `range p` where iteration var is compared with rune literals → `string`
 *   - `p` passed to Printf/Println alongside a `%s` in the format → `string`
 *   - Nested index `p[i][j]` → `[][]int` (best guess; see element hint)
 *   - `p` as LHS indexing target (`p[k] = v`) or `append(p, v)` → slice,
 *     element taken from `v` when possible
 *   - otherwise → `int`
 */
function inferParamType(paramName: string, body: IR.IRBlockStmt, symbols: SymbolTable): IR.IRType {
  let stringVotes = 0;
  let sliceVotes = 0;
  let mapVotes = 0;
  let nestedSlice = false;
  let sliceElementHint: string | undefined;

  function isTargetIdent(e: IR.IRExpr | undefined): boolean {
    return !!e && e.kind === "Ident" && (e as IR.IRIdent).name === paramName;
  }

  // Compare rune literals like 'a' or '0'.
  function isRuneLit(e: IR.IRExpr | undefined): boolean {
    return !!e && e.kind === "BasicLit" && (e as IR.IRBasicLit).type === "RUNE";
  }
  function isStringLit(e: IR.IRExpr | undefined): boolean {
    return !!e && e.kind === "BasicLit" && (e as IR.IRBasicLit).type === "STRING";
  }

  // Record variable names that are guaranteed to be byte/rune because they
  // came from iterating the param via `range` or from indexing the param.
  // Usage of these vars with rune literals is strong evidence the param is
  // a string (since iterating []int would compare with int literals).
  const runeLikeLocals = new Set<string>();

  // Pass 1: seed runeLikeLocals by checking range/index patterns.
  function scanIterables(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) scanIterables(s);
        return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        if (i.init) scanIterables(i.init);
        scanIterables(i.body);
        if (i.else_) scanIterables(i.else_);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) scanIterables(f.init);
        if (f.post) scanIterables(f.post);
        scanIterables(f.body);
        return;
      }
      case "RangeStmt": {
        const r = n as IR.IRRangeStmt;
        if (isTargetIdent(r.x)) {
          // When iterating the param, both loop variables are treated as
          // "might be rune". We'll confirm or deny via rune-literal comparisons.
          if (r.key && r.key !== "_") runeLikeLocals.add(r.key);
          if (r.value && r.value !== "_") runeLikeLocals.add(r.value);
        }
        scanIterables(r.body);
        return;
      }
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        for (const c of sw.cases) for (const s of c.body) scanIterables(s);
        return;
      }
      case "ShortDeclStmt": {
        const s = n as IR.IRShortDeclStmt;
        // `x := p[i]` or `x := p[i] - '0'` → x is byte/rune when p is a string
        if (s.names.length === 1 && s.values.length === 1) {
          const rhs = s.values[0];
          if (exprDerivesFromStringParamChar(rhs)) {
            runeLikeLocals.add(s.names[0]);
          }
        }
        return;
      }
    }
  }

  // Does the expression compute a byte/rune derived from `paramName[...]`?
  // Used to mark intermediate locals so that if we later compare them with
  // rune literals we vote the param as a string.
  function exprDerivesFromStringParamChar(e: IR.IRExpr): boolean {
    if (e.kind === "IndexExpr" && isTargetIdent((e as IR.IRIndexExpr).x)) return true;
    if (e.kind === "BinaryExpr") {
      const b = e as IR.IRBinaryExpr;
      if (exprDerivesFromStringParamChar(b.left) || exprDerivesFromStringParamChar(b.right)) return true;
    }
    if (e.kind === "CallExpr") {
      const c = e as IR.IRCallExpr;
      if (c.func.kind === "Ident") {
        const fn = (c.func as IR.IRIdent).name;
        if ((fn === "int" || fn === "byte" || fn === "rune") && c.args.length === 1) {
          return exprDerivesFromStringParamChar(c.args[0]);
        }
      }
    }
    if (e.kind === "ParenExpr") return exprDerivesFromStringParamChar((e as IR.IRParenExpr).x);
    return false;
  }

  scanIterables(body);

  // Pass 2: collect votes by walking expressions.
  function walkExpr(e: IR.IRExpr): void {
    if (!e) return;
    switch (e.kind) {
      case "CallExpr": {
        const c = e as IR.IRCallExpr;
        // []rune(p), []byte(p) → p is string
        if (c.func.kind === "ArrayTypeExpr" && c.args.length === 1 && isTargetIdent(c.args[0])) {
          const eltName = ((c.func as IR.IRArrayTypeExpr).elt as IR.IRIdent | undefined)?.name;
          if (eltName === "rune" || eltName === "byte") stringVotes += 10;
        }
        // string(p) → p is slice
        if (c.func.kind === "Ident" && (c.func as IR.IRIdent).name === "string" &&
            c.args.length === 1 && isTargetIdent(c.args[0])) {
          sliceVotes += 5;
          sliceElementHint = sliceElementHint || "byte";
        }
        // append(p, v) → p is slice; element hinted by v
        if (c.func.kind === "Ident" && (c.func as IR.IRIdent).name === "append" &&
            c.args.length >= 1 && isTargetIdent(c.args[0])) {
          sliceVotes += 5;
          if (c.args[1]) {
            const t = inferExprType(c.args[1], symbols);
            if (t) sliceElementHint = sliceElementHint || t.name;
          }
        }
        // Printf/Println-family with format specifier
        // Format string is the first STRING literal arg. If `p` appears as a
        // later arg at the position where %s is specified, the param is string.
        if (c.func.kind === "SelectorExpr") {
          const sel = c.func as IR.IRSelectorExpr;
          const x = sel.x;
          const method = sel.sel;
          if (x.kind === "Ident" && (x as IR.IRIdent).name === "fmt" &&
              (method === "Printf" || method === "Sprintf" || method === "Fprintf" ||
               method === "Errorf" || method === "Scanf")) {
            if (c.args.length > 0 && isStringLit(c.args[0])) {
              const fmtStr = ((c.args[0] as IR.IRBasicLit).value || "").slice(1, -1);
              // Enumerate format verbs in order.
              const verbRe = /%[-+# 0]*[\d*]*(?:\.[\d*]+)?([vTtbcdoOqxXUeEfFgGsp])/g;
              const verbs: string[] = [];
              let m: RegExpExecArray | null;
              while ((m = verbRe.exec(fmtStr)) !== null) verbs.push(m[1]);
              // Each verb maps to arg at index 1 + i.
              for (let i = 0; i < verbs.length; i++) {
                const arg = c.args[1 + i];
                if (!arg) break;
                if (isTargetIdent(arg)) {
                  const v = verbs[i];
                  if (v === "s" || v === "q") stringVotes += 10;
                  else if (v === "d" || v === "o" || v === "x" || v === "X" ||
                           v === "b" || v === "c" || v === "U") { /* int-ish, don't vote */ }
                  else if (v === "f" || v === "e" || v === "E" || v === "g" || v === "G") { /* float */ }
                  else if (v === "t") { /* bool */ }
                  else if (v === "v" || v === "T") { /* any — no signal */ }
                }
              }
            }
          }
        }
        for (const a of c.args) walkExpr(a);
        walkExpr(c.func);
        return;
      }
      case "IndexExpr": {
        const idx = e as IR.IRIndexExpr;
        if (isTargetIdent(idx.x)) {
          // Indexing is strong evidence: param is a slice (or string, but
          // that's decided separately via rune-literal comparisons).
          sliceVotes += 3;
        }
        // Nested: p[i][j] → p is [][]X. Detect by seeing another IndexExpr whose
        // `x` is an IndexExpr whose `x` is the param.
        if (idx.x.kind === "IndexExpr" && isTargetIdent((idx.x as IR.IRIndexExpr).x)) {
          nestedSlice = true;
          sliceVotes += 5;
        }
        walkExpr(idx.x); walkExpr(idx.index);
        return;
      }
      case "BinaryExpr": {
        const b = e as IR.IRBinaryExpr;
        // `p[i] op rune-literal` → p is string
        if (b.left.kind === "IndexExpr" && isTargetIdent((b.left as IR.IRIndexExpr).x) && isRuneLit(b.right)) {
          stringVotes += 10;
        }
        if (b.right.kind === "IndexExpr" && isTargetIdent((b.right as IR.IRIndexExpr).x) && isRuneLit(b.left)) {
          stringVotes += 10;
        }
        // Compared to string literal → p is string
        if (isTargetIdent(b.left) && isStringLit(b.right)) stringVotes += 10;
        if (isTargetIdent(b.right) && isStringLit(b.left)) stringVotes += 10;
        // `localVar op rune-literal` where localVar came from iterating/indexing p
        if (b.left.kind === "Ident" && runeLikeLocals.has((b.left as IR.IRIdent).name) && isRuneLit(b.right)) {
          stringVotes += 8;
        }
        if (b.right.kind === "Ident" && runeLikeLocals.has((b.right as IR.IRIdent).name) && isRuneLit(b.left)) {
          stringVotes += 8;
        }
        walkExpr(b.left); walkExpr(b.right);
        return;
      }
      case "UnaryExpr":
        walkExpr((e as IR.IRUnaryExpr).x); return;
      case "SelectorExpr":
        walkExpr((e as IR.IRSelectorExpr).x); return;
      case "SliceExpr": {
        const s = e as IR.IRSliceExpr;
        if (isTargetIdent(s.x)) sliceVotes += 1;
        walkExpr(s.x); if (s.low) walkExpr(s.low); if (s.high) walkExpr(s.high);
        return;
      }
      case "ParenExpr":
        walkExpr((e as IR.IRParenExpr).x); return;
      case "CompositeLit": {
        const cl = e as IR.IRCompositeLit;
        for (const el of cl.elts) walkExpr(el);
        return;
      }
      case "KeyValueExpr": {
        const kv = e as IR.IRKeyValueExpr;
        walkExpr(kv.key); walkExpr(kv.value);
        return;
      }
    }
  }

  function walk(n: IR.IRNode | IR.IRExprStmt): void {
    if (!n) return;
    switch (n.kind) {
      case "BlockStmt":
        for (const s of (n as IR.IRBlockStmt).stmts) walk(s);
        return;
      case "ExprStmt":
        walkExpr((n as IR.IRExprStmt).expr); return;
      case "AssignStmt": {
        const a = n as IR.IRAssignStmt;
        for (const l of a.lhs) {
          if (l.kind === "IndexExpr" && isTargetIdent((l as IR.IRIndexExpr).x)) {
            sliceVotes += 3;
          }
          // p[i][j] = v → p is [][]X; rhs hints element type
          if (l.kind === "IndexExpr" && (l as IR.IRIndexExpr).x.kind === "IndexExpr" &&
              isTargetIdent(((l as IR.IRIndexExpr).x as IR.IRIndexExpr).x)) {
            nestedSlice = true;
            sliceVotes += 5;
          }
          walkExpr(l);
        }
        for (const r of a.rhs) {
          walkExpr(r);
          // Element type hint from RHS: `p[i] = v` → element type of v.
          // (Keep simple: we already get it from inferExprType of RHS.)
        }
        return;
      }
      case "ShortDeclStmt":
        for (const v of (n as IR.IRShortDeclStmt).values) walkExpr(v);
        return;
      case "IncDecStmt":
        walkExpr((n as IR.IRIncDecStmt).x); return;
      case "ReturnStmt":
        for (const v of (n as IR.IRReturnStmt).values) walkExpr(v);
        return;
      case "IfStmt": {
        const i = n as IR.IRIfStmt;
        walkExpr(i.cond);
        walk(i.body);
        if (i.else_) walk(i.else_);
        if (i.init) walk(i.init);
        return;
      }
      case "ForStmt": {
        const f = n as IR.IRForStmt;
        if (f.init) walk(f.init);
        if (f.cond) walkExpr(f.cond);
        if (f.post) walk(f.post);
        walk(f.body);
        return;
      }
      case "RangeStmt": {
        const r = n as IR.IRRangeStmt;
        if (isTargetIdent(r.x)) {
          // two-var range usually means slice; map is rare in these tests.
          sliceVotes += 1;
        }
        walkExpr(r.x);
        walk(r.body);
        return;
      }
      case "SwitchStmt": {
        const sw = n as IR.IRSwitchStmt;
        if (sw.tag) walkExpr(sw.tag);
        for (const c of sw.cases) {
          if (c.values) for (const v of c.values) walkExpr(v);
          for (const s of c.body) walk(s);
        }
        return;
      }
      case "VarDecl": {
        const v = n as IR.IRVarDecl;
        if (v.value) walkExpr(v.value);
        return;
      }
    }
  }

  walk(body);

  // Resolution order: strong string signal > nested slice > slice > map > int.
  if (stringVotes >= 5) return IR.simpleType("string");
  if (nestedSlice) {
    const elt = sliceElementHint || "int";
    return { name: "[][]" + elt, isSlice: true, elementType: { name: "[]" + elt, isSlice: true, elementType: IR.simpleType(elt) } };
  }
  if (sliceVotes >= 3) {
    const elt = sliceElementHint || "int";
    return { name: "[]" + elt, isSlice: true, elementType: IR.simpleType(elt) };
  }
  if (mapVotes > 0) return IR.mapType(IR.simpleType("string"), IR.simpleType("int"));
  // Final fallback: `int`. Most-common param type in compact AET rosettacode
  // examples like `factorial(n)`, `gcd(a,b)`, `ackermann(m,n)`.
  return IR.simpleType("int");
}

function transformParamList(node: CstNode): IR.IRParam[] {
  return children(node, "param").map(p => {
    const name = tok(p, "Ident") || "_";
    const te = child(p, "typeExpr");
    const isVariadic = tok(p, "Ellipsis") !== undefined;
    // Untyped params get a sentinel type that callers (in
    // transformFuncOrMethodDecl) replace with an inferred type.
    let type = te ? transformTypeExpr(te) : IR.simpleType(PARAM_INFER_MARKER);
    if (isVariadic) {
      type = { ...type, name: "..." + type.name };
    }
    return { name, type };
  });
}

function transformReturnType(node: CstNode): IR.IRType[] {
  // Check for error sugar: ->!T means -> (T, error)
  if (tok(node, "Bang")) {
    const types = children(node, "typeExpr");
    if (types.length > 0) {
      return [...types.map(te => transformTypeExpr(te)), IR.simpleType("error")];
    }
    return [IR.simpleType("error")];
  }
  const types = children(node, "typeExpr");
  return types.map(te => transformTypeExpr(te));
}

function transformTypeExpr(node: CstNode): IR.IRType {
  // Pointer: *type
  if (tok(node, "Star")) {
    const inner = child(node, "typeExpr");
    return inner ? IR.pointerType(transformTypeExpr(inner)) : IR.simpleType("*interface{}");
  }
  // Slice / fixed array: `[]T` or `[N]T`
  if (tok(node, "LBrack") && tok(node, "RBrack")) {
    const inner = child(node, "typeExpr");
    const eltType = inner ? transformTypeExpr(inner) : IR.simpleType("interface{}");
    const sizeTok = tok(node, "IntLit");
    if (sizeTok) {
      // Fixed-size array keeps the `[N]` prefix in its name so the emitter
      // reproduces the original Go syntax.
      return { name: `[${sizeTok}]${eltType.name}`, isSlice: true, elementType: eltType };
    }
    return IR.sliceType(eltType);
  }
  // Map: map[K]V (also handle v1 abbreviation "Mp")
  if (tok(node, "Map") || tok(node, "Mp")) {
    const types = children(node, "typeExpr");
    const key = types[0] ? transformTypeExpr(types[0]) : IR.simpleType("string");
    const val = types[1] ? transformTypeExpr(types[1]) : IR.simpleType("interface{}");
    return IR.mapType(key, val);
  }
  // Func type (also handle v1 abbreviation "Fn")
  if (tok(node, "Fn")) {
    // Fn used as type keyword behaves like Func in type context
    const inner = child(node, "typeExpr");
    const elt = inner ? transformTypeExpr(inner) : IR.simpleType("interface{}");
    return IR.simpleType("func(" + elt.name + ")");
  }
  // Abbreviated numeric types
  if (tok(node, "F64")) return IR.simpleType("float64");
  if (tok(node, "I64")) return IR.simpleType("int64");
  if (tok(node, "F32")) return IR.simpleType("float32");
  if (tok(node, "I32")) return IR.simpleType("int32");
  if (tok(node, "I16")) return IR.simpleType("int16");
  if (tok(node, "I8")) return IR.simpleType("int8");
  if (tok(node, "U64")) return IR.simpleType("uint64");
  // Chan
  if (tok(node, "Chan")) {
    const inner = child(node, "typeExpr");
    const elt = inner ? transformTypeExpr(inner) : IR.simpleType("interface{}");
    return { name: "chan " + elt.name, isChan: true, elementType: elt };
  }
  // Named type: Ident or Ident.Ident
  const idents = tokAll(node, "Ident");
  if (idents.length === 2) {
    // Qualified: pkg.Type
    return IR.simpleType(idents[0] + "." + idents[1]);
  }
  if (idents.length === 1) {
    return IR.simpleType(idents[0]);
  }
  return IR.simpleType("interface{}");
}

function transformStmtList(node: CstNode): IR.IRBlockStmt {
  const stmts: (IR.IRNode | IR.IRExprStmt)[] = [];
  for (const s of children(node, "stmt")) {
    const transformed = transformStmt(s);
    if (transformed) stmts.push(transformed);
  }
  return { kind: "BlockStmt", stmts };
}

function transformStmt(node: CstNode): IR.IRNode | null {
  const c = (name: string) => child(node, name);
  if (c("ifStmt")) return transformIfStmt(c("ifStmt")!);
  if (c("forStmt")) return transformForStmt(c("forStmt")!);
  if (c("switchStmt")) return transformSwitchStmt(c("switchStmt")!);
  if (c("selectStmt")) return transformSelectStmt(c("selectStmt")!);
  if (c("returnStmt")) return transformReturnStmt(c("returnStmt")!);
  if (c("deferStmt")) return transformDeferStmt(c("deferStmt")!);
  if (c("goStmt")) return transformGoStmt(c("goStmt")!);
  if (c("branchStmt")) return transformBranchStmt(c("branchStmt")!);
  if (c("varDecl")) return transformVarDecl(c("varDecl")!);
  if (c("constDecl")) return transformConstDecl(c("constDecl")!);
  if (c("simpleStmt")) return transformSimpleStmt(c("simpleStmt")!);
  return null;
}

function transformIfStmt(node: CstNode): IR.IRIfStmt {
  const si = nextStmtIndex();
  const exprs = children(node, "expr");
  const stmtLists = children(node, "stmtList");
  const cond = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident" as const, name: "true" };
  const body = stmtLists[0] ? transformStmtList(stmtLists[0]) : { kind: "BlockStmt" as const, stmts: [] };

  let else_: IR.IRNode | undefined;
  const elseIf = children(node, "ifStmt");
  if (elseIf.length > 0) {
    else_ = transformIfStmt(elseIf[0]);
  } else if (stmtLists.length > 1) {
    else_ = transformStmtList(stmtLists[1]);
  }

  // Handle init statement
  const simpleStmt = child(node, "simpleStmt");
  const init = simpleStmt ? transformSimpleStmt(simpleStmt) : undefined;

  return { kind: "IfStmt", init, cond, body, else_, stmtIndex: si };
}

function transformForStmt(node: CstNode): IR.IRForStmt | IR.IRRangeStmt {
  const si = nextStmtIndex();

  // DotDot range: for i:=start..end { ... }
  if (tok(node, "DotDot")) {
    const loopVar = tokAll(node, "Ident")[0] || "i";
    const exprs = children(node, "expr");
    const start = exprs[0] ? transformExpr(exprs[0]) : { kind: "BasicLit" as const, type: "INT" as const, value: "0" };
    const end = exprs[1] ? transformExpr(exprs[1]) : { kind: "BasicLit" as const, type: "INT" as const, value: "0" };
    const sl = children(node, "stmtList");
    const body = sl.length > 0 ? transformStmtList(sl[sl.length - 1]) : { kind: "BlockStmt" as const, stmts: [] };

    // Expand to: for i := start; i < end; i++
    const init: IR.IRShortDeclStmt = { kind: "ShortDeclStmt", names: [loopVar], values: [start], stmtIndex: 0 };
    const cond: IR.IRBinaryExpr = { kind: "BinaryExpr", left: { kind: "Ident", name: loopVar }, op: "<", right: end };
    const post: IR.IRIncDecStmt = { kind: "IncDecStmt", x: { kind: "Ident", name: loopVar }, op: "++", stmtIndex: 0 };

    return { kind: "ForStmt", init, cond, post, body, stmtIndex: si };
  }

  // Range loop: for k, v := range expr { ... }
  // Support both "range" (v2) and "rng" (v1 abbreviation)
  if (tok(node, "Range") || tok(node, "Rng")) {
    const el = child(node, "exprList");
    const exprs = el ? children(el, "expr") : [];
    const keys = exprs.map(e => exprToString(transformExpr(e)));
    const rangeExpr = children(node, "expr");
    const x = rangeExpr[0] ? transformExpr(rangeExpr[0]) : { kind: "Ident" as const, name: "_" };
    const sl = child(node, "stmtList") || child(node, "stmtList", 1);
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt" as const, stmts: [] };
    return {
      kind: "RangeStmt",
      key: keys[0] || "_",
      value: keys[1],
      x,
      body,
      stmtIndex: si,
    };
  }

  // Regular for loop
  const simpleStmts = children(node, "simpleStmt");
  const exprs = children(node, "expr");
  const sl = child(node, "stmtList") || child(node, "stmtList", 1);
  const body = sl ? transformStmtList(sl) : { kind: "BlockStmt" as const, stmts: [] };

  // Determine init, cond, post based on what we have
  let init: IR.IRNode | undefined;
  let cond: IR.IRExpr | undefined;
  let post: IR.IRNode | undefined;

  if (simpleStmts.length >= 2) {
    init = transformSimpleStmt(simpleStmts[0]);
    post = transformSimpleStmt(simpleStmts[1]);
    cond = exprs[0] ? transformExpr(exprs[0]) : undefined;
  } else if (simpleStmts.length === 1 && exprs.length > 0) {
    init = transformSimpleStmt(simpleStmts[0]);
    cond = exprs[0] ? transformExpr(exprs[0]) : undefined;
  } else if (simpleStmts.length === 1) {
    // Could be just a condition (which was parsed as simpleStmt)
    cond = simpleStmtToExpr(simpleStmts[0]);
  } else if (exprs.length > 0) {
    cond = transformExpr(exprs[0]);
  }

  return { kind: "ForStmt", init, cond, post, body, stmtIndex: si };
}

function simpleStmtToExpr(node: CstNode): IR.IRExpr | undefined {
  const el = child(node, "exprList");
  if (!el) return undefined;
  const exprs = children(el, "expr");
  return exprs[0] ? transformExpr(exprs[0]) : undefined;
}

function transformSwitchStmt(node: CstNode): IR.IRSwitchStmt {
  const si = nextStmtIndex();
  const tagExpr = child(node, "expr");
  const tag = tagExpr ? transformExpr(tagExpr) : undefined;
  const cases = children(node, "caseClause").map(transformCaseClause);
  return { kind: "SwitchStmt", tag, cases, stmtIndex: si };
}

function transformCaseClause(node: CstNode): IR.IRCaseClause {
  const isDefault = tok(node, "Default") !== undefined;
  const el = child(node, "exprList");
  const values = !isDefault && el ? children(el, "expr").map(transformExpr) : undefined;
  const sl = child(node, "stmtList") || child(node, "stmtList", 1);
  const body: (IR.IRNode | IR.IRExprStmt)[] = sl ? transformStmtList(sl).stmts : [];
  return { kind: "CaseClause", values, body };
}

function transformSelectStmt(node: CstNode): IR.IRSelectStmt {
  const si = nextStmtIndex();
  const cases = children(node, "commClause").map(cc => {
    const isDefault = tok(cc, "Default") !== undefined;
    const ss = child(cc, "simpleStmt");
    const comm = !isDefault && ss ? transformSimpleStmt(ss) : undefined;
    const sl = child(cc, "stmtList") || child(cc, "stmtList", 1);
    const body: (IR.IRNode | IR.IRExprStmt)[] = sl ? transformStmtList(sl).stmts : [];
    return { kind: "CommClause" as const, comm: comm || undefined, body };
  });
  return { kind: "SelectStmt", cases, stmtIndex: si };
}

function transformReturnStmt(node: CstNode): IR.IRReturnStmt {
  const el = child(node, "exprList");
  const values = el ? children(el, "expr").map(transformExpr) : [];
  return { kind: "ReturnStmt", values, stmtIndex: nextStmtIndex() };
}

function transformDeferStmt(node: CstNode): IR.IRDeferStmt {
  const sl = child(node, "stmtList");
  if (sl) {
    // defer { body } → defer func() { body }()
    const funcLit: IR.IRFuncLit = {
      kind: "FuncLit",
      params: [],
      results: [],
      body: transformStmtList(sl),
    };
    const call: IR.IRCallExpr = { kind: "CallExpr", func: funcLit, args: [] };
    return { kind: "DeferStmt", call, stmtIndex: nextStmtIndex() };
  }
  const expr = child(node, "expr");
  return { kind: "DeferStmt", call: expr ? transformExpr(expr) : { kind: "Ident", name: "nil" }, stmtIndex: nextStmtIndex() };
}

function transformGoStmt(node: CstNode): IR.IRGoStmt {
  const sl = child(node, "stmtList");
  if (sl) {
    // go { body } → go func() { body }()
    const funcLit: IR.IRFuncLit = {
      kind: "FuncLit",
      params: [],
      results: [],
      body: transformStmtList(sl),
    };
    const call: IR.IRCallExpr = { kind: "CallExpr", func: funcLit, args: [] };
    return { kind: "GoStmt", call, stmtIndex: nextStmtIndex() };
  }
  const expr = child(node, "expr");
  return { kind: "GoStmt", call: expr ? transformExpr(expr) : { kind: "Ident", name: "nil" }, stmtIndex: nextStmtIndex() };
}

function transformBranchStmt(node: CstNode): IR.IRBranchStmt {
  let t: "break" | "continue" | "goto" | "fallthrough" = "break";
  if (tok(node, "Break")) t = "break";
  if (tok(node, "Continue")) t = "continue";
  if (tok(node, "Fallthrough")) t = "fallthrough";
  if (tok(node, "Ft")) t = "fallthrough";
  return { kind: "BranchStmt", tok: t, stmtIndex: nextStmtIndex() };
}

function transformVarDecl(node: CstNode): IR.IRVarDecl {
  const name = tok(node, "Ident") || "";
  const te = child(node, "typeExpr");
  const type = te ? transformTypeExpr(te) : undefined;
  const expr = child(node, "expr");
  const value = expr ? transformExpr(expr) : undefined;
  return { kind: "VarDecl", name, type, value, stmtIndex: nextStmtIndex() };
}

function transformConstDecl(node: CstNode): IR.IRConstDecl {
  const idents = tokAll(node, "Ident");
  const exprs = children(node, "expr");
  const specs = idents.map((name, i) => ({
    name,
    value: exprs[i] ? transformExpr(exprs[i]) : undefined,
  }));
  return { kind: "ConstDecl", specs, stmtIndex: nextStmtIndex() };
}

function transformSimpleStmt(node: CstNode): IR.IRNode {
  const exprLists = children(node, "exprList");
  const si = nextStmtIndex();

  // Short declaration: exprList := exprList
  if (tok(node, "ShortDecl")) {
    const lhs = exprLists[0] ? children(exprLists[0], "expr").map(e => exprToString(transformExpr(e))) : [];
    const rhs = exprLists[1] ? children(exprLists[1], "expr").map(transformExpr) : [];
    return { kind: "ShortDeclStmt", names: lhs, values: rhs, stmtIndex: si };
  }

  // Assignment: exprList op= exprList
  const assignOps = ["Assign", "PlusAssign", "MinusAssign", "MulAssign", "DivAssign", "ModAssign"];
  for (const op of assignOps) {
    if (tok(node, op)) {
      const lhs = exprLists[0] ? children(exprLists[0], "expr").map(transformExpr) : [];
      const rhs = exprLists[1] ? children(exprLists[1], "expr").map(transformExpr) : [];
      const opMap: Record<string, string> = {
        Assign: "=", PlusAssign: "+=", MinusAssign: "-=",
        MulAssign: "*=", DivAssign: "/=", ModAssign: "%=",
      };
      return { kind: "AssignStmt", lhs, rhs, op: opMap[op] || "=", stmtIndex: si };
    }
  }

  // Inc/Dec
  if (tok(node, "Inc")) {
    const x = exprLists[0] ? transformExpr(children(exprLists[0], "expr")[0]) : { kind: "Ident" as const, name: "x" };
    return { kind: "IncDecStmt", x, op: "++", stmtIndex: si };
  }
  if (tok(node, "Dec")) {
    const x = exprLists[0] ? transformExpr(children(exprLists[0], "expr")[0]) : { kind: "Ident" as const, name: "x" };
    return { kind: "IncDecStmt", x, op: "--", stmtIndex: si };
  }

  // Channel send: expr <- expr
  if (tok(node, "ChanArrow")) {
    const ch = exprLists[0] ? transformExpr(children(exprLists[0], "expr")[0]) : { kind: "Ident" as const, name: "ch" };
    const val = child(node, "expr");
    return { kind: "SendStmt", chan: ch, value: val ? transformExpr(val) : { kind: "Ident" as const, name: "nil" }, stmtIndex: si };
  }

  // Expression statement
  if (exprLists[0]) {
    const exprs = children(exprLists[0], "expr");
    if (exprs.length === 1) {
      return { kind: "ExprStmt", expr: transformExpr(exprs[0]), stmtIndex: si };
    }
  }

  return { kind: "ExprStmt", expr: { kind: "Ident", name: "_" }, stmtIndex: si };
}

// Expression transformation
function transformExpr(node: CstNode): IR.IRExpr {
  // Route based on CST rule name
  const name = node.name;
  switch (name) {
    case "expr": {
      const or1 = child(node, "orExpr");
      const or2 = child(node, "orExpr", 1);
      if (or1 && or2 && tok(node, "Colon")) {
        // Key-value expression
        return { kind: "KeyValueExpr", key: transformExpr(or1), value: transformExpr(or2) };
      }
      return or1 ? transformExpr(or1) : { kind: "Ident", name: "_" };
    }
    case "orExpr": return transformBinExpr(node, "andExpr", "LogOr", "||");
    case "andExpr": return transformBinExpr(node, "compareExpr", "LogAnd", "&&");
    case "compareExpr": return transformCompareExpr(node);
    case "addExpr": return transformAddExpr(node);
    case "mulExpr": return transformMulExpr(node);
    case "unaryExpr": return transformUnaryExpr(node);
    case "postfixExpr": return transformPostfixExpr(node);
    case "primaryExpr": return transformPrimaryExpr(node);
    default:
      return { kind: "Ident", name: "_unknown_" + name };
  }
}

function transformBinExpr(node: CstNode, childRule: string, opToken: string, opStr: string): IR.IRExpr {
  const operands = children(node, childRule);
  let result = transformExpr(operands[0]);
  for (let i = 1; i < operands.length; i++) {
    result = { kind: "BinaryExpr", left: result, op: opStr, right: transformExpr(operands[i]) };
  }
  return result;
}

function transformCompareExpr(node: CstNode): IR.IRExpr {
  const operands = children(node, "addExpr");
  if (operands.length === 1) return transformExpr(operands[0]);
  const ops = ["Eq", "Neq", "Lt", "Gt", "Leq", "Geq"];
  const opMap: Record<string, string> = { Eq: "==", Neq: "!=", Lt: "<", Gt: ">", Leq: "<=", Geq: ">=" };
  for (const op of ops) {
    if (tok(node, op)) {
      return { kind: "BinaryExpr", left: transformExpr(operands[0]), op: opMap[op], right: transformExpr(operands[1]) };
    }
  }
  return transformExpr(operands[0]);
}

function transformAddExpr(node: CstNode): IR.IRExpr {
  const operands = children(node, "mulExpr");
  let result = transformExpr(operands[0]);
  const opTokens = [...(node.children["Plus"] as IToken[] || []),
                     ...(node.children["Minus"] as IToken[] || []),
                     ...(node.children["Pipe"] as IToken[] || []),
                     ...(node.children["Caret"] as IToken[] || [])];
  opTokens.sort((a, b) => a.startOffset - b.startOffset);
  for (let i = 1; i < operands.length; i++) {
    const op = opTokens[i - 1]?.image || "+";
    result = { kind: "BinaryExpr", left: result, op, right: transformExpr(operands[i]) };
  }
  return result;
}

function transformMulExpr(node: CstNode): IR.IRExpr {
  const operands = children(node, "unaryExpr");
  let result = transformExpr(operands[0]);
  const opTokens = [...(node.children["Star"] as IToken[] || []),
                     ...(node.children["Slash"] as IToken[] || []),
                     ...(node.children["Percent"] as IToken[] || []),
                     ...(node.children["Shl"] as IToken[] || []),
                     ...(node.children["Shr"] as IToken[] || []),
                     ...(node.children["Amp"] as IToken[] || [])];
  opTokens.sort((a, b) => a.startOffset - b.startOffset);
  for (let i = 1; i < operands.length; i++) {
    const op = opTokens[i - 1]?.image || "*";
    result = { kind: "BinaryExpr", left: result, op, right: transformExpr(operands[i]) };
  }
  return result;
}

function transformUnaryExpr(node: CstNode): IR.IRExpr {
  // Hash (#) as len() sugar
  if (tok(node, "Hash")) {
    const inner = child(node, "unaryExpr");
    const x = inner ? transformExpr(inner) : { kind: "Ident" as const, name: "_" };
    return { kind: "CallExpr", func: { kind: "Ident", name: "len" }, args: [x] };
  }

  const inner = child(node, "unaryExpr");
  if (inner) {
    const ops = ["Plus", "Minus", "Bang", "Star", "Amp", "ChanArrow"];
    for (const op of ops) {
      if (tok(node, op)) {
        const opMap: Record<string, string> = { Plus: "+", Minus: "-", Bang: "!", Star: "*", Amp: "&", ChanArrow: "<-" };
        if (op === "ChanArrow") {
          return { kind: "UnaryRecvExpr", x: transformExpr(inner) };
        }
        if (op === "Star") {
          return { kind: "StarExpr", x: transformExpr(inner) };
        }
        return { kind: "UnaryExpr", op: opMap[op], x: transformExpr(inner) };
      }
    }
  }
  const pf = child(node, "postfixExpr");
  if (pf) return transformExpr(pf);
  return { kind: "Ident", name: "_" };
}

function transformPostfixExpr(node: CstNode): IR.IRExpr {
  let result = transformExpr(child(node, "primaryExpr")!);

  // Process postfix operations in order using token offsets
  // This is complex due to multiple possible postfix ops
  // We need to process them left-to-right

  // Collect all postfix operation tokens with their positions
  const ops: { type: string; offset: number; data?: any }[] = [];

  // Call expressions: LParen
  const lparens = (node.children["LParen"] as IToken[]) || [];
  for (let i = 0; i < lparens.length; i++) {
    ops.push({ type: "call", offset: lparens[i].startOffset });
  }

  // Composite literal: LBrace (from postfix, after identifier)
  const lbraces = (node.children["LBrace"] as IToken[]) || [];
  for (const lb of lbraces) {
    ops.push({ type: "composite", offset: lb.startOffset });
  }

  // Selector: Dot + Ident
  const dots = (node.children["Dot"] as IToken[]) || [];
  for (const dot of dots) {
    ops.push({ type: "selector", offset: dot.startOffset });
  }

  // Index/Slice: LBrack
  const lbracks = (node.children["LBrack"] as IToken[]) || [];
  for (const lb of lbracks) {
    ops.push({ type: "index", offset: lb.startOffset });
  }

  // Error prop: Question or QuestionBang
  const questions = (node.children["Question"] as IToken[]) || [];
  for (const q of questions) {
    ops.push({ type: "errorProp", offset: q.startOffset });
  }
  const qbangs = (node.children["QuestionBang"] as IToken[]) || [];
  for (const qb of qbangs) {
    ops.push({ type: "errorWrap", offset: qb.startOffset });
  }

  // Pipe: Pipe + Map/Filter
  const pipes = (node.children["Pipe"] as IToken[]) || [];
  for (const p of pipes) {
    ops.push({ type: "pipe", offset: p.startOffset });
  }

  ops.sort((a, b) => a.offset - b.offset);

  // Now apply each operation
  let callIdx = 0, selIdx = 0, idxIdx = 0, qIdx = 0, qbIdx = 0, pipeIdx = 0;
  const exprLists = children(node, "exprList");
  const identTokens = (node.children["Ident"] as IToken[]) || [];
  const typeExprs = children(node, "typeExpr");
  const stringLits = (node.children["StringLit"] as IToken[]) || [];

  for (const op of ops) {
    switch (op.type) {
      case "call": {
        const el = exprLists[callIdx];
        const args = el ? children(el, "expr").map(transformExpr) : [];
        const hasEllipsis = tok(node, "Ellipsis") !== undefined;
        result = { kind: "CallExpr", func: result, args, ellipsis: hasEllipsis || undefined };
        callIdx++;
        break;
      }
      case "composite": {
        // Composite literal: Type{elts...}
        const allExprs = children(node, "expr");
        // The composite literal expressions follow the primary expr's expressions
        const elts: IR.IRExpr[] = [];
        // Gather expressions that belong to this composite literal
        // They're after the call expressions
        for (let ei = callIdx; ei < allExprs.length; ei++) {
          const transformed = transformExpr(allExprs[ei]);
          elts.push(transformed);
        }
        result = { kind: "CompositeLit", type: result, elts };
        break;
      }
      case "selector": {
        // Check if it's a type assertion: .(Type)
        if (typeExprs.length > selIdx) {
          result = { kind: "TypeAssertExpr", x: result, type: transformTypeExpr(typeExprs[selIdx]) };
        } else if (identTokens.length > selIdx) {
          const sel = identTokens[selIdx].image;
          // Check if this identifier is a stdlib alias
          const alias = resolveAlias(sel);
          if (alias && result.kind === "Ident") {
            // This shouldn't happen for selectors, but handle it
          }
          result = { kind: "SelectorExpr", x: result, sel };
        }
        selIdx++;
        break;
      }
      case "index": {
        // Simplified: just use the expressions available
        const innerExprs = children(node, "expr");
        if (tok(node, "Colon")) {
          // Slice expression
          result = { kind: "SliceExpr", x: result };
        } else if (innerExprs.length > idxIdx) {
          result = { kind: "IndexExpr", x: result, index: transformExpr(innerExprs[idxIdx]) };
        }
        idxIdx++;
        break;
      }
      case "errorProp":
        result = { kind: "ErrorPropExpr", x: result };
        qIdx++;
        break;
      case "errorWrap":
        const msg = stringLits[qbIdx]?.image || '""';
        result = { kind: "ErrorPropExpr", x: result, wrap: msg.slice(1, -1) };
        qbIdx++;
        break;
      case "pipe": {
        const maps = (node.children["Map"] as IToken[]) || [];
        const filters = (node.children["Filter"] as IToken[]) || [];
        const pipeExprs = children(node, "expr");
        let pipeOp: "map" | "filter" = "map";
        // Determine which pipe op based on position
        if (filters.length > 0) pipeOp = "filter";
        const fnExpr = pipeExprs[pipeExprs.length - 1];
        const fn = fnExpr ? transformExpr(fnExpr) : { kind: "Ident" as const, name: "_" };
        result = { kind: "PipeExpr", x: result, op: pipeOp, fn };
        pipeIdx++;
        break;
      }
    }
  }

  return result;
}

function transformPrimaryExpr(node: CstNode): IR.IRExpr {
  // Parenthesized
  const innerExpr = child(node, "expr");
  if (innerExpr && tok(node, "LParen")) {
    return { kind: "ParenExpr", x: transformExpr(innerExpr) };
  }

  // Lambda: { params | body }
  const pl = child(node, "paramList");
  if (pl && tok(node, "Pipe")) {
    const params = transformParamList(pl);
    const sl = child(node, "stmtList");
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt" as const, stmts: [] };
    return { kind: "FuncLit", params, results: [], body };
  }

  // Composite literal: Ident { kvExprs }
  const compLit = child(node, "compositeLit");
  if (compLit) {
    const typeName = tok(compLit, "Ident") || "";
    const alias = resolveAlias(typeName);
    const typeExpr: IR.IRExpr = alias
      ? { kind: "SelectorExpr", x: { kind: "Ident", name: alias.goFunc.split(".")[0] }, sel: alias.goFunc.split(".")[1] }
      : { kind: "Ident", name: typeName };
    const lb = child(compLit, "litBody");
    const elts = lb ? transformLitBody(lb) : [];
    return { kind: "CompositeLit", type: typeExpr, elts };
  }

  // Builtins (full forms and v1 abbreviated forms)
  // Each entry: [tokenName, goName]
  const builtinMap: Array<[string, string]> = [
    ["Make", "make"], ["Mk", "make"],
    ["Append", "append"], ["Apl", "append"],
    ["Len", "len"], ["Ln", "len"],
    ["Cap", "cap"], ["Cp", "cap"],
    ["Delete", "delete"], ["Dx", "delete"],
    ["Copy", "copy"], ["Cpy", "copy"],
    ["New", "new"], ["Nw", "new"],
  ];
  for (const [tokName, goName] of builtinMap) {
    if (tok(node, tokName)) return { kind: "Ident", name: goName };
  }

  // Func literal
  if (tok(node, "Func")) {
    const pl2 = child(node, "paramList");
    const params = pl2 ? transformParamList(pl2) : [];
    const rt = child(node, "returnType");
    const results = rt ? transformReturnType(rt) : [];
    const sl = child(node, "stmtList");
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt" as const, stmts: [] };
    return { kind: "FuncLit", params, results, body };
  }

  // Literals
  const strLit = tok(node, "StringLit");
  if (strLit) return { kind: "BasicLit", type: "STRING", value: strLit };
  const rawStr = tok(node, "RawStringLit");
  if (rawStr) return { kind: "BasicLit", type: "STRING", value: rawStr };
  const runeLit = tok(node, "RuneLit");
  if (runeLit) return { kind: "BasicLit", type: "RUNE", value: runeLit };
  const floatLit = tok(node, "FloatLit");
  if (floatLit) return { kind: "BasicLit", type: "FLOAT", value: floatLit };
  for (const intType of ["HexLit", "OctLit", "BinLit", "IntLit"]) {
    const v = tok(node, intType);
    if (v) return { kind: "BasicLit", type: "INT", value: v };
  }
  if (tok(node, "True")) return { kind: "Ident", name: "true" };
  if (tok(node, "False")) return { kind: "Ident", name: "false" };
  if (tok(node, "Nil")) return { kind: "Ident", name: "nil" };

  // Map type expression or literal
  if (tok(node, "Map")) {
    const types = children(node, "typeExpr");
    const key = types[0] ? transformTypeExpr(types[0]) : IR.simpleType("string");
    const val = types[1] ? transformTypeExpr(types[1]) : IR.simpleType("interface{}");
    const typeExpr: IR.IRExpr = { kind: "MapTypeExpr", key: { kind: "Ident", name: key.name }, value: { kind: "Ident", name: val.name } };
    // Check for literal body
    const lb = child(node, "litBody");
    if (lb) {
      const elts = transformLitBody(lb);
      return { kind: "CompositeLit", type: typeExpr, elts };
    }
    return typeExpr;
  }
  // Slice type expression or literal
  if (tok(node, "LBrack") && tok(node, "RBrack")) {
    const te = child(node, "typeExpr");
    const elt = te ? transformTypeExpr(te) : IR.simpleType("interface{}");
    const typeExpr: IR.IRExpr = { kind: "ArrayTypeExpr", elt: { kind: "Ident", name: elt.name } };
    const lb = child(node, "litBody");
    if (lb) {
      const elts = transformLitBody(lb);
      return { kind: "CompositeLit", type: typeExpr, elts };
    }
    return typeExpr;
  }

  // Identifier — check for stdlib alias
  const ident = tok(node, "Ident");
  if (ident) {
    const alias = resolveAlias(ident);
    if (alias) {
      // Expand alias: e.g., "pl" → "fmt.Println"
      const parts = alias.goFunc.split(".");
      if (parts.length === 2) {
        return { kind: "SelectorExpr", x: { kind: "Ident", name: parts[0] }, sel: parts[1] };
      }
      return { kind: "Ident", name: alias.goFunc };
    }
    return { kind: "Ident", name: ident };
  }

  return { kind: "Ident", name: "_" };
}

function transformLitBody(node: CstNode): IR.IRExpr[] {
  return children(node, "kvExpr").map(transformKvExpr);
}

function transformKvExpr(node: CstNode): IR.IRExpr {
  // Nested composite literal without type: {expr, expr, ...}
  const nestedLitBody = child(node, "litBody");
  if (nestedLitBody) {
    const elts = transformLitBody(nestedLitBody);
    return { kind: "CompositeLit", type: undefined, elts };
  }
  const exprs = children(node, "expr");
  if (exprs.length === 2 && tok(node, "Colon")) {
    // Key: value
    return { kind: "KeyValueExpr", key: transformExpr(exprs[0]), value: transformExpr(exprs[1]) };
  }
  if (exprs.length >= 1) {
    return transformExpr(exprs[0]);
  }
  return { kind: "Ident", name: "_" };
}

function exprToString(expr: IR.IRExpr): string {
  switch (expr.kind) {
    case "Ident": return expr.name;
    case "SelectorExpr": return exprToString(expr.x) + "." + expr.sel;
    default: return "_";
  }
}
