// Transformer: Converts Chevrotain CST to IR nodes
// Also handles: stdlib alias expansion, import resolution, type inference
import * as IR from "../ir.js";
// Load stdlib aliases
import { readFileSync } from "fs";
import { resolve } from "path";
let aliasMap = {};
export function loadAliases(path) {
    try {
        const p = path || resolve(process.cwd(), "stdlib-aliases.json");
        const data = JSON.parse(readFileSync(p, "utf-8"));
        aliasMap = data.aliases || {};
    }
    catch { /* aliases optional */ }
}
// Collected imports during transformation
let collectedImports;
function addImport(pkg) {
    collectedImports.add(pkg);
}
function resolveAlias(name) {
    const entry = aliasMap[name];
    if (!entry)
        return null;
    addImport(entry.pkg);
    return { goFunc: entry.go, pkg: entry.pkg };
}
// Helper to extract token image from CST children
function tok(node, tokenName, idx = 0) {
    const tokens = node.children[tokenName];
    return tokens?.[idx]?.image;
}
function tokAll(node, tokenName) {
    const tokens = node.children[tokenName];
    return tokens?.map(t => t.image) || [];
}
function child(node, ruleName, idx = 0) {
    const nodes = node.children[ruleName];
    return nodes?.[idx];
}
function children(node, ruleName) {
    return node.children[ruleName] || [];
}
let stmtCounter = 0;
function nextStmtIndex() {
    return stmtCounter++;
}
// Main transform entry point
export function transform(cst) {
    collectedImports = new Set();
    stmtCounter = 0;
    const decls = transformProgram(cst);
    return {
        kind: "Program",
        package: "main",
        imports: Array.from(collectedImports).sort().map(p => ({ path: p })),
        decls,
        stmtIndex: 0,
    };
}
function transformProgram(node) {
    const decls = [];
    for (const tld of children(node, "topLevelDecl")) {
        const d = transformTopLevelDecl(tld);
        if (d)
            decls.push(d);
    }
    return decls;
}
function transformTopLevelDecl(node) {
    const sd = child(node, "structDecl");
    if (sd)
        return transformStructDecl(sd);
    const cd = child(node, "constDecl");
    if (cd)
        return transformConstDecl(cd);
    const vd = child(node, "varDecl");
    if (vd)
        return transformVarDecl(vd);
    const fd = child(node, "funcOrMethodDecl");
    if (fd)
        return transformFuncOrMethodDecl(fd);
    return null;
}
function transformStructDecl(node) {
    const name = tok(node, "Ident") || "";
    const si = nextStmtIndex();
    // Struct: @Name{fields}
    const fl = child(node, "fieldList");
    if (fl) {
        const fields = transformFieldList(fl);
        return { kind: "StructDecl", name, fields, stmtIndex: si };
    }
    // Interface: @Name[methods]
    const ml = child(node, "methodSigList");
    if (ml) {
        const methods = transformMethodSigList(ml);
        return { kind: "InterfaceDecl", name, methods, stmtIndex: si };
    }
    // Type alias: @Name=type
    const te = child(node, "typeExpr");
    if (te) {
        return { kind: "TypeAlias", name, underlying: transformTypeExpr(te), stmtIndex: si };
    }
    return { kind: "StructDecl", name, fields: [], stmtIndex: si };
}
function transformFieldList(node) {
    return children(node, "fieldDecl").map(fd => {
        const name = tok(fd, "Ident") || "";
        const te = child(fd, "typeExpr");
        const type = te ? transformTypeExpr(te) : IR.simpleType("interface{}");
        // Auto-generate JSON tag from field name
        const tag = name[0] >= "A" && name[0] <= "Z"
            ? `json:"${name[0].toLowerCase() + name.slice(1)}"`
            : undefined;
        return { name, type, tag };
    });
}
function transformMethodSigList(node) {
    return children(node, "methodSig").map(ms => {
        const name = tok(ms, "Ident") || "";
        const pl = child(ms, "paramList");
        const params = pl ? transformParamList(pl) : [];
        const rt = child(ms, "returnType");
        const results = rt ? transformReturnType(rt) : [];
        return { name, params, results };
    });
}
function transformFuncOrMethodDecl(node) {
    const idents = tokAll(node, "Ident");
    const si = nextStmtIndex();
    const hasDot = tok(node, "Dot") !== undefined;
    let name;
    let receiver;
    if (hasDot && idents.length >= 2) {
        // Method: TypeName.methodName
        const typeName = idents[0];
        name = idents[1];
        const recvName = typeName[0].toLowerCase();
        receiver = {
            name: recvName,
            type: IR.simpleType(typeName),
            pointer: true,
        };
    }
    else {
        name = idents[0] || "";
    }
    const pl = child(node, "paramList") || child(node, "paramList", 1);
    const params = pl ? transformParamList(pl) : [];
    const rt = child(node, "returnType") || child(node, "returnType", 1);
    const results = rt ? transformReturnType(rt) : [];
    const sl = child(node, "stmtList") || child(node, "stmtList", 1);
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
    // Check if the function returns error (for ? operator)
    // If body contains ErrorPropExpr and no explicit error return type, add it
    if (hasErrorProp(body) && !results.some(r => r.name === "error")) {
        results.push(IR.simpleType("error"));
    }
    return { kind: "FuncDecl", name, receiver, params, results, body, stmtIndex: si };
}
function hasErrorProp(block) {
    return JSON.stringify(block).includes('"ErrorPropExpr"');
}
function transformParamList(node) {
    return children(node, "param").map(p => {
        const name = tok(p, "Ident") || "_";
        const te = child(p, "typeExpr");
        const isVariadic = tok(p, "Ellipsis") !== undefined;
        let type = te ? transformTypeExpr(te) : IR.simpleType("interface{}");
        if (isVariadic) {
            type = { ...type, name: "..." + type.name };
        }
        return { name, type };
    });
}
function transformReturnType(node) {
    // Check for error sugar: ->!T means -> (T, error)
    if (tok(node, "Bang")) {
        const types = children(node, "typeExpr");
        if (types.length > 0) {
            return [...types.map(te => transformTypeExpr(te)), IR.simpleType("error")];
        }
        return [IR.simpleType("error")];
    }
    const types = children(node, "typeExpr");
    return types.map(te => transformTypeExpr(te));
}
function transformTypeExpr(node) {
    // Pointer: *type
    if (tok(node, "Star")) {
        const inner = child(node, "typeExpr");
        return inner ? IR.pointerType(transformTypeExpr(inner)) : IR.simpleType("*interface{}");
    }
    // Slice: []type
    if (tok(node, "LBrack") && tok(node, "RBrack")) {
        const inner = child(node, "typeExpr");
        return inner ? IR.sliceType(transformTypeExpr(inner)) : IR.sliceType(IR.simpleType("interface{}"));
    }
    // Map: map[K]V (also handle v1 abbreviation "Mp")
    if (tok(node, "Map") || tok(node, "Mp")) {
        const types = children(node, "typeExpr");
        const key = types[0] ? transformTypeExpr(types[0]) : IR.simpleType("string");
        const val = types[1] ? transformTypeExpr(types[1]) : IR.simpleType("interface{}");
        return IR.mapType(key, val);
    }
    // Func type (also handle v1 abbreviation "Fn")
    if (tok(node, "Fn")) {
        // Fn used as type keyword behaves like Func in type context
        const inner = child(node, "typeExpr");
        const elt = inner ? transformTypeExpr(inner) : IR.simpleType("interface{}");
        return IR.simpleType("func(" + elt.name + ")");
    }
    // Abbreviated numeric types
    if (tok(node, "F64"))
        return IR.simpleType("float64");
    if (tok(node, "I64"))
        return IR.simpleType("int64");
    if (tok(node, "F32"))
        return IR.simpleType("float32");
    if (tok(node, "I32"))
        return IR.simpleType("int32");
    if (tok(node, "I16"))
        return IR.simpleType("int16");
    if (tok(node, "I8"))
        return IR.simpleType("int8");
    if (tok(node, "U64"))
        return IR.simpleType("uint64");
    // Chan
    if (tok(node, "Chan")) {
        const inner = child(node, "typeExpr");
        const elt = inner ? transformTypeExpr(inner) : IR.simpleType("interface{}");
        return { name: "chan " + elt.name, isChan: true, elementType: elt };
    }
    // Named type: Ident or Ident.Ident
    const idents = tokAll(node, "Ident");
    if (idents.length === 2) {
        // Qualified: pkg.Type
        return IR.simpleType(idents[0] + "." + idents[1]);
    }
    if (idents.length === 1) {
        return IR.simpleType(idents[0]);
    }
    return IR.simpleType("interface{}");
}
function transformStmtList(node) {
    const stmts = [];
    for (const s of children(node, "stmt")) {
        const transformed = transformStmt(s);
        if (transformed)
            stmts.push(transformed);
    }
    return { kind: "BlockStmt", stmts };
}
function transformStmt(node) {
    const c = (name) => child(node, name);
    if (c("ifStmt"))
        return transformIfStmt(c("ifStmt"));
    if (c("forStmt"))
        return transformForStmt(c("forStmt"));
    if (c("switchStmt"))
        return transformSwitchStmt(c("switchStmt"));
    if (c("selectStmt"))
        return transformSelectStmt(c("selectStmt"));
    if (c("returnStmt"))
        return transformReturnStmt(c("returnStmt"));
    if (c("deferStmt"))
        return transformDeferStmt(c("deferStmt"));
    if (c("goStmt"))
        return transformGoStmt(c("goStmt"));
    if (c("branchStmt"))
        return transformBranchStmt(c("branchStmt"));
    if (c("varDecl"))
        return transformVarDecl(c("varDecl"));
    if (c("constDecl"))
        return transformConstDecl(c("constDecl"));
    if (c("simpleStmt"))
        return transformSimpleStmt(c("simpleStmt"));
    return null;
}
function transformIfStmt(node) {
    const si = nextStmtIndex();
    const exprs = children(node, "expr");
    const stmtLists = children(node, "stmtList");
    const cond = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident", name: "true" };
    const body = stmtLists[0] ? transformStmtList(stmtLists[0]) : { kind: "BlockStmt", stmts: [] };
    let else_;
    const elseIf = children(node, "ifStmt");
    if (elseIf.length > 0) {
        else_ = transformIfStmt(elseIf[0]);
    }
    else if (stmtLists.length > 1) {
        else_ = transformStmtList(stmtLists[1]);
    }
    // Handle init statement
    const simpleStmt = child(node, "simpleStmt");
    const init = simpleStmt ? transformSimpleStmt(simpleStmt) : undefined;
    return { kind: "IfStmt", init, cond, body, else_, stmtIndex: si };
}
function transformForStmt(node) {
    const si = nextStmtIndex();
    // DotDot range: for i:=start..end { ... }
    if (tok(node, "DotDot")) {
        const loopVar = tokAll(node, "Ident")[0] || "i";
        const exprs = children(node, "expr");
        const start = exprs[0] ? transformExpr(exprs[0]) : { kind: "BasicLit", type: "INT", value: "0" };
        const end = exprs[1] ? transformExpr(exprs[1]) : { kind: "BasicLit", type: "INT", value: "0" };
        const sl = children(node, "stmtList");
        const body = sl.length > 0 ? transformStmtList(sl[sl.length - 1]) : { kind: "BlockStmt", stmts: [] };
        // Expand to: for i := start; i < end; i++
        const init = { kind: "ShortDeclStmt", names: [loopVar], values: [start], stmtIndex: 0 };
        const cond = { kind: "BinaryExpr", left: { kind: "Ident", name: loopVar }, op: "<", right: end };
        const post = { kind: "IncDecStmt", x: { kind: "Ident", name: loopVar }, op: "++", stmtIndex: 0 };
        return { kind: "ForStmt", init, cond, post, body, stmtIndex: si };
    }
    // Range loop: for k, v := range expr { ... }
    // Support both "range" (v2) and "rng" (v1 abbreviation)
    if (tok(node, "Range") || tok(node, "Rng")) {
        const el = child(node, "exprList");
        const exprs = el ? children(el, "expr") : [];
        const keys = exprs.map(e => exprToString(transformExpr(e)));
        const rangeExpr = children(node, "expr");
        const x = rangeExpr[0] ? transformExpr(rangeExpr[0]) : { kind: "Ident", name: "_" };
        const sl = child(node, "stmtList") || child(node, "stmtList", 1);
        const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
        return {
            kind: "RangeStmt",
            key: keys[0] || "_",
            value: keys[1],
            x,
            body,
            stmtIndex: si,
        };
    }
    // Regular for loop
    const simpleStmts = children(node, "simpleStmt");
    const exprs = children(node, "expr");
    const sl = child(node, "stmtList") || child(node, "stmtList", 1);
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
    // Determine init, cond, post based on what we have
    let init;
    let cond;
    let post;
    if (simpleStmts.length >= 2) {
        init = transformSimpleStmt(simpleStmts[0]);
        post = transformSimpleStmt(simpleStmts[1]);
        cond = exprs[0] ? transformExpr(exprs[0]) : undefined;
    }
    else if (simpleStmts.length === 1 && exprs.length > 0) {
        init = transformSimpleStmt(simpleStmts[0]);
        cond = exprs[0] ? transformExpr(exprs[0]) : undefined;
    }
    else if (simpleStmts.length === 1) {
        // Could be just a condition (which was parsed as simpleStmt)
        cond = simpleStmtToExpr(simpleStmts[0]);
    }
    else if (exprs.length > 0) {
        cond = transformExpr(exprs[0]);
    }
    return { kind: "ForStmt", init, cond, post, body, stmtIndex: si };
}
function simpleStmtToExpr(node) {
    const el = child(node, "exprList");
    if (!el)
        return undefined;
    const exprs = children(el, "expr");
    return exprs[0] ? transformExpr(exprs[0]) : undefined;
}
function transformSwitchStmt(node) {
    const si = nextStmtIndex();
    const tagExpr = child(node, "expr");
    const tag = tagExpr ? transformExpr(tagExpr) : undefined;
    const cases = children(node, "caseClause").map(transformCaseClause);
    return { kind: "SwitchStmt", tag, cases, stmtIndex: si };
}
function transformCaseClause(node) {
    const isDefault = tok(node, "Default") !== undefined;
    const el = child(node, "exprList");
    const values = !isDefault && el ? children(el, "expr").map(transformExpr) : undefined;
    const sl = child(node, "stmtList") || child(node, "stmtList", 1);
    const body = sl ? transformStmtList(sl).stmts : [];
    return { kind: "CaseClause", values, body };
}
function transformSelectStmt(node) {
    const si = nextStmtIndex();
    const cases = children(node, "commClause").map(cc => {
        const isDefault = tok(cc, "Default") !== undefined;
        const ss = child(cc, "simpleStmt");
        const comm = !isDefault && ss ? transformSimpleStmt(ss) : undefined;
        const sl = child(cc, "stmtList") || child(cc, "stmtList", 1);
        const body = sl ? transformStmtList(sl).stmts : [];
        return { kind: "CommClause", comm: comm || undefined, body };
    });
    return { kind: "SelectStmt", cases, stmtIndex: si };
}
function transformReturnStmt(node) {
    const el = child(node, "exprList");
    const values = el ? children(el, "expr").map(transformExpr) : [];
    return { kind: "ReturnStmt", values, stmtIndex: nextStmtIndex() };
}
function transformDeferStmt(node) {
    const sl = child(node, "stmtList");
    if (sl) {
        // defer { body } → defer func() { body }()
        const funcLit = {
            kind: "FuncLit",
            params: [],
            results: [],
            body: transformStmtList(sl),
        };
        const call = { kind: "CallExpr", func: funcLit, args: [] };
        return { kind: "DeferStmt", call, stmtIndex: nextStmtIndex() };
    }
    const expr = child(node, "expr");
    return { kind: "DeferStmt", call: expr ? transformExpr(expr) : { kind: "Ident", name: "nil" }, stmtIndex: nextStmtIndex() };
}
function transformGoStmt(node) {
    const sl = child(node, "stmtList");
    if (sl) {
        // go { body } → go func() { body }()
        const funcLit = {
            kind: "FuncLit",
            params: [],
            results: [],
            body: transformStmtList(sl),
        };
        const call = { kind: "CallExpr", func: funcLit, args: [] };
        return { kind: "GoStmt", call, stmtIndex: nextStmtIndex() };
    }
    const expr = child(node, "expr");
    return { kind: "GoStmt", call: expr ? transformExpr(expr) : { kind: "Ident", name: "nil" }, stmtIndex: nextStmtIndex() };
}
function transformBranchStmt(node) {
    let t = "break";
    if (tok(node, "Break"))
        t = "break";
    if (tok(node, "Continue"))
        t = "continue";
    if (tok(node, "Fallthrough"))
        t = "fallthrough";
    if (tok(node, "Ft"))
        t = "fallthrough";
    return { kind: "BranchStmt", tok: t, stmtIndex: nextStmtIndex() };
}
function transformVarDecl(node) {
    const name = tok(node, "Ident") || "";
    const te = child(node, "typeExpr");
    const type = te ? transformTypeExpr(te) : undefined;
    const expr = child(node, "expr");
    const value = expr ? transformExpr(expr) : undefined;
    return { kind: "VarDecl", name, type, value, stmtIndex: nextStmtIndex() };
}
function transformConstDecl(node) {
    const idents = tokAll(node, "Ident");
    const exprs = children(node, "expr");
    const specs = idents.map((name, i) => ({
        name,
        value: exprs[i] ? transformExpr(exprs[i]) : undefined,
    }));
    return { kind: "ConstDecl", specs, stmtIndex: nextStmtIndex() };
}
function transformSimpleStmt(node) {
    const exprLists = children(node, "exprList");
    const si = nextStmtIndex();
    // Short declaration: exprList := exprList
    if (tok(node, "ShortDecl")) {
        const lhs = exprLists[0] ? children(exprLists[0], "expr").map(e => exprToString(transformExpr(e))) : [];
        const rhs = exprLists[1] ? children(exprLists[1], "expr").map(transformExpr) : [];
        return { kind: "ShortDeclStmt", names: lhs, values: rhs, stmtIndex: si };
    }
    // Assignment: exprList op= exprList
    const assignOps = ["Assign", "PlusAssign", "MinusAssign", "MulAssign", "DivAssign", "ModAssign"];
    for (const op of assignOps) {
        if (tok(node, op)) {
            const lhs = exprLists[0] ? children(exprLists[0], "expr").map(transformExpr) : [];
            const rhs = exprLists[1] ? children(exprLists[1], "expr").map(transformExpr) : [];
            const opMap = {
                Assign: "=", PlusAssign: "+=", MinusAssign: "-=",
                MulAssign: "*=", DivAssign: "/=", ModAssign: "%=",
            };
            return { kind: "AssignStmt", lhs, rhs, op: opMap[op] || "=", stmtIndex: si };
        }
    }
    // Inc/Dec
    if (tok(node, "Inc")) {
        const x = exprLists[0] ? transformExpr(children(exprLists[0], "expr")[0]) : { kind: "Ident", name: "x" };
        return { kind: "IncDecStmt", x, op: "++", stmtIndex: si };
    }
    if (tok(node, "Dec")) {
        const x = exprLists[0] ? transformExpr(children(exprLists[0], "expr")[0]) : { kind: "Ident", name: "x" };
        return { kind: "IncDecStmt", x, op: "--", stmtIndex: si };
    }
    // Channel send: expr <- expr
    if (tok(node, "ChanArrow")) {
        const ch = exprLists[0] ? transformExpr(children(exprLists[0], "expr")[0]) : { kind: "Ident", name: "ch" };
        const val = child(node, "expr");
        return { kind: "SendStmt", chan: ch, value: val ? transformExpr(val) : { kind: "Ident", name: "nil" }, stmtIndex: si };
    }
    // Expression statement
    if (exprLists[0]) {
        const exprs = children(exprLists[0], "expr");
        if (exprs.length === 1) {
            return { kind: "ExprStmt", expr: transformExpr(exprs[0]), stmtIndex: si };
        }
    }
    return { kind: "ExprStmt", expr: { kind: "Ident", name: "_" }, stmtIndex: si };
}
// Expression transformation
function transformExpr(node) {
    // Route based on CST rule name
    const name = node.name;
    switch (name) {
        case "expr": {
            const or1 = child(node, "orExpr");
            const or2 = child(node, "orExpr", 1);
            if (or1 && or2 && tok(node, "Colon")) {
                // Key-value expression
                return { kind: "KeyValueExpr", key: transformExpr(or1), value: transformExpr(or2) };
            }
            return or1 ? transformExpr(or1) : { kind: "Ident", name: "_" };
        }
        case "orExpr": return transformBinExpr(node, "andExpr", "LogOr", "||");
        case "andExpr": return transformBinExpr(node, "compareExpr", "LogAnd", "&&");
        case "compareExpr": return transformCompareExpr(node);
        case "addExpr": return transformAddExpr(node);
        case "mulExpr": return transformMulExpr(node);
        case "unaryExpr": return transformUnaryExpr(node);
        case "postfixExpr": return transformPostfixExpr(node);
        case "primaryExpr": return transformPrimaryExpr(node);
        default:
            return { kind: "Ident", name: "_unknown_" + name };
    }
}
function transformBinExpr(node, childRule, opToken, opStr) {
    const operands = children(node, childRule);
    let result = transformExpr(operands[0]);
    for (let i = 1; i < operands.length; i++) {
        result = { kind: "BinaryExpr", left: result, op: opStr, right: transformExpr(operands[i]) };
    }
    return result;
}
function transformCompareExpr(node) {
    const operands = children(node, "addExpr");
    if (operands.length === 1)
        return transformExpr(operands[0]);
    const ops = ["Eq", "Neq", "Lt", "Gt", "Leq", "Geq"];
    const opMap = { Eq: "==", Neq: "!=", Lt: "<", Gt: ">", Leq: "<=", Geq: ">=" };
    for (const op of ops) {
        if (tok(node, op)) {
            return { kind: "BinaryExpr", left: transformExpr(operands[0]), op: opMap[op], right: transformExpr(operands[1]) };
        }
    }
    return transformExpr(operands[0]);
}
function transformAddExpr(node) {
    const operands = children(node, "mulExpr");
    let result = transformExpr(operands[0]);
    const opTokens = [...(node.children["Plus"] || []),
        ...(node.children["Minus"] || []),
        ...(node.children["Pipe"] || []),
        ...(node.children["Caret"] || [])];
    opTokens.sort((a, b) => a.startOffset - b.startOffset);
    for (let i = 1; i < operands.length; i++) {
        const op = opTokens[i - 1]?.image || "+";
        result = { kind: "BinaryExpr", left: result, op, right: transformExpr(operands[i]) };
    }
    return result;
}
function transformMulExpr(node) {
    const operands = children(node, "unaryExpr");
    let result = transformExpr(operands[0]);
    const opTokens = [...(node.children["Star"] || []),
        ...(node.children["Slash"] || []),
        ...(node.children["Percent"] || []),
        ...(node.children["Shl"] || []),
        ...(node.children["Shr"] || []),
        ...(node.children["Amp"] || [])];
    opTokens.sort((a, b) => a.startOffset - b.startOffset);
    for (let i = 1; i < operands.length; i++) {
        const op = opTokens[i - 1]?.image || "*";
        result = { kind: "BinaryExpr", left: result, op, right: transformExpr(operands[i]) };
    }
    return result;
}
function transformUnaryExpr(node) {
    // Hash (#) as len() sugar
    if (tok(node, "Hash")) {
        const inner = child(node, "unaryExpr");
        const x = inner ? transformExpr(inner) : { kind: "Ident", name: "_" };
        return { kind: "CallExpr", func: { kind: "Ident", name: "len" }, args: [x] };
    }
    const inner = child(node, "unaryExpr");
    if (inner) {
        const ops = ["Plus", "Minus", "Bang", "Star", "Amp", "ChanArrow"];
        for (const op of ops) {
            if (tok(node, op)) {
                const opMap = { Plus: "+", Minus: "-", Bang: "!", Star: "*", Amp: "&", ChanArrow: "<-" };
                if (op === "ChanArrow") {
                    return { kind: "UnaryRecvExpr", x: transformExpr(inner) };
                }
                if (op === "Star") {
                    return { kind: "StarExpr", x: transformExpr(inner) };
                }
                return { kind: "UnaryExpr", op: opMap[op], x: transformExpr(inner) };
            }
        }
    }
    const pf = child(node, "postfixExpr");
    if (pf)
        return transformExpr(pf);
    return { kind: "Ident", name: "_" };
}
function transformPostfixExpr(node) {
    let result = transformExpr(child(node, "primaryExpr"));
    // Process postfix operations in order using token offsets
    // This is complex due to multiple possible postfix ops
    // We need to process them left-to-right
    // Collect all postfix operation tokens with their positions
    const ops = [];
    // Call expressions: LParen
    const lparens = node.children["LParen"] || [];
    for (let i = 0; i < lparens.length; i++) {
        ops.push({ type: "call", offset: lparens[i].startOffset });
    }
    // Composite literal: LBrace (from postfix, after identifier)
    const lbraces = node.children["LBrace"] || [];
    for (const lb of lbraces) {
        ops.push({ type: "composite", offset: lb.startOffset });
    }
    // Selector: Dot + Ident
    const dots = node.children["Dot"] || [];
    for (const dot of dots) {
        ops.push({ type: "selector", offset: dot.startOffset });
    }
    // Index/Slice: LBrack
    const lbracks = node.children["LBrack"] || [];
    for (const lb of lbracks) {
        ops.push({ type: "index", offset: lb.startOffset });
    }
    // Error prop: Question or QuestionBang
    const questions = node.children["Question"] || [];
    for (const q of questions) {
        ops.push({ type: "errorProp", offset: q.startOffset });
    }
    const qbangs = node.children["QuestionBang"] || [];
    for (const qb of qbangs) {
        ops.push({ type: "errorWrap", offset: qb.startOffset });
    }
    // Pipe: Pipe + Map/Filter
    const pipes = node.children["Pipe"] || [];
    for (const p of pipes) {
        ops.push({ type: "pipe", offset: p.startOffset });
    }
    ops.sort((a, b) => a.offset - b.offset);
    // Now apply each operation
    let callIdx = 0, selIdx = 0, idxIdx = 0, qIdx = 0, qbIdx = 0, pipeIdx = 0;
    const exprLists = children(node, "exprList");
    const identTokens = node.children["Ident"] || [];
    const typeExprs = children(node, "typeExpr");
    const stringLits = node.children["StringLit"] || [];
    for (const op of ops) {
        switch (op.type) {
            case "call": {
                const el = exprLists[callIdx];
                const args = el ? children(el, "expr").map(transformExpr) : [];
                const hasEllipsis = tok(node, "Ellipsis") !== undefined;
                result = { kind: "CallExpr", func: result, args, ellipsis: hasEllipsis || undefined };
                callIdx++;
                break;
            }
            case "composite": {
                // Composite literal: Type{elts...}
                const allExprs = children(node, "expr");
                // The composite literal expressions follow the primary expr's expressions
                const elts = [];
                // Gather expressions that belong to this composite literal
                // They're after the call expressions
                for (let ei = callIdx; ei < allExprs.length; ei++) {
                    const transformed = transformExpr(allExprs[ei]);
                    elts.push(transformed);
                }
                result = { kind: "CompositeLit", type: result, elts };
                break;
            }
            case "selector": {
                // Check if it's a type assertion: .(Type)
                if (typeExprs.length > selIdx) {
                    result = { kind: "TypeAssertExpr", x: result, type: transformTypeExpr(typeExprs[selIdx]) };
                }
                else if (identTokens.length > selIdx) {
                    const sel = identTokens[selIdx].image;
                    // Check if this identifier is a stdlib alias
                    const alias = resolveAlias(sel);
                    if (alias && result.kind === "Ident") {
                        // This shouldn't happen for selectors, but handle it
                    }
                    result = { kind: "SelectorExpr", x: result, sel };
                }
                selIdx++;
                break;
            }
            case "index": {
                // Simplified: just use the expressions available
                const innerExprs = children(node, "expr");
                if (tok(node, "Colon")) {
                    // Slice expression
                    result = { kind: "SliceExpr", x: result };
                }
                else if (innerExprs.length > idxIdx) {
                    result = { kind: "IndexExpr", x: result, index: transformExpr(innerExprs[idxIdx]) };
                }
                idxIdx++;
                break;
            }
            case "errorProp":
                result = { kind: "ErrorPropExpr", x: result };
                qIdx++;
                break;
            case "errorWrap":
                const msg = stringLits[qbIdx]?.image || '""';
                result = { kind: "ErrorPropExpr", x: result, wrap: msg.slice(1, -1) };
                qbIdx++;
                break;
            case "pipe": {
                const maps = node.children["Map"] || [];
                const filters = node.children["Filter"] || [];
                const pipeExprs = children(node, "expr");
                let pipeOp = "map";
                // Determine which pipe op based on position
                if (filters.length > 0)
                    pipeOp = "filter";
                const fnExpr = pipeExprs[pipeExprs.length - 1];
                const fn = fnExpr ? transformExpr(fnExpr) : { kind: "Ident", name: "_" };
                result = { kind: "PipeExpr", x: result, op: pipeOp, fn };
                pipeIdx++;
                break;
            }
        }
    }
    return result;
}
function transformPrimaryExpr(node) {
    // Parenthesized
    const innerExpr = child(node, "expr");
    if (innerExpr && tok(node, "LParen")) {
        return { kind: "ParenExpr", x: transformExpr(innerExpr) };
    }
    // Lambda: { params | body }
    const pl = child(node, "paramList");
    if (pl && tok(node, "Pipe")) {
        const params = transformParamList(pl);
        const sl = child(node, "stmtList");
        const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
        return { kind: "FuncLit", params, results: [], body };
    }
    // Composite literal: Ident { kvExprs }
    const compLit = child(node, "compositeLit");
    if (compLit) {
        const typeName = tok(compLit, "Ident") || "";
        const alias = resolveAlias(typeName);
        const typeExpr = alias
            ? { kind: "SelectorExpr", x: { kind: "Ident", name: alias.goFunc.split(".")[0] }, sel: alias.goFunc.split(".")[1] }
            : { kind: "Ident", name: typeName };
        const lb = child(compLit, "litBody");
        const elts = lb ? transformLitBody(lb) : [];
        return { kind: "CompositeLit", type: typeExpr, elts };
    }
    // Builtins
    for (const b of ["Make", "Append", "Len", "Cap", "Delete", "Copy", "New"]) {
        if (tok(node, b))
            return { kind: "Ident", name: b.toLowerCase() };
    }
    // Func literal
    if (tok(node, "Func")) {
        const pl2 = child(node, "paramList");
        const params = pl2 ? transformParamList(pl2) : [];
        const rt = child(node, "returnType");
        const results = rt ? transformReturnType(rt) : [];
        const sl = child(node, "stmtList");
        const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
        return { kind: "FuncLit", params, results, body };
    }
    // Literals
    const strLit = tok(node, "StringLit");
    if (strLit)
        return { kind: "BasicLit", type: "STRING", value: strLit };
    const rawStr = tok(node, "RawStringLit");
    if (rawStr)
        return { kind: "BasicLit", type: "STRING", value: rawStr };
    const runeLit = tok(node, "RuneLit");
    if (runeLit)
        return { kind: "BasicLit", type: "RUNE", value: runeLit };
    const floatLit = tok(node, "FloatLit");
    if (floatLit)
        return { kind: "BasicLit", type: "FLOAT", value: floatLit };
    for (const intType of ["HexLit", "OctLit", "BinLit", "IntLit"]) {
        const v = tok(node, intType);
        if (v)
            return { kind: "BasicLit", type: "INT", value: v };
    }
    if (tok(node, "True"))
        return { kind: "Ident", name: "true" };
    if (tok(node, "False"))
        return { kind: "Ident", name: "false" };
    if (tok(node, "Nil"))
        return { kind: "Ident", name: "nil" };
    // Map type expression or literal
    if (tok(node, "Map")) {
        const types = children(node, "typeExpr");
        const key = types[0] ? transformTypeExpr(types[0]) : IR.simpleType("string");
        const val = types[1] ? transformTypeExpr(types[1]) : IR.simpleType("interface{}");
        const typeExpr = { kind: "MapTypeExpr", key: { kind: "Ident", name: key.name }, value: { kind: "Ident", name: val.name } };
        // Check for literal body
        const lb = child(node, "litBody");
        if (lb) {
            const elts = transformLitBody(lb);
            return { kind: "CompositeLit", type: typeExpr, elts };
        }
        return typeExpr;
    }
    // Slice type expression or literal
    if (tok(node, "LBrack") && tok(node, "RBrack")) {
        const te = child(node, "typeExpr");
        const elt = te ? transformTypeExpr(te) : IR.simpleType("interface{}");
        const typeExpr = { kind: "ArrayTypeExpr", elt: { kind: "Ident", name: elt.name } };
        const lb = child(node, "litBody");
        if (lb) {
            const elts = transformLitBody(lb);
            return { kind: "CompositeLit", type: typeExpr, elts };
        }
        return typeExpr;
    }
    // Identifier — check for stdlib alias
    const ident = tok(node, "Ident");
    if (ident) {
        const alias = resolveAlias(ident);
        if (alias) {
            // Expand alias: e.g., "pl" → "fmt.Println"
            const parts = alias.goFunc.split(".");
            if (parts.length === 2) {
                return { kind: "SelectorExpr", x: { kind: "Ident", name: parts[0] }, sel: parts[1] };
            }
            return { kind: "Ident", name: alias.goFunc };
        }
        return { kind: "Ident", name: ident };
    }
    return { kind: "Ident", name: "_" };
}
function transformLitBody(node) {
    return children(node, "kvExpr").map(transformKvExpr);
}
function transformKvExpr(node) {
    const exprs = children(node, "expr");
    if (exprs.length === 2 && tok(node, "Colon")) {
        // Key: value
        return { kind: "KeyValueExpr", key: transformExpr(exprs[0]), value: transformExpr(exprs[1]) };
    }
    if (exprs.length >= 1) {
        return transformExpr(exprs[0]);
    }
    return { kind: "Ident", name: "_" };
}
function exprToString(expr) {
    switch (expr.kind) {
        case "Ident": return expr.name;
        case "SelectorExpr": return exprToString(expr.x) + "." + expr.sel;
        default: return "_";
    }
}
