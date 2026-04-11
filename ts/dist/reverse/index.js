// Reverse transpiler: Go → IR → AET
// Uses the Go CLI parser (go-parser/main.go) to get JSON AST, then converts to IR, then to AET
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import * as IR from "../ir.js";
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
/**
 * Locate the go-parser binary. Search in order of preference:
 *   1. Relative to this module (ts/dist/reverse → ts → aieattoken/go-parser)
 *   2. Project root inferred from the module path
 *   3. cwd-relative fallback used by older code paths
 */
function findGoParserBinary() {
    try {
        const moduleDir = dirname(fileURLToPath(import.meta.url));
        const tsDir = resolve(moduleDir, "..", ".."); // ts/dist/reverse → ts
        const projectRoot = resolve(tsDir, ".."); // ts → aieattoken
        const candidates = [
            resolve(projectRoot, "go-parser", "goparser.exe"),
            resolve(projectRoot, "go-parser", "goparser"),
            resolve(tsDir, "go-parser", "goparser.exe"),
            resolve(tsDir, "go-parser", "goparser"),
            resolve(process.cwd(), "go-parser", "goparser.exe"),
            resolve(process.cwd(), "go-parser", "goparser"),
            resolve(process.cwd(), "..", "go-parser", "goparser.exe"),
            resolve(process.cwd(), "..", "go-parser", "goparser"),
        ];
        return candidates.find(p => existsSync(p));
    }
    catch {
        return undefined;
    }
}
// Parse a Go file using the Go CLI tool, return JSON AST
export function parseGoFile(goFilePath) {
    const parserPath = findGoParserBinary();
    if (!parserPath) {
        throw new Error("Failed to parse Go file: go-parser binary not found");
    }
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
    const recvList = node.Recv?.Fields || node.Recv?.List;
    if (recvList && recvList.length > 0) {
        const recv = recvList[0];
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
    // go-parser emits FieldList as `{Kind:"FieldList", Fields:[...]}` — the
    // internal list key is `Fields`, not Go's own `List`. Accept both just in
    // case an older dump format sneaks in.
    const list = fieldList?.Fields || fieldList?.List;
    if (!list)
        return [];
    const params = [];
    for (const field of list) {
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
    const list = results?.Fields || results?.List;
    if (!list)
        return [];
    return list.map((field) => convertTypeExpr(field.Type));
}
function convertTypeExpr(node) {
    if (!node)
        return IR.simpleType("interface{}");
    switch (node.Kind) {
        case "Ident": return IR.simpleType(node.Name || "interface{}");
        case "StarExpr": return IR.pointerType(convertTypeExpr(node.X));
        case "ArrayType": {
            // Go has two array shapes: `[]T` (slice) and `[N]T` (fixed array). The
            // go-parser emits both as `ArrayType`, distinguished by whether `Len`
            // is present. Preserving the length matters semantically — a fixed
            // `[101]bool` is not a nil slice and is the correct type for e.g.
            // `doors := [101]bool{}` in RosettaCode-style tests.
            const elt = convertTypeExpr(node.Elt);
            if (node.Len && node.Len.Value !== undefined) {
                return { name: `[${node.Len.Value}]${elt.name}`, isSlice: true, elementType: elt };
            }
            return IR.sliceType(elt);
        }
        case "MapType": return IR.mapType(convertTypeExpr(node.Key), convertTypeExpr(node.Value));
        case "ChanType": {
            const elt = convertTypeExpr(node.Value);
            return { name: "chan " + elt.name, isChan: true, elementType: elt };
        }
        case "SelectorExpr": {
            // Go-parser emits Sel as an Ident object `{Kind:"Ident", Name:"..."}`
            // — not a bare string. Extract the name safely.
            const pkg = node.X?.Name || "";
            const sel = (typeof node.Sel === "string" ? node.Sel : node.Sel?.Name) || "";
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
        const fieldList = typeNode.Fields?.Fields || typeNode.Fields?.List || [];
        for (const field of fieldList) {
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
        const methodList = typeNode.Methods?.Fields || typeNode.Methods?.List || [];
        for (const method of methodList) {
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
            // go-parser emits the assignment operator as `Token`, not `Tok`.
            // Accept both for backwards compatibility with older dumps.
            const tok = node.Token || node.Tok || "=";
            if (tok === ":=") {
                return { kind: "ShortDeclStmt", names: lhs.map(exprName), values: rhs, stmtIndex: 0 };
            }
            return { kind: "AssignStmt", lhs, rhs, op: tok, stmtIndex: 0 };
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
            return { kind: "IncDecStmt", x: convertExpr(node.X), op: (node.Token || node.Tok), stmtIndex: 0 };
        case "SendStmt":
            return { kind: "SendStmt", chan: convertExpr(node.Chan), value: convertExpr(node.Value), stmtIndex: 0 };
        case "BranchStmt":
            return { kind: "BranchStmt", tok: ((node.Token || node.Tok) || "break").toLowerCase(), stmtIndex: 0 };
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
    // go-parser emits BlockStmt with `Stmts`; accept legacy `List` too.
    const caseList = node.Body?.Stmts || node.Body?.List || [];
    const cases = caseList.map((c) => ({
        kind: "CaseClause",
        // An empty or missing List means this is the `default:` case. Keep the
        // `values` field undefined in that case so the reverse emitter prints
        // `default:` rather than `case :`.
        values: c.List && c.List.length > 0 ? c.List.map(convertExpr) : undefined,
        body: (c.Body || []).map(convertStmt).filter(Boolean),
    }));
    return { kind: "SwitchStmt", tag: node.Tag ? convertExpr(node.Tag) : undefined, cases, stmtIndex: 0 };
}
function convertSelectStmt(node) {
    const caseList = node.Body?.Stmts || node.Body?.List || [];
    const cases = caseList.map((c) => ({
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
            // go-parser emits the literal kind as `Token` (INT/FLOAT/STRING/CHAR).
            const typeMap = {
                INT: "INT", FLOAT: "FLOAT", STRING: "STRING", CHAR: "RUNE",
            };
            const kind = node.Token || node.Type || "STRING";
            return { kind: "BasicLit", type: typeMap[kind] || "STRING", value: node.Value || "" };
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
            // go-parser emits Sel as an Ident object — unwrap to its Name.
            const sel = (typeof node.Sel === "string" ? node.Sel : node.Sel?.Name) || "";
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
/**
 * Types that the forward transformer's inference can recover from body usage.
 * Keep this list conservative — any type NOT listed here forces the reverse
 * pipeline to emit an explicit annotation.
 */
function isInferableType(t) {
    const n = t.name;
    if (n === "int")
        return true;
    if (n === "string")
        return true;
    if (n === "bool")
        return true; // rarely used for params but safe default
    if (n === "[]int")
        return true;
    if (n === "[]string")
        return true;
    if (n === "[]byte")
        return true;
    if (n === "[]rune")
        return true;
    if (n === "[]bool")
        return true;
    if (n === "[][]int")
        return true;
    return false;
}
/**
 * Decide whether parameter type annotations can be dropped. Returns true only
 * when:
 *   1. Every parameter's type is in the forward-inferable set.
 *   2. Each non-`int` parameter has a disambiguating usage in the body that
 *      the forward inference will pick up. An `int` parameter is always safe
 *      to drop because `int` is the fallback default.
 */
function canElideParamTypes(params, body) {
    if (params.length === 0)
        return true;
    for (const p of params) {
        if (!isInferableType(p.type))
            return false;
        if (p.name === "_" || p.name.startsWith("_"))
            return false;
        // `int` is the fallback, always safe. Other types need a usage signal.
        if (p.type.name === "int")
            continue;
        if (!hasDisambiguatingUsage(p.name, p.type, body))
            return false;
    }
    return true;
}
/**
 * Walk the body checking for at least one usage of the parameter that clearly
 * points to its actual type. Mirrors the forward transformer's heuristics —
 * if this returns false, the forward will NOT be able to infer the param's
 * type correctly, so we must keep the annotation.
 */
function hasDisambiguatingUsage(name, type, block) {
    let found = false;
    // Collect "rune-like" locals: variables assigned from `p[i]`, `range p`,
    // or similar. Used to detect byte/rune comparisons that indirectly prove
    // the param is a string.
    const runeLikeLocals = new Set();
    function collectRuneLikeLocals(n) {
        if (!n)
            return;
        switch (n.kind) {
            case "BlockStmt":
                for (const s of n.stmts)
                    collectRuneLikeLocals(s);
                return;
            case "IfStmt": {
                const i = n;
                if (i.init)
                    collectRuneLikeLocals(i.init);
                collectRuneLikeLocals(i.body);
                if (i.else_)
                    collectRuneLikeLocals(i.else_);
                return;
            }
            case "ForStmt": {
                const f = n;
                if (f.init)
                    collectRuneLikeLocals(f.init);
                if (f.post)
                    collectRuneLikeLocals(f.post);
                collectRuneLikeLocals(f.body);
                return;
            }
            case "RangeStmt": {
                const r = n;
                if (isTarget(r.x)) {
                    if (r.key && r.key !== "_")
                        runeLikeLocals.add(r.key);
                    if (r.value && r.value !== "_")
                        runeLikeLocals.add(r.value);
                }
                collectRuneLikeLocals(r.body);
                return;
            }
            case "SwitchStmt": {
                const sw = n;
                for (const c of sw.cases)
                    for (const s of c.body)
                        collectRuneLikeLocals(s);
                return;
            }
            case "ShortDeclStmt": {
                const s = n;
                if (s.names.length === 1 && s.values.length === 1) {
                    const rhs = s.values[0];
                    if (exprIsFromStringParamChar(rhs)) {
                        runeLikeLocals.add(s.names[0]);
                    }
                }
                return;
            }
        }
    }
    function exprIsFromStringParamChar(e) {
        if (e.kind === "IndexExpr" && isTarget(e.x))
            return true;
        if (e.kind === "CallExpr") {
            const c = e;
            if (c.func.kind === "Ident") {
                const fn = c.func.name;
                if ((fn === "int" || fn === "byte" || fn === "rune") && c.args.length === 1) {
                    return exprIsFromStringParamChar(c.args[0]);
                }
            }
        }
        if (e.kind === "BinaryExpr") {
            const b = e;
            return exprIsFromStringParamChar(b.left) || exprIsFromStringParamChar(b.right);
        }
        if (e.kind === "ParenExpr")
            return exprIsFromStringParamChar(e.x);
        return false;
    }
    function isTarget(e) {
        return !!e && e.kind === "Ident" && e.name === name;
    }
    if (type.name === "string")
        collectRuneLikeLocals(block);
    function visitExpr(e) {
        if (!e || found)
            return;
        switch (e.kind) {
            case "CallExpr": {
                const c = e;
                // []rune(p), []byte(p) → string
                if (type.name === "string" && c.func.kind === "ArrayTypeExpr" &&
                    c.args.length === 1 && isTarget(c.args[0])) {
                    const eltName = c.func.elt?.name;
                    if (eltName === "rune" || eltName === "byte") {
                        found = true;
                        return;
                    }
                }
                // append(p, x) → slice
                if (type.isSlice && c.func.kind === "Ident" && c.func.name === "append" &&
                    c.args.length >= 1 && isTarget(c.args[0])) {
                    found = true;
                    return;
                }
                // Printf("... %s ...", p) → string
                if (type.name === "string" && c.func.kind === "SelectorExpr") {
                    const sel = c.func;
                    if (sel.x.kind === "Ident" && sel.x.name === "fmt" &&
                        (sel.sel === "Printf" || sel.sel === "Sprintf" || sel.sel === "Fprintf")) {
                        if (c.args.length > 0 && c.args[0].kind === "BasicLit") {
                            const fmtStr = (c.args[0].value || "").slice(1, -1);
                            const verbRe = /%[-+# 0]*[\d*]*(?:\.[\d*]+)?([sq])/g;
                            const verbs = [];
                            let m;
                            const allVerbRe = /%[-+# 0]*[\d*]*(?:\.[\d*]+)?([vTtbcdoOqxXUeEfFgGsp])/g;
                            let idx = 0;
                            while ((m = allVerbRe.exec(fmtStr)) !== null) {
                                if (m[1] === "s" || m[1] === "q")
                                    verbs.push(idx);
                                idx++;
                            }
                            for (const vi of verbs) {
                                if (isTarget(c.args[1 + vi])) {
                                    found = true;
                                    return;
                                }
                            }
                        }
                    }
                }
                for (const a of c.args)
                    visitExpr(a);
                visitExpr(c.func);
                return;
            }
            case "IndexExpr": {
                const ix = e;
                // For nested `[][]T`, require nested indexing evidence.
                if (type.name.startsWith("[][]")) {
                    if (ix.x.kind === "IndexExpr" && isTarget(ix.x.x)) {
                        found = true;
                        return;
                    }
                }
                else if (type.isSlice && isTarget(ix.x)) {
                    found = true;
                    return;
                }
                visitExpr(ix.x);
                visitExpr(ix.index);
                return;
            }
            case "BinaryExpr": {
                const b = e;
                // p[i] compared with rune-literal → string
                if (type.name === "string") {
                    if (b.left.kind === "IndexExpr" && isTarget(b.left.x) &&
                        b.right.kind === "BasicLit" && b.right.type === "RUNE") {
                        found = true;
                        return;
                    }
                    if (b.right.kind === "IndexExpr" && isTarget(b.right.x) &&
                        b.left.kind === "BasicLit" && b.left.type === "RUNE") {
                        found = true;
                        return;
                    }
                    // A local that was assigned from `p[i]` or range iteration, when
                    // compared with a rune literal, also proves `p` is a string.
                    if (b.left.kind === "Ident" && runeLikeLocals.has(b.left.name) &&
                        b.right.kind === "BasicLit" && b.right.type === "RUNE") {
                        found = true;
                        return;
                    }
                    if (b.right.kind === "Ident" && runeLikeLocals.has(b.right.name) &&
                        b.left.kind === "BasicLit" && b.left.type === "RUNE") {
                        found = true;
                        return;
                    }
                    // p compared with string literal → string
                    if (isTarget(b.left) && b.right.kind === "BasicLit" && b.right.type === "STRING") {
                        found = true;
                        return;
                    }
                    if (isTarget(b.right) && b.left.kind === "BasicLit" && b.left.type === "STRING") {
                        found = true;
                        return;
                    }
                }
                visitExpr(b.left);
                visitExpr(b.right);
                return;
            }
            case "UnaryExpr":
                visitExpr(e.x);
                return;
            case "ParenExpr":
                visitExpr(e.x);
                return;
            case "SliceExpr": {
                const s = e;
                if (type.isSlice && isTarget(s.x)) {
                    found = true;
                    return;
                }
                visitExpr(s.x);
                if (s.low)
                    visitExpr(s.low);
                if (s.high)
                    visitExpr(s.high);
                return;
            }
            case "SelectorExpr":
                visitExpr(e.x);
                return;
            case "CompositeLit":
                for (const el of e.elts)
                    visitExpr(el);
                return;
        }
    }
    function visit(n) {
        if (!n || found)
            return;
        switch (n.kind) {
            case "BlockStmt":
                for (const s of n.stmts)
                    visit(s);
                return;
            case "ExprStmt":
                visitExpr(n.expr);
                return;
            case "AssignStmt": {
                const a = n;
                for (const l of a.lhs) {
                    if (type.isSlice && l.kind === "IndexExpr" && isTarget(l.x)) {
                        found = true;
                        return;
                    }
                    visitExpr(l);
                }
                for (const r of a.rhs)
                    visitExpr(r);
                return;
            }
            case "ShortDeclStmt":
                for (const v of n.values)
                    visitExpr(v);
                return;
            case "IncDecStmt":
                visitExpr(n.x);
                return;
            case "ReturnStmt":
                for (const v of n.values)
                    visitExpr(v);
                return;
            case "IfStmt": {
                const i = n;
                if (i.init)
                    visit(i.init);
                visitExpr(i.cond);
                visit(i.body);
                if (i.else_)
                    visit(i.else_);
                return;
            }
            case "ForStmt": {
                const f = n;
                if (f.init)
                    visit(f.init);
                if (f.cond)
                    visitExpr(f.cond);
                if (f.post)
                    visit(f.post);
                visit(f.body);
                return;
            }
            case "RangeStmt": {
                const r = n;
                // Range is only a reliable signal for 1-D slices. Nested `[][]T`
                // types need separate evidence (nested index expressions), because
                // the forward inference cannot otherwise distinguish `[]int` from
                // `[][]int` when the only usage is `range p`.
                if (type.name.startsWith("[][]")) {
                    visit(r.body);
                    return;
                }
                if (type.isSlice && isTarget(r.x)) {
                    found = true;
                    return;
                }
                if (type.name === "string" && isTarget(r.x)) {
                    found = true;
                    return;
                }
                visit(r.body);
                return;
            }
            case "SwitchStmt": {
                const sw = n;
                if (sw.tag)
                    visitExpr(sw.tag);
                for (const c of sw.cases) {
                    if (c.values)
                        for (const v of c.values)
                            visitExpr(v);
                    for (const s of c.body)
                        visit(s);
                }
                return;
            }
            case "VarDecl": {
                const v = n;
                if (v.value)
                    visitExpr(v.value);
                return;
            }
        }
    }
    visit(block);
    return found;
}
/**
 * Decide whether the return type annotation can be dropped. True when the
 * body has exactly one value return path whose expression type is directly
 * inferrable by the forward transformer.
 *
 * We refuse to drop in these hazardous cases:
 *   - multiple returns (different arity, paranoid about tuple types)
 *   - non-inferable result type
 *   - the sole tail expression is a call to a non-type-conversion function
 *     whose return type the forward cannot derive from the call itself.
 *     Example: `caesarDecrypt(s,shift){^caesarEncrypt(s,26-shift)}` — the
 *     forward would default this to `int` because `caesarEncrypt` is an
 *     unknown symbol.
 */
function canElideReturnType(results, body) {
    if (results.length === 0)
        return true;
    if (results.length !== 1)
        return false;
    const ret = results[0];
    if (!isInferableType(ret) && ret.name !== "rune" && ret.name !== "byte")
        return false;
    // Check the tail: if it's an unresolvable call, keep the annotation.
    if (tailIsOpaqueCall(body))
        return false;
    return true;
}
/**
 * Returns true when every terminal branch of `block` ends in a ReturnStmt or
 * ExprStmt whose expression is a CallExpr that is NOT a type-conversion.
 * Such a tail yields no type signal for the forward inference — the forward
 * will fall back to `int` regardless of the real return type.
 */
function tailIsOpaqueCall(block) {
    if (block.stmts.length === 0)
        return false;
    const last = block.stmts[block.stmts.length - 1];
    if (last.kind === "ReturnStmt") {
        const vals = last.values;
        if (vals.length === 1)
            return isOpaqueCallExpr(vals[0]);
        return false;
    }
    if (last.kind === "ExprStmt") {
        return isOpaqueCallExpr(last.expr);
    }
    if (last.kind === "IfStmt") {
        const i = last;
        if (!tailIsOpaqueCall(i.body))
            return false;
        if (!i.else_)
            return true;
        if (i.else_.kind === "IfStmt")
            return tailIsOpaqueCall({ kind: "BlockStmt", stmts: [i.else_] });
        if (i.else_.kind === "BlockStmt")
            return tailIsOpaqueCall(i.else_);
        return false;
    }
    return false;
}
/** True if the expression is a CallExpr that isn't a Go type conversion. */
function isOpaqueCallExpr(e) {
    if (e.kind !== "CallExpr")
        return false;
    const c = e;
    if (c.func.kind === "ArrayTypeExpr")
        return false; // []byte(x), []rune(x)
    if (c.func.kind === "Ident") {
        const name = c.func.name;
        // Known type conversions yield their named type directly.
        if (name === "string" || name === "int" || name === "int64" || name === "int32" ||
            name === "byte" || name === "rune" || name === "float64" || name === "float32" ||
            name === "bool")
            return false;
        // Known builtins with inferable results.
        if (name === "len" || name === "cap")
            return false;
    }
    return true;
}
/**
 * Convert the last statement of a block (and every tail position in nested
 * branches) from an explicit ReturnStmt into an ExprStmt, so the reverse
 * output lets the forward transformer re-apply its implicit-return logic.
 *
 * We also walk *non-tail* inner if-statements whose body is a single-value
 * ReturnStmt — these match the forward's `convertSingleExprIfToReturn`
 * rewrite so we can drop the `^` marker and save tokens.
 *
 * The rewrite is shallow (non-mutating at the input level) — we return a new
 * block whose stmts array has the tail rewritten.
 */
function bodyWithImplicitReturns(block) {
    const stmts = block.stmts.slice();
    if (stmts.length === 0)
        return block;
    // First pass: non-tail positions. For every inner IfStmt whose body is a
    // single-value return, drop the explicit return so it emits as `{1}`.
    // The forward's convertSingleExprIfToReturn will convert it back to a
    // return when the enclosing function is value-returning.
    for (let i = 0; i < stmts.length - 1; i++) {
        stmts[i] = rewriteInnerImplicitReturns(stmts[i]);
    }
    // Second pass: the tail statement itself.
    const lastIdx = stmts.length - 1;
    const last = stmts[lastIdx];
    if (last.kind === "ReturnStmt") {
        const values = last.values;
        if (values.length === 1) {
            stmts[lastIdx] = { kind: "ExprStmt", expr: values[0], stmtIndex: 0 };
        }
    }
    else if (last.kind === "IfStmt") {
        stmts[lastIdx] = rewriteIfReturns(last);
    }
    else if (last.kind === "SwitchStmt") {
        stmts[lastIdx] = rewriteSwitchReturns(last);
    }
    return { kind: "BlockStmt", stmts };
}
/**
 * Recursively walk a non-tail statement looking for inner IfStmts whose body
 * is a single-value ReturnStmt, and rewrite them as bare ExprStmts.
 */
function rewriteInnerImplicitReturns(n) {
    if (!n)
        return n;
    switch (n.kind) {
        case "IfStmt": {
            const i = n;
            const body = rewriteSingleExprIfBody(i.body);
            let else_ = i.else_;
            if (else_) {
                if (else_.kind === "IfStmt")
                    else_ = rewriteInnerImplicitReturns(else_);
                else if (else_.kind === "BlockStmt") {
                    const blockStmts = else_.stmts.map(rewriteInnerImplicitReturns);
                    else_ = { kind: "BlockStmt", stmts: blockStmts };
                }
            }
            return { ...i, body, else_ };
        }
        case "ForStmt": {
            const f = n;
            const newBody = { kind: "BlockStmt", stmts: f.body.stmts.map(rewriteInnerImplicitReturns) };
            return { ...f, body: newBody };
        }
        case "RangeStmt": {
            const r = n;
            const newBody = { kind: "BlockStmt", stmts: r.body.stmts.map(rewriteInnerImplicitReturns) };
            return { ...r, body: newBody };
        }
        case "SwitchStmt": {
            const sw = n;
            const newCases = sw.cases.map(c => ({ ...c, body: c.body.map(rewriteInnerImplicitReturns) }));
            return { ...sw, cases: newCases };
        }
    }
    return n;
}
/**
 * If the given block has exactly one statement that is a single-value
 * ReturnStmt, replace it with a bare ExprStmt. This lets the reverse emit
 * `if cond { x }` instead of `if cond { ^x }`.
 */
function rewriteSingleExprIfBody(block) {
    if (block.stmts.length !== 1)
        return block;
    const only = block.stmts[0];
    if (only.kind !== "ReturnStmt")
        return block;
    const ret = only;
    if (ret.values.length !== 1)
        return block;
    return { kind: "BlockStmt", stmts: [{ kind: "ExprStmt", expr: ret.values[0], stmtIndex: 0 }] };
}
function rewriteIfReturns(ifStmt) {
    const body = bodyWithImplicitReturns(ifStmt.body);
    let else_ = ifStmt.else_;
    if (else_) {
        if (else_.kind === "IfStmt")
            else_ = rewriteIfReturns(else_);
        else if (else_.kind === "BlockStmt")
            else_ = bodyWithImplicitReturns(else_);
    }
    return { ...ifStmt, body, else_ };
}
function rewriteSwitchReturns(sw) {
    const cases = sw.cases.map(c => {
        if (c.body.length === 0)
            return c;
        const newBody = c.body.slice();
        const lastIdx = newBody.length - 1;
        const last = newBody[lastIdx];
        if (last.kind === "ReturnStmt" && last.values.length === 1) {
            newBody[lastIdx] = { kind: "ExprStmt", expr: last.values[0], stmtIndex: 0 };
        }
        return { ...c, body: newBody };
    });
    return { ...sw, cases };
}
function nodeToAET(node) {
    switch (node.kind) {
        case "FuncDecl": {
            let s = "";
            if (node.receiver) {
                s += `${shortenType(node.receiver.type.name)}.`;
            }
            // Determine whether we can drop parameter type annotations. The forward
            // transformer's inference handles the common patterns (int, []int,
            // string, [][]int) so dropping types is usually safe and saves tokens.
            // Do NOT drop types when:
            //   - any param is a complex type the inference can't recover
            //     (pointers, structs, interfaces, maps, chans, func types)
            //   - param name starts with "_" (unused, can't be inferred from body)
            //   - multiple params would conflict if all defaulted to int
            const canDropParamTypes = canElideParamTypes(node.params, node.body);
            s += `${node.name}(${node.params.map(p => {
                if (p.type.name === "interface{}")
                    return p.name;
                if (canDropParamTypes)
                    return p.name;
                return `${p.name}:${shortenType(p.type.name)}`;
            }).join(",")})`;
            // Determine if the return type can be elided. True when the tail
            // expression of the body is a value expression from which the forward
            // inference can derive the same return type — i.e. the body has no
            // bare call-statements (procedural mismatch), the tail is a bare expr,
            // and there are no `^` returns to early-return a different type.
            const canDropReturnType = canElideReturnType(node.results, node.body);
            if (node.results.length > 0 && !canDropReturnType) {
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
            // Apply implicit-return rewriting: if the last stmt is `ReturnStmt(x)`
            // with a single value expression, rewrite it as a bare ExprStmt so the
            // forward transformer's tail-implicit-return logic handles it.
            // Only safe when we're also dropping the return type.
            const body = canDropReturnType ? bodyWithImplicitReturns(node.body) : node.body;
            s += `{${blockToAET(body)}}`;
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
            // Detect `for i := 0; i < N; i++ { ... }` → `for i := 0..N { ... }`.
            // This saves 5+ tokens per loop, which is the single biggest per-test
            // source of compression in RosettaCode-style code.
            const rangeSugar = tryEmitDotDotFor(node);
            if (rangeSugar !== null)
                return rangeSugar;
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
            // Note: we used to emit `s = append(s, x)` as `s+=x`, but the forward
            // parser treats `+=` as a numeric PlusAssign. Without a separate
            // append-operator token it cannot distinguish slice-append from
            // numeric add, so the round-trip breaks. Emit the explicit `apl(...)`
            // builtin instead — costs only a few tokens per append.
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
            // Forward parser expects `var name type` (no colon between name and
            // type). Using a colon would parse as a KeyValueExpr and trip the
            // tokenizer. An explicit space after name disambiguates from Ident.
            let s = `var ${node.name}`;
            if (node.type)
                s += ` ${shortenType(node.type.name)}`;
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
/**
 * Recognize the canonical `for i := start; i < end; i++` pattern and emit
 * it as the compact `for i := start..end { ... }` AET sugar. The DotDot
 * range sugar is supported by the forward parser; see `isDotDotFor` in
 * parser/index.ts.
 *
 * Returns the sugared AET string, or `null` if the for-stmt doesn't match
 * the expected shape (in which case the caller falls back to the generic
 * three-clause emitter).
 */
function tryEmitDotDotFor(node) {
    if (!node.init || !node.cond || !node.post)
        return null;
    // init must be `i := startExpr`
    if (node.init.kind !== "ShortDeclStmt")
        return null;
    const init = node.init;
    if (init.names.length !== 1 || init.values.length !== 1)
        return null;
    const loopVar = init.names[0];
    const startExpr = init.values[0];
    // cond must be `i < endExpr`
    if (node.cond.kind !== "BinaryExpr")
        return null;
    const cond = node.cond;
    if (cond.op !== "<")
        return null;
    if (cond.left.kind !== "Ident" || cond.left.name !== loopVar)
        return null;
    const endExpr = cond.right;
    // post must be `i++`
    if (node.post.kind !== "IncDecStmt")
        return null;
    const post = node.post;
    if (post.op !== "++" || post.x.kind !== "Ident" || post.x.name !== loopVar)
        return null;
    return `for ${loopVar}:=${exprToAET(startExpr)}..${exprToAET(endExpr)}{${blockToAET(node.body)}}`;
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
            // len(x) -> #x (1 token → 2 tokens, depending on x)
            if (expr.func.kind === "Ident" && expr.func.name === "len" && expr.args.length === 1) {
                return `#${exprToAET(expr.args[0])}`;
            }
            // Abbreviate builtins: make→mk, append→apl, delete→dx, copy→cpy/cp,
            // new→nw. Each abbreviation is one cl100k_base token, usually shorter
            // than the canonical name in tokens.
            if (expr.func.kind === "Ident") {
                const builtinAbbr = {
                    make: "mk",
                    append: "apl",
                    delete: "dx",
                    copy: "cpy",
                    new: "nw",
                    cap: "cp",
                };
                const abbr = builtinAbbr[expr.func.name];
                if (abbr) {
                    return `${abbr}(${expr.args.map(exprToAET).join(",")})`;
                }
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
