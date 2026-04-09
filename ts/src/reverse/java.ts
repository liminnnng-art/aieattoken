// Reverse transpiler: Java → IR → AET / AET-Java
// Uses ASTDumper.java (JDK com.sun.source.tree API) to get JSON AST,
// then converts to IR, then to AET (shared) or AET-Java (.aetj).

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

// Accumulator for anonymous inner classes → named inner classes
let _anonClassCounter = 0;
let _pendingAnonClasses: IR.Java_ClassDecl[] = [];

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
    resolve(process.cwd(), "java-parser"),
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

/** Get the original Java type name (no Go mapping). Used by AET-Java output. */
function javaTypeNodeName(node: any): string {
  if (!node) return "Object";
  if (typeof node === "string") return node;
  if (node.Kind === "PrimitiveType") return node.Name || "int";
  if (node.Kind === "Ident") return node.Name || "Object";
  if (node.Kind === "ArrayType") return javaTypeNodeName(node.ElemType) + "[]";
  if (node.Kind === "ParameterizedType") {
    const base = javaTypeNodeName(node.Type);
    const args = (node.TypeArgs || []).map(javaTypeNodeName).join(", ");
    return args ? `${base}<${args}>` : base;
  }
  if (node.Kind === "Wildcard") {
    if (node.Bound) {
      return `? ${node.BoundKind || "extends"} ${javaTypeNodeName(node.Bound)}`;
    }
    return "?";
  }
  if (node.Kind === "FieldAccess") return `${javaTypeNodeName(node.Expr)}.${node.Name}`;
  return node.Name || "Object";
}

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
      // Preserve full parameterized type name (e.g., Class<? extends Exception>)
      if (typeArgs.length > 0) {
        const argNames = typeArgs.map(javaTypeNodeName).join(", ");
        return IR.simpleType(`${baseName}<${argNames}>`);
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
  _anonClassCounter = 0;
  _pendingAnonClasses = [];
  const decls: IR.IRNode[] = [];

  for (const decl of javaAst.Decls || []) {
    switch (decl.Kind) {
      case "ClassDecl":
        convertClassDecl(decl, decls);
        break;
      case "RecordDecl":
        decls.push(convertRecordDecl(decl));
        break;
      case "InterfaceDecl":
        if (isSealedInterface(decl)) {
          decls.push(convertSealedInterfaceDecl(decl));
        } else {
          decls.push(convertInterfaceDecl(decl));
        }
        break;
      case "EnumDecl":
        decls.push(convertEnumDeclToIR(decl));
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
  let name: string = node.Name || "";
  // Append type parameters to name if present (e.g., GenericStack<T>)
  const tps = (node.TypeParams || []).map((tp: any) => tp.Name || tp);
  if (tps.length > 0) name += "<" + tps.join(", ") + ">";
  const members: any[] = node.Body || [];

  const methods = members.filter((m: any) => m.Kind === "MethodDecl");
  const constructors = members.filter((m: any) => m.Kind === "ConstructorDecl");
  const fields = members.filter((m: any) => m.Kind === "VarDecl");
  const innerClasses = members.filter((m: any) =>
    m.Kind === "ClassDecl" || m.Kind === "InterfaceDecl" || m.Kind === "EnumDecl" || m.Kind === "RecordDecl",
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
      else if (ic.Kind === "RecordDecl") out.push(convertRecordDecl(ic));
      else if (ic.Kind === "InterfaceDecl") {
        if (isSealedInterface(ic)) out.push(convertSealedInterfaceDecl(ic));
        else out.push(convertInterfaceDecl(ic));
      }
      else if (ic.Kind === "EnumDecl") out.push(convertEnumDeclToIR(ic));
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
  const irFields: IR.IRField[] = fields.map((f: any) => {
    const field: IR.IRField = { name: f.Name, type: mapJavaType(f.Type) };
    (field as any).javaModifiers = f.Modifiers || [];
    (field as any).javaTypeName = javaTypeNodeName(f.Type);
    if (f.Init) (field as any).javaInit = convertExpr(f.Init);
    return field;
  });
  // Save and reset anon class accumulator before processing methods
  const savedAnon = _pendingAnonClasses;
  _pendingAnonClasses = [];
  const irMethods = methods.map(convertMethodDecl);
  const irConstructors = constructors.map(convertConstructorDecl);
  const irInnerClasses: IR.Java_ClassDecl[] = [];
  for (const ic of innerClasses) {
    if (ic.Kind === "ClassDecl") {
      irInnerClasses.push(convertClassToJavaClassDecl(ic));
    }
  }
  // Flush anonymous inner classes generated during method conversion
  irInnerClasses.push(..._pendingAnonClasses);
  _pendingAnonClasses = savedAnon;

  out.push({
    kind: "Java_ClassDecl",
    name,
    modifiers: node.Modifiers || [],
    superClass: node.Extends ? typeNodeName(node.Extends) : undefined,
    interfaces: (node.Implements || []).map(javaTypeNodeName),
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
  const innerClasses = members.filter((m: any) =>
    m.Kind === "ClassDecl" || m.Kind === "InterfaceDecl" || m.Kind === "EnumDecl" || m.Kind === "RecordDecl",
  );

  // Convert fields and attach Java-specific metadata
  const irFields = fields.map((f: any) => {
    const field: IR.IRField = { name: f.Name, type: mapJavaType(f.Type) };
    (field as any).javaModifiers = f.Modifiers || [];
    (field as any).javaTypeName = javaTypeNodeName(f.Type);
    if (f.Init) (field as any).javaInit = convertExpr(f.Init);
    return field;
  });

  // Include type parameters in the name
  let fullName = node.Name || "";
  const tps = (node.TypeParams || []).map((tp: any) => tp.Name || tp);
  if (tps.length > 0) fullName += "<" + tps.join(", ") + ">";

  // Save and reset anon class accumulator before processing methods
  const savedAnon = _pendingAnonClasses;
  _pendingAnonClasses = [];
  const irMethods = methods.map(convertMethodDecl);
  const irCtors = constructors.map(convertConstructorDecl);
  const irInner = innerClasses.map((ic: any) => {
    if (ic.Kind === "ClassDecl") return convertClassToJavaClassDecl(ic);
    // Wrap non-class inner types in a pseudo Java_ClassDecl for the array type
    // (The actual conversion will be handled in the AETJ emitter)
    return convertClassToJavaClassDecl(ic);
  });
  // Flush anonymous inner classes generated during method conversion
  irInner.push(..._pendingAnonClasses);
  _pendingAnonClasses = savedAnon;

  return {
    kind: "Java_ClassDecl",
    name: fullName,
    modifiers: node.Modifiers || [],
    superClass: node.Extends ? typeNodeName(node.Extends) : undefined,
    interfaces: (node.Implements || []).map(javaTypeNodeName),
    fields: irFields,
    methods: irMethods,
    constructors: irCtors,
    innerClasses: irInner,
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

  // Append type parameters to name (e.g., Validator<T>)
  let name = node.Name || "";
  const tps = (node.TypeParams || []).map((tp: any) => tp.Name || tp);
  if (tps.length > 0) name += "<" + tps.join(", ") + ">";

  return { kind: "InterfaceDecl", name, methods, stmtIndex: 0 };
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

/** Convert enum to Java_EnumDecl (for AET-Java output). */
function convertEnumDeclToIR(node: any): IR.Java_EnumDecl {
  const members: any[] = node.Body || [];
  const enumName: string = node.Name || "";
  const values: { name: string; args: IR.IRExpr[] }[] = [];
  const fields: IR.IRField[] = [];
  const methods: IR.IRFuncDecl[] = [];
  const constructors: IR.IRFuncDecl[] = [];

  for (const m of members) {
    // Detect enum constants: VarDecl with type matching enum name, or EnumConstant
    const isEnumConstant = m.Kind === "EnumConstant" ||
      (m.Kind === "VarDecl" && !m.Type) ||
      (m.Kind === "VarDecl" && m.Type?.Kind === "Ident" && m.Type?.Name === enumName &&
       (m.Modifiers || []).includes("static") && (m.Modifiers || []).includes("final"));

    if (isEnumConstant) {
      // Enum constant — extract constructor args if any
      const args = m.Args || [];
      // If init is a NewExpr with args, use those
      const initArgs = m.Init?.Args || [];
      values.push({
        name: m.Name || "",
        args: (args.length > 0 ? args : initArgs).map(convertExpr),
      });
    } else if (m.Kind === "VarDecl") {
      fields.push({ name: m.Name || "", type: mapJavaType(m.Type) });
      // Attach modifiers for AET-Java
      const f = fields[fields.length - 1];
      (f as any).javaModifiers = m.Modifiers || [];
      (f as any).javaTypeName = javaTypeNodeName(m.Type);
      if (m.Init) (f as any).javaInit = convertExpr(m.Init);
    } else if (m.Kind === "MethodDecl") {
      const md = convertMethodDecl(m);
      (md as any).javaModifiers = m.Modifiers || [];
      (md as any).javaReturnTypeName = m.ReturnType ? javaTypeNodeName(m.ReturnType) : "";
      (md as any).javaParams = (m.Params || []).map((p: any) => ({
        name: p.Name || "_",
        typeName: javaTypeNodeName(p.Type),
      }));
      methods.push(md);
    } else if (m.Kind === "ConstructorDecl") {
      const cd = convertConstructorDecl(m);
      (cd as any).javaModifiers = m.Modifiers || [];
      (cd as any).javaParams = (m.Params || []).map((p: any) => ({
        name: p.Name || "_",
        typeName: javaTypeNodeName(p.Type),
      }));
      constructors.push(cd);
    }
  }

  return {
    kind: "Java_EnumDecl",
    name: node.Name || "",
    values,
    fields,
    methods,
    constructors,
    interfaces: (node.Implements || []).map(javaTypeNodeName),
    stmtIndex: 0,
  };
}

/** Check if an interface is sealed (has Permits list). */
function isSealedInterface(node: any): boolean {
  return !!(node.Permits && node.Permits.length > 0) ||
    !!((node.Modifiers || []).includes("sealed"));
}

/** Convert sealed interface to Java_SealedInterfaceDecl. */
function convertSealedInterfaceDecl(node: any): IR.Java_SealedInterfaceDecl {
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

  const permits = (node.Permits || []).map(typeNodeName);

  return {
    kind: "Java_SealedInterfaceDecl",
    name: node.Name || "",
    typeParams: (node.TypeParams || []).map((tp: any) => tp.Name || tp),
    permits,
    methods,
    stmtIndex: 0,
  };
}

/** Convert record declaration to Java_RecordDecl. */
function convertRecordDecl(node: any): IR.Java_RecordDecl {
  const members: any[] = node.Body || [];

  // Record components: either explicit Params/Components or VarDecl entries in Body
  let rawComponents: any[] = node.Params || node.Components || [];
  if (rawComponents.length === 0) {
    // Extract from Body VarDecl entries (ASTDumper stores record components as VarDecl)
    rawComponents = members.filter((m: any) => m.Kind === "VarDecl");
  }

  const components: IR.IRParam[] = rawComponents.map((p: any) => ({
    name: p.Name || "_",
    type: mapJavaType(p.Type),
  }));
  // Attach original Java type names for AET-Java output
  const javaComponents = rawComponents.map((p: any) => ({
    name: p.Name || "_",
    typeName: javaTypeNodeName(p.Type),
  }));

  const methods: IR.IRFuncDecl[] = [];
  for (const m of members) {
    if (m.Kind === "MethodDecl") {
      const md = convertMethodDecl(m);
      (md as any).javaModifiers = m.Modifiers || [];
      (md as any).javaReturnTypeName = m.ReturnType ? javaTypeNodeName(m.ReturnType) : "";
      (md as any).javaParams = (m.Params || []).map((p: any) => ({
        name: p.Name || "_",
        typeName: javaTypeNodeName(p.Type),
      }));
      methods.push(md);
    }
  }

  const result: IR.Java_RecordDecl = {
    kind: "Java_RecordDecl",
    name: node.Name || "",
    typeParams: (node.TypeParams || []).map((tp: any) => tp.Name || tp),
    components,
    interfaces: (node.Implements || []).map(javaTypeNodeName),
    methods,
    stmtIndex: 0,
  };
  (result as any).javaComponents = javaComponents;
  return result;
}

// ---------------------------------------------------------------------------
// Method / Constructor conversion
// ---------------------------------------------------------------------------

function convertMethodDecl(node: any): IR.IRFuncDecl {
  const name: string = node.Name || "";
  const params = convertParams(node.Params);
  const results = node.ReturnType ? convertReturnTypes(node.ReturnType) : [];
  const body = convertBlockStmt(node.Body);

  const result: IR.IRFuncDecl = { kind: "FuncDecl", name, params, results, body, stmtIndex: 0 };
  // Preserve method-level type parameters (e.g., <T> on static <T> void runTest(...))
  const methodTypeParams = (node.TypeParams || []).map((tp: any) => tp.Name || tp);
  if (methodTypeParams.length > 0) {
    result.typeParams = methodTypeParams;
  }
  // Preserve Java-specific metadata for AET-Java output
  const modifiers = [...(node.Modifiers || [])];
  // Preserve @Override annotation as a modifier for the emitter
  const annotations = node.Annotations || [];
  if (annotations.some((a: any) => a.Name?.Name === "Override" || a.Name === "Override")) {
    modifiers.push("override");
  }
  (result as any).javaModifiers = modifiers;
  (result as any).javaReturnTypeName = node.ReturnType ? javaTypeNodeName(node.ReturnType) : "";
  (result as any).javaParams = (node.Params || []).map((p: any) => ({
    name: p.Name || "_",
    typeName: javaTypeNodeName(p.Type),
  }));
  return result;
}

function convertConstructorDecl(node: any): IR.IRFuncDecl {
  // Constructors become an init-style function
  const params = convertParams(node.Params);
  const body = convertBlockStmt(node.Body);

  const result: IR.IRFuncDecl = { kind: "FuncDecl", name: "init", params, results: [], body, stmtIndex: 0 };
  // Preserve Java-specific metadata for AET-Java output
  (result as any).javaModifiers = node.Modifiers || [];
  (result as any).javaParams = (node.Params || []).map((p: any) => ({
    name: p.Name || "_",
    typeName: javaTypeNodeName(p.Type),
  }));
  return result;
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
  const stmts: IR.IRNode[] = [];
  for (const s of node.Stmts) {
    const converted = convertStmt(s);
    if (!converted) continue;
    // Flatten BlockStmt nodes (from chained assignments) into the parent
    if (converted.kind === "BlockStmt") {
      stmts.push(...(converted as IR.IRBlockStmt).stmts);
    } else {
      stmts.push(converted);
    }
  }
  return { kind: "BlockStmt", stmts };
}

/** Collect post-increment/decrement side effects from within assignment expressions.
 *  e.g., arr[i++] = val → adds "i++" as a separate IncDecStmt after the assignment. */
function collectPostIncDecSideEffects(node: any, stmts: IR.IRNode[]): void {
  // Check if the target of the assignment has a post-inc/dec index
  const target = node.Target;
  if (target?.Kind === "ArrayAccess" && target.Index?.Kind === "UnaryExpr") {
    const op = target.Index.Op;
    if (op === "post++" || op === "++pre" || op === "POSTFIX_INCREMENT" || op === "PREFIX_INCREMENT") {
      stmts.push({ kind: "IncDecStmt", x: convertExpr(target.Index.X), op: "++", stmtIndex: 0 } as IR.IRIncDecStmt);
    } else if (op === "post--" || op === "--pre" || op === "POSTFIX_DECREMENT" || op === "PREFIX_DECREMENT") {
      stmts.push({ kind: "IncDecStmt", x: convertExpr(target.Index.X), op: "--", stmtIndex: 0 } as IR.IRIncDecStmt);
    }
  }
}

/** Flatten chained assignment: head = tail = node → [tail = node, head = node] */
function flattenChainedAssign(node: any): IR.IRNode[] {
  const targets: any[] = [];
  let value = node;
  while (value.Kind === "AssignExpr") {
    targets.push(value.Target);
    value = value.Value;
  }
  // value is now the final RHS (e.g., "node")
  const rhs = convertExpr(value);
  // Emit assignments in reverse order (innermost first) so all targets get the value
  const stmts: IR.IRNode[] = [];
  for (let i = targets.length - 1; i >= 0; i--) {
    stmts.push({
      kind: "AssignStmt",
      lhs: [convertExpr(targets[i])],
      rhs: [rhs],
      op: "=",
      stmtIndex: 0,
    } as IR.IRAssignStmt);
  }
  return stmts;
}

function convertStmt(node: any): IR.IRNode | null {
  if (!node) return null;

  switch (node.Kind) {
    case "ExprStmt": {
      // Check if inner expression is an assignment (Java treats assignments as expressions)
      const inner = node.Expr;
      if (inner?.Kind === "AssignExpr") {
        // Handle chained assignments: head = tail = node → tail = node; head = node
        const stmts = flattenChainedAssign(inner);
        // Extract post-increment/decrement side effects from array indices
        // e.g., arr[i++] = val → arr[i] = val; i++
        collectPostIncDecSideEffects(inner, stmts);
        if (stmts.length > 1) {
          return { kind: "BlockStmt", stmts } as IR.IRBlockStmt;
        }
        return stmts[0];
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

/** Convert an IRType to a proper expression tree for use in ArrayTypeExpr. */
function irTypeToArrayTypeExpr(t: IR.IRType): IR.IRExpr {
  if (t.isSlice && t.elementType) {
    return { kind: "ArrayTypeExpr", elt: irTypeToArrayTypeExpr(t.elementType) } as IR.IRArrayTypeExpr;
  }
  // Get the base type name
  const baseName = t.name || "_in";
  return { kind: "Ident", name: baseName };
}

/** Recursively patch nested CompositeLit elements to use the correct element type. */
function patchNestedCompositeLitTypes(lit: IR.IRCompositeLit, eltExpr: IR.IRExpr): void {
  for (const elt of lit.elts) {
    if (elt.kind === "CompositeLit") {
      const innerLit = elt as IR.IRCompositeLit;
      // If inner lit has _in/Object type, patch it to the correct type
      if (innerLit.type?.kind === "ArrayTypeExpr") {
        const innerElt = (innerLit.type as IR.IRArrayTypeExpr).elt;
        if (innerElt.kind === "Ident" && (innerElt as IR.IRIdent).name === "_in") {
          (innerLit.type as IR.IRArrayTypeExpr).elt = eltExpr;
        }
      }
    }
  }
}

function convertLocalVarDecl(node: any): IR.IRNode {
  let value = node.Init ? convertExpr(node.Init) : undefined;

  // Fix: if init is a NewArrayExpr without Type info, use the VarDecl's Type
  if (node.Init?.Kind === "NewArrayExpr" && !node.Init.Type && node.Type?.Kind === "ArrayType") {
    const declElemType = mapJavaType(node.Type.ElemType);
    // Build proper ArrayTypeExpr element from the declared element type
    const eltExpr = irTypeToArrayTypeExpr(declElemType);
    // Patch the composite literal type
    if (value && value.kind === "CompositeLit" && value.type) {
      (value as IR.IRCompositeLit).type = { kind: "ArrayTypeExpr", elt: eltExpr };
      // Also patch nested CompositeLit elements (for multi-dimensional arrays)
      if (declElemType.isSlice && declElemType.elementType) {
        const innerEltExpr = irTypeToArrayTypeExpr(declElemType.elementType);
        patchNestedCompositeLitTypes(value as IR.IRCompositeLit, innerEltExpr);
      }
    }
    // Patch make() call type
    if (value && value.kind === "CallExpr" && (value as IR.IRCallExpr).func.kind === "Ident" && ((value as IR.IRCallExpr).func as IR.IRIdent).name === "mk") {
      const makeArgs = (value as IR.IRCallExpr).args;
      if (makeArgs.length > 0 && makeArgs[0].kind === "ArrayTypeExpr") {
        (makeArgs[0] as IR.IRArrayTypeExpr).elt = eltExpr;
      }
    }
  }

  // If the variable has an initializer, use short declaration
  if (value) {
    // If the variable type is a parameterized type (e.g., GenericStack<Integer>),
    // use VarDecl with explicit type to preserve the type info
    if (node.Type?.Kind === "ParameterizedType" && node.Type.TypeArgs?.length > 0) {
      const fullType = javaTypeNodeName(node.Type);
      return {
        kind: "VarDecl",
        name: node.Name || "_",
        type: IR.simpleType(fullType),
        value,
        stmtIndex: 0,
      } as IR.IRVarDecl;
    }
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

/** Convert switch expression (Java 14+) to Java_SwitchExpr IR node. */
function convertSwitchExprToIR(node: any): IR.Java_SwitchExpr {
  const tag = node.Expr ? convertExpr(node.Expr) : { kind: "Ident" as const, name: "_" };
  const cases: IR.Java_SwitchExprCase[] = [];

  for (const c of node.Cases || []) {
    if (c.Kind !== "CaseClause") continue;

    let values: IR.IRExpr[] | null = null;
    if (c.Default) {
      values = null;
    } else if (c.Labels) {
      values = (c.Labels as any[]).map(convertCaseLabel);
    }

    // Case body: the ASTDumper stores it as c.Body which can be:
    // 1. A direct expression node (Ident, BinaryExpr, etc.) for arrow cases
    // 2. A BlockStmt for block cases
    // 3. Or c.Stmts for statement-form cases
    let body: IR.IRExpr | IR.IRBlockStmt;
    if (c.Body) {
      if (c.Body.Kind === "BlockStmt") {
        // Block body (may contain yield)
        body = convertBlockStmt(c.Body);
      } else if (c.Body.Kind === "ThrowStmt") {
        // Throw in switch expression → wrap as block with throw
        const throwExpr = c.Body.Expr ? convertExpr(c.Body.Expr) : { kind: "Ident" as const, name: "_" };
        body = {
          kind: "BlockStmt",
          stmts: [{
            kind: "Java_ThrowStmt",
            expr: throwExpr,
            stmtIndex: 0,
          } as IR.Java_ThrowStmt],
        };
      } else {
        // Direct expression body
        body = convertExpr(c.Body);
      }
    } else if (c.Stmts && c.Stmts.length > 0) {
      // Statement form
      if (c.Stmts.length === 1 && c.Stmts[0].Kind === "ExprStmt") {
        body = convertExpr(c.Stmts[0].Expr);
      } else if (c.Stmts.length === 1 && c.Stmts[0].Kind === "YieldStmt") {
        body = convertExpr(c.Stmts[0].Value || c.Stmts[0].Expr);
      } else {
        body = convertBlockStmt({ Stmts: c.Stmts });
      }
    } else if (c.Expr) {
      body = convertExpr(c.Expr);
    } else {
      body = { kind: "Ident" as const, name: "_" };
    }

    cases.push({ values, body });
  }

  return { kind: "Java_SwitchExpr", tag, cases };
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

    case "InstanceOfExpr": {
      // Pattern binding variable: node.Pattern.Var.Name (JDK 16+ pattern matching)
      const binding = node.Pattern?.Var?.Name || node.Binding || node.PatternVar || undefined;
      // Use the pattern type if available (more specific than the instanceof type)
      const instType = node.Pattern?.Var?.Type || node.Type;
      return {
        kind: "Java_InstanceofExpr",
        expr: convertExpr(node.Expr),
        type: mapJavaType(instType),
        binding,
      } as IR.Java_InstanceofExpr;
    }

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
      return convertSwitchExprToIR(node);

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
      return { kind: "BasicLit", type: "INT", value };
    case "long":
      // Preserve long suffix so the emitter can produce `1L` instead of `1`
      return { kind: "BasicLit", type: "INT", value: value.endsWith("L") || value.endsWith("l") ? value : value + "L" };
    case "float":
    case "double":
      return { kind: "BasicLit", type: "FLOAT", value };
    case "char": {
      // Escape special characters in char literals
      const escapedChar = value
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/'/g, "\\'")
        .replace(/\0/g, "\\0");
      return { kind: "BasicLit", type: "CHAR", value: `'${escapedChar}'` };
    }
    case "boolean":
      return { kind: "BasicLit", type: "INT", value };  // true/false as idents
    case "String": {
      // Escape special characters in string content for AETJ output
      const escaped = value
        .replace(/\\/g, "\\\\")   // backslash must be first
        .replace(/"/g, '\\"')     // double quotes
        .replace(/\n/g, "\\n")    // newline
        .replace(/\r/g, "\\r")    // carriage return
        .replace(/\t/g, "\\t");   // tab
      return { kind: "BasicLit", type: "STRING", value: `"${escaped}"` };
    }
    case "null":
      return { kind: "BasicLit", type: "INT", value: "nil" };
    default: {
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      return { kind: "BasicLit", type: "STRING", value: `"${escaped}"` };
    }
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
    const KEYWORD_METHOD_RENAMES: Record<string, string> = Object.create(null);
    KEYWORD_METHOD_RENAMES["append"] = "apd";
    KEYWORD_METHOD_RENAMES["delete"] = "del";
    KEYWORD_METHOD_RENAMES["copy"] = "cpy";
    KEYWORD_METHOD_RENAMES["new"] = "nw_";
    KEYWORD_METHOD_RENAMES["make"] = "mk_";
    KEYWORD_METHOD_RENAMES["filter"] = "flt_";
    KEYWORD_METHOD_RENAMES["range"] = "rng_";
    const renamed = KEYWORD_METHOD_RENAMES[method.Name];
    if (renamed) {
      const obj = convertExpr(method.Expr);
      return { kind: "CallExpr", func: { kind: "SelectorExpr", x: obj, sel: renamed }, args };
    }
  }

  const result: IR.IRCallExpr = { kind: "CallExpr", func: convertExpr(method), args };
  // Preserve explicit type arguments (e.g., Map.Entry.<String, Integer>comparingByValue())
  if (node.TypeArgs && node.TypeArgs.length > 0) {
    (result as any).javaTypeArgs = node.TypeArgs.map(javaTypeNodeName);
  }
  return result;
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
  const javaTypeName = javaTypeNodeName(node.Type);
  const args = (node.Args || []).map(convertExpr);

  // Anonymous inner class: new Interface() { ... } → named inner class
  if (node.Body && node.Body.Kind === "ClassDecl") {
    const anonBody = node.Body;
    const members: any[] = anonBody.Body || [];

    _anonClassCounter++;
    const anonName = `__Anon_${_anonClassCounter}`;

    const methods = members.filter((m: any) => m.Kind === "MethodDecl");
    const fields = members.filter((m: any) => m.Kind === "VarDecl");

    const irFields = fields.map((f: any) => {
      const field: IR.IRField = { name: f.Name, type: mapJavaType(f.Type) };
      (field as any).javaModifiers = f.Modifiers || [];
      (field as any).javaTypeName = javaTypeNodeName(f.Type);
      if (f.Init) (field as any).javaInit = convertExpr(f.Init);
      return field;
    });

    const anonClass: IR.Java_ClassDecl = {
      kind: "Java_ClassDecl",
      name: anonName,
      modifiers: [],   // NOT static — must access enclosing instance fields
      superClass: undefined,
      interfaces: [javaTypeName],
      fields: irFields,
      methods: methods.map(convertMethodDecl),
      constructors: [],
      innerClasses: [],
      stmtIndex: 0,
    };
    _pendingAnonClasses.push(anonClass);

    return {
      kind: "Java_NewExpr",
      type: IR.simpleType(anonName),
      args,
    } as IR.Java_NewExpr;
  }

  // Check constructor aliases: "StringBuilder" → "Sb"
  const alias = javaConstructorAliases[typeName];
  if (alias) {
    return { kind: "CallExpr", func: { kind: "Ident", name: alias }, args };
  }

  // Common Java types that map to Go builtins (only when no args — empty collection init)
  if ((typeName === "ArrayList" || typeName === "LinkedList") && args.length === 0) {
    return { kind: "CallExpr", func: { kind: "Ident", name: "mk" }, args: [{ kind: "ArrayTypeExpr", elt: { kind: "Ident", name: "_in" } } as IR.IRArrayTypeExpr] };
  }
  if (typeName === "HashMap" && args.length === 0) {
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

    case "Java_SwitchExpr":
      return "_";  // handled by javaIrToAETJ path

    default:
      return "_";
  }
}

// ===========================================================================
// javaIrToAETJ — convert IR to AET-Java (.aetj) string
// ===========================================================================

// Module-level state: parameter names that shadow fields in current constructor body.
// When non-empty, we are inside a constructor body and must keep `this.` for shadowed names.
let _ctorParamNames: Set<string> = new Set();

// Module-level flag: true when emitting inside a method/constructor body.
// Used to allow VarDecl := syntax (safe for local vars, not for class fields).
let _inMethodBody: boolean = false;

// Module-level state: known enum type names → set of value names.
// Used to strip enum qualification (e.g., TokenType.PLUS → PLUS).
let _knownEnums: Map<string, Set<string>> = new Map();

/** Recursively collect enum declarations from IR program. */
function collectEnumDecls(decl: IR.IRNode): void {
  if (decl.kind === "Java_EnumDecl") {
    const ed = decl as IR.Java_EnumDecl;
    _knownEnums.set(ed.name, new Set(ed.values.map(v => v.name)));
  }
  if (decl.kind === "Java_ClassDecl") {
    const cd = decl as IR.Java_ClassDecl;
    for (const ic of cd.innerClasses) collectEnumDecls(ic);
  }
}

export function javaIrToAETJ(program: IR.IRProgram): string {
  _ctorParamNames = new Set();
  _knownEnums = new Map();
  // Pre-scan to collect all enum declarations
  for (const decl of program.decls) collectEnumDecls(decl);

  // Group StructDecl + their receiver methods into class bodies
  const structReceiverMap = new Map<string, IR.IRFuncDecl[]>();
  for (const decl of program.decls) {
    if (decl.kind === "FuncDecl" && (decl as IR.IRFuncDecl).receiver) {
      const recvType = (decl as IR.IRFuncDecl).receiver!.type.name.replace(/^\*/, "");
      if (!structReceiverMap.has(recvType)) structReceiverMap.set(recvType, []);
      structReceiverMap.get(recvType)!.push(decl as IR.IRFuncDecl);
    }
  }

  // Collect StructDecl names and standalone (non-receiver) FuncDecls
  const structNames = new Set<string>();
  const standaloneFuncs: IR.IRFuncDecl[] = [];
  for (const decl of program.decls) {
    if (decl.kind === "StructDecl") {
      structNames.add((decl as IR.IRStructDecl).name);
    } else if (decl.kind === "FuncDecl" && !(decl as IR.IRFuncDecl).receiver) {
      standaloneFuncs.push(decl as IR.IRFuncDecl);
    }
  }

  // When there is exactly one StructDecl and standalone funcs exist,
  // include the standalone funcs inside the StructDecl body (they were
  // originally static methods in the same class, e.g. main()).
  const includeStandaloneInStruct = structNames.size === 1 && standaloneFuncs.length > 0;
  const standaloneSet = includeStandaloneInStruct ? new Set<IR.IRFuncDecl>(standaloneFuncs) : new Set<IR.IRFuncDecl>();

  const parts: string[] = ["!java-v1"];

  for (const decl of program.decls) {
    // Skip receiver methods — they'll be emitted inside their StructDecl
    if (decl.kind === "FuncDecl" && (decl as IR.IRFuncDecl).receiver) {
      continue;
    }
    // Skip standalone funcs that will be folded into the StructDecl
    if (decl.kind === "FuncDecl" && standaloneSet.has(decl as IR.IRFuncDecl)) {
      continue;
    }
    // For StructDecl, collect its receiver methods (and standalone funcs) and emit together
    if (decl.kind === "StructDecl") {
      const struct = decl as IR.IRStructDecl;
      const receivers = structReceiverMap.get(struct.name) || [];
      const allMethods = includeStandaloneInStruct ? [...receivers, ...standaloneFuncs] : receivers;
      const s = aetjStructAsClassWithMethods(struct, allMethods);
      if (s) parts.push(s);
      continue;
    }
    const s = aetjNode(decl);
    if (s) parts.push(s);
  }
  return parts.join(";");
}

// ---------------------------------------------------------------------------
// AET-Java modifier helpers
// ---------------------------------------------------------------------------

/** Build modifier prefix string from Java modifier list. */
function aetjModPrefix(mods: string[], context: "field" | "method" | "class"): string {
  let prefix = "";
  const isStatic = mods.includes("static");
  const isFinal = mods.includes("final");
  const isPublic = mods.includes("public");
  const isPrivate = mods.includes("private");
  const isProtected = mods.includes("protected");
  const isAbstract = mods.includes("abstract");

  if (isStatic) prefix += "$";
  if (isAbstract) prefix += "abs ";

  // Access modifiers depend on context defaults:
  // - fields default to private (omit -)
  // - methods default to package-private (omit nothing)
  // - top-level classes are always public (omit +)
  if (context === "field") {
    if (isPublic) prefix += "+";
    else if (isProtected) prefix += "~";
    // private is default for fields — omit
  } else if (context === "method") {
    if (isPublic) prefix += "+";
    else if (isPrivate) prefix += "-";
    else if (isProtected) prefix += "~";
    // package-private is default for methods — omit
  }

  if (isFinal) prefix += "!";

  return prefix;
}

/** Strip wildcard type params from type names (AET parser can't handle ? extends/super).
 *  For types like Class<? extends Exception>, remove the entire type param. */
function stripWildcards(tn: string): string {
  // If the type contains a wildcard, remove the entire parameterized part
  // e.g., Class<? extends Exception> → Class
  if (tn.includes("?")) {
    return tn.replace(/<[^>]*\?[^>]*>/g, "");
  }
  return tn;
}

/** Get the Java type name for a field, using the preserved javaTypeName if available. */
function aetjFieldTypeName(f: IR.IRField): string {
  return stripWildcards((f as any).javaTypeName || irTypeToJavaName(f.type));
}

/** Get Java return type name for a method. */
function aetjReturnTypeName(m: IR.IRFuncDecl): string {
  const jrt = (m as any).javaReturnTypeName;
  if (jrt !== undefined) return stripWildcards(jrt);
  if (m.results.length === 0) return "";
  return irTypeToJavaName(m.results[0]);
}

/** Get Java parameter list string for a method/constructor. */
function aetjParamList(m: IR.IRFuncDecl): string {
  const javaParams: { name: string; typeName: string }[] = (m as any).javaParams;
  if (javaParams && javaParams.length > 0) {
    return javaParams.map(p => `${stripWildcards(p.typeName)} ${p.name}`).join(",");
  }
  // Fallback to IR params
  return m.params.map(p => {
    const tn = irTypeToJavaName(p.type);
    return tn ? `${tn} ${p.name}` : p.name;
  }).join(",");
}

/** Reverse-map a Go-style identifier name back to Java. */
function aetjReverseMapIdent(name: string): string {
  const map: Record<string, string> = {
    "string": "String",
    "int64": "long",
    "float64": "double",
    "float32": "float",
    "bool": "boolean",
    "int16": "short",
    "rune": "char",
    "_in": "Object",
    "error": "Exception",
    "nil": "null",
  };
  return map[name] ?? name;
}

/** Convert IR type back to Java type name. */
function irTypeToJavaName(t: IR.IRType): string {
  if (!t) return "Object";
  // Reverse the JAVA_TYPE_MAP
  const reverseMap: Record<string, string> = {
    "": "void",
    "int": "int",
    "int64": "long",
    "float64": "double",
    "float32": "float",
    "bool": "boolean",
    "byte": "byte",
    "int16": "short",
    "rune": "char",
    "string": "String",
    "_in": "Object",
    "error": "Exception",
  };
  if (t.isSlice && t.elementType) {
    return irTypeToJavaName(t.elementType) + "[]";
  }
  if (t.isMap && t.keyType && t.valueType) {
    return `Map<${irTypeToJavaName(t.keyType)},${irTypeToJavaName(t.valueType)}>`;
  }
  if (t.isPointer && t.elementType) {
    return `Optional<${irTypeToJavaName(t.elementType)}>`;
  }
  const name = reverseMap[t.name] ?? t.name;
  return stripWildcards(name);
}

// ---------------------------------------------------------------------------
// AET-Java constructor auto-generation detection
// ---------------------------------------------------------------------------

/** Check if a constructor body is ALL `this.x = x` assignments (auto-generatable). */
function isAutoConstructor(ctor: IR.IRFuncDecl, fields: IR.IRField[]): boolean {
  const stmts = ctor.body.stmts;
  if (stmts.length === 0) return false;

  // Each statement must be `this.x = x` where x matches a param name
  const paramNames = new Set(ctor.params.map(p => p.name));
  for (const stmt of stmts) {
    if (!stmt || (stmt as any).kind !== "AssignStmt") return false;
    const assign = stmt as IR.IRAssignStmt;
    if (assign.op !== "=") return false;
    if (assign.lhs.length !== 1 || assign.rhs.length !== 1) return false;

    // LHS must be this.x
    const lhs = assign.lhs[0];
    if (lhs.kind !== "SelectorExpr") return false;
    const sel = lhs as IR.IRSelectorExpr;
    if (sel.x.kind !== "Ident" || (sel.x as IR.IRIdent).name !== "this") return false;

    // RHS must be x (matching a param)
    const rhs = assign.rhs[0];
    if (rhs.kind !== "Ident") return false;
    if (!paramNames.has((rhs as IR.IRIdent).name)) return false;

    // sel.sel should match the rhs name
    if (sel.sel !== (rhs as IR.IRIdent).name) return false;
  }

  // Number of assignments should match number of params
  if (stmts.length !== ctor.params.length) return false;

  // Only auto-generatable if the constructor initializes ALL fields
  // (otherwise we need to preserve the partial constructor)
  return ctor.params.length === fields.length;
}

// ---------------------------------------------------------------------------
// AET-Java main method detection
// ---------------------------------------------------------------------------

/** Check if a method is the standard `public static void main(String[] args)`. */
function isMainMethod(m: IR.IRFuncDecl): boolean {
  if (m.name !== "main") return false;
  const mods: string[] = (m as any).javaModifiers || [];
  if (!mods.includes("public") || !mods.includes("static")) return false;
  const retType = aetjReturnTypeName(m);
  if (retType !== "" && retType !== "void") return false;
  return true;
}

// ---------------------------------------------------------------------------
// AET-Java node emitter
// ---------------------------------------------------------------------------

function aetjNode(node: IR.IRNode | IR.IRExprStmt): string {
  switch (node.kind) {
    case "Java_ClassDecl":
      return aetjClassDecl(node);

    case "Java_RecordDecl":
      return aetjRecordDecl(node);

    case "Java_EnumDecl":
      return aetjEnumDecl(node);

    case "Java_SealedInterfaceDecl":
      return aetjSealedInterfaceDecl(node);

    case "FuncDecl": {
      // Top-level function (from flattened static-only class)
      return aetjMethodDecl(node);
    }

    case "StructDecl":
      return aetjStructAsClass(node);

    case "InterfaceDecl":
      return aetjInterfaceDecl(node);

    case "TypeAlias":
      return `@${node.name}=${irTypeToJavaName(node.underlying)}`;

    case "ReturnStmt":
      return `^${node.values.map(aetjExpr).join(",")}`;

    case "IfStmt": {
      // Strip parentheses from condition (Java AST wraps conditions in parens)
      const condExpr = node.cond.kind === "ParenExpr" ? (node.cond as IR.IRParenExpr).x : node.cond;
      let s = `if ${aetjExpr(condExpr)}{${aetjBlock(node.body)}}`;
      if (node.else_) {
        if (node.else_.kind === "IfStmt") {
          s += `else ${aetjNode(node.else_)}`;
        } else if (node.else_.kind === "BlockStmt") {
          s += `else{${aetjBlock(node.else_ as IR.IRBlockStmt)}}`;
        }
      }
      return s;
    }

    case "ForStmt": {
      // while loop: ForStmt with only cond (no init/post)
      if (node.cond && !node.init && !node.post) {
        // Strip parentheses from condition (Java AST wraps conditions in parens)
        const condExpr = node.cond.kind === "ParenExpr" ? (node.cond as IR.IRParenExpr).x : node.cond;
        return `while ${aetjExpr(condExpr)}{${aetjBlock(node.body)}}`;
      }
      // infinite loop: no init, cond, or post
      if (!node.init && !node.cond && !node.post) {
        return `for{${aetjBlock(node.body)}}`;
      }
      // traditional for loop
      const init = node.init ? aetjNode(node.init) : "";
      const cond = node.cond ? aetjExpr(node.cond) : "";
      const post = node.post ? aetjNode(node.post) : "";
      return `for(${init};${cond};${post}){${aetjBlock(node.body)}}`;
    }

    case "RangeStmt": {
      // for(item:collection){body} — AET-Java style
      const varName = node.value || node.key || "_";
      return `for(${varName}:${aetjExpr(node.x)}){${aetjBlock(node.body)}}`;
    }

    case "SwitchStmt": {
      const tag = node.tag ? ` ${aetjExpr(node.tag)}` : "";
      const cases = node.cases.map(c => {
        if (c.values) {
          return `${c.values.map(aetjExpr).join(",")}->${c.body.map(aetjNode).join(";")}`;
        }
        return `_->${c.body.map(aetjNode).join(";")}`;
      }).join(";");
      return `switch${tag}{${cases}}`;
    }

    case "ShortDeclStmt":
      return `${node.names.join(",")}:=${node.values.map(aetjExpr).join(",")}`;

    case "AssignStmt":
      return `${node.lhs.map(aetjExpr).join(",")}${node.op}${node.rhs.map(aetjExpr).join(",")}`;

    case "ExprStmt":
      return aetjExpr(node.expr);

    case "IncDecStmt":
      return `${aetjExpr(node.x)}${node.op}`;

    case "DeferStmt":
      return `defer ${aetjExpr(node.call)}`;

    case "GoStmt":
      return `go ${aetjExpr(node.call)}`;

    case "SendStmt":
      return `${aetjExpr(node.chan)}<-${aetjExpr(node.value)}`;

    case "BranchStmt":
      return node.tok;

    case "VarDecl": {
      if (node.value) {
        // Include explicit type annotation when it's a parameterized/generic type (e.g., GenericStack<Integer>)
        // Format: var name:Type =expr  (space before = to prevent >= tokenization issue)
        if (node.type && node.type.name && node.type.name.includes("<")) {
          return `var ${node.name}:${irTypeToJavaName(node.type)} =${aetjExpr(node.value)}`;
        }
        // Inside method bodies: use := (saves 1 token vs 'var name=')
        if (_inMethodBody) {
          return `${node.name}:=${aetjExpr(node.value)}`;
        }
        return `var ${node.name}=${aetjExpr(node.value)}`;
      }
      // Uninitialized variables
      const tn = node.type ? irTypeToJavaName(node.type) : "Object";
      const defaults: Record<string, string> = Object.create(null);
      defaults["boolean"] = "false";
      defaults["int"] = "0";
      defaults["long"] = "0";
      defaults["double"] = "0.0";
      defaults["float"] = "0.0";
      defaults["char"] = "'\\0'";
      defaults["byte"] = "0";
      defaults["short"] = "0";
      const defaultVal = defaults[tn] || "null";
      // When type is parameterized (e.g., Node<T>), preserve type annotation
      if (defaultVal === "null" && tn.includes("<")) {
        return `var ${node.name}:${tn} =${defaultVal}`;
      }
      // Inside method bodies: use := (saves 1 token vs 'var name=')
      if (_inMethodBody) {
        return `${node.name}:=${defaultVal}`;
      }
      return `var ${node.name}=${defaultVal}`;
    }

    case "ConstDecl":
      return `const(${node.specs.map(s => `${s.name}${s.value ? `=${aetjExpr(s.value)}` : ""}`).join(";")})`;

    // ---- Java-specific nodes ----

    case "Java_TryCatch": {
      let s = `tc{${aetjBlock(node.body)}}`;
      for (const c of node.catches) {
        const exType = irTypeToJavaName(c.exceptionType);
        s += `(${exType} ${c.name}){${aetjBlock(c.body)}}`;
      }
      if (node.finallyBody) {
        s += `!{${aetjBlock(node.finallyBody)}}`;
      }
      return s;
    }

    case "Java_EnhancedFor": {
      // for(item:collection){body}
      return `for(${node.varName}:${aetjExpr(node.iterable)}){${aetjBlock(node.body)}}`;
    }

    case "Java_ThrowStmt":
      return `throw ${aetjExpr(node.expr)}`;

    case "BlockStmt":
      return aetjBlock(node);

    default:
      return `/* ${(node as any).kind} */`;
  }
}

// ---------------------------------------------------------------------------
// AET-Java class declaration
// ---------------------------------------------------------------------------

function aetjClassDecl(node: IR.Java_ClassDecl): string {
  let s = `@${node.name}`;

  // Inheritance
  if (node.superClass) s += `:${node.superClass}`;
  if (node.interfaces.length > 0) s += `[${node.interfaces.join(",")}]`;

  s += "{";
  const parts: string[] = [];

  // Fields
  for (const f of node.fields) {
    const mods: string[] = (f as any).javaModifiers || [];
    const prefix = aetjModPrefix(mods, "field");
    const typeName = aetjFieldTypeName(f);
    let fieldStr = `${prefix}${typeName} ${f.name}`;
    const init = (f as any).javaInit;
    if (init) {
      // If the field type is a collection (ArrayList, HashMap, etc.) and init is mk(...),
      // emit as "new TypeName<>()" to preserve the collection type through round-trip
      const collectionTypes = ["ArrayList", "HashMap", "LinkedHashMap", "TreeMap",
        "HashSet", "LinkedHashSet", "TreeSet", "ArrayDeque", "PriorityQueue",
        "LinkedList", "ConcurrentHashMap", "StringBuilder"];
      const baseTypeName = typeName.replace(/<.*>/, "");
      if (collectionTypes.includes(baseTypeName) && init.kind === "CallExpr" && init.func?.name === "mk") {
        fieldStr += `=new ${baseTypeName}<>()`;
      } else {
        fieldStr += `=${aetjExpr(init)}`;
      }
    }
    parts.push(fieldStr);
  }

  // Constructors (omit auto-generatable ones)
  for (const c of node.constructors) {
    if (isAutoConstructor(c, node.fields)) continue;
    const paramStr = aetjParamList(c);
    // Set constructor param names so aetjExpr keeps this.x for shadowed fields
    _ctorParamNames = new Set(c.params.map(p => p.name));
    _inMethodBody = true;
    const bodyStr = aetjBlock(c.body);
    _inMethodBody = false;
    _ctorParamNames = new Set();
    parts.push(`(${paramStr}){${bodyStr}}`);
  }

  // Methods
  for (const m of node.methods) {
    parts.push(aetjMethodInClass(m));
  }

  // Inner classes
  for (const ic of node.innerClasses) {
    parts.push(aetjClassDecl(ic));
  }

  s += parts.join(";");
  s += "}";
  return s;
}

/** Emit a method declaration inside a class body (with modifier prefixes). */
function aetjMethodInClass(m: IR.IRFuncDecl): string {
  const mods: string[] = (m as any).javaModifiers || [];

  // Special: main method
  if (isMainMethod(m)) {
    _inMethodBody = true;
    const bodyStr = aetjBlock(m.body);
    _inMethodBody = false;
    return `main(){${bodyStr}}`;
  }

  const prefix = aetjModPrefix(mods, "method");
  const paramStr = aetjParamList(m);
  const retType = aetjReturnTypeName(m);
  const retSuffix = retType && retType !== "void" ? `->${retType}` : "";
  const hasReturnType = !!(retType && retType !== "void");

  const typeParamsStr = m.typeParams && m.typeParams.length > 0 ? `<${m.typeParams.join(",")}>` : "";

  _inMethodBody = true;
  const bodyStr = aetjBlock(m.body, hasReturnType);
  _inMethodBody = false;
  return `${prefix}${typeParamsStr}${m.name}(${paramStr})${retSuffix}{${bodyStr}}`;
}

/** Emit a top-level method (from flattened static-only class). */
function aetjMethodDecl(m: IR.IRFuncDecl): string {
  const mods: string[] = (m as any).javaModifiers || [];

  // Special: main method
  if (isMainMethod(m)) {
    _inMethodBody = true;
    const bodyStr = aetjBlock(m.body);
    _inMethodBody = false;
    return `main(){${bodyStr}}`;
  }

  // For top-level, receiver methods keep the Go-style receiver
  if (m.receiver) {
    const prefix = aetjModPrefix(mods, "method");
    const paramStr = aetjParamList(m);
    const retType = aetjReturnTypeName(m);
    const retSuffix = retType && retType !== "void" ? `->${retType}` : "";
    const hasReturnType = !!(retType && retType !== "void");
    _inMethodBody = true;
    const bodyStr = aetjBlock(m.body, hasReturnType);
    _inMethodBody = false;
    return `${prefix}${m.receiver.type.name}.${m.name}(${paramStr})${retSuffix}{${bodyStr}}`;
  }

  // Top-level functions in flattened classes are always public static;
  // the emitter adds public static automatically, so omit modifiers.
  const typeParamsStr = m.typeParams && m.typeParams.length > 0 ? `<${m.typeParams.join(",")}>` : "";
  const paramStr = aetjParamList(m);
  const retType = aetjReturnTypeName(m);
  const retSuffix = retType && retType !== "void" ? `->${retType}` : "";
  const hasReturnType = !!(retType && retType !== "void");

  _inMethodBody = true;
  const bodyStr = aetjBlock(m.body, hasReturnType);
  _inMethodBody = false;
  return `${typeParamsStr}${m.name}(${paramStr})${retSuffix}{${bodyStr}}`;
}

// ---------------------------------------------------------------------------
// AET-Java record declaration
// ---------------------------------------------------------------------------

function aetjRecordDecl(node: IR.Java_RecordDecl): string {
  // @Name(Type field,Type field)[Interface]
  const javaComps: { name: string; typeName: string }[] = (node as any).javaComponents || [];
  const compStr = javaComps.length > 0
    ? javaComps.map(c => `${c.typeName} ${c.name}`).join(",")
    : node.components.map(c => `${irTypeToJavaName(c.type)} ${c.name}`).join(",");

  let s = `@${node.name}`;
  if (node.typeParams.length > 0) s += `<${node.typeParams.join(",")}>`;
  s += `(${compStr})`;
  if (node.interfaces.length > 0) s += `[${node.interfaces.join(",")}]`;

  // Methods (if any)
  if (node.methods.length > 0) {
    s += "{";
    s += node.methods.map(m => aetjMethodInClass(m)).join(";");
    s += "}";
  }

  return s;
}

// ---------------------------------------------------------------------------
// AET-Java enum declaration
// ---------------------------------------------------------------------------

function aetjEnumDecl(node: IR.Java_EnumDecl): string {
  // #Name{VALUE1,VALUE2,...}
  let s = `#${node.name}`;
  if (node.interfaces.length > 0) s += `[${node.interfaces.join(",")}]`;
  s += "{";

  // Enum values
  const valueParts = node.values.map(v => {
    if (v.args.length > 0) {
      return `${v.name}(${v.args.map(aetjExpr).join(",")})`;
    }
    return v.name;
  });
  s += valueParts.join(",");

  // Fields, constructors, methods after semicolon
  const memberParts: string[] = [];
  for (const f of node.fields) {
    const mods: string[] = (f as any).javaModifiers || [];
    const prefix = aetjModPrefix(mods, "field");
    const typeName = aetjFieldTypeName(f);
    let fieldStr = `${prefix}${typeName} ${f.name}`;
    const init = (f as any).javaInit;
    if (init) fieldStr += `=${aetjExpr(init)}`;
    memberParts.push(fieldStr);
  }
  for (const c of node.constructors) {
    const paramStr = aetjParamList(c);
    // Set constructor param names so aetjExpr keeps this.x for shadowed fields
    _ctorParamNames = new Set(c.params.map(p => p.name));
    _inMethodBody = true;
    const bodyStr = aetjBlock(c.body);
    _inMethodBody = false;
    _ctorParamNames = new Set();
    memberParts.push(`(${paramStr}){${bodyStr}}`);
  }
  for (const m of node.methods) {
    memberParts.push(aetjMethodInClass(m));
  }

  if (memberParts.length > 0) {
    s += ";" + memberParts.join(";");
  }

  s += "}";
  return s;
}

// ---------------------------------------------------------------------------
// AET-Java sealed interface declaration
// ---------------------------------------------------------------------------

function aetjSealedInterfaceDecl(node: IR.Java_SealedInterfaceDecl): string {
  // @Name[+Permitted1,Permitted2;method()]
  let s = `@${node.name}`;
  if (node.typeParams.length > 0) s += `<${node.typeParams.join(",")}>`;

  s += "[";
  // + prefix before permits list
  s += "+" + node.permits.join(",");

  // Methods after semicolon
  if (node.methods.length > 0) {
    const methodSigs = node.methods.map(m => {
      const params = m.params.map(p => `${irTypeToJavaName(p.type)} ${p.name}`).join(",");
      const ret = m.results.length > 0 ? `->${irTypeToJavaName(m.results[0])}` : "";
      return `${m.name}(${params})${ret}`;
    });
    s += ";" + methodSigs.join(";");
  }

  s += "]";
  return s;
}

// ---------------------------------------------------------------------------
// AET-Java struct-as-class (for IRStructDecl that came from data classes)
// ---------------------------------------------------------------------------

function aetjStructAsClass(node: IR.IRStructDecl): string {
  return aetjStructAsClassWithMethods(node, []);
}

function aetjStructAsClassWithMethods(node: IR.IRStructDecl, methods: IR.IRFuncDecl[]): string {
  // Emit as a class with fields AND receiver methods inside the body
  let s = `@${node.name}{`;
  const bodyParts: string[] = [];
  // Fields
  for (const f of node.fields) {
    const typeName = aetjFieldTypeName(f);
    bodyParts.push(`!${typeName} ${f.name}`);
  }
  // Methods (stripped of receiver — they're now inside the class)
  for (const m of methods) {
    bodyParts.push(aetjMethodInClass(m));
  }
  s += bodyParts.join(";");
  s += "}";
  return s;
}

// ---------------------------------------------------------------------------
// AET-Java interface declaration
// ---------------------------------------------------------------------------

function aetjInterfaceDecl(node: IR.IRInterfaceDecl): string {
  const methodSigs = node.methods.map(m => {
    const params = m.params.map(p => `${irTypeToJavaName(p.type)} ${p.name}`).join(",");
    const ret = m.results.length > 0 ? `->${irTypeToJavaName(m.results[0])}` : "";
    return `${m.name}(${params})${ret}`;
  });
  return `@${node.name}[${methodSigs.join(";")}]`;
}

// ---------------------------------------------------------------------------
// AET-Java block helper
// ---------------------------------------------------------------------------

function aetjBlock(block: IR.IRBlockStmt, implicitReturn = false): string {
  if (!implicitReturn || block.stmts.length === 0) {
    return block.stmts.map(aetjNode).join(";");
  }
  // Emit all but last normally, then emit last with implicit return (no ^)
  const parts = block.stmts.slice(0, -1).map(aetjNode);
  const last = block.stmts[block.stmts.length - 1];
  if (last.kind === "ReturnStmt" && (last as IR.IRReturnStmt).values.length > 0) {
    // Omit the ^ prefix — just emit the expression
    parts.push((last as IR.IRReturnStmt).values.map(aetjExpr).join(","));
  } else {
    parts.push(aetjNode(last));
  }
  return parts.join(";");
}

// ---------------------------------------------------------------------------
// AET-Java expression emitter
// ---------------------------------------------------------------------------

function aetjExpr(expr: IR.IRExpr): string {
  switch (expr.kind) {
    case "Ident": {
      // Reverse-map nil -> null for AET-Java
      if (expr.name === "nil") return "null";
      return expr.name;
    }

    case "BasicLit":
      return expr.value;

    case "CompositeLit": {
      const typeStr = expr.type ? aetjExpr(expr.type) : "";
      // Array composite literals need 'new' keyword for the parser: new int[]{1,2,3}
      const prefix = typeStr ? "new " : "";
      return `${prefix}${typeStr}{${expr.elts.map(aetjExpr).join(",")}}`;
    }

    case "BinaryExpr":
      return `${aetjExpr(expr.left)}${expr.op}${aetjExpr(expr.right)}`;

    case "UnaryExpr":
      return `${expr.op}${aetjExpr(expr.x)}`;

    case "CallExpr": {
      // Convert mk(Type[], size...) → new BaseType[size1][size2]... for parseable AET-Java
      if (expr.func.kind === "Ident" && (expr.func as IR.IRIdent).name === "mk" && expr.args.length >= 1) {
        const firstArg = expr.args[0];
        if (firstArg.kind === "ArrayTypeExpr") {
          // Unwrap nested ArrayTypeExpr to find base type and count dimensions
          let baseExpr: IR.IRExpr = firstArg;
          let dimCount = 0;
          while (baseExpr.kind === "ArrayTypeExpr") {
            dimCount++;
            baseExpr = (baseExpr as IR.IRArrayTypeExpr).elt;
          }
          const baseStr = baseExpr.kind === "Ident"
            ? aetjReverseMapIdent((baseExpr as IR.IRIdent).name)
            : aetjExpr(baseExpr);

          // When element type is _in/Object (came from diamond ArrayList<>()), emit new ArrayList<>()
          // This distinguishes List creation from array creation (e.g., new String[0])
          const dimSizes = expr.args.slice(1);
          const isZeroSize = dimSizes.length === 0 ||
            (dimSizes.length === 1 && dimSizes[0].kind === "BasicLit" && (dimSizes[0] as IR.IRBasicLit).value === "0");
          if (dimCount === 1 && isZeroSize && (baseStr === "Object" || baseStr === "_in")) {
            return `new ArrayList<>()`;
          }

          // If no sizes at all, use default 0 for first dimension
          if (dimSizes.length === 0) {
            dimSizes.push({ kind: "BasicLit", type: "INT", value: "0" } as IR.IRBasicLit);
          }
          let result = `new ${baseStr}`;
          for (let d = 0; d < dimCount; d++) {
            if (d < dimSizes.length) {
              result += `[${aetjExpr(dimSizes[d])}]`;
            } else {
              result += `[]`;
            }
          }
          return result;
        }
        if (firstArg.kind === "MapTypeExpr") {
          // mk(Map<K,V>) → new HashMap<>() (use diamond for type inference)
          return `new HashMap<>()`;
        }
      }
      // Preserve "nil" as function name (it's a Java method, not the Go null keyword)
      const funcStr = (expr.func.kind === "Ident" && (expr.func as IR.IRIdent).name === "nil")
        ? "nil"
        : aetjExpr(expr.func);
      // Emit type witness args: Map.Entry.<String,Integer>comparingByValue()
      const typeArgs = (expr as any).javaTypeArgs as string[] | undefined;
      if (typeArgs && typeArgs.length > 0 && expr.func.kind === "SelectorExpr") {
        const sel = expr.func as IR.IRSelectorExpr;
        return `${aetjExpr(sel.x)}.<${typeArgs.join(",")}>` +
               `${sel.sel}(${expr.args.map(aetjExpr).join(",")})`;
      }
      return `${funcStr}(${expr.args.map(aetjExpr).join(",")})`;
    }

    case "SelectorExpr": {
      // Strip this. prefix when safe (field not shadowed by constructor param)
      if (expr.x.kind === "Ident" && (expr.x as IR.IRIdent).name === "this") {
        // In constructor body: keep this. only if field name matches a parameter
        if (_ctorParamNames.size === 0 || !_ctorParamNames.has(expr.sel)) {
          return expr.sel;
        }
      }
      // Strip enum qualification: TokenType.PLUS → PLUS
      if (expr.x.kind === "Ident") {
        const lhs = (expr.x as IR.IRIdent).name;
        const enumVals = _knownEnums.get(lhs);
        if (enumVals && enumVals.has(expr.sel)) {
          return expr.sel;
        }
      }
      return `${aetjExpr(expr.x)}.${expr.sel}`;
    }

    case "IndexExpr":
      return `${aetjExpr(expr.x)}[${aetjExpr(expr.index)}]`;

    case "SliceExpr":
      return `${aetjExpr(expr.x)}[${expr.low ? aetjExpr(expr.low) : ""}:${expr.high ? aetjExpr(expr.high) : ""}]`;

    case "StarExpr":
      return `*${aetjExpr(expr.x)}`;

    case "UnaryRecvExpr":
      return `<-${aetjExpr(expr.x)}`;

    case "ParenExpr":
      return `(${aetjExpr(expr.x)})`;

    case "KeyValueExpr":
      return `${aetjExpr(expr.key)}:${aetjExpr(expr.value)}`;

    case "FuncLit":
      return `{${expr.params.map(p => p.name).join(",")}|${aetjBlock(expr.body)}}`;

    case "TypeAssertExpr":
      return `${aetjExpr(expr.x)}.(${irTypeToJavaName(expr.type)})`;

    case "MapTypeExpr":
      return `Map<${aetjExpr(expr.key)},${aetjExpr(expr.value)}>`;

    case "ArrayTypeExpr": {
      // In AET-Java, arrays use Java-order: Type[] not []Type
      const eltStr = expr.elt.kind === "Ident"
        ? aetjReverseMapIdent((expr.elt as IR.IRIdent).name)
        : aetjExpr(expr.elt);
      return `${eltStr}[]`;
    }

    case "ErrorPropExpr":
      return `${aetjExpr(expr.x)}?${expr.wrap ? `!"${expr.wrap}"` : ""}`;

    case "PipeExpr":
      return `${aetjExpr(expr.x)}|${expr.op}(${aetjExpr(expr.fn)})`;

    // ---- Java-specific expressions ----

    case "Java_NewExpr": {
      // new Type(args) → Type(args)  (omit new)
      // Exception: __Anon_* classes need explicit 'new' since they start with _
      const typeName = irTypeToJavaName(expr.type);
      const prefix = typeName.startsWith("__Anon_") ? "new " : "";
      return `${prefix}${typeName}(${expr.args.map(aetjExpr).join(",")})`;
    }

    case "Java_LambdaExpr": {
      // Lambda → {params|body}
      const paramNames = expr.params.map(p => p.name).join(",");
      if ("kind" in expr.body && (expr.body as any).kind === "BlockStmt") {
        return `{${paramNames}|${aetjBlock(expr.body as IR.IRBlockStmt)}}`;
      }
      // Single expression body
      return `{${paramNames}|${aetjExpr(expr.body as IR.IRExpr)}}`;
    }

    case "Java_InstanceofExpr": {
      // expr is Type [name]
      const binding = expr.binding ? ` ${expr.binding}` : "";
      return `${aetjExpr(expr.expr)} is ${irTypeToJavaName(expr.type)}${binding}`;
    }

    case "Java_CastExpr":
      // (Type)expr — kept as-is
      return `(${irTypeToJavaName(expr.type)})${aetjExpr(expr.expr)}`;

    case "Java_TernaryExpr":
      // cond?trueExpr:falseExpr
      return `${aetjExpr(expr.cond)}?${aetjExpr(expr.ifTrue)}:${aetjExpr(expr.ifFalse)}`;

    case "Java_SwitchExpr": {
      // switch expr{VAL->result;VAL->result;_->default}
      // Strip parentheses from tag (Java AST wraps switch expr in parens)
      const tagExpr = expr.tag.kind === "ParenExpr" ? (expr.tag as IR.IRParenExpr).x : expr.tag;
      const tag = aetjExpr(tagExpr);
      const cases = expr.cases.map(c => {
        const label = c.values ? c.values.map(aetjExpr).join(",") : "_";
        let body: string;
        if ("kind" in c.body && (c.body as any).kind === "BlockStmt") {
          body = `{${aetjBlock(c.body as IR.IRBlockStmt)}}`;
        } else {
          body = aetjExpr(c.body as IR.IRExpr);
        }
        return `${label}->${body}`;
      }).join(";");
      return `switch ${tag}{${cases}}`;
    }

    default:
      return "_";
  }
}
