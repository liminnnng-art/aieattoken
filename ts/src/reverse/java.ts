// Reverse transpiler: Java → IR → AET
// Uses ASTDumper.java (JDK com.sun.source.tree API) to get JSON AST,
// then converts to IR, then to AET.

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import * as IR from "../ir.js";

// ---------------------------------------------------------------------------
// Reverse alias map: "System.out.println" → "pl"
// ---------------------------------------------------------------------------
let javaReverseAliasMap: Record<string, string> = Object.create(null);
// Track which aliases are constructors: "new StringBuilder" → "Sb"
let javaConstructorAliases: Record<string, string> = Object.create(null);

export function loadJavaReverseAliases(path?: string): void {
  try {
    const p = path || resolve(process.cwd(), "..", "stdlib-aliases-java.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    const aliases = data.aliases || {};
    for (const [alias, info] of Object.entries(aliases) as [string, any][]) {
      if (info.isConstructor) {
        // "new StringBuilder" → strip "new " prefix for matching
        const typeName = info.java.replace(/^new\s+/, "");
        javaConstructorAliases[typeName] = alias;
      } else {
        javaReverseAliasMap[info.java] = alias;
      }
    }
  } catch { /* optional — aliases improve compression but are not required */ }
}

// ---------------------------------------------------------------------------
// parseJavaFile — run ASTDumper via child_process, return parsed JSON AST
// ---------------------------------------------------------------------------
export function parseJavaFile(javaFilePath: string): any {
  const javaCmd = findJavaCommand();
  const astDumperDir = findASTDumperDir();

  // Ensure ASTDumper.class exists; compile if missing
  ensureASTDumperCompiled(javaCmd, astDumperDir);

  try {
    const result = execSync(
      `"${javaCmd}" -cp "${astDumperDir}" ASTDumper "${javaFilePath}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );
    return JSON.parse(result);
  } catch (e: any) {
    throw new Error(`Failed to parse Java file: ${e.message}`);
  }
}

function findJavaCommand(): string {
  // Try java on PATH first
  try {
    execSync("java -version", { encoding: "utf-8", stdio: "pipe" });
    return "java";
  } catch { /* not on PATH */ }

  // Fallback to known Adoptium install location
  const fallback = "C:/Program Files/Eclipse Adoptium/jdk-25.0.2.10-hotspot/bin/java";
  if (existsSync(fallback + ".exe") || existsSync(fallback)) {
    return fallback;
  }
  throw new Error(
    "Java not found. Install a JDK or ensure `java` is on PATH.",
  );
}

function findASTDumperDir(): string {
  const candidates = [
    resolve(process.cwd(), "..", "java-parser"),
    resolve(process.cwd(), "..", "..", "java-parser"),
    resolve(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "java-parser"),
  ];
  for (const dir of candidates) {
    // Normalise Windows paths (URL pathname may add a leading /)
    const d = dir.replace(/^\/([A-Za-z]:)/, "$1");
    if (existsSync(resolve(d, "ASTDumper.java"))) return d;
  }
  throw new Error("ASTDumper.java not found in any expected location.");
}

function ensureASTDumperCompiled(javaCmd: string, dir: string): void {
  if (existsSync(resolve(dir, "ASTDumper.class"))) return;

  // Derive javac from java command
  const javacCmd = javaCmd.replace(/java$/, "javac").replace(/java\.exe$/, "javac.exe");
  try {
    execSync(`"${javacCmd}" "${resolve(dir, "ASTDumper.java")}"`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch (e: any) {
    throw new Error(`Failed to compile ASTDumper.java: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Java type mapping helpers
// ---------------------------------------------------------------------------
const JAVA_TYPE_MAP: Record<string, string> = {
  void: "",
  int: "int",
  long: "int64",
  double: "float64",
  float: "float32",
  boolean: "bool",
  byte: "byte",
  short: "int16",
  char: "rune",
  String: "string",
  Object: "_in",
  Exception: "error",
  RuntimeException: "error",
  Throwable: "error",
};

function mapJavaType(node: any): IR.IRType {
  if (!node) return IR.simpleType("_in");

  switch (node.Kind) {
    case "PrimitiveType": {
      const mapped = JAVA_TYPE_MAP[node.Name] ?? node.Name;
      return IR.simpleType(mapped);
    }
    case "Ident": {
      const name: string = node.Name || "_in";
      const mapped = JAVA_TYPE_MAP[name] ?? name;
      return IR.simpleType(mapped);
    }
    case "ArrayType": {
      const elem = mapJavaType(node.ElemType);
      return IR.sliceType(elem);
    }
    case "ParameterizedType": {
      const baseName: string = typeNodeName(node.Type);
      const typeArgs: any[] = node.TypeArgs || [];
      if (baseName === "List" || baseName === "ArrayList" || baseName === "LinkedList") {
        const elem = typeArgs.length > 0 ? mapJavaType(typeArgs[0]) : IR.simpleType("_in");
        return IR.sliceType(elem);
      }
      if (baseName === "Map" || baseName === "HashMap" || baseName === "TreeMap" || baseName === "LinkedHashMap") {
        const k = typeArgs.length > 0 ? mapJavaType(typeArgs[0]) : IR.simpleType("string");
        const v = typeArgs.length > 1 ? mapJavaType(typeArgs[1]) : IR.simpleType("_in");
        return IR.mapType(k, v);
      }
      if (baseName === "Set" || baseName === "HashSet" || baseName === "TreeSet") {
        const elem = typeArgs.length > 0 ? mapJavaType(typeArgs[0]) : IR.simpleType("_in");
        return IR.mapType(elem, IR.simpleType("bool"));
      }
      if (baseName === "Optional") {
        const elem = typeArgs.length > 0 ? mapJavaType(typeArgs[0]) : IR.simpleType("_in");
        return IR.pointerType(elem);
      }
      return IR.simpleType(baseName);
    }
    case "FieldAccess": {
      const qualifier = typeNodeName(node.Expr);
      return IR.simpleType(`${qualifier}.${node.Name}`);
    }
    default:
      return IR.simpleType(typeNodeName(node));
  }
}

/** Extract a simple name string from a type AST node. */
function typeNodeName(node: any): string {
  if (!node) return "_in";
  if (typeof node === "string") return node;
  if (node.Kind === "Ident") return node.Name || "_in";
  if (node.Kind === "PrimitiveType") return JAVA_TYPE_MAP[node.Name] ?? node.Name;
  if (node.Kind === "FieldAccess") return `${typeNodeName(node.Expr)}.${node.Name}`;
  if (node.Kind === "ParameterizedType") return typeNodeName(node.Type);
  return node.Name || "_in";
}

// ---------------------------------------------------------------------------
// javaAstToIR — main entry point: Java JSON AST → IR
// ---------------------------------------------------------------------------
export function javaAstToIR(javaAst: any): IR.IRProgram {
  const decls: IR.IRNode[] = [];

  for (const decl of javaAst.Decls || []) {
    switch (decl.Kind) {
      case "ClassDecl":
        convertClassDecl(decl, decls);
        break;
      case "InterfaceDecl":
        decls.push(convertInterfaceDecl(decl));
        break;
      case "EnumDecl":
        // Enums become const groups
        decls.push(convertEnumDecl(decl));
        break;
      default:
        break;
    }
  }

  return {
    kind: "Program",
    package: "main",
    imports: [],   // Imports are stripped — AET auto-resolves them
    decls,
    stmtIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Class conversion — the core logic
// ---------------------------------------------------------------------------

function convertClassDecl(node: any, out: IR.IRNode[]): void {
  const name: string = node.Name || "";
  const members: any[] = node.Body || [];

  const methods = members.filter((m: any) => m.Kind === "MethodDecl");
  const constructors = members.filter((m: any) => m.Kind === "ConstructorDecl");
  const fields = members.filter((m: any) => m.Kind === "VarDecl");
  const innerClasses = members.filter((m: any) =>
    m.Kind === "ClassDecl" || m.Kind === "InterfaceDecl" || m.Kind === "EnumDecl",
  );

  const instanceFields = fields.filter(
    (f: any) => !(f.Modifiers || []).includes("static"),
  );
  const allMethodsStatic = methods.length > 0 &&
    methods.every((m: any) => (m.Modifiers || []).includes("static"));
  const hasInstanceFields = instanceFields.length > 0;

  // Strategy 1: All static methods, no instance fields → flatten to top-level functions
  if (allMethodsStatic && !hasInstanceFields) {
    for (const m of methods) {
      out.push(convertMethodDecl(m));
    }
    // Emit static fields as var decls
    for (const f of fields) {
      out.push(convertFieldToVarDecl(f));
    }
    // Recurse inner classes
    for (const ic of innerClasses) {
      if (ic.Kind === "ClassDecl") convertClassDecl(ic, out);
      else if (ic.Kind === "InterfaceDecl") out.push(convertInterfaceDecl(ic));
      else if (ic.Kind === "EnumDecl") out.push(convertEnumDecl(ic));
    }
    return;
  }

  // Strategy 2: Data class with fields + getters/setters → IRStructDecl
  const getterSetterResult = detectGettersSetters(instanceFields, methods);
  if (hasInstanceFields && getterSetterResult.isDataClass) {
    const irFields: IR.IRField[] = instanceFields.map((f: any) => ({
      name: f.Name,
      type: mapJavaType(f.Type),
    }));
    out.push({
      kind: "StructDecl",
      name,
      fields: irFields,
      stmtIndex: 0,
    } as IR.IRStructDecl);

    // Emit non-getter/setter methods as receiver methods
    for (const m of getterSetterResult.remainingMethods) {
      const irFunc = convertMethodDecl(m);
      if (!(m.Modifiers || []).includes("static")) {
        irFunc.receiver = {
          name: name[0]?.toLowerCase() || "r",
          type: IR.simpleType(name),
          pointer: true,
        };
      }
      out.push(irFunc);
    }
    return;
  }

  // Strategy 3: General class → Java_ClassDecl
  const irFields: IR.IRField[] = fields.map((f: any) => ({
    name: f.Name,
    type: mapJavaType(f.Type),
  }));
  const irMethods = methods.map(convertMethodDecl);
  const irConstructors = constructors.map(convertConstructorDecl);
  const irInnerClasses: IR.Java_ClassDecl[] = [];
  for (const ic of innerClasses) {
    if (ic.Kind === "ClassDecl") {
      irInnerClasses.push(convertClassToJavaClassDecl(ic));
    }
  }

  out.push({
    kind: "Java_ClassDecl",
    name,
    modifiers: node.Modifiers || [],
    superClass: node.Extends ? typeNodeName(node.Extends) : undefined,
    interfaces: (node.Implements || []).map(typeNodeName),
    fields: irFields,
    methods: irMethods,
    constructors: irConstructors,
    innerClasses: irInnerClasses,
    stmtIndex: 0,
  } as IR.Java_ClassDecl);
}

function convertClassToJavaClassDecl(node: any): IR.Java_ClassDecl {
  const members: any[] = node.Body || [];
  const methods = members.filter((m: any) => m.Kind === "MethodDecl");
  const constructors = members.filter((m: any) => m.Kind === "ConstructorDecl");
  const fields = members.filter((m: any) => m.Kind === "VarDecl");
  const innerClasses = members.filter((m: any) => m.Kind === "ClassDecl");

  return {
    kind: "Java_ClassDecl",
    name: node.Name || "",
    modifiers: node.Modifiers || [],
    superClass: node.Extends ? typeNodeName(node.Extends) : undefined,
    interfaces: (node.Implements || []).map(typeNodeName),
    fields: fields.map((f: any) => ({ name: f.Name, type: mapJavaType(f.Type) })),
    methods: methods.map(convertMethodDecl),
    constructors: constructors.map(convertConstructorDecl),
    innerClasses: innerClasses.map(convertClassToJavaClassDecl),
    stmtIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Getter/setter detection
// ---------------------------------------------------------------------------

interface GetterSetterResult {
  isDataClass: boolean;
  remainingMethods: any[];
}

function detectGettersSetters(fields: any[], methods: any[]): GetterSetterResult {
  const fieldNames = new Set(
    fields.map((f: any) => (f.Name as string).toLowerCase()),
  );
  const gsMethodNames = new Set<string>();

  for (const m of methods) {
    const mName: string = m.Name || "";
    const mods: string[] = m.Modifiers || [];
    if (mods.includes("static")) continue;

    // Getter: getX() with no params
    if (mName.startsWith("get") && mName.length > 3) {
      const fieldName = mName[3].toLowerCase() + mName.slice(4);
      if (fieldNames.has(fieldName) && (!m.Params || m.Params.length === 0)) {
        gsMethodNames.add(mName);
        continue;
      }
    }
    // Boolean getter: isX() with no params
    if (mName.startsWith("is") && mName.length > 2) {
      const fieldName = mName[2].toLowerCase() + mName.slice(3);
      if (fieldNames.has(fieldName) && (!m.Params || m.Params.length === 0)) {
        gsMethodNames.add(mName);
        continue;
      }
    }
    // Setter: setX(Type) with one param
    if (mName.startsWith("set") && mName.length > 3) {
      const fieldName = mName[3].toLowerCase() + mName.slice(4);
      if (fieldNames.has(fieldName) && m.Params?.length === 1) {
        gsMethodNames.add(mName);
        continue;
      }
    }
  }

  // If more than half the methods are getters/setters, treat as data class
  const nonStaticMethods = methods.filter(
    (m: any) => !(m.Modifiers || []).includes("static"),
  );
  const isDataClass =
    gsMethodNames.size > 0 &&
    gsMethodNames.size >= nonStaticMethods.length / 2;

  const remainingMethods = methods.filter(
    (m: any) => !gsMethodNames.has(m.Name),
  );

  return { isDataClass, remainingMethods };
}

// ---------------------------------------------------------------------------
// Interface / Enum conversion
// ---------------------------------------------------------------------------

function convertInterfaceDecl(node: any): IR.IRInterfaceDecl {
  const members: any[] = node.Body || [];
  const methods: IR.IRMethodSig[] = [];

  for (const m of members) {
    if (m.Kind === "MethodDecl") {
      methods.push({
        name: m.Name || "",
        params: convertParams(m.Params),
        results: m.ReturnType ? convertReturnTypes(m.ReturnType) : [],
      });
    }
  }

  return { kind: "InterfaceDecl", name: node.Name || "", methods, stmtIndex: 0 };
}

function convertEnumDecl(node: any): IR.IRConstDecl {
  const members: any[] = node.Body || [];
  const specs: { name: string; value?: IR.IRExpr }[] = [];

  for (const m of members) {
    if (m.Kind === "VarDecl") {
      specs.push({ name: m.Name });
    }
  }

  return { kind: "ConstDecl", specs, stmtIndex: 0 };
}

// ---------------------------------------------------------------------------
// Method / Constructor conversion
// ---------------------------------------------------------------------------

function convertMethodDecl(node: any): IR.IRFuncDecl {
  const name: string = node.Name || "";
  const params = convertParams(node.Params);
  const results = node.ReturnType ? convertReturnTypes(node.ReturnType) : [];
  const body = convertBlockStmt(node.Body);

  return { kind: "FuncDecl", name, params, results, body, stmtIndex: 0 };
}

function convertConstructorDecl(node: any): IR.IRFuncDecl {
  // Constructors become an init-style function
  const params = convertParams(node.Params);
  const body = convertBlockStmt(node.Body);

  return { kind: "FuncDecl", name: "init", params, results: [], body, stmtIndex: 0 };
}

function convertParams(params: any[] | undefined): IR.IRParam[] {
  if (!params) return [];
  return params.map((p: any) => ({
    name: p.Name || "_",
    type: mapJavaType(p.Type),
  }));
}

function convertReturnTypes(retType: any): IR.IRType[] {
  const mapped = mapJavaType(retType);
  // void → no return types
  if (mapped.name === "" || mapped.name === "void") return [];
  return [mapped];
}

function convertFieldToVarDecl(node: any): IR.IRVarDecl {
  return {
    kind: "VarDecl",
    name: node.Name || "",
    type: mapJavaType(node.Type),
    value: node.Init ? convertExpr(node.Init) : undefined,
    stmtIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Statement conversion
// ---------------------------------------------------------------------------

function convertBlockStmt(node: any): IR.IRBlockStmt {
  if (!node || !node.Stmts) return { kind: "BlockStmt", stmts: [] };
  return {
    kind: "BlockStmt",
    stmts: (node.Stmts as any[]).map(convertStmt).filter(Boolean) as IR.IRNode[],
  };
}

function convertStmt(node: any): IR.IRNode | null {
  if (!node) return null;

  switch (node.Kind) {
    case "ExprStmt": {
      // Check if inner expression is an assignment (Java treats assignments as expressions)
      const inner = node.Expr;
      if (inner?.Kind === "AssignExpr") {
        return {
          kind: "AssignStmt",
          lhs: [convertExpr(inner.Target)],
          rhs: [convertExpr(inner.Value)],
          op: "=",
          stmtIndex: 0,
        } as IR.IRAssignStmt;
      }
      if (inner?.Kind === "CompoundAssignExpr") {
        return {
          kind: "AssignStmt",
          lhs: [convertExpr(inner.Target)],
          rhs: [convertExpr(inner.Value)],
          op: (inner.Op || "+=").replace("PLUS_ASSIGNMENT", "+=").replace("MINUS_ASSIGNMENT", "-=").replace("MULTIPLY_ASSIGNMENT", "*=").replace("DIVIDE_ASSIGNMENT", "/=").replace("REMAINDER_ASSIGNMENT", "%="),
          stmtIndex: 0,
        } as IR.IRAssignStmt;
      }
      // Check for increment/decrement expression
      if (inner?.Kind === "UnaryExpr") {
        const op = inner.Op as string;
        if (op === "post++" || op === "++pre" || op === "POSTFIX_INCREMENT" || op === "PREFIX_INCREMENT") {
          return { kind: "IncDecStmt", x: convertExpr(inner.X), op: "++", stmtIndex: 0 } as IR.IRIncDecStmt;
        }
        if (op === "post--" || op === "--pre" || op === "POSTFIX_DECREMENT" || op === "PREFIX_DECREMENT") {
          return { kind: "IncDecStmt", x: convertExpr(inner.X), op: "--", stmtIndex: 0 } as IR.IRIncDecStmt;
        }
      }
      return {
        kind: "ExprStmt",
        expr: convertExpr(node.Expr),
        stmtIndex: 0,
      } as IR.IRExprStmt;
    }

    case "ReturnStmt":
      return {
        kind: "ReturnStmt",
        values: node.Value ? [convertExpr(node.Value)] : [],
        stmtIndex: 0,
      } as IR.IRReturnStmt;

    case "VarDecl":
      return convertLocalVarDecl(node);

    case "IfStmt":
      return convertIfStmt(node);

    case "ForStmt":
      return convertForStmt(node);

    case "ForEachStmt":
      return convertForEachStmt(node);

    case "WhileStmt":
      return convertWhileStmt(node);

    case "DoWhileStmt":
      return convertDoWhileStmt(node);

    case "SwitchStmt":
      return convertSwitchStmt(node);

    case "TryStmt":
      return convertTryStmt(node);

    case "ThrowStmt":
      return {
        kind: "Java_ThrowStmt",
        expr: convertExpr(node.Expr),
        stmtIndex: 0,
      } as IR.Java_ThrowStmt;

    case "BreakStmt":
      return {
        kind: "BranchStmt",
        tok: "break",
        label: node.Label || undefined,
        stmtIndex: 0,
      } as IR.IRBranchStmt;

    case "ContinueStmt":
      return {
        kind: "BranchStmt",
        tok: "continue",
        label: node.Label || undefined,
        stmtIndex: 0,
      } as IR.IRBranchStmt;

    case "BlockStmt":
      return convertBlockStmt(node);

    case "AssertStmt":
      // Convert assert cond to: if !cond { panic("assertion failed") }
      return {
        kind: "IfStmt",
        cond: { kind: "UnaryExpr", op: "!", x: convertExpr(node.Cond) },
        body: {
          kind: "BlockStmt",
          stmts: [{
            kind: "ExprStmt",
            expr: {
              kind: "CallExpr",
              func: { kind: "Ident", name: "panic" },
              args: [{ kind: "BasicLit", type: "STRING", value: '"assertion failed"' }],
            },
            stmtIndex: 0,
          }],
        },
        stmtIndex: 0,
      } as IR.IRIfStmt;

    case "SynchronizedStmt":
      // Strip synchronized wrapper, just emit the block body
      return convertBlockStmt(node.Body);

    case "EmptyStmt":
      return null;

    case "LabeledStmt":
      // For now, emit the inner statement (labels are rarely needed in AET)
      return convertStmt(node.Stmt);

    default:
      return null;
  }
}

function convertLocalVarDecl(node: any): IR.IRNode {
  let value = node.Init ? convertExpr(node.Init) : undefined;

  // Fix: if init is a NewArrayExpr without Type info, use the VarDecl's Type
  if (node.Init?.Kind === "NewArrayExpr" && !node.Init.Type && node.Type?.Kind === "ArrayType") {
    const declElemType = mapJavaType(node.Type.ElemType);
    // Patch the composite literal type
    if (value && value.kind === "CompositeLit" && value.type) {
      (value as IR.IRCompositeLit).type = { kind: "ArrayTypeExpr", elt: { kind: "Ident", name: declElemType.name } };
    }
    // Patch make() call type
    if (value && value.kind === "CallExpr" && (value as IR.IRCallExpr).func.kind === "Ident" && ((value as IR.IRCallExpr).func as IR.IRIdent).name === "mk") {
      const makeArgs = (value as IR.IRCallExpr).args;
      if (makeArgs.length > 0 && makeArgs[0].kind === "ArrayTypeExpr") {
        (makeArgs[0] as IR.IRArrayTypeExpr).elt = { kind: "Ident", name: declElemType.name };
      }
    }
  }

  // If the variable has an initializer, use short declaration
  if (value) {
    return {
      kind: "ShortDeclStmt",
      names: [node.Name || "_"],
      values: [value],
      stmtIndex: 0,
    } as IR.IRShortDeclStmt;
  }

  return {
    kind: "VarDecl",
    name: node.Name || "_",
    type: mapJavaType(node.Type),
    value: undefined,
    stmtIndex: 0,
  } as IR.IRVarDecl;
}

function convertIfStmt(node: any): IR.IRIfStmt {
  const cond = convertExpr(node.Cond);
  const body = convertStmtToBlock(node.Then);
  let else_: IR.IRNode | undefined;

  if (node.Else) {
    if (node.Else.Kind === "IfStmt") {
      else_ = convertIfStmt(node.Else);
    } else {
      else_ = convertStmtToBlock(node.Else);
    }
  }

  return { kind: "IfStmt", cond, body, else_, stmtIndex: 0 };
}

/** Ensure a statement node is wrapped in a BlockStmt. */
function convertStmtToBlock(node: any): IR.IRBlockStmt {
  if (!node) return { kind: "BlockStmt", stmts: [] };
  if (node.Kind === "BlockStmt") return convertBlockStmt(node);
  // Single statement — wrap it
  const stmt = convertStmt(node);
  return { kind: "BlockStmt", stmts: stmt ? [stmt] : [] };
}

function convertForStmt(node: any): IR.IRForStmt {
  // Init can be a list of statements (Java allows comma-separated init)
  const initList: any[] = node.Init || [];
  const init = initList.length > 0 ? convertStmt(initList[0]) || undefined : undefined;

  const cond = node.Cond ? convertExpr(node.Cond) : undefined;

  // Update can be a list of expression statements
  const updateList: any[] = node.Update || [];
  let post: IR.IRNode | undefined;
  if (updateList.length > 0) {
    post = convertForUpdate(updateList[0]);
  }

  const body = convertStmtToBlock(node.Body);

  return { kind: "ForStmt", init, cond, post, body, stmtIndex: 0 };
}

function convertForUpdate(node: any): IR.IRNode {
  if (!node) return { kind: "ExprStmt", expr: { kind: "Ident", name: "_" }, stmtIndex: 0 };

  // Unwrap ExprStmt to check inner expression
  const innerNode = node.Kind === "ExprStmt" ? (node.Expr || node) : node;

  // Unary expr (++i, i++, etc.)
  if (innerNode.Kind === "UnaryExpr") {
    const op = innerNode.Op as string;
    if (op === "post++" || op === "++pre" || op === "POSTFIX_INCREMENT" || op === "PREFIX_INCREMENT") {
      return { kind: "IncDecStmt", x: convertExpr(innerNode.X), op: "++", stmtIndex: 0 } as IR.IRIncDecStmt;
    }
    if (op === "post--" || op === "--pre" || op === "POSTFIX_DECREMENT" || op === "PREFIX_DECREMENT") {
      return { kind: "IncDecStmt", x: convertExpr(innerNode.X), op: "--", stmtIndex: 0 } as IR.IRIncDecStmt;
    }
  }

  // Compound assignment (door += pass)
  if (innerNode.Kind === "CompoundAssignExpr") {
    const opStr = (innerNode.Op || "+=") as string;
    const op = opStr.includes("PLUS") ? "+=" : opStr.includes("MINUS") ? "-=" : opStr.includes("MULTI") ? "*=" : opStr.includes("DIVI") ? "/=" : opStr.includes("REMAIN") ? "%=" : opStr;
    return { kind: "AssignStmt", lhs: [convertExpr(innerNode.Target)], rhs: [convertExpr(innerNode.Value)], op, stmtIndex: 0 } as IR.IRAssignStmt;
  }

  // Simple assignment
  if (innerNode.Kind === "AssignExpr") {
    return { kind: "AssignStmt", lhs: [convertExpr(innerNode.Target)], rhs: [convertExpr(innerNode.Value)], op: "=", stmtIndex: 0 } as IR.IRAssignStmt;
  }

  // Fall through to general statement conversion
  if (node.Kind === "ExprStmt") {
    return convertStmt(node) || { kind: "ExprStmt", expr: convertExpr(node.Expr), stmtIndex: 0 } as IR.IRExprStmt;
  }

  // Compound assignment
  if (node.Kind === "CompoundAssignExpr") {
    return {
      kind: "AssignStmt",
      lhs: [convertExpr(node.Target)],
      rhs: [convertExpr(node.Value)],
      op: node.Op || "+=",
      stmtIndex: 0,
    } as IR.IRAssignStmt;
  }

  // Simple assignment
  if (node.Kind === "AssignExpr") {
    return {
      kind: "AssignStmt",
      lhs: [convertExpr(node.Target)],
      rhs: [convertExpr(node.Value)],
      op: "=",
      stmtIndex: 0,
    } as IR.IRAssignStmt;
  }

  // Fallback: convert as an expression statement
  const fallbackExpr = convertExpr(node);
  return { kind: "ExprStmt", expr: fallbackExpr, stmtIndex: 0 } as IR.IRExprStmt;
}

function convertForEachStmt(node: any): IR.IRRangeStmt {
  const varNode = node.Var;
  const varName: string = varNode?.Name || "_";

  return {
    kind: "RangeStmt",
    key: "_",
    value: varName,
    x: convertExpr(node.Expr),
    body: convertStmtToBlock(node.Body),
    stmtIndex: 0,
  };
}

function convertWhileStmt(node: any): IR.IRForStmt {
  return {
    kind: "ForStmt",
    cond: convertExpr(node.Cond),
    body: convertStmtToBlock(node.Body),
    stmtIndex: 0,
  };
}

function convertDoWhileStmt(node: any): IR.IRForStmt {
  // do { body } while(cond) → for { body; if !cond { break } }
  const innerBody = convertStmtToBlock(node.Body);
  const breakIfNotCond: IR.IRIfStmt = {
    kind: "IfStmt",
    cond: { kind: "UnaryExpr", op: "!", x: convertExpr(node.Cond) },
    body: {
      kind: "BlockStmt",
      stmts: [{ kind: "BranchStmt", tok: "break", stmtIndex: 0 } as IR.IRBranchStmt],
    },
    stmtIndex: 0,
  };
  innerBody.stmts.push(breakIfNotCond);

  return {
    kind: "ForStmt",
    body: innerBody,
    stmtIndex: 0,
  };
}

function convertSwitchStmt(node: any): IR.IRSwitchStmt {
  const tag = node.Expr ? convertExpr(node.Expr) : undefined;
  const caseClauses: IR.IRCaseClause[] = [];

  for (const c of node.Cases || []) {
    if (c.Kind !== "CaseClause") continue;

    let values: IR.IRExpr[] | undefined;
    if (c.Default) {
      values = undefined;  // default case
    } else if (c.Labels) {
      values = (c.Labels as any[]).map(convertCaseLabel);
    }

    const body: IR.IRNode[] = [];
    // Statements can appear in Stmts or Body
    for (const s of c.Stmts || []) {
      const converted = convertStmt(s);
      // Filter out break in switch (not needed in AET/Go)
      if (converted && converted.kind === "BranchStmt" && (converted as IR.IRBranchStmt).tok === "break") continue;
      if (converted) body.push(converted);
    }
    if (c.Body) {
      const converted = convertStmt(c.Body);
      if (converted) body.push(converted);
    }

    caseClauses.push({ kind: "CaseClause", values, body });
  }

  return { kind: "SwitchStmt", tag, cases: caseClauses, stmtIndex: 0 };
}

function convertCaseLabel(node: any): IR.IRExpr {
  if (node.Kind === "ConstantCaseLabel") {
    return convertExpr(node.Expr);
  }
  return convertExpr(node);
}

function convertTryStmt(node: any): IR.Java_TryCatch {
  const body = convertBlockStmt(node.Body);
  const catches: IR.Java_CatchClause[] = [];

  for (const c of node.Catches || []) {
    const param = c.Param;
    catches.push({
      exceptionType: param?.Type ? mapJavaType(param.Type) : IR.simpleType("error"),
      name: param?.Name || "e",
      body: convertBlockStmt(c.Body),
    });
  }

  const finallyBody = node.Finally ? convertBlockStmt(node.Finally) : undefined;

  // Try-with-resources
  const resources = (node.Resources || []).map(convertStmt).filter(Boolean) as IR.IRNode[];

  return {
    kind: "Java_TryCatch",
    body,
    catches,
    finallyBody: finallyBody || undefined,
    resources: resources.length > 0 ? resources : undefined,
    stmtIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Expression conversion
// ---------------------------------------------------------------------------

function convertExpr(node: any): IR.IRExpr {
  if (!node) return { kind: "Ident", name: "_" };

  switch (node.Kind) {
    case "Ident":
      return convertIdentExpr(node);

    case "Literal":
      return convertLiteral(node);

    case "BinaryExpr":
      return {
        kind: "BinaryExpr",
        left: convertExpr(node.X),
        op: node.Op || "+",
        right: convertExpr(node.Y),
      };

    case "UnaryExpr":
      return convertUnaryExpr(node);

    case "MethodCall":
      return convertMethodCall(node);

    case "FieldAccess":
      return convertFieldAccess(node);

    case "NewExpr":
      return convertNewExpr(node);

    case "NewArrayExpr":
      return convertNewArrayExpr(node);

    case "AssignExpr":
      // Assignment as expression (rare but valid in Java) — treat as the value side
      return convertExpr(node.Value);

    case "CompoundAssignExpr":
      return convertExpr(node.Value);

    case "CastExpr":
      return {
        kind: "Java_CastExpr",
        type: mapJavaType(node.Type),
        expr: convertExpr(node.Expr),
      } as IR.Java_CastExpr;

    case "InstanceOfExpr":
      return {
        kind: "Java_InstanceofExpr",
        expr: convertExpr(node.Expr),
        type: mapJavaType(node.Type),
      } as IR.Java_InstanceofExpr;

    case "TernaryExpr":
      return {
        kind: "Java_TernaryExpr",
        cond: convertExpr(node.Cond),
        ifTrue: convertExpr(node.Then),
        ifFalse: convertExpr(node.Else),
      } as IR.Java_TernaryExpr;

    case "ParenExpr":
      return { kind: "ParenExpr", x: convertExpr(node.Expr) };

    case "LambdaExpr":
      return convertLambdaExpr(node);

    case "MethodRef":
      return convertMethodRef(node);

    case "ArrayAccess":
      return {
        kind: "IndexExpr",
        x: convertExpr(node.Expr),
        index: convertExpr(node.Index),
      };

    case "ArrayType":
      return { kind: "ArrayTypeExpr", elt: convertExpr(node.ElemType) };

    case "ParameterizedType":
      return convertExpr(node.Type);

    case "PrimitiveType":
      return { kind: "Ident", name: JAVA_TYPE_MAP[node.Name] ?? node.Name };

    case "SwitchExpr":
      // Switch expressions are complex — emit tag expression as fallback
      return node.Expr ? convertExpr(node.Expr) : { kind: "Ident", name: "_" };

    default:
      return { kind: "Ident", name: node.Name || "_" };
  }
}

function convertIdentExpr(node: any): IR.IRExpr {
  const name: string = node.Name || "_";

  // Map Java-specific identifiers
  if (name === "true" || name === "false") {
    return { kind: "Ident", name };
  }
  if (name === "null") {
    return { kind: "Ident", name: "nil" };
  }
  if (name === "this") {
    return { kind: "Ident", name: "this" };
  }

  return { kind: "Ident", name };
}

function convertLiteral(node: any): IR.IRBasicLit {
  const litType: string = node.Type || "String";
  const value: string = node.Value ?? "null";

  switch (litType) {
    case "int":
    case "long":
      return { kind: "BasicLit", type: "INT", value };
    case "float":
    case "double":
      return { kind: "BasicLit", type: "FLOAT", value };
    case "char":
      return { kind: "BasicLit", type: "CHAR", value: `'${value}'` };
    case "boolean":
      return { kind: "BasicLit", type: "INT", value };  // true/false as idents
    case "String":
      return { kind: "BasicLit", type: "STRING", value: `"${value}"` };
    case "null":
      return { kind: "BasicLit", type: "INT", value: "nil" };
    default:
      return { kind: "BasicLit", type: "STRING", value: `"${value}"` };
  }
}

function convertUnaryExpr(node: any): IR.IRExpr {
  const op: string = node.Op || "!";
  const x = convertExpr(node.X);

  // Postfix / prefix increment/decrement — these are expressions in Java
  if (op === "post++" || op === "++pre") {
    return x;  // Simplify; the increment is handled at statement level
  }
  if (op === "post--" || op === "--pre") {
    return x;
  }

  return { kind: "UnaryExpr", op, x };
}

function convertMethodCall(node: any): IR.IRCallExpr {
  const method = node.Method;
  const args = (node.Args || []).map(convertExpr);

  // Check for stdlib alias via fully qualified method call chains
  const qualifiedName = flattenMethodCallName(method);
  if (qualifiedName) {
    const alias = javaReverseAliasMap[qualifiedName];
    if (alias) {
      return { kind: "CallExpr", func: { kind: "Ident", name: alias }, args };
    }
  }


  // Special: .length() → len(obj) — avoids AET parser keyword conflict
  if (method?.Kind === "FieldAccess" && method.Name === "length" && args.length === 0) {
    return { kind: "CallExpr", func: { kind: "Ident", name: "ln" }, args: [convertExpr(method.Expr)] };
  }

  // Special: .charAt(i) → obj[i] (index expression, not a call)
  // Note: We return a CallExpr here but the emitter should handle the conversion
  if (method?.Kind === "FieldAccess" && method.Name === "charAt" && args.length === 1) {
    // Return as index expression instead
    return { kind: "CallExpr", func: convertExpr(method), args } as any;
  }

  // Rename method names that clash with AET parser keywords
  if (method?.Kind === "FieldAccess") {
    const KEYWORD_METHOD_RENAMES: Record<string, string> = {
      "append": "apd",
      "delete": "del",
      "copy": "cpy",
      "new": "nw_",
      "make": "mk_",
      "filter": "flt_",
      "range": "rng_",
    };
    const renamed = KEYWORD_METHOD_RENAMES[method.Name];
    if (renamed) {
      const obj = convertExpr(method.Expr);
      return { kind: "CallExpr", func: { kind: "SelectorExpr", x: obj, sel: renamed }, args };
    }
  }

  return { kind: "CallExpr", func: convertExpr(method), args };
}

/**
 * Flatten a chain like FieldAccess(FieldAccess(Ident("System"), "out"), "println")
 * into "System.out.println".
 */
function flattenMethodCallName(node: any): string | null {
  if (!node) return null;
  if (node.Kind === "Ident") return node.Name || null;
  if (node.Kind === "FieldAccess") {
    const prefix = flattenMethodCallName(node.Expr);
    if (prefix) return `${prefix}.${node.Name}`;
    return node.Name || null;
  }
  return null;
}

function convertFieldAccess(node: any): IR.IRExpr {
  const obj = convertExpr(node.Expr);
  const fieldName: string = node.Name || "";

  // Special: .length field access → len(obj) — avoids AET keyword conflict
  if (fieldName === "length") {
    return { kind: "CallExpr", func: { kind: "Ident", name: "ln" }, args: [obj] } as IR.IRCallExpr;
  }

  // Check for reverse alias on field access (e.g., System.out → could be part of println)
  if (obj.kind === "Ident") {
    const fullName = `${obj.name}.${fieldName}`;
    const alias = javaReverseAliasMap[fullName];
    if (alias) {
      return { kind: "Ident", name: alias };
    }
  }

  return { kind: "SelectorExpr", x: obj, sel: fieldName };
}

function convertNewExpr(node: any): IR.IRExpr {
  const typeName = typeNodeName(node.Type);
  const args = (node.Args || []).map(convertExpr);

  // Check constructor aliases: "StringBuilder" → "Sb"
  const alias = javaConstructorAliases[typeName];
  if (alias) {
    return { kind: "CallExpr", func: { kind: "Ident", name: alias }, args };
  }

  // Common Java types that map to Go builtins
  if (typeName === "ArrayList" || typeName === "LinkedList") {
    return { kind: "CallExpr", func: { kind: "Ident", name: "mk" }, args: [{ kind: "ArrayTypeExpr", elt: { kind: "Ident", name: "_in" } } as IR.IRArrayTypeExpr] };
  }
  if (typeName === "HashMap" || typeName === "TreeMap" || typeName === "LinkedHashMap") {
    return { kind: "CallExpr", func: { kind: "Ident", name: "mk" }, args: [{ kind: "MapTypeExpr", key: { kind: "Ident", name: "string" }, value: { kind: "Ident", name: "_in" } } as IR.IRMapTypeExpr] };
  }

  // General new expression → Java_NewExpr
  return {
    kind: "Java_NewExpr",
    type: IR.simpleType(typeName),
    args,
  } as IR.Java_NewExpr;
}

function convertNewArrayExpr(node: any): IR.IRExpr {
  const elemType = node.Type ? mapJavaType(node.Type) : IR.simpleType("_in");

  // Array with initializer → composite literal
  if (node.Init && (node.Init as any[]).length > 0) {
    return {
      kind: "CompositeLit",
      type: { kind: "ArrayTypeExpr", elt: { kind: "Ident", name: elemType.name } },
      elts: (node.Init as any[]).map(convertExpr),
    };
  }

  // Array with dimensions → make([]Type, size) or make([][]Type, size1, size2)
  const dims = node.Dimensions || [];
  // Build the array type expression with correct nesting for multi-dimensional arrays
  let innerType: IR.IRExpr = { kind: "Ident", name: elemType.name };
  for (let i = 1; i < dims.length; i++) {
    innerType = { kind: "ArrayTypeExpr", elt: innerType } as IR.IRArrayTypeExpr;
  }
  const mkArgs: IR.IRExpr[] = [
    { kind: "ArrayTypeExpr", elt: innerType } as IR.IRArrayTypeExpr,
  ];
  // Add all dimension sizes
  for (const dim of dims) {
    if (dim) {
      mkArgs.push(convertExpr(dim));
    }
  }
  // If no dimensions provided, add a default size of 0
  if (mkArgs.length === 1) {
    mkArgs.push({ kind: "BasicLit", type: "INT", value: "0" });
  }
  return {
    kind: "CallExpr",
    func: { kind: "Ident", name: "mk" },
    args: mkArgs,
  };
}

function convertLambdaExpr(node: any): IR.IRExpr {
  const params: IR.IRParam[] = (node.Params || []).map((p: any) => ({
    name: p.Name || "_",
    type: p.Type ? mapJavaType(p.Type) : IR.simpleType("_in"),
  }));

  const bodyKind: string = node.BodyKind || "EXPRESSION";

  if (bodyKind === "EXPRESSION") {
    // Single expression lambda → Java_LambdaExpr with expr body
    return {
      kind: "Java_LambdaExpr",
      params,
      body: convertExpr(node.Body),
    } as IR.Java_LambdaExpr;
  }

  // Block lambda
  return {
    kind: "Java_LambdaExpr",
    params,
    body: convertBlockStmt(node.Body),
  } as IR.Java_LambdaExpr;
}

function convertMethodRef(node: any): IR.IRExpr {
  // Method reference (e.g., String::valueOf) → convert to selector
  const obj = convertExpr(node.Expr);
  const name: string = node.Name || "";

  // Check for alias
  if (obj.kind === "Ident") {
    const fullName = `${obj.name}.${name}`;
    const alias = javaReverseAliasMap[fullName];
    if (alias) {
      return { kind: "Ident", name: alias };
    }
  }

  return { kind: "SelectorExpr", x: obj, sel: name };
}

// ---------------------------------------------------------------------------
// javaIrToAET — convert IR to AET string
// ---------------------------------------------------------------------------
export function javaIrToAET(program: IR.IRProgram): string {
  const parts: string[] = ["!v3"];
  for (const decl of program.decls) {
    parts.push(javaNodeToAET(decl));
  }
  return parts.join(";");
}

function javaNodeToAET(node: IR.IRNode | IR.IRExprStmt): string {
  switch (node.kind) {
    case "FuncDecl": {
      let s = "";
      if (node.receiver) {
        s += `${node.receiver.type.name}.`;
      }
      s += `${node.name}(${node.params.map(p => {
        if (p.type.name === "_in") return p.name;
        return `${p.name}:${p.type.name}`;
      }).join(",")})`;
      if (node.results.length > 0) {
        if (node.results.length === 1) {
          s += `->${node.results[0].name}`;
        } else {
          s += `->(${node.results.map(r => r.name).join(",")})`;
        }
      }
      s += `{${javaBlockToAET(node.body)}}`;
      return s;
    }

    case "StructDecl":
      return `@${node.name}{${node.fields.map(f => `${f.name}:${f.type.name}`).join(";")}}`;

    case "InterfaceDecl":
      return `@${node.name}[${node.methods.map(m => {
        const params = m.params.map(p => `${p.name}:${p.type.name}`).join(",");
        const ret = m.results.length > 0
          ? `->${m.results.length === 1 ? m.results[0].name : `(${m.results.map(r => r.name).join(",")})`}`
          : "";
        return `${m.name}(${params})${ret}`;
      }).join(";")}]`;

    case "TypeAlias":
      return `@${node.name}=${node.underlying.name}`;

    case "ReturnStmt":
      return `^${node.values.map(javaExprToAET).join(",")}`;

    case "IfStmt": {
      let s = `if ${javaExprToAET(node.cond)}{${javaBlockToAET(node.body)}}`;
      if (node.else_) {
        if (node.else_.kind === "IfStmt") {
          s += `else ${javaNodeToAET(node.else_)}`;
        } else if (node.else_.kind === "BlockStmt") {
          s += `else{${javaBlockToAET(node.else_ as IR.IRBlockStmt)}}`;
        }
      }
      return s;
    }

    case "ForStmt": {
      let header = "";
      if (node.init && node.post) {
        header = `${javaNodeToAET(node.init)};${node.cond ? javaExprToAET(node.cond) : ""};${javaNodeToAET(node.post)}`;
      } else if (node.cond) {
        header = javaExprToAET(node.cond);
      }
      return `for ${header}{${javaBlockToAET(node.body)}}`;
    }

    case "RangeStmt": {
      const vars = [node.key || "_", node.value].filter(Boolean).join(",");
      return `for ${vars}:=rng ${javaExprToAET(node.x)}{${javaBlockToAET(node.body)}}`;
    }

    case "SwitchStmt": {
      const tag = node.tag ? ` ${javaExprToAET(node.tag)}` : "";
      const cases = node.cases.map(c => {
        if (c.values) {
          return `case ${c.values.map(javaExprToAET).join(",")}:${c.body.map(javaNodeToAET).join(";")}`;
        }
        return `default:${c.body.map(javaNodeToAET).join(";")}`;
      }).join(";");
      return `switch${tag}{${cases}}`;
    }

    case "ShortDeclStmt":
      return `${node.names.join(",")}:=${node.values.map(javaExprToAET).join(",")}`;

    case "AssignStmt":
      return `${node.lhs.map(javaExprToAET).join(",")}${node.op}${node.rhs.map(javaExprToAET).join(",")}`;

    case "ExprStmt":
      return javaExprToAET(node.expr);

    case "IncDecStmt":
      return `${javaExprToAET(node.x)}${node.op}`;

    case "DeferStmt":
      return `defer ${javaExprToAET(node.call)}`;

    case "GoStmt":
      return `go ${javaExprToAET(node.call)}`;

    case "SendStmt":
      return `${javaExprToAET(node.chan)}<-${javaExprToAET(node.value)}`;

    case "BranchStmt":
      return node.tok;

    case "VarDecl": {
      let s = `var ${node.name}`;
      if (node.type) s += `:${node.type.name}`;
      if (node.value) s += `=${javaExprToAET(node.value)}`;
      return s;
    }

    case "ConstDecl":
      return `const(${node.specs.map(s => `${s.name}${s.value ? `=${javaExprToAET(s.value)}` : ""}`).join(";")})`;

    // ---- Java-specific nodes ----

    case "Java_ClassDecl": {
      // Only emit if it cannot be collapsed to @Struct
      let s = `@class ${node.name}`;
      if (node.superClass) s += ` extends ${node.superClass}`;
      if (node.interfaces.length > 0) s += ` impl ${node.interfaces.join(",")}`;
      s += "{";
      const parts: string[] = [];
      for (const f of node.fields) {
        parts.push(`${f.name}:${f.type.name}`);
      }
      for (const c of node.constructors) {
        parts.push(javaNodeToAET(c));
      }
      for (const m of node.methods) {
        parts.push(javaNodeToAET(m));
      }
      for (const ic of node.innerClasses) {
        parts.push(javaNodeToAET(ic));
      }
      s += parts.join(";");
      s += "}";
      return s;
    }

    case "Java_TryCatch": {
      // Try to detect simple error propagation pattern:
      // try { body } catch(Exception e) { throw/return }
      if (node.catches.length === 1 && !node.finallyBody && !node.resources) {
        const c = node.catches[0];
        if (c.body.stmts.length === 1) {
          const stmt = c.body.stmts[0];
          if (stmt && (stmt as any).kind === "Java_ThrowStmt") {
            // try{body}catch → body with error propagation marker
            return `try?{${javaBlockToAET(node.body)}}`;
          }
        }
      }
      // Full try-catch
      let s = `try{${javaBlockToAET(node.body)}}`;
      for (const c of node.catches) {
        s += `catch(${c.name}:${c.exceptionType.name}){${javaBlockToAET(c.body)}}`;
      }
      if (node.finallyBody) {
        s += `finally{${javaBlockToAET(node.finallyBody)}}`;
      }
      return s;
    }

    case "Java_EnhancedFor": {
      return `for _,${node.varName}:=rng ${javaExprToAET(node.iterable)}{${javaBlockToAET(node.body)}}`;
    }

    case "Java_ThrowStmt":
      // Emit as panic(expr) since AET parser doesn't have throw keyword
      return `panic(${javaExprToAET(node.expr)})`;

    default:
      return `/* ${(node as any).kind} */`;
  }
}

function javaBlockToAET(block: IR.IRBlockStmt): string {
  return block.stmts.map(javaNodeToAET).join(";");
}

function javaExprToAET(expr: IR.IRExpr): string {
  switch (expr.kind) {
    case "Ident":
      return expr.name;

    case "BasicLit":
      return expr.value;

    case "CompositeLit":
      return `${expr.type ? javaExprToAET(expr.type) : ""}{${expr.elts.map(javaExprToAET).join(",")}}`;

    case "BinaryExpr":
      return `${javaExprToAET(expr.left)}${expr.op}${javaExprToAET(expr.right)}`;

    case "UnaryExpr":
      return `${expr.op}${javaExprToAET(expr.x)}`;

    case "CallExpr":
      return `${javaExprToAET(expr.func)}(${expr.args.map(javaExprToAET).join(",")})`;

    case "SelectorExpr":
      return `${javaExprToAET(expr.x)}.${expr.sel}`;

    case "IndexExpr":
      return `${javaExprToAET(expr.x)}[${javaExprToAET(expr.index)}]`;

    case "SliceExpr":
      return `${javaExprToAET(expr.x)}[${expr.low ? javaExprToAET(expr.low) : ""}:${expr.high ? javaExprToAET(expr.high) : ""}]`;

    case "StarExpr":
      return `*${javaExprToAET(expr.x)}`;

    case "UnaryRecvExpr":
      return `<-${javaExprToAET(expr.x)}`;

    case "ParenExpr":
      return `(${javaExprToAET(expr.x)})`;

    case "KeyValueExpr":
      return `${javaExprToAET(expr.key)}:${javaExprToAET(expr.value)}`;

    case "FuncLit":
      return `{${expr.params.map(p => p.name).join(",")}|${javaBlockToAET(expr.body)}}`;

    case "TypeAssertExpr":
      return `${javaExprToAET(expr.x)}.(${expr.type.name})`;

    case "MapTypeExpr":
      return `mp[${javaExprToAET(expr.key)}]${javaExprToAET(expr.value)}`;

    case "ArrayTypeExpr":
      return `[]${javaExprToAET(expr.elt)}`;

    case "ErrorPropExpr":
      return `${javaExprToAET(expr.x)}?${expr.wrap ? `!"${expr.wrap}"` : ""}`;

    case "PipeExpr":
      return `${javaExprToAET(expr.x)}|${expr.op}(${javaExprToAET(expr.fn)})`;

    // ---- Java-specific expressions ----

    case "Java_NewExpr":
      // new Type(args) → Type(args)  (emit as function call)
      return `${expr.type.name}(${expr.args.map(javaExprToAET).join(",")})`;

    case "Java_LambdaExpr": {
      // Lambda → {params|body}
      const paramNames = expr.params.map(p => p.name).join(",");
      if ("kind" in expr.body && (expr.body as any).kind === "BlockStmt") {
        return `{${paramNames}|${javaBlockToAET(expr.body as IR.IRBlockStmt)}}`;
      }
      // Single expression body
      return `{${paramNames}|${javaExprToAET(expr.body as IR.IRExpr)}}`;
    }

    case "Java_InstanceofExpr":
      // instanceof → type assertion syntax
      return `${javaExprToAET(expr.expr)}.(${expr.type.name})`;

    case "Java_CastExpr":
      // (Type)expr → Type(expr)  (type conversion syntax)
      return `${expr.type.name}(${javaExprToAET(expr.expr)})`;

    case "Java_TernaryExpr":
      // cond ? a : b → _t(cond, ifTrue, ifFalse) — parsed as regular call, emitter converts to ternary
      return `_t(${javaExprToAET(expr.cond)},${javaExprToAET(expr.ifTrue)},${javaExprToAET(expr.ifFalse)})`;

    default:
      return "_";
  }
}
