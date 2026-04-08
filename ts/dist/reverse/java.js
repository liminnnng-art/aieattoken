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
let javaReverseAliasMap = Object.create(null);
// Track which aliases are constructors: "new StringBuilder" → "Sb"
let javaConstructorAliases = Object.create(null);
export function loadJavaReverseAliases(path) {
    try {
        const p = path || resolve(process.cwd(), "..", "stdlib-aliases-java.json");
        const data = JSON.parse(readFileSync(p, "utf-8"));
        const aliases = data.aliases || {};
        for (const [alias, info] of Object.entries(aliases)) {
            if (info.isConstructor) {
                // "new StringBuilder" → strip "new " prefix for matching
                const typeName = info.java.replace(/^new\s+/, "");
                javaConstructorAliases[typeName] = alias;
            }
            else {
                javaReverseAliasMap[info.java] = alias;
            }
        }
    }
    catch { /* optional — aliases improve compression but are not required */ }
}
// ---------------------------------------------------------------------------
// parseJavaFile — run ASTDumper via child_process, return parsed JSON AST
// ---------------------------------------------------------------------------
export function parseJavaFile(javaFilePath) {
    const javaCmd = findJavaCommand();
    const astDumperDir = findASTDumperDir();
    // Ensure ASTDumper.class exists; compile if missing
    ensureASTDumperCompiled(javaCmd, astDumperDir);
    try {
        const result = execSync(`"${javaCmd}" -cp "${astDumperDir}" ASTDumper "${javaFilePath}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
        return JSON.parse(result);
    }
    catch (e) {
        throw new Error(`Failed to parse Java file: ${e.message}`);
    }
}
function findJavaCommand() {
    // Try java on PATH first
    try {
        execSync("java -version", { encoding: "utf-8", stdio: "pipe" });
        return "java";
    }
    catch { /* not on PATH */ }
    // Fallback to known Adoptium install location
    const fallback = "C:/Program Files/Eclipse Adoptium/jdk-25.0.2.10-hotspot/bin/java";
    if (existsSync(fallback + ".exe") || existsSync(fallback)) {
        return fallback;
    }
    throw new Error("Java not found. Install a JDK or ensure `java` is on PATH.");
}
function findASTDumperDir() {
    const candidates = [
        resolve(process.cwd(), "..", "java-parser"),
        resolve(process.cwd(), "..", "..", "java-parser"),
        resolve(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "java-parser"),
    ];
    for (const dir of candidates) {
        // Normalise Windows paths (URL pathname may add a leading /)
        const d = dir.replace(/^\/([A-Za-z]:)/, "$1");
        if (existsSync(resolve(d, "ASTDumper.java")))
            return d;
    }
    throw new Error("ASTDumper.java not found in any expected location.");
}
function ensureASTDumperCompiled(javaCmd, dir) {
    if (existsSync(resolve(dir, "ASTDumper.class")))
        return;
    // Derive javac from java command
    const javacCmd = javaCmd.replace(/java$/, "javac").replace(/java\.exe$/, "javac.exe");
    try {
        execSync(`"${javacCmd}" "${resolve(dir, "ASTDumper.java")}"`, {
            encoding: "utf-8",
            stdio: "pipe",
        });
    }
    catch (e) {
        throw new Error(`Failed to compile ASTDumper.java: ${e.message}`);
    }
}
// ---------------------------------------------------------------------------
// Java type mapping helpers
// ---------------------------------------------------------------------------
const JAVA_TYPE_MAP = {
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
function mapJavaType(node) {
    if (!node)
        return IR.simpleType("_in");
    switch (node.Kind) {
        case "PrimitiveType": {
            const mapped = JAVA_TYPE_MAP[node.Name] ?? node.Name;
            return IR.simpleType(mapped);
        }
        case "Ident": {
            const name = node.Name || "_in";
            const mapped = JAVA_TYPE_MAP[name] ?? name;
            return IR.simpleType(mapped);
        }
        case "ArrayType": {
            const elem = mapJavaType(node.ElemType);
            return IR.sliceType(elem);
        }
        case "ParameterizedType": {
            const baseName = typeNodeName(node.Type);
            const typeArgs = node.TypeArgs || [];
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
function typeNodeName(node) {
    if (!node)
        return "_in";
    if (typeof node === "string")
        return node;
    if (node.Kind === "Ident")
        return node.Name || "_in";
    if (node.Kind === "PrimitiveType")
        return JAVA_TYPE_MAP[node.Name] ?? node.Name;
    if (node.Kind === "FieldAccess")
        return `${typeNodeName(node.Expr)}.${node.Name}`;
    if (node.Kind === "ParameterizedType")
        return typeNodeName(node.Type);
    return node.Name || "_in";
}
// ---------------------------------------------------------------------------
// javaAstToIR — main entry point: Java JSON AST → IR
// ---------------------------------------------------------------------------
export function javaAstToIR(javaAst) {
    const decls = [];
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
        imports: [], // Imports are stripped — AET auto-resolves them
        decls,
        stmtIndex: 0,
    };
}
// ---------------------------------------------------------------------------
// Class conversion — the core logic
// ---------------------------------------------------------------------------
function convertClassDecl(node, out) {
    const name = node.Name || "";
    const members = node.Body || [];
    const methods = members.filter((m) => m.Kind === "MethodDecl");
    const constructors = members.filter((m) => m.Kind === "ConstructorDecl");
    const fields = members.filter((m) => m.Kind === "VarDecl");
    const innerClasses = members.filter((m) => m.Kind === "ClassDecl" || m.Kind === "InterfaceDecl" || m.Kind === "EnumDecl");
    const instanceFields = fields.filter((f) => !(f.Modifiers || []).includes("static"));
    const allMethodsStatic = methods.length > 0 &&
        methods.every((m) => (m.Modifiers || []).includes("static"));
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
            if (ic.Kind === "ClassDecl")
                convertClassDecl(ic, out);
            else if (ic.Kind === "InterfaceDecl")
                out.push(convertInterfaceDecl(ic));
            else if (ic.Kind === "EnumDecl")
                out.push(convertEnumDecl(ic));
        }
        return;
    }
    // Strategy 2: Data class with fields + getters/setters → IRStructDecl
    const getterSetterResult = detectGettersSetters(instanceFields, methods);
    if (hasInstanceFields && getterSetterResult.isDataClass) {
        const irFields = instanceFields.map((f) => ({
            name: f.Name,
            type: mapJavaType(f.Type),
        }));
        out.push({
            kind: "StructDecl",
            name,
            fields: irFields,
            stmtIndex: 0,
        });
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
    const irFields = fields.map((f) => ({
        name: f.Name,
        type: mapJavaType(f.Type),
    }));
    const irMethods = methods.map(convertMethodDecl);
    const irConstructors = constructors.map(convertConstructorDecl);
    const irInnerClasses = [];
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
    });
}
function convertClassToJavaClassDecl(node) {
    const members = node.Body || [];
    const methods = members.filter((m) => m.Kind === "MethodDecl");
    const constructors = members.filter((m) => m.Kind === "ConstructorDecl");
    const fields = members.filter((m) => m.Kind === "VarDecl");
    const innerClasses = members.filter((m) => m.Kind === "ClassDecl");
    return {
        kind: "Java_ClassDecl",
        name: node.Name || "",
        modifiers: node.Modifiers || [],
        superClass: node.Extends ? typeNodeName(node.Extends) : undefined,
        interfaces: (node.Implements || []).map(typeNodeName),
        fields: fields.map((f) => ({ name: f.Name, type: mapJavaType(f.Type) })),
        methods: methods.map(convertMethodDecl),
        constructors: constructors.map(convertConstructorDecl),
        innerClasses: innerClasses.map(convertClassToJavaClassDecl),
        stmtIndex: 0,
    };
}
function detectGettersSetters(fields, methods) {
    const fieldNames = new Set(fields.map((f) => f.Name.toLowerCase()));
    const gsMethodNames = new Set();
    for (const m of methods) {
        const mName = m.Name || "";
        const mods = m.Modifiers || [];
        if (mods.includes("static"))
            continue;
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
    const nonStaticMethods = methods.filter((m) => !(m.Modifiers || []).includes("static"));
    const isDataClass = gsMethodNames.size > 0 &&
        gsMethodNames.size >= nonStaticMethods.length / 2;
    const remainingMethods = methods.filter((m) => !gsMethodNames.has(m.Name));
    return { isDataClass, remainingMethods };
}
// ---------------------------------------------------------------------------
// Interface / Enum conversion
// ---------------------------------------------------------------------------
function convertInterfaceDecl(node) {
    const members = node.Body || [];
    const methods = [];
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
function convertEnumDecl(node) {
    const members = node.Body || [];
    const specs = [];
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
function convertMethodDecl(node) {
    const name = node.Name || "";
    const params = convertParams(node.Params);
    const results = node.ReturnType ? convertReturnTypes(node.ReturnType) : [];
    const body = convertBlockStmt(node.Body);
    return { kind: "FuncDecl", name, params, results, body, stmtIndex: 0 };
}
function convertConstructorDecl(node) {
    // Constructors become an init-style function
    const params = convertParams(node.Params);
    const body = convertBlockStmt(node.Body);
    return { kind: "FuncDecl", name: "init", params, results: [], body, stmtIndex: 0 };
}
function convertParams(params) {
    if (!params)
        return [];
    return params.map((p) => ({
        name: p.Name || "_",
        type: mapJavaType(p.Type),
    }));
}
function convertReturnTypes(retType) {
    const mapped = mapJavaType(retType);
    // void → no return types
    if (mapped.name === "" || mapped.name === "void")
        return [];
    return [mapped];
}
function convertFieldToVarDecl(node) {
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
function convertBlockStmt(node) {
    if (!node || !node.Stmts)
        return { kind: "BlockStmt", stmts: [] };
    return {
        kind: "BlockStmt",
        stmts: node.Stmts.map(convertStmt).filter(Boolean),
    };
}
function convertStmt(node) {
    if (!node)
        return null;
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
                };
            }
            if (inner?.Kind === "CompoundAssignExpr") {
                return {
                    kind: "AssignStmt",
                    lhs: [convertExpr(inner.Target)],
                    rhs: [convertExpr(inner.Value)],
                    op: (inner.Op || "+=").replace("PLUS_ASSIGNMENT", "+=").replace("MINUS_ASSIGNMENT", "-=").replace("MULTIPLY_ASSIGNMENT", "*=").replace("DIVIDE_ASSIGNMENT", "/=").replace("REMAINDER_ASSIGNMENT", "%="),
                    stmtIndex: 0,
                };
            }
            // Check for increment/decrement expression
            if (inner?.Kind === "UnaryExpr") {
                const op = inner.Op;
                if (op === "post++" || op === "++pre" || op === "POSTFIX_INCREMENT" || op === "PREFIX_INCREMENT") {
                    return { kind: "IncDecStmt", x: convertExpr(inner.X), op: "++", stmtIndex: 0 };
                }
                if (op === "post--" || op === "--pre" || op === "POSTFIX_DECREMENT" || op === "PREFIX_DECREMENT") {
                    return { kind: "IncDecStmt", x: convertExpr(inner.X), op: "--", stmtIndex: 0 };
                }
            }
            return {
                kind: "ExprStmt",
                expr: convertExpr(node.Expr),
                stmtIndex: 0,
            };
        }
        case "ReturnStmt":
            return {
                kind: "ReturnStmt",
                values: node.Value ? [convertExpr(node.Value)] : [],
                stmtIndex: 0,
            };
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
            };
        case "BreakStmt":
            return {
                kind: "BranchStmt",
                tok: "break",
                label: node.Label || undefined,
                stmtIndex: 0,
            };
        case "ContinueStmt":
            return {
                kind: "BranchStmt",
                tok: "continue",
                label: node.Label || undefined,
                stmtIndex: 0,
            };
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
            };
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
function convertLocalVarDecl(node) {
    let value = node.Init ? convertExpr(node.Init) : undefined;
    // Fix: if init is a NewArrayExpr without Type info, use the VarDecl's Type
    if (node.Init?.Kind === "NewArrayExpr" && !node.Init.Type && node.Type?.Kind === "ArrayType") {
        const declElemType = mapJavaType(node.Type.ElemType);
        // Patch the composite literal type
        if (value && value.kind === "CompositeLit" && value.type) {
            value.type = { kind: "ArrayTypeExpr", elt: { kind: "Ident", name: declElemType.name } };
        }
        // Patch make() call type
        if (value && value.kind === "CallExpr" && value.func.kind === "Ident" && value.func.name === "mk") {
            const makeArgs = value.args;
            if (makeArgs.length > 0 && makeArgs[0].kind === "ArrayTypeExpr") {
                makeArgs[0].elt = { kind: "Ident", name: declElemType.name };
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
        };
    }
    return {
        kind: "VarDecl",
        name: node.Name || "_",
        type: mapJavaType(node.Type),
        value: undefined,
        stmtIndex: 0,
    };
}
function convertIfStmt(node) {
    const cond = convertExpr(node.Cond);
    const body = convertStmtToBlock(node.Then);
    let else_;
    if (node.Else) {
        if (node.Else.Kind === "IfStmt") {
            else_ = convertIfStmt(node.Else);
        }
        else {
            else_ = convertStmtToBlock(node.Else);
        }
    }
    return { kind: "IfStmt", cond, body, else_, stmtIndex: 0 };
}
/** Ensure a statement node is wrapped in a BlockStmt. */
function convertStmtToBlock(node) {
    if (!node)
        return { kind: "BlockStmt", stmts: [] };
    if (node.Kind === "BlockStmt")
        return convertBlockStmt(node);
    // Single statement — wrap it
    const stmt = convertStmt(node);
    return { kind: "BlockStmt", stmts: stmt ? [stmt] : [] };
}
function convertForStmt(node) {
    // Init can be a list of statements (Java allows comma-separated init)
    const initList = node.Init || [];
    const init = initList.length > 0 ? convertStmt(initList[0]) || undefined : undefined;
    const cond = node.Cond ? convertExpr(node.Cond) : undefined;
    // Update can be a list of expression statements
    const updateList = node.Update || [];
    let post;
    if (updateList.length > 0) {
        post = convertForUpdate(updateList[0]);
    }
    const body = convertStmtToBlock(node.Body);
    return { kind: "ForStmt", init, cond, post, body, stmtIndex: 0 };
}
function convertForUpdate(node) {
    if (!node)
        return { kind: "ExprStmt", expr: { kind: "Ident", name: "_" }, stmtIndex: 0 };
    // Unwrap ExprStmt to check inner expression
    const innerNode = node.Kind === "ExprStmt" ? (node.Expr || node) : node;
    // Unary expr (++i, i++, etc.)
    if (innerNode.Kind === "UnaryExpr") {
        const op = innerNode.Op;
        if (op === "post++" || op === "++pre" || op === "POSTFIX_INCREMENT" || op === "PREFIX_INCREMENT") {
            return { kind: "IncDecStmt", x: convertExpr(innerNode.X), op: "++", stmtIndex: 0 };
        }
        if (op === "post--" || op === "--pre" || op === "POSTFIX_DECREMENT" || op === "PREFIX_DECREMENT") {
            return { kind: "IncDecStmt", x: convertExpr(innerNode.X), op: "--", stmtIndex: 0 };
        }
    }
    // Compound assignment (door += pass)
    if (innerNode.Kind === "CompoundAssignExpr") {
        const opStr = (innerNode.Op || "+=");
        const op = opStr.includes("PLUS") ? "+=" : opStr.includes("MINUS") ? "-=" : opStr.includes("MULTI") ? "*=" : opStr.includes("DIVI") ? "/=" : opStr.includes("REMAIN") ? "%=" : opStr;
        return { kind: "AssignStmt", lhs: [convertExpr(innerNode.Target)], rhs: [convertExpr(innerNode.Value)], op, stmtIndex: 0 };
    }
    // Simple assignment
    if (innerNode.Kind === "AssignExpr") {
        return { kind: "AssignStmt", lhs: [convertExpr(innerNode.Target)], rhs: [convertExpr(innerNode.Value)], op: "=", stmtIndex: 0 };
    }
    // Fall through to general statement conversion
    if (node.Kind === "ExprStmt") {
        return convertStmt(node) || { kind: "ExprStmt", expr: convertExpr(node.Expr), stmtIndex: 0 };
    }
    // Compound assignment
    if (node.Kind === "CompoundAssignExpr") {
        return {
            kind: "AssignStmt",
            lhs: [convertExpr(node.Target)],
            rhs: [convertExpr(node.Value)],
            op: node.Op || "+=",
            stmtIndex: 0,
        };
    }
    // Simple assignment
    if (node.Kind === "AssignExpr") {
        return {
            kind: "AssignStmt",
            lhs: [convertExpr(node.Target)],
            rhs: [convertExpr(node.Value)],
            op: "=",
            stmtIndex: 0,
        };
    }
    // Fallback: convert as an expression statement
    const fallbackExpr = convertExpr(node);
    return { kind: "ExprStmt", expr: fallbackExpr, stmtIndex: 0 };
}
function convertForEachStmt(node) {
    const varNode = node.Var;
    const varName = varNode?.Name || "_";
    return {
        kind: "RangeStmt",
        key: "_",
        value: varName,
        x: convertExpr(node.Expr),
        body: convertStmtToBlock(node.Body),
        stmtIndex: 0,
    };
}
function convertWhileStmt(node) {
    return {
        kind: "ForStmt",
        cond: convertExpr(node.Cond),
        body: convertStmtToBlock(node.Body),
        stmtIndex: 0,
    };
}
function convertDoWhileStmt(node) {
    // do { body } while(cond) → for { body; if !cond { break } }
    const innerBody = convertStmtToBlock(node.Body);
    const breakIfNotCond = {
        kind: "IfStmt",
        cond: { kind: "UnaryExpr", op: "!", x: convertExpr(node.Cond) },
        body: {
            kind: "BlockStmt",
            stmts: [{ kind: "BranchStmt", tok: "break", stmtIndex: 0 }],
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
function convertSwitchStmt(node) {
    const tag = node.Expr ? convertExpr(node.Expr) : undefined;
    const caseClauses = [];
    for (const c of node.Cases || []) {
        if (c.Kind !== "CaseClause")
            continue;
        let values;
        if (c.Default) {
            values = undefined; // default case
        }
        else if (c.Labels) {
            values = c.Labels.map(convertCaseLabel);
        }
        const body = [];
        // Statements can appear in Stmts or Body
        for (const s of c.Stmts || []) {
            const converted = convertStmt(s);
            // Filter out break in switch (not needed in AET/Go)
            if (converted && converted.kind === "BranchStmt" && converted.tok === "break")
                continue;
            if (converted)
                body.push(converted);
        }
        if (c.Body) {
            const converted = convertStmt(c.Body);
            if (converted)
                body.push(converted);
        }
        caseClauses.push({ kind: "CaseClause", values, body });
    }
    return { kind: "SwitchStmt", tag, cases: caseClauses, stmtIndex: 0 };
}
function convertCaseLabel(node) {
    if (node.Kind === "ConstantCaseLabel") {
        return convertExpr(node.Expr);
    }
    return convertExpr(node);
}
function convertTryStmt(node) {
    const body = convertBlockStmt(node.Body);
    const catches = [];
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
    const resources = (node.Resources || []).map(convertStmt).filter(Boolean);
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
function convertExpr(node) {
    if (!node)
        return { kind: "Ident", name: "_" };
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
            };
        case "InstanceOfExpr":
            return {
                kind: "Java_InstanceofExpr",
                expr: convertExpr(node.Expr),
                type: mapJavaType(node.Type),
            };
        case "TernaryExpr":
            return {
                kind: "Java_TernaryExpr",
                cond: convertExpr(node.Cond),
                ifTrue: convertExpr(node.Then),
                ifFalse: convertExpr(node.Else),
            };
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
function convertIdentExpr(node) {
    const name = node.Name || "_";
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
function convertLiteral(node) {
    const litType = node.Type || "String";
    const value = node.Value ?? "null";
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
            return { kind: "BasicLit", type: "INT", value }; // true/false as idents
        case "String":
            return { kind: "BasicLit", type: "STRING", value: `"${value}"` };
        case "null":
            return { kind: "BasicLit", type: "INT", value: "nil" };
        default:
            return { kind: "BasicLit", type: "STRING", value: `"${value}"` };
    }
}
function convertUnaryExpr(node) {
    const op = node.Op || "!";
    const x = convertExpr(node.X);
    // Postfix / prefix increment/decrement — these are expressions in Java
    if (op === "post++" || op === "++pre") {
        return x; // Simplify; the increment is handled at statement level
    }
    if (op === "post--" || op === "--pre") {
        return x;
    }
    return { kind: "UnaryExpr", op, x };
}
function convertMethodCall(node) {
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
        return { kind: "CallExpr", func: convertExpr(method), args };
    }
    // Rename method names that clash with AET parser keywords
    if (method?.Kind === "FieldAccess") {
        const KEYWORD_METHOD_RENAMES = {
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
function flattenMethodCallName(node) {
    if (!node)
        return null;
    if (node.Kind === "Ident")
        return node.Name || null;
    if (node.Kind === "FieldAccess") {
        const prefix = flattenMethodCallName(node.Expr);
        if (prefix)
            return `${prefix}.${node.Name}`;
        return node.Name || null;
    }
    return null;
}
function convertFieldAccess(node) {
    const obj = convertExpr(node.Expr);
    const fieldName = node.Name || "";
    // Special: .length field access → len(obj) — avoids AET keyword conflict
    if (fieldName === "length") {
        return { kind: "CallExpr", func: { kind: "Ident", name: "ln" }, args: [obj] };
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
function convertNewExpr(node) {
    const typeName = typeNodeName(node.Type);
    const args = (node.Args || []).map(convertExpr);
    // Check constructor aliases: "StringBuilder" → "Sb"
    const alias = javaConstructorAliases[typeName];
    if (alias) {
        return { kind: "CallExpr", func: { kind: "Ident", name: alias }, args };
    }
    // Common Java types that map to Go builtins
    if (typeName === "ArrayList" || typeName === "LinkedList") {
        return { kind: "CallExpr", func: { kind: "Ident", name: "mk" }, args: [{ kind: "ArrayTypeExpr", elt: { kind: "Ident", name: "_in" } }] };
    }
    if (typeName === "HashMap" || typeName === "TreeMap" || typeName === "LinkedHashMap") {
        return { kind: "CallExpr", func: { kind: "Ident", name: "mk" }, args: [{ kind: "MapTypeExpr", key: { kind: "Ident", name: "string" }, value: { kind: "Ident", name: "_in" } }] };
    }
    // General new expression → Java_NewExpr
    return {
        kind: "Java_NewExpr",
        type: IR.simpleType(typeName),
        args,
    };
}
function convertNewArrayExpr(node) {
    const elemType = node.Type ? mapJavaType(node.Type) : IR.simpleType("_in");
    // Array with initializer → composite literal
    if (node.Init && node.Init.length > 0) {
        return {
            kind: "CompositeLit",
            type: { kind: "ArrayTypeExpr", elt: { kind: "Ident", name: elemType.name } },
            elts: node.Init.map(convertExpr),
        };
    }
    // Array with dimensions → make([]Type, size) or make([][]Type, size1, size2)
    const dims = node.Dimensions || [];
    // Build the array type expression with correct nesting for multi-dimensional arrays
    let innerType = { kind: "Ident", name: elemType.name };
    for (let i = 1; i < dims.length; i++) {
        innerType = { kind: "ArrayTypeExpr", elt: innerType };
    }
    const mkArgs = [
        { kind: "ArrayTypeExpr", elt: innerType },
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
function convertLambdaExpr(node) {
    const params = (node.Params || []).map((p) => ({
        name: p.Name || "_",
        type: p.Type ? mapJavaType(p.Type) : IR.simpleType("_in"),
    }));
    const bodyKind = node.BodyKind || "EXPRESSION";
    if (bodyKind === "EXPRESSION") {
        // Single expression lambda → Java_LambdaExpr with expr body
        return {
            kind: "Java_LambdaExpr",
            params,
            body: convertExpr(node.Body),
        };
    }
    // Block lambda
    return {
        kind: "Java_LambdaExpr",
        params,
        body: convertBlockStmt(node.Body),
    };
}
function convertMethodRef(node) {
    // Method reference (e.g., String::valueOf) → convert to selector
    const obj = convertExpr(node.Expr);
    const name = node.Name || "";
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
export function javaIrToAET(program) {
    const parts = ["!v3"];
    for (const decl of program.decls) {
        parts.push(javaNodeToAET(decl));
    }
    return parts.join(";");
}
function javaNodeToAET(node) {
    switch (node.kind) {
        case "FuncDecl": {
            let s = "";
            if (node.receiver) {
                s += `${node.receiver.type.name}.`;
            }
            s += `${node.name}(${node.params.map(p => {
                if (p.type.name === "_in")
                    return p.name;
                return `${p.name}:${p.type.name}`;
            }).join(",")})`;
            if (node.results.length > 0) {
                if (node.results.length === 1) {
                    s += `->${node.results[0].name}`;
                }
                else {
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
                }
                else if (node.else_.kind === "BlockStmt") {
                    s += `else{${javaBlockToAET(node.else_)}}`;
                }
            }
            return s;
        }
        case "ForStmt": {
            let header = "";
            if (node.init && node.post) {
                header = `${javaNodeToAET(node.init)};${node.cond ? javaExprToAET(node.cond) : ""};${javaNodeToAET(node.post)}`;
            }
            else if (node.cond) {
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
            if (node.type)
                s += `:${node.type.name}`;
            if (node.value)
                s += `=${javaExprToAET(node.value)}`;
            return s;
        }
        case "ConstDecl":
            return `const(${node.specs.map(s => `${s.name}${s.value ? `=${javaExprToAET(s.value)}` : ""}`).join(";")})`;
        // ---- Java-specific nodes ----
        case "Java_ClassDecl": {
            // Only emit if it cannot be collapsed to @Struct
            let s = `@class ${node.name}`;
            if (node.superClass)
                s += ` extends ${node.superClass}`;
            if (node.interfaces.length > 0)
                s += ` impl ${node.interfaces.join(",")}`;
            s += "{";
            const parts = [];
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
                    if (stmt && stmt.kind === "Java_ThrowStmt") {
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
            return `/* ${node.kind} */`;
    }
}
function javaBlockToAET(block) {
    return block.stmts.map(javaNodeToAET).join(";");
}
function javaExprToAET(expr) {
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
            if ("kind" in expr.body && expr.body.kind === "BlockStmt") {
                return `{${paramNames}|${javaBlockToAET(expr.body)}}`;
            }
            // Single expression body
            return `{${paramNames}|${javaExprToAET(expr.body)}}`;
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
