// Transformer: Converts AET-Java Chevrotain CST to IR nodes
// Handles: class/record/enum/interface decls, modifiers, Java-order params,
// constructors, lambda, try-catch, switch expressions, enhanced for, instanceof,
// cast, ternary, pipe ops, new elimination, stdlib alias expansion, import resolution.

import { CstNode, IToken } from "chevrotain";
import * as IR from "../ir.js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Stdlib alias loading ─────────────────────────────────────────────────────

interface JavaAlias {
  java: string;
  pkg: string;
  auto?: boolean;
  import?: string;
  isConstructor?: boolean;
}

let aliasMap: Record<string, JavaAlias> = {};

export function loadJavaAliases(path?: string) {
  try {
    const p = path || resolve(process.cwd(), "stdlib-aliases-java.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    aliasMap = data.aliases || {};
  } catch { /* aliases optional */ }
}

// ─── Module-level state ───────────────────────────────────────────────────────

let collectedImports: Set<string>;
let stmtCounter: number;

function addImport(pkg: string) {
  // java.lang.* is auto-imported — never track it
  if (!pkg.startsWith("java.lang")) {
    collectedImports.add(pkg);
  }
}

function nextStmtIndex(): number {
  return stmtCounter++;
}

// ─── CST helper functions ─────────────────────────────────────────────────────

function tok(node: CstNode, tokenName: string, idx = 0): string | undefined {
  const tokens = node.children[tokenName] as IToken[] | undefined;
  return tokens?.[idx]?.image;
}

function tokAll(node: CstNode, tokenName: string): string[] {
  const tokens = node.children[tokenName] as IToken[] | undefined;
  return tokens?.map(t => t.image) || [];
}

function tokCount(node: CstNode, tokenName: string): number {
  const tokens = node.children[tokenName] as IToken[] | undefined;
  return tokens?.length || 0;
}

function tokToken(node: CstNode, tokenName: string, idx = 0): IToken | undefined {
  const tokens = node.children[tokenName] as IToken[] | undefined;
  return tokens?.[idx];
}

function tokTokens(node: CstNode, tokenName: string): IToken[] {
  return (node.children[tokenName] as IToken[]) || [];
}

function child(node: CstNode, ruleName: string, idx = 0): CstNode | undefined {
  const nodes = node.children[ruleName] as CstNode[] | undefined;
  return nodes?.[idx];
}

function children(node: CstNode, ruleName: string): CstNode[] {
  return (node.children[ruleName] as CstNode[]) || [];
}

/** Get the offset of the first token in a CST node (for ordering). */
function getFirstTokenOffset(node: CstNode): number {
  for (const key of Object.keys(node.children)) {
    const items = node.children[key];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && typeof item === "object") {
          if ("startOffset" in item) return (item as IToken).startOffset;
          if ("children" in item) return getFirstTokenOffset(item as CstNode);
        }
      }
    }
  }
  return Infinity;
}

// ─── Alias resolution ─────────────────────────────────────────────────────────

function resolveAlias(name: string): JavaAlias | null {
  const entry = aliasMap[name];
  if (!entry) return null;
  if (entry.import) {
    addImport(entry.import);
  }
  return entry;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function transformJava(cst: CstNode): IR.IRProgram {
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

// ─── Program ──────────────────────────────────────────────────────────────────

function transformProgram(node: CstNode): IR.IRNode[] {
  const decls: IR.IRNode[] = [];
  for (const td of children(node, "topDecl")) {
    const d = transformTopDecl(td);
    if (d) decls.push(d);
  }
  return decls;
}

// ─── Top-level declarations ───────────────────────────────────────────────────

function transformTopDecl(node: CstNode): IR.IRNode | null {
  // @ declarations: class, record, interface
  const at = child(node, "atDecl");
  if (at) return transformAtDecl(at);

  // # declarations: enum
  const en = child(node, "enumDecl");
  if (en) return transformEnumDecl(en);

  // Top-level function or var decl
  const tfv = child(node, "topFuncOrVarDecl");
  if (tfv) return transformTopFuncOrVarDecl(tfv);

  return null;
}

// ─── @ declarations (class / record / interface) ──────────────────────────────

function transformAtDecl(node: CstNode): IR.IRNode {
  const mods = child(node, "modifiers");
  const modList = mods ? transformModifiers(mods) : [];
  const name = tok(node, "Ident") || "";
  const tp = child(node, "typeParams");
  const typeParams = tp ? transformTypeParams(tp) : [];

  // Record: recordSuffix
  const rs = child(node, "recordSuffix");
  if (rs) return transformRecordDecl(name, modList, typeParams, rs);

  // Interface: interfaceSuffix
  const is_ = child(node, "interfaceSuffix");
  if (is_) return transformInterfaceDecl(name, modList, typeParams, is_);

  // Class: classSuffix
  const cs = child(node, "classSuffix");
  if (cs) return transformClassDecl(name, modList, typeParams, cs);

  // Fallback: empty class
  return {
    kind: "Java_ClassDecl",
    name,
    modifiers: modList,
    interfaces: [],
    fields: [],
    methods: [],
    constructors: [],
    innerClasses: [],
    stmtIndex: nextStmtIndex(),
  } as IR.Java_ClassDecl;
}

// ─── Modifiers ────────────────────────────────────────────────────────────────

function transformModifiers(node: CstNode): string[] {
  const mods: string[] = [];
  // + → public
  const plusCount = tokCount(node, "Plus");
  for (let i = 0; i < plusCount; i++) mods.push("public");
  // - → private
  const minusCount = tokCount(node, "Minus");
  for (let i = 0; i < minusCount; i++) mods.push("private");
  // ~ → protected
  const tildeCount = tokCount(node, "Tilde");
  for (let i = 0; i < tildeCount; i++) mods.push("protected");
  // $ → static
  const dollarCount = tokCount(node, "Dollar");
  for (let i = 0; i < dollarCount; i++) mods.push("static");
  // ! → final
  const bangCount = tokCount(node, "Bang");
  for (let i = 0; i < bangCount; i++) mods.push("final");
  // abs → abstract
  const absTokens = tokAll(node, "Abs");
  for (let i = 0; i < absTokens.length; i++) mods.push("abstract");

  return mods;
}

// ─── Type params ──────────────────────────────────────────────────────────────

function transformTypeParams(node: CstNode): string[] {
  const params: string[] = [];
  for (const tp of children(node, "typeParam")) {
    const idents = tokAll(tp, "Ident");
    const name = idents[0] || "T";
    const bound = child(tp, "typeBound");
    if (bound) {
      const boundTypes = children(bound, "typeExpr").map(te => typeExprToString(te));
      params.push(name + " extends " + boundTypes.join(" & "));
    } else {
      params.push(name);
    }
  }
  return params;
}

// ─── Class declaration ────────────────────────────────────────────────────────

function transformClassDecl(
  name: string,
  modifiers: string[],
  typeParams: string[],
  node: CstNode
): IR.Java_ClassDecl {
  const si = nextStmtIndex();

  // Inheritance
  let superClass: string | undefined;
  const interfaces: string[] = [];
  const inh = child(node, "inheritance");
  if (inh) {
    const typeExprs = children(inh, "typeExpr");
    // If inheritance starts with ':', first typeExpr is superclass
    if (tok(inh, "Colon")) {
      if (typeExprs.length > 0) {
        superClass = typeExprToString(typeExprs[0]);
      }
      // Remaining typeExprs (inside [...]) are interfaces
      for (let i = 1; i < typeExprs.length; i++) {
        interfaces.push(typeExprToString(typeExprs[i]));
      }
    } else {
      // Just [interfaces]
      for (const te of typeExprs) {
        interfaces.push(typeExprToString(te));
      }
    }
  }

  // Class body
  const cb = child(node, "classBody");
  const body = cb ? transformClassBody(cb) : { fields: [], methods: [], constructors: [], innerClasses: [] };

  // Infer type parameters from field/method types if not explicitly declared
  // Skip inference for anonymous inner classes (__Anon_*) — they inherit type params from enclosing class
  let effectiveTypeParams = typeParams;
  if (effectiveTypeParams.length === 0 && !name.startsWith("__Anon_")) {
    effectiveTypeParams = inferClassTypeParams(body);
  }

  // Prepend type params to name if present
  const fullName = effectiveTypeParams.length > 0 ? name + "<" + effectiveTypeParams.join(", ") + ">" : name;

  return {
    kind: "Java_ClassDecl",
    name: fullName,
    modifiers,
    superClass,
    interfaces,
    fields: body.fields,
    methods: body.methods,
    constructors: body.constructors,
    innerClasses: body.innerClasses,
    stmtIndex: si,
  };
}

// ─── Class body ───────────────────────────────────────────────────────────────

interface ClassBodyResult {
  fields: IR.IRField[];
  methods: IR.IRFuncDecl[];
  constructors: IR.IRFuncDecl[];
  innerClasses: IR.Java_ClassDecl[];
}

function transformClassBody(node: CstNode): ClassBodyResult {
  const fields: IR.IRField[] = [];
  const methods: IR.IRFuncDecl[] = [];
  const constructors: IR.IRFuncDecl[] = [];
  const innerClasses: IR.Java_ClassDecl[] = [];

  for (const member of children(node, "classMember")) {
    // Nested class/record/interface via atDecl
    const at = child(member, "atDecl");
    if (at) {
      const decl = transformAtDecl(at);
      if (decl.kind === "Java_ClassDecl") {
        innerClasses.push(decl as IR.Java_ClassDecl);
      }
      // Other nested types (records, interfaces) pushed as inner classes for simplicity
      continue;
    }

    // Nested enum
    const en = child(member, "enumDecl");
    if (en) {
      // Treat nested enum as an inner class for now
      continue;
    }

    // Constructor
    const ctor = child(member, "constructorDecl");
    if (ctor) {
      constructors.push(transformConstructorDecl(ctor));
      continue;
    }

    // Method
    const md = child(member, "methodDecl");
    if (md) {
      methods.push(transformMethodDecl(md));
      continue;
    }

    // Field
    const fd = child(member, "fieldDecl");
    if (fd) {
      fields.push(transformFieldDecl(fd));
      continue;
    }
  }

  return { fields, methods, constructors, innerClasses };
}

/** Infer type parameters (e.g., T, K, V) from field and method signatures.
 *  Scans for single-letter uppercase type names that aren't known Java types. */
function inferClassTypeParams(body: ClassBodyResult): string[] {
  const KNOWN_TYPES = new Set([
    "int", "long", "double", "float", "boolean", "byte", "short", "char", "void",
    "String", "Object", "Integer", "Long", "Double", "Float", "Boolean", "Byte", "Short", "Character",
    "List", "Map", "Set", "ArrayList", "HashMap", "LinkedHashMap", "TreeMap", "HashSet",
    "Optional", "Iterator", "Iterable", "Exception", "RuntimeException",
    "StringBuilder", "StringJoiner", "Pattern", "Matcher", "Collections", "Arrays", "Objects",
    "NoSuchElementException", "EmptyStackException", "IndexOutOfBoundsException",
    "NullPointerException", "ArithmeticException", "IllegalArgumentException",
    "Comparable", "Comparator", "Runnable", "Consumer", "Supplier", "Function",
  ]);

  const candidates = new Set<string>();

  function scanTypeName(name: string | undefined) {
    if (!name) return;
    // Look for single-letter uppercase identifiers that aren't known types
    // Also handle generic params like ArrayList<T> — extract T
    const matches = name.match(/\b([A-Z])\b/g);
    if (matches) {
      for (const m of matches) {
        if (!KNOWN_TYPES.has(m)) {
          candidates.add(m);
        }
      }
    }
  }

  for (const f of body.fields) {
    scanTypeName(f.type.name);
  }
  for (const m of body.methods) {
    for (const p of m.params) {
      scanTypeName(p.type?.name);
    }
    for (const r of m.results) {
      scanTypeName(r.name);
    }
  }

  // Sort alphabetically for consistent output
  return [...candidates].sort();
}

// ─── Field declaration ────────────────────────────────────────────────────────

function transformFieldDecl(node: CstNode): IR.IRField {
  const mods = child(node, "modifiers");
  const modList = mods ? transformModifiers(mods) : [];
  const te = child(node, "typeExpr");
  const type = te ? transformTypeExpr(te) : IR.simpleType("Object");
  const name = tok(node, "Ident") || "";

  // Check for initializer expression
  const initExpr = child(node, "expr");

  // Encode modifiers and initializer into tag (the emitter reads them back)
  let tag: string | undefined;
  const tagParts: string[] = [];
  if (modList.length > 0) {
    tagParts.push("modifiers:" + modList.join(","));
  }
  if (initExpr) {
    tagParts.push("init:" + exprToJavaSource(transformExpr(initExpr)));
  }
  if (tagParts.length > 0) {
    tag = tagParts.join(";");
  }

  return { name, type, tag };
}

// ─── Method declaration ───────────────────────────────────────────────────────

function transformMethodDecl(node: CstNode): IR.IRFuncDecl {
  const si = nextStmtIndex();
  const mods = child(node, "modifiers");
  const modList = mods ? transformModifiers(mods) : [];
  const name = tok(node, "Ident") || "";

  // Method-level type parameters (e.g., <T> before method name)
  const tp = child(node, "typeParams");
  const methodTypeParams = tp ? transformTypeParams(tp) : [];

  const pl = child(node, "paramList");
  const params = pl ? transformParamList(pl) : [];

  // Return type: -> Type
  const te = child(node, "typeExpr");
  const results: IR.IRType[] = te ? [transformTypeExpr(te)] : [];

  // Body (optional for abstract methods)
  const blk = child(node, "block");
  const body = blk ? transformBlock(blk) : { kind: "BlockStmt" as const, stmts: [] };

  // Implicit return: if method has a return type and the last statement is an ExprStmt,
  // wrap it in a ReturnStmt (the reverse parser omits ^ for the last expression)
  if (results.length > 0 && body.stmts.length > 0) {
    const last = body.stmts[body.stmts.length - 1];
    if (last.kind === "ExprStmt") {
      body.stmts[body.stmts.length - 1] = {
        kind: "ReturnStmt",
        values: [(last as IR.IRExprStmt).expr],
        stmtIndex: (last as IR.IRExprStmt).stmtIndex,
      } as IR.IRReturnStmt;
    }
  }

  const decl: IR.IRFuncDecl = {
    kind: "FuncDecl",
    name,
    params,
    results,
    body,
    stmtIndex: si,
  };

  // Store method-level type parameters
  if (methodTypeParams.length > 0) {
    decl.typeParams = methodTypeParams;
  }

  // Store modifiers as metadata via receiver hack (the emitter checks this)
  if (modList.length > 0) {
    (decl as any).modifiers = modList;
  }

  return decl;
}

// ─── Constructor declaration ──────────────────────────────────────────────────

function transformConstructorDecl(node: CstNode): IR.IRFuncDecl {
  const si = nextStmtIndex();
  const mods = child(node, "modifiers");
  const modList = mods ? transformModifiers(mods) : [];

  const pl = child(node, "paramList");
  const params = pl ? transformParamList(pl) : [];

  const blk = child(node, "block");
  const body = blk ? transformBlock(blk) : { kind: "BlockStmt" as const, stmts: [] };

  const decl: IR.IRFuncDecl = {
    kind: "FuncDecl",
    name: "<init>",
    params,
    results: [],
    body,
    stmtIndex: si,
  };

  if (modList.length > 0) {
    (decl as any).modifiers = modList;
  }

  return decl;
}

// ─── Record declaration ───────────────────────────────────────────────────────

function transformRecordDecl(
  name: string,
  modifiers: string[],
  typeParams: string[],
  node: CstNode
): IR.Java_RecordDecl {
  const si = nextStmtIndex();

  // Components: paramList inside the parens
  const pl = child(node, "paramList");
  const components = pl ? transformParamList(pl) : [];

  // Interfaces: [Type, Type, ...]
  const typeExprs = children(node, "typeExpr");
  const interfaces: string[] = typeExprs.map(te => typeExprToString(te));

  // Optional record body
  const cb = child(node, "classBody");
  const body = cb ? transformClassBody(cb) : { fields: [], methods: [], constructors: [], innerClasses: [] };

  return {
    kind: "Java_RecordDecl",
    name,
    typeParams,
    components,
    interfaces,
    methods: body.methods,
    stmtIndex: si,
  };
}

// ─── Enum declaration ─────────────────────────────────────────────────────────

function transformEnumDecl(node: CstNode): IR.Java_EnumDecl {
  const si = nextStmtIndex();
  const mods = child(node, "modifiers");
  const modList = mods ? transformModifiers(mods) : [];
  const name = tok(node, "Ident") || "";

  // Enum values
  const ev = child(node, "enumValues");
  const values = ev ? transformEnumValues(ev) : [];

  // Optional class body (after ';')
  const cb = child(node, "classBody");
  const body = cb ? transformClassBody(cb) : { fields: [], methods: [], constructors: [], innerClasses: [] };

  return {
    kind: "Java_EnumDecl",
    name,
    values,
    fields: body.fields,
    methods: body.methods,
    constructors: body.constructors,
    interfaces: [],
    stmtIndex: si,
  };
}

function transformEnumValues(node: CstNode): { name: string; args: IR.IRExpr[] }[] {
  return children(node, "enumValue").map(ev => {
    const name = tok(ev, "Ident") || "";
    const el = child(ev, "exprList");
    const args = el ? children(el, "expr").map(transformExpr) : [];
    return { name, args };
  });
}

// ─── Interface declaration ────────────────────────────────────────────────────

function transformInterfaceDecl(
  name: string,
  modifiers: string[],
  typeParams: string[],
  node: CstNode
): IR.IRInterfaceDecl | IR.Java_SealedInterfaceDecl {
  const si = nextStmtIndex();

  const ib = child(node, "interfaceBody");
  if (!ib) {
    // Empty interface
    return {
      kind: "InterfaceDecl",
      name,
      methods: [],
      stmtIndex: si,
    };
  }

  // Check for sealed interface: starts with '+' (permits)
  if (tok(ib, "Plus")) {
    const idents = tokAll(ib, "Ident");
    const permits = idents;

    // Optional method signatures
    const msl = child(ib, "methodSigList") || child(ib, "methodSigList", 1);
    const methods = msl ? transformMethodSigList(msl) : [];

    return {
      kind: "Java_SealedInterfaceDecl",
      name,
      typeParams,
      permits,
      methods,
      stmtIndex: si,
    };
  }

  // Regular interface: method signatures
  const msl = child(ib, "methodSigList") || child(ib, "methodSigList", 1);
  const methods = msl ? transformMethodSigList(msl) : [];

  // Append type parameters to name (e.g., Validator<T>)
  const fullName = typeParams.length > 0 ? `${name}<${typeParams.join(", ")}>` : name;

  return {
    kind: "InterfaceDecl",
    name: fullName,
    methods,
    stmtIndex: si,
  };
}

function transformMethodSigList(node: CstNode): IR.IRMethodSig[] {
  return children(node, "methodSig").map(ms => {
    const mods = child(ms, "modifiers");
    const name = tok(ms, "Ident") || "";
    const pl = child(ms, "paramList");
    const params = pl ? transformParamList(pl) : [];
    const te = child(ms, "typeExpr");
    const results: IR.IRType[] = te ? [transformTypeExpr(te)] : [];

    // Check for default method body
    const blk = child(ms, "block");
    const sig: IR.IRMethodSig = { name, params, results };
    if (blk) {
      // Store default method body as metadata
      (sig as any).defaultBody = transformBlock(blk);
    }
    if (mods) {
      (sig as any).modifiers = transformModifiers(mods);
    }
    return sig;
  });
}

// ─── Top-level function or var declaration ────────────────────────────────────

function transformTopFuncOrVarDecl(node: CstNode): IR.IRNode | null {
  // varDeclStmt
  const vd = child(node, "varDeclStmt");
  if (vd) return transformVarDeclStmt(vd);

  // Function declaration: modifiers? typeParams? Ident '(' paramList ')' ('->' type)? block
  const name = tok(node, "Ident");
  if (name) {
    const si = nextStmtIndex();
    const mods = child(node, "modifiers");
    const modList = mods ? transformModifiers(mods) : [];

    // Method-level type parameters (e.g., <T> before method name)
    const tp = child(node, "typeParams");
    const methodTypeParams = tp ? transformTypeParams(tp) : [];

    const pl = child(node, "paramList");
    const params = pl ? transformParamList(pl) : [];

    const te = child(node, "typeExpr");
    const results: IR.IRType[] = te ? [transformTypeExpr(te)] : [];

    const blk = child(node, "block");
    const body = blk ? transformBlock(blk) : { kind: "BlockStmt" as const, stmts: [] };

    // Implicit return: if function has a return type and the last statement is an ExprStmt,
    // wrap it in a ReturnStmt
    if (results.length > 0 && body.stmts.length > 0) {
      const last = body.stmts[body.stmts.length - 1];
      if (last.kind === "ExprStmt") {
        body.stmts[body.stmts.length - 1] = {
          kind: "ReturnStmt",
          values: [(last as IR.IRExprStmt).expr],
          stmtIndex: (last as IR.IRExprStmt).stmtIndex,
        } as IR.IRReturnStmt;
      }
    }

    const decl: IR.IRFuncDecl = {
      kind: "FuncDecl",
      name,
      params,
      results,
      body,
      stmtIndex: si,
    };

    if (methodTypeParams.length > 0) {
      decl.typeParams = methodTypeParams;
    }

    if (modList.length > 0) {
      (decl as any).modifiers = modList;
    }

    return decl;
  }

  return null;
}

// ─── Parameter list (Java order: Type name) ───────────────────────────────────

function transformParamList(node: CstNode): IR.IRParam[] {
  return children(node, "param").map(transformParam);
}

function transformParam(p: CstNode): IR.IRParam {
  const te = child(p, "typeExpr");
  const identToken = tok(p, "Ident");

  if (te && identToken) {
    // Java order: typeExpr Ident — type before name
    const type = transformTypeExpr(te);
    return { name: identToken, type };
  }

  if (te && !identToken) {
    // typeExpr only — it's actually the parameter name (type inferred)
    const nameFromType = typeExprToString(te);
    return { name: nameFromType, type: IR.simpleType("var") };
  }

  return { name: "_", type: IR.simpleType("var") };
}

// Lambda parameters: same structure as regular params
function transformLambdaParams(node: CstNode): IR.IRParam[] {
  return children(node, "lambdaParam").map(lp => {
    const te = child(lp, "typeExpr");
    const identToken = tok(lp, "Ident");

    if (te && identToken) {
      return { name: identToken, type: transformTypeExpr(te) };
    }
    if (te && !identToken) {
      return { name: typeExprToString(te), type: IR.simpleType("var") };
    }
    return { name: "_", type: IR.simpleType("var") };
  });
}

// ─── Type expressions ─────────────────────────────────────────────────────────

function transformTypeExpr(node: CstNode): IR.IRType {
  const baseName = typeExprToString(node);
  return IR.simpleType(baseName);
}

function typeExprToString(node: CstNode): string {
  // baseType child
  const bt = child(node, "baseType");
  let name = "";
  if (bt) {
    const idents = tokAll(bt, "Ident");
    name = idents.join(".");
  } else {
    // Fallback: direct idents on the typeExpr node
    const idents = tokAll(node, "Ident");
    name = idents.join(".");
  }

  // Type arguments: <T, U>
  const ta = child(node, "typeArgs");
  if (ta) {
    const entries = children(ta, "typeArgEntry");
    if (entries.length > 0) {
      const args = entries.map(transformTypeArgEntry);
      name += "<" + args.join(", ") + ">";
    } else {
      // Diamond operator: <>
      name += "<>";
    }
  }

  // Array suffixes: []
  const lbCount = tokCount(node, "LBrack");
  for (let i = 0; i < lbCount; i++) {
    name += "[]";
  }

  return name || "Object";
}

function transformTypeArgEntry(node: CstNode): string {
  // Wildcard: ? extends/super Type
  if (tok(node, "Question")) {
    const te = child(node, "typeExpr");
    if (te) {
      const bound = typeExprToString(te);
      if (tok(node, "Colon")) {
        return "? extends " + bound;
      }
      if (tok(node, "Super")) {
        return "? super " + bound;
      }
      return "? extends " + bound;
    }
    return "?";
  }

  // Regular type
  const te = child(node, "typeExpr");
  if (te) return typeExprToString(te);
  return "Object";
}

// ─── Block ────────────────────────────────────────────────────────────────────

function transformBlock(node: CstNode): IR.IRBlockStmt {
  const sl = child(node, "stmtList");
  if (sl) return transformStmtList(sl);
  return { kind: "BlockStmt", stmts: [] };
}

function transformStmtList(node: CstNode): IR.IRBlockStmt {
  const stmts: (IR.IRNode | IR.IRExprStmt)[] = [];
  for (const s of children(node, "stmt")) {
    const transformed = transformStmt(s);
    if (transformed) stmts.push(transformed);
  }
  return { kind: "BlockStmt", stmts };
}

// ─── Statement dispatch ───────────────────────────────────────────────────────

function transformStmt(node: CstNode): IR.IRNode | null {
  const c = (name: string) => child(node, name);

  if (c("ifStmt")) return transformIfStmt(c("ifStmt")!);
  if (c("forStmt")) return transformForStmt(c("forStmt")!);
  if (c("whileStmt")) return transformWhileStmt(c("whileStmt")!);
  if (c("tryCatchStmt")) return transformTryCatch(c("tryCatchStmt")!);
  if (c("tryWithStmt")) return transformTryWith(c("tryWithStmt")!);
  if (c("throwStmt")) return transformThrowStmt(c("throwStmt")!);
  if (c("returnStmt")) return transformReturnStmt(c("returnStmt")!);
  if (c("branchStmt")) return transformBranchStmt(c("branchStmt")!);
  if (c("varDeclStmt")) return transformVarDeclStmt(c("varDeclStmt")!);
  if (c("yieldStmt")) return transformYieldStmt(c("yieldStmt")!);
  if (c("simpleStmt")) return transformSimpleStmt(c("simpleStmt")!);

  return null;
}

// ─── If statement ─────────────────────────────────────────────────────────────

function transformIfStmt(node: CstNode): IR.IRIfStmt {
  const si = nextStmtIndex();
  const exprs = children(node, "expr");
  const cond = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident" as const, name: "true" };

  // Body: first block
  const blocks = children(node, "block");
  const body = blocks[0] ? transformBlock(blocks[0]) : { kind: "BlockStmt" as const, stmts: [] };

  let else_: IR.IRNode | undefined;
  // Recursive else-if
  const elseIf = children(node, "ifStmt");
  if (elseIf.length > 0) {
    else_ = transformIfStmt(elseIf[0]);
  } else if (blocks.length > 1) {
    // else block
    else_ = transformBlock(blocks[1]);
  }

  return { kind: "IfStmt", cond, body, else_, stmtIndex: si };
}

// ─── For statement ────────────────────────────────────────────────────────────

function transformForStmt(node: CstNode): IR.IRForStmt | IR.Java_EnhancedFor {
  const si = nextStmtIndex();

  // Determine which variant based on CST children
  const idents = tokAll(node, "Ident");
  const typeExprs = children(node, "typeExpr");
  const exprs = children(node, "expr");
  const blocks = children(node, "block");
  const body = blocks.length > 0 ? transformBlock(blocks[blocks.length - 1]) : { kind: "BlockStmt" as const, stmts: [] };

  // Check for enhanced for-each: has Colon token
  if (tok(node, "Colon")) {
    // Enhanced for-each
    // Case 1: typed — typeExpr Ident ':' expr
    // Case 2: untyped — Ident ':' expr
    let varName: string;
    let varType: IR.IRType | undefined;
    let iterable: IR.IRExpr;

    if (typeExprs.length > 0 && idents.length > 0) {
      // Typed: typeExpr Ident ':' expr
      varType = transformTypeExpr(typeExprs[0]);
      varName = idents[0];
      iterable = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident", name: "_" };
    } else if (idents.length > 0) {
      // Untyped: Ident ':' expr
      varName = idents[0];
      iterable = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident", name: "_" };
    } else {
      varName = "_";
      iterable = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident", name: "_" };
    }

    return {
      kind: "Java_EnhancedFor",
      varName,
      varType,
      iterable,
      body,
      stmtIndex: si,
    };
  }

  // Traditional for: (init ; cond ; post)
  const fi = child(node, "forInit");
  const init = fi ? transformForInit(fi) : undefined;

  // Condition: the expr directly in forStmt (not inside forInit/forPost)
  const cond = exprs.length > 0 ? transformExpr(exprs[0]) : undefined;

  const fp = child(node, "forPost");
  const post = fp ? transformForPost(fp) : undefined;

  return { kind: "ForStmt", init, cond, post, body, stmtIndex: si };
}

function transformForInit(node: CstNode): IR.IRNode | undefined {
  const vd = child(node, "varDeclStmt");
  if (vd) return transformVarDeclStmt(vd);
  const ss = child(node, "simpleStmt");
  if (ss) return transformSimpleStmt(ss);
  return undefined;
}

function transformForPost(node: CstNode): IR.IRNode | undefined {
  const ss = child(node, "simpleStmt");
  if (ss) return transformSimpleStmt(ss);
  return undefined;
}

// ─── While statement ──────────────────────────────────────────────────────────

function transformWhileStmt(node: CstNode): IR.IRForStmt {
  const si = nextStmtIndex();
  const exprs = children(node, "expr");
  const cond = exprs[0] ? transformExpr(exprs[0]) : undefined;
  const blk = child(node, "block");
  const body = blk ? transformBlock(blk) : { kind: "BlockStmt" as const, stmts: [] };

  // While is just a for loop with only a condition
  return { kind: "ForStmt", cond, body, stmtIndex: si };
}

// ─── Try-catch ────────────────────────────────────────────────────────────────

function transformTryCatch(node: CstNode): IR.Java_TryCatch {
  const si = nextStmtIndex();

  // Try body: first block
  const blocks = children(node, "block");
  const body = blocks[0] ? transformBlock(blocks[0]) : { kind: "BlockStmt" as const, stmts: [] };

  // Catch clauses
  const catchClauses = children(node, "catchClause");
  const catches: IR.Java_CatchClause[] = catchClauses.map(cc => {
    const typeExprs = children(cc, "typeExpr");
    // Multi-catch: Type1 | Type2 | ...
    const exceptionTypes = typeExprs.map(te => typeExprToString(te));
    const exceptionType = IR.simpleType(exceptionTypes.join(" | "));
    const name = tok(cc, "Ident") || "e";
    const catchBlk = child(cc, "block");
    const catchBody = catchBlk ? transformBlock(catchBlk) : { kind: "BlockStmt" as const, stmts: [] };
    return { exceptionType, name, body: catchBody };
  });

  // Finally: block after '!' token
  let finallyBody: IR.IRBlockStmt | undefined;
  // The finally block is the last block if there's a Bang token
  if (tok(node, "Bang") && blocks.length > 1) {
    finallyBody = transformBlock(blocks[blocks.length - 1]);
  }

  return {
    kind: "Java_TryCatch",
    body,
    catches,
    finallyBody,
    stmtIndex: si,
  };
}

// ─── Try-with-resources ───────────────────────────────────────────────────────

function transformTryWith(node: CstNode): IR.Java_TryCatch {
  const si = nextStmtIndex();

  // Resources
  const resources: IR.IRNode[] = [];
  for (const res of children(node, "twResource")) {
    const varName = tok(res, "Ident") || tok(res, "Ident", 1) || "_";
    const te = child(res, "typeExpr");
    const type = te ? transformTypeExpr(te) : undefined;
    const expr = child(res, "expr") || child(res, "expr", 1);
    const value = expr ? transformExpr(expr) : undefined;

    // Use the last ident as the name (could be first or second depending on var vs typed)
    const idents = tokAll(res, "Ident");
    const name = idents[idents.length - 1] || varName;

    resources.push({
      kind: "VarDecl",
      name,
      type,
      value,
      stmtIndex: nextStmtIndex(),
    } as IR.IRVarDecl);
  }

  // Body: first block
  const blocks = children(node, "block");
  const body = blocks[0] ? transformBlock(blocks[0]) : { kind: "BlockStmt" as const, stmts: [] };

  // Catch clauses
  const catchClauses = children(node, "catchClause");
  const catches: IR.Java_CatchClause[] = catchClauses.map(cc => {
    const typeExprs = children(cc, "typeExpr");
    const exceptionTypes = typeExprs.map(te => typeExprToString(te));
    const exceptionType = IR.simpleType(exceptionTypes.join(" | "));
    const name = tok(cc, "Ident") || "e";
    const catchBlk = child(cc, "block");
    const catchBody = catchBlk ? transformBlock(catchBlk) : { kind: "BlockStmt" as const, stmts: [] };
    return { exceptionType, name, body: catchBody };
  });

  // Finally
  let finallyBody: IR.IRBlockStmt | undefined;
  if (tok(node, "Bang") && blocks.length > 1) {
    finallyBody = transformBlock(blocks[blocks.length - 1]);
  }

  return {
    kind: "Java_TryCatch",
    body,
    catches,
    finallyBody,
    resources,
    stmtIndex: si,
  };
}

// ─── Throw statement ──────────────────────────────────────────────────────────

function transformThrowStmt(node: CstNode): IR.Java_ThrowStmt {
  const si = nextStmtIndex();
  const expr = child(node, "expr");
  const throwExpr = expr ? transformExpr(expr) : { kind: "Ident" as const, name: "null" };

  // If the throw expression is a call to an uppercase name, wrap in Java_NewExpr
  // (throw without new elimination)
  return {
    kind: "Java_ThrowStmt",
    expr: maybeWrapNewExpr(throwExpr),
    stmtIndex: si,
  };
}

// ─── Return statement ─────────────────────────────────────────────────────────

function transformReturnStmt(node: CstNode): IR.IRReturnStmt {
  const expr = child(node, "expr");
  const values = expr ? [transformExpr(expr)] : [];
  return { kind: "ReturnStmt", values, stmtIndex: nextStmtIndex() };
}

// ─── Yield statement ──────────────────────────────────────────────────────────

function transformYieldStmt(node: CstNode): IR.IRReturnStmt {
  // Yield is used inside switch expression blocks, emit as a special return
  const expr = child(node, "expr");
  const values = expr ? [transformExpr(expr)] : [];
  const stmt: IR.IRReturnStmt = { kind: "ReturnStmt", values, stmtIndex: nextStmtIndex() };
  (stmt as any).isYield = true;
  return stmt;
}

// ─── Branch statement ─────────────────────────────────────────────────────────

function transformBranchStmt(node: CstNode): IR.IRBranchStmt {
  let t: "break" | "continue" = "break";
  if (tok(node, "Continue")) t = "continue";
  return { kind: "BranchStmt", tok: t, stmtIndex: nextStmtIndex() };
}

// ─── Var declaration statement ────────────────────────────────────────────────

function transformVarDeclStmt(node: CstNode): IR.IRVarDecl {
  const name = tok(node, "Ident") || "";
  const expr = child(node, "expr");
  const value = expr ? transformExpr(expr) : undefined;
  // Optional type annotation: var name:Type = expr
  const te = child(node, "typeExpr");
  const type = te ? transformTypeExpr(te) : undefined;
  return { kind: "VarDecl", name, type, value, stmtIndex: nextStmtIndex() };
}

// ─── Simple statement ─────────────────────────────────────────────────────────

function transformSimpleStmt(node: CstNode): IR.IRNode {
  const ae = child(node, "assignExpr");
  if (ae) return transformAssignExpr(ae);
  return { kind: "ExprStmt", expr: { kind: "Ident", name: "_" }, stmtIndex: nextStmtIndex() };
}

function transformAssignExpr(node: CstNode): IR.IRNode {
  const si = nextStmtIndex();
  const exprs = children(node, "expr");

  // Short declaration: expr := expr
  if (tok(node, "ShortDecl")) {
    const lhs = exprs[0] ? exprToString(transformExpr(exprs[0])) : "_";
    const rhs = exprs[1] ? transformExpr(exprs[1]) : { kind: "Ident" as const, name: "null" };
    return { kind: "ShortDeclStmt", names: [lhs], values: [rhs], stmtIndex: si } as IR.IRShortDeclStmt;
  }

  // Assignment operators
  const assignOps: [string, string][] = [
    ["Assign", "="], ["PlusAssign", "+="], ["MinusAssign", "-="],
    ["MulAssign", "*="], ["DivAssign", "/="], ["ModAssign", "%="],
  ];
  for (const [tokenName, opStr] of assignOps) {
    if (tok(node, tokenName)) {
      const lhs = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident" as const, name: "_" };
      // Recursive assignExpr for chained assignment
      const innerAe = child(node, "assignExpr");
      if (innerAe) {
        const rhsNode = transformAssignExpr(innerAe);
        // Extract the expression from the inner node
        let rhs: IR.IRExpr;
        if (rhsNode.kind === "ExprStmt") {
          rhs = (rhsNode as IR.IRExprStmt).expr;
        } else if (rhsNode.kind === "AssignStmt") {
          // Chained assignment: wrap inner assignment as expression
          rhs = assignStmtToExpr(rhsNode as IR.IRAssignStmt);
        } else {
          rhs = exprs[1] ? transformExpr(exprs[1]) : { kind: "Ident" as const, name: "null" };
        }
        return { kind: "AssignStmt", lhs: [lhs], rhs: [rhs], op: opStr, stmtIndex: si } as IR.IRAssignStmt;
      }
      const rhs = exprs[1] ? transformExpr(exprs[1]) : { kind: "Ident" as const, name: "null" };
      return { kind: "AssignStmt", lhs: [lhs], rhs: [rhs], op: opStr, stmtIndex: si } as IR.IRAssignStmt;
    }
  }

  // Post-increment/decrement
  if (tok(node, "Inc")) {
    const x = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident" as const, name: "_" };
    return { kind: "IncDecStmt", x, op: "++", stmtIndex: si } as IR.IRIncDecStmt;
  }
  if (tok(node, "Dec")) {
    const x = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident" as const, name: "_" };
    return { kind: "IncDecStmt", x, op: "--", stmtIndex: si } as IR.IRIncDecStmt;
  }

  // Expression statement
  if (exprs.length > 0) {
    return { kind: "ExprStmt", expr: transformExpr(exprs[0]), stmtIndex: si } as IR.IRExprStmt;
  }

  return { kind: "ExprStmt", expr: { kind: "Ident", name: "_" }, stmtIndex: si } as IR.IRExprStmt;
}

function assignStmtToExpr(stmt: IR.IRAssignStmt): IR.IRExpr {
  // Represent chained assignment a = b = c as a binary expression
  if (stmt.lhs.length === 1 && stmt.rhs.length === 1) {
    return { kind: "BinaryExpr", left: stmt.lhs[0], op: stmt.op, right: stmt.rhs[0] };
  }
  return stmt.lhs[0] || { kind: "Ident", name: "_" };
}

// ─── Expression dispatch ──────────────────────────────────────────────────────

function transformExpr(node: CstNode): IR.IRExpr {
  const name = node.name;
  switch (name) {
    case "expr": {
      const te = child(node, "ternaryExpr");
      return te ? transformExpr(te) : { kind: "Ident", name: "_" };
    }
    case "ternaryExpr":
      return transformTernaryExpr(node);
    case "orExpr":
      return transformBinExprChain(node, "andExpr", "LogOr", "||");
    case "andExpr":
      return transformBinExprChain(node, "compareExpr", "LogAnd", "&&");
    case "compareExpr":
      return transformCompareExpr(node);
    case "addExpr":
      return transformAddExpr(node);
    case "mulExpr":
      return transformMulExpr(node);
    case "unaryExpr":
      return transformUnaryExpr(node);
    case "postfixExpr":
      return transformPostfixExpr(node);
    case "primaryExpr":
      return transformPrimaryExpr(node);
    default:
      return { kind: "Ident", name: "_unknown_" + name };
  }
}

// ─── Ternary expression ───────────────────────────────────────────────────────

function transformTernaryExpr(node: CstNode): IR.IRExpr {
  const orExpr = child(node, "orExpr");
  let result = orExpr ? transformExpr(orExpr) : { kind: "Ident" as const, name: "_" };

  // Process ternary, error propagation, and error wrapping suffixes
  const questionTokens = tokTokens(node, "Question");
  const questionBangTokens = tokTokens(node, "QuestionBang");
  const stringLits = tokTokens(node, "StringLit");
  const exprs = children(node, "expr");
  const colonTokens = tokTokens(node, "Colon");

  // Collect all operations with their offsets to process left-to-right
  const ops: { type: string; offset: number }[] = [];
  for (const q of questionTokens) {
    ops.push({ type: "question", offset: q.startOffset });
  }
  for (const qb of questionBangTokens) {
    ops.push({ type: "questionBang", offset: qb.startOffset });
  }
  ops.sort((a, b) => a.offset - b.offset);

  let exprIdx = 0;
  let qbIdx = 0;

  for (const op of ops) {
    if (op.type === "questionBang") {
      // Error wrapping: expr?! "msg"
      const msg = stringLits[qbIdx]?.image || '""';
      result = { kind: "ErrorPropExpr", x: result, wrap: msg.slice(1, -1) } as IR.IRErrorPropExpr;
      qbIdx++;
    } else if (op.type === "question") {
      // Check if this is a ternary (has matching ':' and expressions)
      if (exprIdx + 1 < exprs.length) {
        const ifTrue = transformExpr(exprs[exprIdx]);
        const ifFalse = transformExpr(exprs[exprIdx + 1]);
        result = { kind: "Java_TernaryExpr", cond: result, ifTrue, ifFalse } as IR.Java_TernaryExpr;
        exprIdx += 2;
      } else {
        // Standalone '?' — error propagation
        result = { kind: "ErrorPropExpr", x: result } as IR.IRErrorPropExpr;
      }
    }
  }

  return result;
}

// ─── Binary expression chain ──────────────────────────────────────────────────

function transformBinExprChain(node: CstNode, childRule: string, opToken: string, opStr: string): IR.IRExpr {
  const operands = children(node, childRule);
  if (operands.length === 0) return { kind: "Ident", name: "_" };
  let result = transformExpr(operands[0]);
  for (let i = 1; i < operands.length; i++) {
    result = { kind: "BinaryExpr", left: result, op: opStr, right: transformExpr(operands[i]) };
  }
  return result;
}

// ─── Compare expression ──────────────────────────────────────────────────────

function transformCompareExpr(node: CstNode): IR.IRExpr {
  const operands = children(node, "addExpr");
  if (operands.length === 1) return transformExpr(operands[0]);
  if (operands.length < 2) return { kind: "Ident", name: "_" };

  const ops = ["Eq", "Neq", "Lt", "Gt", "Leq", "Geq"];
  const opMap: Record<string, string> = { Eq: "==", Neq: "!=", Lt: "<", Gt: ">", Leq: "<=", Geq: ">=" };
  for (const op of ops) {
    if (tok(node, op)) {
      return { kind: "BinaryExpr", left: transformExpr(operands[0]), op: opMap[op], right: transformExpr(operands[1]) };
    }
  }
  return transformExpr(operands[0]);
}

// ─── Additive expression ──────────────────────────────────────────────────────

function transformAddExpr(node: CstNode): IR.IRExpr {
  const operands = children(node, "mulExpr");
  if (operands.length === 0) return { kind: "Ident", name: "_" };
  let result = transformExpr(operands[0]);

  // Collect all operator tokens, sort by position
  const opTokens: IToken[] = [
    ...tokTokens(node, "Plus"),
    ...tokTokens(node, "Minus"),
    ...tokTokens(node, "Pipe"),
    ...tokTokens(node, "Caret"),
  ];
  opTokens.sort((a, b) => a.startOffset - b.startOffset);

  for (let i = 1; i < operands.length; i++) {
    const op = opTokens[i - 1]?.image || "+";
    result = { kind: "BinaryExpr", left: result, op, right: transformExpr(operands[i]) };
  }
  return result;
}

// ─── Multiplicative expression ────────────────────────────────────────────────

function transformMulExpr(node: CstNode): IR.IRExpr {
  const operands = children(node, "unaryExpr");
  if (operands.length === 0) return { kind: "Ident", name: "_" };
  let result = transformExpr(operands[0]);

  // Collect operator tokens
  const opTokens: IToken[] = [
    ...tokTokens(node, "Star"),
    ...tokTokens(node, "Slash"),
    ...tokTokens(node, "Percent"),
    ...tokTokens(node, "Shl"),
    ...tokTokens(node, "Amp"),
  ];

  // Handle '>>' (two adjacent Gt tokens)
  const gtTokens = tokTokens(node, "Gt");
  // Pair adjacent Gt tokens as '>>'
  for (let i = 0; i < gtTokens.length - 1; i += 2) {
    // Use the first Gt of each pair as the operator position
    opTokens.push({
      ...gtTokens[i],
      image: ">>",
    } as IToken);
  }

  opTokens.sort((a, b) => a.startOffset - b.startOffset);

  for (let i = 1; i < operands.length; i++) {
    const op = opTokens[i - 1]?.image || "*";
    result = { kind: "BinaryExpr", left: result, op, right: transformExpr(operands[i]) };
  }
  return result;
}

// ─── Unary expression ─────────────────────────────────────────────────────────

function transformUnaryExpr(node: CstNode): IR.IRExpr {
  // Cast expression: (Type) expr
  const typeExprs = children(node, "typeExpr");
  const unaryChildren = children(node, "unaryExpr");
  if (typeExprs.length > 0 && unaryChildren.length > 0 && tok(node, "LParen")) {
    const castType = transformTypeExpr(typeExprs[0]);
    const inner = transformExpr(unaryChildren[0]);
    return { kind: "Java_CastExpr", type: castType, expr: inner } as IR.Java_CastExpr;
  }

  // Prefix operators: +, -, !, ~
  if (unaryChildren.length > 0) {
    for (const [tokenName, opStr] of [["Plus", "+"], ["Minus", "-"], ["Bang", "!"], ["Tilde", "~"]] as [string, string][]) {
      if (tok(node, tokenName)) {
        return { kind: "UnaryExpr", op: opStr, x: transformExpr(unaryChildren[0]) } as IR.IRUnaryExpr;
      }
    }

    // Pre-increment/decrement
    if (tok(node, "Inc")) {
      const inner = transformExpr(unaryChildren[0]);
      return { kind: "UnaryExpr", op: "++", x: inner } as IR.IRUnaryExpr;
    }
    if (tok(node, "Dec")) {
      const inner = transformExpr(unaryChildren[0]);
      return { kind: "UnaryExpr", op: "--", x: inner } as IR.IRUnaryExpr;
    }
  }

  // Fallthrough to postfixExpr
  const pf = child(node, "postfixExpr");
  if (pf) return transformExpr(pf);

  return { kind: "Ident", name: "_" };
}

// ─── Postfix expression ──────────────────────────────────────────────────────

function transformPostfixExpr(node: CstNode): IR.IRExpr {
  const primary = child(node, "primaryExpr");
  let result: IR.IRExpr = primary ? transformExpr(primary) : { kind: "Ident", name: "_" };

  // Collect all postfix operations with their token offsets for left-to-right processing
  const ops: { type: string; offset: number }[] = [];

  const lparens = tokTokens(node, "LParen");
  for (const lp of lparens) {
    ops.push({ type: "call", offset: lp.startOffset });
  }

  const lbracks = tokTokens(node, "LBrack");
  for (const lb of lbracks) {
    ops.push({ type: "index", offset: lb.startOffset });
  }

  const dots = tokTokens(node, "Dot");
  for (const d of dots) {
    ops.push({ type: "selector", offset: d.startOffset });
  }

  const methodRefs = tokTokens(node, "MethodRef");
  for (const mr of methodRefs) {
    ops.push({ type: "methodRef", offset: mr.startOffset });
  }

  const isTokens = tokTokens(node, "Is");
  for (const is_ of isTokens) {
    ops.push({ type: "instanceof", offset: is_.startOffset });
  }

  const pipes = tokTokens(node, "Pipe");
  for (const p of pipes) {
    ops.push({ type: "pipe", offset: p.startOffset });
  }

  const incTokens = tokTokens(node, "Inc");
  for (const inc of incTokens) {
    ops.push({ type: "postInc", offset: inc.startOffset });
  }

  const decTokens = tokTokens(node, "Dec");
  for (const dec of decTokens) {
    ops.push({ type: "postDec", offset: dec.startOffset });
  }

  ops.sort((a, b) => a.offset - b.offset);

  // Track indices into various child arrays
  let callIdx = 0;
  let indexIdx = 0;
  let selectorIdx = 0;
  let methodRefIdx = 0;
  let instanceofIdx = 0;
  let pipeIdx = 0;

  const exprLists = children(node, "exprList");
  const selectorIdents = tokTokens(node, "Ident");
  const typeExprs = children(node, "typeExpr");
  const exprs = children(node, "expr");

  // Build a map from call index to exprList, matching by token offset
  const rparens = tokTokens(node, "RParen");
  const callToExprListMap = new Map<number, CstNode>();
  {
    let ciTemp = 0;
    for (const op of ops) {
      if (op.type === "call") {
        const rparen = rparens[ciTemp];
        // An exprList belongs to this call if it starts after the LParen and before the RParen
        for (const el of exprLists) {
          const elTokens = (el.children.expr as CstNode[]) || [];
          if (elTokens.length > 0) {
            // Get the first token offset of the first expr in this exprList
            const firstExprOffset = getFirstTokenOffset(elTokens[0]);
            if (firstExprOffset > op.offset && rparen && firstExprOffset < rparen.startOffset) {
              callToExprListMap.set(ciTemp, el);
              break;
            }
          }
        }
        ciTemp++;
      }
    }
  }

  // Pipe operation keywords
  const pipeOps = tokTokens(node, "Mp")
    .concat(tokTokens(node, "Flt"))
    .concat(tokTokens(node, "Fm"))
    .concat(tokTokens(node, "Red"))
    .concat(tokTokens(node, "Ord"))
    .concat(tokTokens(node, "Fe"))
    .concat(tokTokens(node, "Col"));
  pipeOps.sort((a, b) => a.startOffset - b.startOffset);

  // New keyword token (for method references like ::new)
  const newTokens = tokTokens(node, "New");
  let newIdx = 0;

  // Collect typeArgs children (for type witnesses like .<String,Integer>method())
  const typeArgsNodes = children(node, "typeArgs");
  // Build a set mapping selector index → typeArgs strings
  const selectorTypeArgsMap = new Map<number, string[]>();
  if (typeArgsNodes.length > 0) {
    let selTemp = 0;
    for (const op of ops) {
      if (op.type === "selector") {
        // Check if any typeArgs node falls between this dot and the next ident
        const dotOffset = op.offset;
        const identToken = selectorIdents[selTemp];
        if (identToken) {
          for (const ta of typeArgsNodes) {
            const taOffset = getFirstTokenOffset(ta);
            if (taOffset > dotOffset && taOffset < identToken.startOffset) {
              // This typeArgs belongs to this selector
              const entries = children(ta, "typeArgEntry");
              if (entries.length > 0) {
                selectorTypeArgsMap.set(selTemp, entries.map(transformTypeArgEntry));
              }
              break;
            }
          }
        }
        selTemp++;
      }
    }
  }

  for (const op of ops) {
    switch (op.type) {
      case "call": {
        // Function call: '(' exprList? ')'
        // Use offset-based mapping to correctly match exprLists to call operations
        const el = callToExprListMap.get(callIdx);
        const args = el ? children(el, "expr").map(transformExpr) : [];

        // Check for 'new' elimination: if the function is an uppercase identifier, treat as Java_NewExpr
        if (result.kind === "Ident" && isUpperCase(result.name)) {
          const alias = resolveAlias(result.name);
          if (alias && alias.isConstructor) {
            // Constructor alias like Sb → new StringBuilder
            const javaName = alias.java.replace("new ", "");
            result = { kind: "Java_NewExpr", type: IR.simpleType(javaName), args } as IR.Java_NewExpr;
          } else if (alias) {
            // Regular alias expansion
            result = expandAliasToExpr(alias);
            result = { kind: "CallExpr", func: result, args } as IR.IRCallExpr;
          } else {
            // Uppercase name without 'new' keyword → Java_NewExpr (new elimination)
            result = { kind: "Java_NewExpr", type: IR.simpleType(result.name), args } as IR.Java_NewExpr;
          }
        } else if (result.kind === "Ident") {
          // Check for aliases on lowercase identifiers
          const alias = resolveAlias(result.name);
          if (alias) {
            result = expandAliasToExpr(alias);
            result = { kind: "CallExpr", func: result, args } as IR.IRCallExpr;
          } else {
            result = { kind: "CallExpr", func: result, args } as IR.IRCallExpr;
          }
        } else if (result.kind === "SelectorExpr") {
          // Check for generic type after identifier: e.g., ArrayList<String>()
          const callExpr = { kind: "CallExpr", func: result, args } as IR.IRCallExpr;
          // Transfer type witness args from SelectorExpr to CallExpr
          const selTA = (result as any).javaTypeArgs;
          if (selTA) {
            (callExpr as any).javaTypeArgs = selTA;
            delete (result as any).javaTypeArgs;
          }
          result = callExpr;
        } else {
          result = { kind: "CallExpr", func: result, args } as IR.IRCallExpr;
        }
        callIdx++;
        break;
      }

      case "index": {
        // Index access: '[' expr ']'
        if (exprs.length > indexIdx) {
          result = { kind: "IndexExpr", x: result, index: transformExpr(exprs[indexIdx]) } as IR.IRIndexExpr;
        }
        indexIdx++;
        break;
      }

      case "selector": {
        // Selector: '.' typeArgs? Ident
        if (selectorIdx < selectorIdents.length) {
          const sel = selectorIdents[selectorIdx].image;
          const selectorExpr = { kind: "SelectorExpr", x: result, sel } as IR.IRSelectorExpr;
          // Attach type witness args if present (e.g., .<String,Integer>comparingByValue)
          const selTypeArgs = selectorTypeArgsMap.get(selectorIdx);
          if (selTypeArgs) {
            (selectorExpr as any).javaTypeArgs = selTypeArgs;
          }
          result = selectorExpr;
        }
        selectorIdx++;
        break;
      }

      case "methodRef": {
        // Method reference: '::' Ident or '::' 'new'
        let refName: string;
        if (newIdx < newTokens.length && newTokens[newIdx].startOffset > op.offset) {
          refName = "new";
          newIdx++;
        } else if (selectorIdx < selectorIdents.length) {
          refName = selectorIdents[selectorIdx].image;
          selectorIdx++;
        } else {
          refName = "unknown";
        }
        // Represent method reference as SelectorExpr with "::" prefix on sel
        result = { kind: "SelectorExpr", x: result, sel: "::" + refName } as IR.IRSelectorExpr;
        methodRefIdx++;
        break;
      }

      case "instanceof": {
        // instanceof: 'is' Type Ident?
        const typeExpr = typeExprs[instanceofIdx];
        const checkType = typeExpr ? transformTypeExpr(typeExpr) : IR.simpleType("Object");

        // Optional pattern binding variable — pick up the ident after type
        // Idents for instanceof binding share the selectorIdents array
        // We need to find idents that come after the 'is' token
        let binding: string | undefined;
        // Look for ident tokens after the instanceof type
        for (let si = selectorIdx; si < selectorIdents.length; si++) {
          const identTok = selectorIdents[si];
          if (typeExpr && identTok.startOffset > op.offset) {
            // Check if this ident comes after the type expression
            const typeEnd = typeExpr.location?.endOffset || 0;
            if (identTok.startOffset > typeEnd) {
              binding = identTok.image;
              selectorIdx = si + 1;
              break;
            }
          }
        }

        result = {
          kind: "Java_InstanceofExpr",
          expr: result,
          type: checkType,
          binding,
        } as IR.Java_InstanceofExpr;
        instanceofIdx++;
        break;
      }

      case "pipe": {
        // Pipe: '|' pipeOp '(' exprList? ')'
        if (pipeIdx < pipeOps.length) {
          const pipeOpToken = pipeOps[pipeIdx];
          const pipeOpName = pipeOpToken.image;

          // Get args from the next call's exprList
          // The pipe's '(' ')' are consumed as a call, so we need to grab the right exprList
          callIdx++; // Skip the pipe's parenthesized args
          const pipeExprList = exprLists[callIdx - 1];
          const pipeArgs = pipeExprList ? children(pipeExprList, "expr").map(transformExpr) : [];

          const opMapping: Record<string, string> = {
            mp: "map", flt: "filter", fm: "flatMap",
            red: "reduce", ord: "sorted", fe: "forEach",
            col: "collect",
          };
          const javaOp = opMapping[pipeOpName] || pipeOpName;

          // Model as a PipeExpr
          if (javaOp === "map" || javaOp === "filter") {
            const fn = pipeArgs[0] || { kind: "Ident" as const, name: "_" };
            result = {
              kind: "PipeExpr",
              x: result,
              op: javaOp as "map" | "filter",
              fn,
            } as IR.IRPipeExpr;
          } else {
            // For other pipe ops (flatMap, reduce, sorted, forEach, collect),
            // model as method call on stream
            const selectorExpr: IR.IRSelectorExpr = { kind: "SelectorExpr", x: result, sel: javaOp };
            result = { kind: "CallExpr", func: selectorExpr, args: pipeArgs } as IR.IRCallExpr;
          }
        }
        pipeIdx++;
        break;
      }

      case "postInc": {
        result = { kind: "UnaryExpr", op: "++", x: result } as IR.IRUnaryExpr;
        (result as any).postfix = true;
        break;
      }

      case "postDec": {
        result = { kind: "UnaryExpr", op: "--", x: result } as IR.IRUnaryExpr;
        (result as any).postfix = true;
        break;
      }
    }
  }

  return result;
}

// ─── Primary expression ──────────────────────────────────────────────────────

function transformPrimaryExpr(node: CstNode): IR.IRExpr {
  // Parenthesized expression: '(' expr ')'
  const innerExpr = child(node, "expr");
  if (innerExpr && tok(node, "LParen")) {
    return { kind: "ParenExpr", x: transformExpr(innerExpr) } as IR.IRParenExpr;
  }

  // Lambda: '{' lambdaParams? '|' stmtList '}'
  const lp = child(node, "lambdaParams");
  const sl = child(node, "stmtList");
  if (tok(node, "Pipe")) {
    const params = lp ? transformLambdaParams(lp) : [];
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt" as const, stmts: [] };

    // If body has exactly one statement that is an ExprStmt, use expr form
    if (body.stmts.length === 1 && body.stmts[0].kind === "ExprStmt") {
      return {
        kind: "Java_LambdaExpr",
        params,
        body: (body.stmts[0] as IR.IRExprStmt).expr,
      } as IR.Java_LambdaExpr;
    }
    // If body has exactly one statement that is ReturnStmt with one value, use expr form
    if (body.stmts.length === 1 && body.stmts[0].kind === "ReturnStmt") {
      const ret = body.stmts[0] as IR.IRReturnStmt;
      if (ret.values.length === 1) {
        return {
          kind: "Java_LambdaExpr",
          params,
          body: ret.values[0],
        } as IR.Java_LambdaExpr;
      }
    }

    return {
      kind: "Java_LambdaExpr",
      params,
      body,
    } as IR.Java_LambdaExpr;
  }

  // Array/collection initializer: '{' exprList? '}'
  // When we have LBrace but no Pipe (not lambda) and no New (new Type[]{...} handled below)
  if (tok(node, "LBrace") && !tok(node, "Pipe") && !tok(node, "New")) {
    const allExprs = children(node, "expr");
    const elts = allExprs.map(transformExpr);
    return { kind: "CompositeLit", elts } as IR.IRCompositeLit;
  }

  // Switch expression
  const sw = child(node, "switchStmt");
  if (sw) return transformSwitchExpr(sw);

  // Explicit 'new': new Type(args) or new Type[size] or new Type[]{...}
  if (tok(node, "New")) {
    const te = child(node, "typeExpr");
    const newType = te ? transformTypeExpr(te) : IR.simpleType("Object");
    // Check for array creation: new Type[size]
    const lbracks = tokTokens(node, "LBrack");

    // If there's a LBrack after the type, it's array creation with size(s)
    if (lbracks.length > 0) {
      const arrayExpr = children(node, "expr");
      // Count bracket pairs (includes both [size] and [] pairs)
      const rbrackCount = tokCount(node, "RBrack");
      const dimCount = Math.max(1, Math.floor(rbrackCount));
      // Build nested array type: int + [][] → int[][]
      let typeSuffix = "";
      for (let d = 0; d < dimCount; d++) typeSuffix += "[]";
      // All expr children are dimension sizes
      const sizes = arrayExpr.map(transformExpr);
      if (sizes.length === 0) {
        sizes.push({ kind: "BasicLit" as const, type: "INT" as const, value: "0" });
      }
      return {
        kind: "Java_NewExpr",
        type: IR.simpleType(newType.name + typeSuffix),
        args: sizes,
      } as IR.Java_NewExpr;
    }

    // Check for array initializer: new Type[]{expr, expr, ...}
    // The LBrace signals an array initializer ([] already consumed by typeExpr)
    const lbraces = tokTokens(node, "LBrace");
    if (lbraces.length > 0) {
      const allExprs = children(node, "expr");
      const elts = allExprs.map(transformExpr);
      // Build ArrayTypeExpr from the type name (strip trailing [] if present)
      const typeName = newType.name;
      const baseTypeName = typeName.endsWith("[]") ? typeName.slice(0, -2) : typeName;
      return {
        kind: "CompositeLit",
        type: { kind: "ArrayTypeExpr", elt: { kind: "Ident", name: baseTypeName } },
        elts,
      } as IR.IRCompositeLit;
    }

    // Regular constructor: new Type(args)
    const el = child(node, "exprList");
    const args = el ? children(el, "expr").map(transformExpr) : [];
    return { kind: "Java_NewExpr", type: newType, args } as IR.Java_NewExpr;
  }

  // 'this'
  if (tok(node, "This")) return { kind: "Ident", name: "this" };
  // 'super'
  if (tok(node, "Super")) return { kind: "Ident", name: "super" };

  // Boolean literals
  if (tok(node, "True")) return { kind: "Ident", name: "true" };
  if (tok(node, "False")) return { kind: "Ident", name: "false" };
  // Null literal
  if (tok(node, "Null")) return { kind: "Ident", name: "null" };

  // Numeric literals
  const floatLit = tok(node, "FloatLit");
  if (floatLit) return { kind: "BasicLit", type: "FLOAT", value: floatLit };
  const hexLit = tok(node, "HexLit");
  if (hexLit) return { kind: "BasicLit", type: "INT", value: hexLit };
  const longLit = tok(node, "LongLit");
  if (longLit) return { kind: "BasicLit", type: "INT", value: longLit };
  const intLit = tok(node, "IntLit");
  if (intLit) return { kind: "BasicLit", type: "INT", value: intLit };

  // String literal
  const strLit = tok(node, "StringLit");
  if (strLit) return { kind: "BasicLit", type: "STRING", value: strLit };
  // Char literal
  const charLit = tok(node, "CharLit");
  if (charLit) return { kind: "BasicLit", type: "CHAR", value: charLit };

  // Identifier (with optional type args)
  const ident = tok(node, "Ident");
  if (ident) {
    // Check for type arguments: Ident<T>
    const ta = child(node, "typeArgs");
    if (ta) {
      // Generic expression: ArrayList<String>
      const entries = children(ta, "typeArgEntry");
      if (entries.length > 0) {
        const typeArgs = entries.map(transformTypeArgEntry).join(", ");
        return { kind: "Ident", name: ident + "<" + typeArgs + ">" };
      }
      // Diamond: Ident<>
      return { kind: "Ident", name: ident + "<>" };
    }

    // Check for alias
    const alias = resolveAlias(ident);
    if (alias) {
      return expandAliasToExpr(alias);
    }

    return { kind: "Ident", name: ident };
  }

  return { kind: "Ident", name: "_" };
}

// ─── Switch expression ───────────────────────────────────────────────────────

function transformSwitchExpr(node: CstNode): IR.Java_SwitchExpr {
  const exprs = children(node, "expr");
  const tag = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident" as const, name: "_" };

  const cases: IR.Java_SwitchExprCase[] = [];
  for (const sc of children(node, "switchCase")) {
    // Default case: '_' or 'default'
    const isDefault = tok(sc, "Underscore") !== undefined || tok(sc, "Default") !== undefined;

    let values: IR.IRExpr[] | null = null;
    if (!isDefault) {
      const el = child(sc, "exprList");
      values = el ? children(el, "expr").map(transformExpr) : [];
    }

    // Body: block or expr
    const blk = child(sc, "block");
    const bodyExpr = child(sc, "expr");
    let body: IR.IRExpr | IR.IRBlockStmt;
    if (blk) {
      body = transformBlock(blk);
    } else if (bodyExpr) {
      body = transformExpr(bodyExpr);
    } else {
      body = { kind: "Ident", name: "_" };
    }

    cases.push({ values, body });
  }

  return { kind: "Java_SwitchExpr", tag, cases };
}

// ─── Utility functions ────────────────────────────────────────────────────────

/** Check if the first char of a name is uppercase (for new elimination) */
function isUpperCase(name: string): boolean {
  if (!name || name.length === 0) return false;
  const ch = name[0];
  return ch >= "A" && ch <= "Z";
}

/** Wrap a call expression as Java_NewExpr if the function name is uppercase */
function maybeWrapNewExpr(expr: IR.IRExpr): IR.IRExpr {
  // If it's a call to an uppercase identifier, it's already handled by postfix
  // If it's just an uppercase identifier (no call), wrap it
  if (expr.kind === "CallExpr") {
    const call = expr as IR.IRCallExpr;
    if (call.func.kind === "Ident" && isUpperCase((call.func as IR.IRIdent).name)) {
      return {
        kind: "Java_NewExpr",
        type: IR.simpleType((call.func as IR.IRIdent).name),
        args: call.args,
      } as IR.Java_NewExpr;
    }
  }
  return expr;
}

/** Expand a stdlib alias to an expression */
function expandAliasToExpr(alias: JavaAlias): IR.IRExpr {
  const javaName = alias.java;

  // Constructor alias: "new StringBuilder" → Ident("StringBuilder")
  if (alias.isConstructor) {
    return { kind: "Ident", name: javaName.replace("new ", "") };
  }

  // Dotted name: "System.out.println" → SelectorExpr chain
  const parts = javaName.split(".");
  if (parts.length === 1) {
    return { kind: "Ident", name: parts[0] };
  }

  let expr: IR.IRExpr = { kind: "Ident", name: parts[0] };
  for (let i = 1; i < parts.length; i++) {
    expr = { kind: "SelectorExpr", x: expr, sel: parts[i] };
  }
  return expr;
}

/** Convert an IR expression to a rough Java source string (for field initializers in tags) */
function exprToJavaSource(expr: IR.IRExpr): string {
  switch (expr.kind) {
    case "Ident": return expr.name;
    case "BasicLit": return expr.value;
    case "SelectorExpr": return exprToJavaSource(expr.x) + "." + expr.sel;
    case "CallExpr": {
      const fn = exprToJavaSource(expr.func);
      const args = expr.args.map(exprToJavaSource).join(", ");
      return fn + "(" + args + ")";
    }
    case "BinaryExpr": return exprToJavaSource(expr.left) + " " + expr.op + " " + exprToJavaSource(expr.right);
    case "UnaryExpr": return expr.op + exprToJavaSource(expr.x);
    case "Java_NewExpr": return "new " + expr.type.name + "(" + expr.args.map(exprToJavaSource).join(", ") + ")";
    case "ParenExpr": return "(" + exprToJavaSource(expr.x) + ")";
    default: return "?";
  }
}

/** Convert IR expression to a name string (for short declaration LHS) */
function exprToString(expr: IR.IRExpr): string {
  switch (expr.kind) {
    case "Ident": return expr.name;
    case "SelectorExpr": return exprToString(expr.x) + "." + expr.sel;
    default: return "_";
  }
}
