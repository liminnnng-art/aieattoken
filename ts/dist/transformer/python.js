// Transformer: Converts AET-Python Chevrotain CST to IR nodes
// Handles: class/func declarations, decorators, slots, self-attr sugar (.attr → self.attr),
// lambda (|params|expr), return (^expr), @main block, @dc class, alias expansion,
// import tracking, Python-specific nodes (Py_*), match/case, try/except, with, comprehensions.
import { readFileSync } from "fs";
import { resolve } from "path";
let stdlibAliases = {};
let popularAliases = {};
export function loadPythonAliases(path) {
    // Load stdlib aliases
    try {
        const stdlibPath = path || resolve(process.cwd(), "stdlib-aliases-python.json");
        const data = JSON.parse(readFileSync(stdlibPath, "utf-8"));
        stdlibAliases = data.aliases || {};
    }
    catch { /* aliases optional */ }
    // Load popular aliases from same directory
    try {
        const dir = path ? resolve(path, "..") : process.cwd();
        const popPath = resolve(dir, "popular-aliases-python.json");
        const data = JSON.parse(readFileSync(popPath, "utf-8"));
        popularAliases = data.aliases || {};
    }
    catch { /* popular aliases optional */ }
}
// ─── Module-level state ──────────────────────────────────────────────────────
let collectedImports;
let collectedFromImports;
let collectedRawFromImports;
let stmtCounter;
function addImport(pkg) {
    if (pkg === "builtins")
        return;
    collectedImports.add(pkg);
}
function addFromImport(module, name) {
    if (module === "builtins")
        return;
    if (!collectedFromImports.has(module)) {
        collectedFromImports.set(module, new Set());
    }
    collectedFromImports.get(module).add(name);
}
function addRawFromImport(raw) {
    collectedRawFromImports.add(raw);
}
function nextStmtIndex() {
    return stmtCounter++;
}
// ─── Alias resolution ────────────────────────────────────────────────────────
function resolveAlias(name) {
    const stdlib = stdlibAliases[name];
    if (stdlib) {
        if (stdlib.auto) {
            // builtins — no import needed
        }
        else if (stdlib.fromImport) {
            addRawFromImport(stdlib.fromImport);
        }
        else {
            addImport(stdlib.pkg);
        }
        return stdlib;
    }
    const popular = popularAliases[name];
    if (popular) {
        addImport(popular.pkg);
        return popular;
    }
    return null;
}
// ─── CST helper functions ────────────────────────────────────────────────────
function tok(node, tokenName, idx = 0) {
    const tokens = node.children[tokenName];
    return tokens?.[idx]?.image;
}
function tokAll(node, tokenName) {
    const tokens = node.children[tokenName];
    return tokens?.map(t => t.image) || [];
}
function tokToken(node, tokenName, idx = 0) {
    const tokens = node.children[tokenName];
    return tokens?.[idx];
}
function tokTokens(node, tokenName) {
    return node.children[tokenName] || [];
}
function child(node, ruleName, idx = 0) {
    const nodes = node.children[ruleName];
    return nodes?.[idx];
}
function children(node, ruleName) {
    return node.children[ruleName] || [];
}
// ─── Main entry point ────────────────────────────────────────────────────────
export function transformPython(cst) {
    collectedImports = new Set();
    collectedFromImports = new Map();
    collectedRawFromImports = new Set();
    stmtCounter = 0;
    const decls = transformProgram(cst);
    // Build import list
    const imports = [];
    for (const pkg of Array.from(collectedImports).sort()) {
        imports.push({ path: pkg });
    }
    for (const raw of Array.from(collectedRawFromImports).sort()) {
        imports.push({ path: raw });
    }
    for (const [mod, names] of Array.from(collectedFromImports.entries()).sort()) {
        const sorted = Array.from(names).sort().join(", ");
        imports.push({ path: `from ${mod} import ${sorted}` });
    }
    return {
        kind: "Program",
        package: "main",
        imports,
        decls,
        stmtIndex: 0,
    };
}
// ─── Program ─────────────────────────────────────────────────────────────────
function transformProgram(node) {
    const decls = [];
    for (const tls of children(node, "topLevelStmt")) {
        const d = transformTopLevelStmt(tls);
        if (d)
            decls.push(d);
    }
    return decls;
}
// ─── Top-level Statements ────────────────────────────────────────────────────
function transformTopLevelStmt(node) {
    const dm = child(node, "decoratedDefOrMain");
    if (dm)
        return transformDecoratedDefOrMain(dm);
    const cd = child(node, "classDecl");
    if (cd)
        return transformClassDecl(cd, []);
    const as_ = child(node, "asyncStmt");
    if (as_)
        return transformAsyncStmt(as_);
    const ifs = child(node, "ifStmt");
    if (ifs)
        return transformIfStmt(ifs);
    const fors = child(node, "forStmt");
    if (fors)
        return transformForStmt(fors, false);
    const ws = child(node, "whileStmt");
    if (ws)
        return transformWhileStmt(ws);
    const ts = child(node, "tryStmt");
    if (ts)
        return transformTryStmt(ts);
    const ms = child(node, "matchStmt");
    if (ms)
        return transformMatchStmt(ms);
    const withs = child(node, "withStmt");
    if (withs)
        return transformWithStmt(withs, false);
    const asserts = child(node, "assertStmt");
    if (asserts)
        return transformAssertStmt(asserts);
    const dels = child(node, "delStmt");
    if (dels)
        return transformDelStmt(dels);
    const gs = child(node, "globalStmt");
    if (gs)
        return transformGlobalStmt(gs);
    const nls = child(node, "nonlocalStmt");
    if (nls)
        return transformNonlocalStmt(nls);
    const rs = child(node, "raiseStmt");
    if (rs)
        return transformRaiseStmt(rs);
    const fd = child(node, "funcDef");
    if (fd)
        return transformFuncDef(fd, [], false);
    const aes = child(node, "assignOrExprStmt");
    if (aes)
        return transformAssignOrExprStmt(aes);
    return null;
}
// ─── Decorated Definitions & @main ───────────────────────────────────────────
function transformDecoratedDefOrMain(node) {
    const mb = child(node, "mainBlock");
    if (mb)
        return transformMainBlock(mb);
    const dd = child(node, "decoratedDef");
    if (dd)
        return transformDecoratedDef(dd);
    return null;
}
function transformMainBlock(node) {
    const sl = child(node, "stmtList");
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
    // Represent as an if __name__ == "__main__" block
    const cond = {
        kind: "BinaryExpr",
        left: { kind: "Ident", name: "__name__" },
        op: "==",
        right: { kind: "BasicLit", type: "STRING", value: '"__main__"' },
    };
    return {
        kind: "IfStmt",
        cond,
        body,
        stmtIndex: nextStmtIndex(),
    };
}
function transformDecoratedDef(node) {
    // Collect decorators
    const decorators = collectDecorators(node);
    const isAsync = tok(node, "Async") !== undefined;
    const cd = child(node, "classDecl");
    if (cd)
        return transformClassDecl(cd, decorators);
    const fd = child(node, "funcDef");
    if (fd)
        return transformFuncDef(fd, decorators, isAsync);
    // funcDef at index 1 (second alternative)
    const fd2 = child(node, "funcDef", 1);
    if (fd2)
        return transformFuncDef(fd2, decorators, isAsync);
    return null;
}
function collectDecorators(node) {
    const decoExprs = children(node, "decoratorExpr");
    return decoExprs.map(de => {
        const expr = transformDecoratorExpr(de);
        return { expr };
    });
}
function transformDecoratorExpr(node) {
    const idents = tokAll(node, "Ident");
    let expr;
    if (idents.length === 0) {
        expr = { kind: "Ident", name: "_" };
    }
    else {
        // Resolve decorator abbreviations
        const firstName = idents[0];
        // Check if it's a known abbreviation like "dc" for "dataclass"
        if (firstName === "dc") {
            addRawFromImport("from dataclasses import dataclass");
            expr = { kind: "Ident", name: "dataclass" };
        }
        else {
            expr = { kind: "Ident", name: firstName };
        }
        // Build dotted name: e.g., functools.wraps
        for (let i = 1; i < idents.length; i++) {
            expr = { kind: "SelectorExpr", x: expr, sel: idents[i] };
        }
    }
    // Check for call args: @decorator(args)
    const al = child(node, "argList");
    if (al) {
        const args = transformArgList(al);
        expr = { kind: "CallExpr", func: expr, args };
    }
    else if (tok(node, "LParen") !== undefined) {
        // Empty parens: @decorator()
        expr = { kind: "CallExpr", func: expr, args: [] };
    }
    return expr;
}
// ─── Class Declaration ───────────────────────────────────────────────────────
function transformClassDecl(node, decorators) {
    const name = tok(node, "Ident") || "";
    const si = nextStmtIndex();
    // Base classes and keywords from argList
    const bases = [];
    const keywords = [];
    const al = child(node, "argList");
    if (al) {
        const args = children(al, "arg");
        for (const a of args) {
            // Keyword arg in bases: metaclass=Meta
            const idents = tokAll(a, "Ident");
            // Simple heuristic: check for = sign at top-level
            // Since arg rule is: ** expr | * expr | expr, and keyword is handled as
            // ident=expr within the expression itself, we need a simpler approach
            const expr = child(a, "expr");
            if (expr) {
                bases.push(transformExpr(expr));
            }
        }
    }
    // Class body
    const cb = child(node, "classBody");
    const body = cb ? transformClassBody(cb) : [];
    return {
        kind: "Py_ClassDecl",
        name,
        bases,
        keywords,
        decorators,
        body,
        stmtIndex: si,
    };
}
function transformClassBody(node) {
    const members = [];
    for (const cm of children(node, "classMember")) {
        const m = transformClassMember(cm);
        if (m)
            members.push(m);
    }
    return members;
}
function transformClassMember(node) {
    const dd = child(node, "decoratedDef");
    if (dd)
        return transformDecoratedDef(dd);
    const cd = child(node, "classDecl");
    if (cd)
        return transformClassDecl(cd, []);
    const sd = child(node, "slotsDecl");
    if (sd)
        return transformSlotsDecl(sd);
    const fd = child(node, "funcDef");
    if (fd)
        return transformFuncDef(fd, [], false);
    const aes = child(node, "assignOrExprStmt");
    if (aes)
        return transformAssignOrExprStmt(aes);
    return null;
}
function transformSlotsDecl(node) {
    const il = child(node, "identList");
    const names = il ? tokAll(il, "Ident") : [];
    // Represent as __slots__ = ('name1', 'name2', ...)
    const tupleElts = names.map(n => ({
        kind: "BasicLit",
        type: "STRING",
        value: `'${n}'`,
    }));
    const slotsExpr = { kind: "Py_TupleExpr", elts: tupleElts };
    return {
        kind: "AssignStmt",
        lhs: [{ kind: "Ident", name: "__slots__" }],
        rhs: [slotsExpr],
        op: "=",
        stmtIndex: nextStmtIndex(),
    };
}
// ─── Function Definition ─────────────────────────────────────────────────────
function transformFuncDef(node, decorators, isAsync) {
    const name = tok(node, "Ident") || "";
    const si = nextStmtIndex();
    // Parameters
    const pl = child(node, "paramList");
    const paramList = pl ? transformPyParamList(pl) : { params: [] };
    // Return type annotation
    const te = child(node, "typeExpr");
    const returnType = te ? transformTypeAnnotation(te) : undefined;
    // Body
    const sl = child(node, "stmtList");
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
    // Py_FuncDecl uses kind "FuncDecl" but with Python-specific fields.
    // We build an IRFuncDecl-compatible node with extra Python fields attached.
    const funcDecl = {
        kind: "FuncDecl",
        name,
        params: paramList,
        results: [],
        isAsync,
        returnType,
        decorators,
        body,
        stmtIndex: si,
    };
    return funcDecl;
}
function transformPyParamList(node) {
    const result = { params: [] };
    const params = children(node, "param");
    for (const p of params) {
        // Check for **kwargs
        if (tok(p, "DoubleStar") !== undefined) {
            const name = tok(p, "Ident") || "kwargs";
            const te = child(p, "typeExpr");
            const type = te ? transformTypeAnnotation(te) : undefined;
            result.kwarg = { name, type };
            continue;
        }
        // Check for * or *args
        if (tok(p, "Star") !== undefined) {
            const name = tok(p, "Ident");
            if (name) {
                const te = child(p, "typeExpr");
                const type = te ? transformTypeAnnotation(te) : undefined;
                result.vararg = { name, type };
            }
            // bare * is keyword-only separator — subsequent params become kwonly
            continue;
        }
        // Check for / (positional-only separator)
        if (tok(p, "Slash") !== undefined) {
            // All params collected so far become positional-only
            result.posonly = [...result.params];
            result.params = [];
            continue;
        }
        // Regular parameter
        const name = tok(p, "Ident") || "_";
        const te = child(p, "typeExpr");
        const type = te ? transformTypeAnnotation(te) : undefined;
        const defaultExpr = child(p, "expr");
        const default_ = defaultExpr ? transformExpr(defaultExpr) : undefined;
        result.params.push({ name, type, default_ });
    }
    return result;
}
function transformTypeAnnotation(node) {
    // Collect all primary types joined by |
    const primaryTypes = children(node, "primaryType");
    const parts = [];
    for (const pt of primaryTypes) {
        parts.push(transformPrimaryType(pt));
    }
    if (parts.length === 0) {
        // Fallback: try idents directly on typeExpr
        const idents = tokAll(node, "Ident");
        return idents.join(".") || "Any";
    }
    return parts.join(" | ");
}
function transformPrimaryType(node) {
    // Callable: (params) -> retType
    if (tok(node, "LParen") !== undefined && tok(node, "Arrow") !== undefined) {
        const typeExprs = children(node, "typeExpr");
        const paramTypes = typeExprs.slice(0, -1).map(transformTypeAnnotation);
        const retType = typeExprs.length > 0 ? transformTypeAnnotation(typeExprs[typeExprs.length - 1]) : "None";
        return `Callable[[${paramTypes.join(", ")}], ${retType}]`;
    }
    // Named type with optional generic params
    const idents = tokAll(node, "Ident");
    let name = idents.join(".");
    if (!name)
        name = "Any";
    // Generic type params: [T, U]
    const typeExprs = children(node, "typeExpr");
    if (typeExprs.length > 0 && tok(node, "LBrack") !== undefined) {
        const typeArgs = typeExprs.map(transformTypeAnnotation);
        name += `[${typeArgs.join(", ")}]`;
    }
    return name;
}
// ─── Async Statement ─────────────────────────────────────────────────────────
function transformAsyncStmt(node) {
    const fd = child(node, "funcDef");
    if (fd)
        return transformFuncDef(fd, [], true);
    const fors = child(node, "forStmt");
    if (fors)
        return transformForStmt(fors, true);
    const withs = child(node, "withStmt");
    if (withs)
        return transformWithStmt(withs, true);
    return null;
}
// ─── Statement List ──────────────────────────────────────────────────────────
function transformStmtList(node) {
    const stmts = [];
    for (const s of children(node, "stmt")) {
        const transformed = transformStmt(s);
        if (transformed)
            stmts.push(transformed);
    }
    return { kind: "BlockStmt", stmts };
}
// ─── Statements ──────────────────────────────────────────────────────────────
function transformStmt(node) {
    const rs = child(node, "returnStmt");
    if (rs)
        return transformReturnStmt(rs);
    const ifs = child(node, "ifStmt");
    if (ifs)
        return transformIfStmt(ifs);
    const fors = child(node, "forStmt");
    if (fors)
        return transformForStmt(fors, false);
    const ws = child(node, "whileStmt");
    if (ws)
        return transformWhileStmt(ws);
    const ts = child(node, "tryStmt");
    if (ts)
        return transformTryStmt(ts);
    const withs = child(node, "withStmt");
    if (withs)
        return transformWithStmt(withs, false);
    const ms = child(node, "matchStmt");
    if (ms)
        return transformMatchStmt(ms);
    const raise = child(node, "raiseStmt");
    if (raise)
        return transformRaiseStmt(raise);
    const assert = child(node, "assertStmt");
    if (assert)
        return transformAssertStmt(assert);
    const del = child(node, "delStmt");
    if (del)
        return transformDelStmt(del);
    const brk = child(node, "breakStmt");
    if (brk)
        return { kind: "BranchStmt", tok: "break", stmtIndex: nextStmtIndex() };
    const cont = child(node, "continueStmt");
    if (cont)
        return { kind: "BranchStmt", tok: "continue", stmtIndex: nextStmtIndex() };
    const pass = child(node, "passStmt");
    if (pass) {
        // Represent as ExprStmt with Ident "pass"
        return { kind: "ExprStmt", expr: { kind: "Ident", name: "pass" }, stmtIndex: nextStmtIndex() };
    }
    const gs = child(node, "globalStmt");
    if (gs)
        return transformGlobalStmt(gs);
    const nls = child(node, "nonlocalStmt");
    if (nls)
        return transformNonlocalStmt(nls);
    const asyncS = child(node, "asyncStmt");
    if (asyncS)
        return transformAsyncStmt(asyncS);
    const fd = child(node, "funcDef");
    if (fd)
        return transformFuncDef(fd, [], false);
    const ys = child(node, "yieldStmt");
    if (ys)
        return transformYieldStmt(ys);
    const dd = child(node, "decoratedDef");
    if (dd)
        return transformDecoratedDef(dd);
    const cd = child(node, "classDecl");
    if (cd)
        return transformClassDecl(cd, []);
    const aes = child(node, "assignOrExprStmt");
    if (aes)
        return transformAssignOrExprStmt(aes);
    return null;
}
// ─── Return Statement ────────────────────────────────────────────────────────
// ^expr → ReturnStmt
function transformReturnStmt(node) {
    const expr = child(node, "expr");
    const values = expr ? [transformExpr(expr)] : [];
    return { kind: "ReturnStmt", values, stmtIndex: nextStmtIndex() };
}
// ─── If Statement ────────────────────────────────────────────────────────────
function transformIfStmt(node) {
    const si = nextStmtIndex();
    const exprs = children(node, "expr");
    const stmtLists = children(node, "stmtList");
    const cond = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident", name: "True" };
    const body = stmtLists[0] ? transformStmtList(stmtLists[0]) : { kind: "BlockStmt", stmts: [] };
    let else_;
    // Elif chains: each pair of (expr, stmtList) after the first
    // The parser stores elif exprs and stmtLists interleaved
    // expr[0]=if cond, stmtList[0]=if body,
    // expr[1]=elif1 cond, stmtList[1]=elif1 body, ...
    // final stmtList is else body (if present)
    if (exprs.length > 1) {
        // Build elif chain from the end
        else_ = buildElifChain(exprs, stmtLists, 1);
    }
    else if (stmtLists.length > 1) {
        // Just else, no elif
        else_ = transformStmtList(stmtLists[stmtLists.length - 1]);
    }
    return { kind: "IfStmt", cond, body, else_, stmtIndex: si };
}
function buildElifChain(exprs, stmtLists, idx) {
    if (idx >= exprs.length) {
        // Check if there's a trailing else body
        if (stmtLists.length > exprs.length) {
            return transformStmtList(stmtLists[stmtLists.length - 1]);
        }
        return undefined;
    }
    const cond = transformExpr(exprs[idx]);
    const body = stmtLists[idx] ? transformStmtList(stmtLists[idx]) : { kind: "BlockStmt", stmts: [] };
    const else_ = buildElifChain(exprs, stmtLists, idx + 1);
    return { kind: "IfStmt", cond, body, else_, stmtIndex: nextStmtIndex() };
}
// ─── For Statement ───────────────────────────────────────────────────────────
function transformForStmt(node, isAsync) {
    const si = nextStmtIndex();
    const tl = child(node, "targetList");
    const target = tl ? transformTargetList(tl) : { kind: "Ident", name: "_" };
    const iterExpr = child(node, "expr");
    const iter = iterExpr ? transformExpr(iterExpr) : { kind: "Ident", name: "_" };
    const stmtLists = children(node, "stmtList");
    const body = stmtLists[0] ? transformStmtList(stmtLists[0]) : { kind: "BlockStmt", stmts: [] };
    // Check for else clause
    if (stmtLists.length > 1) {
        const elseBody = transformStmtList(stmtLists[1]);
        return {
            kind: "Py_ForElse",
            isAsync,
            target,
            iter,
            body,
            elseBody,
            stmtIndex: si,
        };
    }
    // Simple for loop — represent as IRForStmt with range-like semantics
    // For Python, we use RangeStmt pattern: for target in iter { body }
    // Use "value" (not "key") so the emitter takes the `for value in x:` path
    // instead of the `for key in range(len(x)):` path.
    return {
        kind: "RangeStmt",
        value: exprToString(target),
        x: iter,
        body,
        stmtIndex: si,
    };
}
// ─── While Statement ─────────────────────────────────────────────────────────
function transformWhileStmt(node) {
    const si = nextStmtIndex();
    const condExpr = child(node, "expr");
    const cond = condExpr ? transformExpr(condExpr) : { kind: "Ident", name: "True" };
    const stmtLists = children(node, "stmtList");
    const body = stmtLists[0] ? transformStmtList(stmtLists[0]) : { kind: "BlockStmt", stmts: [] };
    if (stmtLists.length > 1) {
        const elseBody = transformStmtList(stmtLists[1]);
        return {
            kind: "Py_WhileElse",
            cond,
            body,
            elseBody,
            stmtIndex: si,
        };
    }
    return { kind: "ForStmt", cond, body, stmtIndex: si };
}
// ─── Try Statement ───────────────────────────────────────────────────────────
function transformTryStmt(node) {
    const si = nextStmtIndex();
    const stmtLists = children(node, "stmtList");
    const body = stmtLists[0] ? transformStmtList(stmtLists[0]) : { kind: "BlockStmt", stmts: [] };
    // Except handlers
    const exceptClauses = children(node, "exceptClause");
    const handlers = exceptClauses.map(ec => {
        const exprNode = child(ec, "expr");
        const type = exprNode ? transformExpr(exprNode) : undefined;
        const asName = tok(ec, "Ident");
        const handlerStmtList = child(ec, "stmtList");
        const handlerBody = handlerStmtList ? transformStmtList(handlerStmtList) : { kind: "BlockStmt", stmts: [] };
        return { type, name: asName, body: handlerBody };
    });
    // Else body (after except handlers)
    // The stmtList ordering: [0]=try body, then stmtLists from except clauses,
    // then else body, then finally body.
    // But except clause stmtLists are inside the exceptClause nodes, not at tryStmt level.
    // So stmtLists at tryStmt level: [0]=try body, [1]=else body (opt), [2]=finally body (opt)
    let elseBody;
    let finallyBody;
    const hasElse = tok(node, "Else") !== undefined;
    const hasFinally = tok(node, "Finally") !== undefined;
    if (hasElse && hasFinally) {
        elseBody = stmtLists[1] ? transformStmtList(stmtLists[1]) : undefined;
        finallyBody = stmtLists[2] ? transformStmtList(stmtLists[2]) : undefined;
    }
    else if (hasElse) {
        elseBody = stmtLists[1] ? transformStmtList(stmtLists[1]) : undefined;
    }
    else if (hasFinally) {
        finallyBody = stmtLists[1] ? transformStmtList(stmtLists[1]) : undefined;
    }
    return {
        kind: "Py_TryExcept",
        body,
        handlers,
        elseBody,
        finallyBody,
        stmtIndex: si,
    };
}
// ─── With Statement ──────────────────────────────────────────────────────────
function transformWithStmt(node, isAsync) {
    const si = nextStmtIndex();
    const withItems = children(node, "withItem");
    const items = withItems.map(wi => {
        const contextExpr = child(wi, "expr");
        const ctx = contextExpr ? transformExpr(contextExpr) : { kind: "Ident", name: "_" };
        const asName = tok(wi, "Ident");
        return { contextExpr: ctx, optionalVar: asName };
    });
    const sl = child(node, "stmtList");
    const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
    return {
        kind: "Py_WithStmt",
        isAsync,
        items,
        body,
        stmtIndex: si,
    };
}
// ─── Match Statement ─────────────────────────────────────────────────────────
function transformMatchStmt(node) {
    const si = nextStmtIndex();
    const subjectExpr = child(node, "expr");
    const subject = subjectExpr ? transformExpr(subjectExpr) : { kind: "Ident", name: "_" };
    const caseClauses = children(node, "caseClause");
    const cases = caseClauses.map(cc => {
        const pat = child(cc, "pattern");
        const pattern = pat ? transformPattern(pat) : { kind: "Ident", name: "_" };
        // Guard: 'if' expr
        const guardExpr = child(cc, "expr");
        const guard = guardExpr ? transformExpr(guardExpr) : undefined;
        const sl = child(cc, "stmtList");
        const body = sl ? transformStmtList(sl) : { kind: "BlockStmt", stmts: [] };
        return { pattern, guard, body };
    });
    return {
        kind: "Py_MatchStmt",
        subject,
        cases,
        stmtIndex: si,
    };
}
function transformPattern(node) {
    // pattern: patternAtom ('|' patternAtom)* ('as' IDENT)?
    const atoms = children(node, "patternAtom");
    const asName = tok(node, "Ident");
    let result;
    if (atoms.length === 0) {
        result = { kind: "Ident", name: "_" };
    }
    else if (atoms.length === 1) {
        result = transformPatternAtom(atoms[0]);
    }
    else {
        // OR pattern: join with |
        result = transformPatternAtom(atoms[0]);
        for (let i = 1; i < atoms.length; i++) {
            result = { kind: "BinaryExpr", left: result, op: "|", right: transformPatternAtom(atoms[i]) };
        }
    }
    if (asName) {
        // Walrus-like binding: pattern as name
        result = { kind: "Py_WalrusExpr", target: asName, value: result };
    }
    return result;
}
function transformPatternAtom(node) {
    // Wildcard _
    if (tok(node, "Underscore") !== undefined) {
        return { kind: "Ident", name: "_" };
    }
    // Star pattern: *name
    if (tok(node, "Star") !== undefined) {
        const name = tok(node, "Ident") || tok(node, "Underscore") || "_";
        return { kind: "Py_StarExpr", value: { kind: "Ident", name }, isDouble: false };
    }
    // Double star pattern: **name
    if (tok(node, "DoubleStar") !== undefined) {
        const name = tok(node, "Ident") || "_";
        return { kind: "Py_StarExpr", value: { kind: "Ident", name }, isDouble: true };
    }
    // None/True/False
    if (tok(node, "PyNone") !== undefined)
        return { kind: "Ident", name: "None" };
    if (tok(node, "PyTrue") !== undefined)
        return { kind: "Ident", name: "True" };
    if (tok(node, "PyFalse") !== undefined)
        return { kind: "Ident", name: "False" };
    // Ellipsis
    if (tok(node, "Ellipsis") !== undefined)
        return { kind: "Ident", name: "..." };
    // Negative number
    if (tok(node, "Minus") !== undefined) {
        const intVal = tok(node, "IntLit");
        const floatVal = tok(node, "FloatLit");
        const val = intVal || floatVal || "0";
        return { kind: "UnaryExpr", op: "-", x: { kind: "BasicLit", type: intVal ? "INT" : "FLOAT", value: val } };
    }
    // Number literals
    const intLit = tok(node, "IntLit");
    if (intLit)
        return { kind: "BasicLit", type: "INT", value: intLit };
    const floatLit = tok(node, "FloatLit");
    if (floatLit)
        return { kind: "BasicLit", type: "FLOAT", value: floatLit };
    // String literal
    const strLit = child(node, "stringLit");
    if (strLit)
        return transformStringLit(strLit);
    // Parenthesized pattern (tuple)
    const innerPatterns = children(node, "pattern");
    if (tok(node, "LParen") !== undefined && innerPatterns.length > 0) {
        const elts = innerPatterns.map(transformPattern);
        if (elts.length === 1)
            return { kind: "ParenExpr", x: elts[0] };
        return { kind: "Py_TupleExpr", elts };
    }
    // Sequence pattern [...]
    if (tok(node, "LBrack") !== undefined) {
        const elts = innerPatterns.map(transformPattern);
        return { kind: "CompositeLit", type: { kind: "Ident", name: "list" }, elts };
    }
    // Mapping pattern {...}
    if (tok(node, "LBrace") !== undefined) {
        const kvs = children(node, "patternKV");
        const keys = [];
        const values = [];
        for (const kv of kvs) {
            if (tok(kv, "DoubleStar") !== undefined) {
                keys.push(null);
                const name = tok(kv, "Ident") || "_";
                values.push({ kind: "Ident", name });
            }
            else {
                const expr = child(kv, "expr");
                keys.push(expr ? transformExpr(expr) : { kind: "Ident", name: "_" });
                const pat = child(kv, "pattern");
                values.push(pat ? transformPattern(pat) : { kind: "Ident", name: "_" });
            }
        }
        return { kind: "Py_DictExpr", keys, values };
    }
    // Class/value pattern: Ident.Ident...(args)
    const idents = tokAll(node, "Ident");
    if (idents.length > 0) {
        let expr = { kind: "Ident", name: idents[0] };
        for (let i = 1; i < idents.length; i++) {
            expr = { kind: "SelectorExpr", x: expr, sel: idents[i] };
        }
        const patArgs = child(node, "patternArgs");
        if (patArgs) {
            const args = children(patArgs, "patternArg").map(pa => {
                const pat = child(pa, "pattern");
                return pat ? transformPattern(pat) : { kind: "Ident", name: "_" };
            });
            expr = { kind: "CallExpr", func: expr, args };
        }
        return expr;
    }
    return { kind: "Ident", name: "_" };
}
// ─── Raise Statement ─────────────────────────────────────────────────────────
function transformRaiseStmt(node) {
    const exprs = children(node, "expr");
    const exc = exprs[0] ? transformExpr(exprs[0]) : undefined;
    const cause = exprs[1] ? transformExpr(exprs[1]) : undefined;
    return { kind: "Py_RaiseStmt", exc, cause, stmtIndex: nextStmtIndex() };
}
// ─── Assert Statement ────────────────────────────────────────────────────────
function transformAssertStmt(node) {
    const exprs = children(node, "expr");
    const test = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident", name: "True" };
    const msg = exprs[1] ? transformExpr(exprs[1]) : undefined;
    return { kind: "Py_AssertStmt", test, msg, stmtIndex: nextStmtIndex() };
}
// ─── Del Statement ───────────────────────────────────────────────────────────
function transformDelStmt(node) {
    const exprs = children(node, "expr");
    const targets = exprs.map(transformExpr);
    return { kind: "Py_DeleteStmt", targets, stmtIndex: nextStmtIndex() };
}
// ─── Global / Nonlocal ──────────────────────────────────────────────────────
function transformGlobalStmt(node) {
    const il = child(node, "identList");
    const names = il ? tokAll(il, "Ident") : [];
    return { kind: "Py_GlobalStmt", names, stmtIndex: nextStmtIndex() };
}
function transformNonlocalStmt(node) {
    const il = child(node, "identList");
    const names = il ? tokAll(il, "Ident") : [];
    return { kind: "Py_NonlocalStmt", names, stmtIndex: nextStmtIndex() };
}
// ─── Yield Statement ─────────────────────────────────────────────────────────
function transformYieldStmt(node) {
    const hasFrom = tok(node, "From") !== undefined;
    const exprs = children(node, "expr");
    let expr;
    if (hasFrom && exprs[0]) {
        expr = { kind: "Py_YieldFromExpr", value: transformExpr(exprs[0]) };
    }
    else if (exprs.length > 0) {
        expr = { kind: "Py_YieldExpr", value: transformExpr(exprs[0]) };
    }
    else {
        expr = { kind: "Py_YieldExpr" };
    }
    return { kind: "ExprStmt", expr, stmtIndex: nextStmtIndex() };
}
// ─── Assignment or Expression Statement ──────────────────────────────────────
function transformAssignOrExprStmt(node) {
    const si = nextStmtIndex();
    // Check for assignment: = rhs
    const assignRHS = child(node, "assignRHS");
    if (assignRHS) {
        const lhsNode = child(node, "targetExprList");
        const lhs = lhsNode ? transformTargetExprList(lhsNode) : [];
        const rhs = transformAssignRHS(assignRHS);
        return { kind: "AssignStmt", lhs, rhs, op: "=", stmtIndex: si };
    }
    // Check for augmented assignment
    const augOp = child(node, "augAssignOp");
    if (augOp) {
        const lhsNode = child(node, "targetExprList");
        const lhs = lhsNode ? transformTargetExprList(lhsNode) : [];
        const rhsExpr = child(node, "expr");
        const rhs = rhsExpr ? [transformExpr(rhsExpr)] : [];
        const op = getAugAssignOp(augOp);
        return { kind: "AssignStmt", lhs, rhs, op, stmtIndex: si };
    }
    // Check for type-annotated assignment: x: type = expr
    const typeAnnot = child(node, "typeExpr");
    if (typeAnnot) {
        const lhsNode = child(node, "targetExprList");
        const lhs = lhsNode ? transformTargetExprList(lhsNode) : [];
        // There may be a second Assign + expr for value
        const rhsExprs = children(node, "expr");
        // The first expr might be from the augAssign, the extra is from type-annotated assign
        const rhs = rhsExprs.length > 0 ? [transformExpr(rhsExprs[rhsExprs.length - 1])] : [];
        if (rhs.length > 0) {
            return { kind: "AssignStmt", lhs, rhs, op: "=", stmtIndex: si };
        }
        // Type-only annotation: x: int (no value)
        return { kind: "VarDecl", name: exprToString(lhs[0] || { kind: "Ident", name: "_" }), stmtIndex: si };
    }
    // Expression statement
    const telNode = child(node, "targetExprList");
    if (telNode) {
        const exprs = transformTargetExprList(telNode);
        if (exprs.length === 1) {
            return { kind: "ExprStmt", expr: exprs[0], stmtIndex: si };
        }
        // Multiple expressions as tuple
        if (exprs.length > 1) {
            const tuple = { kind: "Py_TupleExpr", elts: exprs };
            return { kind: "ExprStmt", expr: tuple, stmtIndex: si };
        }
    }
    return { kind: "ExprStmt", expr: { kind: "Ident", name: "_" }, stmtIndex: si };
}
function transformAssignRHS(node) {
    // yield expression
    const ye = child(node, "yieldExpr");
    if (ye) {
        const hasFrom = tok(ye, "From") !== undefined;
        const exprs = children(ye, "expr");
        if (hasFrom && exprs[0]) {
            return [{ kind: "Py_YieldFromExpr", value: transformExpr(exprs[0]) }];
        }
        if (exprs.length > 0) {
            return [{ kind: "Py_YieldExpr", value: transformExpr(exprs[0]) }];
        }
        return [{ kind: "Py_YieldExpr" }];
    }
    // starExprList
    const sel = child(node, "starExprList");
    if (sel)
        return transformStarExprList(sel);
    return [];
}
function transformStarExprList(node) {
    const starExprs = children(node, "starExpr");
    return starExprs.map(se => {
        const hasStar = tok(se, "Star") !== undefined;
        const expr = child(se, "expr");
        const e = expr ? transformExpr(expr) : { kind: "Ident", name: "_" };
        if (hasStar) {
            return { kind: "Py_StarExpr", value: e, isDouble: false };
        }
        return e;
    });
}
function transformTargetExprList(node) {
    const starExprs = children(node, "starExpr");
    return starExprs.map(se => {
        const hasStar = tok(se, "Star") !== undefined;
        const expr = child(se, "expr");
        const e = expr ? transformExpr(expr) : { kind: "Ident", name: "_" };
        if (hasStar) {
            return { kind: "Py_StarExpr", value: e, isDouble: false };
        }
        return e;
    });
}
function transformTargetList(node) {
    const targets = children(node, "target");
    if (targets.length === 0)
        return { kind: "Ident", name: "_" };
    if (targets.length === 1)
        return transformTarget(targets[0]);
    return { kind: "Py_TupleExpr", elts: targets.map(transformTarget) };
}
function transformTarget(node) {
    // Parenthesized target
    const tl = child(node, "targetList");
    if (tl && tok(node, "LParen") !== undefined) {
        return transformTargetList(tl);
    }
    // Bracketed target
    if (tl && tok(node, "LBrack") !== undefined) {
        const inner = transformTargetList(tl);
        // Wrap as list-like
        return inner;
    }
    // Star target: *name
    if (tok(node, "Star") !== undefined) {
        const name = tok(node, "Ident") || "_";
        return { kind: "Py_StarExpr", value: { kind: "Ident", name }, isDouble: false };
    }
    // Self attribute: .attr
    if (tok(node, "Dot") !== undefined && !tok(node, "Ident", 1)) {
        const attr = tok(node, "Ident") || "";
        return { kind: "SelectorExpr", x: { kind: "Ident", name: "self" }, sel: attr };
    }
    // Underscore
    if (tok(node, "Underscore") !== undefined) {
        return { kind: "Ident", name: "_" };
    }
    // Name with optional trailers
    const idents = tokAll(node, "Ident");
    if (idents.length === 0)
        return { kind: "Ident", name: "_" };
    let result = { kind: "Ident", name: idents[0] };
    // Process trailers (dots and brackets) using token offsets
    const dots = tokTokens(node, "Dot");
    const lbracks = tokTokens(node, "LBrack");
    // Build a list of all trailer operations sorted by offset
    const ops = [];
    for (const d of dots)
        ops.push({ type: "dot", offset: d.startOffset });
    for (const lb of lbracks)
        ops.push({ type: "index", offset: lb.startOffset });
    ops.sort((a, b) => a.offset - b.offset);
    let identIdx = 1; // start from second ident
    const exprNodes = children(node, "expr");
    let exprIdx = 0;
    for (const op of ops) {
        if (op.type === "dot" && identIdx < idents.length) {
            result = { kind: "SelectorExpr", x: result, sel: idents[identIdx] };
            identIdx++;
        }
        else if (op.type === "index" && exprIdx < exprNodes.length) {
            result = { kind: "IndexExpr", x: result, index: transformExpr(exprNodes[exprIdx]) };
            exprIdx++;
        }
    }
    return result;
}
function getAugAssignOp(node) {
    const ops = [
        ["PlusAssign", "+="], ["MinusAssign", "-="], ["MulAssign", "*="],
        ["DivAssign", "/="], ["FloorDivAssign", "//="], ["ModAssign", "%="],
        ["DoubleStarAssign", "**="], ["AmpAssign", "&="], ["PipeAssign", "|="],
        ["CaretAssign", "^="], ["ShlAssign", "<<="], ["ShrAssign", ">>="],
    ];
    for (const [tokName, opStr] of ops) {
        if (tok(node, tokName) !== undefined)
            return opStr;
    }
    return "=";
}
// ─── Argument Lists ──────────────────────────────────────────────────────────
function transformArgList(node) {
    const args = children(node, "arg");
    return args.map(a => {
        const doubleStar = tok(a, "DoubleStar");
        if (doubleStar) {
            const expr = child(a, "expr");
            return { kind: "Py_StarExpr", value: expr ? transformExpr(expr) : { kind: "Ident", name: "_" }, isDouble: true };
        }
        const star = tok(a, "Star");
        if (star) {
            const expr = child(a, "expr");
            return { kind: "Py_StarExpr", value: expr ? transformExpr(expr) : { kind: "Ident", name: "_" }, isDouble: false };
        }
        const expr = child(a, "expr");
        return expr ? transformExpr(expr) : { kind: "Ident", name: "_" };
    });
}
function transformCallArgs(node) {
    // Check for generator expression (expr + compFor)
    const compFor = child(node, "compFor");
    if (compFor) {
        const exprNode = child(node, "expr");
        const elt = exprNode ? transformExpr(exprNode) : { kind: "Ident", name: "_" };
        const generators = transformCompForChain(node);
        return [{ kind: "Py_ComprehensionExpr", type: "generator", elt, generators }];
    }
    // Regular call arguments
    const callArgs = children(node, "callArg");
    return callArgs.map(transformCallArg);
}
function transformCallArg(node) {
    // **kwargs
    if (tok(node, "DoubleStar") !== undefined) {
        const expr = child(node, "expr");
        return { kind: "Py_StarExpr", value: expr ? transformExpr(expr) : { kind: "Ident", name: "_" }, isDouble: true };
    }
    // *args
    if (tok(node, "Star") !== undefined) {
        const expr = child(node, "expr");
        return { kind: "Py_StarExpr", value: expr ? transformExpr(expr) : { kind: "Ident", name: "_" }, isDouble: false };
    }
    // keyword=value
    const ident = tok(node, "Ident");
    const assign = tok(node, "Assign");
    if (ident && assign) {
        const expr = child(node, "expr");
        const val = expr ? transformExpr(expr) : { kind: "Ident", name: "_" };
        return { kind: "KeyValueExpr", key: { kind: "Ident", name: ident }, value: val };
    }
    // Positional argument
    const exprs = children(node, "expr");
    if (exprs.length > 0) {
        return transformExpr(exprs[exprs.length - 1]);
    }
    return { kind: "Ident", name: "_" };
}
// ─── Expression Transformation ───────────────────────────────────────────────
function transformExpr(node) {
    const name = node.name;
    switch (name) {
        case "expr":
            return transformExprNode(node);
        case "ternaryExpr":
            return transformTernaryExpr(node);
        case "orExpr":
            return transformBinExprChain(node, "andExpr", "Or", "or");
        case "andExpr":
            return transformBinExprChain(node, "notExpr", "And", "and");
        case "notExpr":
            return transformNotExpr(node);
        case "compExpr":
            return transformCompExpr(node);
        case "orBitExpr":
            return transformBinExprChain(node, "xorBitExpr", "Pipe", "|");
        case "xorBitExpr":
            return transformBinExprChain(node, "andBitExpr", "Caret", "^");
        case "andBitExpr":
            return transformBinExprChain(node, "shiftExpr", "Amp", "&");
        case "shiftExpr":
            return transformShiftExpr(node);
        case "addExpr":
            return transformAddExpr(node);
        case "mulExpr":
            return transformMulExpr(node);
        case "unaryExpr":
            return transformUnaryExpr(node);
        case "powerExpr":
            return transformPowerExpr(node);
        case "awaitExpr":
            return transformAwaitExpr(node);
        case "primaryExpr":
            return transformPrimaryExpr(node);
        case "atom":
            return transformAtom(node);
        case "lambdaExpr":
            return transformLambdaExpr(node);
        default:
            // Try to look for child rules
            return transformExprFallback(node);
    }
}
function transformExprFallback(node) {
    // Try common child rules
    for (const rule of ["ternaryExpr", "orExpr", "lambdaExpr", "expr", "primaryExpr", "atom"]) {
        const c = child(node, rule);
        if (c)
            return transformExpr(c);
    }
    // Look for direct tokens
    const ident = tok(node, "Ident");
    if (ident)
        return resolveIdentExpr(ident);
    return { kind: "Ident", name: "_" };
}
function transformExprNode(node) {
    // Lambda: |params|expr
    const lambda = child(node, "lambdaExpr");
    if (lambda)
        return transformLambdaExpr(lambda);
    // Walrus: name := expr
    const walrus = tok(node, "Walrus");
    if (walrus) {
        const name = tok(node, "Ident") || "_";
        const expr = child(node, "expr");
        const val = expr ? transformExpr(expr) : { kind: "Ident", name: "_" };
        return { kind: "Py_WalrusExpr", target: name, value: val };
    }
    // Ternary / standard
    const te = child(node, "ternaryExpr");
    if (te)
        return transformExpr(te);
    return { kind: "Ident", name: "_" };
}
function transformLambdaExpr(node) {
    const lpl = child(node, "lambdaParamList");
    const params = lpl ? transformLambdaParamList(lpl) : [];
    const exprNode = child(node, "expr");
    const body = exprNode ? transformExpr(exprNode) : { kind: "Ident", name: "_" };
    return { kind: "Py_LambdaExpr", params, body };
}
function transformLambdaParamList(node) {
    const lambdaParams = children(node, "lambdaParam");
    return lambdaParams.map(lp => {
        // **kwargs
        if (tok(lp, "DoubleStar") !== undefined) {
            return { name: "**" + (tok(lp, "Ident") || "kwargs") };
        }
        // *args
        if (tok(lp, "Star") !== undefined) {
            const name = tok(lp, "Ident");
            return { name: name ? "*" + name : "*" };
        }
        // Regular
        const name = tok(lp, "Ident") || "_";
        const defaultExpr = child(lp, "expr");
        const default_ = defaultExpr ? transformExpr(defaultExpr) : undefined;
        return { name, default_ };
    });
}
function transformTernaryExpr(node) {
    const orExprs = children(node, "orExpr");
    if (orExprs.length === 0)
        return { kind: "Ident", name: "_" };
    const value = transformExpr(orExprs[0]);
    // Check for ternary: value if cond else other
    const ifTok = tok(node, "If");
    if (ifTok && orExprs.length >= 2) {
        const test = transformExpr(orExprs[1]);
        const exprNode = child(node, "expr");
        const orElse = exprNode ? transformExpr(exprNode) : { kind: "Ident", name: "None" };
        return { kind: "Py_TernaryExpr", value, test, orElse };
    }
    return value;
}
function transformBinExprChain(node, childRule, _opToken, opStr) {
    const operands = children(node, childRule);
    if (operands.length === 0)
        return { kind: "Ident", name: "_" };
    let result = transformExpr(operands[0]);
    for (let i = 1; i < operands.length; i++) {
        result = { kind: "BinaryExpr", left: result, op: opStr, right: transformExpr(operands[i]) };
    }
    return result;
}
function transformNotExpr(node) {
    const notTok = tok(node, "Not");
    if (notTok) {
        const inner = child(node, "notExpr");
        const x = inner ? transformExpr(inner) : { kind: "Ident", name: "_" };
        return { kind: "UnaryExpr", op: "not", x };
    }
    const comp = child(node, "compExpr");
    return comp ? transformExpr(comp) : { kind: "Ident", name: "_" };
}
function transformCompExpr(node) {
    const operands = children(node, "orBitExpr");
    if (operands.length === 0)
        return { kind: "Ident", name: "_" };
    if (operands.length === 1)
        return transformExpr(operands[0]);
    // Comparison operators
    const compOps = children(node, "compOp");
    let result = transformExpr(operands[0]);
    for (let i = 0; i < compOps.length && i + 1 < operands.length; i++) {
        const op = getCompOp(compOps[i]);
        const right = transformExpr(operands[i + 1]);
        result = { kind: "BinaryExpr", left: result, op, right };
    }
    return result;
}
function getCompOp(node) {
    if (tok(node, "Eq") !== undefined)
        return "==";
    if (tok(node, "Neq") !== undefined)
        return "!=";
    if (tok(node, "Leq") !== undefined)
        return "<=";
    if (tok(node, "Geq") !== undefined)
        return ">=";
    if (tok(node, "Lt") !== undefined)
        return "<";
    if (tok(node, "Gt") !== undefined)
        return ">";
    if (tok(node, "Not") !== undefined && tok(node, "In") !== undefined)
        return "not in";
    if (tok(node, "In") !== undefined)
        return "in";
    if (tok(node, "Is") !== undefined && tok(node, "Not") !== undefined)
        return "is not";
    if (tok(node, "Is") !== undefined)
        return "is";
    return "==";
}
function transformShiftExpr(node) {
    const operands = children(node, "addExpr");
    if (operands.length === 0)
        return { kind: "Ident", name: "_" };
    let result = transformExpr(operands[0]);
    const shlTokens = tokTokens(node, "Shl");
    const shrTokens = tokTokens(node, "Shr");
    const allOps = [
        ...shlTokens.map(t => ({ op: "<<", offset: t.startOffset })),
        ...shrTokens.map(t => ({ op: ">>", offset: t.startOffset })),
    ].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < operands.length && i - 1 < allOps.length; i++) {
        result = { kind: "BinaryExpr", left: result, op: allOps[i - 1].op, right: transformExpr(operands[i]) };
    }
    return result;
}
function transformAddExpr(node) {
    const operands = children(node, "mulExpr");
    if (operands.length === 0)
        return { kind: "Ident", name: "_" };
    let result = transformExpr(operands[0]);
    const plusTokens = tokTokens(node, "Plus");
    const minusTokens = tokTokens(node, "Minus");
    const allOps = [
        ...plusTokens.map(t => ({ op: "+", offset: t.startOffset })),
        ...minusTokens.map(t => ({ op: "-", offset: t.startOffset })),
    ].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < operands.length && i - 1 < allOps.length; i++) {
        result = { kind: "BinaryExpr", left: result, op: allOps[i - 1].op, right: transformExpr(operands[i]) };
    }
    return result;
}
function transformMulExpr(node) {
    const operands = children(node, "unaryExpr");
    if (operands.length === 0)
        return { kind: "Ident", name: "_" };
    let result = transformExpr(operands[0]);
    const opTokenNames = [
        ["Star", "*"], ["Slash", "/"], ["FloorDiv", "//"],
        ["Percent", "%"], ["At", "@"],
    ];
    const allOps = [];
    for (const [tokName, opStr] of opTokenNames) {
        for (const t of tokTokens(node, tokName)) {
            allOps.push({ op: opStr, offset: t.startOffset });
        }
    }
    allOps.sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < operands.length && i - 1 < allOps.length; i++) {
        result = { kind: "BinaryExpr", left: result, op: allOps[i - 1].op, right: transformExpr(operands[i]) };
    }
    return result;
}
function transformUnaryExpr(node) {
    const plus = tok(node, "Plus");
    const minus = tok(node, "Minus");
    const tilde = tok(node, "Tilde");
    const inner = child(node, "unaryExpr");
    if ((plus || minus || tilde) && inner) {
        const op = plus ? "+" : minus ? "-" : "~";
        return { kind: "UnaryExpr", op, x: transformExpr(inner) };
    }
    const pe = child(node, "powerExpr");
    return pe ? transformExpr(pe) : { kind: "Ident", name: "_" };
}
function transformPowerExpr(node) {
    const awaitExpr = child(node, "awaitExpr");
    const base = awaitExpr ? transformExpr(awaitExpr) : { kind: "Ident", name: "_" };
    const unary = child(node, "unaryExpr");
    if (tok(node, "DoubleStar") !== undefined && unary) {
        return { kind: "BinaryExpr", left: base, op: "**", right: transformExpr(unary) };
    }
    return base;
}
function transformAwaitExpr(node) {
    const awaitTok = tok(node, "Await");
    const pe = child(node, "primaryExpr") || child(node, "primaryExpr", 1);
    if (awaitTok && pe) {
        return { kind: "Py_AwaitExpr", value: transformExpr(pe) };
    }
    return pe ? transformExpr(pe) : { kind: "Ident", name: "_" };
}
// ─── Primary Expression ──────────────────────────────────────────────────────
function transformPrimaryExpr(node) {
    const atomNode = child(node, "atom");
    let result = atomNode ? transformExpr(atomNode) : { kind: "Ident", name: "_" };
    // Apply trailers
    const trailers = children(node, "trailer");
    for (const t of trailers) {
        result = applyTrailer(result, t);
    }
    return result;
}
function applyTrailer(base, trailer) {
    // Call: (args)
    if (tok(trailer, "LParen") !== undefined) {
        const ca = child(trailer, "callArgs");
        const args = ca ? transformCallArgs(ca) : [];
        return { kind: "CallExpr", func: base, args };
    }
    // Subscript: [...]
    if (tok(trailer, "LBrack") !== undefined) {
        const sl = child(trailer, "subscriptList");
        if (sl)
            return applySubscript(base, sl);
        return base;
    }
    // Dot access: .ident (Ident may be inside attrName child node)
    if (tok(trailer, "Dot") !== undefined) {
        let sel = tok(trailer, "Ident") || "";
        if (!sel) {
            // The parser wraps the attribute name in an attrName subrule
            const attrNameNode = child(trailer, "attrName");
            if (attrNameNode) {
                sel = tok(attrNameNode, "Ident") || tok(attrNameNode, "Match") || tok(attrNameNode, "Case") || tok(attrNameNode, "Slots") || "";
            }
        }
        return { kind: "SelectorExpr", x: base, sel };
    }
    return base;
}
function applySubscript(base, subscriptList) {
    const subscripts = children(subscriptList, "subscript");
    if (subscripts.length === 0)
        return base;
    if (subscripts.length === 1) {
        return transformSingleSubscript(base, subscripts[0]);
    }
    // Multi-dimensional: a[x, y] → IndexExpr with TupleExpr
    const indices = subscripts.map(s => {
        // For each subscript, get its expr or slice
        const exprs = children(s, "expr");
        if (tok(s, "Colon") !== undefined) {
            return buildSliceExprValue(s);
        }
        return exprs.length > 0 ? transformExpr(exprs[exprs.length - 1]) : { kind: "Ident", name: "_" };
    });
    return { kind: "IndexExpr", x: base, index: { kind: "Py_TupleExpr", elts: indices } };
}
function transformSingleSubscript(base, sub) {
    // Slice: a[low:high:step]
    if (tok(sub, "Colon") !== undefined) {
        const exprs = children(sub, "expr");
        // Parse slice parts based on colon positions
        const low = exprs[0] ? transformExpr(exprs[0]) : undefined;
        const high = exprs[1] ? transformExpr(exprs[1]) : undefined;
        const max = exprs[2] ? transformExpr(exprs[2]) : undefined;
        return { kind: "SliceExpr", x: base, low, high, max };
    }
    // Plain index
    const exprs = children(sub, "expr");
    if (exprs.length > 0) {
        return { kind: "IndexExpr", x: base, index: transformExpr(exprs[exprs.length - 1]) };
    }
    return base;
}
function buildSliceExprValue(sub) {
    const exprs = children(sub, "expr");
    // Represent slice as a CallExpr to "slice"
    const args = [];
    args.push(exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident", name: "None" });
    args.push(exprs[1] ? transformExpr(exprs[1]) : { kind: "Ident", name: "None" });
    if (exprs[2])
        args.push(transformExpr(exprs[2]));
    return { kind: "CallExpr", func: { kind: "Ident", name: "slice" }, args };
}
// ─── Atom ────────────────────────────────────────────────────────────────────
function transformAtom(node) {
    // Paren expression / tuple / generator
    const parenExpr = child(node, "parenExpr");
    if (parenExpr)
        return transformParenExpr(parenExpr);
    // List
    const listExpr = child(node, "listExpr");
    if (listExpr)
        return transformListExpr(listExpr);
    // Dict/Set
    const dictSetExpr = child(node, "dictSetExpr");
    if (dictSetExpr)
        return transformDictSetExpr(dictSetExpr);
    // Self attribute: .attr
    if (tok(node, "Dot") !== undefined) {
        const attr = tok(node, "Ident") || "";
        return { kind: "SelectorExpr", x: { kind: "Ident", name: "self" }, sel: attr };
    }
    // Boolean / None
    if (tok(node, "PyTrue") !== undefined)
        return { kind: "Ident", name: "True" };
    if (tok(node, "PyFalse") !== undefined)
        return { kind: "Ident", name: "False" };
    if (tok(node, "PyNone") !== undefined)
        return { kind: "Ident", name: "None" };
    // Ellipsis
    if (tok(node, "Ellipsis") !== undefined)
        return { kind: "Ident", name: "..." };
    // String literals
    const strLit = child(node, "stringLit");
    if (strLit)
        return transformStringLit(strLit);
    // Number literals
    const floatLit = tok(node, "FloatLit");
    if (floatLit)
        return { kind: "BasicLit", type: "FLOAT", value: floatLit };
    const hexLit = tok(node, "HexLit");
    if (hexLit)
        return { kind: "BasicLit", type: "INT", value: hexLit };
    const octLit = tok(node, "OctLit");
    if (octLit)
        return { kind: "BasicLit", type: "INT", value: octLit };
    const binLit = tok(node, "BinLit");
    if (binLit)
        return { kind: "BasicLit", type: "INT", value: binLit };
    const intLit = tok(node, "IntLit");
    if (intLit)
        return { kind: "BasicLit", type: "INT", value: intLit };
    // Identifier (with alias resolution)
    const ident = tok(node, "Ident");
    if (ident)
        return resolveIdentExpr(ident);
    return { kind: "Ident", name: "_" };
}
function resolveIdentExpr(name) {
    const alias = resolveAlias(name);
    if (alias) {
        // Expand alias: "jd" → "json.dumps"
        const parts = alias.python.split(".");
        if (parts.length >= 2) {
            let expr = { kind: "Ident", name: parts[0] };
            for (let i = 1; i < parts.length; i++) {
                expr = { kind: "SelectorExpr", x: expr, sel: parts[i] };
            }
            return expr;
        }
        return { kind: "Ident", name: alias.python };
    }
    return { kind: "Ident", name };
}
// ─── String Literals ─────────────────────────────────────────────────────────
function transformStringLit(node) {
    // F-strings
    const fstrTD = tok(node, "FStringTripleDouble");
    const fstrTS = tok(node, "FStringTripleSingle");
    const fstrD = tok(node, "FStringDouble");
    const fstrS = tok(node, "FStringSingle");
    const fstr = fstrTD || fstrTS || fstrD || fstrS;
    if (fstr) {
        return parseFString(fstr);
    }
    // RF/FR strings (raw f-strings)
    const rfD = tok(node, "RFStringDouble");
    const rfS = tok(node, "RFStringSingle");
    if (rfD || rfS) {
        return parseFString(rfD || rfS || "");
    }
    // Raw strings
    const rawTD = tok(node, "RawStringTripleDouble");
    const rawTS = tok(node, "RawStringTripleSingle");
    const rawD = tok(node, "RawStringDouble");
    const rawS = tok(node, "RawStringSingle");
    const raw = rawTD || rawTS || rawD || rawS;
    if (raw)
        return { kind: "BasicLit", type: "STRING", value: raw };
    // RB strings (raw bytes)
    const rbD = tok(node, "RBStringDouble");
    const rbS = tok(node, "RBStringSingle");
    if (rbD || rbS)
        return { kind: "BasicLit", type: "STRING", value: rbD || rbS || "" };
    // Byte strings
    const byteD = tok(node, "ByteStringDouble");
    const byteS = tok(node, "ByteStringSingle");
    if (byteD || byteS)
        return { kind: "BasicLit", type: "STRING", value: byteD || byteS || "" };
    // Triple-quoted strings
    const tripleD = tok(node, "TripleDoubleString");
    const tripleS = tok(node, "TripleSingleString");
    if (tripleD || tripleS)
        return { kind: "BasicLit", type: "STRING", value: tripleD || tripleS || "" };
    // Regular strings
    const doubleS = tok(node, "DoubleString");
    const singleS = tok(node, "SingleString");
    if (doubleS || singleS)
        return { kind: "BasicLit", type: "STRING", value: doubleS || singleS || "" };
    return { kind: "BasicLit", type: "STRING", value: '""' };
}
function parseFString(fstr) {
    // Simple f-string parser: split on {expr} boundaries
    const parts = [];
    // Remove f prefix and quotes
    let inner = fstr;
    if (inner.startsWith("rf") || inner.startsWith("fr") || inner.startsWith("RF") || inner.startsWith("FR")) {
        inner = inner.slice(2);
    }
    else {
        inner = inner.slice(1); // remove 'f'
    }
    // Remove surrounding quotes
    if (inner.startsWith('"""') || inner.startsWith("'''")) {
        inner = inner.slice(3, -3);
    }
    else {
        inner = inner.slice(1, -1);
    }
    // Simple approach: split by { and } tracking depth
    let current = "";
    let i = 0;
    while (i < inner.length) {
        if (inner[i] === "{" && inner[i + 1] !== "{") {
            // Start of expression
            if (current) {
                parts.push(current);
                current = "";
            }
            let depth = 1;
            let exprStr = "";
            i++;
            while (i < inner.length && depth > 0) {
                if (inner[i] === "{")
                    depth++;
                else if (inner[i] === "}") {
                    depth--;
                    if (depth === 0)
                        break;
                }
                exprStr += inner[i];
                i++;
            }
            i++; // skip closing }
            // Parse conversion and format spec
            let conversion;
            let formatSpec;
            const bangIdx = exprStr.indexOf("!");
            const colonIdx = exprStr.indexOf(":");
            if (bangIdx >= 0 && (colonIdx < 0 || bangIdx < colonIdx)) {
                conversion = exprStr.slice(bangIdx + 1, colonIdx >= 0 ? colonIdx : undefined);
                if (colonIdx >= 0)
                    formatSpec = exprStr.slice(colonIdx + 1);
                exprStr = exprStr.slice(0, bangIdx);
            }
            else if (colonIdx >= 0) {
                formatSpec = exprStr.slice(colonIdx + 1);
                exprStr = exprStr.slice(0, colonIdx);
            }
            const expr = { kind: "Ident", name: exprStr.trim() };
            parts.push({ expr, conversion, formatSpec });
        }
        else if (inner[i] === "{" && inner[i + 1] === "{") {
            current += "{";
            i += 2;
        }
        else if (inner[i] === "}" && inner[i + 1] === "}") {
            current += "}";
            i += 2;
        }
        else {
            current += inner[i];
            i++;
        }
    }
    if (current)
        parts.push(current);
    return { kind: "Py_FStringExpr", parts };
}
// ─── Paren / List / Dict / Set Expressions ───────────────────────────────────
function transformParenExpr(node) {
    const selNode = child(node, "starExprList");
    if (!selNode) {
        // Empty tuple: ()
        return { kind: "Py_TupleExpr", elts: [] };
    }
    // Check for comprehension (generator)
    const compFor = child(node, "compFor");
    if (compFor) {
        const starExprs = transformStarExprList(selNode);
        const elt = starExprs.length > 0 ? starExprs[0] : { kind: "Ident", name: "_" };
        const generators = transformCompForChainFromNode(compFor);
        return { kind: "Py_ComprehensionExpr", type: "generator", elt, generators };
    }
    const elts = transformStarExprList(selNode);
    if (elts.length === 1) {
        // Check for trailing comma (makes it a tuple)
        // Just return as paren expr
        return { kind: "ParenExpr", x: elts[0] };
    }
    return { kind: "Py_TupleExpr", elts };
}
function transformListExpr(node) {
    const selNode = child(node, "starExprList");
    if (!selNode) {
        // Empty list
        return { kind: "CompositeLit", type: { kind: "Ident", name: "list" }, elts: [] };
    }
    // Check for list comprehension
    const compFor = child(node, "compFor");
    if (compFor) {
        const elts = transformStarExprList(selNode);
        const elt = elts.length > 0 ? elts[0] : { kind: "Ident", name: "_" };
        const generators = transformCompForChainFromNode(compFor);
        return { kind: "Py_ComprehensionExpr", type: "list", elt, generators };
    }
    const elts = transformStarExprList(selNode);
    return { kind: "CompositeLit", type: { kind: "Ident", name: "list" }, elts };
}
function transformDictSetExpr(node) {
    // Check for dict items starting with **
    const dictItems = child(node, "dictItems");
    if (dictItems) {
        return transformDictItemsNode(dictItems);
    }
    // Check for first expression
    const exprs = children(node, "expr");
    if (exprs.length === 0) {
        // Empty dict: {}
        return { kind: "Py_DictExpr", keys: [], values: [] };
    }
    // Check for colon (dict) vs no colon (set)
    if (tok(node, "Colon") !== undefined) {
        // Dict literal or dict comprehension
        const compFor = child(node, "compFor");
        if (compFor) {
            // Dict comprehension
            const elt = exprs[0] ? transformExpr(exprs[0]) : { kind: "Ident", name: "_" };
            const keyExpr = exprs[1] ? transformExpr(exprs[1]) : undefined;
            const generators = transformCompForChainFromNode(compFor);
            // Swap: in the parser, first expr is key, second is value
            return { kind: "Py_ComprehensionExpr", type: "dict", elt: keyExpr || elt, keyExpr: elt, generators };
        }
        // Dict literal
        const keys = [];
        const values = [];
        // First pair
        keys.push(transformExpr(exprs[0]));
        values.push(exprs[1] ? transformExpr(exprs[1]) : { kind: "Ident", name: "_" });
        // Remaining pairs from dictItem
        const remainingItems = children(node, "dictItem");
        for (const di of remainingItems) {
            if (tok(di, "DoubleStar") !== undefined) {
                keys.push(null);
                const expr = child(di, "expr");
                values.push(expr ? transformExpr(expr) : { kind: "Ident", name: "_" });
            }
            else {
                const diExprs = children(di, "expr");
                keys.push(diExprs[0] ? transformExpr(diExprs[0]) : { kind: "Ident", name: "_" });
                values.push(diExprs[1] ? transformExpr(diExprs[1]) : { kind: "Ident", name: "_" });
            }
        }
        return { kind: "Py_DictExpr", keys, values };
    }
    // Set comprehension or set literal
    const compFor = child(node, "compFor");
    if (compFor) {
        const elt = transformExpr(exprs[0]);
        const generators = transformCompForChainFromNode(compFor);
        return { kind: "Py_ComprehensionExpr", type: "set", elt, generators };
    }
    // Set literal
    const setElts = [transformExpr(exprs[0])];
    const starExprs = children(node, "starExpr");
    for (const se of starExprs) {
        const hasStar = tok(se, "Star") !== undefined;
        const expr = child(se, "expr");
        const e = expr ? transformExpr(expr) : { kind: "Ident", name: "_" };
        if (hasStar) {
            setElts.push({ kind: "Py_StarExpr", value: e, isDouble: false });
        }
        else {
            setElts.push(e);
        }
    }
    return { kind: "Py_SetExpr", elts: setElts };
}
function transformDictItemsNode(node) {
    const items = children(node, "dictItem");
    const keys = [];
    const values = [];
    for (const di of items) {
        if (tok(di, "DoubleStar") !== undefined) {
            keys.push(null);
            const expr = child(di, "expr");
            values.push(expr ? transformExpr(expr) : { kind: "Ident", name: "_" });
        }
        else {
            const diExprs = children(di, "expr");
            keys.push(diExprs[0] ? transformExpr(diExprs[0]) : { kind: "Ident", name: "_" });
            values.push(diExprs[1] ? transformExpr(diExprs[1]) : { kind: "Ident", name: "_" });
        }
    }
    return { kind: "Py_DictExpr", keys, values };
}
// ─── Comprehensions ──────────────────────────────────────────────────────────
function transformCompForChain(node) {
    const compFors = children(node, "compFor");
    const result = [];
    for (const cf of compFors) {
        result.push(...transformCompForChainFromNode(cf));
    }
    return result;
}
function transformCompForChainFromNode(node) {
    const result = [];
    const isAsync = tok(node, "Async") !== undefined;
    const tl = child(node, "targetList");
    const target = tl ? transformTargetList(tl) : { kind: "Ident", name: "_" };
    const orExprNode = child(node, "orExpr");
    const iter = orExprNode ? transformExpr(orExprNode) : { kind: "Ident", name: "_" };
    // Collect if conditions and nested fors
    const ifs = [];
    const compIters = children(node, "compIter");
    const nestedFors = [];
    for (const ci of compIters) {
        const nestedFor = child(ci, "compFor");
        if (nestedFor) {
            nestedFors.push(nestedFor);
        }
        const compIf = child(ci, "compIf");
        if (compIf) {
            const orExpr = child(compIf, "orExpr");
            if (orExpr)
                ifs.push(transformExpr(orExpr));
        }
    }
    result.push({ target, iter, ifs, isAsync });
    // Recurse into nested fors
    for (const nf of nestedFors) {
        result.push(...transformCompForChainFromNode(nf));
    }
    return result;
}
// ─── Utilities ───────────────────────────────────────────────────────────────
function exprToString(expr) {
    switch (expr.kind) {
        case "Ident": return expr.name;
        case "SelectorExpr": return exprToString(expr.x) + "." + expr.sel;
        case "IndexExpr": return exprToString(expr.x) + "[" + exprToString(expr.index) + "]";
        case "Py_StarExpr": return (expr.isDouble ? "**" : "*") + exprToString(expr.value);
        case "Py_TupleExpr": return expr.elts.map(exprToString).join(", ");
        default: return "_";
    }
}
