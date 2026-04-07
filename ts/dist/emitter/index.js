// Emitter: Converts IR to valid Go source code
export function emit(program) {
    const lines = [];
    // Package declaration
    lines.push(`package ${program.package}`);
    // Imports
    if (program.imports.length > 0) {
        lines.push("");
        if (program.imports.length === 1) {
            lines.push(`import "${program.imports[0].path}"`);
        }
        else {
            lines.push("import (");
            for (const imp of program.imports) {
                const alias = imp.alias ? imp.alias + " " : "";
                lines.push(`\t${alias}"${imp.path}"`);
            }
            lines.push(")");
        }
    }
    // Top-level declarations
    for (const decl of program.decls) {
        lines.push("");
        lines.push(emitNode(decl, 0));
    }
    return lines.join("\n") + "\n";
}
function indent(level) {
    return "\t".repeat(level);
}
function emitNode(node, level) {
    switch (node.kind) {
        case "FuncDecl": return emitFuncDecl(node, level);
        case "StructDecl": return emitStructDecl(node, level);
        case "InterfaceDecl": return emitInterfaceDecl(node, level);
        case "TypeAlias": return emitTypeAlias(node, level);
        case "BlockStmt": return emitBlockStmt(node, level);
        case "IfStmt": return emitIfStmt(node, level);
        case "ForStmt": return emitForStmt(node, level);
        case "RangeStmt": return emitRangeStmt(node, level);
        case "SwitchStmt": return emitSwitchStmt(node, level);
        case "SelectStmt": return emitSelectStmt(node, level);
        case "ReturnStmt": return emitReturnStmt(node, level);
        case "DeferStmt": return emitDeferStmt(node, level);
        case "GoStmt": return emitGoStmt(node, level);
        case "AssignStmt": return emitAssignStmt(node, level);
        case "ShortDeclStmt": return emitShortDeclStmt(node, level);
        case "ExprStmt": return `${indent(level)}${emitExpr(node.expr)}`;
        case "IncDecStmt": return `${indent(level)}${emitExpr(node.x)}${node.op}`;
        case "SendStmt": return `${indent(level)}${emitExpr(node.chan)} <- ${emitExpr(node.value)}`;
        case "BranchStmt": return `${indent(level)}${node.tok}`;
        case "VarDecl": return emitVarDecl(node, level);
        case "ConstDecl": return emitConstDecl(node, level);
        default: return `${indent(level)}// unknown node: ${node.kind}`;
    }
}
function emitFuncDecl(node, level) {
    const parts = [indent(level), "func "];
    // Receiver
    if (node.receiver) {
        const ptr = node.receiver.pointer ? "*" : "";
        parts.push(`(${node.receiver.name} ${ptr}${node.receiver.type.name}) `);
    }
    // Name and params
    parts.push(`${node.name}(`);
    parts.push(node.params.map(p => `${p.name} ${p.type.name}`).join(", "));
    parts.push(")");
    // Return types
    if (node.results.length === 1) {
        parts.push(` ${node.results[0].name}`);
    }
    else if (node.results.length > 1) {
        parts.push(` (${node.results.map(r => r.name).join(", ")})`);
    }
    parts.push(" {\n");
    parts.push(emitBlockBody(node.body, level + 1));
    parts.push(`${indent(level)}}`);
    return parts.join("");
}
function emitStructDecl(node, level) {
    const lines = [`${indent(level)}type ${node.name} struct {`];
    for (const f of node.fields) {
        const tag = f.tag ? ` \`${f.tag}\`` : "";
        lines.push(`${indent(level + 1)}${f.name} ${f.type.name}${tag}`);
    }
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
function emitInterfaceDecl(node, level) {
    const lines = [`${indent(level)}type ${node.name} interface {`];
    for (const m of node.methods) {
        const params = m.params.map(p => `${p.name} ${p.type.name}`).join(", ");
        let ret = "";
        if (m.results.length === 1)
            ret = ` ${m.results[0].name}`;
        else if (m.results.length > 1)
            ret = ` (${m.results.map(r => r.name).join(", ")})`;
        lines.push(`${indent(level + 1)}${m.name}(${params})${ret}`);
    }
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
function emitTypeAlias(node, level) {
    return `${indent(level)}type ${node.name} ${node.underlying.name}`;
}
function emitBlockStmt(node, level) {
    return `{\n${emitBlockBody(node, level + 1)}${indent(level)}}`;
}
function emitBlockBody(block, level) {
    return block.stmts.map(s => emitNode(s, level) + "\n").join("");
}
function emitIfStmt(node, level) {
    let s = `${indent(level)}if `;
    if (node.init) {
        s += emitNode(node.init, 0).trim() + "; ";
    }
    s += emitExpr(node.cond) + " {\n";
    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    if (node.else_) {
        if (node.else_.kind === "IfStmt") {
            s += " else " + emitIfStmt(node.else_, 0).trim();
        }
        else if (node.else_.kind === "BlockStmt") {
            s += ` else {\n${emitBlockBody(node.else_, level + 1)}${indent(level)}}`;
        }
    }
    return s;
}
function emitForStmt(node, level) {
    let header = "";
    if (node.init && node.post) {
        header = `${emitNode(node.init, 0).trim()}; ${node.cond ? emitExpr(node.cond) : ""}; ${emitNode(node.post, 0).trim()}`;
    }
    else if (node.cond) {
        header = emitExpr(node.cond);
    }
    // else: infinite loop (no header)
    let s = `${indent(level)}for ${header} {\n`;
    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    return s;
}
function emitRangeStmt(node, level) {
    const vars = [node.key || "_", node.value].filter(Boolean).join(", ");
    let s = `${indent(level)}for ${vars} := range ${emitExpr(node.x)} {\n`;
    s += emitBlockBody(node.body, level + 1);
    s += `${indent(level)}}`;
    return s;
}
function emitSwitchStmt(node, level) {
    let s = `${indent(level)}switch `;
    if (node.tag)
        s += emitExpr(node.tag) + " ";
    s += "{\n";
    for (const c of node.cases) {
        if (c.values) {
            s += `${indent(level)}case ${c.values.map(emitExpr).join(", ")}:\n`;
        }
        else {
            s += `${indent(level)}default:\n`;
        }
        for (const stmt of c.body) {
            s += emitNode(stmt, level + 1) + "\n";
        }
    }
    s += `${indent(level)}}`;
    return s;
}
function emitSelectStmt(node, level) {
    let s = `${indent(level)}select {\n`;
    for (const c of node.cases) {
        if (c.comm) {
            s += `${indent(level)}case ${emitNode(c.comm, 0).trim()}:\n`;
        }
        else {
            s += `${indent(level)}default:\n`;
        }
        for (const stmt of c.body) {
            s += emitNode(stmt, level + 1) + "\n";
        }
    }
    s += `${indent(level)}}`;
    return s;
}
function emitReturnStmt(node, level) {
    if (node.values.length === 0)
        return `${indent(level)}return`;
    return `${indent(level)}return ${node.values.map(emitExpr).join(", ")}`;
}
function emitDeferStmt(node, level) {
    return `${indent(level)}defer ${emitExpr(node.call)}`;
}
function emitGoStmt(node, level) {
    return `${indent(level)}go ${emitExpr(node.call)}`;
}
function emitAssignStmt(node, level) {
    const lhs = node.lhs.map(emitExpr).join(", ");
    const rhs = node.rhs.map(emitExpr).join(", ");
    return `${indent(level)}${lhs} ${node.op} ${rhs}`;
}
function emitShortDeclStmt(node, level) {
    // Check for error propagation in RHS
    if (node.values.length === 1 && node.values[0].kind === "ErrorPropExpr") {
        return emitErrorPropDecl(node.names, node.values[0], level);
    }
    const names = node.names.join(", ");
    const values = node.values.map(emitExpr).join(", ");
    return `${indent(level)}${names} := ${values}`;
}
function emitErrorPropDecl(names, errProp, level) {
    const lines = [];
    const errVar = "err";
    const allNames = [...names, errVar].join(", ");
    lines.push(`${indent(level)}${allNames} := ${emitExpr(errProp.x)}`);
    lines.push(`${indent(level)}if ${errVar} != nil {`);
    if (errProp.wrap) {
        lines.push(`${indent(level + 1)}return fmt.Errorf("${errProp.wrap}: %w", ${errVar})`);
    }
    else {
        // Generate zero values for non-error return values + err
        const zeroReturns = names.map(() => getZeroReturnPlaceholder()).join(", ");
        if (zeroReturns) {
            lines.push(`${indent(level + 1)}return ${zeroReturns}, ${errVar}`);
        }
        else {
            lines.push(`${indent(level + 1)}return ${errVar}`);
        }
    }
    lines.push(`${indent(level)}}`);
    return lines.join("\n");
}
function getZeroReturnPlaceholder() {
    // Without full type info, use generic zero value
    // In practice, the transformer should annotate the types
    return `nil`;
}
function emitVarDecl(node, level) {
    let s = `${indent(level)}var ${node.name}`;
    if (node.type)
        s += ` ${node.type.name}`;
    if (node.value)
        s += ` = ${emitExpr(node.value)}`;
    return s;
}
function emitConstDecl(node, level) {
    if (node.specs.length === 1) {
        const spec = node.specs[0];
        let s = `${indent(level)}const ${spec.name}`;
        if (spec.value)
            s += ` = ${emitExpr(spec.value)}`;
        return s;
    }
    const lines = [`${indent(level)}const (`];
    for (const spec of node.specs) {
        let s = `${indent(level + 1)}${spec.name}`;
        if (spec.value)
            s += ` = ${emitExpr(spec.value)}`;
        lines.push(s);
    }
    lines.push(`${indent(level)})`);
    return lines.join("\n");
}
// Expression emitters
export function emitExpr(expr) {
    switch (expr.kind) {
        case "Ident": return expr.name;
        case "BasicLit": return expr.value;
        case "CompositeLit": {
            const type = expr.type ? emitExpr(expr.type) : "";
            const elts = expr.elts.map(emitExpr).join(", ");
            return `${type}{${elts}}`;
        }
        case "FuncLit": {
            const params = expr.params.map(p => `${p.name} ${p.type.name}`).join(", ");
            let ret = "";
            if (expr.results.length === 1)
                ret = ` ${expr.results[0].name}`;
            else if (expr.results.length > 1)
                ret = ` (${expr.results.map(r => r.name).join(", ")})`;
            const body = emitBlockBody(expr.body, 2);
            return `func(${params})${ret} {\n${body}\t}()`;
        }
        case "BinaryExpr":
            return `${emitExpr(expr.left)} ${expr.op} ${emitExpr(expr.right)}`;
        case "UnaryExpr":
            return `${expr.op}${emitExpr(expr.x)}`;
        case "CallExpr": {
            const args = expr.args.map(emitExpr).join(", ");
            const ellipsis = expr.ellipsis ? "..." : "";
            return `${emitExpr(expr.func)}(${args}${ellipsis})`;
        }
        case "SelectorExpr":
            return `${emitExpr(expr.x)}.${expr.sel}`;
        case "IndexExpr":
            return `${emitExpr(expr.x)}[${emitExpr(expr.index)}]`;
        case "SliceExpr": {
            const low = expr.low ? emitExpr(expr.low) : "";
            const high = expr.high ? emitExpr(expr.high) : "";
            const max = expr.max ? ":" + emitExpr(expr.max) : "";
            return `${emitExpr(expr.x)}[${low}:${high}${max}]`;
        }
        case "TypeAssertExpr":
            return `${emitExpr(expr.x)}.(${expr.type.name})`;
        case "StarExpr":
            return `*${emitExpr(expr.x)}`;
        case "UnaryRecvExpr":
            return `<-${emitExpr(expr.x)}`;
        case "KeyValueExpr":
            return `${emitExpr(expr.key)}: ${emitExpr(expr.value)}`;
        case "ParenExpr":
            return `(${emitExpr(expr.x)})`;
        case "ErrorPropExpr":
            // Error propagation is handled at the statement level in emitNode
            // When reached here as an expression, just emit the inner expression
            return emitExpr(expr.x);
        case "PipeExpr":
            // Should be expanded to for loops by transformer
            return `/* pipe: ${expr.op} */`;
        case "MapTypeExpr":
            return `map[${emitExpr(expr.key)}]${emitExpr(expr.value)}`;
        case "ArrayTypeExpr":
            return `[]${emitExpr(expr.elt)}`;
        case "ChanTypeExpr":
            return `chan ${emitExpr(expr.value)}`;
        case "FuncTypeExpr": {
            const params = expr.params.map(p => `${p.name} ${p.type.name}`).join(", ");
            let ret = "";
            if (expr.results.length === 1)
                ret = ` ${expr.results[0].name}`;
            return `func(${params})${ret}`;
        }
        case "InterfaceTypeExpr": return "interface{}";
        case "StructTypeExpr": return "struct{}";
        case "RawGoExpr": return expr.code;
        default: return `/* unknown expr */`;
    }
}
