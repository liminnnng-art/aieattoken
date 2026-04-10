// Emitter: Converts AET-TS IR to valid TypeScript source code.
// Input: IRProgram produced by parser/typescript.ts + transformer/typescript.ts
// Output: .ts or .tsx source string

import * as IR from "../ir.js";

// ---------------------------------------------------------------------------
// Options & state
// ---------------------------------------------------------------------------

export interface TypescriptEmitOptions {
  /** Restore type annotations on locals and inferrable returns. */
  typed?: boolean;
  /** JSX mode (.tsx emit target). */
  jsx?: boolean;
}

// Stdlib alias map, loaded from stdlib-aliases-typescript.json
interface TsAlias {
  ts: string;
  pkg: string;
  fromImport?: string;
  namespaceImport?: string;
}

let STDLIB_ALIASES: Record<string, TsAlias> = {};

export function setEmitterAliases(aliases: Record<string, TsAlias>): void {
  STDLIB_ALIASES = aliases;
}

// ---------------------------------------------------------------------------
// Import tracker
// ---------------------------------------------------------------------------

class TsImportTracker {
  // module -> set of named imports
  private namedImports = new Map<string, Set<string>>();
  // module -> set of "default" or "* as X"
  private namespaceImports = new Map<string, string>();
  private defaultImports = new Map<string, string>();
  // raw hint lines from !r: prefix
  private rawHints: string[] = [];

  addNamed(module: string, name: string): void {
    if (!this.namedImports.has(module)) {
      this.namedImports.set(module, new Set());
    }
    this.namedImports.get(module)!.add(name);
  }

  addNamespace(module: string, alias: string): void {
    this.namespaceImports.set(module, alias);
  }

  addDefault(module: string, alias: string): void {
    this.defaultImports.set(module, alias);
  }

  addRawHint(hint: string): void {
    this.rawHints.push(hint);
  }

  getImportLines(): string[] {
    const lines: string[] = [];
    // Hints from !r: first (user code, most important)
    for (const hint of this.rawHints) {
      // hint format: module:names (where names is "*as X" or comma-separated names or "*")
      const firstColon = hint.indexOf(":");
      if (firstColon === -1) continue;
      const mod = hint.substring(0, firstColon);
      const namesStr = hint.substring(firstColon + 1);
      if (namesStr === "*") {
        lines.push(`import "${mod}";`);
        continue;
      }
      const names = namesStr.split(",");
      const namedItems: string[] = [];
      let defaultName: string | null = null;
      let nsName: string | null = null;
      for (const n of names) {
        const trimmed = n.trim();
        if (trimmed.startsWith("*as ")) {
          nsName = trimmed.substring(4).trim();
        } else if (trimmed.includes(" as ")) {
          namedItems.push(trimmed);
        } else {
          namedItems.push(trimmed);
        }
      }
      const parts: string[] = [];
      if (defaultName) parts.push(defaultName);
      if (nsName) parts.push(`* as ${nsName}`);
      if (namedItems.length > 0) parts.push(`{ ${namedItems.join(", ")} }`);
      if (parts.length > 0) {
        lines.push(`import ${parts.join(", ")} from "${mod}";`);
      }
    }
    // Named imports (grouped by module, sorted)
    const modules = Array.from(new Set([
      ...this.namedImports.keys(),
      ...this.namespaceImports.keys(),
      ...this.defaultImports.keys(),
    ])).sort();
    for (const mod of modules) {
      const parts: string[] = [];
      if (this.defaultImports.has(mod)) parts.push(this.defaultImports.get(mod)!);
      if (this.namespaceImports.has(mod)) parts.push(`* as ${this.namespaceImports.get(mod)}`);
      if (this.namedImports.has(mod)) {
        const names = [...this.namedImports.get(mod)!].sort();
        parts.push(`{ ${names.join(", ")} }`);
      }
      if (parts.length > 0) {
        lines.push(`import ${parts.join(", ")} from "${mod}";`);
      }
    }
    return lines;
  }
}

// ---------------------------------------------------------------------------
// Module-level state (reset per emit call)
// ---------------------------------------------------------------------------

let importTracker: TsImportTracker;
let emitOptions: TypescriptEmitOptions;
let _insideClass: boolean = false;

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function emitTypescript(program: IR.IRProgram, options?: TypescriptEmitOptions): string {
  importTracker = new TsImportTracker();
  emitOptions = options || {};
  _insideClass = false;

  // Extract required-import hints from program (stored as IR comments or metadata)
  const hints = (program as any).requiredImports as string[] | undefined;
  if (hints) {
    for (const h of hints) importTracker.addRawHint(h);
  }

  const bodyLines: string[] = [];
  for (const decl of program.decls) {
    const text = emitNode(decl, 0);
    if (text) bodyLines.push(text);
  }

  // If the program defines a top-level `main` function (and there's no explicit
  // trailing `main()` call already), append one. This mirrors the reverse step
  // which strips trailing `main();` — the two must be symmetric so round-trip
  // reproduces the original entry-point call.
  let hasMainDecl = false;
  let hasTrailingMainCall = false;
  for (const decl of program.decls) {
    if (decl.kind === "Ts_FuncDecl" && (decl as IR.Ts_FuncDecl).name === "main") {
      hasMainDecl = true;
    }
    if (decl.kind === "Ts_ExprStmt") {
      const e = (decl as IR.Ts_ExprStmt).expr;
      if (e.kind === "CallExpr" && (e as IR.IRCallExpr).func.kind === "Ident" && ((e as IR.IRCallExpr).func as IR.IRIdent).name === "main" && (e as IR.IRCallExpr).args.length === 0) {
        hasTrailingMainCall = true;
      }
    }
  }
  if (hasMainDecl && !hasTrailingMainCall) {
    bodyLines.push("main();");
  }

  // Auto-import based on used aliases (scanned during body emission)
  resolveAliasImports();

  const header: string[] = [];
  const importLines = importTracker.getImportLines();
  if (importLines.length > 0) {
    header.push(...importLines);
    header.push("");
  }

  return header.join("\n") + bodyLines.join("\n\n") + "\n";
}

// Track aliases used during emission so we can auto-import them
const usedAliases = new Set<string>();

function trackAlias(alias: string): void {
  usedAliases.add(alias);
}

function resolveAliasImports(): void {
  for (const alias of usedAliases) {
    const info = STDLIB_ALIASES[alias];
    if (!info) continue;
    if (info.pkg === "builtin") continue; // no import needed
    if (info.fromImport) {
      // parse "import { foo } from \"mod\""
      const m = info.fromImport.match(/import\s*\{\s*([^}]+)\s*\}\s*from\s*"([^"]+)"/);
      if (m) {
        const names = m[1].split(",").map(s => s.trim());
        for (const n of names) importTracker.addNamed(m[2], n);
      }
    } else if (info.namespaceImport) {
      const m = info.namespaceImport.match(/import\s*\*\s*as\s*(\w+)\s*from\s*"([^"]+)"/);
      if (m) importTracker.addNamespace(m[2], m[1]);
    }
  }
  usedAliases.clear();
}

// ---------------------------------------------------------------------------
// Node emission
// ---------------------------------------------------------------------------

function indent(level: number): string {
  return "  ".repeat(level);
}

function emitNode(node: IR.IRNode | IR.IRExprStmt, level: number): string {
  switch (node.kind) {
    case "Ts_InterfaceDecl":    return emitInterfaceDecl(node as IR.Ts_InterfaceDecl, level);
    case "Ts_TypeAliasDecl":    return emitTypeAliasDecl(node as IR.Ts_TypeAliasDecl, level);
    case "Ts_ClassDecl":        return emitClassDecl(node as IR.Ts_ClassDecl, level);
    case "Ts_EnumDecl":         return emitEnumDecl(node as IR.Ts_EnumDecl, level);
    case "Ts_FuncDecl":         return emitFuncDecl(node as IR.Ts_FuncDecl, level);
    case "Ts_VarStmt":          return emitVarStmt(node as IR.Ts_VarStmt, level);
    case "Ts_BlockStmt":        return emitBlockStmt(node as IR.Ts_BlockStmt, level);
    case "Ts_IfStmt":           return emitIfStmt(node as IR.Ts_IfStmt, level);
    case "Ts_ForStmt":          return emitForStmt(node as IR.Ts_ForStmt, level);
    case "Ts_ForInStmt":        return emitForInStmt(node as IR.Ts_ForInStmt, level);
    case "Ts_ForOfStmt":        return emitForOfStmt(node as IR.Ts_ForOfStmt, level);
    case "Ts_WhileStmt":        return emitWhileStmt(node as IR.Ts_WhileStmt, level);
    case "Ts_DoWhileStmt":      return emitDoWhileStmt(node as IR.Ts_DoWhileStmt, level);
    case "Ts_SwitchStmt":       return emitSwitchStmt(node as IR.Ts_SwitchStmt, level);
    case "Ts_TryStmt":          return emitTryStmt(node as IR.Ts_TryStmt, level);
    case "Ts_ThrowStmt":        return indent(level) + "throw " + emitExpr((node as IR.Ts_ThrowStmt).expr) + ";";
    case "Ts_ReturnStmt":       return indent(level) + "return" + ((node as IR.Ts_ReturnStmt).value ? " " + emitExpr((node as IR.Ts_ReturnStmt).value!) : "") + ";";
    case "Ts_ExprStmt":         return indent(level) + emitExpr((node as IR.Ts_ExprStmt).expr) + ";";
    case "Ts_BreakStmt":        return indent(level) + "break" + ((node as IR.Ts_BreakStmt).label ? " " + (node as IR.Ts_BreakStmt).label : "") + ";";
    case "Ts_ContinueStmt":     return indent(level) + "continue" + ((node as IR.Ts_ContinueStmt).label ? " " + (node as IR.Ts_ContinueStmt).label : "") + ";";
    case "Ts_LabeledStmt":      return indent(level) + (node as IR.Ts_LabeledStmt).label + ": " + emitNode((node as IR.Ts_LabeledStmt).body, level).trimStart();
    case "Ts_NamespaceDecl":    return emitNamespaceDecl(node as IR.Ts_NamespaceDecl, level);
    default:
      return indent(level) + `/* unsupported: ${(node as any).kind} */`;
  }
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

function emitInterfaceDecl(node: IR.Ts_InterfaceDecl, level: number): string {
  const exp = node.isExported ? "export " : "";
  const tp = emitTypeParams(node.typeParams);
  const heritage = node.heritage && node.heritage.length > 0
    ? " extends " + node.heritage.map(h => emitTypeExpr(h)).join(", ")
    : "";
  const members = node.members.map(m => indent(level + 1) + emitInterfaceMember(m) + ";").join("\n");
  return `${indent(level)}${exp}interface ${node.name}${tp}${heritage} {\n${members}\n${indent(level)}}`;
}

function emitInterfaceMember(m: IR.Ts_TypeMember): string {
  if (m.indexSignature) {
    return `[${m.indexSignature.keyName}: ${emitTypeExpr(m.indexSignature.keyType)}]: ${emitTypeExpr(m.type!)}`;
  }
  const readonly = m.readonly ? "readonly " : "";
  const opt = m.optional ? "?" : "";
  if (m.isMethod) {
    const tp = emitTypeParams(m.typeParams);
    const params = emitParamsList(m.params || []);
    const rt = m.returnType ? ": " + emitTypeExpr(m.returnType) : "";
    return `${readonly}${m.name}${tp}${params}${rt}`;
  }
  const type = m.type ? ": " + emitTypeExpr(m.type) : "";
  return `${readonly}${m.name}${opt}${type}`;
}

function emitTypeAliasDecl(node: IR.Ts_TypeAliasDecl, level: number): string {
  const exp = node.isExported ? "export " : "";
  const tp = emitTypeParams(node.typeParams);
  return `${indent(level)}${exp}type ${node.name}${tp} = ${emitTypeExpr(node.type)};`;
}

function emitClassDecl(node: IR.Ts_ClassDecl, level: number): string {
  const prev = _insideClass;
  _insideClass = true;
  try {
    const parts: string[] = [];
    if (node.decorators) {
      for (const d of node.decorators) parts.push(indent(level) + "@" + emitExpr(d));
    }
    const modParts: string[] = [];
    if (node.isExported) modParts.push(node.isDefault ? "export default" : "export");
    if (node.isAbstract) modParts.push("abstract");
    const mods = modParts.length > 0 ? modParts.join(" ") + " " : "";
    const tp = emitTypeParams(node.typeParams);
    const superClause = node.superClass ? " extends " + emitTypeExpr(node.superClass) : "";
    const implClause = node.implements && node.implements.length > 0
      ? " implements " + node.implements.map(i => emitTypeExpr(i)).join(", ")
      : "";
    const header = `${indent(level)}${mods}class ${node.name}${tp}${superClause}${implClause} {`;
    const memberLines = node.members.map(m => emitClassMember(m, level + 1));
    const body = memberLines.join("\n");
    parts.push(header);
    if (body) parts.push(body);
    parts.push(`${indent(level)}}`);
    return parts.join("\n");
  } finally {
    _insideClass = prev;
  }
}

function emitClassMember(m: IR.Ts_ClassMember, level: number): string {
  switch (m.kind) {
    case "Ts_FieldDecl": {
      const d = m as IR.Ts_FieldDecl;
      const parts: string[] = [];
      if (d.decorators) {
        for (const dec of d.decorators) parts.push(indent(level) + "@" + emitExpr(dec));
      }
      const access = d.access ? d.access + " " : "";
      const staticK = d.isStatic ? "static " : "";
      const readonly = d.isReadonly ? "readonly " : "";
      const declK = d.declare ? "declare " : "";
      const opt = d.optional ? "?" : "";
      const type = d.type ? ": " + emitTypeExpr(d.type) : "";
      const init = d.value ? " = " + emitExpr(d.value) : "";
      parts.push(`${indent(level)}${declK}${access}${staticK}${readonly}${d.name}${opt}${type}${init};`);
      return parts.join("\n");
    }
    case "Ts_MethodDecl": {
      const d = m as IR.Ts_MethodDecl;
      const parts: string[] = [];
      if (d.decorators) {
        for (const dec of d.decorators) parts.push(indent(level) + "@" + emitExpr(dec));
      }
      const access = d.access ? d.access + " " : "";
      const staticK = d.isStatic ? "static " : "";
      const asyncK = d.isAsync ? "async " : "";
      const abstractK = d.isAbstract ? "abstract " : "";
      const overrideK = d.isOverride ? "override " : "";
      const gen = d.isGenerator ? "*" : "";
      const tp = emitTypeParams(d.typeParams);
      const params = emitParamsList(d.params);
      const rt = d.returnType ? ": " + emitTypeExpr(d.returnType) : "";
      const body = d.body ? " " + emitBlockStmt(d.body, level) : ";";
      parts.push(`${indent(level)}${abstractK}${access}${staticK}${overrideK}${asyncK}${gen}${d.name}${tp}${params}${rt}${body}`);
      return parts.join("\n");
    }
    case "Ts_CtorDecl": {
      const d = m as IR.Ts_CtorDecl;
      const access = d.access ? d.access + " " : "";
      const params = emitParamsList(d.params, /*ctor*/ true);
      const body = emitBlockStmt(d.body, level);
      return `${indent(level)}${access}constructor${params} ${body}`;
    }
    case "Ts_GetterDecl": {
      const d = m as IR.Ts_GetterDecl;
      const access = d.access ? d.access + " " : "";
      const staticK = d.isStatic ? "static " : "";
      const rt = d.returnType ? ": " + emitTypeExpr(d.returnType) : "";
      const body = emitBlockStmt(d.body, level);
      return `${indent(level)}${access}${staticK}get ${d.name}()${rt} ${body}`;
    }
    case "Ts_SetterDecl": {
      const d = m as IR.Ts_SetterDecl;
      const access = d.access ? d.access + " " : "";
      const staticK = d.isStatic ? "static " : "";
      const params = emitParamsList([d.param]);
      const body = emitBlockStmt(d.body, level);
      return `${indent(level)}${access}${staticK}set ${d.name}${params} ${body}`;
    }
  }
}

function emitEnumDecl(node: IR.Ts_EnumDecl, level: number): string {
  const exp = node.isExported ? "export " : "";
  const constK = node.isConst ? "const " : "";
  const members = node.members.map(m => {
    const v = m.value ? " = " + emitExpr(m.value) : "";
    return indent(level + 1) + m.name + v + ",";
  }).join("\n");
  return `${indent(level)}${exp}${constK}enum ${node.name} {\n${members}\n${indent(level)}}`;
}

function emitFuncDecl(node: IR.Ts_FuncDecl, level: number): string {
  const parts: string[] = [];
  const exp = node.isExported ? (node.isDefault ? "export default " : "export ") : "";
  const declK = node.declare ? "declare " : "";
  const asyncK = node.isAsync ? "async " : "";
  const gen = node.isGenerator ? "*" : "";
  const tp = emitTypeParams(node.typeParams);
  const params = emitParamsList(node.params);
  const rt = node.returnType ? ": " + emitTypeExpr(node.returnType) : "";
  const body = node.body ? " " + emitBlockStmt(node.body, level) : ";";
  parts.push(`${indent(level)}${exp}${declK}${asyncK}function${gen} ${node.name}${tp}${params}${rt}${body}`);
  return parts.join("\n");
}

function emitNamespaceDecl(node: IR.Ts_NamespaceDecl, level: number): string {
  const exp = node.isExported ? "export " : "";
  const inner = node.body.map(s => emitNode(s, level + 1)).join("\n");
  return `${indent(level)}${exp}namespace ${node.name} {\n${inner}\n${indent(level)}}`;
}

// ---------------------------------------------------------------------------
// Variable statement
// ---------------------------------------------------------------------------

function emitVarStmt(node: IR.Ts_VarStmt, level: number): string {
  // Special-case: export default expression parsed from `+d <expr>`
  if (node.isExported && node.declarations.length === 1) {
    const d = node.declarations[0];
    if (d.binding.kind === "Ident" && (d.binding as IR.IRIdent).name === "__exportDefault__" && d.value) {
      return `${indent(level)}export default ${emitExpr(d.value)};`;
    }
  }
  const exp = node.isExported ? "export " : "";
  const decls = node.declarations.map(d => {
    const binding = emitExpr(d.binding);
    const type = (emitOptions.typed && d.type) ? ": " + emitTypeExpr(d.type) : (d.type ? ": " + emitTypeExpr(d.type) : "");
    const init = d.value ? " = " + emitExpr(d.value) : "";
    return binding + type + init;
  });
  return `${indent(level)}${exp}${node.keyword} ${decls.join(", ")};`;
}

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

function emitBlockStmt(node: IR.Ts_BlockStmt, level: number): string {
  if (node.stmts.length === 0) return "{}";
  const lines = node.stmts.map(s => emitNode(s, level + 1));
  return `{\n${lines.join("\n")}\n${indent(level)}}`;
}

function emitIfStmt(node: IR.Ts_IfStmt, level: number): string {
  const cond = emitExpr(node.cond);
  const thenPart = emitNestedStmt(node.then, level);
  let out = `${indent(level)}if (${cond}) ${thenPart}`;
  if (node.else_) {
    if (node.else_.kind === "Ts_IfStmt") {
      out += " else " + emitIfStmt(node.else_ as IR.Ts_IfStmt, level).trimStart();
    } else {
      out += " else " + emitNestedStmt(node.else_, level);
    }
  }
  return out;
}

function emitNestedStmt(node: IR.IRNode, level: number): string {
  if (node.kind === "Ts_BlockStmt") return emitBlockStmt(node as IR.Ts_BlockStmt, level);
  // Wrap single statement in block
  return emitBlockStmt({ kind: "Ts_BlockStmt", stmts: [node] } as IR.Ts_BlockStmt, level);
}

function emitForStmt(node: IR.Ts_ForStmt, level: number): string {
  const init = node.init ? formatForInit(node.init) : "";
  const cond = node.cond ? emitExpr(node.cond) : "";
  const upd = node.update ? emitExpr(node.update) : "";
  const body = emitNestedStmt(node.body, level);
  return `${indent(level)}for (${init}; ${cond}; ${upd}) ${body}`;
}

function formatForInit(init: IR.IRNode | IR.IRExpr): string {
  if ((init as IR.IRNode).kind === "Ts_VarStmt") {
    const v = init as IR.Ts_VarStmt;
    const decls = v.declarations.map(d => {
      const binding = emitExpr(d.binding);
      const value = d.value ? " = " + emitExpr(d.value) : "";
      return binding + value;
    });
    return `${v.keyword} ${decls.join(", ")}`;
  }
  return emitExpr(init as IR.IRExpr);
}

function emitForInStmt(node: IR.Ts_ForInStmt, level: number): string {
  const init = formatForInit(node.init);
  const iter = emitExpr(node.iter);
  const body = emitNestedStmt(node.body, level);
  return `${indent(level)}for (${init} in ${iter}) ${body}`;
}

function emitForOfStmt(node: IR.Ts_ForOfStmt, level: number): string {
  const init = formatForInit(node.init);
  const iter = emitExpr(node.iter);
  const body = emitNestedStmt(node.body, level);
  const awaitK = node.isAwait ? "await " : "";
  return `${indent(level)}for ${awaitK}(${init} of ${iter}) ${body}`;
}

function emitWhileStmt(node: IR.Ts_WhileStmt, level: number): string {
  return `${indent(level)}while (${emitExpr(node.cond)}) ${emitNestedStmt(node.body, level)}`;
}

function emitDoWhileStmt(node: IR.Ts_DoWhileStmt, level: number): string {
  return `${indent(level)}do ${emitNestedStmt(node.body, level)} while (${emitExpr(node.cond)});`;
}

function emitSwitchStmt(node: IR.Ts_SwitchStmt, level: number): string {
  const tag = emitExpr(node.tag);
  const cases = node.cases.map(c => {
    const header = c.value ? `${indent(level + 1)}case ${emitExpr(c.value)}:` : `${indent(level + 1)}default:`;
    const body = c.body.map(s => emitNode(s, level + 2)).join("\n");
    return header + (body ? "\n" + body : "");
  }).join("\n");
  return `${indent(level)}switch (${tag}) {\n${cases}\n${indent(level)}}`;
}

function emitTryStmt(node: IR.Ts_TryStmt, level: number): string {
  let out = `${indent(level)}try ${emitBlockStmt(node.tryBody, level)}`;
  if (node.catchBody) {
    const p = node.catchParam
      ? `(${node.catchParam.name}${node.catchParam.type ? ": " + emitTypeExpr(node.catchParam.type) : ""})`
      : "";
    out += ` catch ${p} ${emitBlockStmt(node.catchBody, level)}`;
  }
  if (node.finallyBody) {
    out += ` finally ${emitBlockStmt(node.finallyBody, level)}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Type expressions
// ---------------------------------------------------------------------------

function emitTypeExpr(t: IR.Ts_TypeExpr): string {
  switch (t.kind) {
    case "Ts_TypeRef": {
      const args = t.typeArgs && t.typeArgs.length > 0 ? "<" + t.typeArgs.map(emitTypeExpr).join(", ") + ">" : "";
      return t.name + args;
    }
    case "Ts_ArrayType": return emitTypeExpr(t.elt) + "[]";
    case "Ts_TupleType": return "[" + t.elts.map((e, i) => {
      const label = t.labels?.[i];
      return (label ? label + ": " : "") + emitTypeExpr(e);
    }).join(", ") + "]";
    case "Ts_UnionType": return t.types.map(emitTypeExpr).join(" | ");
    case "Ts_IntersectionType": return t.types.map(emitTypeExpr).join(" & ");
    case "Ts_FnType": {
      const tp = emitTypeParams(t.typeParams);
      const params = emitParamsList(t.params);
      return `${tp}${params} => ${emitTypeExpr(t.returnType)}`;
    }
    case "Ts_TypeLit": return "{ " + t.members.map(emitInterfaceMember).join("; ") + " }";
    case "Ts_ConditionalType":
      return `${emitTypeExpr(t.checkType)} extends ${emitTypeExpr(t.extendsType)} ? ${emitTypeExpr(t.trueType)} : ${emitTypeExpr(t.falseType)}`;
    case "Ts_MappedType": {
      const ro = t.readonlyToken === true ? "readonly " : (t.readonlyToken === "+" ? "+readonly " : (t.readonlyToken === "-" ? "-readonly " : ""));
      const opt = t.optionalToken === true ? "?" : (t.optionalToken === "+" ? "+?" : (t.optionalToken === "-" ? "-?" : ""));
      const as = t.nameType ? " as " + emitTypeExpr(t.nameType) : "";
      return `{ ${ro}[${t.typeParam} in ${emitTypeExpr(t.constraint)}${as}]${opt}: ${emitTypeExpr(t.type)} }`;
    }
    case "Ts_IndexedAccessType": return `${emitTypeExpr(t.object)}[${emitTypeExpr(t.index)}]`;
    case "Ts_LiteralType": {
      if (t.litKind === "string") return JSON.stringify(t.value);
      return t.value;
    }
    case "Ts_TemplateLiteralType": {
      let out = "`";
      for (const p of t.parts) {
        if (typeof p === "string") out += p.replace(/`/g, "\\`");
        else out += "${" + emitTypeExpr(p) + "}";
      }
      return out + "`";
    }
    case "Ts_ParenType": return "(" + emitTypeExpr(t.inner) + ")";
    case "Ts_TypeofType": return "typeof " + emitExpr(t.expr);
    case "Ts_KeyofType": return "keyof " + emitTypeExpr(t.type);
    case "Ts_InferType": return "infer " + t.name;
    case "Ts_TypePredicateExpr": return (t.asserts ? "asserts " : "") + t.paramName + " is " + emitTypeExpr(t.type);
  }
}

function emitTypeParams(params?: IR.Ts_TypeParam[]): string {
  if (!params || params.length === 0) return "";
  return "<" + params.map(p => {
    let s = p.name;
    if (p.constraint) s += " extends " + emitTypeExpr(p.constraint);
    if (p.default_) s += " = " + emitTypeExpr(p.default_);
    return s;
  }).join(", ") + ">";
}

function emitParamsList(params: IR.Ts_Param[], ctor: boolean = false): string {
  const parts = params.map(p => {
    const mod = p.modifier ? p.modifier + " " : "";
    const rest = p.rest ? "..." : "";
    const opt = p.optional ? "?" : "";
    const type = p.type ? ": " + emitTypeExpr(p.type) : "";
    const def = p.default_ ? " = " + emitExpr(p.default_) : "";
    return `${mod}${rest}${p.name}${opt}${type}${def}`;
  });
  return "(" + parts.join(", ") + ")";
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

function emitExpr(expr: IR.IRExpr): string {
  switch (expr.kind) {
    case "Ident": return (expr as IR.IRIdent).name;
    case "BasicLit": {
      const lit = expr as IR.IRBasicLit;
      if (lit.type === "STRING") {
        // If the value is already quoted, keep it; otherwise quote it.
        const v = lit.value;
        if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) || (v.startsWith("`") && v.endsWith("`")))) return v;
        return JSON.stringify(v);
      }
      return lit.value;
    }
    case "BinaryExpr": {
      const b = expr as IR.IRBinaryExpr;
      return emitExpr(b.left) + " " + b.op + " " + emitExpr(b.right);
    }
    case "UnaryExpr": {
      const u = expr as IR.IRUnaryExpr;
      if (u.op.endsWith("_post")) {
        return emitExpr(u.x) + u.op.replace("_post", "");
      }
      return u.op + emitExpr(u.x);
    }
    case "CallExpr": {
      const c = expr as IR.IRCallExpr;
      const callee = emitExpr(c.func);
      const args = c.args.map(emitExpr).join(", ");
      const resolvedCallee = resolveAliasInExpr(callee);
      return `${resolvedCallee}(${args})`;
    }
    case "SelectorExpr": {
      const s = expr as IR.IRSelectorExpr;
      return emitExpr(s.x) + "." + s.sel;
    }
    case "IndexExpr": {
      const i = expr as IR.IRIndexExpr;
      return emitExpr(i.x) + "[" + emitExpr(i.index) + "]";
    }
    case "ParenExpr": return "(" + emitExpr((expr as IR.IRParenExpr).x) + ")";
    case "Ts_ArrowFn": {
      const a = expr as IR.Ts_ArrowFn;
      const asyncK = a.isAsync ? "async " : "";
      const tp = emitTypeParams(a.typeParams);
      const params = emitParamsList(a.params);
      const rt = a.returnType ? ": " + emitTypeExpr(a.returnType) : "";
      let body: string;
      if ((a.body as IR.Ts_BlockStmt).kind === "Ts_BlockStmt") {
        body = emitBlockStmt(a.body as IR.Ts_BlockStmt, 0);
      } else {
        body = emitExpr(a.body as IR.IRExpr);
      }
      return `${asyncK}${tp}${params}${rt} => ${body}`;
    }
    case "Ts_ObjectLit": {
      const o = expr as IR.Ts_ObjectLit;
      const props = o.properties.map(p => {
        if (p.kind === "property") {
          if (p.shorthand) return emitExpr(p.key);
          const k = emitExpr(p.key);
          const key = p.computed ? `[${k}]` : k;
          return `${key}: ${emitExpr(p.value)}`;
        }
        if (p.kind === "spread") return "..." + emitExpr(p.value);
        if (p.kind === "method") {
          const async = p.isAsync ? "async " : "";
          const gen = p.isGenerator ? "*" : "";
          const params = emitParamsList(p.params);
          const rt = p.returnType ? ": " + emitTypeExpr(p.returnType) : "";
          return `${async}${gen}${p.name}${params}${rt} ${emitBlockStmt(p.body, 0)}`;
        }
        if (p.kind === "getter") return `get ${p.name}() ${emitBlockStmt(p.body, 0)}`;
        if (p.kind === "setter") return `set ${p.name}${emitParamsList([p.param])} ${emitBlockStmt(p.body, 0)}`;
        return "/*?*/";
      });
      return "{ " + props.join(", ") + " }";
    }
    case "Ts_ArrayLit": {
      const a = expr as IR.Ts_ArrayLit;
      return "[" + a.elements.map(e => e ? emitExpr(e) : "").join(", ") + "]";
    }
    case "Ts_SpreadExpr": return "..." + emitExpr((expr as IR.Ts_SpreadExpr).expr);
    case "Ts_TemplateLit": {
      const t = expr as IR.Ts_TemplateLit;
      let out = "`";
      for (const part of t.parts) {
        if (typeof part === "string") out += part.replace(/`/g, "\\`");
        else out += "${" + emitExpr(part) + "}";
      }
      return out + "`";
    }
    case "Ts_AsExpr": {
      const a = expr as IR.Ts_AsExpr;
      if (a.asConst) return emitExpr(a.expr) + " as const";
      return emitExpr(a.expr) + " as " + emitTypeExpr(a.type);
    }
    case "Ts_SatisfiesExpr": return emitExpr((expr as IR.Ts_SatisfiesExpr).expr) + " satisfies " + emitTypeExpr((expr as IR.Ts_SatisfiesExpr).type);
    case "Ts_TypeAssertion": return `<${emitTypeExpr((expr as IR.Ts_TypeAssertion).type)}>${emitExpr((expr as IR.Ts_TypeAssertion).expr)}`;
    case "Ts_NonNullExpr": return emitExpr((expr as IR.Ts_NonNullExpr).expr) + "!";
    case "Ts_AwaitExpr": return "await " + emitExpr((expr as IR.Ts_AwaitExpr).expr);
    case "Ts_YieldExpr": {
      const y = expr as IR.Ts_YieldExpr;
      return "yield" + (y.delegate ? "*" : "") + (y.expr ? " " + emitExpr(y.expr) : "");
    }
    case "Ts_ConditionalExpr": {
      const c = expr as IR.Ts_ConditionalExpr;
      return `${emitExpr(c.cond)} ? ${emitExpr(c.then)} : ${emitExpr(c.else_)}`;
    }
    case "Ts_NewExpr": {
      const n = expr as IR.Ts_NewExpr;
      const typeArgs = n.typeArgs && n.typeArgs.length > 0 ? "<" + n.typeArgs.map(emitTypeExpr).join(", ") + ">" : "";
      const args = n.args.map(emitExpr).join(", ");
      return `new ${emitExpr(n.callee)}${typeArgs}(${args})`;
    }
    case "Ts_RegexLit": return "/" + (expr as IR.Ts_RegexLit).pattern + "/" + (expr as IR.Ts_RegexLit).flags;
    case "Ts_JsxElement": return emitJsxElement(expr as IR.Ts_JsxElement);
    case "Ts_JsxSelfClose": return emitJsxSelfClose(expr as IR.Ts_JsxSelfClose);
    case "Ts_JsxFragment": return emitJsxFragment(expr as IR.Ts_JsxFragment);
    case "Ts_JsxExpression": return "{" + emitExpr((expr as IR.Ts_JsxExpression).expr) + "}";
    case "Ts_JsxText": return (expr as IR.Ts_JsxText).text;
  }
  return `/*expr:${(expr as any).kind}*/`;
}

function resolveAliasInExpr(callee: string): string {
  if (STDLIB_ALIASES[callee]) {
    const info = STDLIB_ALIASES[callee];
    trackAlias(callee);
    return info.ts;
  }
  return callee;
}

// ---------------------------------------------------------------------------
// JSX emit
// ---------------------------------------------------------------------------

function emitJsxElement(node: IR.Ts_JsxElement): string {
  const tagName = node.tagName;
  const typeArgs = node.typeArgs && node.typeArgs.length > 0 ? "<" + node.typeArgs.map(emitTypeExpr).join(",") + ">" : "";
  const attrs = emitJsxAttrs(node.attributes);
  if (node.selfClosing) {
    return `<${tagName}${typeArgs}${attrs} />`;
  }
  const children = node.children.map(emitExpr).join("");
  return `<${tagName}${typeArgs}${attrs}>${children}</${tagName}>`;
}

function emitJsxSelfClose(node: IR.Ts_JsxSelfClose): string {
  const typeArgs = node.typeArgs && node.typeArgs.length > 0 ? "<" + node.typeArgs.map(emitTypeExpr).join(",") + ">" : "";
  const attrs = emitJsxAttrs(node.attributes);
  return `<${node.tagName}${typeArgs}${attrs} />`;
}

function emitJsxFragment(node: IR.Ts_JsxFragment): string {
  return `<>${node.children.map(emitExpr).join("")}</>`;
}

function emitJsxAttrs(attrs: IR.Ts_JsxAttribute[]): string {
  const parts: string[] = [];
  for (const a of attrs) {
    if (a.spread) {
      parts.push(" {..." + emitExpr(a.value!) + "}");
      continue;
    }
    if (a.value === undefined) {
      parts.push(" " + a.name);
    } else if ((a.value as any).kind === "BasicLit" && (a.value as IR.IRBasicLit).type === "STRING") {
      parts.push(` ${a.name}=${JSON.stringify((a.value as IR.IRBasicLit).value)}`);
    } else {
      parts.push(` ${a.name}={${emitExpr(a.value)}}`);
    }
  }
  return parts.join("");
}
