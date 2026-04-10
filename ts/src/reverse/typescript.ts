// Reverse transpiler: TypeScript source → AET-TS (.aets / .aetx)
// Uses the bundled `typescript` compiler API (ts.createSourceFile) — no external parser binary.
//
// Architecture: single-pass TS AST → AET-TS string. For pragmatism, we walk
// the AST directly and emit AET-TS text, bypassing the full IR pipeline.
// Round-trip is handled separately by parser/typescript.ts + emitter/typescript.ts.

import ts from "typescript";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Alias maps (loaded from stdlib-aliases-typescript.json)
// ---------------------------------------------------------------------------

interface TsAlias {
  ts: string;
  pkg?: string;
  fromImport?: string;
  namespaceImport?: string;
}

// Reverse map: "console.log" -> "pl", "readFileSync" -> "rf", etc.
let tsReverseAliasMap: Record<string, string> = Object.create(null);
// Forward map: "pl" -> {ts: "console.log", pkg: "builtin"}
let tsForwardAliasMap: Record<string, TsAlias> = Object.create(null);

// Primitive type alias map (used in type positions only): "string" -> "s"
const TS_TYPE_ALIASES: Record<string, string> = {
  string: "s",
  number: "n",
  boolean: "b",
  void: "v",
  undefined: "u",
  any: "A",
  unknown: "uk",
  never: "nv",
  bigint: "bi",
  symbol: "sy",
};

// Utility type aliases
const TS_UTILITY_ALIASES: Record<string, string> = {
  ReadonlyArray: "RA",
  NonNullable: "NN",
  Readonly: "Ro",
  Omit: "Om",
  Awaited: "Aw",
  WeakMap: "WM",
  WeakSet: "WS",
  "React.FC": "FC",
  "FunctionComponent": "FC",
  "React.ReactNode": "RN",
  "ReactNode": "RN",
  "JSX.Element": "JE",
};

export function loadTypescriptReverseAliases(path?: string): void {
  try {
    const p = path || resolve(process.cwd(), "stdlib-aliases-typescript.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    const aliases = data.aliases || {};
    for (const [alias, info] of Object.entries(aliases) as [string, any][]) {
      if (alias.startsWith("_")) continue;
      if (info && typeof info === "object" && info.ts) {
        tsReverseAliasMap[info.ts] = alias;
        tsForwardAliasMap[alias] = info as TsAlias;
      }
    }
  } catch {
    /* optional — aliases improve compression but are not required */
  }
}

export function getTsForwardAliases(): Record<string, TsAlias> {
  return tsForwardAliasMap;
}

// ---------------------------------------------------------------------------
// parseTypescriptFile
// ---------------------------------------------------------------------------

export function parseTypescriptFile(filePath: string): ts.SourceFile {
  const source = readFileSync(filePath, "utf-8");
  return parseTypescriptSource(source, filePath);
}

export function parseTypescriptSource(source: string, filePath: string = "input.ts"): ts.SourceFile {
  const isJsx = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ReverseOptions {
  /** Keep type annotations on locals and inferrable returns. */
  typed?: boolean;
  /** .tsx file (affects JSX handling). */
  jsx?: boolean;
}

// ---------------------------------------------------------------------------
// Main entry: convert a TS SourceFile to an AET-TS string
// ---------------------------------------------------------------------------

export function typescriptToAET(
  sourceFile: ts.SourceFile,
  options: ReverseOptions = {},
): string {
  const isTsx = options.jsx ?? (sourceFile.fileName.endsWith(".tsx") || sourceFile.fileName.endsWith(".jsx"));
  const ctx: Ctx = {
    typed: options.typed ?? false,
    jsx: isTsx,
    requiredImports: new Map(),
    usedAliases: new Set(),
    sourceFile,
  };

  const parts: string[] = [];
  parts.push(isTsx ? "!tsx1" : "!ts1");

  // Detect if there's a top-level `main` function declaration. If so, strip any
  // trailing `main();` expression statement — the emitter will auto-add it.
  let hasTopLevelMainFunc = false;
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === "main") {
      hasTopLevelMainFunc = true;
      break;
    }
  }

  // First pass: collect non-stdlib imports as required-import hints.
  // Second pass: emit declarations.
  const required: string[] = [];
  const declParts: string[] = [];
  const filteredStmts: ts.Statement[] = [];

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const hint = collectImportHint(stmt);
      if (hint) required.push(hint);
      continue;
    }
    // Skip trailing `main();` expression statement if main is defined at top level.
    if (hasTopLevelMainFunc && ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)
        && ts.isIdentifier(stmt.expression.expression) && stmt.expression.expression.text === "main"
        && stmt.expression.arguments.length === 0) {
      continue;
    }
    filteredStmts.push(stmt);
  }

  for (const stmt of filteredStmts) {
    const emitted = emitTopLevelStmt(stmt, ctx);
    if (emitted !== null) declParts.push(emitted);
  }

  for (const r of required) parts.push(r);
  if (declParts.length > 0) parts.push(declParts.join(";"));

  return parts.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface Ctx {
  typed: boolean;
  jsx: boolean;
  requiredImports: Map<string, Set<string>>; // module -> names
  usedAliases: Set<string>;
  sourceFile: ts.SourceFile;
}

// ---------------------------------------------------------------------------
// Import hint collection
// ---------------------------------------------------------------------------

function collectImportHint(node: ts.ImportDeclaration): string | null {
  const moduleSpec = node.moduleSpecifier;
  if (!ts.isStringLiteral(moduleSpec)) return null;
  const modulePath = moduleSpec.text;

  // Skip imports that will be auto-resolved by alias map
  const autoResolved = new Set(["react", "fs", "path"]);
  if (autoResolved.has(modulePath)) return null;

  const clause = node.importClause;
  if (!clause) return `!r:${modulePath}:*`;

  const names: string[] = [];
  if (clause.name) names.push(clause.name.text); // default import
  const bindings = clause.namedBindings;
  if (bindings) {
    if (ts.isNamespaceImport(bindings)) {
      names.push(`*as ${bindings.name.text}`);
    } else if (ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if (el.propertyName) {
          names.push(`${el.propertyName.text} as ${el.name.text}`);
        } else {
          names.push(el.name.text);
        }
      }
    }
  }
  return `!r:${modulePath}:${names.join(",")}`;
}

// ---------------------------------------------------------------------------
// Top-level statement emission
// ---------------------------------------------------------------------------

function emitTopLevelStmt(stmt: ts.Statement, ctx: Ctx): string | null {
  if (ts.isInterfaceDeclaration(stmt)) return emitInterface(stmt, ctx);
  if (ts.isTypeAliasDeclaration(stmt)) return emitTypeAlias(stmt, ctx);
  if (ts.isClassDeclaration(stmt)) return emitClass(stmt, ctx);
  if (ts.isEnumDeclaration(stmt)) return emitEnum(stmt, ctx);
  if (ts.isFunctionDeclaration(stmt)) return emitFunction(stmt, ctx, /*topLevel*/ true);
  if (ts.isVariableStatement(stmt)) return emitVariableStmt(stmt, ctx, /*topLevel*/ true);
  if (ts.isModuleDeclaration(stmt)) return emitNamespace(stmt, ctx);
  if (ts.isExportAssignment(stmt)) return emitExportAssignment(stmt, ctx);
  return emitStmt(stmt, ctx);
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

function emitInterface(node: ts.InterfaceDeclaration, ctx: Ctx): string {
  const mods = modifierPrefix(node);
  const name = node.name.text;
  const typeParams = emitTypeParams(node.typeParameters, ctx);

  let heritage = "";
  if (node.heritageClauses) {
    const extendsClause = node.heritageClauses.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
    if (extendsClause && extendsClause.types.length > 0) {
      heritage = ":" + extendsClause.types.map(t => emitTypeNode(t.expression as any, ctx) + emitTypeArgs(t.typeArguments, ctx)).join(",");
    }
  }

  const members = node.members.map(m => emitTypeMember(m, ctx)).filter(s => s.length > 0).join(";");
  return `${mods}@${name}${typeParams}${heritage}{${members}}`;
}

// ---------------------------------------------------------------------------
// Type alias
// ---------------------------------------------------------------------------

function emitTypeAlias(node: ts.TypeAliasDeclaration, ctx: Ctx): string {
  const mods = modifierPrefix(node);
  const name = node.name.text;
  const typeParams = emitTypeParams(node.typeParameters, ctx);
  const type = emitTypeNode(node.type, ctx);
  return `${mods}=${name}${typeParams}=${type}`;
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

function emitClass(node: ts.ClassDeclaration, ctx: Ctx): string {
  const mods = modifierPrefix(node);
  const name = node.name ? node.name.text : "_";
  const typeParams = emitTypeParams(node.typeParameters, ctx);

  let heritage = "";
  if (node.heritageClauses) {
    const extendsClause = node.heritageClauses.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
    if (extendsClause && extendsClause.types.length > 0) {
      const t = extendsClause.types[0];
      heritage += ":" + emitExpr(t.expression, ctx) + emitTypeArgs(t.typeArguments, ctx);
    }
    const implementsClause = node.heritageClauses.find(h => h.token === ts.SyntaxKind.ImplementsKeyword);
    if (implementsClause && implementsClause.types.length > 0) {
      heritage += "[" + implementsClause.types.map(t => emitExpr(t.expression, ctx) + emitTypeArgs(t.typeArguments, ctx)).join(",") + "]";
    }
  }

  const decorators = emitDecorators(node, ctx);
  const members = node.members.map(m => emitClassMember(m, ctx)).filter(s => s.length > 0).join(";");
  return `${decorators}${mods}@${name}${typeParams}${heritage}{${members}}`;
}

function emitClassMember(member: ts.ClassElement, ctx: Ctx): string {
  if (ts.isPropertyDeclaration(member)) {
    const mods = memberModifierPrefix(member);
    const name = propertyName(member.name);
    const opt = member.questionToken ? "?" : "";
    // Class field types kept in default mode (part of public contract)
    const type = member.type ? ":" + emitTypeNode(member.type, ctx) : "";
    const init = member.initializer ? "=" + emitExpr(member.initializer, ctx) : "";
    return `${mods}${name}${opt}${type}${init}`;
  }
  if (ts.isMethodDeclaration(member)) {
    const mods = memberModifierPrefix(member);
    const name = propertyName(member.name);
    const body = member.body ? emitBlock(member.body, ctx) : "";
    const tp = emitTypeParams(member.typeParameters, ctx);
    const params = emitParamList(member.parameters, ctx);
    // Drop method return types in default mode
    const rt = (member.type && ctx.typed) ? "->" + emitTypeNode(member.type, ctx) : "";
    return `${mods}${name}${tp}${params}${rt}${body}`;
  }
  if (ts.isConstructorDeclaration(member)) {
    const params = emitParamList(member.parameters, ctx, /*ctor*/ true);
    const body = member.body ? emitBlock(member.body, ctx) : "{}";
    return `init${params}${body}`;
  }
  if (ts.isGetAccessorDeclaration(member)) {
    const mods = memberModifierPrefix(member);
    const name = propertyName(member.name);
    const body = member.body ? emitBlock(member.body, ctx) : "{}";
    const rt = (member.type && ctx.typed) ? "->" + emitTypeNode(member.type, ctx) : "";
    return `${mods}get ${name}()${rt}${body}`;
  }
  if (ts.isSetAccessorDeclaration(member)) {
    const mods = memberModifierPrefix(member);
    const name = propertyName(member.name);
    const params = emitParamList(member.parameters, ctx);
    const body = member.body ? emitBlock(member.body, ctx) : "{}";
    return `${mods}set ${name}${params}${body}`;
  }
  if (ts.isIndexSignatureDeclaration(member)) {
    const p = member.parameters[0];
    const keyName = p.name && ts.isIdentifier(p.name) ? p.name.text : "_";
    const keyType = p.type ? emitTypeNode(p.type, ctx) : "s";
    const valueType = emitTypeNode(member.type, ctx);
    return `[${keyName}:${keyType}]:${valueType}`;
  }
  if (ts.isSemicolonClassElement(member)) return "";
  return "/*unsupported class member*/";
}

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

function emitEnum(node: ts.EnumDeclaration, ctx: Ctx): string {
  const mods = modifierPrefix(node);
  const isConst = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ConstKeyword) ?? false;
  const name = node.name.text;
  const members = node.members.map(m => {
    const n = propertyName(m.name);
    if (m.initializer) return `${n}=${emitExpr(m.initializer, ctx)}`;
    return n;
  }).join(",");
  return `${mods}${isConst ? "cn " : ""}#${name}{${members}}`;
}

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

function emitFunction(node: ts.FunctionDeclaration, ctx: Ctx, topLevel: boolean): string {
  const mods = modifierPrefix(node);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
  const isGenerator = !!node.asteriskToken;
  const name = node.name ? node.name.text : "_";
  const tp = emitTypeParams(node.typeParameters, ctx);
  const params = emitParamList(node.parameters, ctx);

  // Default: drop return types. --typed: keep.
  let rt = "";
  if (node.type && ctx.typed) {
    rt = "->" + emitTypeNode(node.type, ctx);
  }

  const body = node.body ? emitBlock(node.body, ctx) : "";
  const prefix = (isAsync ? "a " : "") + (isGenerator ? "*" : "");
  return `${mods}${prefix}${name}${tp}${params}${rt}${body}`;
}

// ---------------------------------------------------------------------------
// Variable statement
// ---------------------------------------------------------------------------

function emitVariableStmt(node: ts.VariableStatement, ctx: Ctx, topLevel: boolean): string {
  const mods = modifierPrefix(node);
  const flags = node.declarationList.flags;
  const keyword =
    flags & ts.NodeFlags.Const ? "" :
    flags & ts.NodeFlags.Let ? "let " :
    "var ";

  const decls = node.declarationList.declarations.map(d => {
    const binding = emitBinding(d.name, ctx);
    const type = (ctx.typed && d.type) ? ":" + emitTypeNode(d.type, ctx) : "";
    const init = d.initializer ? "=" + emitExpr(d.initializer, ctx) : "";
    // Use `:=` for const, otherwise use keyword + binding + type + init
    if (keyword === "") {
      return `:=${binding}${type}${init}`;
    }
    return `${keyword}${binding}${type}${init}`;
  });
  return mods + decls.join(";");
}

// ---------------------------------------------------------------------------
// Namespace
// ---------------------------------------------------------------------------

function emitNamespace(node: ts.ModuleDeclaration, ctx: Ctx): string {
  const mods = modifierPrefix(node);
  const name = node.name.getText(ctx.sourceFile);
  let body = "{}";
  if (node.body && ts.isModuleBlock(node.body)) {
    const inner = node.body.statements.map(s => emitTopLevelStmt(s, ctx)).filter(Boolean).join(";");
    body = `{${inner}}`;
  }
  return `${mods}ns ${name}${body}`;
}

function emitExportAssignment(node: ts.ExportAssignment, ctx: Ctx): string {
  const expr = emitExpr(node.expression, ctx);
  return `+d ${expr}`;
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

function emitStmt(stmt: ts.Statement, ctx: Ctx): string {
  if (ts.isBlock(stmt)) return emitBlock(stmt, ctx);
  if (ts.isIfStatement(stmt)) return emitIf(stmt, ctx);
  if (ts.isForStatement(stmt)) return emitFor(stmt, ctx);
  if (ts.isForOfStatement(stmt)) return emitForOf(stmt, ctx);
  if (ts.isForInStatement(stmt)) return emitForIn(stmt, ctx);
  if (ts.isWhileStatement(stmt)) return `while ${emitExpr(stmt.expression, ctx)}${wrapBlock(stmt.statement, ctx)}`;
  if (ts.isDoStatement(stmt)) return `do${wrapBlock(stmt.statement, ctx)}while ${emitExpr(stmt.expression, ctx)}`;
  if (ts.isSwitchStatement(stmt)) return emitSwitch(stmt, ctx);
  if (ts.isTryStatement(stmt)) return emitTry(stmt, ctx);
  if (ts.isThrowStatement(stmt)) return `throw ${emitExpr(stmt.expression, ctx)}`;
  if (ts.isReturnStatement(stmt)) {
    if (!stmt.expression) return "^";
    return "^" + emitExpr(stmt.expression, ctx);
  }
  if (ts.isExpressionStatement(stmt)) return emitExpr(stmt.expression, ctx);
  if (ts.isVariableStatement(stmt)) return emitVariableStmt(stmt, ctx, false);
  if (ts.isBreakStatement(stmt)) return stmt.label ? `break ${stmt.label.text}` : "break";
  if (ts.isContinueStatement(stmt)) return stmt.label ? `continue ${stmt.label.text}` : "continue";
  if (ts.isLabeledStatement(stmt)) return `${stmt.label.text}:${emitStmt(stmt.statement, ctx)}`;
  if (ts.isFunctionDeclaration(stmt)) return emitFunction(stmt, ctx, false);
  if (ts.isClassDeclaration(stmt)) return emitClass(stmt, ctx);
  if (ts.isInterfaceDeclaration(stmt)) return emitInterface(stmt, ctx);
  if (ts.isTypeAliasDeclaration(stmt)) return emitTypeAlias(stmt, ctx);
  if (ts.isEnumDeclaration(stmt)) return emitEnum(stmt, ctx);
  if (stmt.kind === ts.SyntaxKind.EmptyStatement) return "";
  return `/*unsupported stmt:${ts.SyntaxKind[stmt.kind]}*/`;
}

function emitBlock(block: ts.Block, ctx: Ctx): string {
  const stmts = block.statements.map(s => emitStmt(s, ctx)).filter(s => s.length > 0);
  return "{" + stmts.join(";") + "}";
}

function wrapBlock(stmt: ts.Statement, ctx: Ctx): string {
  if (ts.isBlock(stmt)) return emitBlock(stmt, ctx);
  return "{" + emitStmt(stmt, ctx) + "}";
}

function emitIf(node: ts.IfStatement, ctx: Ctx): string {
  const cond = emitExpr(node.expression, ctx);
  const thenPart = wrapBlock(node.thenStatement, ctx);
  if (!node.elseStatement) return `if ${cond}${thenPart}`;
  if (ts.isIfStatement(node.elseStatement)) {
    return `if ${cond}${thenPart}else ${emitIf(node.elseStatement, ctx)}`;
  }
  return `if ${cond}${thenPart}else${wrapBlock(node.elseStatement, ctx)}`;
}

function emitFor(node: ts.ForStatement, ctx: Ctx): string {
  let init = "";
  if (node.initializer) {
    if (ts.isVariableDeclarationList(node.initializer)) {
      // C-style for loops always use `:=` for the loop variable (equivalent to const/let/var in loop init)
      const decls = node.initializer.declarations.map(d => {
        const bind = emitBinding(d.name, ctx);
        const val = d.initializer ? "=" + emitExpr(d.initializer, ctx) : "";
        return bind + val;
      }).join(",");
      init = `:=${decls}`;
    } else {
      init = emitExpr(node.initializer, ctx);
    }
  }
  const cond = node.condition ? emitExpr(node.condition, ctx) : "";
  const upd = node.incrementor ? emitExpr(node.incrementor, ctx) : "";
  return `for ${init};${cond};${upd}${wrapBlock(node.statement, ctx)}`;
}

function emitForOf(node: ts.ForOfStatement, ctx: Ctx): string {
  const isAwait = !!node.awaitModifier;
  const init = emitForInit(node.initializer, ctx);
  const iter = emitExpr(node.expression, ctx);
  return `for ${isAwait ? "a " : ""}${init} of ${iter}${wrapBlock(node.statement, ctx)}`;
}

function emitForIn(node: ts.ForInStatement, ctx: Ctx): string {
  const init = emitForInit(node.initializer, ctx);
  const iter = emitExpr(node.expression, ctx);
  return `for ${init} in ${iter}${wrapBlock(node.statement, ctx)}`;
}

function emitForInit(init: ts.ForInitializer, ctx: Ctx): string {
  if (ts.isVariableDeclarationList(init)) {
    const d = init.declarations[0];
    const name = emitBinding(d.name, ctx);
    const flags = init.flags;
    if (flags & ts.NodeFlags.Const) return `:=${name}`;
    if (flags & ts.NodeFlags.Let) return `let ${name}`;
    return `var ${name}`;
  }
  return emitExpr(init as ts.Expression, ctx);
}

function emitSwitch(node: ts.SwitchStatement, ctx: Ctx): string {
  const tag = emitExpr(node.expression, ctx);
  const cases = node.caseBlock.clauses.map(c => {
    const body = c.statements.map(s => emitStmt(s, ctx)).filter(Boolean).join(";");
    if (ts.isDefaultClause(c)) return `_:${body}`;
    return `case ${emitExpr(c.expression, ctx)}:${body}`;
  }).join(";");
  return `switch ${tag}{${cases}}`;
}

function emitTry(node: ts.TryStatement, ctx: Ctx): string {
  let out = "try" + emitBlock(node.tryBlock, ctx);
  if (node.catchClause) {
    const cc = node.catchClause;
    if (cc.variableDeclaration) {
      const name = emitBinding(cc.variableDeclaration.name, ctx);
      const t = cc.variableDeclaration.type ? ":" + emitTypeNode(cc.variableDeclaration.type, ctx) : "";
      out += `catch ${name}${t}${emitBlock(cc.block, ctx)}`;
    } else {
      out += "catch" + emitBlock(cc.block, ctx);
    }
  }
  if (node.finallyBlock) out += "finally" + emitBlock(node.finallyBlock, ctx);
  return out;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

function emitExpr(expr: ts.Expression, ctx: Ctx): string {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isStringLiteral(expr)) return JSON.stringify(expr.text);
  if (ts.isNumericLiteral(expr)) return expr.text;
  if (ts.isBigIntLiteral(expr)) return expr.text;
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return "false";
  if (expr.kind === ts.SyntaxKind.NullKeyword) return "null";
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (expr.kind === ts.SyntaxKind.SuperKeyword) return "super";
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return "`" + expr.text.replace(/`/g, "\\`") + "`";
  if (ts.isTemplateExpression(expr)) return emitTemplate(expr, ctx);
  if (ts.isRegularExpressionLiteral(expr)) return expr.text;
  if (ts.isBinaryExpression(expr)) return emitBinary(expr, ctx);
  if (ts.isPrefixUnaryExpression(expr)) return ts.tokenToString(expr.operator) + emitExpr(expr.operand, ctx);
  if (ts.isPostfixUnaryExpression(expr)) return emitExpr(expr.operand, ctx) + ts.tokenToString(expr.operator);
  if (ts.isConditionalExpression(expr)) return `${emitExpr(expr.condition, ctx)}?${emitExpr(expr.whenTrue, ctx)}:${emitExpr(expr.whenFalse, ctx)}`;
  if (ts.isCallExpression(expr)) return emitCall(expr, ctx);
  if (ts.isNewExpression(expr)) return emitNew(expr, ctx);
  if (ts.isPropertyAccessExpression(expr)) return emitPropertyAccess(expr, ctx);
  if (ts.isElementAccessExpression(expr)) return `${emitExpr(expr.expression, ctx)}[${emitExpr(expr.argumentExpression, ctx)}]`;
  if (ts.isArrowFunction(expr)) return emitArrow(expr, ctx);
  if (ts.isFunctionExpression(expr)) return emitFunctionExpr(expr, ctx);
  if (ts.isArrayLiteralExpression(expr)) return "[" + expr.elements.map(e => emitExpr(e, ctx)).join(",") + "]";
  if (ts.isObjectLiteralExpression(expr)) return emitObjectLit(expr, ctx);
  if (ts.isSpreadElement(expr)) return "..." + emitExpr(expr.expression, ctx);
  if (ts.isParenthesizedExpression(expr)) {
    // Drop redundant parens around JSX (very common: `return (<div>...</div>);`).
    const inner = expr.expression;
    if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
      return emitExpr(inner, ctx);
    }
    return "(" + emitExpr(expr.expression, ctx) + ")";
  }
  if (ts.isAsExpression(expr)) {
    const t = expr.type;
    // Detect `as const`
    if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === "const") {
      return emitExpr(expr.expression, ctx) + " ac";
    }
    return `${emitExpr(expr.expression, ctx)} as ${emitTypeNode(t, ctx)}`;
  }
  if (ts.isSatisfiesExpression(expr)) return `${emitExpr(expr.expression, ctx)} sat ${emitTypeNode(expr.type, ctx)}`;
  if (ts.isTypeAssertionExpression(expr)) return `<${emitTypeNode(expr.type, ctx)}>${emitExpr(expr.expression, ctx)}`;
  if (ts.isNonNullExpression(expr)) return emitExpr(expr.expression, ctx) + "!";
  if (ts.isAwaitExpression(expr)) return "w " + emitExpr(expr.expression, ctx);
  if (ts.isYieldExpression(expr)) {
    const star = expr.asteriskToken ? "*" : "";
    return "yield" + star + (expr.expression ? " " + emitExpr(expr.expression, ctx) : "");
  }
  if (ts.isSpreadAssignment(expr as any)) return "..." + emitExpr((expr as any).expression, ctx);
  if (ts.isJsxElement(expr)) return emitJsxElement(expr, ctx);
  if (ts.isJsxSelfClosingElement(expr)) return emitJsxSelfClose(expr, ctx);
  if (ts.isJsxFragment(expr)) return emitJsxFragment(expr, ctx);
  if (ts.isJsxExpression(expr as any)) return emitJsxExpression(expr as any, ctx);
  if (ts.isClassExpression(expr)) return emitClassExpr(expr, ctx);
  if (expr.kind === ts.SyntaxKind.OmittedExpression) return "";
  return `/*unsupported expr:${ts.SyntaxKind[expr.kind]}*/`;
}

function emitTemplate(expr: ts.TemplateExpression, ctx: Ctx): string {
  let out = "`" + escapeTemplateText(expr.head.text);
  for (const span of expr.templateSpans) {
    out += "${" + emitExpr(span.expression, ctx) + "}";
    out += escapeTemplateText(span.literal.text);
  }
  return out + "`";
}

function escapeTemplateText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function emitBinary(expr: ts.BinaryExpression, ctx: Ctx): string {
  const op = ts.tokenToString(expr.operatorToken.kind) || "";
  return emitExpr(expr.left, ctx) + op + emitExpr(expr.right, ctx);
}

function emitCall(expr: ts.CallExpression, ctx: Ctx): string {
  const callee = emitCalleeWithAlias(expr.expression, ctx);
  // Drop generic type arguments from calls in default mode (they're inferrable)
  const typeArgs = ctx.typed ? emitTypeArgs(expr.typeArguments, ctx) : "";
  const args = expr.arguments.map(a => emitExpr(a, ctx)).join(",");
  return `${callee}${typeArgs}(${args})`;
}

function emitNew(expr: ts.NewExpression, ctx: Ctx): string {
  const callee = emitExpr(expr.expression, ctx);
  const typeArgs = ctx.typed ? emitTypeArgs(expr.typeArguments, ctx) : "";
  const args = (expr.arguments || []).map(a => emitExpr(a, ctx)).join(",");
  // Always include `new` — eliding it is unsafe when the result is further member-accessed
  // (e.g., `new Date().toISOString()` vs `Date().toISOString()` — the latter calls Date as
  // a function, which returns a string, not a Date instance).
  return `new ${callee}${typeArgs}(${args})`;
}

function emitCalleeWithAlias(callee: ts.Expression, ctx: Ctx): string {
  // Check for property access that matches a stdlib alias
  const fullText = getFullName(callee);
  if (fullText && tsReverseAliasMap[fullText]) {
    const alias = tsReverseAliasMap[fullText];
    ctx.usedAliases.add(alias);
    return alias;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return emitPropertyAccess(callee, ctx);
  }
  return emitExpr(callee, ctx);
}

function getFullName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const base = getFullName(expr.expression);
    if (base === null) return null;
    return base + "." + expr.name.text;
  }
  return null;
}

function emitPropertyAccess(expr: ts.PropertyAccessExpression, ctx: Ctx): string {
  // Special case: console.log -> pl, JSON.stringify -> jd, etc.
  const full = getFullName(expr);
  if (full && tsReverseAliasMap[full]) {
    const alias = tsReverseAliasMap[full];
    ctx.usedAliases.add(alias);
    return alias;
  }
  // Inside method body: this.x -> .x
  if (expr.expression.kind === ts.SyntaxKind.ThisKeyword) {
    return "." + expr.name.text;
  }
  const base = emitExpr(expr.expression, ctx);
  const q = expr.questionDotToken ? "?." : ".";
  return base + q + expr.name.text;
}

function emitArrow(expr: ts.ArrowFunction, ctx: Ctx): string {
  const isAsync = hasModifier(expr, ts.SyntaxKind.AsyncKeyword);
  const tp = emitTypeParams(expr.typeParameters, ctx);
  // Paren-drop for single simple-identifier param (no type, default, rest, optional, destructure)
  let params: string;
  if (!tp && expr.parameters.length === 1) {
    const p = expr.parameters[0];
    if (ts.isIdentifier(p.name) && !p.dotDotDotToken && !p.questionToken && !p.type && !p.initializer) {
      params = p.name.text;
    } else {
      params = emitParamList(expr.parameters, ctx);
    }
  } else {
    params = emitParamList(expr.parameters, ctx);
  }
  const rt = (ctx.typed && expr.type) ? "->" + emitTypeNode(expr.type, ctx) : "";
  let body: string;
  if (ts.isBlock(expr.body)) {
    body = emitBlock(expr.body, ctx);
  } else {
    body = emitExpr(expr.body, ctx);
  }
  return `${isAsync ? "a " : ""}${tp}${params}${rt}=>${body}`;
}

function emitFunctionExpr(expr: ts.FunctionExpression, ctx: Ctx): string {
  const isAsync = hasModifier(expr, ts.SyntaxKind.AsyncKeyword);
  const isGen = !!expr.asteriskToken;
  const name = expr.name ? expr.name.text : "";
  const tp = emitTypeParams(expr.typeParameters, ctx);
  const params = emitParamList(expr.parameters, ctx);
  const rt = (ctx.typed && expr.type) ? "->" + emitTypeNode(expr.type, ctx) : "";
  const body = expr.body ? emitBlock(expr.body, ctx) : "";
  return `${isAsync ? "a " : ""}fn ${isGen ? "*" : ""}${name}${tp}${params}${rt}${body}`;
}

function emitObjectLit(expr: ts.ObjectLiteralExpression, ctx: Ctx): string {
  const props = expr.properties.map(p => {
    if (ts.isPropertyAssignment(p)) {
      const key = propertyName(p.name);
      return `${key}:${emitExpr(p.initializer, ctx)}`;
    }
    if (ts.isShorthandPropertyAssignment(p)) {
      return p.name.text;
    }
    if (ts.isSpreadAssignment(p)) {
      return "..." + emitExpr(p.expression, ctx);
    }
    if (ts.isMethodDeclaration(p)) {
      const name = propertyName(p.name);
      const params = emitParamList(p.parameters, ctx);
      const body = p.body ? emitBlock(p.body, ctx) : "{}";
      const isAsync = hasModifier(p, ts.SyntaxKind.AsyncKeyword);
      return `${isAsync ? "a " : ""}${name}${params}${body}`;
    }
    if (ts.isGetAccessorDeclaration(p)) {
      const name = propertyName(p.name);
      const body = p.body ? emitBlock(p.body, ctx) : "{}";
      return `get ${name}()${body}`;
    }
    if (ts.isSetAccessorDeclaration(p)) {
      const name = propertyName(p.name);
      const params = emitParamList(p.parameters, ctx);
      const body = p.body ? emitBlock(p.body, ctx) : "{}";
      return `set ${name}${params}${body}`;
    }
    return "/*?*/";
  });
  return "{" + props.join(",") + "}";
}

function emitClassExpr(expr: ts.ClassExpression, ctx: Ctx): string {
  // Treat like class decl without name emission
  const members = expr.members.map(m => emitClassMember(m, ctx)).filter(Boolean).join(";");
  return `@{${members}}`;
}

// ---------------------------------------------------------------------------
// JSX
// ---------------------------------------------------------------------------

function emitJsxElement(node: ts.JsxElement, ctx: Ctx): string {
  const openText = emitJsxOpen(node.openingElement, ctx, /*self*/ false);
  const children = node.children.map(c => emitJsxChild(c, ctx)).join("");
  const closeName = node.closingElement.tagName.getText(ctx.sourceFile);
  return `${openText}${children}</${closeName}>`;
}

function emitJsxSelfClose(node: ts.JsxSelfClosingElement, ctx: Ctx): string {
  return emitJsxOpen(node, ctx, /*self*/ true);
}

function emitJsxOpen(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, ctx: Ctx, selfClose: boolean): string {
  const tagName = node.tagName.getText(ctx.sourceFile);
  const typeArgs = node.typeArguments ? "<" + node.typeArguments.map(t => emitTypeNode(t, ctx)).join(",") + ">" : "";
  const attrs = emitJsxAttributes(node.attributes, ctx);
  return `<${tagName}${typeArgs}${attrs}${selfClose ? "/>" : ">"}`;
}

function emitJsxAttributes(attrs: ts.JsxAttributes, ctx: Ctx): string {
  const parts: string[] = [];
  for (const attr of attrs.properties) {
    if (ts.isJsxAttribute(attr)) {
      const name = ts.isIdentifier(attr.name) ? attr.name.text : attr.name.getText(ctx.sourceFile);
      if (!attr.initializer) {
        parts.push(" " + name);
      } else if (ts.isStringLiteral(attr.initializer)) {
        parts.push(` ${name}=${JSON.stringify(attr.initializer.text)}`);
      } else if (ts.isJsxExpression(attr.initializer)) {
        const inner = attr.initializer.expression ? emitExpr(attr.initializer.expression, ctx) : "";
        parts.push(` ${name}={${inner}}`);
      }
    } else if (ts.isJsxSpreadAttribute(attr)) {
      parts.push(` {...${emitExpr(attr.expression, ctx)}}`);
    }
  }
  return parts.join("");
}

function emitJsxChild(child: ts.JsxChild, ctx: Ctx): string {
  if (ts.isJsxText(child)) {
    // Collapse pure-whitespace text to empty (React/JSX convention)
    const text = child.text;
    if (/^\s*$/.test(text)) return "";
    // Wrap JSX text in `{"..."}` to make it unambiguous for the AET parser.
    // (JSX text is context-sensitive and can contain arbitrary `/`, `:`, etc.
    // which would confuse a general-purpose JS lexer.)
    const trimmed = text.replace(/^\s+|\s+$/g, (m) => m.includes("\n") ? "" : m);
    return "{" + JSON.stringify(trimmed) + "}";
  }
  if (ts.isJsxExpression(child)) {
    return "{" + (child.expression ? emitExpr(child.expression, ctx) : "") + "}";
  }
  if (ts.isJsxElement(child)) return emitJsxElement(child, ctx);
  if (ts.isJsxSelfClosingElement(child)) return emitJsxSelfClose(child, ctx);
  if (ts.isJsxFragment(child)) return emitJsxFragment(child, ctx);
  return "";
}

function emitJsxFragment(node: ts.JsxFragment, ctx: Ctx): string {
  const children = node.children.map(c => emitJsxChild(c, ctx)).join("");
  return `<>${children}</>`;
}

function emitJsxExpression(node: ts.JsxExpression, ctx: Ctx): string {
  return "{" + (node.expression ? emitExpr(node.expression, ctx) : "") + "}";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

function emitTypeNode(type: ts.TypeNode, ctx: Ctx): string {
  switch (type.kind) {
    case ts.SyntaxKind.StringKeyword: return "s";
    case ts.SyntaxKind.NumberKeyword: return "n";
    case ts.SyntaxKind.BooleanKeyword: return "b";
    case ts.SyntaxKind.VoidKeyword: return "v";
    case ts.SyntaxKind.UndefinedKeyword: return "u";
    case ts.SyntaxKind.AnyKeyword: return "A";
    case ts.SyntaxKind.UnknownKeyword: return "uk";
    case ts.SyntaxKind.NeverKeyword: return "nv";
    case ts.SyntaxKind.BigIntKeyword: return "bi";
    case ts.SyntaxKind.SymbolKeyword: return "sy";
    case ts.SyntaxKind.ObjectKeyword: return "object";
    case ts.SyntaxKind.NullKeyword: return "null";
    case ts.SyntaxKind.ThisType: return "this";
  }
  if (ts.isTypeReferenceNode(type)) {
    const name = getTypeName(type.typeName);
    const alias = TS_UTILITY_ALIASES[name] || name;
    const args = emitTypeArgs(type.typeArguments, ctx);
    return alias + args;
  }
  if (ts.isArrayTypeNode(type)) return emitTypeNode(type.elementType, ctx) + "[]";
  if (ts.isTupleTypeNode(type)) {
    return "[" + type.elements.map(e => emitTypeNode(e, ctx)).join(",") + "]";
  }
  if (ts.isUnionTypeNode(type)) return type.types.map(t => emitTypeNode(t, ctx)).join("|");
  if (ts.isIntersectionTypeNode(type)) return type.types.map(t => emitTypeNode(t, ctx)).join("&");
  if (ts.isFunctionTypeNode(type)) {
    const tp = emitTypeParams(type.typeParameters, ctx);
    const params = emitParamList(type.parameters, ctx);
    const rt = emitTypeNode(type.type, ctx);
    return `${tp}${params}->${rt}`;
  }
  if (ts.isTypeLiteralNode(type)) {
    const members = type.members.map(m => emitTypeMember(m, ctx)).filter(Boolean).join(";");
    return `{${members}}`;
  }
  if (ts.isConditionalTypeNode(type)) {
    const c = emitTypeNode(type.checkType, ctx);
    const e = emitTypeNode(type.extendsType, ctx);
    const t = emitTypeNode(type.trueType, ctx);
    const f = emitTypeNode(type.falseType, ctx);
    return `${c}:${e}?${t}:${f}`;
  }
  if (ts.isMappedTypeNode(type)) {
    const tpName = type.typeParameter.name.text;
    const constraint = type.typeParameter.constraint ? emitTypeNode(type.typeParameter.constraint, ctx) : "A";
    const valueType = type.type ? emitTypeNode(type.type, ctx) : "A";
    const readonly = type.readonlyToken ? "!" : "";
    const optional = type.questionToken ? "?" : "";
    return `{${readonly}[${tpName} in ${constraint}]${optional}:${valueType}}`;
  }
  if (ts.isIndexedAccessTypeNode(type)) {
    return `${emitTypeNode(type.objectType, ctx)}[${emitTypeNode(type.indexType, ctx)}]`;
  }
  if (ts.isLiteralTypeNode(type)) {
    const lit = type.literal;
    if (ts.isStringLiteral(lit)) return JSON.stringify(lit.text);
    if (ts.isNumericLiteral(lit)) return lit.text;
    if (lit.kind === ts.SyntaxKind.TrueKeyword) return "true";
    if (lit.kind === ts.SyntaxKind.FalseKeyword) return "false";
    if (lit.kind === ts.SyntaxKind.NullKeyword) return "null";
    if (ts.isPrefixUnaryExpression(lit as any)) return "-" + (lit as any).operand.text;
    return lit.getText(ctx.sourceFile);
  }
  if (ts.isTemplateLiteralTypeNode(type)) {
    let out = "`" + escapeTemplateText(type.head.text);
    for (const span of type.templateSpans) {
      out += "${" + emitTypeNode(span.type, ctx) + "}";
      out += escapeTemplateText(span.literal.text);
    }
    return out + "`";
  }
  if (ts.isParenthesizedTypeNode(type)) return "(" + emitTypeNode(type.type, ctx) + ")";
  if (ts.isTypeOperatorNode(type)) {
    switch (type.operator) {
      case ts.SyntaxKind.KeyOfKeyword: return "ko " + emitTypeNode(type.type, ctx);
      case ts.SyntaxKind.ReadonlyKeyword: return "! " + emitTypeNode(type.type, ctx);
      case ts.SyntaxKind.UniqueKeyword: return "unique " + emitTypeNode(type.type, ctx);
    }
  }
  if (ts.isTypeQueryNode(type)) return "typeof " + type.exprName.getText(ctx.sourceFile);
  if (ts.isInferTypeNode(type)) return "infer " + type.typeParameter.name.text;
  if (ts.isTypePredicateNode(type)) {
    const name = type.parameterName.getText(ctx.sourceFile);
    const t = type.type ? emitTypeNode(type.type, ctx) : "A";
    const asserts = type.assertsModifier ? "asserts " : "";
    return `${asserts}${name} is ${t}`;
  }
  if (ts.isConstructorTypeNode(type)) {
    const params = emitParamList(type.parameters, ctx);
    const rt = emitTypeNode(type.type, ctx);
    return `new ${params}->${rt}`;
  }
  if (ts.isRestTypeNode(type)) return "..." + emitTypeNode(type.type, ctx);
  return type.getText(ctx.sourceFile);
}

function getTypeName(name: ts.EntityName): string {
  if (ts.isIdentifier(name)) return name.text;
  return getTypeName(name.left) + "." + name.right.text;
}

function emitTypeArgs(args: readonly ts.TypeNode[] | undefined, ctx: Ctx): string {
  if (!args || args.length === 0) return "";
  return "<" + args.map(a => emitTypeNode(a, ctx)).join(",") + ">";
}

function emitTypeParams(params: readonly ts.TypeParameterDeclaration[] | undefined, ctx: Ctx): string {
  if (!params || params.length === 0) return "";
  const parts = params.map(p => {
    let s = p.name.text;
    if (p.constraint) s += ":" + emitTypeNode(p.constraint, ctx);
    if (p.default) s += "=" + emitTypeNode(p.default, ctx);
    return s;
  });
  return "<" + parts.join(",") + ">";
}

function emitTypeMember(m: ts.TypeElement, ctx: Ctx): string {
  if (ts.isPropertySignature(m)) {
    const name = propertyName(m.name);
    const opt = m.questionToken ? "?" : "";
    const readonly = hasModifier(m, ts.SyntaxKind.ReadonlyKeyword) ? "!" : "";
    const type = m.type ? ":" + emitTypeNode(m.type, ctx) : "";
    return `${readonly}${name}${opt}${type}`;
  }
  if (ts.isMethodSignature(m)) {
    const name = propertyName(m.name);
    const tp = emitTypeParams(m.typeParameters, ctx);
    const params = emitParamList(m.parameters, ctx);
    const rt = m.type ? "->" + emitTypeNode(m.type, ctx) : "";
    return `${name}${tp}${params}${rt}`;
  }
  if (ts.isIndexSignatureDeclaration(m)) {
    const p = m.parameters[0];
    const keyName = p.name && ts.isIdentifier(p.name) ? p.name.text : "_";
    const keyType = p.type ? emitTypeNode(p.type, ctx) : "s";
    const valueType = emitTypeNode(m.type, ctx);
    return `[${keyName}:${keyType}]:${valueType}`;
  }
  if (ts.isCallSignatureDeclaration(m)) {
    const tp = emitTypeParams(m.typeParameters, ctx);
    const params = emitParamList(m.parameters, ctx);
    const rt = m.type ? "->" + emitTypeNode(m.type, ctx) : "";
    return `${tp}${params}${rt}`;
  }
  if (ts.isConstructSignatureDeclaration(m)) {
    const tp = emitTypeParams(m.typeParameters, ctx);
    const params = emitParamList(m.parameters, ctx);
    const rt = m.type ? "->" + emitTypeNode(m.type, ctx) : "";
    return `new ${tp}${params}${rt}`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Params & bindings
// ---------------------------------------------------------------------------

function emitParamList(params: readonly ts.ParameterDeclaration[], ctx: Ctx, ctor: boolean = false): string {
  const parts = params.map(p => {
    const rest = p.dotDotDotToken ? "..." : "";
    const name = emitBinding(p.name, ctx);
    const opt = p.questionToken ? "?" : "";
    // Default mode: drop param types. --typed mode: keep them.
    // Exception: constructor parameter properties must keep their types (auto-field).
    const keepType = ctx.typed || (ctor && !!(p as any).modifiers);
    const type = (keepType && p.type) ? ":" + emitTypeNode(p.type, ctx) : "";
    const def = p.initializer ? "=" + emitExpr(p.initializer, ctx) : "";
    let mod = "";
    if (ctor) {
      if (hasModifier(p, ts.SyntaxKind.PrivateKeyword)) mod = "-";
      else if (hasModifier(p, ts.SyntaxKind.ProtectedKeyword)) mod = "~";
      else if (hasModifier(p, ts.SyntaxKind.PublicKeyword)) mod = "+";
      if (hasModifier(p, ts.SyntaxKind.ReadonlyKeyword)) mod += "!";
    }
    return `${mod}${rest}${name}${opt}${type}${def}`;
  });
  return "(" + parts.join(",") + ")";
}

function emitBinding(name: ts.BindingName, ctx: Ctx): string {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isArrayBindingPattern(name)) {
    const parts = name.elements.map(el => {
      if (el.kind === ts.SyntaxKind.OmittedExpression) return "";
      const e = el as ts.BindingElement;
      const rest = e.dotDotDotToken ? "..." : "";
      const n = emitBinding(e.name, ctx);
      const def = e.initializer ? "=" + emitExpr(e.initializer, ctx) : "";
      return rest + n + def;
    });
    return "[" + parts.join(",") + "]";
  }
  if (ts.isObjectBindingPattern(name)) {
    const parts = name.elements.map(el => {
      const rest = el.dotDotDotToken ? "..." : "";
      const n = emitBinding(el.name, ctx);
      const prop = el.propertyName ? propertyName(el.propertyName) + ":" : "";
      const def = el.initializer ? "=" + emitExpr(el.initializer, ctx) : "";
      return rest + prop + n + def;
    });
    return "{" + parts.join(",") + "}";
  }
  return "_";
}

function propertyName(name: ts.PropertyName | ts.DeclarationName | ts.BindingName): string {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return JSON.stringify(name.text);
  if (ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    return "[" + (name.expression.getText(name.getSourceFile()) || "") + "]";
  }
  return (name as any).getText?.() || "_";
}

// ---------------------------------------------------------------------------
// Modifier helpers
// ---------------------------------------------------------------------------

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = (node as any).modifiers as ts.NodeArray<ts.ModifierLike> | undefined;
  if (!mods) return false;
  return mods.some(m => m.kind === kind);
}

function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function modifierPrefix(node: ts.Node): string {
  let out = "";
  const mods = (node as any).modifiers as ts.NodeArray<ts.ModifierLike> | undefined;
  if (!mods) return "";
  const hasExport = mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  const hasDefault = mods.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
  const hasAbstract = mods.some(m => m.kind === ts.SyntaxKind.AbstractKeyword);
  const hasDeclare = mods.some(m => m.kind === ts.SyntaxKind.DeclareKeyword);
  if (hasDeclare) out += "dc ";
  if (hasAbstract) out += "ab ";
  if (hasExport && hasDefault) out += "+d ";
  else if (hasExport) out += "+";
  return out;
}

function memberModifierPrefix(member: ts.ClassElement): string {
  let out = "";
  const mods = (member as any).modifiers as ts.NodeArray<ts.ModifierLike> | undefined;
  if (!mods) return "";
  if (mods.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)) out += "-";
  else if (mods.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword)) out += "~";
  // public is default — skip
  if (mods.some(m => m.kind === ts.SyntaxKind.StaticKeyword)) out += "$";
  if (mods.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword)) out += "!";
  if (mods.some(m => m.kind === ts.SyntaxKind.AbstractKeyword)) out += "ab ";
  if (mods.some(m => m.kind === ts.SyntaxKind.OverrideKeyword)) out += "^";
  if (mods.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) out += "a ";
  return out;
}

function emitDecorators(node: ts.Node, ctx: Ctx): string {
  const mods = (node as any).modifiers as ts.NodeArray<ts.ModifierLike> | undefined;
  if (!mods) return "";
  const decs = mods.filter((m): m is ts.Decorator => m.kind === ts.SyntaxKind.Decorator);
  if (decs.length === 0) return "";
  return decs.map(d => "@" + emitExpr((d as ts.Decorator).expression, ctx) + " ").join("");
}
