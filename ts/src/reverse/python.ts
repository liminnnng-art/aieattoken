// Reverse transpiler: Python → IR → AET-Python (.aetp)
// Uses ast_dumper.py (Python ast module) to get JSON AST,
// then converts to IR, then to AET-Python string.

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import * as IR from "../ir.js";

// ---------------------------------------------------------------------------
// Reverse alias map: "json.dumps" → "jd"
// ---------------------------------------------------------------------------
let pythonReverseAliasMap: Record<string, string> = Object.create(null);
let aliasMapLoaded = false;

export function loadPythonReverseAliases(path?: string): void {
  // Try multiple candidate paths so callers from any cwd find the JSON.
  const candidates: string[] = [];
  if (path) candidates.push(path);
  candidates.push(
    resolve(process.cwd(), "stdlib-aliases-python.json"),
    resolve(process.cwd(), "..", "stdlib-aliases-python.json"),
    resolve(process.cwd(), "..", "..", "stdlib-aliases-python.json"),
  );
  // Also try relative to this module file
  try {
    const moduleDir = dirname(new URL(import.meta.url).pathname);
    const normalized = (p: string) => p.replace(/^\/([A-Za-z]:)/, "$1");
    candidates.push(
      normalized(resolve(moduleDir, "..", "..", "..", "stdlib-aliases-python.json")),
      normalized(resolve(moduleDir, "..", "..", "..", "..", "stdlib-aliases-python.json")),
    );
  } catch { /* import.meta.url may not resolve in all contexts */ }

  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      const data = JSON.parse(readFileSync(p, "utf-8"));
      const aliases = data.aliases || {};
      for (const [alias, info] of Object.entries(aliases) as [string, any][]) {
        pythonReverseAliasMap[info.python] = alias;
      }
      aliasMapLoaded = true;
      return;
    } catch { /* try next candidate */ }
  }
  // No JSON found — aliases improve compression but aren't required.
  aliasMapLoaded = true;  // Mark as attempted to avoid infinite retry.
}

/** Ensure the alias map has been loaded at least once. */
function ensureAliasMapLoaded(): void {
  if (!aliasMapLoaded) loadPythonReverseAliases();
}

// ---------------------------------------------------------------------------
// Decorator abbreviation map: "dataclass" → "dc"
// ---------------------------------------------------------------------------
const DECORATOR_ABBREV: Record<string, string> = {
  dataclass: "dc",
};
const DECORATOR_ABBREV_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(DECORATOR_ABBREV).map(([k, v]) => [k, v]),
);

// ---------------------------------------------------------------------------
// parsePythonFile — run ast_dumper.py via child_process, return parsed JSON AST
// ---------------------------------------------------------------------------
export function parsePythonFile(pythonFilePath: string): any {
  const pythonCmd = findPythonCommand();
  const astDumperPath = findAstDumperPath();

  try {
    // On Windows, spaces in paths need quoting. Use an array form via shell.
    const q = (s: string) => s.includes(" ") ? `"${s}"` : s;
    const cmd = `${q(pythonCmd)} ${q(astDumperPath)} ${q(resolve(pythonFilePath))}`;
    const result = execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e: any) {
    throw new Error(`Failed to parse Python file: ${e.message}`);
  }
}

function findPythonCommand(): string {
  // On Windows, check known install locations FIRST (python/python3 commands
  // may be WindowsApps stubs that hang waiting for Microsoft Store)
  if (process.platform === "win32") {
    const windowsFallbacks = [
      "C:/Users/user/AppData/Local/Programs/Python/Python314/python.exe",
      "C:/Users/user/AppData/Local/Programs/Python/Python313/python.exe",
      "C:/Users/user/AppData/Local/Programs/Python/Python312/python.exe",
      "C:/Users/user/AppData/Local/Programs/Python/Python311/python.exe",
      "C:/Users/user/AppData/Local/Programs/Python/Python310/python.exe",
      "C:/Python314/python.exe",
      "C:/Python312/python.exe",
      "C:/Python311/python.exe",
      "C:/Python310/python.exe",
    ];
    for (const p of windowsFallbacks) {
      if (existsSync(p)) return p;
    }
    // Try py launcher
    try {
      execSync("py -3 --version", { encoding: "utf-8", stdio: "pipe", timeout: 3000 });
      return "py -3";
    } catch { /* not available */ }
  }

  // Non-Windows: try python3, then python
  for (const cmd of ["python3", "python"]) {
    try {
      execSync(`${cmd} --version`, { encoding: "utf-8", stdio: "pipe", timeout: 3000 });
      return cmd;
    } catch { /* not on PATH */ }
  }

  throw new Error(
    "Python not found. Install Python 3.10+ or ensure `python` is on PATH.",
  );
}

function findAstDumperPath(): string {
  const candidates = [
    resolve(process.cwd(), "python-parser", "ast_dumper.py"),
    resolve(process.cwd(), "..", "python-parser", "ast_dumper.py"),
    resolve(process.cwd(), "..", "..", "python-parser", "ast_dumper.py"),
  ];

  // Also try relative to this module file
  try {
    const moduleDir = dirname(new URL(import.meta.url).pathname);
    candidates.push(
      resolve(moduleDir, "..", "..", "..", "python-parser", "ast_dumper.py"),
    );
  } catch { /* import.meta.url may not resolve in all contexts */ }

  for (const p of candidates) {
    // Normalise Windows paths (URL pathname may add a leading /)
    const normalized = p.replace(/^\/([A-Za-z]:)/, "$1");
    if (existsSync(normalized)) return normalized;
  }
  throw new Error("ast_dumper.py not found in any expected location.");
}

// ---------------------------------------------------------------------------
// pythonAstToIR — main entry: Python JSON AST → IR
// ---------------------------------------------------------------------------
export function pythonAstToIR(pyAst: any): IR.IRProgram {
  // Lazy-load alias map on first use so callers don't need to remember.
  ensureAliasMapLoaded();

  const decls: IR.IRNode[] = [];
  const stmtIdx = { val: 0 };

  const bodyStmts: any[] = pyAst.Body || [];

  // Strip module-level docstring (first Expr with string Constant)
  let startIdx = 0;
  if (bodyStmts.length > 0) {
    const first = bodyStmts[0];
    if (
      first.Kind === "Expr" &&
      first.Value?.Kind === "Constant" &&
      typeof first.Value?.Value === "string"
    ) {
      startIdx = 1;
    }
  }

  for (let i = startIdx; i < bodyStmts.length; i++) {
    const stmt = bodyStmts[i];
    const kind = stmt.Kind;

    // Skip imports — they are eliminated in AET-Python
    if (kind === "Import" || kind === "ImportFrom") continue;

    const converted = convertStmt(stmt, stmtIdx);
    if (converted) {
      decls.push(converted);
    }
  }

  return {
    kind: "Program",
    package: "main",
    imports: [],  // Imports are stripped — AET auto-resolves them
    decls,
    stmtIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Statement conversion
// ---------------------------------------------------------------------------

function nextIdx(stmtIdx: { val: number }): number {
  return stmtIdx.val++;
}

function convertStmt(node: any, idx: { val: number }): IR.IRNode | null {
  if (!node) return null;

  switch (node.Kind) {
    case "FunctionDef":
    case "AsyncFunctionDef":
      return convertFuncDef(node, idx);

    case "ClassDef":
      return convertClassDef(node, idx);

    case "Return":
      return {
        kind: "ReturnStmt",
        values: node.Value ? [convertExpr(node.Value)] : [],
        stmtIndex: nextIdx(idx),
      } as IR.IRReturnStmt;

    case "Assign":
      return convertAssign(node, idx);

    case "AugAssign":
      return {
        kind: "AssignStmt",
        lhs: [convertExpr(node.Target)],
        rhs: [convertExpr(node.Value)],
        op: (node.Op || "+") + "=",
        stmtIndex: nextIdx(idx),
      } as IR.IRAssignStmt;

    case "AnnAssign":
      return convertAnnAssign(node, idx);

    case "For":
    case "AsyncFor":
      return convertFor(node, idx);

    case "While":
      return convertWhile(node, idx);

    case "If":
      return convertIf(node, idx);

    case "With":
    case "AsyncWith":
      return convertWith(node, idx);

    case "Raise":
      return {
        kind: "Py_RaiseStmt",
        exc: node.Exc ? convertExpr(node.Exc) : undefined,
        cause: node.Cause ? convertExpr(node.Cause) : undefined,
        stmtIndex: nextIdx(idx),
      } as IR.Py_RaiseStmt;

    case "Try":
    case "TryStar":
      return convertTry(node, idx);

    case "Assert":
      return {
        kind: "Py_AssertStmt",
        test: convertExpr(node.Test),
        msg: node.Msg ? convertExpr(node.Msg) : undefined,
        stmtIndex: nextIdx(idx),
      } as IR.Py_AssertStmt;

    case "Import":
    case "ImportFrom":
      // Imports are eliminated
      return null;

    case "Delete":
      return {
        kind: "Py_DeleteStmt",
        targets: (node.Targets || []).map(convertExpr),
        stmtIndex: nextIdx(idx),
      } as IR.Py_DeleteStmt;

    case "Global":
      return {
        kind: "Py_GlobalStmt",
        names: node.Names || [],
        stmtIndex: nextIdx(idx),
      } as IR.Py_GlobalStmt;

    case "Nonlocal":
      return {
        kind: "Py_NonlocalStmt",
        names: node.Names || [],
        stmtIndex: nextIdx(idx),
      } as IR.Py_NonlocalStmt;

    case "Pass":
      // Pass is represented by an empty block — return null to skip
      return null;

    case "Break":
      return {
        kind: "BranchStmt",
        tok: "break",
        stmtIndex: nextIdx(idx),
      } as IR.IRBranchStmt;

    case "Continue":
      return {
        kind: "BranchStmt",
        tok: "continue",
        stmtIndex: nextIdx(idx),
      } as IR.IRBranchStmt;

    case "Expr":
      return {
        kind: "ExprStmt",
        expr: convertExpr(node.Value),
        stmtIndex: nextIdx(idx),
      } as IR.IRExprStmt;

    case "Match":
      return convertMatch(node, idx);

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Function definition
// ---------------------------------------------------------------------------

function convertFuncDef(node: any, idx: { val: number }): IR.IRNode {
  const isAsync = node.Kind === "AsyncFunctionDef";
  const rawName: string = node.Name || "";

  // Map dunder methods to short names
  const name = IR.PY_MAGIC_REVERSE[rawName] || rawName;

  // Convert arguments
  const argsNode = node.Args || {};
  const paramList = convertArguments(argsNode);

  // Convert decorators
  const decorators = convertDecorators(node.Decorators || []);

  // Detect method: first param is self or cls
  let isMethod = false;
  const allRawArgs: any[] = argsNode.Args || [];
  if (allRawArgs.length > 0) {
    const firstName = allRawArgs[0].Arg || "";
    if (firstName === "self" || firstName === "cls") {
      isMethod = true;
      // Remove self/cls from params
      paramList.params = paramList.params.filter(p => p.name !== "self" && p.name !== "cls");
    }
  }

  // Convert body, stripping leading docstring
  const rawBody: any[] = node.Body || [];
  const body = convertBodyStrippingDocstring(rawBody, idx);

  const result = {
    kind: "FuncDecl" as const,
    name,
    isAsync,
    params: paramList,
    decorators,
    body,
    stmtIndex: nextIdx(idx),
    isMethod,
  };

  return result as any as IR.IRNode;
}

function convertArguments(argsNode: any): IR.Py_ParamList {
  const rawArgs: any[] = argsNode.Args || [];
  const defaults: any[] = argsNode.Defaults || [];
  const kwOnlyArgs: any[] = argsNode.KwOnlyArgs || [];
  const kwDefaults: any[] = argsNode.KwDefaults || [];
  const posOnlyArgs: any[] = argsNode.PosOnlyArgs || [];

  // Defaults align from the right for regular args
  const defaultOffset = rawArgs.length - defaults.length;

  const params: IR.Py_Param[] = rawArgs.map((a: any, i: number) => {
    const p: IR.Py_Param = { name: a.Arg || "_" };
    // Type annotation — not included in default mode, but preserved in IR for typed mode
    if (a.Annotation) {
      p.type = exprToTypeString(a.Annotation);
    }
    // Default value
    const defIdx = i - defaultOffset;
    if (defIdx >= 0 && defaults[defIdx]) {
      p.default_ = convertExpr(defaults[defIdx]);
    }
    return p;
  });

  let vararg: IR.Py_Param | undefined;
  if (argsNode.Vararg) {
    vararg = { name: argsNode.Vararg.Arg || "args" };
    if (argsNode.Vararg.Annotation) {
      vararg.type = exprToTypeString(argsNode.Vararg.Annotation);
    }
  }

  let kwarg: IR.Py_Param | undefined;
  if (argsNode.Kwarg) {
    kwarg = { name: argsNode.Kwarg.Arg || "kwargs" };
    if (argsNode.Kwarg.Annotation) {
      kwarg.type = exprToTypeString(argsNode.Kwarg.Annotation);
    }
  }

  let kwonly: IR.Py_Param[] | undefined;
  if (kwOnlyArgs.length > 0) {
    kwonly = kwOnlyArgs.map((a: any, i: number) => {
      const p: IR.Py_Param = { name: a.Arg || "_" };
      if (a.Annotation) p.type = exprToTypeString(a.Annotation);
      if (kwDefaults[i]) p.default_ = convertExpr(kwDefaults[i]);
      return p;
    });
  }

  let posonly: IR.Py_Param[] | undefined;
  if (posOnlyArgs.length > 0) {
    posonly = posOnlyArgs.map((a: any) => {
      const p: IR.Py_Param = { name: a.Arg || "_" };
      if (a.Annotation) p.type = exprToTypeString(a.Annotation);
      return p;
    });
  }

  return { params, vararg, kwarg, kwonly, posonly };
}

/** Convert an annotation expression to a type string for IR. */
function exprToTypeString(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  switch (node.Kind) {
    case "Name": return node.Id || "";
    case "Attribute": {
      const base = exprToTypeString(node.Value);
      return base ? `${base}.${node.Attr}` : node.Attr || "";
    }
    case "Subscript": {
      const base = exprToTypeString(node.Value);
      const slice = exprToTypeString(node.Slice);
      return `${base}[${slice}]`;
    }
    case "Tuple": {
      const elts = (node.Elts || []).map(exprToTypeString);
      return elts.join(",");
    }
    case "Constant": {
      if (node.Value === null || node.Value === "None") return "None";
      return String(node.Value);
    }
    case "BinOp": {
      if (node.Op === "|") {
        return `${exprToTypeString(node.Left)}|${exprToTypeString(node.Right)}`;
      }
      return `${exprToTypeString(node.Left)}`;
    }
    default: return "";
  }
}

function convertDecorators(decoList: any[]): IR.Py_Decorator[] {
  return decoList.map((d: any) => ({ expr: convertExpr(d) }));
}

/** Convert body statements, stripping a leading docstring (first Constant that is a string). */
function convertBodyStrippingDocstring(body: any[], idx: { val: number }): IR.IRBlockStmt {
  let stmts = body;
  // Strip leading docstring: first statement is Expr with Constant string
  if (stmts.length > 0) {
    const first = stmts[0];
    if (
      first.Kind === "Expr" &&
      first.Value?.Kind === "Constant" &&
      typeof first.Value?.Value === "string"
    ) {
      stmts = stmts.slice(1);
    }
  }

  const converted = stmts
    .map(s => convertStmt(s, idx))
    .filter(Boolean) as IR.IRNode[];
  return { kind: "BlockStmt", stmts: converted };
}

function convertBlockBody(body: any[], idx: { val: number }): IR.IRBlockStmt {
  const converted = (body || [])
    .map(s => convertStmt(s, idx))
    .filter(Boolean) as IR.IRNode[];
  return { kind: "BlockStmt", stmts: converted };
}

// ---------------------------------------------------------------------------
// Class definition
// ---------------------------------------------------------------------------

function convertClassDef(node: any, idx: { val: number }): IR.IRNode {
  const name: string = node.Name || "";
  const bases = (node.Bases || []).map(convertExpr);
  const keywords = (node.Keywords || []).map((kw: any) => ({
    key: kw.Arg || "",
    value: convertExpr(kw.Value),
  }));
  const decorators = convertDecorators(node.Decorators || []);

  // Convert body, stripping class docstring
  const rawBody: any[] = node.Body || [];
  let bodyStmts = rawBody;
  // Strip leading docstring
  if (bodyStmts.length > 0) {
    const first = bodyStmts[0];
    if (
      first.Kind === "Expr" &&
      first.Value?.Kind === "Constant" &&
      typeof first.Value?.Value === "string"
    ) {
      bodyStmts = bodyStmts.slice(1);
    }
  }

  const convertedBody = bodyStmts
    .map(s => convertStmt(s, idx))
    .filter(Boolean) as (IR.IRNode | IR.IRExprStmt)[];

  return {
    kind: "Py_ClassDecl",
    name,
    bases,
    keywords,
    decorators,
    body: convertedBody,
    stmtIndex: nextIdx(idx),
  } as IR.Py_ClassDecl;
}

// ---------------------------------------------------------------------------
// Assignment conversion
// ---------------------------------------------------------------------------

function convertAssign(node: any, idx: { val: number }): IR.IRAssignStmt {
  const targets = (node.Targets || []).map(convertExpr);
  const value = convertExpr(node.Value);

  return {
    kind: "AssignStmt",
    lhs: targets,
    rhs: [value],
    op: "=",
    stmtIndex: nextIdx(idx),
  };
}

function convertAnnAssign(node: any, idx: { val: number }): IR.IRNode {
  const target = convertExpr(node.Target);

  if (node.Value) {
    return {
      kind: "AssignStmt",
      lhs: [target],
      rhs: [convertExpr(node.Value)],
      op: "=",
      stmtIndex: nextIdx(idx),
    } as IR.IRAssignStmt;
  }

  // Annotation-only (no value): emit as VarDecl with type
  const typeName = node.Annotation ? exprToTypeString(node.Annotation) : "";
  const name = target.kind === "Ident" ? (target as IR.IRIdent).name : "_";
  return {
    kind: "VarDecl",
    name,
    type: typeName ? IR.simpleType(typeName) : undefined,
    value: undefined,
    stmtIndex: nextIdx(idx),
  } as IR.IRVarDecl;
}

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

function convertFor(node: any, idx: { val: number }): IR.IRNode {
  const isAsync = node.Kind === "AsyncFor";
  const target = convertExpr(node.Target);
  const iter = convertExpr(node.Iter);
  const body = convertBlockBody(node.Body, idx);
  const elseBody = node.OrElse && node.OrElse.length > 0
    ? convertBlockBody(node.OrElse, idx)
    : null;

  // If there is an else clause or async modifier, use Py_ForElse
  if (elseBody || isAsync) {
    return {
      kind: "Py_ForElse",
      isAsync,
      target,
      iter,
      body,
      elseBody: elseBody || { kind: "BlockStmt", stmts: [] },
      stmtIndex: nextIdx(idx),
    } as IR.Py_ForElse;
  }

  // Simple for loop → IRRangeStmt for simple targets
  // Extract key/value from target when it's a simple 2-element tuple of Idents
  if (target.kind === "Py_TupleExpr") {
    const elts = (target as IR.Py_TupleExpr).elts;
    const key = elts[0]?.kind === "Ident" ? (elts[0] as IR.IRIdent).name : undefined;
    const value = elts[1]?.kind === "Ident" ? (elts[1] as IR.IRIdent).name : undefined;
    if (key && value && elts.length === 2) {
      return {
        kind: "RangeStmt",
        key,
        value,
        x: iter,
        body,
        stmtIndex: nextIdx(idx),
      } as IR.IRRangeStmt;
    }
    // Complex tuple target → use Py_ForElse without else body
    return {
      kind: "Py_ForElse",
      isAsync,
      target,
      iter,
      body,
      elseBody: { kind: "BlockStmt", stmts: [] },
      stmtIndex: nextIdx(idx),
    } as any as IR.IRNode;
  }

  // Single variable target
  if (target.kind === "Ident") {
    return {
      kind: "RangeStmt",
      key: (target as IR.IRIdent).name,
      x: iter,
      body,
      stmtIndex: nextIdx(idx),
    } as IR.IRRangeStmt;
  }

  // Complex single target (e.g., star expression) → use Py_ForElse
  return {
    kind: "Py_ForElse",
    isAsync,
    target,
    iter,
    body,
    elseBody: { kind: "BlockStmt", stmts: [] },
    stmtIndex: nextIdx(idx),
  } as any as IR.IRNode;
}

function convertWhile(node: any, idx: { val: number }): IR.IRNode {
  const cond = convertExpr(node.Test);
  const body = convertBlockBody(node.Body, idx);
  const elseBody = node.OrElse && node.OrElse.length > 0
    ? convertBlockBody(node.OrElse, idx)
    : null;

  if (elseBody) {
    return {
      kind: "Py_WhileElse",
      cond,
      body,
      elseBody,
      stmtIndex: nextIdx(idx),
    } as IR.Py_WhileElse;
  }

  // Simple while → IRForStmt (while is a for with no init/post)
  return {
    kind: "ForStmt",
    cond,
    body,
    stmtIndex: nextIdx(idx),
  } as IR.IRForStmt;
}

function convertIf(node: any, idx: { val: number }): IR.IRIfStmt {
  const cond = convertExpr(node.Test);
  const body = convertBlockBody(node.Body, idx);

  let else_: IR.IRNode | undefined;
  if (node.OrElse && node.OrElse.length > 0) {
    // Check if it's an elif chain (single If in OrElse)
    if (node.OrElse.length === 1 && node.OrElse[0].Kind === "If") {
      else_ = convertIf(node.OrElse[0], idx);
    } else {
      else_ = convertBlockBody(node.OrElse, idx);
    }
  }

  return {
    kind: "IfStmt",
    cond,
    body,
    else_,
    stmtIndex: nextIdx(idx),
  };
}

function convertWith(node: any, idx: { val: number }): IR.Py_WithStmt {
  const isAsync = node.Kind === "AsyncWith";
  const items: IR.Py_WithItem[] = (node.Items || []).map((item: any) => {
    const wi: IR.Py_WithItem = { contextExpr: convertExpr(item.ContextExpr) };
    if (item.OptionalVars) {
      // OptionalVars is a Name node in most cases
      if (item.OptionalVars.Kind === "Name") {
        wi.optionalVar = item.OptionalVars.Id || "";
      } else {
        wi.optionalVar = exprToString(convertExpr(item.OptionalVars));
      }
    }
    return wi;
  });

  const body = convertBlockBody(node.Body, idx);

  return {
    kind: "Py_WithStmt",
    isAsync,
    items,
    body,
    stmtIndex: nextIdx(idx),
  };
}

// ---------------------------------------------------------------------------
// Try / Except
// ---------------------------------------------------------------------------

function convertTry(node: any, idx: { val: number }): IR.Py_TryExcept {
  const body = convertBlockBody(node.Body, idx);

  const handlers: IR.Py_ExceptHandler[] = (node.Handlers || []).map((h: any) => ({
    type: h.Type ? convertExpr(h.Type) : undefined,
    name: h.Name || undefined,
    body: convertBlockBody(h.Body, idx),
  }));

  const elseBody = node.OrElse && node.OrElse.length > 0
    ? convertBlockBody(node.OrElse, idx)
    : undefined;

  const finallyBody = node.FinalBody && node.FinalBody.length > 0
    ? convertBlockBody(node.FinalBody, idx)
    : undefined;

  return {
    kind: "Py_TryExcept",
    body,
    handlers,
    elseBody,
    finallyBody,
    stmtIndex: nextIdx(idx),
  };
}

// ---------------------------------------------------------------------------
// Match statement
// ---------------------------------------------------------------------------

function convertMatch(node: any, idx: { val: number }): IR.Py_MatchStmt {
  const subject = convertExpr(node.Subject);
  const cases: IR.Py_MatchCase[] = (node.Cases || []).map((c: any) => ({
    pattern: convertExpr(c.Pattern),
    guard: c.Guard ? convertExpr(c.Guard) : undefined,
    body: convertBlockBody(c.Body, idx),
  }));

  return {
    kind: "Py_MatchStmt",
    subject,
    cases,
    stmtIndex: nextIdx(idx),
  };
}

// ---------------------------------------------------------------------------
// Expression conversion
// ---------------------------------------------------------------------------

function convertExpr(node: any): IR.IRExpr {
  if (!node) return { kind: "Ident", name: "_" };

  // Handle primitive values that are not AST node dicts
  if (typeof node === "string") return { kind: "BasicLit", type: "STRING", value: `"${escapeString(node)}"` };
  if (typeof node === "number") {
    return Number.isInteger(node)
      ? { kind: "BasicLit", type: "INT", value: String(node) }
      : { kind: "BasicLit", type: "FLOAT", value: String(node) };
  }
  if (typeof node === "boolean") {
    return { kind: "Ident", name: node ? "True" : "False" };
  }
  if (node === null) {
    return { kind: "Ident", name: "None" };
  }

  switch (node.Kind) {
    case "Name":
      return convertName(node);

    case "Constant":
      return convertConstant(node);

    case "BinOp":
      return {
        kind: "BinaryExpr",
        left: convertExpr(node.Left),
        op: node.Op || "+",
        right: convertExpr(node.Right),
      };

    case "UnaryOp": {
      const unOp = node.Op || "-";
      let operand = convertExpr(node.Operand);
      // Wrap BoolOp/Compare operands in parens when under "not" to preserve precedence
      if (unOp === "not" && operand.kind === "BinaryExpr") {
        const innerOp = (operand as IR.IRBinaryExpr).op.trim();
        if (innerOp === "and" || innerOp === "or") {
          operand = { kind: "ParenExpr", x: operand } as IR.IRParenExpr;
        }
      }
      return {
        kind: "UnaryExpr",
        op: unOp,
        x: operand,
      };
    }

    case "BoolOp":
      return convertBoolOp(node);

    case "Compare":
      return convertCompare(node);

    case "Call":
      return convertCall(node);

    case "Attribute":
      return convertAttribute(node);

    case "Subscript":
      return convertSubscript(node);

    case "Starred":
      return {
        kind: "Py_StarExpr",
        value: convertExpr(node.Value),
        isDouble: false,
      } as IR.Py_StarExpr;

    case "List":
      return {
        kind: "CompositeLit",
        elts: (node.Elts || []).map(convertExpr),
      } as IR.IRCompositeLit;

    case "Tuple":
      return {
        kind: "Py_TupleExpr",
        elts: (node.Elts || []).map(convertExpr),
      } as IR.Py_TupleExpr;

    case "Dict":
      return {
        kind: "Py_DictExpr",
        keys: (node.Keys || []).map((k: any) => k ? convertExpr(k) : null),
        values: (node.Values || []).map(convertExpr),
      } as IR.Py_DictExpr;

    case "Set":
      return {
        kind: "Py_SetExpr",
        elts: (node.Elts || []).map(convertExpr),
      } as IR.Py_SetExpr;

    case "IfExp":
      return {
        kind: "Py_TernaryExpr",
        value: convertExpr(node.Body),
        test: convertExpr(node.Test),
        orElse: convertExpr(node.OrElse),
      } as IR.Py_TernaryExpr;

    case "Lambda":
      return convertLambda(node);

    case "ListComp":
      return convertComprehension(node, "list");

    case "SetComp":
      return convertComprehension(node, "set");

    case "GeneratorExp":
      return convertComprehension(node, "generator");

    case "DictComp":
      return convertDictComprehension(node);

    case "JoinedStr":
      return convertFString(node);

    case "FormattedValue":
      // Standalone FormattedValue — wrap in an f-string
      return convertFString({ Kind: "JoinedStr", Values: [node] });

    case "Await":
      return {
        kind: "Py_AwaitExpr",
        value: convertExpr(node.Value),
      } as IR.Py_AwaitExpr;

    case "Yield":
      return {
        kind: "Py_YieldExpr",
        value: node.Value ? convertExpr(node.Value) : undefined,
      } as IR.Py_YieldExpr;

    case "YieldFrom":
      return {
        kind: "Py_YieldFromExpr",
        value: convertExpr(node.Value),
      } as IR.Py_YieldFromExpr;

    case "NamedExpr":
      return {
        kind: "Py_WalrusExpr",
        target: node.Target?.Id || node.Target?.Name || "_",
        value: convertExpr(node.Value),
      } as IR.Py_WalrusExpr;

    case "Slice":
      return {
        kind: "SliceExpr",
        x: { kind: "Ident", name: "_" },  // placeholder; actual base is set by Subscript handler
        low: node.Lower ? convertExpr(node.Lower) : undefined,
        high: node.Upper ? convertExpr(node.Upper) : undefined,
        max: node.Step ? convertExpr(node.Step) : undefined,
      } as IR.IRSliceExpr;

    // Match patterns
    case "MatchValue":
      return convertExpr(node.Value);

    case "MatchSingleton":
      return convertConstantValue(node.Value);

    case "MatchSequence":
      return {
        kind: "CompositeLit",
        elts: (node.Patterns || []).map(convertExpr),
      } as IR.IRCompositeLit;

    case "MatchMapping": {
      const keys = (node.Keys || []).map(convertExpr);
      const patterns = (node.Patterns || []).map(convertExpr);
      const dictKeys: (IR.IRExpr | null)[] = keys;
      return {
        kind: "Py_DictExpr",
        keys: dictKeys,
        values: patterns,
      } as IR.Py_DictExpr;
    }

    case "MatchClass": {
      const cls = convertExpr(node.Cls);
      const posPatterns = (node.Patterns || []).map(convertExpr);
      const kwdAttrs: string[] = node.KwdAttrs || [];
      const kwdPatterns = (node.KwdPatterns || []).map(convertExpr);
      // Emit as a call-like expression: Class(positional, kwd=pattern)
      const args: IR.IRExpr[] = [...posPatterns];
      for (let i = 0; i < kwdAttrs.length; i++) {
        args.push({
          kind: "KeyValueExpr",
          key: { kind: "Ident", name: kwdAttrs[i] },
          value: kwdPatterns[i] || { kind: "Ident", name: "_" },
        });
      }
      return { kind: "CallExpr", func: cls, args } as IR.IRCallExpr;
    }

    case "MatchStar": {
      const starName = node.Name || "_";
      return {
        kind: "Py_StarExpr",
        value: { kind: "Ident", name: starName },
        isDouble: false,
      } as IR.Py_StarExpr;
    }

    case "MatchAs": {
      if (node.Pattern && node.Name) {
        // pattern as name → emit as BinaryExpr with "as" operator
        return {
          kind: "BinaryExpr",
          left: convertExpr(node.Pattern),
          op: " as ",
          right: { kind: "Ident", name: node.Name },
        };
      }
      if (node.Name) {
        return { kind: "Ident", name: node.Name };
      }
      // Wildcard _
      return { kind: "Ident", name: "_" };
    }

    case "MatchOr": {
      const patterns = (node.Patterns || []).map(convertExpr);
      return patterns.reduce((left: IR.IRExpr, right: IR.IRExpr) => ({
        kind: "BinaryExpr",
        left,
        op: "|",
        right,
      }));
    }

    default:
      return { kind: "Ident", name: node.Id || node.Name || "_" };
  }
}

function convertName(node: any): IR.IRExpr {
  const id: string = node.Id || "_";

  // Check for alias match on bare names
  const alias = pythonReverseAliasMap[id];
  if (alias) return { kind: "Ident", name: alias };

  return { kind: "Ident", name: id };
}

function convertConstant(node: any): IR.IRExpr {
  return convertConstantValue(node.Value);
}

function convertConstantValue(value: any): IR.IRExpr {
  if (value === null || value === undefined) {
    return { kind: "Ident", name: "None" };
  }
  if (value === true) return { kind: "Ident", name: "True" };
  if (value === false) return { kind: "Ident", name: "False" };
  if (value === "...") return { kind: "Ident", name: "..." };

  if (typeof value === "string") {
    const escaped = escapeString(value);
    return { kind: "BasicLit", type: "STRING", value: `"${escaped}"` };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { kind: "BasicLit", type: "INT", value: String(value) };
    }
    return { kind: "BasicLit", type: "FLOAT", value: String(value) };
  }

  // Complex number
  if (typeof value === "object" && value !== null && "Real" in value && "Imag" in value) {
    const real = value.Real as number;
    const imag = value.Imag as number;
    if (real === 0) {
      return { kind: "BasicLit", type: "FLOAT", value: `${imag}j` };
    }
    return {
      kind: "BinaryExpr",
      left: { kind: "BasicLit", type: "FLOAT", value: String(real) },
      op: "+",
      right: { kind: "BasicLit", type: "FLOAT", value: `${imag}j` },
    };
  }

  return { kind: "BasicLit", type: "STRING", value: `"${String(value)}"` };
}

function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

// ---------------------------------------------------------------------------
// BoolOp / Compare chain
// ---------------------------------------------------------------------------

function convertBoolOp(node: any): IR.IRExpr {
  const op: string = node.Op || "and";
  const values: any[] = node.Values || [];
  if (values.length === 0) return { kind: "Ident", name: "_" };
  if (values.length === 1) return convertExpr(values[0]);

  return values.slice(1).reduce(
    (left: IR.IRExpr, val: any) => ({
      kind: "BinaryExpr" as const,
      left,
      op: ` ${op} `,
      right: convertExpr(val),
    }),
    convertExpr(values[0]),
  );
}

function convertCompare(node: any): IR.IRExpr {
  const left = convertExpr(node.Left);
  const ops: string[] = node.Ops || [];
  const comparators: any[] = node.Comparators || [];

  if (ops.length === 0) return left;

  // Single comparison
  if (ops.length === 1) {
    return {
      kind: "BinaryExpr",
      left,
      op: formatCompOp(ops[0]),
      right: convertExpr(comparators[0]),
    };
  }

  // Chained comparison: a < b < c → a<b and b<c
  let result: IR.IRExpr = {
    kind: "BinaryExpr",
    left,
    op: formatCompOp(ops[0]),
    right: convertExpr(comparators[0]),
  };
  for (let i = 1; i < ops.length; i++) {
    const nextComp: IR.IRExpr = {
      kind: "BinaryExpr",
      left: convertExpr(comparators[i - 1]),
      op: formatCompOp(ops[i]),
      right: convertExpr(comparators[i]),
    };
    result = {
      kind: "BinaryExpr",
      left: result,
      op: " and ",
      right: nextComp,
    };
  }
  return result;
}

function formatCompOp(op: string): string {
  // These ops need spaces around them for readability
  if (op === "in" || op === "not in" || op === "is" || op === "is not") {
    return ` ${op} `;
  }
  return op;
}

// ---------------------------------------------------------------------------
// Call expression
// ---------------------------------------------------------------------------

function convertCall(node: any): IR.IRExpr {
  const func = convertExpr(node.Func);
  const positionalArgs = (node.Args || []).map(convertExpr);
  const keywords = node.Keywords || [];

  // Convert keyword arguments
  const kwArgs: IR.IRExpr[] = keywords.map((kw: any) => {
    if (kw.Arg === null || kw.Arg === undefined) {
      // **kwargs spread
      return {
        kind: "Py_StarExpr",
        value: convertExpr(kw.Value),
        isDouble: true,
      } as IR.Py_StarExpr;
    }
    return {
      kind: "KeyValueExpr",
      key: { kind: "Ident", name: kw.Arg },
      value: convertExpr(kw.Value),
    } as IR.IRKeyValueExpr;
  });

  const allArgs = [...positionalArgs, ...kwArgs];

  // Check for reverse alias on the function
  const funcName = flattenCallName(func);
  if (funcName) {
    const alias = pythonReverseAliasMap[funcName];
    if (alias) {
      return { kind: "CallExpr", func: { kind: "Ident", name: alias }, args: allArgs };
    }
  }

  return { kind: "CallExpr", func, args: allArgs };
}

/** Flatten a selector chain like json.dumps to "json.dumps". */
function flattenCallName(expr: IR.IRExpr): string | null {
  if (expr.kind === "Ident") return expr.name;
  if (expr.kind === "SelectorExpr") {
    const prefix = flattenCallName(expr.x);
    if (prefix) return `${prefix}.${expr.sel}`;
    return expr.sel;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Attribute access
// ---------------------------------------------------------------------------

// Hardcoded variable-level aliases: only applied when the receiver is the
// exact identifier name listed below. These aren't in the JSON alias map
// because they depend on a runtime convention (the variable being called
// `logger`), not on a stdlib module name.
//
// Each entry: full receiver.method → 1-token alias.
// Verified single-token via cl100k_base (see verify-final-aliases.mjs).
const VARIABLE_ALIASES: Record<string, string> = {
  "logger.info":  "Li",
  "logger.error": "Le",
};

function convertAttribute(node: any): IR.IRExpr {
  const base = convertExpr(node.Value);
  const attr: string = node.Attr || "";

  // self.x → .x (handled in emitter, but mark in IR via SelectorExpr with self base)
  // We keep the full SelectorExpr and handle self-elimination in the emitter

  // Check for reverse alias on dotted name
  if (base.kind === "Ident") {
    const fullName = `${(base as IR.IRIdent).name}.${attr}`;
    const alias = pythonReverseAliasMap[fullName];
    if (alias) return { kind: "Ident", name: alias };
    // Variable-level alias (e.g. logger.info → Li)
    const varAlias = VARIABLE_ALIASES[fullName];
    if (varAlias) return { kind: "Ident", name: varAlias };
  }

  return { kind: "SelectorExpr", x: base, sel: attr };
}

// ---------------------------------------------------------------------------
// Subscript / Slice
// ---------------------------------------------------------------------------

function convertSubscript(node: any): IR.IRExpr {
  const base = convertExpr(node.Value);
  const sliceNode = node.Slice;

  if (!sliceNode) {
    return { kind: "IndexExpr", x: base, index: { kind: "Ident", name: "_" } };
  }

  // Slice
  if (sliceNode.Kind === "Slice") {
    return {
      kind: "SliceExpr",
      x: base,
      low: sliceNode.Lower ? convertExpr(sliceNode.Lower) : undefined,
      high: sliceNode.Upper ? convertExpr(sliceNode.Upper) : undefined,
      max: sliceNode.Step ? convertExpr(sliceNode.Step) : undefined,
    } as IR.IRSliceExpr;
  }

  // Tuple subscript (multi-dimensional) — e.g., a[1, 2]
  if (sliceNode.Kind === "Tuple") {
    const elts = (sliceNode.Elts || []).map(convertExpr);
    return {
      kind: "IndexExpr",
      x: base,
      index: { kind: "Py_TupleExpr", elts } as IR.Py_TupleExpr,
    };
  }

  // Regular index
  return { kind: "IndexExpr", x: base, index: convertExpr(sliceNode) };
}

// ---------------------------------------------------------------------------
// Lambda
// ---------------------------------------------------------------------------

function convertLambda(node: any): IR.Py_LambdaExpr {
  const argsNode = node.Args || {};
  const rawArgs: any[] = argsNode.Args || [];
  const defaults: any[] = argsNode.Defaults || [];
  const defaultOffset = rawArgs.length - defaults.length;

  const params: IR.Py_Param[] = rawArgs.map((a: any, i: number) => {
    const p: IR.Py_Param = { name: a.Arg || "_" };
    const defIdx = i - defaultOffset;
    if (defIdx >= 0 && defaults[defIdx]) {
      p.default_ = convertExpr(defaults[defIdx]);
    }
    return p;
  });

  // Handle vararg/kwarg in lambda
  if (argsNode.Vararg) {
    params.push({ name: `*${argsNode.Vararg.Arg || "args"}` });
  }
  if (argsNode.Kwarg) {
    params.push({ name: `**${argsNode.Kwarg.Arg || "kwargs"}` });
  }

  const body = convertExpr(node.Body);

  return {
    kind: "Py_LambdaExpr",
    params,
    body,
  };
}

// ---------------------------------------------------------------------------
// Comprehension
// ---------------------------------------------------------------------------

function convertComprehension(node: any, type: "list" | "set" | "generator"): IR.Py_ComprehensionExpr {
  return {
    kind: "Py_ComprehensionExpr",
    type,
    elt: convertExpr(node.Elt),
    generators: (node.Generators || []).map(convertGenerator),
  };
}

function convertDictComprehension(node: any): IR.Py_ComprehensionExpr {
  return {
    kind: "Py_ComprehensionExpr",
    type: "dict",
    elt: convertExpr(node.Value),
    keyExpr: convertExpr(node.Key),
    generators: (node.Generators || []).map(convertGenerator),
  };
}

function convertGenerator(gen: any): IR.Py_Comprehension {
  return {
    target: convertExpr(gen.Target),
    iter: convertExpr(gen.Iter),
    ifs: (gen.Ifs || []).map(convertExpr),
    isAsync: !!gen.IsAsync,
  };
}

// ---------------------------------------------------------------------------
// F-string
// ---------------------------------------------------------------------------

function convertFString(node: any): IR.Py_FStringExpr {
  const parts: IR.Py_FStringExpr["parts"] = [];
  const values = node.Values || [];

  for (const v of values) {
    if (v.Kind === "Constant" && typeof v.Value === "string") {
      parts.push(v.Value);
    } else if (v.Kind === "FormattedValue") {
      const part: { expr: IR.IRExpr; conversion?: string; formatSpec?: string } = {
        expr: convertExpr(v.Value),
      };
      if (v.Conversion) {
        part.conversion = v.Conversion;
      }
      if (v.FormatSpec) {
        // FormatSpec is typically a JoinedStr itself
        if (v.FormatSpec.Kind === "JoinedStr") {
          part.formatSpec = fstringSpecToString(v.FormatSpec);
        } else if (typeof v.FormatSpec === "string") {
          part.formatSpec = v.FormatSpec;
        }
      }
      parts.push(part);
    }
  }

  return { kind: "Py_FStringExpr", parts };
}

/** Convert a JoinedStr format spec to a simple string. */
function fstringSpecToString(node: any): string {
  const values = node.Values || [];
  let result = "";
  for (const v of values) {
    if (v.Kind === "Constant" && typeof v.Value === "string") {
      result += v.Value;
    } else {
      // Nested expression in format spec — approximate as {expr}
      result += `{${exprToString(convertExpr(v.Value || v))}}`;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Utility: expression to simple string (for emitting)
// ---------------------------------------------------------------------------

function exprToString(expr: IR.IRExpr): string {
  // Minimal recursive printer for use in limited contexts
  switch (expr.kind) {
    case "Ident": return expr.name;
    case "BasicLit": return expr.value;
    case "SelectorExpr": return `${exprToString(expr.x)}.${expr.sel}`;
    case "CallExpr": return `${exprToString(expr.func)}(${expr.args.map(exprToString).join(",")})`;
    case "BinaryExpr": return `${exprToString(expr.left)}${expr.op}${exprToString(expr.right)}`;
    case "UnaryExpr": return `${expr.op}${exprToString(expr.x)}`;
    case "IndexExpr": return `${exprToString(expr.x)}[${exprToString(expr.index)}]`;
    default: return "_";
  }
}


// ===========================================================================
// pythonIrToAETP — convert IR to AET-Python (.aetp) string
// ===========================================================================

export function pythonIrToAETP(program: IR.IRProgram): string {
  const parts: string[] = ["!py-v1"];
  for (const decl of program.decls) {
    const s = pyNodeToAETP(decl);
    if (s) parts.push(s);
  }
  return parts.join(";");
}

// ---------------------------------------------------------------------------
// Node → AET-Python string
// ---------------------------------------------------------------------------

function pyNodeToAETP(node: IR.IRNode | IR.IRExprStmt): string {
  switch (node.kind) {
    case "FuncDecl": {
      const fd = node as any as IR.Py_FuncDecl;
      return emitFuncDecl(fd);
    }

    case "Py_ClassDecl":
      return emitClassDecl(node as IR.Py_ClassDecl);

    case "ReturnStmt": {
      const ret = node as IR.IRReturnStmt;
      if (ret.values.length === 0) return "^";
      return `^${ret.values.map(pyExprToAETP).join(",")}`;
    }

    case "IfStmt":
      return emitIfStmt(node as IR.IRIfStmt);

    case "ForStmt": {
      // while loop: ForStmt with no init/post
      const fs = node as IR.IRForStmt;
      const header = fs.cond ? pyExprToAETP(fs.cond) : "";
      return `while ${header}{${pyBlockToAETP(fs.body)}}`;
    }

    case "RangeStmt": {
      const rs = node as IR.IRRangeStmt;
      return emitRangeStmt(rs);
    }

    case "AssignStmt": {
      const as_ = node as IR.IRAssignStmt;
      // Special case: __slots__ = ("a", "b") → slots(a,b) (saves 4+ tokens)
      // Only when LHS is exactly `__slots__` and RHS is a tuple of string literals.
      const slotsForm = trySlotsShorthand(as_);
      if (slotsForm !== null) return slotsForm;
      return `${as_.lhs.map(pyExprToAETP).join(",")}${as_.op}${as_.rhs.map(pyExprToAETP).join(",")}`;
    }

    case "ExprStmt":
      return pyExprToAETP((node as IR.IRExprStmt).expr);

    case "BranchStmt":
      return (node as IR.IRBranchStmt).tok;

    case "VarDecl": {
      const vd = node as IR.IRVarDecl;
      // Annotation-only variable declarations in class body
      let s = vd.name;
      if (vd.type) s += `:${vd.type.name}`;
      if (vd.value) s += `=${pyExprToAETP(vd.value)}`;
      return s;
    }

    case "Py_TryExcept":
      return emitTryExcept(node as IR.Py_TryExcept);

    case "Py_WithStmt":
      return emitWithStmt(node as IR.Py_WithStmt);

    case "Py_RaiseStmt": {
      const rs = node as IR.Py_RaiseStmt;
      if (!rs.exc) return "raise";
      let s = `raise ${pyExprToAETP(rs.exc)}`;
      if (rs.cause) s += ` from ${pyExprToAETP(rs.cause)}`;
      return s;
    }

    case "Py_AssertStmt": {
      const as_ = node as IR.Py_AssertStmt;
      let s = `assert ${pyExprToAETP(as_.test)}`;
      if (as_.msg) s += `,${pyExprToAETP(as_.msg)}`;
      return s;
    }

    case "Py_DeleteStmt": {
      const ds = node as IR.Py_DeleteStmt;
      return `del ${ds.targets.map(pyExprToAETP).join(",")}`;
    }

    case "Py_GlobalStmt":
      return `global ${(node as IR.Py_GlobalStmt).names.join(",")}`;

    case "Py_NonlocalStmt":
      return `nonlocal ${(node as IR.Py_NonlocalStmt).names.join(",")}`;

    case "Py_ForElse":
      return emitForElse(node as IR.Py_ForElse);

    case "Py_WhileElse":
      return emitWhileElse(node as IR.Py_WhileElse);

    case "Py_MatchStmt":
      return emitMatchStmt(node as IR.Py_MatchStmt);

    case "ShortDeclStmt": {
      const sd = node as IR.IRShortDeclStmt;
      return `${sd.names.join(",")}:=${sd.values.map(pyExprToAETP).join(",")}`;
    }

    case "ConstDecl": {
      const cd = node as IR.IRConstDecl;
      return cd.specs.map(s => `${s.name}${s.value ? `=${pyExprToAETP(s.value)}` : ""}`).join(";");
    }

    case "BlockStmt": {
      return pyBlockToAETP(node as IR.IRBlockStmt);
    }

    default:
      return `/* ${(node as any).kind} */`;
  }
}

// ---------------------------------------------------------------------------
// Function declaration emitter
// ---------------------------------------------------------------------------

function emitFuncDecl(fd: IR.Py_FuncDecl): string {
  let s = "";

  // Decorators
  for (const dec of fd.decorators || []) {
    s += `@${emitDecoratorExpr(dec.expr)} `;
  }

  // Async prefix
  if (fd.isAsync) s += "async ";

  // Function name
  s += fd.name;

  // Parameters
  s += `(${emitParamList(fd.params)})`;

  // Body
  s += `{${pyBlockToAETP(fd.body)}}`;

  return s;
}

/**
 * Emit a decorator expression as an AETP string, applying abbreviation rules.
 *
 * Rules:
 * - Bare decorator ident: `dataclass` → `dc`
 * - Called decorator with args: `dataclass(frozen=True)` → `dc(frozen=True)`
 *
 * Extending the rule to the called form saves 1 token per `@dataclass(...)`.
 */
function emitDecoratorExpr(expr: IR.IRExpr): string {
  // Called decorator: check if the callee is an abbreviatable name
  if (expr.kind === "CallExpr") {
    const call = expr as IR.IRCallExpr;
    if (call.func.kind === "Ident") {
      const funcName = (call.func as IR.IRIdent).name;
      const abbrev = DECORATOR_ABBREV_REVERSE[funcName];
      if (abbrev) {
        const argStrs = call.args.map(pyExprToAETP).join(",");
        return `${abbrev}(${argStrs})`;
      }
    }
  }
  const raw = pyExprToAETP(expr);
  // Check for abbreviations on bare decorators
  return DECORATOR_ABBREV_REVERSE[raw] || raw;
}

function emitParamList(params: IR.Py_ParamList): string {
  const parts: string[] = [];

  // Positional-only params (before /)
  if (params.posonly && params.posonly.length > 0) {
    parts.push(...params.posonly.map(emitParam));
    parts.push("/");
  }

  // Regular params
  for (const p of params.params) {
    parts.push(emitParam(p));
  }

  // *args
  if (params.vararg) {
    parts.push(`*${params.vararg.name}`);
  } else if (params.kwonly && params.kwonly.length > 0) {
    // bare * separator before keyword-only params
    parts.push("*");
  }

  // Keyword-only params
  if (params.kwonly) {
    parts.push(...params.kwonly.map(emitParam));
  }

  // **kwargs
  if (params.kwarg) {
    parts.push(`**${params.kwarg.name}`);
  }

  return parts.join(",");
}

function emitParam(p: IR.Py_Param): string {
  let s = p.name;
  // Type annotations are eliminated in default mode
  if (p.default_) {
    s += `=${pyExprToAETP(p.default_)}`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Class declaration emitter
// ---------------------------------------------------------------------------

/**
 * Try to convert `__slots__ = ("a", "b")` into the shorthand `slots(a,b)`.
 * Returns the AETP shorthand string, or null if the assignment doesn't match.
 *
 * The shorthand saves 4+ tokens per declaration vs the verbose dunder form.
 */
function trySlotsShorthand(as_: IR.IRAssignStmt): string | null {
  if (as_.op !== "=") return null;
  if (as_.lhs.length !== 1 || as_.rhs.length !== 1) return null;
  const lhs = as_.lhs[0];
  if (lhs.kind !== "Ident" || (lhs as IR.IRIdent).name !== "__slots__") return null;

  const rhs = as_.rhs[0];
  // Accept both Py_TupleExpr and CompositeLit (list-like) of string literals
  let elts: IR.IRExpr[] = [];
  if (rhs.kind === "Py_TupleExpr") {
    elts = (rhs as IR.Py_TupleExpr).elts;
  } else if (rhs.kind === "CompositeLit") {
    elts = (rhs as IR.IRCompositeLit).elts;
  } else {
    return null;
  }

  const names: string[] = [];
  for (const e of elts) {
    if (e.kind !== "BasicLit") return null;
    const lit = e as IR.IRBasicLit;
    if (lit.type !== "STRING") return null;
    // Strip outer quotes (single or double)
    const v = lit.value;
    if (v.length < 2) return null;
    const first = v[0];
    const last = v[v.length - 1];
    if ((first !== '"' && first !== "'") || first !== last) return null;
    const inner = v.slice(1, -1);
    // Names must be valid Python identifiers
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(inner)) return null;
    names.push(inner);
  }

  if (names.length === 0) return null;
  return `slots(${names.join(",")})`;
}

/**
 * Check whether the class inherits from `Enum`, `IntEnum`, `StrEnum`, or `Flag`
 * (any Python enum base). Detected by matching a base class Ident name.
 */
function isEnumBase(cd: IR.Py_ClassDecl): boolean {
  const ENUM_BASES = new Set(["Enum", "IntEnum", "StrEnum", "IntFlag", "Flag"]);
  for (const base of cd.bases || []) {
    if (base.kind === "Ident" && ENUM_BASES.has((base as IR.IRIdent).name)) {
      return true;
    }
    // Attribute like enum.Enum
    if (base.kind === "SelectorExpr") {
      const sel = (base as IR.IRSelectorExpr).sel;
      if (ENUM_BASES.has(sel)) return true;
    }
  }
  return false;
}

/**
 * Check whether an IR node is an assignment of the form `IDENT = auto()`.
 * Returns the member name if it matches, otherwise null.
 */
function enumAutoMemberName(node: IR.IRNode | IR.IRExprStmt): string | null {
  if (node.kind !== "AssignStmt") return null;
  const as_ = node as IR.IRAssignStmt;
  if (as_.op !== "=") return null;
  if (as_.lhs.length !== 1 || as_.rhs.length !== 1) return null;
  const lhs = as_.lhs[0];
  const rhs = as_.rhs[0];
  if (lhs.kind !== "Ident") return null;
  if (rhs.kind !== "CallExpr") return null;
  const call = rhs as IR.IRCallExpr;
  if (call.args.length !== 0) return null;
  if (call.func.kind !== "Ident") return null;
  if ((call.func as IR.IRIdent).name !== "auto") return null;
  return (lhs as IR.IRIdent).name;
}

function emitClassDecl(cd: IR.Py_ClassDecl): string {
  let s = "";

  // Bases and keywords (computed early to decide @dc class elision)
  const baseExprs = (cd.bases || []).map(pyExprToAETP);
  const kwExprs = (cd.keywords || []).map(kw => `${kw.key}=${pyExprToAETP(kw.value)}`);
  const allArgs = [...baseExprs, ...kwExprs];

  // Check if class has @dc decorator and no bases — if so, we can omit the `class` keyword.
  // When bases are present (e.g., @dc ClassName(Base)), we keep `class` to avoid ambiguity
  // with funcDef patterns like `funcName(params){...}`.
  const hasDcDecorator = allArgs.length === 0 && (cd.decorators || []).some(dec => {
    const abbrev = emitDecoratorExpr(dec.expr);
    return abbrev === "dc";
  });

  // Decorators
  for (const dec of cd.decorators || []) {
    s += `@${emitDecoratorExpr(dec.expr)} `;
  }

  // Omit `class` keyword when @dc is present and there are no bases (implies class)
  if (!hasDcDecorator) {
    s += "class ";
  }
  s += cd.name;
  if (allArgs.length > 0) {
    s += `(${allArgs.join(",")})`;
  }

  // Enum auto() inference: if this is an Enum subclass AND the leading body
  // members are all `NAME = auto()` assignments, emit them as bare names.
  // E.g. `RED=auto();GREEN=auto()` (4 tokens × n) → `RED;GREEN` (2 tokens × n).
  // Non-auto members (methods, other assigns) still emit normally after the
  // bare-name prefix.
  let body = cd.body;
  let enumPrefix = "";
  if (isEnumBase(cd)) {
    const autoNames: string[] = [];
    let cut = 0;
    for (let i = 0; i < body.length; i++) {
      const name = enumAutoMemberName(body[i]);
      if (name === null) break;
      autoNames.push(name);
      cut = i + 1;
    }
    if (autoNames.length > 0) {
      enumPrefix = autoNames.join(";");
      body = body.slice(cut);
    }
  }

  // Body — build (kind, str) pairs so joinStmtsCompressed can decide separator safely.
  const bodyParts: Array<{ kind: string; str: string }> = [];
  for (const stmt of body) {
    const str = pyNodeToAETP(stmt);
    if (!str) continue;
    bodyParts.push({ kind: stmt.kind, str });
  }
  if (enumPrefix) {
    // Bare enum names: treat as ExprStmt (not block-ending). Safe.
    bodyParts.unshift({ kind: "ExprStmt", str: enumPrefix });
  }
  s += `{${joinStmtsCompressed(bodyParts)}}`;

  return s;
}

// ---------------------------------------------------------------------------
// Control flow emitters
// ---------------------------------------------------------------------------

function emitIfStmt(node: IR.IRIfStmt): string {
  // Detect __name__ == "__main__" guard → @main{...}
  if (isMainGuard(node.cond)) {
    return `@main{${pyBlockToAETP(node.body)}}`;
  }

  let s = `if ${pyExprToAETP(node.cond)}{${pyBlockToAETP(node.body)}}`;
  if (node.else_) {
    if (node.else_.kind === "IfStmt") {
      s += `elif ${pyExprToAETP((node.else_ as IR.IRIfStmt).cond)}{${pyBlockToAETP((node.else_ as IR.IRIfStmt).body)}}`;
      // Continue chaining
      let current = (node.else_ as IR.IRIfStmt).else_;
      while (current) {
        if (current.kind === "IfStmt") {
          const eif = current as IR.IRIfStmt;
          s += `elif ${pyExprToAETP(eif.cond)}{${pyBlockToAETP(eif.body)}}`;
          current = eif.else_;
        } else if (current.kind === "BlockStmt") {
          s += `else{${pyBlockToAETP(current as IR.IRBlockStmt)}}`;
          current = undefined;
        } else {
          break;
        }
      }
    } else if (node.else_.kind === "BlockStmt") {
      s += `else{${pyBlockToAETP(node.else_ as IR.IRBlockStmt)}}`;
    }
  }
  return s;
}

/** Detect if condition is __name__ == "__main__" */
function isMainGuard(expr: IR.IRExpr): boolean {
  if (expr.kind !== "BinaryExpr") return false;
  const bin = expr as IR.IRBinaryExpr;
  if (bin.op !== "==") return false;
  const left = bin.left;
  const right = bin.right;
  if (left.kind === "Ident" && (left as IR.IRIdent).name === "__name__") {
    if (right.kind === "BasicLit" && (right as IR.IRBasicLit).value === '"__main__"') {
      return true;
    }
  }
  return false;
}

function emitRangeStmt(rs: IR.IRRangeStmt): string {
  // Emit for loop: for key,value in expr{body}
  const vars: string[] = [];
  if (rs.key) vars.push(rs.key);
  if (rs.value) vars.push(rs.value);
  const varStr = vars.join(",");

  return `for ${varStr} in ${pyExprToAETP(rs.x)}{${pyBlockToAETP(rs.body)}}`;
}

function emitForElse(node: IR.Py_ForElse): string {
  const asyncPrefix = node.isAsync ? "async " : "";
  const target = pyExprToAETP(node.target);
  let s = `${asyncPrefix}for ${target} in ${pyExprToAETP(node.iter)}{${pyBlockToAETP(node.body)}}`;
  // Only emit else clause if it has statements
  if (node.elseBody.stmts.length > 0) {
    s += `else{${pyBlockToAETP(node.elseBody)}}`;
  }
  return s;
}

function emitWhileElse(node: IR.Py_WhileElse): string {
  return `while ${pyExprToAETP(node.cond)}{${pyBlockToAETP(node.body)}}else{${pyBlockToAETP(node.elseBody)}}`;
}

function emitTryExcept(node: IR.Py_TryExcept): string {
  let s = `try{${pyBlockToAETP(node.body)}}`;

  for (const h of node.handlers) {
    if (h.type) {
      s += `except ${pyExprToAETP(h.type)}`;
      if (h.name) s += ` as ${h.name}`;
    } else {
      s += "except";
    }
    s += `{${pyBlockToAETP(h.body)}}`;
  }

  if (node.elseBody) {
    s += `else{${pyBlockToAETP(node.elseBody)}}`;
  }

  if (node.finallyBody) {
    s += `finally{${pyBlockToAETP(node.finallyBody)}}`;
  }

  return s;
}

function emitWithStmt(node: IR.Py_WithStmt): string {
  const asyncPrefix = node.isAsync ? "async " : "";
  const items = node.items.map(item => {
    let s = pyExprToAETP(item.contextExpr);
    if (item.optionalVar) s += `as ${item.optionalVar}`;
    return s;
  }).join(",");

  return `${asyncPrefix}with ${items}{${pyBlockToAETP(node.body)}}`;
}

function emitMatchStmt(node: IR.Py_MatchStmt): string {
  const subject = pyExprToAETP(node.subject);
  const cases = node.cases.map(c => {
    let s = `case ${pyExprToAETP(c.pattern)}`;
    if (c.guard) s += ` if ${pyExprToAETP(c.guard)}`;
    s += `{${pyBlockToAETP(c.body)}}`;
    return s;
  }).join(";");

  return `match ${subject}{${cases}}`;
}

// ---------------------------------------------------------------------------
// Block → AET-Python string
// ---------------------------------------------------------------------------

function pyBlockToAETP(block: IR.IRBlockStmt): string {
  // Build (kind, str) pairs so joinStmtsCompressed can decide separator safely.
  const pairs: Array<{ kind: string; str: string }> = [];
  for (const stmt of block.stmts) {
    const str = pyNodeToAETP(stmt);
    if (str === "") continue;
    pairs.push({ kind: stmt.kind, str });
  }
  return joinStmtsCompressed(pairs);
}

/**
 * Statement kinds that ALWAYS emit a string ending with `}` from a block-end
 * (not from a literal expression like `{dict}` on a RHS). For these kinds,
 * we can safely omit the `;` separator before a following `^` (return) — the
 * sequence `}^` is unambiguous because the closing `}` belongs to a control
 * structure or class/function body, never to a dict/set literal RHS.
 *
 * AssignStmt and ExprStmt are NOT in this set: they may end with `}` from a
 * dict/set literal on the RHS, in which case `}^expr` would be parsed as a
 * XOR expression rather than two statements.
 */
const BLOCK_ENDING_KINDS = new Set<string>([
  "IfStmt",
  "ForStmt",
  "RangeStmt",
  "Py_ForElse",
  "Py_WhileElse",
  "Py_TryExcept",
  "Py_WithStmt",
  "Py_MatchStmt",
  "Py_ClassDecl",
  "FuncDecl",
  "BlockStmt",
]);

/**
 * Join statement strings with `;`, but omit `;` before `^` (return) when the
 * previous statement is a structural block (if/for/while/try/with/match/class/
 * func), in which case `}^` is unambiguous.
 *
 * We cannot omit `;` before `^` after expression or assignment statements
 * because `^` is also the XOR operator and `mapping={...}^return_val` would
 * be parsed as a XOR expression rather than two statements.
 */
function joinStmtsCompressed(parts: Array<{ kind: string; str: string }>): string {
  if (parts.length === 0) return "";
  let result = parts[0].str;
  for (let i = 1; i < parts.length; i++) {
    const cur = parts[i];
    const prev = parts[i - 1];
    // Safe to omit `;` only when the next stmt starts with `^` AND the prev
    // is a structural block (so its trailing `}` is a real block end).
    const safe = cur.str.startsWith("^") &&
      prev.str.endsWith("}") &&
      BLOCK_ENDING_KINDS.has(prev.kind);
    if (!safe) {
      result += ";";
    }
    result += cur.str;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Operator precedence (higher number = tighter binding)
// ---------------------------------------------------------------------------

const PREC: Record<string, number> = {
  " or ": 1, "or": 1,
  " and ": 2, "and": 2,
  " in ": 3, "in": 3, " not in ": 3, "not in": 3,
  " is ": 3, "is": 3, " is not ": 3, "is not": 3,
  "==": 4, "!=": 4, "<": 4, ">": 4, "<=": 4, ">=": 4,
  "|": 5,
  "^": 6,
  "&": 7,
  "<<": 8, ">>": 8,
  "+": 9, "-": 9,
  "*": 10, "/": 10, "//": 10, "%": 10, "@": 10,
  "**": 12,
  " as ": 0,
};

function opPrecedence(op: string): number {
  return PREC[op] ?? PREC[op.trim()] ?? 5;
}

function emitBinaryExpr(expr: IR.IRBinaryExpr): string {
  const parentPrec = opPrecedence(expr.op);
  const leftStr = needsParens(expr.left, parentPrec, "left", expr.op)
    ? `(${pyExprToAETP(expr.left)})`
    : pyExprToAETP(expr.left);
  const rightStr = needsParens(expr.right, parentPrec, "right", expr.op)
    ? `(${pyExprToAETP(expr.right)})`
    : pyExprToAETP(expr.right);
  return `${leftStr}${expr.op}${rightStr}`;
}

function needsParens(child: IR.IRExpr, parentPrec: number, side: "left" | "right", parentOp: string): boolean {
  // Walrus has the lowest precedence in Python — wrap whenever it appears as
  // an operand in any binary expression. e.g. `(big := f()) is not None`.
  if (child.kind === "Py_WalrusExpr") return true;
  // Ternary `a if cond else b` also has lower precedence than most ops.
  if (child.kind === "Py_TernaryExpr") return true;
  // Lambda: parens needed when in any binary expression.
  if (child.kind === "Py_LambdaExpr") return true;
  if (child.kind !== "BinaryExpr") return false;
  const childPrec = opPrecedence((child as IR.IRBinaryExpr).op);
  // Lower precedence child always needs parens
  if (childPrec < parentPrec) return true;
  // Same precedence on right side needs parens for non-associative ops
  if (childPrec === parentPrec && side === "right" && parentOp.trim() !== "and" && parentOp.trim() !== "or") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Expression → AET-Python string
// ---------------------------------------------------------------------------

// Identifier abbreviations for common builtins
const IDENT_ABBREV: Record<string, string> = {
  super: "sup",
};

function pyExprToAETP(expr: IR.IRExpr): string {
  switch (expr.kind) {
    case "Ident":
      return IDENT_ABBREV[expr.name] || expr.name;

    case "BasicLit":
      return expr.value;

    case "CompositeLit": {
      // List literal
      const elts = expr.elts.map(pyExprToAETP).join(",");
      return `[${elts}]`;
    }

    case "BinaryExpr":
      return emitBinaryExpr(expr);

    case "UnaryExpr": {
      const opStr = expr.op;
      // "not" needs a space after it
      if (opStr === "not") return `not ${pyExprToAETP(expr.x)}`;
      return `${opStr}${pyExprToAETP(expr.x)}`;
    }

    case "CallExpr": {
      const args = expr.args.map(pyExprToAETP).join(",");
      return `${pyExprToAETP(expr.func)}(${args})`;
    }

    case "SelectorExpr": {
      const x = pyExprToAETP(expr.x);
      // self.attr → .attr
      if (x === "self") return `.${expr.sel}`;
      // cls.attr → keep as cls.attr (@ prefix conflicts with decorators)
      // The emitter will handle cls restoration for classmethods
      return `${x}.${expr.sel}`;
    }

    case "IndexExpr":
      return `${pyExprToAETP(expr.x)}[${pyExprToAETP(expr.index)}]`;

    case "SliceExpr": {
      const base = expr.x.kind === "Ident" && (expr.x as IR.IRIdent).name === "_"
        ? "" : pyExprToAETP(expr.x);
      const low = expr.low ? pyExprToAETP(expr.low) : "";
      const high = expr.high ? pyExprToAETP(expr.high) : "";
      if (expr.max) {
        return `${base}[${low}:${high}:${pyExprToAETP(expr.max)}]`;
      }
      return `${base}[${low}:${high}]`;
    }

    case "ParenExpr":
      return `(${pyExprToAETP(expr.x)})`;

    case "KeyValueExpr":
      return `${pyExprToAETP(expr.key)}=${pyExprToAETP(expr.value)}`;

    case "FuncLit": {
      const params = expr.params.map(p => p.name).join(",");
      return `|${params}|${pyBlockToAETP(expr.body)}`;
    }

    // Python-specific expressions

    case "Py_LambdaExpr": {
      const le = expr as IR.Py_LambdaExpr;
      const params = le.params.map(p => {
        let s = p.name;
        if (p.default_) s += `=${pyExprToAETP(p.default_)}`;
        return s;
      }).join(",");
      return `|${params}|${pyExprToAETP(le.body)}`;
    }

    case "Py_ComprehensionExpr":
      return emitComprehension(expr as IR.Py_ComprehensionExpr);

    case "Py_FStringExpr":
      return emitFString(expr as IR.Py_FStringExpr);

    case "Py_TernaryExpr": {
      const te = expr as IR.Py_TernaryExpr;
      return `${pyExprToAETP(te.value)} if ${pyExprToAETP(te.test)} else ${pyExprToAETP(te.orElse)}`;
    }

    case "Py_StarExpr": {
      const se = expr as IR.Py_StarExpr;
      return se.isDouble ? `**${pyExprToAETP(se.value)}` : `*${pyExprToAETP(se.value)}`;
    }

    case "Py_YieldExpr": {
      const ye = expr as IR.Py_YieldExpr;
      return ye.value ? `yield ${pyExprToAETP(ye.value)}` : "yield";
    }

    case "Py_YieldFromExpr":
      return `yield from ${pyExprToAETP((expr as IR.Py_YieldFromExpr).value)}`;

    case "Py_AwaitExpr":
      return `await ${pyExprToAETP((expr as IR.Py_AwaitExpr).value)}`;

    case "Py_WalrusExpr": {
      const we = expr as IR.Py_WalrusExpr;
      return `${we.target}:=${pyExprToAETP(we.value)}`;
    }

    case "Py_DictExpr": {
      const de = expr as IR.Py_DictExpr;
      const pairs: string[] = [];
      for (let i = 0; i < de.values.length; i++) {
        const key = de.keys[i];
        const val = de.values[i];
        if (key === null) {
          // **spread
          pairs.push(`**${pyExprToAETP(val)}`);
        } else {
          pairs.push(`${pyExprToAETP(key)}:${pyExprToAETP(val)}`);
        }
      }
      return `{${pairs.join(",")}}`;
    }

    case "Py_SetExpr": {
      const se = expr as IR.Py_SetExpr;
      return `{${se.elts.map(pyExprToAETP).join(",")}}`;
    }

    case "Py_TupleExpr": {
      const te = expr as IR.Py_TupleExpr;
      if (te.elts.length === 1) {
        // Single-element tuple needs trailing comma
        return `(${pyExprToAETP(te.elts[0])},)`;
      }
      return `(${te.elts.map(pyExprToAETP).join(",")})`;
    }

    // Fallback for shared IR types
    case "StarExpr":
      return `*${pyExprToAETP((expr as IR.IRStarExpr).x)}`;

    case "MapTypeExpr":
      return `dict[${pyExprToAETP((expr as IR.IRMapTypeExpr).key)},${pyExprToAETP((expr as IR.IRMapTypeExpr).value)}]`;

    case "ArrayTypeExpr":
      return `list[${pyExprToAETP((expr as IR.IRArrayTypeExpr).elt)}]`;

    default:
      return "_";
  }
}

// ---------------------------------------------------------------------------
// Comprehension emitter
// ---------------------------------------------------------------------------

function emitComprehension(comp: IR.Py_ComprehensionExpr): string {
  const genParts = comp.generators.map(emitGenerator).join(" ");

  switch (comp.type) {
    case "list":
      return `[${pyExprToAETP(comp.elt)} ${genParts}]`;
    case "set":
      return `{${pyExprToAETP(comp.elt)} ${genParts}}`;
    case "generator":
      return `(${pyExprToAETP(comp.elt)} ${genParts})`;
    case "dict": {
      const keyStr = comp.keyExpr ? pyExprToAETP(comp.keyExpr) : "_";
      return `{${keyStr}:${pyExprToAETP(comp.elt)} ${genParts}}`;
    }
  }
}

function emitGenerator(gen: IR.Py_Comprehension): string {
  const asyncPrefix = gen.isAsync ? "async " : "";
  let s = `${asyncPrefix}for ${pyExprToAETP(gen.target)} in ${pyExprToAETP(gen.iter)}`;
  for (const cond of gen.ifs) {
    s += ` if ${pyExprToAETP(cond)}`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// F-string emitter
// ---------------------------------------------------------------------------

function emitFString(fstr: IR.Py_FStringExpr): string {
  let inner = "";
  for (const part of fstr.parts) {
    if (typeof part === "string") {
      // Escape special chars so the literal segment of the f-string survives
      // emission to a single line: \n, \r, \t, backslashes, and embedded
      // double-quotes (which would otherwise close the outer f"...").
      inner += part
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    } else {
      let exprStr = pyExprToAETP(part.expr);
      // If the expression contains double quotes, swap them to single quotes
      // so they don't clash with the outer f"..." delimiters
      exprStr = swapQuotesForFString(exprStr);
      let formatted = `{${exprStr}`;
      if (part.conversion) {
        formatted += `!${part.conversion}`;
      }
      if (part.formatSpec) {
        formatted += `:${part.formatSpec}`;
      }
      formatted += "}";
      inner += formatted;
    }
  }
  return `f"${inner}"`;
}

/** Swap double-quoted strings to single-quoted inside f-string expressions
 *  to avoid conflicting with the outer f"..." delimiters. */
function swapQuotesForFString(s: string): string {
  if (!s.includes('"')) return s;
  // Replace "..." string literals with '...' equivalents
  return s.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    // Convert "content" to 'content'
    const content = match.slice(1, -1);
    return `'${content}'`;
  });
}
