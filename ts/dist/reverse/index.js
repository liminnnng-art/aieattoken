// Reverse transpiler: Go → IR → AET
// Uses the Go CLI parser (go-parser/main.go) to get JSON AST, then converts to IR, then to AET
import { execSync } from "child_process";
import { resolve } from "path";
import * as IR from "../ir.js";
import { readFileSync } from "fs";
// Load stdlib aliases for reverse mapping
let reverseAliasMap = {}; // "fmt.Println" → "pl"
export function loadReverseAliases(path) {
    try {
        const p = path || resolve(process.cwd(), "..", "stdlib-aliases.json");
        const data = JSON.parse(readFileSync(p, "utf-8"));
        const aliases = data.aliases || {};
        for (const [alias, info] of Object.entries(aliases)) {
            reverseAliasMap[info.go] = alias;
        }
    }
    catch { /* optional */ }
}
// Parse a Go file using the Go CLI tool, return JSON AST
export function parseGoFile(goFilePath) {
    const parserPath = resolve(process.cwd(), "..", "go-parser", "goparser.exe");
    try {
        const result = execSync(`"${parserPath}" "${goFilePath}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
        return JSON.parse(result);
    }
    catch (e) {
        throw new Error(`Failed to parse Go file: ${e.message}`);
    }
}
// Convert Go JSON AST to IR
export function goAstToIR(goAst) {
    const imports = [];
    const decls = [];
    for (const decl of goAst.Decls || []) {
        if (decl.Kind === "GenDecl" && decl.Token === "import") {
            for (const spec of decl.Specs || []) {
                if (spec.Kind === "ImportSpec") {
                    imports.push({ path: spec.Path.replace(/"/g, "") });
                }
            }
        }
        else if (decl.Kind === "FuncDecl") {
            decls.push(convertFuncDecl(decl));
        }
        else if (decl.Kind === "GenDecl" && decl.Token === "type") {
            for (const spec of decl.Specs || []) {
                if (spec.Kind === "TypeSpec") {
                    decls.push(convertTypeSpec(spec));
                }
            }
        }
        else if (decl.Kind === "GenDecl" && decl.Token === "var") {
            for (const spec of decl.Specs || []) {
                decls.push(convertVarSpec(spec));
            }
        }
        else if (decl.Kind === "GenDecl" && decl.Token === "const") {
            const specs = (decl.Specs || []).map((s) => convertConstSpec(s));
            decls.push({ kind: "ConstDecl", specs, stmtIndex: 0 });
        }
    }
    return {
        kind: "Program",
        package: goAst.Name || "main",
        imports,
        decls,
        stmtIndex: 0,
    };
}
function convertFuncDecl(node) {
    const name = node.Name || "";
    let receiver;
    if (node.Recv && node.Recv.List && node.Recv.List.length > 0) {
        const recv = node.Recv.List[0];
        const recvName = recv.Names?.[0] || name[0]?.toLowerCase() || "r";
        const recvType = convertTypeExpr(recv.Type);
        const isPointer = recv.Type?.Kind === "StarExpr";
        receiver = { name: recvName, type: recvType, pointer: isPointer };
    }
    const params = convertFieldList(node.Type?.Params);
    const results = convertResultTypes(node.Type?.Results);
    const body = convertBlockStmt(node.Body);
    return { kind: "FuncDecl", name, receiver, params, results, body, stmtIndex: 0 };
}
function convertFieldList(fieldList) {
    if (!fieldList?.List)
        return [];
    const params = [];
    for (const field of fieldList.List) {
        const type = convertTypeExpr(field.Type);
        if (field.Names && field.Names.length > 0) {
            for (const name of field.Names) {
                params.push({ name, type });
            }
        }
        else {
            params.push({ name: "_", type });
        }
    }
    return params;
}
function convertResultTypes(results) {
    if (!results?.List)
        return [];
    return results.List.map((field) => convertTypeExpr(field.Type));
}
function convertTypeExpr(node) {
    if (!node)
        return IR.simpleType("interface{}");
    switch (node.Kind) {
        case "Ident": return IR.simpleType(node.Name || "interface{}");
        case "StarExpr": return IR.pointerType(convertTypeExpr(node.X));
        case "ArrayType": return IR.sliceType(convertTypeExpr(node.Elt));
        case "MapType": return IR.mapType(convertTypeExpr(node.Key), convertTypeExpr(node.Value));
        case "ChanType": {
            const elt = convertTypeExpr(node.Value);
            return { name: "chan " + elt.name, isChan: true, elementType: elt };
        }
        case "SelectorExpr": {
            const pkg = node.X?.Name || "";
            const sel = node.Sel || "";
            return IR.simpleType(`${pkg}.${sel}`);
        }
        case "FuncType": return IR.simpleType("func()");
        case "InterfaceType": return IR.simpleType("interface{}");
        case "Ellipsis": return { ...convertTypeExpr(node.Elt), name: "..." + (convertTypeExpr(node.Elt)).name };
        default: return IR.simpleType(node.Name || "interface{}");
    }
}
function convertTypeSpec(spec) {
    const name = spec.Name || "";
    const typeNode = spec.Type;
    if (typeNode?.Kind === "StructType") {
        const fields = [];
        for (const field of typeNode.Fields?.List || []) {
            const type = convertTypeExpr(field.Type);
            const tag = field.Tag || undefined;
            for (const fname of field.Names || ["_"]) {
                fields.push({ name: fname, type, tag });
            }
        }
        return { kind: "StructDecl", name, fields, stmtIndex: 0 };
    }
    if (typeNode?.Kind === "InterfaceType") {
        const methods = [];
        for (const method of typeNode.Methods?.List || []) {
            if (method.Type?.Kind === "FuncType") {
                methods.push({
                    name: method.Names?.[0] || "",
                    params: convertFieldList(method.Type.Params),
                    results: convertResultTypes(method.Type.Results),
                });
            }
        }
        return { kind: "InterfaceDecl", name, methods, stmtIndex: 0 };
    }
    return { kind: "TypeAlias", name, underlying: convertTypeExpr(typeNode), stmtIndex: 0 };
}
function convertVarSpec(spec) {
    const name = spec.Names?.[0] || "";
    const type = spec.Type ? convertTypeExpr(spec.Type) : undefined;
    const value = spec.Values?.[0] ? convertExpr(spec.Values[0]) : undefined;
    return { kind: "VarDecl", name, type, value, stmtIndex: 0 };
}
function convertConstSpec(spec) {
    return {
        name: spec.Names?.[0] || "",
        value: spec.Values?.[0] ? convertExpr(spec.Values[0]) : undefined,
    };
}
function convertBlockStmt(node) {
    const stmtList = node?.List || node?.Stmts;
    if (!stmtList)
        return { kind: "BlockStmt", stmts: [] };
    return { kind: "BlockStmt", stmts: stmtList.map(convertStmt).filter(Boolean) };
}
function convertStmt(node) {
    if (!node)
        return null;
    switch (node.Kind) {
        case "ExprStmt":
            return { kind: "ExprStmt", expr: convertExpr(node.X), stmtIndex: 0 };
        case "AssignStmt": {
            const lhs = (node.Lhs || []).map(convertExpr);
            const rhs = (node.Rhs || []).map(convertExpr);
            if (node.Tok === ":=") {
                return { kind: "ShortDeclStmt", names: lhs.map(exprName), values: rhs, stmtIndex: 0 };
            }
            return { kind: "AssignStmt", lhs, rhs, op: node.Tok || "=", stmtIndex: 0 };
        }
        case "ReturnStmt":
            return { kind: "ReturnStmt", values: (node.Results || []).map(convertExpr), stmtIndex: 0 };
        case "IfStmt":
            return convertIfStmt(node);
        case "ForStmt":
            return convertForStmt(node);
        case "RangeStmt":
            return convertRangeStmt(node);
        case "SwitchStmt":
            return convertSwitchStmt(node);
        case "SelectStmt":
            return convertSelectStmt(node);
        case "DeferStmt":
            return { kind: "DeferStmt", call: convertExpr(node.Call), stmtIndex: 0 };
        case "GoStmt":
            return { kind: "GoStmt", call: convertExpr(node.Call), stmtIndex: 0 };
        case "IncDecStmt":
            return { kind: "IncDecStmt", x: convertExpr(node.X), op: node.Tok, stmtIndex: 0 };
        case "SendStmt":
            return { kind: "SendStmt", chan: convertExpr(node.Chan), value: convertExpr(node.Value), stmtIndex: 0 };
        case "BranchStmt":
            return { kind: "BranchStmt", tok: (node.Tok || "break").toLowerCase(), stmtIndex: 0 };
        case "BlockStmt":
            return convertBlockStmt(node);
        case "DeclStmt": {
            // Inline var/const declarations
            const decl = node.Decl;
            if (decl?.Token === "var" && decl.Specs?.[0]) {
                return convertVarSpec(decl.Specs[0]);
            }
            if (decl?.Token === "const" && decl.Specs) {
                return { kind: "ConstDecl", specs: decl.Specs.map(convertConstSpec), stmtIndex: 0 };
            }
            return null;
        }
        default:
            return null;
    }
}
function convertIfStmt(node) {
    const init = node.Init ? convertStmt(node.Init) || undefined : undefined;
    const cond = convertExpr(node.Cond);
    const body = convertBlockStmt(node.Body);
    let else_;
    if (node.Else) {
        if (node.Else.Kind === "IfStmt") {
            else_ = convertIfStmt(node.Else);
        }
        else {
            else_ = convertBlockStmt(node.Else);
        }
    }
    return { kind: "IfStmt", init, cond, body, else_, stmtIndex: 0 };
}
function convertForStmt(node) {
    return {
        kind: "ForStmt",
        init: node.Init ? convertStmt(node.Init) || undefined : undefined,
        cond: node.Cond ? convertExpr(node.Cond) : undefined,
        post: node.Post ? convertStmt(node.Post) || undefined : undefined,
        body: convertBlockStmt(node.Body),
        stmtIndex: 0,
    };
}
function convertRangeStmt(node) {
    return {
        kind: "RangeStmt",
        key: node.Key ? exprName(convertExpr(node.Key)) : undefined,
        value: node.Value ? exprName(convertExpr(node.Value)) : undefined,
        x: convertExpr(node.X),
        body: convertBlockStmt(node.Body),
        stmtIndex: 0,
    };
}
function convertSwitchStmt(node) {
    const cases = (node.Body?.List || []).map((c) => ({
        kind: "CaseClause",
        values: c.List ? c.List.map(convertExpr) : undefined,
        body: (c.Body || []).map(convertStmt).filter(Boolean),
    }));
    return { kind: "SwitchStmt", tag: node.Tag ? convertExpr(node.Tag) : undefined, cases, stmtIndex: 0 };
}
function convertSelectStmt(node) {
    const cases = (node.Body?.List || []).map((c) => ({
        kind: "CommClause",
        comm: c.Comm ? convertStmt(c.Comm) || undefined : undefined,
        body: (c.Body || []).map(convertStmt).filter(Boolean),
    }));
    return { kind: "SelectStmt", cases, stmtIndex: 0 };
}
function convertExpr(node) {
    if (!node)
        return { kind: "Ident", name: "_" };
    switch (node.Kind) {
        case "Ident": return { kind: "Ident", name: node.Name || "_" };
        case "BasicLit": {
            const typeMap = {
                INT: "INT", FLOAT: "FLOAT", STRING: "STRING", CHAR: "CHAR",
            };
            return { kind: "BasicLit", type: typeMap[node.Type] || "STRING", value: node.Value || "" };
        }
        case "CompositeLit": {
            const type = node.Type ? convertExpr(node.Type) : undefined;
            const elts = (node.Elts || []).map(convertExpr);
            return { kind: "CompositeLit", type, elts };
        }
        case "BinaryExpr":
            return { kind: "BinaryExpr", left: convertExpr(node.X), op: node.Op || "+", right: convertExpr(node.Y) };
        case "UnaryExpr": {
            if (node.Op === "&")
                return { kind: "UnaryExpr", op: "&", x: convertExpr(node.X) };
            if (node.Op === "*")
                return { kind: "StarExpr", x: convertExpr(node.X) };
            if (node.Op === "<-")
                return { kind: "UnaryRecvExpr", x: convertExpr(node.X) };
            return { kind: "UnaryExpr", op: node.Op || "!", x: convertExpr(node.X) };
        }
        case "CallExpr": {
            const func = convertExpr(node.Fun);
            const args = (node.Args || []).map(convertExpr);
            return { kind: "CallExpr", func, args };
        }
        case "SelectorExpr": {
            const x = convertExpr(node.X);
            const sel = node.Sel || "";
            // Check for stdlib alias in reverse
            if (x.kind === "Ident") {
                const fullName = `${x.name}.${sel}`;
                const alias = reverseAliasMap[fullName];
                if (alias) {
                    return { kind: "Ident", name: alias };
                }
            }
            return { kind: "SelectorExpr", x, sel };
        }
        case "IndexExpr":
            return { kind: "IndexExpr", x: convertExpr(node.X), index: convertExpr(node.Index) };
        case "SliceExpr":
            return { kind: "SliceExpr", x: convertExpr(node.X), low: node.Low ? convertExpr(node.Low) : undefined, high: node.High ? convertExpr(node.High) : undefined };
        case "TypeAssertExpr":
            return { kind: "TypeAssertExpr", x: convertExpr(node.X), type: convertTypeExpr(node.Type) };
        case "StarExpr":
            return { kind: "StarExpr", x: convertExpr(node.X) };
        case "ParenExpr":
            return { kind: "ParenExpr", x: convertExpr(node.X) };
        case "FuncLit": {
            const params = convertFieldList(node.Type?.Params);
            const results = convertResultTypes(node.Type?.Results);
            const body = convertBlockStmt(node.Body);
            return { kind: "FuncLit", params, results, body };
        }
        case "KeyValueExpr":
            return { kind: "KeyValueExpr", key: convertExpr(node.Key), value: convertExpr(node.Value) };
        case "ArrayType":
            return { kind: "ArrayTypeExpr", elt: convertExpr(node.Elt) };
        case "MapType":
            return { kind: "MapTypeExpr", key: convertExpr(node.Key), value: convertExpr(node.Value) };
        default:
            return { kind: "Ident", name: node.Name || "_" };
    }
}
function exprName(expr) {
    if (expr.kind === "Ident")
        return expr.name;
    return "_";
}
// Convert IR to AET string
export function irToAET(program) {
    const parts = ["!go-v2"];
    for (const decl of program.decls) {
        parts.push(nodeToAET(decl));
    }
    return parts.join(";");
}
function shortenType(name) {
    // Note: f64/i64/f32/i32 are all 2 tokens in cl100k_base, same as float64/int64/float32/int32.
    // No savings from abbreviating. Keep canonical Go type names for AI comprehension.
    // Only exception: types that are genuinely shorter in tokens would go here.
    return name;
}
function nodeToAET(node) {
    switch (node.kind) {
        case "FuncDecl": {
            let s = "";
            if (node.receiver) {
                s += `${shortenType(node.receiver.type.name)}.`;
            }
            s += `${node.name}(${node.params.map(p => {
                if (p.type.name === "interface{}")
                    return p.name;
                return `${p.name}:${shortenType(p.type.name)}`;
            }).join(",")})`;
            if (node.results.length > 0) {
                // Check for error return sugar: (T, error) -> ->!T
                const lastResult = node.results[node.results.length - 1];
                if (lastResult.name === "error") {
                    const nonErrorResults = node.results.slice(0, -1);
                    if (nonErrorResults.length === 0) {
                        s += `->!`;
                    }
                    else if (nonErrorResults.length === 1) {
                        s += `->!${shortenType(nonErrorResults[0].name)}`;
                    }
                    else {
                        s += `->!(${nonErrorResults.map(r => shortenType(r.name)).join(",")})`;
                    }
                }
                else if (node.results.length === 1) {
                    s += `->${shortenType(node.results[0].name)}`;
                }
                else {
                    s += `->(${node.results.map(r => shortenType(r.name)).join(",")})`;
                }
            }
            s += `{${blockToAET(node.body)}}`;
            return s;
        }
        case "StructDecl":
            return `@${node.name}{${node.fields.map(f => `${f.name}:${shortenType(f.type.name)}`).join(";")}}`;
        case "InterfaceDecl":
            return `@${node.name}[${node.methods.map(m => {
                const params = m.params.map(p => `${p.name}:${shortenType(p.type.name)}`).join(",");
                const ret = m.results.length > 0 ? `->${m.results.length === 1 ? shortenType(m.results[0].name) : `(${m.results.map(r => shortenType(r.name)).join(",")})`}` : "";
                return `${m.name}(${params})${ret}`;
            }).join(";")}]`;
        case "TypeAlias":
            return `@${node.name}=${node.underlying.name}`;
        case "ReturnStmt":
            return `^${node.values.map(exprToAET).join(",")}`;
        case "IfStmt": {
            let s = `if ${exprToAET(node.cond)}{${blockToAET(node.body)}}`;
            if (node.else_) {
                if (node.else_.kind === "IfStmt") {
                    s += `else ${nodeToAET(node.else_)}`;
                }
                else if (node.else_.kind === "BlockStmt") {
                    s += `else{${blockToAET(node.else_)}}`;
                }
            }
            return s;
        }
        case "ForStmt": {
            let header = "";
            if (node.init && node.post) {
                header = `${nodeToAET(node.init)};${node.cond ? exprToAET(node.cond) : ""};${nodeToAET(node.post)}`;
            }
            else if (node.cond) {
                header = exprToAET(node.cond);
            }
            return `for ${header}{${blockToAET(node.body)}}`;
        }
        case "RangeStmt": {
            const vars = [node.key || "_", node.value].filter(Boolean).join(",");
            return `for ${vars}:=range ${exprToAET(node.x)}{${blockToAET(node.body)}}`;
        }
        case "SwitchStmt": {
            const tag = node.tag ? ` ${exprToAET(node.tag)}` : "";
            const cases = node.cases.map(c => {
                if (c.values) {
                    return `case ${c.values.map(exprToAET).join(",")}:${c.body.map(nodeToAET).join(";")}`;
                }
                return `default:${c.body.map(nodeToAET).join(";")}`;
            }).join(";");
            return `switch${tag}{${cases}}`;
        }
        case "ShortDeclStmt":
            return `${node.names.join(",")}:=${node.values.map(exprToAET).join(",")}`;
        case "AssignStmt": {
            // Detect: s = append(s, x) -> s+=x
            if (node.op === "=" && node.lhs.length === 1 && node.rhs.length === 1) {
                const rhs = node.rhs[0];
                if (rhs.kind === "CallExpr" && rhs.func.kind === "Ident" && rhs.func.name === "append" && rhs.args.length >= 2) {
                    const target = exprToAET(node.lhs[0]);
                    const appendTarget = exprToAET(rhs.args[0]);
                    if (target === appendTarget) {
                        const elems = rhs.args.slice(1).map(exprToAET).join(",");
                        return `${target}+=${elems}`;
                    }
                }
            }
            return `${node.lhs.map(exprToAET).join(",")}${node.op}${node.rhs.map(exprToAET).join(",")}`;
        }
        case "ExprStmt":
            return exprToAET(node.expr);
        case "IncDecStmt":
            return `${exprToAET(node.x)}${node.op}`;
        case "DeferStmt":
            return `defer ${exprToAET(node.call)}`;
        case "GoStmt":
            return `go ${exprToAET(node.call)}`;
        case "SendStmt":
            return `${exprToAET(node.chan)}<-${exprToAET(node.value)}`;
        case "BranchStmt":
            return node.tok === "fallthrough" ? "ft" : node.tok;
        case "VarDecl": {
            let s = `var ${node.name}`;
            if (node.type)
                s += `:${shortenType(node.type.name)}`;
            if (node.value)
                s += `=${exprToAET(node.value)}`;
            return s;
        }
        case "ConstDecl":
            return `const(${node.specs.map(s => `${s.name}${s.value ? `=${exprToAET(s.value)}` : ""}`).join(";")})`;
        default:
            return `/* ${node.kind} */`;
    }
}
function blockToAET(block) {
    return block.stmts.map(nodeToAET).join(";");
}
function exprToAET(expr) {
    switch (expr.kind) {
        case "Ident": return expr.name;
        case "BasicLit": return expr.value;
        case "CompositeLit":
            return `${expr.type ? exprToAET(expr.type) : ""}{${expr.elts.map(exprToAET).join(",")}}`;
        case "BinaryExpr":
            return `${exprToAET(expr.left)}${expr.op}${exprToAET(expr.right)}`;
        case "UnaryExpr":
            return `${expr.op}${exprToAET(expr.x)}`;
        case "CallExpr": {
            // len(x) -> #x
            if (expr.func.kind === "Ident" && expr.func.name === "len" && expr.args.length === 1) {
                return `#${exprToAET(expr.args[0])}`;
            }
            return `${exprToAET(expr.func)}(${expr.args.map(exprToAET).join(",")})`;
        }
        case "SelectorExpr":
            return `${exprToAET(expr.x)}.${expr.sel}`;
        case "IndexExpr":
            return `${exprToAET(expr.x)}[${exprToAET(expr.index)}]`;
        case "SliceExpr":
            return `${exprToAET(expr.x)}[${expr.low ? exprToAET(expr.low) : ""}:${expr.high ? exprToAET(expr.high) : ""}]`;
        case "StarExpr":
            return `*${exprToAET(expr.x)}`;
        case "UnaryRecvExpr":
            return `<-${exprToAET(expr.x)}`;
        case "ParenExpr":
            return `(${exprToAET(expr.x)})`;
        case "KeyValueExpr":
            return `${exprToAET(expr.key)}:${exprToAET(expr.value)}`;
        case "FuncLit":
            return `{${expr.params.map(p => p.name).join(",")}|${blockToAET(expr.body)}}`;
        case "TypeAssertExpr":
            return `${exprToAET(expr.x)}.(${expr.type.name})`;
        case "MapTypeExpr":
            return `map[${exprToAET(expr.key)}]${exprToAET(expr.value)}`;
        case "ArrayTypeExpr":
            return `[]${exprToAET(expr.elt)}`;
        case "ErrorPropExpr":
            return `${exprToAET(expr.x)}?${expr.wrap ? `!"${expr.wrap}"` : ""}`;
        case "PipeExpr":
            return `${exprToAET(expr.x)}|${expr.op}(${exprToAET(expr.fn)})`;
        default:
            return "_";
    }
}
