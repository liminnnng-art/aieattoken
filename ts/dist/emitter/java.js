// Emitter: Converts IR to valid Java source code
// Default aliases — embedded so the emitter works without file I/O at runtime.
// Kept in sync with stdlib-aliases-java.json.
const STDLIB_ALIASES = {
    pl: { java: "System.out.println", pkg: "java.lang", auto: true },
    pr: { java: "System.out.print", pkg: "java.lang", auto: true },
    pf: { java: "System.out.printf", pkg: "java.lang", auto: true },
    sf: { java: "String.format", pkg: "java.lang", auto: true },
    Se: { java: "System.err.println", pkg: "java.lang", auto: true },
    Sx: { java: "System.exit", pkg: "java.lang", auto: true },
    Pi: { java: "Integer.parseInt", pkg: "java.lang", auto: true },
    Sv: { java: "String.valueOf", pkg: "java.lang", auto: true },
    Mx: { java: "Math.max", pkg: "java.lang", auto: true },
    Mn: { java: "Math.min", pkg: "java.lang", auto: true },
    Ma: { java: "Math.abs", pkg: "java.lang", auto: true },
    Mr: { java: "Math.random", pkg: "java.lang", auto: true },
    Cs: { java: "Collections.sort", pkg: "java.util.Collections", import: "java.util.Collections" },
    Al: { java: "Arrays.asList", pkg: "java.util.Arrays", import: "java.util.Arrays" },
    Ia: { java: "Arrays.sort", pkg: "java.util.Arrays", import: "java.util.Arrays" },
    Fr: { java: "Files.readString", pkg: "java.nio.file.Files", import: "java.nio.file.Files" },
    Fw: { java: "Files.writeString", pkg: "java.nio.file.Files", import: "java.nio.file.Files" },
    Fl: { java: "Files.readAllLines", pkg: "java.nio.file.Files", import: "java.nio.file.Files" },
    Po: { java: "Path.of", pkg: "java.nio.file.Path", import: "java.nio.file.Path" },
    Ls: { java: "List.of", pkg: "java.util.List", import: "java.util.List" },
    Ms: { java: "Map.of", pkg: "java.util.Map", import: "java.util.Map" },
    Ge: { java: "System.getenv", pkg: "java.lang", auto: true },
    Tn: { java: "System.nanoTime", pkg: "java.lang", auto: true },
    Tm: { java: "System.currentTimeMillis", pkg: "java.lang", auto: true },
    Tp: { java: "Thread.sleep", pkg: "java.lang", auto: true },
    Ps: { java: "Pattern.compile", pkg: "java.util.regex.Pattern", import: "java.util.regex.Pattern" },
    Sb: { java: "new StringBuilder", pkg: "java.lang", auto: true, isConstructor: true },
    Oe: { java: "Optional.empty", pkg: "java.util.Optional", import: "java.util.Optional" },
    Oo: { java: "Optional.of", pkg: "java.util.Optional", import: "java.util.Optional" },
    Hc: { java: "HttpClient.newHttpClient", pkg: "java.net.http.HttpClient", import: "java.net.http.HttpClient" },
};
// ─── Import tracker ────────────────────────────────────────────────────────────
class ImportTracker {
    imports = new Set();
    add(importPath) {
        // java.lang.* is auto-imported — never emit it
        if (importPath.startsWith("java.lang"))
            return;
        this.imports.add(importPath);
    }
    getImports() {
        return [...this.imports].sort();
    }
}
// ─── Module-level state reset per emit call ────────────────────────────────────
let imports;
// ─── Public entry point ────────────────────────────────────────────────────────
export function emit(program, options) {
    imports = new ImportTracker();
    const className = options?.className ?? "Main";
    const packageName = options?.packageName;
    // Check whether the program already contains Java_ClassDecl nodes
    const hasClassDecl = program.decls.some(d => d.kind === "Java_ClassDecl");
    // Emit declarations into body lines
    const bodyLines = [];
    if (hasClassDecl) {
        // Emit each declaration at the top level
        for (const decl of program.decls) {
            bodyLines.push("");
            bodyLines.push(emitNode(decl, 0));
        }
    }
    else {
        // Auto-wrap: group receiver methods by type, everything else goes into Main
        const receiverMethods = new Map();
        const structs = [];
        const interfaces = [];
        const mainClassDecls = [];
        for (const decl of program.decls) {
            if (decl.kind === "FuncDecl" && decl.receiver) {
                const fd = decl;
                const typeName = fd.receiver.type.name;
                if (!receiverMethods.has(typeName)) {
                    receiverMethods.set(typeName, []);
                }
                receiverMethods.get(typeName).push(fd);
            }
            else if (decl.kind === "StructDecl") {
                structs.push(decl);
            }
            else if (decl.kind === "InterfaceDecl") {
                interfaces.push(decl);
            }
            else {
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
    const header = [];
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
function indent(level) {
    return "    ".repeat(level);
}
// ─── Auto main class wrapper ───────────────────────────────────────────────────
function emitAutoMainClass(className, decls, level) {
    const lines = [];
    lines.push(`${indent(level)}public class ${className} {`);
    for (const decl of decls) {
        lines.push("");
        if (decl.kind === "FuncDecl") {
            lines.push(emitStaticMethod(decl, level + 1));
        }
        else if (decl.kind === "VarDecl") {
            lines.push(emitStaticField(decl, level + 1));
        }
        else if (decl.kind === "ConstDecl") {
            lines.push(emitStaticConst(decl, level + 1));
        }
        else {
            lines.push(emitNode(decl, level + 1));
        }
    }
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
function emitStaticMethod(node, level) {
    // main function gets special signature
    if (node.name === "main") {
        const lines = [];
        lines.push(`${indent(level)}public static void main(String[] args) {`);
        lines.push(emitBlockBody(node.body, level + 1));
        lines.push(`${indent(level)}}`);
        return lines.join("\n");
    }
    const returnType = emitReturnType(node.results);
    const params = node.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");
    const lines = [];
    lines.push(`${indent(level)}public static ${returnType} ${node.name}(${params}) {`);
    lines.push(emitBlockBody(node.body, level + 1));
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
function emitStaticField(node, level) {
    const type = node.type ? mapType(node.type) : "var";
    let s = `${indent(level)}static ${type} ${node.name}`;
    if (node.value)
        s += ` = ${emitExpr(node.value)}`;
    s += ";";
    return s;
}
function emitStaticConst(node, level) {
    const lines = [];
    for (const spec of node.specs) {
        const type = spec.type ? mapType(spec.type) : "var";
        let s = `${indent(level)}static final ${type} ${spec.name}`;
        if (spec.value)
            s += ` = ${emitExpr(spec.value)}`;
        s += ";";
        lines.push(s);
    }
    return lines.join("\n");
}
// ─── Struct → Java class ───────────────────────────────────────────────────────
function emitStructAsClass(node, methods, level) {
    const lines = [];
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
    }
    else {
        const fieldStrs = node.fields.map((f, i) => `"${i === 0 ? "" : ", "}${f.name}=" + ${f.name}`);
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
function emitOrphanReceiverClass(typeName, methods, level) {
    const lines = [];
    lines.push(`${indent(level)}public class ${typeName} {`);
    for (const m of methods) {
        lines.push("");
        lines.push(emitInstanceMethod(m, level + 1));
    }
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
function emitInstanceMethod(node, level) {
    const returnType = emitReturnType(node.results);
    const params = node.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");
    const lines = [];
    lines.push(`${indent(level)}public ${returnType} ${node.name}(${params}) {`);
    lines.push(emitBlockBody(node.body, level + 1));
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
// ─── Interface → Java interface ────────────────────────────────────────────────
function emitInterfaceDecl(node, level) {
    const lines = [];
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
function emitNode(node, level) {
    switch (node.kind) {
        case "FuncDecl": return emitFuncDecl(node, level);
        case "StructDecl": return emitStructAsClass(node, [], level);
        case "InterfaceDecl": return emitInterfaceDecl(node, level);
        case "TypeAlias": return emitTypeAlias(node, level);
        case "BlockStmt": return emitBlockStmt(node, level);
        case "IfStmt": return emitIfStmt(node, level);
        case "ForStmt": return emitForStmt(node, level);
        case "RangeStmt": return emitRangeStmt(node, level);
        case "SwitchStmt": return emitSwitchStmt(node, level);
        case "ReturnStmt": return emitReturnStmt(node, level);
        case "AssignStmt": return emitAssignStmt(node, level);
        case "ShortDeclStmt": return emitShortDeclStmt(node, level);
        case "ExprStmt": return `${indent(level)}${emitExpr(node.expr)};`;
        case "IncDecStmt": return `${indent(level)}${emitExpr(node.x)}${node.op};`;
        case "BranchStmt": return emitBranchStmt(node, level);
        case "VarDecl": return emitVarDecl(node, level);
        case "ConstDecl": return emitConstDecl(node, level);
        // Java-specific nodes
        case "Java_ClassDecl": return emitJavaClassDecl(node, level);
        case "Java_TryCatch": return emitJavaTryCatch(node, level);
        case "Java_EnhancedFor": return emitJavaEnhancedFor(node, level);
        case "Java_ThrowStmt": return emitJavaThrowStmt(node, level);
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
            return `${indent(level)}// unknown node: ${node.kind}`;
    }
}
function emitFuncDecl(node, level) {
    if (node.receiver) {
        return emitInstanceMethod(node, level);
    }
    return emitStaticMethod(node, level);
}
function emitTypeAlias(node, level) {
    // Java has no direct type alias; emit a comment
    return `${indent(level)}// type alias: ${node.name} = ${node.underlying.name}`;
}
function emitBlockStmt(node, level) {
    return `{\n${emitBlockBody(node, level + 1)}${indent(level)}}`;
}
function emitBlockBody(block, level) {
    return block.stmts.map(s => emitNode(s, level) + "\n").join("");
}
function emitIfStmt(node, level) {
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
            s += " else " + emitIfStmt(node.else_, 0).trimStart();
        }
        else if (node.else_.kind === "BlockStmt") {
            s += ` else {\n${emitBlockBody(node.else_, level + 1)}${indent(level)}}`;
        }
    }
    return s;
}
function emitForStmt(node, level) {
    let s = "";
    if (node.init && node.post) {
        // Classic for loop
        const init = emitNode(node.init, 0).trim().replace(/;$/, "");
        const cond = node.cond ? emitExpr(node.cond) : "";
        const post = emitNode(node.post, 0).trim().replace(/;$/, "");
        s += `${indent(level)}for (${init}; ${cond}; ${post}) {\n`;
    }
    else if (node.cond) {
        // While loop
        s += `${indent(level)}while (${emitExpr(node.cond)}) {\n`;
    }
    else {
        // Infinite loop
        s += `${indent(level)}while (true) {\n`;
    }
    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    return s;
}
function emitRangeStmt(node, level) {
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
    }
    else if (node.key && node.key !== "_") {
        // for key := range x  →  index-only iteration
        const collection = emitExpr(node.x);
        s += `${indent(level)}for (int ${node.key} = 0; ${node.key} < ${collection}.length; ${node.key}++) {\n`;
    }
    else {
        // for range x  →  just iterate
        s += `${indent(level)}for (var _item : ${emitExpr(node.x)}) {\n`;
    }
    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    return s;
}
function emitSwitchStmt(node, level) {
    let s = "";
    // Java does not have init statements in switch — emit as preceding statement
    if (node.init) {
        s += emitNode(node.init, level) + "\n";
    }
    if (node.tag) {
        s += `${indent(level)}switch (${emitExpr(node.tag)}) {\n`;
    }
    else {
        // Tagless switch → if/else chain
        return emitTaglessSwitch(node, level);
    }
    for (const c of node.cases) {
        if (c.values) {
            for (const v of c.values) {
                s += `${indent(level + 1)}case ${emitExpr(v)}:\n`;
            }
        }
        else {
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
        }
        else {
            s += `${indent(level + 2)}break;\n`;
        }
    }
    s += `${indent(level)}}`;
    return s;
}
function emitTaglessSwitch(node, level) {
    let s = "";
    let first = true;
    for (const c of node.cases) {
        if (c.values) {
            const cond = c.values.map(emitExpr).join(" || ");
            if (first) {
                s += `${indent(level)}if (${cond}) {\n`;
                first = false;
            }
            else {
                s += ` else if (${cond}) {\n`;
            }
        }
        else {
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
function emitReturnStmt(node, level) {
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
function emitAssignStmt(node, level) {
    const lhs = node.lhs.map(emitExpr).join(", ");
    const rhs = node.rhs.map(emitExpr).join(", ");
    return `${indent(level)}${lhs} ${node.op} ${rhs};`;
}
function emitShortDeclStmt(node, level) {
    // Check for error propagation in RHS
    if (node.values.length === 1 && node.values[0].kind === "ErrorPropExpr") {
        return emitErrorPropDecl(node.names, node.values[0], level);
    }
    if (node.names.length === 1 && node.values.length === 1) {
        return `${indent(level)}var ${node.names[0]} = ${emitExpr(node.values[0])};`;
    }
    // Multiple declarations
    const lines = [];
    for (let i = 0; i < node.names.length; i++) {
        const val = i < node.values.length ? emitExpr(node.values[i]) : "null";
        lines.push(`${indent(level)}var ${node.names[i]} = ${val};`);
    }
    return lines.join("\n");
}
function emitErrorPropDecl(names, errProp, level) {
    const lines = [];
    if (names.length === 1) {
        const varName = names[0];
        lines.push(`${indent(level)}${mapType({ name: "interface{}" })} ${varName};`);
        lines.push(`${indent(level)}try {`);
        lines.push(`${indent(level + 1)}${varName} = ${emitExpr(errProp.x)};`);
        lines.push(`${indent(level)}} catch (Exception e) {`);
        if (errProp.wrap) {
            lines.push(`${indent(level + 1)}throw new RuntimeException("${errProp.wrap}", e);`);
        }
        else {
            lines.push(`${indent(level + 1)}throw e;`);
        }
        lines.push(`${indent(level)}}`);
    }
    else {
        // Multiple names — emit try-catch around the expression
        lines.push(`${indent(level)}try {`);
        lines.push(`${indent(level + 1)}var _result = ${emitExpr(errProp.x)};`);
        for (let i = 0; i < names.length; i++) {
            lines.push(`${indent(level + 1)}var ${names[i]} = _result; // TODO: destructure index ${i}`);
        }
        lines.push(`${indent(level)}} catch (Exception e) {`);
        if (errProp.wrap) {
            lines.push(`${indent(level + 1)}throw new RuntimeException("${errProp.wrap}", e);`);
        }
        else {
            lines.push(`${indent(level + 1)}throw e;`);
        }
        lines.push(`${indent(level)}}`);
    }
    return lines.join("\n");
}
function emitBranchStmt(node, level) {
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
function emitVarDecl(node, level) {
    if (node.type && node.value) {
        return `${indent(level)}${mapType(node.type)} ${node.name} = ${emitExpr(node.value)};`;
    }
    if (node.type) {
        return `${indent(level)}${mapType(node.type)} ${node.name};`;
    }
    if (node.value) {
        return `${indent(level)}var ${node.name} = ${emitExpr(node.value)};`;
    }
    return `${indent(level)}var ${node.name};`;
}
function emitConstDecl(node, level) {
    const lines = [];
    for (const spec of node.specs) {
        const type = spec.type ? mapType(spec.type) : "var";
        let s = `${indent(level)}final ${type} ${spec.name}`;
        if (spec.value)
            s += ` = ${emitExpr(spec.value)}`;
        s += ";";
        lines.push(s);
    }
    return lines.join("\n");
}
// ─── Java-specific node emission ───────────────────────────────────────────────
function emitJavaClassDecl(node, level) {
    const lines = [];
    const mods = node.modifiers.length > 0 ? node.modifiers.join(" ") + " " : "";
    let header = `${indent(level)}${mods}class ${node.name}`;
    if (node.superClass) {
        header += ` extends ${node.superClass}`;
    }
    if (node.interfaces.length > 0) {
        header += ` implements ${node.interfaces.join(", ")}`;
    }
    header += " {";
    lines.push(header);
    // Fields
    for (const f of node.fields) {
        lines.push(`${indent(level + 1)}private ${mapType(f.type)} ${f.name};`);
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
    // Inner classes
    for (const inner of node.innerClasses) {
        lines.push("");
        lines.push(emitJavaClassDecl(inner, level + 1));
    }
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
function emitConstructor(className, node, level) {
    const params = node.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");
    const lines = [];
    lines.push(`${indent(level)}public ${className}(${params}) {`);
    lines.push(emitBlockBody(node.body, level + 1));
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
function emitJavaTryCatch(node, level) {
    const lines = [];
    // try-with-resources
    if (node.resources && node.resources.length > 0) {
        const resources = node.resources.map(r => emitNode(r, 0).trim().replace(/;$/, "")).join("; ");
        lines.push(`${indent(level)}try (${resources}) {`);
    }
    else {
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
        }
        else {
            result += "\n" + line;
        }
    }
    return result;
}
function emitJavaEnhancedFor(node, level) {
    const varType = node.varType ? mapType(node.varType) : "var";
    let s = `${indent(level)}for (${varType} ${node.varName} : ${emitExpr(node.iterable)}) {\n`;
    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    return s;
}
function emitJavaThrowStmt(node, level) {
    return `${indent(level)}throw ${emitExpr(node.expr)};`;
}
// ─── Expression emission ───────────────────────────────────────────────────────
// Emit condition expression, stripping outer parens to avoid double-wrapping
function emitCondExpr(expr) {
    if (expr.kind === "ParenExpr")
        return emitExpr(expr.x);
    return emitExpr(expr);
}
export function emitExpr(expr) {
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
        case "SelectorExpr":
            return `${emitExpr(expr.x)}.${expr.sel}`;
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
        default:
            return `/* unknown expr: ${expr.kind} */`;
    }
}
function emitIdent(expr) {
    // Map Go identifiers to Java equivalents
    switch (expr.name) {
        case "nil": return "null";
        case "true": return "true";
        case "false": return "false";
        case "iota": return "/* iota */";
        default: return expr.name;
    }
}
function emitBasicLit(expr) {
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
function emitCompositeLit(expr) {
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
        const eltType = mapIRTypeToJava(emitExpr(typeExpr.elt));
        const elts = expr.elts.map(emitExpr).join(", ");
        return `new ${eltType}[]{${elts}}`;
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
function emitFuncLit(expr) {
    const params = expr.params.map(p => `${mapType(p.type)} ${p.name}`).join(", ");
    // Single-statement body can be simplified
    if (expr.body.stmts.length === 1) {
        const stmt = expr.body.stmts[0];
        if (stmt.kind === "ReturnStmt" && stmt.values.length === 1) {
            const val = emitExpr(stmt.values[0]);
            return `(${params}) -> ${val}`;
        }
        if (stmt.kind === "ExprStmt") {
            return `(${params}) -> ${emitExpr(stmt.expr)}`;
        }
    }
    const body = emitBlockBody(expr.body, 2);
    return `(${params}) -> {\n${body}    }`;
}
function emitBinaryExpr(expr) {
    return `${emitExpr(expr.left)} ${expr.op} ${emitExpr(expr.right)}`;
}
function emitUnaryExpr(expr) {
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
function emitCallExpr(expr) {
    const args = expr.args.map(emitExpr).join(", ");
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
    // Go built-in functions → Java equivalents
    if (expr.func.kind === "Ident") {
        switch (expr.func.name) {
            case "len":
                return emitLenCall(expr.args);
            case "cap":
                return emitCapCall(expr.args);
            case "append": {
                // append(slice, elems...) → handled via ArrayList or Arrays.copyOf
                if (expr.args.length >= 2) {
                    const slice = emitExpr(expr.args[0]);
                    const newElts = expr.args.slice(1).map(emitExpr).join(", ");
                    return `/* append */ ${slice} /* + ${newElts} */`;
                }
                return `/* append */`;
            }
            case "make":
                return emitMakeCall(expr.args);
            case "new": {
                if (expr.args.length === 1) {
                    const typeArg = emitExpr(expr.args[0]);
                    return `new ${typeArg}()`;
                }
                break;
            }
            case "delete": {
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
        }
    }
    // fmt.Sprintf → String.format
    if (expr.func.kind === "SelectorExpr") {
        const sel = expr.func;
        if (sel.x.kind === "Ident") {
            const pkg = sel.x.name;
            const method = sel.sel;
            const mapped = mapStdlibCall(pkg, method, expr.args);
            if (mapped)
                return mapped;
        }
    }
    const funcStr = emitExpr(expr.func);
    return `${funcStr}(${args})`;
}
function emitLenCall(args) {
    if (args.length !== 1)
        return `/* len() */`;
    const arg = emitExpr(args[0]);
    // Strings and collections use .length() or .size(); arrays use .length
    // Use .length() which works for String; arrays use .length but that's a minor compat issue
    // For safety, use .length() which works for String (most common case from Java reverse)
    return `${arg}.length()`;
}
function emitCapCall(args) {
    if (args.length !== 1)
        return `/* cap() */`;
    const arg = emitExpr(args[0]);
    return `${arg}.length`;
}
function emitMakeCall(args) {
    if (args.length === 0)
        return `/* make() */`;
    const typeArg = args[0];
    if (typeArg.kind === "MapTypeExpr") {
        imports.add("java.util.HashMap");
        const k = emitExpr(typeArg.key);
        const v = emitExpr(typeArg.value);
        return `new HashMap<${boxType(k)}, ${boxType(v)}>()`;
    }
    if (typeArg.kind === "ArrayTypeExpr") {
        const elt = emitExpr(typeArg.elt);
        const javaElt = mapIRTypeToJava(elt);
        const sizeExpr = args.length > 1 ? emitExpr(args[1]) : "0";
        // Primitive arrays use new Type[size], object arrays use new Type[size]
        if (isPrimitiveType(javaElt)) {
            return `new ${javaElt}[${sizeExpr}]`;
        }
        return `new ${javaElt}[${sizeExpr}]`;
    }
    if (typeArg.kind === "ChanTypeExpr") {
        throw new Error("Go-specific construct ChanTypeExpr (channels) not supported for Java target");
    }
    return `new ${emitExpr(typeArg)}()`;
}
function mapStdlibCall(pkg, method, args) {
    const argStr = args.map(emitExpr).join(", ");
    switch (pkg) {
        case "fmt":
            switch (method) {
                case "Println": return `System.out.println(${argStr})`;
                case "Printf": return `System.out.printf(${argStr})`;
                case "Print": return `System.out.print(${argStr})`;
                case "Sprintf": return `String.format(${argStr})`;
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
                case "Abs": return `Math.abs(${argStr})`;
                case "Max": return `Math.max(${argStr})`;
                case "Min": return `Math.min(${argStr})`;
                case "Sqrt": return `Math.sqrt(${argStr})`;
                case "Pow": return `Math.pow(${argStr})`;
                case "Floor": return `Math.floor(${argStr})`;
                case "Ceil": return `Math.ceil(${argStr})`;
                case "Round": return `Math.round(${argStr})`;
                case "Log": return `Math.log(${argStr})`;
                case "Log10": return `Math.log10(${argStr})`;
                case "Sin": return `Math.sin(${argStr})`;
                case "Cos": return `Math.cos(${argStr})`;
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
function emitSliceExpr(expr) {
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
function emitTypeAssertExpr(expr) {
    return `(${mapType(expr.type)}) ${emitExpr(expr.x)}`;
}
function emitPipeExpr(expr) {
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
function emitMapTypeExpr(expr) {
    imports.add("java.util.HashMap");
    const k = emitExpr(expr.key);
    const v = emitExpr(expr.value);
    return `HashMap<${boxType(k)}, ${boxType(v)}>`;
}
function emitArrayTypeExpr(expr) {
    const elt = emitExpr(expr.elt);
    return `${mapIRTypeToJava(elt)}[]`;
}
function emitFuncTypeExpr(expr) {
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
function emitJavaNewExpr(expr) {
    const args = expr.args.map(emitExpr).join(", ");
    return `new ${mapType(expr.type)}(${args})`;
}
function emitJavaLambdaExpr(expr) {
    const params = expr.params.map(p => {
        if (p.type && p.type.name) {
            return `${mapType(p.type)} ${p.name}`;
        }
        return p.name;
    }).join(", ");
    if ("kind" in expr.body && expr.body.kind === "BlockStmt") {
        const body = emitBlockBody(expr.body, 2);
        return `(${params}) -> {\n${body}    }`;
    }
    // Single expression body
    return `(${params}) -> ${emitExpr(expr.body)}`;
}
function emitJavaInstanceofExpr(expr) {
    return `${emitExpr(expr.expr)} instanceof ${mapType(expr.type)}`;
}
function emitJavaCastExpr(expr) {
    return `(${mapType(expr.type)}) ${emitExpr(expr.expr)}`;
}
function emitJavaTernaryExpr(expr) {
    return `${emitExpr(expr.cond)} ? ${emitExpr(expr.ifTrue)} : ${emitExpr(expr.ifFalse)}`;
}
// ─── Type mapping ──────────────────────────────────────────────────────────────
function mapType(irType) {
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
        case "int": return "int";
        case "int8": return "byte";
        case "int16": return "short";
        case "int32": return "int";
        case "int64": return "long";
        case "uint": return "int";
        case "uint8": return "byte";
        case "uint16": return "short";
        case "uint32": return "int";
        case "uint64": return "long";
        case "float32": return "float";
        case "float64": return "double";
        case "string": return "String";
        case "bool": return "boolean";
        case "byte": return "byte";
        case "rune": return "char";
        case "error": return "Exception";
        case "interface{}": return "Object";
        case "any": return "Object";
        case "void": return "void";
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
    // Map prefix in name: map[K]V
    const mapMatch = name.match(/^map\[(.+?)\](.+)$/);
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
    // User-defined or unrecognized type: pass through as-is
    return name;
}
function emitReturnType(results) {
    if (results.length === 0)
        return "void";
    if (results.length === 1)
        return mapType(results[0]);
    // Multiple returns not natively supported in Java; return the first type
    // (the transformer should ideally convert multi-returns before emission)
    return mapType(results[0]);
}
/** Convert primitive Java types to their boxed equivalents for use in generics. */
function boxType(javaType) {
    switch (javaType) {
        case "int": return "Integer";
        case "long": return "Long";
        case "double": return "Double";
        case "float": return "Float";
        case "boolean": return "Boolean";
        case "byte": return "Byte";
        case "short": return "Short";
        case "char": return "Character";
        default: return javaType;
    }
}
function capitalize(s) {
    if (s.length === 0)
        return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function isPrimitiveType(t) {
    return ["int", "long", "double", "float", "boolean", "byte", "short", "char"].includes(t);
}
/** Map IR type name to Java type name */
function mapIRTypeToJava(irType) {
    switch (irType) {
        case "string": return "String";
        case "bool": return "boolean";
        case "int64": return "long";
        case "float64": return "double";
        case "float32": return "float";
        case "interface{}": return "Object";
        case "error": return "Exception";
        default: return irType;
    }
}
