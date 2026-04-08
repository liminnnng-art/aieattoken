// Emitter: Converts IR to valid Java source code

import * as IR from "../ir.js";

// Stdlib aliases loaded from stdlib-aliases-java.json
interface StdlibAlias {
    java: string;
    pkg: string;
    auto?: boolean;
    import?: string;
    isConstructor?: boolean;
}

interface StdlibAliases {
    aliases: Record<string, StdlibAlias>;
}

export interface JavaEmitOptions {
    className?: string;
    packageName?: string;
}

// Default aliases — embedded so the emitter works without file I/O at runtime.
// Kept in sync with stdlib-aliases-java.json.
const STDLIB_ALIASES: Record<string, StdlibAlias> = {
    pl:  { java: "System.out.println",          pkg: "java.lang", auto: true },
    pr:  { java: "System.out.print",            pkg: "java.lang", auto: true },
    pf:  { java: "System.out.printf",           pkg: "java.lang", auto: true },
    sf:  { java: "String.format",               pkg: "java.lang", auto: true },
    Se:  { java: "System.err.println",          pkg: "java.lang", auto: true },
    Sx:  { java: "System.exit",                 pkg: "java.lang", auto: true },
    Pi:  { java: "Integer.parseInt",            pkg: "java.lang", auto: true },
    Sv:  { java: "String.valueOf",              pkg: "java.lang", auto: true },
    Mx:  { java: "Math.max",                    pkg: "java.lang", auto: true },
    Mn:  { java: "Math.min",                    pkg: "java.lang", auto: true },
    Ma:  { java: "Math.abs",                    pkg: "java.lang", auto: true },
    Mr:  { java: "Math.random",                 pkg: "java.lang", auto: true },
    Cs:  { java: "Collections.sort",            pkg: "java.util.Collections", import: "java.util.Collections" },
    Al:  { java: "Arrays.asList",               pkg: "java.util.Arrays",      import: "java.util.Arrays" },
    Ia:  { java: "Arrays.sort",                 pkg: "java.util.Arrays",      import: "java.util.Arrays" },
    Fr:  { java: "Files.readString",            pkg: "java.nio.file.Files",   import: "java.nio.file.Files" },
    Fw:  { java: "Files.writeString",           pkg: "java.nio.file.Files",   import: "java.nio.file.Files" },
    Fl:  { java: "Files.readAllLines",          pkg: "java.nio.file.Files",   import: "java.nio.file.Files" },
    Po:  { java: "Path.of",                     pkg: "java.nio.file.Path",    import: "java.nio.file.Path" },
    Ls:  { java: "List.of",                     pkg: "java.util.List",        import: "java.util.List" },
    Ms:  { java: "Map.of",                      pkg: "java.util.Map",         import: "java.util.Map" },
    Ge:  { java: "System.getenv",               pkg: "java.lang", auto: true },
    Tn:  { java: "System.nanoTime",             pkg: "java.lang", auto: true },
    Tm:  { java: "System.currentTimeMillis",    pkg: "java.lang", auto: true },
    Tp:  { java: "Thread.sleep",                pkg: "java.lang", auto: true },
    Ps:  { java: "Pattern.compile",             pkg: "java.util.regex.Pattern", import: "java.util.regex.Pattern" },
    Sb:  { java: "new StringBuilder",           pkg: "java.lang", auto: true, isConstructor: true },
    Oe:  { java: "Optional.empty",              pkg: "java.util.Optional",    import: "java.util.Optional" },
    Oo:  { java: "Optional.of",                 pkg: "java.util.Optional",    import: "java.util.Optional" },
    Hc:  { java: "HttpClient.newHttpClient",    pkg: "java.net.http.HttpClient", import: "java.net.http.HttpClient" },
    Cd:  { java: "Character.isDigit",           pkg: "java.lang", auto: true },
    Cl:  { java: "Character.isLetter",          pkg: "java.lang", auto: true },
    Cu:  { java: "Character.isUpperCase",       pkg: "java.lang", auto: true },
    Di:  { java: "Double.isInfinite",           pkg: "java.lang", auto: true },
    Mc:  { java: "Math.ceil",                   pkg: "java.lang", auto: true },
    Sq:  { java: "Math.sqrt",                   pkg: "java.lang", auto: true },
    Ep:  { java: "Math.pow",                    pkg: "java.lang", auto: true },
    Oh:  { java: "Objects.hash",                pkg: "java.util.Objects", import: "java.util.Objects" },
    Or:  { java: "Objects.requireNonNull",      pkg: "java.util.Objects", import: "java.util.Objects" },
    Ts:  { java: "Arrays.toString",             pkg: "java.util.Arrays",  import: "java.util.Arrays" },
    Ac:  { java: "Arrays.copyOf",               pkg: "java.util.Arrays",  import: "java.util.Arrays" },
    Re:  { java: "Objects.equals",              pkg: "java.util.Objects", import: "java.util.Objects" },
    Lo:  { java: "Character.isLowerCase",       pkg: "java.lang", auto: true },
    Ws:  { java: "Character.isWhitespace",      pkg: "java.lang", auto: true },
};

// ─── Import tracker ────────────────────────────────────────────────────────────

class ImportTracker {
    private imports = new Set<string>();

    add(importPath: string): void {
        // java.lang.* is auto-imported — never emit it
        if (importPath.startsWith("java.lang")) return;
        this.imports.add(importPath);
    }

    /** Scan a type name and auto-add java.util imports for collection types. */
    trackType(typeName: string): void {
        // Detect common java.util types that need importing
        const utilTypes = [
            "ArrayList", "LinkedList", "HashMap", "LinkedHashMap", "TreeMap",
            "HashSet", "LinkedHashSet", "TreeSet", "List", "Map", "Set",
            "Queue", "Deque", "ArrayDeque", "PriorityQueue",
            "Collections", "Optional", "Iterator", "StringJoiner",
            "Objects", "NoSuchElementException", "EmptyStackException",
        ];
        for (const t of utilTypes) {
            if (typeName.includes(t)) {
                this.add("java.util.*");
                return;
            }
        }
        // java.util.regex types
        if (typeName.includes("Pattern") || typeName.includes("Matcher")) {
            this.add("java.util.regex.*");
        }
        // java.util.stream types
        if (typeName.includes("Collectors") || typeName.includes("Stream")) {
            this.add("java.util.stream.*");
        }
    }

    getImports(): string[] {
        return [...this.imports].sort();
    }
}

// ─── Module-level state reset per emit call ────────────────────────────────────

let imports: ImportTracker;

// Track which variable names are known to be strings (for .length vs .length())
let stringVarNames: Set<string> = new Set();

// Track which class names are generic (have type parameters) — used to add <> to new calls
let genericClassNames: Set<string> = new Set();

// Track enum value → enum type name mapping for re-qualifying bare enum identifiers
let enumValueToType: Map<string, string> = new Map();

// Flag: when true, don't re-qualify enum values (inside switch case labels)
let _inSwitchCaseLabel: boolean = false;

/** Pre-scan declarations to find generic class names (those with <T>, <K,V>, etc.) */
function collectGenericClassNames(decl: IR.IRNode): void {
    if (decl.kind === "Java_ClassDecl") {
        const cd = decl as IR.Java_ClassDecl;
        // Class name might contain type params: GenericStack<T>
        const match = cd.name.match(/^(\w+)<(.+)>$/);
        if (match) {
            genericClassNames.add(match[1]);
        }
        // Recurse into inner classes
        for (const ic of cd.innerClasses) {
            collectGenericClassNames(ic);
        }
    }
}

/** Pre-scan to collect enum value -> enum type name mapping. */
function collectEnumValues(decl: IR.IRNode): void {
    if (decl.kind === "Java_EnumDecl") {
        const ed = decl as IR.Java_EnumDecl;
        for (const v of ed.values) {
            enumValueToType.set(v.name, ed.name);
        }
    }
    if (decl.kind === "Java_ClassDecl") {
        const cd = decl as IR.Java_ClassDecl;
        for (const ic of cd.innerClasses) collectEnumValues(ic);
    }
}

/** Names of sealed interfaces (used to auto-add 'non-sealed' to implementing classes). */
let sealedInterfaceNames: Set<string> = new Set();

/** Pre-scan to collect sealed interface names. */
function collectSealedInterfaces(decl: IR.IRNode): void {
    if (decl.kind === "Java_SealedInterfaceDecl") {
        sealedInterfaceNames.add((decl as IR.Java_SealedInterfaceDecl).name);
    }
    if (decl.kind === "Java_ClassDecl") {
        const cd = decl as IR.Java_ClassDecl;
        for (const ic of cd.innerClasses) collectSealedInterfaces(ic);
    }
}

// ─── Public entry point ────────────────────────────────────────────────────────

export function emit(program: IR.IRProgram, options?: JavaEmitOptions): string {
    imports = new ImportTracker();
    stringVarNames = new Set();
    genericClassNames = new Set();
    enumValueToType = new Map();
    sealedInterfaceNames = new Set();

    // Pre-scan for generic class declarations, enum values, and sealed interfaces
    for (const decl of program.decls) {
        collectGenericClassNames(decl);
        collectEnumValues(decl);
        collectSealedInterfaces(decl);
    }

    const className = options?.className ?? "Main";
    const packageName = options?.packageName;

    // Check whether the program already contains Java_ClassDecl nodes
    const hasClassDecl = program.decls.some(d =>
        d.kind === "Java_ClassDecl" || d.kind === "Java_RecordDecl" ||
        d.kind === "Java_EnumDecl" || d.kind === "Java_SealedInterfaceDecl"
    );

    // Emit declarations into body lines
    const bodyLines: string[] = [];

    if (hasClassDecl) {
        // Separate Java class/record/enum/interface decls from functions/vars
        const classDecls: IR.IRNode[] = [];
        const mainDecls: IR.IRNode[] = [];
        for (const decl of program.decls) {
            if (decl.kind === "Java_ClassDecl" || decl.kind === "Java_RecordDecl" ||
                decl.kind === "Java_EnumDecl" || decl.kind === "Java_SealedInterfaceDecl" ||
                decl.kind === "InterfaceDecl" || decl.kind === "StructDecl") {
                classDecls.push(decl);
            } else {
                mainDecls.push(decl);
            }
        }
        // Emit class decls at top level (as inner classes)
        // and wrap functions/vars in a main class
        if (mainDecls.length > 0) {
            bodyLines.push("");
            bodyLines.push(emitAutoMainClass(className, mainDecls, 0, classDecls));
        } else {
            // Only class decls, emit them directly
            for (const decl of classDecls) {
                bodyLines.push("");
                bodyLines.push(emitNode(decl, 0));
            }
        }
    } else {
        // Auto-wrap: group receiver methods by type, everything else goes into Main
        const receiverMethods = new Map<string, IR.IRFuncDecl[]>();
        const structs: IR.IRStructDecl[] = [];
        const interfaces: IR.IRInterfaceDecl[] = [];
        const mainClassDecls: IR.IRNode[] = [];

        for (const decl of program.decls) {
            if (decl.kind === "FuncDecl" && (decl as IR.IRFuncDecl).receiver) {
                const fd = decl as IR.IRFuncDecl;
                const typeName = fd.receiver!.type.name;
                if (!receiverMethods.has(typeName)) {
                    receiverMethods.set(typeName, []);
                }
                receiverMethods.get(typeName)!.push(fd);
            } else if (decl.kind === "StructDecl") {
                structs.push(decl as IR.IRStructDecl);
            } else if (decl.kind === "InterfaceDecl") {
                interfaces.push(decl as IR.IRInterfaceDecl);
            } else {
                mainClassDecls.push(decl);
            }
        }

        // Emit standalone struct classes (with their receiver methods merged in)
        for (const s of structs) {
            bodyLines.push("");
            const methods = receiverMethods.get(s.name) ?? [];
            receiverMethods.delete(s.name);
            bodyLines.push(emitStructAsClass(s, methods, 0));
        }

        // Emit any receiver methods whose struct was not declared (edge case)
        for (const [typeName, methods] of receiverMethods) {
            bodyLines.push("");
            bodyLines.push(emitOrphanReceiverClass(typeName, methods, 0));
        }

        // Emit interfaces
        for (const iface of interfaces) {
            bodyLines.push("");
            bodyLines.push(emitInterfaceDecl(iface, 0));
        }

        // Emit the main wrapper class with static methods
        bodyLines.push("");
        bodyLines.push(emitAutoMainClass(className, mainClassDecls, 0));
    }

    // Assemble final output: package, imports, body
    const header: string[] = [];

    if (packageName) {
        header.push(`package ${packageName};`);
        header.push("");
    }

    const resolvedImports = imports.getImports();
    if (resolvedImports.length > 0) {
        for (const imp of resolvedImports) {
            header.push(`import ${imp};`);
        }
        header.push("");
    }

    return header.join("\n") + bodyLines.join("\n") + "\n";
}

// ─── Indentation (4 spaces for Java) ───────────────────────────────────────────

function indent(level: number): string {
    return "    ".repeat(level);
}

// ─── Auto main class wrapper ───────────────────────────────────────────────────

function emitAutoMainClass(className: string, decls: IR.IRNode[], level: number, innerClassDecls?: IR.IRNode[]): string {
    const lines: string[] = [];
    lines.push(`${indent(level)}public class ${className} {`);

    for (const decl of decls) {
        lines.push("");
        if (decl.kind === "FuncDecl") {
            lines.push(emitStaticMethod(decl as IR.IRFuncDecl, level + 1));
        } else if (decl.kind === "VarDecl") {
            lines.push(emitStaticField(decl as IR.IRVarDecl, level + 1));
        } else if (decl.kind === "ConstDecl") {
            lines.push(emitStaticConst(decl as IR.IRConstDecl, level + 1));
        } else {
            lines.push(emitNode(decl, level + 1));
        }
    }

    // Add inner class declarations
    if (innerClassDecls) {
        for (const decl of innerClassDecls) {
            lines.push("");
            lines.push(emitNode(decl, level + 1));
        }
    }

    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

/** Collect variable names whose type is known to be String. */
function collectStringVars(node: IR.IRFuncDecl): void {
    for (const p of node.params) {
        if (p.type && (p.type.name === "string" || p.type.name === "String")) {
            stringVarNames.add(p.name);
        }
    }
    // Also scan body for VarDecl/ShortDeclStmt with string types
    collectStringVarsFromBlock(node.body);
}

function collectStringVarsFromBlock(block: IR.IRBlockStmt): void {
    for (const stmt of block.stmts) {
        if (stmt.kind === "VarDecl") {
            const vd = stmt as IR.IRVarDecl;
            if (vd.type && (vd.type.name === "string" || vd.type.name === "String")) {
                stringVarNames.add(vd.name);
            }
        } else if (stmt.kind === "Java_EnhancedFor") {
            const ef = stmt as IR.Java_EnhancedFor;
            if (ef.varType && (ef.varType.name === "string" || ef.varType.name === "String" || ef.varType.name === "rune")) {
                stringVarNames.add(ef.varName);
            }
            collectStringVarsFromBlock(ef.body);
        } else if (stmt.kind === "ForStmt") {
            const fs = stmt as IR.IRForStmt;
            collectStringVarsFromBlock(fs.body);
        } else if (stmt.kind === "IfStmt") {
            const is_ = stmt as IR.IRIfStmt;
            collectStringVarsFromBlock(is_.body);
            if (is_.else_ && is_.else_.kind === "BlockStmt") collectStringVarsFromBlock(is_.else_ as IR.IRBlockStmt);
        }
    }
}

function emitStaticMethod(node: IR.IRFuncDecl, level: number): string {
    collectStringVars(node);
    // main function gets special signature
    if (node.name === "main") {
        const lines: string[] = [];
        lines.push(`${indent(level)}public static void main(String[] args) {`);
        lines.push(emitBlockBody(node.body, level + 1));
        lines.push(`${indent(level)}}`);
        return lines.join("\n");
    }

    const returnType = emitReturnType(node.results);
    const params = node.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");
    const typeParamsStr = node.typeParams && node.typeParams.length > 0 ? `<${node.typeParams.join(", ")}> ` : "";

    const lines: string[] = [];
    lines.push(`${indent(level)}public static ${typeParamsStr}${returnType} ${node.name}(${params}) {`);
    lines.push(emitBlockBody(node.body, level + 1));
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

function emitStaticField(node: IR.IRVarDecl, level: number): string {
    let type = node.type ? mapType(node.type) : "";
    // 'var' cannot be used for static fields — infer type from value
    if (!type || type === "var") {
        type = inferTypeFromExpr(node.value);
    }
    let s = `${indent(level)}static ${type} ${node.name}`;
    if (node.value) s += ` = ${emitExpr(node.value)}`;
    s += ";";
    return s;
}

/** Infer a Java type string from an expression (best-effort). */
function inferTypeFromExpr(expr: IR.IRExpr | undefined): string {
    if (!expr) return "Object";
    switch (expr.kind) {
        case "BasicLit":
            switch (expr.type) {
                case "INT": return "int";
                case "FLOAT": return "double";
                case "STRING": return "String";
                case "CHAR": return "char";
                default: return "Object";
            }
        case "CompositeLit": {
            if (expr.type?.kind === "ArrayTypeExpr") {
                const elt = (expr.type as IR.IRArrayTypeExpr).elt;
                let eltType = elt.kind === "Ident" ? mapIRTypeToJava((elt as IR.IRIdent).name) : "Object";
                // If element type is Object/_in, try to infer from actual elements
                if (eltType === "Object" && expr.elts.length > 0) {
                    eltType = inferTypeFromExpr(expr.elts[0]);
                }
                return eltType + "[]";
            }
            // No type annotation — try to infer from elements
            if (expr.elts.length > 0) {
                const firstElt = inferTypeFromExpr(expr.elts[0]);
                if (firstElt !== "Object") return firstElt + "[]";
            }
            return "Object[]";
        }
        case "Java_NewExpr":
            return mapType(expr.type);
        default:
            return "Object";
    }
}

function emitStaticConst(node: IR.IRConstDecl, level: number): string {
    const lines: string[] = [];
    for (const spec of node.specs) {
        let type = spec.type ? mapType(spec.type) : "";
        if (!type || type === "var") {
            type = inferTypeFromExpr(spec.value);
        }
        let s = `${indent(level)}static final ${type} ${spec.name}`;
        if (spec.value) s += ` = ${emitExpr(spec.value)}`;
        s += ";";
        lines.push(s);
    }
    return lines.join("\n");
}

// ─── Struct → Java class ───────────────────────────────────────────────────────

function emitStructAsClass(node: IR.IRStructDecl, methods: IR.IRFuncDecl[], level: number): string {
    const lines: string[] = [];
    lines.push(`${indent(level)}public class ${node.name} {`);

    // Private fields
    for (const f of node.fields) {
        lines.push(`${indent(level + 1)}private ${mapType(f.type)} ${f.name};`);
    }

    // All-args constructor
    if (node.fields.length > 0) {
        lines.push("");
        const ctorParams = node.fields.map(f => `${mapType(f.type)} ${f.name}`).join(", ");
        lines.push(`${indent(level + 1)}public ${node.name}(${ctorParams}) {`);
        for (const f of node.fields) {
            lines.push(`${indent(level + 2)}this.${f.name} = ${f.name};`);
        }
        lines.push(`${indent(level + 1)}}`);
    }

    // Getters and setters
    for (const f of node.fields) {
        const capName = capitalize(f.name);
        const type = mapType(f.type);

        lines.push("");
        lines.push(`${indent(level + 1)}public ${type} get${capName}() {`);
        lines.push(`${indent(level + 2)}return this.${f.name};`);
        lines.push(`${indent(level + 1)}}`);

        lines.push("");
        lines.push(`${indent(level + 1)}public void set${capName}(${type} ${f.name}) {`);
        lines.push(`${indent(level + 2)}this.${f.name} = ${f.name};`);
        lines.push(`${indent(level + 1)}}`);
    }

    // toString
    lines.push("");
    lines.push(`${indent(level + 1)}@Override`);
    lines.push(`${indent(level + 1)}public String toString() {`);
    if (node.fields.length === 0) {
        lines.push(`${indent(level + 2)}return "${node.name}{}";`);
    } else {
        const fieldStrs = node.fields.map(
            (f, i) => `"${i === 0 ? "" : ", "}${f.name}=" + ${f.name}`
        );
        lines.push(`${indent(level + 2)}return "${node.name}{" + ${fieldStrs.join(" + ")} + "}";`);
    }
    lines.push(`${indent(level + 1)}}`);

    // Instance methods from receiver functions
    for (const m of methods) {
        lines.push("");
        lines.push(emitInstanceMethod(m, level + 1));
    }

    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

function emitOrphanReceiverClass(typeName: string, methods: IR.IRFuncDecl[], level: number): string {
    const lines: string[] = [];
    lines.push(`${indent(level)}public class ${typeName} {`);
    for (const m of methods) {
        lines.push("");
        lines.push(emitInstanceMethod(m, level + 1));
    }
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

function emitInstanceMethod(node: IR.IRFuncDecl, level: number): string {
    collectStringVars(node);
    // main method with no params gets standard Java main signature
    if (node.name === "main" && node.params.length === 0) {
        const lines: string[] = [];
        lines.push(`${indent(level)}public static void main(String[] args) {`);
        lines.push(emitBlockBody(node.body, level + 1));
        lines.push(`${indent(level)}}`);
        return lines.join("\n");
    }

    const returnType = emitReturnType(node.results);
    const params = node.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");

    const lines: string[] = [];

    // Read method modifiers from the transformer (stored via (decl as any).modifiers)
    const methodMods: string[] = (node as any).modifiers || [];

    // Build modifier string
    let modsStr = "";
    const hasAccess = methodMods.some(m => m === "public" || m === "private" || m === "protected");
    if (!hasAccess) modsStr += "public ";
    else modsStr += methodMods.filter(m => m === "public" || m === "private" || m === "protected").join(" ") + " ";
    if (methodMods.includes("static")) modsStr += "static ";
    // Method-level type parameters (e.g., <T>)
    const typeParamsStr = node.typeParams && node.typeParams.length > 0 ? `<${node.typeParams.join(", ")}> ` : "";
    modsStr += typeParamsStr;

    // Check for @Override
    if (methodMods.includes("override")) {
        lines.push(`${indent(level)}@Override`);
    }

    lines.push(`${indent(level)}${modsStr}${returnType} ${node.name}(${params}) {`);
    lines.push(emitBlockBody(node.body, level + 1));
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

// ─── Interface → Java interface ────────────────────────────────────────────────

function emitInterfaceDecl(node: IR.IRInterfaceDecl, level: number): string {
    const lines: string[] = [];
    lines.push(`${indent(level)}public interface ${node.name} {`);
    for (const m of node.methods) {
        const returnType = emitReturnType(m.results);
        const params = m.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");
        lines.push(`${indent(level + 1)}${returnType} ${m.name}(${params});`);
    }
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

// ─── Node emission ─────────────────────────────────────────────────────────────

function emitNode(node: IR.IRNode | IR.IRExprStmt, level: number): string {
    switch (node.kind) {
        case "FuncDecl":        return emitFuncDecl(node, level);
        case "StructDecl":      return emitStructAsClass(node, [], level);
        case "InterfaceDecl":   return emitInterfaceDecl(node, level);
        case "TypeAlias":       return emitTypeAlias(node, level);
        case "BlockStmt":       return emitBlockStmt(node, level);
        case "IfStmt":          return emitIfStmt(node, level);
        case "ForStmt":         return emitForStmt(node, level);
        case "RangeStmt":       return emitRangeStmt(node, level);
        case "SwitchStmt":      return emitSwitchStmt(node, level);
        case "ReturnStmt":      return emitReturnStmt(node, level);
        case "AssignStmt":      return emitAssignStmt(node, level);
        case "ShortDeclStmt":   return emitShortDeclStmt(node, level);
        case "ExprStmt":        return `${indent(level)}${emitExpr(node.expr)};`;
        case "IncDecStmt":      return `${indent(level)}${emitExpr(node.x)}${node.op};`;
        case "BranchStmt":      return emitBranchStmt(node, level);
        case "VarDecl":         return emitVarDecl(node, level);
        case "ConstDecl":       return emitConstDecl(node, level);

        // Java-specific nodes
        case "Java_ClassDecl":  return emitJavaClassDecl(node, level);
        case "Java_TryCatch":   return emitJavaTryCatch(node, level);
        case "Java_EnhancedFor": return emitJavaEnhancedFor(node, level);
        case "Java_ThrowStmt":  return emitJavaThrowStmt(node, level);

        // AET-Java v1 nodes
        case "Java_RecordDecl":          return emitRecordDecl(node as IR.Java_RecordDecl, level);
        case "Java_EnumDecl":            return emitEnumDecl(node as IR.Java_EnumDecl, level);
        case "Java_SealedInterfaceDecl": return emitSealedInterfaceDecl(node as IR.Java_SealedInterfaceDecl, level);

        // Go-specific nodes — error
        case "SelectStmt":
            throw new Error("Go-specific construct SelectStmt not supported for Java target");
        case "CommClause":
            throw new Error("Go-specific construct CommClause not supported for Java target");
        case "GoStmt":
            throw new Error("Go-specific construct GoStmt not supported for Java target");
        case "DeferStmt":
            throw new Error("Go-specific construct DeferStmt not supported for Java target");
        case "SendStmt":
            throw new Error("Go-specific construct SendStmt not supported for Java target");

        default:
            return `${indent(level)}// unknown node: ${(node as any).kind}`;
    }
}

function emitFuncDecl(node: IR.IRFuncDecl, level: number): string {
    if (node.receiver) {
        return emitInstanceMethod(node, level);
    }
    return emitStaticMethod(node, level);
}

function emitTypeAlias(node: IR.IRTypeAlias, level: number): string {
    // Java has no direct type alias; emit a comment
    return `${indent(level)}// type alias: ${node.name} = ${node.underlying.name}`;
}

function emitBlockStmt(node: IR.IRBlockStmt, level: number): string {
    return `{\n${emitBlockBody(node, level + 1)}${indent(level)}}`;
}

function emitBlockBody(block: IR.IRBlockStmt, level: number): string {
    return block.stmts.map(s => emitNode(s, level) + "\n").join("");
}

function emitIfStmt(node: IR.IRIfStmt, level: number): string {
    let s = "";

    // Java does not have init statements in if — emit as a preceding statement
    if (node.init) {
        s += emitNode(node.init, level) + "\n";
    }

    s += `${indent(level)}if (${emitCondExpr(node.cond)}) {\n`;
    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;

    if (node.else_) {
        if (node.else_.kind === "IfStmt") {
            s += " else " + emitIfStmt(node.else_ as IR.IRIfStmt, 0).trimStart();
        } else if (node.else_.kind === "BlockStmt") {
            s += ` else {\n${emitBlockBody(node.else_ as IR.IRBlockStmt, level + 1)}${indent(level)}}`;
        }
    }

    return s;
}

function emitForStmt(node: IR.IRForStmt, level: number): string {
    let s = "";

    if (node.init && node.post) {
        // Classic for loop
        const init = emitNode(node.init, 0).trim().replace(/;$/, "");
        const cond = node.cond ? emitExpr(node.cond) : "";
        const post = emitNode(node.post, 0).trim().replace(/;$/, "");
        s += `${indent(level)}for (${init}; ${cond}; ${post}) {\n`;
    } else if (node.cond) {
        // While loop
        s += `${indent(level)}while (${emitExpr(node.cond)}) {\n`;
    } else {
        // Infinite loop
        s += `${indent(level)}while (true) {\n`;
    }

    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    return s;
}

function emitRangeStmt(node: IR.IRRangeStmt, level: number): string {
    let s = "";

    if (node.value) {
        // for key, value := range x  →  for (var value : x) { ... } (key needs index tracking)
        if (node.key && node.key !== "_") {
            // Emit index-based loop
            const collection = emitExpr(node.x);
            s += `${indent(level)}for (int ${node.key} = 0; ${node.key} < ${collection}.length; ${node.key}++) {\n`;
            s += `${indent(level + 1)}var ${node.value} = ${collection}[${node.key}];\n`;
            s += emitBlockBody(node.body, level + 1);
            s += `${indent(level)}}`;
            return s;
        }

        // Simple enhanced for
        s += `${indent(level)}for (var ${node.value} : ${emitExpr(node.x)}) {\n`;
    } else if (node.key && node.key !== "_") {
        // for key := range x  →  index-only iteration
        const collection = emitExpr(node.x);
        s += `${indent(level)}for (int ${node.key} = 0; ${node.key} < ${collection}.length; ${node.key}++) {\n`;
    } else {
        // for range x  →  just iterate
        s += `${indent(level)}for (var _item : ${emitExpr(node.x)}) {\n`;
    }

    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    return s;
}

function emitSwitchStmt(node: IR.IRSwitchStmt, level: number): string {
    let s = "";

    // Java does not have init statements in switch — emit as preceding statement
    if (node.init) {
        s += emitNode(node.init, level) + "\n";
    }

    if (node.tag) {
        s += `${indent(level)}switch (${emitExpr(node.tag)}) {\n`;
    } else {
        // Tagless switch → if/else chain
        return emitTaglessSwitch(node, level);
    }

    for (const c of node.cases) {
        if (c.values) {
            for (const v of c.values) {
                _inSwitchCaseLabel = true;
                s += `${indent(level + 1)}case ${emitExpr(v)}:\n`;
                _inSwitchCaseLabel = false;
            }
        } else {
            s += `${indent(level + 1)}default:\n`;
        }
        for (const stmt of c.body) {
            s += emitNode(stmt, level + 2) + "\n";
        }
        // Add break unless last statement is return or break
        if (c.body.length > 0) {
            const last = c.body[c.body.length - 1];
            if (last.kind !== "ReturnStmt" && last.kind !== "BranchStmt") {
                s += `${indent(level + 2)}break;\n`;
            }
        } else {
            s += `${indent(level + 2)}break;\n`;
        }
    }

    s += `${indent(level)}}`;
    return s;
}

function emitTaglessSwitch(node: IR.IRSwitchStmt, level: number): string {
    let s = "";
    let first = true;
    for (const c of node.cases) {
        if (c.values) {
            const cond = c.values.map(emitExpr).join(" || ");
            if (first) {
                s += `${indent(level)}if (${cond}) {\n`;
                first = false;
            } else {
                s += ` else if (${cond}) {\n`;
            }
        } else {
            // default
            s += ` else {\n`;
        }
        for (const stmt of c.body) {
            s += emitNode(stmt, level + 1) + "\n";
        }
        s += `${indent(level)}}`;
    }
    return s;
}

function emitReturnStmt(node: IR.IRReturnStmt, level: number): string {
    if (node.values.length === 0) {
        return `${indent(level)}return;`;
    }
    if (node.values.length === 1) {
        return `${indent(level)}return ${emitExpr(node.values[0])};`;
    }
    // Multiple return values: Java does not support this directly.
    // Emit as a comment with the values for now.
    const vals = node.values.map(emitExpr).join(", ");
    return `${indent(level)}return ${vals}; // multiple return values`;
}

function emitAssignStmt(node: IR.IRAssignStmt, level: number): string {
    const lhs = node.lhs.map(emitExpr).join(", ");
    const rhs = node.rhs.map(emitExpr).join(", ");
    return `${indent(level)}${lhs} ${node.op} ${rhs};`;
}

function emitShortDeclStmt(node: IR.IRShortDeclStmt, level: number): string {
    // Check for error propagation in RHS
    if (node.values.length === 1 && node.values[0].kind === "ErrorPropExpr") {
        return emitErrorPropDecl(node.names, node.values[0] as IR.IRErrorPropExpr, level);
    }

    if (node.names.length === 1 && node.values.length === 1) {
        const valStr = emitExpr(node.values[0]);
        // Java can't infer type from null — use Object instead of var
        if (valStr === "null") {
            return `${indent(level)}Object ${node.names[0]} = null;`;
        }
        return `${indent(level)}var ${node.names[0]} = ${valStr};`;
    }

    // Multiple declarations
    const lines: string[] = [];
    for (let i = 0; i < node.names.length; i++) {
        const val = i < node.values.length ? emitExpr(node.values[i]) : "null";
        if (val === "null") {
            lines.push(`${indent(level)}Object ${node.names[i]} = null;`);
        } else {
            lines.push(`${indent(level)}var ${node.names[i]} = ${val};`);
        }
    }
    return lines.join("\n");
}

function emitErrorPropDecl(names: string[], errProp: IR.IRErrorPropExpr, level: number): string {
    const lines: string[] = [];
    if (names.length === 1) {
        const varName = names[0];
        lines.push(`${indent(level)}${mapType({ name: "interface{}" })} ${varName};`);
        lines.push(`${indent(level)}try {`);
        lines.push(`${indent(level + 1)}${varName} = ${emitExpr(errProp.x)};`);
        lines.push(`${indent(level)}} catch (Exception e) {`);
        if (errProp.wrap) {
            lines.push(`${indent(level + 1)}throw new RuntimeException("${errProp.wrap}", e);`);
        } else {
            lines.push(`${indent(level + 1)}throw e;`);
        }
        lines.push(`${indent(level)}}`);
    } else {
        // Multiple names — emit try-catch around the expression
        lines.push(`${indent(level)}try {`);
        lines.push(`${indent(level + 1)}var _result = ${emitExpr(errProp.x)};`);
        for (let i = 0; i < names.length; i++) {
            lines.push(`${indent(level + 1)}var ${names[i]} = _result; // TODO: destructure index ${i}`);
        }
        lines.push(`${indent(level)}} catch (Exception e) {`);
        if (errProp.wrap) {
            lines.push(`${indent(level + 1)}throw new RuntimeException("${errProp.wrap}", e);`);
        } else {
            lines.push(`${indent(level + 1)}throw e;`);
        }
        lines.push(`${indent(level)}}`);
    }
    return lines.join("\n");
}

function emitBranchStmt(node: IR.IRBranchStmt, level: number): string {
    if (node.tok === "fallthrough") {
        return `${indent(level)}// fallthrough (Java does not need explicit fallthrough)`;
    }
    if (node.tok === "goto") {
        // Java does not support goto; emit as comment
        return `${indent(level)}// goto ${node.label ?? ""} (not supported in Java)`;
    }
    if (node.label) {
        return `${indent(level)}${node.tok} ${node.label};`;
    }
    return `${indent(level)}${node.tok};`;
}

function emitVarDecl(node: IR.IRVarDecl, level: number): string {
    if (node.type && node.value) {
        return `${indent(level)}${mapType(node.type)} ${node.name} = ${emitExpr(node.value)};`;
    }
    if (node.type) {
        return `${indent(level)}${mapType(node.type)} ${node.name};`;
    }
    if (node.value) {
        // Java can't infer type from null — use Object instead of var
        const valStr = emitExpr(node.value);
        if (valStr === "null") {
            return `${indent(level)}Object ${node.name} = null;`;
        }
        return `${indent(level)}var ${node.name} = ${valStr};`;
    }
    return `${indent(level)}var ${node.name};`;
}

function emitConstDecl(node: IR.IRConstDecl, level: number): string {
    const lines: string[] = [];
    for (const spec of node.specs) {
        const type = spec.type ? mapType(spec.type) : "var";
        let s = `${indent(level)}final ${type} ${spec.name}`;
        if (spec.value) s += ` = ${emitExpr(spec.value)}`;
        s += ";";
        lines.push(s);
    }
    return lines.join("\n");
}

// ─── Java-specific node emission ───────────────────────────────────────────────

/** Parse a field tag like "modifiers:private,final;init:new ArrayList<>()" */
function parseFieldTag(tag: string | undefined): { modifiers: string[]; init: string | undefined } {
    if (!tag) return { modifiers: [], init: undefined };
    // Simple legacy tag: just "final"
    if (tag === "final") return { modifiers: ["final"], init: undefined };
    const result: { modifiers: string[]; init: string | undefined } = { modifiers: [], init: undefined };
    // Split on ';' but be careful about init values that may contain ';'
    const modsMatch = tag.match(/^modifiers:([^;]*)/);
    if (modsMatch) {
        result.modifiers = modsMatch[1].split(",").filter(m => m.length > 0);
    }
    const initMatch = tag.match(/;init:(.+)$/s);
    if (initMatch) {
        result.init = initMatch[1];
    } else if (tag.startsWith("init:")) {
        result.init = tag.substring(5);
    }
    return result;
}

function emitJavaClassDecl(node: IR.Java_ClassDecl, level: number): string {
    const lines: string[] = [];
    // Add non-sealed modifier if the class implements interfaces and isn't already sealed/non-sealed/final
    const mods = [...node.modifiers];

    // Inner classes (level > 0) should be static unless already marked
    if (level > 0 && !mods.includes("static")) {
        // Insert static after access modifier or at the start
        const accessIdx = Math.max(mods.indexOf("public"), mods.indexOf("private"), mods.indexOf("protected"));
        if (accessIdx >= 0) {
            mods.splice(accessIdx + 1, 0, "static");
        } else {
            mods.unshift("static");
        }
    }

    // Auto-add non-sealed when implementing a sealed interface and no seal modifier present
    if (node.interfaces.length > 0 &&
        !mods.includes("non-sealed") && !mods.includes("sealed") && !mods.includes("final")) {
        const implementsSealed = node.interfaces.some(iface => {
            const baseName = iface.replace(/<.*>$/, "");
            return sealedInterfaceNames.has(baseName);
        });
        if (implementsSealed) {
            // Insert non-sealed before 'class' (after static if present)
            const staticIdx = mods.indexOf("static");
            if (staticIdx >= 0) {
                mods.splice(staticIdx + 1, 0, "non-sealed");
            } else {
                mods.push("non-sealed");
            }
        }
    }
    const modsStr = mods.length > 0 ? mods.join(" ") + " " : "";
    let header = `${indent(level)}${modsStr}class ${node.name}`;
    if (node.superClass) {
        header += ` extends ${node.superClass}`;
    }
    if (node.interfaces.length > 0) {
        header += ` implements ${node.interfaces.join(", ")}`;
    }
    header += " {";
    lines.push(header);

    // Parse field tags to detect modifiers and initializers
    const hasFinalFields = node.fields.some(f => {
        const fieldMods = parseFieldTag(f.tag).modifiers;
        return fieldMods.includes("final") || node.modifiers.includes("final");
    });

    // Fields
    for (const f of node.fields) {
        const parsed = parseFieldTag(f.tag);
        const fieldMods = parsed.modifiers;
        const isFinal = fieldMods.includes("final");
        const isPrivate = fieldMods.includes("private") || !fieldMods.some(m => m === "public" || m === "protected");
        const accessMod = fieldMods.includes("public") ? "public" : fieldMods.includes("protected") ? "protected" : "private";
        const staticMod = fieldMods.includes("static") ? " static" : "";
        const finalMod = isFinal ? " final" : "";
        const typeName = mapType(f.type);
        imports.trackType(typeName);
        // Track String fields for .length() vs .length
        if (typeName === "String") {
            stringVarNames.add(f.name);
        }
        let fieldLine = `${indent(level + 1)}${accessMod}${staticMod}${finalMod} ${typeName} ${f.name}`;
        if (parsed.init) {
            fieldLine += ` = ${parsed.init}`;
            imports.trackType(parsed.init);
        }
        fieldLine += ";";
        lines.push(fieldLine);
    }

    // Constructors (auto-generate if final fields exist but no constructors provided)
    // Strip type parameters from name for constructor (GenericStack<T> -> GenericStack)
    const ctorName = node.name.replace(/<.*>$/, "");
    const uninitFields = node.fields.filter(f => !parseFieldTag(f.tag).init);
    if (node.constructors.length === 0 && node.fields.length > 0 && hasFinalFields) {
        // Auto-generate all-args constructor
        if (uninitFields.length > 0) {
            lines.push("");
            const ctorParams = uninitFields.map(f => `${mapType(f.type)} ${f.name}`).join(", ");
            lines.push(`${indent(level + 1)}public ${ctorName}(${ctorParams}) {`);
            for (const f of uninitFields) {
                lines.push(`${indent(level + 2)}this.${f.name} = ${f.name};`);
            }
            lines.push(`${indent(level + 1)}}`);
        }
    } else {
        // Emit explicit constructors AND auto-generate all-args constructor if needed
        // Check if any existing constructor uses this(args) delegation — need the target
        const needsAllArgsCtor = hasFinalFields && uninitFields.length > 0 &&
            node.constructors.some(c => {
                // Check if constructor body contains this(...) call
                return c.body.stmts.some(s =>
                    s.kind === "ExprStmt" && (s as any).expr?.kind === "CallExpr" &&
                    (s as any).expr?.func?.name === "this"
                );
            }) &&
            !node.constructors.some(c => c.params.length === uninitFields.length);

        if (needsAllArgsCtor) {
            lines.push("");
            const ctorParams = uninitFields.map(f => `${mapType(f.type)} ${f.name}`).join(", ");
            lines.push(`${indent(level + 1)}public ${ctorName}(${ctorParams}) {`);
            for (const f of uninitFields) {
                lines.push(`${indent(level + 2)}this.${f.name} = ${f.name};`);
            }
            lines.push(`${indent(level + 1)}}`);
        }

        for (const ctor of node.constructors) {
            lines.push("");
            lines.push(emitConstructor(ctorName, ctor, level + 1));
        }
    }

    // Methods
    for (const m of node.methods) {
        lines.push("");
        lines.push(emitInstanceMethod(m, level + 1));
    }

    // Inner classes
    for (const inner of node.innerClasses) {
        lines.push("");
        lines.push(emitJavaClassDecl(inner, level + 1));
    }

    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

function emitConstructor(className: string, node: IR.IRFuncDecl, level: number): string {
    const params = node.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");
    const lines: string[] = [];
    lines.push(`${indent(level)}public ${className}(${params}) {`);
    lines.push(emitBlockBody(node.body, level + 1));
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

function emitJavaTryCatch(node: IR.Java_TryCatch, level: number): string {
    const lines: string[] = [];

    // try-with-resources
    if (node.resources && node.resources.length > 0) {
        const resources = node.resources.map(r => emitNode(r, 0).trim().replace(/;$/, "")).join("; ");
        lines.push(`${indent(level)}try (${resources}) {`);
    } else {
        lines.push(`${indent(level)}try {`);
    }
    lines.push(emitBlockBody(node.body, level + 1));
    lines.push(`${indent(level)}}`);

    for (const c of node.catches) {
        lines.push(` catch (${mapType(c.exceptionType)} ${c.name}) {`);
        lines.push(emitBlockBody(c.body, level + 1));
        lines.push(`${indent(level)}}`);
    }

    if (node.finallyBody) {
        lines.push(` finally {`);
        lines.push(emitBlockBody(node.finallyBody, level + 1));
        lines.push(`${indent(level)}}`);
    }

    // Join catch/finally onto the closing brace of the previous block
    let result = lines[0];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith(" catch") || line.startsWith(" finally")) {
            result = result.trimEnd() + line;
        } else {
            result += "\n" + line;
        }
    }
    return result;
}

function emitJavaEnhancedFor(node: IR.Java_EnhancedFor, level: number): string {
    const varType = node.varType ? mapType(node.varType) : "var";
    let s = `${indent(level)}for (${varType} ${node.varName} : ${emitExpr(node.iterable)}) {\n`;
    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    return s;
}

function emitJavaThrowStmt(node: IR.Java_ThrowStmt, level: number): string {
    return `${indent(level)}throw ${emitExpr(node.expr)};`;
}

// ─── AET-Java v1 node emission ────────────────────────────────────────────────

function emitRecordDecl(node: IR.Java_RecordDecl, level: number): string {
    const lines: string[] = [];
    const typeParams = node.typeParams.length > 0 ? `<${node.typeParams.join(", ")}>` : "";
    const components = node.components.map(c => `${mapType(c.type)} ${c.name}`).join(", ");
    // Track component types for imports
    for (const c of node.components) {
        imports.trackType(mapType(c.type));
    }
    // Records are implicitly static when nested; just ensure public visibility
    let header = `${indent(level)}public record ${node.name}${typeParams}(${components})`;
    if (node.interfaces.length > 0) {
        header += ` implements ${node.interfaces.join(", ")}`;
    }
    header += " {";
    lines.push(header);

    // Explicit methods (e.g., custom toString, computed getters)
    for (const m of node.methods) {
        lines.push("");
        lines.push(emitInstanceMethod(m, level + 1));
    }

    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

function emitEnumDecl(node: IR.Java_EnumDecl, level: number): string {
    const lines: string[] = [];
    let header = `${indent(level)}public enum ${node.name}`;
    if (node.interfaces.length > 0) {
        header += ` implements ${node.interfaces.join(", ")}`;
    }
    header += " {";
    lines.push(header);

    // Enum values
    const valueStrs: string[] = [];
    for (const v of node.values) {
        if (v.args.length > 0) {
            const args = v.args.map(emitExpr).join(", ");
            valueStrs.push(`${indent(level + 1)}${v.name}(${args})`);
        } else {
            valueStrs.push(`${indent(level + 1)}${v.name}`);
        }
    }
    if (valueStrs.length > 0) {
        lines.push(valueStrs.join(",\n") + ";");
    }

    // Fields
    for (const f of node.fields) {
        lines.push("");
        lines.push(`${indent(level + 1)}private final ${mapType(f.type)} ${f.name};`);
    }

    // Constructors
    for (const ctor of node.constructors) {
        lines.push("");
        lines.push(emitConstructor(node.name, ctor, level + 1));
    }

    // Methods
    for (const m of node.methods) {
        lines.push("");
        lines.push(emitInstanceMethod(m, level + 1));
    }

    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

function emitSealedInterfaceDecl(node: IR.Java_SealedInterfaceDecl, level: number): string {
    const lines: string[] = [];
    const typeParams = node.typeParams.length > 0 ? `<${node.typeParams.join(", ")}>` : "";
    // Sealed interfaces are implicitly static when nested
    let header = `${indent(level)}public sealed interface ${node.name}${typeParams}`;
    if (node.permits.length > 0) {
        header += ` permits ${node.permits.join(", ")}`;
    }
    header += " {";
    lines.push(header);

    for (const m of node.methods) {
        const returnType = emitReturnType(m.results);
        const params = m.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");
        lines.push(`${indent(level + 1)}${returnType} ${m.name}(${params});`);
    }

    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}

function emitSwitchExpr(expr: IR.Java_SwitchExpr): string {
    const lines: string[] = [];
    lines.push(`switch (${emitExpr(expr.tag)}) {`);

    for (const c of expr.cases) {
        if (c.values) {
            _inSwitchCaseLabel = true;
            const vals = c.values.map(emitExpr).join(", ");
            _inSwitchCaseLabel = false;
            if ("kind" in c.body && c.body.kind === "BlockStmt") {
                lines.push(`    case ${vals} -> {`);
                const block = c.body as IR.IRBlockStmt;
                for (const stmt of block.stmts) {
                    lines.push("    " + emitNode(stmt, 2));
                }
                lines.push(`    }`);
            } else {
                lines.push(`    case ${vals} -> ${emitExpr(c.body as IR.IRExpr)};`);
            }
        } else {
            if ("kind" in c.body && c.body.kind === "BlockStmt") {
                lines.push(`    default -> {`);
                const block = c.body as IR.IRBlockStmt;
                for (const stmt of block.stmts) {
                    lines.push("    " + emitNode(stmt, 2));
                }
                lines.push(`    }`);
            } else {
                lines.push(`    default -> ${emitExpr(c.body as IR.IRExpr)};`);
            }
        }
    }

    lines.push(`}`);
    return lines.join("\n");
}

// ─── Expression emission ───────────────────────────────────────────────────────

// Emit condition expression, stripping outer parens to avoid double-wrapping
function emitCondExpr(expr: IR.IRExpr): string {
    if (expr.kind === "ParenExpr") return emitExpr((expr as IR.IRParenExpr).x);
    return emitExpr(expr);
}

export function emitExpr(expr: IR.IRExpr): string {
    switch (expr.kind) {
        case "Ident":
            return emitIdent(expr);
        case "BasicLit":
            return emitBasicLit(expr);
        case "CompositeLit":
            return emitCompositeLit(expr);
        case "FuncLit":
            return emitFuncLit(expr);
        case "BinaryExpr":
            return emitBinaryExpr(expr);
        case "UnaryExpr":
            return emitUnaryExpr(expr);
        case "CallExpr":
            return emitCallExpr(expr);
        case "SelectorExpr": {
            // Reverse keyword method renames from Java→AET conversion
            const KEYWORD_UNRENAMES: Record<string, string> = Object.create(null);
            KEYWORD_UNRENAMES["apd"] = "append";
            KEYWORD_UNRENAMES["del"] = "delete";
            KEYWORD_UNRENAMES["cpy_"] = "copy";
            KEYWORD_UNRENAMES["nw_"] = "new";
            KEYWORD_UNRENAMES["mk_"] = "make";
            KEYWORD_UNRENAMES["flt_"] = "filter";
            KEYWORD_UNRENAMES["rng_"] = "range";
            const sel = KEYWORD_UNRENAMES[expr.sel] ?? expr.sel;
            // String .length field → .length() method call
            if (sel === "length" && expr.x.kind === "Ident" && stringVarNames.has((expr.x as IR.IRIdent).name)) {
                return `${emitExpr(expr.x)}.length()`;
            }
            return `${emitExpr(expr.x)}.${sel}`;
        }
        case "IndexExpr":
            return `${emitExpr(expr.x)}[${emitExpr(expr.index)}]`;
        case "SliceExpr":
            return emitSliceExpr(expr);
        case "TypeAssertExpr":
            return emitTypeAssertExpr(expr);
        case "StarExpr":
            // Java uses reference semantics — strip pointer dereference
            return emitExpr(expr.x);
        case "UnaryRecvExpr":
            throw new Error("Go-specific construct UnaryRecvExpr (channel receive) not supported for Java target");
        case "KeyValueExpr":
            return `${emitExpr(expr.key)}, ${emitExpr(expr.value)}`;
        case "ParenExpr":
            return `(${emitExpr(expr.x)})`;
        case "ErrorPropExpr":
            // When reached as a bare expression (not in short-decl), just emit inner
            return emitExpr(expr.x);
        case "PipeExpr":
            return emitPipeExpr(expr);
        case "MapTypeExpr":
            return emitMapTypeExpr(expr);
        case "ArrayTypeExpr":
            return emitArrayTypeExpr(expr);
        case "ChanTypeExpr":
            throw new Error("Go-specific construct ChanTypeExpr (channels) not supported for Java target");
        case "FuncTypeExpr":
            return emitFuncTypeExpr(expr);
        case "InterfaceTypeExpr":
            return "Object";
        case "StructTypeExpr":
            return "Object";
        case "RawGoExpr":
            return `/* raw Go: ${expr.code} */`;

        // Java-specific expressions
        case "Java_NewExpr":
            return emitJavaNewExpr(expr);
        case "Java_LambdaExpr":
            return emitJavaLambdaExpr(expr);
        case "Java_InstanceofExpr":
            return emitJavaInstanceofExpr(expr);
        case "Java_CastExpr":
            return emitJavaCastExpr(expr);
        case "Java_TernaryExpr":
            return emitJavaTernaryExpr(expr);

        // AET-Java v1 expressions
        case "Java_SwitchExpr":
            return emitSwitchExpr(expr as IR.Java_SwitchExpr);

        default:
            return `/* unknown expr: ${(expr as any).kind} */`;
    }
}

function emitIdent(expr: IR.IRIdent): string {
    // Map Go identifiers to Java equivalents
    switch (expr.name) {
        case "nil":   return "null";
        case "true":  return "true";
        case "false": return "false";
        case "iota":  return "/* iota */";
        default: {
            // Re-qualify bare enum values: PLUS → TokenType.PLUS
            // But NOT inside switch case labels (Java requires unqualified names there)
            if (!_inSwitchCaseLabel) {
                const enumType = enumValueToType.get(expr.name);
                if (enumType) return `${enumType}.${expr.name}`;
            }
            return expr.name;
        }
    }
}

function emitBasicLit(expr: IR.IRBasicLit): string {
    switch (expr.type) {
        case "STRING":
            return expr.value;
        case "CHAR":
        case "RUNE":
            // Go runes map to Java char literals
            return expr.value;
        case "INT":
            return expr.value;
        case "FLOAT":
            return expr.value;
        default:
            return expr.value;
    }
}

function emitCompositeLit(expr: IR.IRCompositeLit): string {
    if (!expr.type) {
        // No type — emit as array initializer
        const elts = expr.elts.map(emitExpr).join(", ");
        return `{${elts}}`;
    }

    const typeExpr = expr.type;

    // Map literal
    if (typeExpr.kind === "MapTypeExpr") {
        imports.add("java.util.Map");
        if (expr.elts.length === 0) {
            imports.add("java.util.HashMap");
            return `new HashMap<>()`;
        }
        // Use Map.of for small literals
        const pairs = expr.elts.map(emitExpr).join(", ");
        return `Map.of(${pairs})`;
    }

    // Array/slice literal
    if (typeExpr.kind === "ArrayTypeExpr") {
        let eltType = mapIRTypeToJava(emitExpr(typeExpr.elt));
        const elts = expr.elts.map(emitExpr).join(", ");
        // If element type is Object (from _in), try to infer from actual elements
        if (eltType === "Object" && expr.elts.length > 0) {
            const inferred = inferTypeFromExpr(expr.elts[0]);
            if (inferred !== "Object") {
                eltType = inferred;
            }
        }
        if (eltType === "Object") {
            return `{${elts}}`;
        }
        // Handle nested array types (e.g., []int → int[])
        // eltType might be "[]int" which needs to become "int[]"
        let extraDims = "";
        while (eltType.startsWith("[]")) {
            eltType = eltType.substring(2);
            extraDims += "[]";
        }
        eltType = mapIRTypeToJava(eltType);
        return `new ${eltType}${extraDims}[]{${elts}}`;
    }

    // Struct literal → new Constructor(args)
    if (typeExpr.kind === "Ident") {
        const args = expr.elts.map(e => {
            if (e.kind === "KeyValueExpr") {
                return emitExpr(e.value);
            }
            return emitExpr(e);
        }).join(", ");
        return `new ${typeExpr.name}(${args})`;
    }

    // Fallback
    const elts = expr.elts.map(emitExpr).join(", ");
    return `new ${emitExpr(typeExpr)}[]{${elts}}`;
}

function emitFuncLit(expr: IR.IRFuncLit): string {
    const params = expr.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");

    // Single-statement body can be simplified
    if (expr.body.stmts.length === 1) {
        const stmt = expr.body.stmts[0];
        if (stmt.kind === "ReturnStmt" && (stmt as IR.IRReturnStmt).values.length === 1) {
            const val = emitExpr((stmt as IR.IRReturnStmt).values[0]);
            return `(${params}) -> ${val}`;
        }
        if (stmt.kind === "ExprStmt") {
            return `(${params}) -> ${emitExpr((stmt as IR.IRExprStmt).expr)}`;
        }
    }

    const body = emitBlockBody(expr.body, 2);
    return `(${params}) -> {\n${body}    }`;
}

function emitBinaryExpr(expr: IR.IRBinaryExpr): string {
    return `${emitExpr(expr.left)} ${expr.op} ${emitExpr(expr.right)}`;
}

function emitUnaryExpr(expr: IR.IRUnaryExpr): string {
    if (expr.op === "&") {
        // Address-of operator has no Java equivalent; just emit the operand
        return emitExpr(expr.x);
    }
    if (expr.op === "^") {
        // Go bitwise NOT → Java ~
        return `~${emitExpr(expr.x)}`;
    }
    return `${expr.op}${emitExpr(expr.x)}`;
}

function emitCallExpr(expr: IR.IRCallExpr): string {
    const args = expr.args.map(emitExpr).join(", ");

    // Preserve "nil" as a method name when used as a function call (not standalone keyword)
    if (expr.func.kind === "Ident" && expr.func.name === "nil") {
        return `nil(${args})`;
    }

    // Check if the function is a stdlib alias
    if (expr.func.kind === "Ident") {
        const alias = STDLIB_ALIASES[expr.func.name];
        if (alias) {
            if (alias.import) {
                imports.add(alias.import);
            }
            if (alias.isConstructor) {
                return `${alias.java}(${args})`;
            }
            return `${alias.java}(${args})`;
        }
    }

    // Go built-in functions → Java equivalents (accept both v3 and legacy names)
    if (expr.func.kind === "Ident") {
        switch (expr.func.name) {
            case "_t":
                // Ternary: _t(cond, ifTrue, ifFalse) → cond ? ifTrue : ifFalse
                if (expr.args.length === 3) {
                    return `${emitExpr(expr.args[0])} ? ${emitExpr(expr.args[1])} : ${emitExpr(expr.args[2])}`;
                }
                break;
            case "ln": case "len":
                return emitLenCall(expr.args);
            case "cp": case "cap":
                return emitCapCall(expr.args);
            case "apl": case "append": {
                if (expr.args.length >= 2) {
                    const slice = emitExpr(expr.args[0]);
                    const newElts = expr.args.slice(1).map(emitExpr).join(", ");
                    return `/* append */ ${slice} /* + ${newElts} */`;
                }
                return `/* append */`;
            }
            case "mk": case "make":
                return emitMakeCall(expr.args);
            case "nw": case "new": {
                if (expr.args.length === 1) {
                    const typeArg = emitExpr(expr.args[0]);
                    return `new ${typeArg}()`;
                }
                break;
            }
            case "dx": case "delete": {
                if (expr.args.length === 2) {
                    return `${emitExpr(expr.args[0])}.remove(${emitExpr(expr.args[1])})`;
                }
                break;
            }
            case "close":
                return `${emitExpr(expr.args[0])}.close()`;
            case "panic":
                return `throw new RuntimeException(${args})`;
            case "println":
                return `System.out.println(${args})`;
            case "print":
                return `System.out.print(${args})`;
            case "string":
                if (expr.args.length === 1) {
                    return `String.valueOf(${args})`;
                }
                break;
            case "int":
                if (expr.args.length === 1) {
                    return `(int) ${emitExpr(expr.args[0])}`;
                }
                break;
            case "int64":
                if (expr.args.length === 1) {
                    return `(long) ${emitExpr(expr.args[0])}`;
                }
                break;
            case "float64":
                if (expr.args.length === 1) {
                    return `(double) ${emitExpr(expr.args[0])}`;
                }
                break;
            case "float32":
                if (expr.args.length === 1) {
                    return `(float) ${emitExpr(expr.args[0])}`;
                }
                break;
            case "byte":
                if (expr.args.length === 1) {
                    return `(byte) ${emitExpr(expr.args[0])}`;
                }
                break;
            case "rune":
                if (expr.args.length === 1) {
                    return `(char) ${emitExpr(expr.args[0])}`;
                }
                break;
        }
    }

    // fmt.Sprintf → String.format
    if (expr.func.kind === "SelectorExpr") {
        const sel = expr.func as IR.IRSelectorExpr;
        if (sel.x.kind === "Ident") {
            const pkg = (sel.x as IR.IRIdent).name;
            const method = sel.sel;
            const mapped = mapStdlibCall(pkg, method, expr.args);
            if (mapped) return mapped;
        }
    }

    const funcStr = emitExpr(expr.func);

    // If calling an uppercase name that matches a known generic class, emit as new ClassName<>(args)
    if (expr.func.kind === "Ident") {
        const name = (expr.func as IR.IRIdent).name;
        if (/^[A-Z]/.test(name) && genericClassNames.has(name)) {
            return `new ${name}<>(${args})`;
        }
        // Even for non-tracked classes, uppercase first letter suggests constructor
        // (already handled by Java conventions, but don't double-new)
    }

    return `${funcStr}(${args})`;
}

function emitLenCall(args: IR.IRExpr[]): string {
    if (args.length !== 1) return `/* len() */`;
    const argExpr = args[0];
    const arg = emitExpr(argExpr);
    // Strings use .length() method; arrays use .length field; collections use .size()
    // Check if the argument is a known string variable
    if (argExpr.kind === "Ident" && stringVarNames.has((argExpr as IR.IRIdent).name)) {
        return `${arg}.length()`;
    }
    // Default: use .length (works for arrays, which are the most common case)
    return `${arg}.length`;
}

function emitCapCall(args: IR.IRExpr[]): string {
    if (args.length !== 1) return `/* cap() */`;
    const arg = emitExpr(args[0]);
    return `${arg}.length`;
}

function emitMakeCall(args: IR.IRExpr[]): string {
    if (args.length === 0) return `/* make() */`;
    const typeArg = args[0];

    if (typeArg.kind === "MapTypeExpr") {
        imports.add("java.util.HashMap");
        const k = emitExpr(typeArg.key);
        const v = emitExpr(typeArg.value);
        return `new HashMap<${boxType(k)}, ${boxType(v)}>()`;
    }

    if (typeArg.kind === "ArrayTypeExpr") {
        let elt = emitExpr(typeArg.elt);
        // Handle nested array types: mk([][]int, n, m) → new int[n][m]
        // The elt might be "[]int" (flat string) or "int[]" (Java format)
        let extraDims = 0;
        while (elt.startsWith("[]")) {
            elt = elt.substring(2);
            extraDims++;
        }
        let javaElt = mapIRTypeToJava(elt);
        while (javaElt.endsWith("[]")) {
            javaElt = javaElt.slice(0, -2);
            extraDims++;
        }

        // If size is 0 and element is Object/_in (from diamond ArrayList<>()), emit new ArrayList<>()
        const sizeArg = args.length > 1 ? args[1] : null;
        const isZeroSize = sizeArg && sizeArg.kind === "BasicLit" && (sizeArg as IR.IRBasicLit).value === "0";

        if ((isZeroSize || args.length === 1) && (javaElt === "Object") && extraDims === 0) {
            imports.add("java.util.ArrayList");
            return `new ArrayList<>()`;
        }

        // Build dimensions: first dim uses args[1], subsequent dims use args[2], args[3]...
        let dimStr = "";
        for (let d = 0; d <= extraDims; d++) {
            const sizeIdx = d + 1;
            if (sizeIdx < args.length) {
                dimStr += `[${emitExpr(args[sizeIdx])}]`;
            } else {
                dimStr += "[]";
            }
        }
        return `new ${javaElt}${dimStr}`;
    }

    if (typeArg.kind === "ChanTypeExpr") {
        throw new Error("Go-specific construct ChanTypeExpr (channels) not supported for Java target");
    }

    return `new ${emitExpr(typeArg)}()`;
}

function mapStdlibCall(pkg: string, method: string, args: IR.IRExpr[]): string | null {
    const argStr = args.map(emitExpr).join(", ");

    switch (pkg) {
        case "fmt":
            switch (method) {
                case "Println":   return `System.out.println(${argStr})`;
                case "Printf":    return `System.out.printf(${argStr})`;
                case "Print":     return `System.out.print(${argStr})`;
                case "Sprintf":   return `String.format(${argStr})`;
                case "Fprintf": {
                    if (args.length >= 2) {
                        const writer = emitExpr(args[0]);
                        const rest = args.slice(1).map(emitExpr).join(", ");
                        return `${writer}.write(String.format(${rest}))`;
                    }
                    return `System.out.printf(${argStr})`;
                }
                case "Errorf":
                    return `new RuntimeException(String.format(${argStr}))`;
            }
            break;

        case "strings":
            switch (method) {
                case "Contains":
                    return args.length === 2 ? `${emitExpr(args[0])}.contains(${emitExpr(args[1])})` : null;
                case "HasPrefix":
                    return args.length === 2 ? `${emitExpr(args[0])}.startsWith(${emitExpr(args[1])})` : null;
                case "HasSuffix":
                    return args.length === 2 ? `${emitExpr(args[0])}.endsWith(${emitExpr(args[1])})` : null;
                case "Split":
                    return args.length === 2 ? `${emitExpr(args[0])}.split(${emitExpr(args[1])})` : null;
                case "Join": {
                    imports.add("java.util.Arrays");
                    return args.length === 2 ? `String.join(${emitExpr(args[1])}, ${emitExpr(args[0])})` : null;
                }
                case "Replace":
                    return args.length >= 3 ? `${emitExpr(args[0])}.replace(${emitExpr(args[1])}, ${emitExpr(args[2])})` : null;
                case "ToLower":
                    return args.length === 1 ? `${emitExpr(args[0])}.toLowerCase()` : null;
                case "ToUpper":
                    return args.length === 1 ? `${emitExpr(args[0])}.toUpperCase()` : null;
                case "TrimSpace":
                    return args.length === 1 ? `${emitExpr(args[0])}.trim()` : null;
                case "Repeat":
                    return args.length === 2 ? `${emitExpr(args[0])}.repeat(${emitExpr(args[1])})` : null;
                case "Index":
                    return args.length === 2 ? `${emitExpr(args[0])}.indexOf(${emitExpr(args[1])})` : null;
            }
            break;

        case "strconv":
            switch (method) {
                case "Itoa":
                    return args.length === 1 ? `String.valueOf(${emitExpr(args[0])})` : null;
                case "Atoi":
                    return args.length === 1 ? `Integer.parseInt(${emitExpr(args[0])})` : null;
                case "FormatBool":
                    return args.length === 1 ? `String.valueOf(${emitExpr(args[0])})` : null;
                case "ParseBool":
                    return args.length === 1 ? `Boolean.parseBoolean(${emitExpr(args[0])})` : null;
                case "FormatFloat":
                    return args.length >= 1 ? `String.valueOf(${emitExpr(args[0])})` : null;
                case "ParseFloat":
                    return args.length >= 1 ? `Double.parseDouble(${emitExpr(args[0])})` : null;
                case "ParseInt":
                    return args.length >= 1 ? `Long.parseLong(${emitExpr(args[0])})` : null;
            }
            break;

        case "math":
            switch (method) {
                case "Abs":   return `Math.abs(${argStr})`;
                case "Max":   return `Math.max(${argStr})`;
                case "Min":   return `Math.min(${argStr})`;
                case "Sqrt":  return `Math.sqrt(${argStr})`;
                case "Pow":   return `Math.pow(${argStr})`;
                case "Floor": return `Math.floor(${argStr})`;
                case "Ceil":  return `Math.ceil(${argStr})`;
                case "Round": return `Math.round(${argStr})`;
                case "Log":   return `Math.log(${argStr})`;
                case "Log10": return `Math.log10(${argStr})`;
                case "Sin":   return `Math.sin(${argStr})`;
                case "Cos":   return `Math.cos(${argStr})`;
            }
            break;

        case "os":
            switch (method) {
                case "Exit":
                    return `System.exit(${argStr})`;
                case "Getenv":
                    return `System.getenv(${argStr})`;
            }
            break;

        case "Arrays":
            imports.add("java.util.Arrays");
            return `Arrays.${method}(${argStr})`;

        case "Collections":
            imports.add("java.util.Collections");
            return `Collections.${method}(${argStr})`;

        case "Character":
            // Character methods are in java.lang, no import needed
            return `Character.${method}(${argStr})`;

        case "Integer":
            return `Integer.${method}(${argStr})`;

        case "Map":
            imports.add("java.util.Map");
            return `Map.${method}(${argStr})`;

        case "sort":
            switch (method) {
                case "Ints": {
                    imports.add("java.util.Arrays");
                    return `Arrays.sort(${argStr})`;
                }
                case "Strings": {
                    imports.add("java.util.Arrays");
                    return `Arrays.sort(${argStr})`;
                }
                case "Slice": {
                    imports.add("java.util.Arrays");
                    return `Arrays.sort(${argStr})`;
                }
            }
            break;
    }

    return null;
}

function emitSliceExpr(expr: IR.IRSliceExpr): string {
    const x = emitExpr(expr.x);
    if (expr.low && expr.high) {
        imports.add("java.util.Arrays");
        return `Arrays.copyOfRange(${x}, ${emitExpr(expr.low)}, ${emitExpr(expr.high)})`;
    }
    if (expr.low) {
        imports.add("java.util.Arrays");
        return `Arrays.copyOfRange(${x}, ${emitExpr(expr.low)}, ${x}.length)`;
    }
    if (expr.high) {
        imports.add("java.util.Arrays");
        return `Arrays.copyOfRange(${x}, 0, ${emitExpr(expr.high)})`;
    }
    return x;
}

function emitTypeAssertExpr(expr: IR.IRTypeAssertExpr): string {
    return `(${mapType(expr.type)}) ${emitExpr(expr.x)}`;
}

function emitPipeExpr(expr: IR.IRPipeExpr): string {
    imports.add("java.util.stream.Collectors");
    const collection = emitExpr(expr.x);
    const fn = emitExpr(expr.fn);
    switch (expr.op) {
        case "map":
            return `${collection}.stream().map(${fn}).collect(Collectors.toList())`;
        case "filter":
            return `${collection}.stream().filter(${fn}).collect(Collectors.toList())`;
        case "reduce": {
            const init = expr.init ? emitExpr(expr.init) + ", " : "";
            return `${collection}.stream().reduce(${init}${fn})`;
        }
        default:
            return `/* pipe: ${expr.op} */`;
    }
}

function emitMapTypeExpr(expr: IR.IRMapTypeExpr): string {
    imports.add("java.util.HashMap");
    const k = emitExpr(expr.key);
    const v = emitExpr(expr.value);
    return `HashMap<${boxType(k)}, ${boxType(v)}>`;
}

function emitArrayTypeExpr(expr: IR.IRArrayTypeExpr): string {
    const elt = emitExpr(expr.elt);
    return `${mapIRTypeToJava(elt)}[]`;
}

function emitFuncTypeExpr(expr: IR.IRFuncTypeExpr): string {
    // Map to Java functional interface names
    if (expr.results.length === 0) {
        if (expr.params.length === 0) {
            return "Runnable";
        }
        if (expr.params.length === 1) {
            imports.add("java.util.function.Consumer");
            return `Consumer<${boxType(mapType(expr.params[0].type))}>`;
        }
        if (expr.params.length === 2) {
            imports.add("java.util.function.BiConsumer");
            return `BiConsumer<${boxType(mapType(expr.params[0].type))}, ${boxType(mapType(expr.params[1].type))}>`;
        }
    }
    if (expr.results.length === 1) {
        if (expr.params.length === 0) {
            imports.add("java.util.function.Supplier");
            return `Supplier<${boxType(mapType(expr.results[0]))}>`;
        }
        if (expr.params.length === 1) {
            imports.add("java.util.function.Function");
            return `Function<${boxType(mapType(expr.params[0].type))}, ${boxType(mapType(expr.results[0]))}>`;
        }
        if (expr.params.length === 2) {
            imports.add("java.util.function.BiFunction");
            return `BiFunction<${boxType(mapType(expr.params[0].type))}, ${boxType(mapType(expr.params[1].type))}, ${boxType(mapType(expr.results[0]))}>`;
        }
    }
    // Fallback for complex signatures
    const params = expr.params.map(p => mapType(p.type)).join(", ");
    const ret = expr.results.length > 0 ? mapType(expr.results[0]) : "void";
    return `/* func(${params}) ${ret} */`;
}

// ─── Java-specific expression emission ─────────────────────────────────────────

function emitJavaNewExpr(expr: IR.Java_NewExpr): string {
    const typeName = mapType(expr.type);
    // Handle array creation: new int[](5) → new int[5], new int[][](5,3) → new int[5][3]
    if (typeName.endsWith("[]") && expr.args.length >= 1) {
        // Count trailing [] brackets
        let baseType = typeName;
        let dimCount = 0;
        while (baseType.endsWith("[]")) {
            baseType = baseType.slice(0, -2);
            dimCount++;
        }
        // Build dimension brackets with sizes
        let result = `new ${baseType}`;
        for (let d = 0; d < dimCount; d++) {
            if (d < expr.args.length) {
                result += `[${emitExpr(expr.args[d])}]`;
            } else {
                result += `[]`;
            }
        }
        return result;
    }
    const args = expr.args.map(emitExpr).join(", ");
    // Add diamond <> for generic class constructors if not already present
    const GENERIC_STDLIB_TYPES = new Set([
        "ArrayList", "LinkedList", "HashMap", "LinkedHashMap", "TreeMap",
        "HashSet", "LinkedHashSet", "TreeSet", "ArrayDeque", "PriorityQueue",
        "ConcurrentHashMap", "CopyOnWriteArrayList",
    ]);
    if (!typeName.includes("<") && (genericClassNames.has(typeName) || GENERIC_STDLIB_TYPES.has(typeName))) {
        return `new ${typeName}<>(${args})`;
    }
    return `new ${typeName}(${args})`;
}

function emitJavaLambdaExpr(expr: IR.Java_LambdaExpr): string {
    const params = expr.params.map(p => {
        if (p.type && p.type.name) {
            return `${mapType(p.type)} ${p.name}`;
        }
        return p.name;
    }).join(", ");

    if ("kind" in expr.body && expr.body.kind === "BlockStmt") {
        const body = emitBlockBody(expr.body as IR.IRBlockStmt, 2);
        return `(${params}) -> {\n${body}    }`;
    }
    // Single expression body
    return `(${params}) -> ${emitExpr(expr.body as IR.IRExpr)}`;
}

function emitJavaInstanceofExpr(expr: IR.Java_InstanceofExpr): string {
    const typeName = mapType(expr.type);
    if (expr.binding) {
        return `${emitExpr(expr.expr)} instanceof ${typeName} ${expr.binding}`;
    }
    return `${emitExpr(expr.expr)} instanceof ${typeName}`;
}

function emitJavaCastExpr(expr: IR.Java_CastExpr): string {
    return `(${mapType(expr.type)}) ${emitExpr(expr.expr)}`;
}

function emitJavaTernaryExpr(expr: IR.Java_TernaryExpr): string {
    return `${emitExpr(expr.cond)} ? ${emitExpr(expr.ifTrue)} : ${emitExpr(expr.ifFalse)}`;
}

// ─── Type mapping ──────────────────────────────────────────────────────────────

function mapType(irType: IR.IRType): string {
    const name = irType.name;

    // Channel type — not supported
    if (irType.isChan) {
        throw new Error("Go-specific construct chan not supported for Java target");
    }

    // Pointer — strip, Java uses reference semantics
    if (irType.isPointer && irType.elementType) {
        return mapType(irType.elementType);
    }

    // Map type
    if (irType.isMap && irType.keyType && irType.valueType) {
        imports.add("java.util.Map");
        const k = mapType(irType.keyType);
        const v = mapType(irType.valueType);
        return `Map<${boxType(k)}, ${boxType(v)}>`;
    }

    // Slice/array type
    if (irType.isSlice && irType.elementType) {
        return `${mapType(irType.elementType)}[]`;
    }

    // Primitive and common type mapping by name
    switch (name) {
        case "int":         return "int";
        case "int8":        return "byte";
        case "int16":       return "short";
        case "int32":       return "int";
        case "int64":       return "long";
        case "uint":        return "int";
        case "uint8":       return "byte";
        case "uint16":      return "short";
        case "uint32":      return "int";
        case "uint64":      return "long";
        case "float32":     return "float";
        case "float64":     return "double";
        case "string":      return "String";
        case "bool":        return "boolean";
        case "byte":        return "byte";
        case "rune":        return "char";
        case "error":       return "Exception";
        case "interface{}": return "Object";
        case "_in":         return "Object";
        case "any":         return "Object";
        case "void":        return "void";
    }

    // Pointer prefix in name
    if (name.startsWith("*")) {
        return mapType({ name: name.substring(1) });
    }

    // Slice prefix in name
    if (name.startsWith("[]")) {
        const elt = name.substring(2);
        return `${mapType({ name: elt })}[]`;
    }

    // Map prefix in name: map[K]V or mp[K]V
    const mapMatch = name.match(/^(?:map|mp)\[(.+?)\](.+)$/);
    if (mapMatch) {
        imports.add("java.util.Map");
        const k = mapType({ name: mapMatch[1] });
        const v = mapType({ name: mapMatch[2] });
        return `Map<${boxType(k)}, ${boxType(v)}>`;
    }

    // Chan prefix
    if (name.startsWith("chan ") || name.startsWith("chan<-") || name.startsWith("<-chan")) {
        throw new Error("Go-specific construct chan not supported for Java target");
    }

    // Parameterized type name: HashMap<string, _in> → HashMap<String, Object>
    const genMatch = name.match(/^(\w+)<(.+)>$/);
    if (genMatch) {
        const baseName = genMatch[1];
        const rawArgs = splitTypeArgs(genMatch[2]);
        const mappedArgs = rawArgs.map(a => boxType(mapType({ name: a.trim() })));
        imports.trackType(baseName);
        return `${baseName}<${mappedArgs.join(", ")}>`;
    }

    // User-defined or unrecognized type: pass through as-is
    // Track imports for collection/util types
    imports.trackType(name);
    return name;
}

/** Split comma-separated type args respecting nested <> brackets. */
function splitTypeArgs(s: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of s) {
        if (ch === '<') { depth++; current += ch; }
        else if (ch === '>') { depth--; current += ch; }
        else if (ch === ',' && depth === 0) { result.push(current); current = ""; }
        else { current += ch; }
    }
    if (current) result.push(current);
    return result;
}

function emitReturnType(results: IR.IRType[]): string {
    if (results.length === 0) return "void";
    if (results.length === 1) return mapType(results[0]);
    // Multiple returns not natively supported in Java; return the first type
    // (the transformer should ideally convert multi-returns before emission)
    return mapType(results[0]);
}

/** Convert primitive Java types to their boxed equivalents for use in generics. */
function boxType(javaType: string): string {
    switch (javaType) {
        case "int":     return "Integer";
        case "long":    return "Long";
        case "double":  return "Double";
        case "float":   return "Float";
        case "boolean": return "Boolean";
        case "byte":    return "Byte";
        case "short":   return "Short";
        case "char":    return "Character";
        default:        return javaType;
    }
}

function capitalize(s: string): string {
    if (s.length === 0) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function isPrimitiveType(t: string): boolean {
    return ["int", "long", "double", "float", "boolean", "byte", "short", "char"].includes(t);
}

/** Map IR type name to Java type name */
function mapIRTypeToJava(irType: string): string {
    switch (irType) {
        case "string": return "String";
        case "bool": return "boolean";
        case "int64": return "long";
        case "float64": return "double";
        case "float32": return "float";
        case "interface{}": return "Object";
        case "_in": return "Object";
        case "error": return "Exception";
        default: return irType;
    }
}
