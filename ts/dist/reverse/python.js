// Reverse transpiler: Python → IR → AET-Python (.aetp)
// Uses ast_dumper.py (Python ast module) to get JSON AST,
// then converts to IR, then to AET-Python string.
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import * as IR from "../ir.js";
// ---------------------------------------------------------------------------
// Reverse alias map: "json.dumps" → "jd"
// ---------------------------------------------------------------------------
let pythonReverseAliasMap = Object.create(null);
export function loadPythonReverseAliases(path) {
    try {
        const p = path || resolve(process.cwd(), "..", "stdlib-aliases-python.json");
        const data = JSON.parse(readFileSync(p, "utf-8"));
        const aliases = data.aliases || {};
        for (const [alias, info] of Object.entries(aliases)) {
            pythonReverseAliasMap[info.python] = alias;
        }
    }
    catch { /* optional — aliases improve compression but are not required */ }
}
// ---------------------------------------------------------------------------
// Decorator abbreviation map: "dataclass" → "dc"
// ---------------------------------------------------------------------------
const DECORATOR_ABBREV = {
    dataclass: "dc",
};
const DECORATOR_ABBREV_REVERSE = Object.fromEntries(Object.entries(DECORATOR_ABBREV).map(([k, v]) => [k, v]));
// ---------------------------------------------------------------------------
// parsePythonFile — run ast_dumper.py via child_process, return parsed JSON AST
// ---------------------------------------------------------------------------
export function parsePythonFile(pythonFilePath) {
    const pythonCmd = findPythonCommand();
    const astDumperPath = findAstDumperPath();
    try {
        // On Windows, spaces in paths need quoting. Use an array form via shell.
        const q = (s) => s.includes(" ") ? `"${s}"` : s;
        const cmd = `${q(pythonCmd)} ${q(astDumperPath)} ${q(resolve(pythonFilePath))}`;
        const result = execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
        return JSON.parse(result);
    }
    catch (e) {
        throw new Error(`Failed to parse Python file: ${e.message}`);
    }
}
function findPythonCommand() {
    // On Windows, check known install locations FIRST (python/python3 commands
    // may be WindowsApps stubs that hang waiting for Microsoft Store)
    if (process.platform === "win32") {
        const windowsFallbacks = [
            "C:/Users/user/AppData/Local/Programs/Python/Python314/python.exe",
            "C:/Users/user/AppData/Local/Programs/Python/Python313/python.exe",
            "C:/Users/user/AppData/Local/Programs/Python/Python312/python.exe",
            "C:/Users/user/AppData/Local/Programs/Python/Python311/python.exe",
            "C:/Users/user/AppData/Local/Programs/Python/Python310/python.exe",
            "C:/Python314/python.exe",
            "C:/Python312/python.exe",
            "C:/Python311/python.exe",
            "C:/Python310/python.exe",
        ];
        for (const p of windowsFallbacks) {
            if (existsSync(p))
                return p;
        }
        // Try py launcher
        try {
            execSync("py -3 --version", { encoding: "utf-8", stdio: "pipe", timeout: 3000 });
            return "py -3";
        }
        catch { /* not available */ }
    }
    // Non-Windows: try python3, then python
    for (const cmd of ["python3", "python"]) {
        try {
            execSync(`${cmd} --version`, { encoding: "utf-8", stdio: "pipe", timeout: 3000 });
            return cmd;
        }
        catch { /* not on PATH */ }
    }
    throw new Error("Python not found. Install Python 3.10+ or ensure `python` is on PATH.");
}
function findAstDumperPath() {
    const candidates = [
        resolve(process.cwd(), "python-parser", "ast_dumper.py"),
        resolve(process.cwd(), "..", "python-parser", "ast_dumper.py"),
        resolve(process.cwd(), "..", "..", "python-parser", "ast_dumper.py"),
    ];
    // Also try relative to this module file
    try {
        const moduleDir = dirname(new URL(import.meta.url).pathname);
        candidates.push(resolve(moduleDir, "..", "..", "..", "python-parser", "ast_dumper.py"));
    }
    catch { /* import.meta.url may not resolve in all contexts */ }
    for (const p of candidates) {
        // Normalise Windows paths (URL pathname may add a leading /)
        const normalized = p.replace(/^\/([A-Za-z]:)/, "$1");
        if (existsSync(normalized))
            return normalized;
    }
    throw new Error("ast_dumper.py not found in any expected location.");
}
// ---------------------------------------------------------------------------
// pythonAstToIR — main entry: Python JSON AST → IR
// ---------------------------------------------------------------------------
export function pythonAstToIR(pyAst) {
    const decls = [];
    const stmtIdx = { val: 0 };
    const bodyStmts = pyAst.Body || [];
    // Strip module-level docstring (first Expr with string Constant)
    let startIdx = 0;
    if (bodyStmts.length > 0) {
        const first = bodyStmts[0];
        if (first.Kind === "Expr" &&
            first.Value?.Kind === "Constant" &&
            typeof first.Value?.Value === "string") {
            startIdx = 1;
        }
    }
    for (let i = startIdx; i < bodyStmts.length; i++) {
        const stmt = bodyStmts[i];
        const kind = stmt.Kind;
        // Skip imports — they are eliminated in AET-Python
        if (kind === "Import" || kind === "ImportFrom")
            continue;
        const converted = convertStmt(stmt, stmtIdx);
        if (converted) {
            decls.push(converted);
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
// Statement conversion
// ---------------------------------------------------------------------------
function nextIdx(stmtIdx) {
    return stmtIdx.val++;
}
function convertStmt(node, idx) {
    if (!node)
        return null;
    switch (node.Kind) {
        case "FunctionDef":
        case "AsyncFunctionDef":
            return convertFuncDef(node, idx);
        case "ClassDef":
            return convertClassDef(node, idx);
        case "Return":
            return {
                kind: "ReturnStmt",
                values: node.Value ? [convertExpr(node.Value)] : [],
                stmtIndex: nextIdx(idx),
            };
        case "Assign":
            return convertAssign(node, idx);
        case "AugAssign":
            return {
                kind: "AssignStmt",
                lhs: [convertExpr(node.Target)],
                rhs: [convertExpr(node.Value)],
                op: (node.Op || "+") + "=",
                stmtIndex: nextIdx(idx),
            };
        case "AnnAssign":
            return convertAnnAssign(node, idx);
        case "For":
        case "AsyncFor":
            return convertFor(node, idx);
        case "While":
            return convertWhile(node, idx);
        case "If":
            return convertIf(node, idx);
        case "With":
        case "AsyncWith":
            return convertWith(node, idx);
        case "Raise":
            return {
                kind: "Py_RaiseStmt",
                exc: node.Exc ? convertExpr(node.Exc) : undefined,
                cause: node.Cause ? convertExpr(node.Cause) : undefined,
                stmtIndex: nextIdx(idx),
            };
        case "Try":
        case "TryStar":
            return convertTry(node, idx);
        case "Assert":
            return {
                kind: "Py_AssertStmt",
                test: convertExpr(node.Test),
                msg: node.Msg ? convertExpr(node.Msg) : undefined,
                stmtIndex: nextIdx(idx),
            };
        case "Import":
        case "ImportFrom":
            // Imports are eliminated
            return null;
        case "Delete":
            return {
                kind: "Py_DeleteStmt",
                targets: (node.Targets || []).map(convertExpr),
                stmtIndex: nextIdx(idx),
            };
        case "Global":
            return {
                kind: "Py_GlobalStmt",
                names: node.Names || [],
                stmtIndex: nextIdx(idx),
            };
        case "Nonlocal":
            return {
                kind: "Py_NonlocalStmt",
                names: node.Names || [],
                stmtIndex: nextIdx(idx),
            };
        case "Pass":
            // Pass is represented by an empty block — return null to skip
            return null;
        case "Break":
            return {
                kind: "BranchStmt",
                tok: "break",
                stmtIndex: nextIdx(idx),
            };
        case "Continue":
            return {
                kind: "BranchStmt",
                tok: "continue",
                stmtIndex: nextIdx(idx),
            };
        case "Expr":
            return {
                kind: "ExprStmt",
                expr: convertExpr(node.Value),
                stmtIndex: nextIdx(idx),
            };
        case "Match":
            return convertMatch(node, idx);
        default:
            return null;
    }
}
// ---------------------------------------------------------------------------
// Function definition
// ---------------------------------------------------------------------------
function convertFuncDef(node, idx) {
    const isAsync = node.Kind === "AsyncFunctionDef";
    const rawName = node.Name || "";
    // Map dunder methods to short names
    const name = IR.PY_MAGIC_REVERSE[rawName] || rawName;
    // Convert arguments
    const argsNode = node.Args || {};
    const paramList = convertArguments(argsNode);
    // Convert decorators
    const decorators = convertDecorators(node.Decorators || []);
    // Detect method: first param is self or cls
    let isMethod = false;
    const allRawArgs = argsNode.Args || [];
    if (allRawArgs.length > 0) {
        const firstName = allRawArgs[0].Arg || "";
        if (firstName === "self" || firstName === "cls") {
            isMethod = true;
            // Remove self/cls from params
            paramList.params = paramList.params.filter(p => p.name !== "self" && p.name !== "cls");
        }
    }
    // Convert body, stripping leading docstring
    const rawBody = node.Body || [];
    const body = convertBodyStrippingDocstring(rawBody, idx);
    const result = {
        kind: "FuncDecl",
        name,
        isAsync,
        params: paramList,
        decorators,
        body,
        stmtIndex: nextIdx(idx),
        isMethod,
    };
    return result;
}
function convertArguments(argsNode) {
    const rawArgs = argsNode.Args || [];
    const defaults = argsNode.Defaults || [];
    const kwOnlyArgs = argsNode.KwOnlyArgs || [];
    const kwDefaults = argsNode.KwDefaults || [];
    const posOnlyArgs = argsNode.PosOnlyArgs || [];
    // Defaults align from the right for regular args
    const defaultOffset = rawArgs.length - defaults.length;
    const params = rawArgs.map((a, i) => {
        const p = { name: a.Arg || "_" };
        // Type annotation — not included in default mode, but preserved in IR for typed mode
        if (a.Annotation) {
            p.type = exprToTypeString(a.Annotation);
        }
        // Default value
        const defIdx = i - defaultOffset;
        if (defIdx >= 0 && defaults[defIdx]) {
            p.default_ = convertExpr(defaults[defIdx]);
        }
        return p;
    });
    let vararg;
    if (argsNode.Vararg) {
        vararg = { name: argsNode.Vararg.Arg || "args" };
        if (argsNode.Vararg.Annotation) {
            vararg.type = exprToTypeString(argsNode.Vararg.Annotation);
        }
    }
    let kwarg;
    if (argsNode.Kwarg) {
        kwarg = { name: argsNode.Kwarg.Arg || "kwargs" };
        if (argsNode.Kwarg.Annotation) {
            kwarg.type = exprToTypeString(argsNode.Kwarg.Annotation);
        }
    }
    let kwonly;
    if (kwOnlyArgs.length > 0) {
        kwonly = kwOnlyArgs.map((a, i) => {
            const p = { name: a.Arg || "_" };
            if (a.Annotation)
                p.type = exprToTypeString(a.Annotation);
            if (kwDefaults[i])
                p.default_ = convertExpr(kwDefaults[i]);
            return p;
        });
    }
    let posonly;
    if (posOnlyArgs.length > 0) {
        posonly = posOnlyArgs.map((a) => {
            const p = { name: a.Arg || "_" };
            if (a.Annotation)
                p.type = exprToTypeString(a.Annotation);
            return p;
        });
    }
    return { params, vararg, kwarg, kwonly, posonly };
}
/** Convert an annotation expression to a type string for IR. */
function exprToTypeString(node) {
    if (!node)
        return "";
    if (typeof node === "string")
        return node;
    switch (node.Kind) {
        case "Name": return node.Id || "";
        case "Attribute": {
            const base = exprToTypeString(node.Value);
            return base ? `${base}.${node.Attr}` : node.Attr || "";
        }
        case "Subscript": {
            const base = exprToTypeString(node.Value);
            const slice = exprToTypeString(node.Slice);
            return `${base}[${slice}]`;
        }
        case "Tuple": {
            const elts = (node.Elts || []).map(exprToTypeString);
            return elts.join(",");
        }
        case "Constant": {
            if (node.Value === null || node.Value === "None")
                return "None";
            return String(node.Value);
        }
        case "BinOp": {
            if (node.Op === "|") {
                return `${exprToTypeString(node.Left)}|${exprToTypeString(node.Right)}`;
            }
            return `${exprToTypeString(node.Left)}`;
        }
        default: return "";
    }
}
function convertDecorators(decoList) {
    return decoList.map((d) => ({ expr: convertExpr(d) }));
}
/** Convert body statements, stripping a leading docstring (first Constant that is a string). */
function convertBodyStrippingDocstring(body, idx) {
    let stmts = body;
    // Strip leading docstring: first statement is Expr with Constant string
    if (stmts.length > 0) {
        const first = stmts[0];
        if (first.Kind === "Expr" &&
            first.Value?.Kind === "Constant" &&
            typeof first.Value?.Value === "string") {
            stmts = stmts.slice(1);
        }
    }
    const converted = stmts
        .map(s => convertStmt(s, idx))
        .filter(Boolean);
    return { kind: "BlockStmt", stmts: converted };
}
function convertBlockBody(body, idx) {
    const converted = (body || [])
        .map(s => convertStmt(s, idx))
        .filter(Boolean);
    return { kind: "BlockStmt", stmts: converted };
}
// ---------------------------------------------------------------------------
// Class definition
// ---------------------------------------------------------------------------
function convertClassDef(node, idx) {
    const name = node.Name || "";
    const bases = (node.Bases || []).map(convertExpr);
    const keywords = (node.Keywords || []).map((kw) => ({
        key: kw.Arg || "",
        value: convertExpr(kw.Value),
    }));
    const decorators = convertDecorators(node.Decorators || []);
    // Convert body, stripping class docstring
    const rawBody = node.Body || [];
    let bodyStmts = rawBody;
    // Strip leading docstring
    if (bodyStmts.length > 0) {
        const first = bodyStmts[0];
        if (first.Kind === "Expr" &&
            first.Value?.Kind === "Constant" &&
            typeof first.Value?.Value === "string") {
            bodyStmts = bodyStmts.slice(1);
        }
    }
    const convertedBody = bodyStmts
        .map(s => convertStmt(s, idx))
        .filter(Boolean);
    return {
        kind: "Py_ClassDecl",
        name,
        bases,
        keywords,
        decorators,
        body: convertedBody,
        stmtIndex: nextIdx(idx),
    };
}
// ---------------------------------------------------------------------------
// Assignment conversion
// ---------------------------------------------------------------------------
function convertAssign(node, idx) {
    const targets = (node.Targets || []).map(convertExpr);
    const value = convertExpr(node.Value);
    return {
        kind: "AssignStmt",
        lhs: targets,
        rhs: [value],
        op: "=",
        stmtIndex: nextIdx(idx),
    };
}
function convertAnnAssign(node, idx) {
    const target = convertExpr(node.Target);
    if (node.Value) {
        return {
            kind: "AssignStmt",
            lhs: [target],
            rhs: [convertExpr(node.Value)],
            op: "=",
            stmtIndex: nextIdx(idx),
        };
    }
    // Annotation-only (no value): emit as VarDecl with type
    const typeName = node.Annotation ? exprToTypeString(node.Annotation) : "";
    const name = target.kind === "Ident" ? target.name : "_";
    return {
        kind: "VarDecl",
        name,
        type: typeName ? IR.simpleType(typeName) : undefined,
        value: undefined,
        stmtIndex: nextIdx(idx),
    };
}
// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------
function convertFor(node, idx) {
    const isAsync = node.Kind === "AsyncFor";
    const target = convertExpr(node.Target);
    const iter = convertExpr(node.Iter);
    const body = convertBlockBody(node.Body, idx);
    const elseBody = node.OrElse && node.OrElse.length > 0
        ? convertBlockBody(node.OrElse, idx)
        : null;
    // If there is an else clause or async modifier, use Py_ForElse
    if (elseBody || isAsync) {
        return {
            kind: "Py_ForElse",
            isAsync,
            target,
            iter,
            body,
            elseBody: elseBody || { kind: "BlockStmt", stmts: [] },
            stmtIndex: nextIdx(idx),
        };
    }
    // Simple for loop → IRRangeStmt for simple targets
    // Extract key/value from target when it's a simple 2-element tuple of Idents
    if (target.kind === "Py_TupleExpr") {
        const elts = target.elts;
        const key = elts[0]?.kind === "Ident" ? elts[0].name : undefined;
        const value = elts[1]?.kind === "Ident" ? elts[1].name : undefined;
        if (key && value && elts.length === 2) {
            return {
                kind: "RangeStmt",
                key,
                value,
                x: iter,
                body,
                stmtIndex: nextIdx(idx),
            };
        }
        // Complex tuple target → use Py_ForElse without else body
        return {
            kind: "Py_ForElse",
            isAsync,
            target,
            iter,
            body,
            elseBody: { kind: "BlockStmt", stmts: [] },
            stmtIndex: nextIdx(idx),
        };
    }
    // Single variable target
    if (target.kind === "Ident") {
        return {
            kind: "RangeStmt",
            key: target.name,
            x: iter,
            body,
            stmtIndex: nextIdx(idx),
        };
    }
    // Complex single target (e.g., star expression) → use Py_ForElse
    return {
        kind: "Py_ForElse",
        isAsync,
        target,
        iter,
        body,
        elseBody: { kind: "BlockStmt", stmts: [] },
        stmtIndex: nextIdx(idx),
    };
}
function convertWhile(node, idx) {
    const cond = convertExpr(node.Test);
    const body = convertBlockBody(node.Body, idx);
    const elseBody = node.OrElse && node.OrElse.length > 0
        ? convertBlockBody(node.OrElse, idx)
        : null;
    if (elseBody) {
        return {
            kind: "Py_WhileElse",
            cond,
            body,
            elseBody,
            stmtIndex: nextIdx(idx),
        };
    }
    // Simple while → IRForStmt (while is a for with no init/post)
    return {
        kind: "ForStmt",
        cond,
        body,
        stmtIndex: nextIdx(idx),
    };
}
function convertIf(node, idx) {
    const cond = convertExpr(node.Test);
    const body = convertBlockBody(node.Body, idx);
    let else_;
    if (node.OrElse && node.OrElse.length > 0) {
        // Check if it's an elif chain (single If in OrElse)
        if (node.OrElse.length === 1 && node.OrElse[0].Kind === "If") {
            else_ = convertIf(node.OrElse[0], idx);
        }
        else {
            else_ = convertBlockBody(node.OrElse, idx);
        }
    }
    return {
        kind: "IfStmt",
        cond,
        body,
        else_,
        stmtIndex: nextIdx(idx),
    };
}
function convertWith(node, idx) {
    const isAsync = node.Kind === "AsyncWith";
    const items = (node.Items || []).map((item) => {
        const wi = { contextExpr: convertExpr(item.ContextExpr) };
        if (item.OptionalVars) {
            // OptionalVars is a Name node in most cases
            if (item.OptionalVars.Kind === "Name") {
                wi.optionalVar = item.OptionalVars.Id || "";
            }
            else {
                wi.optionalVar = exprToString(convertExpr(item.OptionalVars));
            }
        }
        return wi;
    });
    const body = convertBlockBody(node.Body, idx);
    return {
        kind: "Py_WithStmt",
        isAsync,
        items,
        body,
        stmtIndex: nextIdx(idx),
    };
}
// ---------------------------------------------------------------------------
// Try / Except
// ---------------------------------------------------------------------------
function convertTry(node, idx) {
    const body = convertBlockBody(node.Body, idx);
    const handlers = (node.Handlers || []).map((h) => ({
        type: h.Type ? convertExpr(h.Type) : undefined,
        name: h.Name || undefined,
        body: convertBlockBody(h.Body, idx),
    }));
    const elseBody = node.OrElse && node.OrElse.length > 0
        ? convertBlockBody(node.OrElse, idx)
        : undefined;
    const finallyBody = node.FinalBody && node.FinalBody.length > 0
        ? convertBlockBody(node.FinalBody, idx)
        : undefined;
    return {
        kind: "Py_TryExcept",
        body,
        handlers,
        elseBody,
        finallyBody,
        stmtIndex: nextIdx(idx),
    };
}
// ---------------------------------------------------------------------------
// Match statement
// ---------------------------------------------------------------------------
function convertMatch(node, idx) {
    const subject = convertExpr(node.Subject);
    const cases = (node.Cases || []).map((c) => ({
        pattern: convertExpr(c.Pattern),
        guard: c.Guard ? convertExpr(c.Guard) : undefined,
        body: convertBlockBody(c.Body, idx),
    }));
    return {
        kind: "Py_MatchStmt",
        subject,
        cases,
        stmtIndex: nextIdx(idx),
    };
}
// ---------------------------------------------------------------------------
// Expression conversion
// ---------------------------------------------------------------------------
function convertExpr(node) {
    if (!node)
        return { kind: "Ident", name: "_" };
    // Handle primitive values that are not AST node dicts
    if (typeof node === "string")
        return { kind: "BasicLit", type: "STRING", value: `"${escapeString(node)}"` };
    if (typeof node === "number") {
        return Number.isInteger(node)
            ? { kind: "BasicLit", type: "INT", value: String(node) }
            : { kind: "BasicLit", type: "FLOAT", value: String(node) };
    }
    if (typeof node === "boolean") {
        return { kind: "Ident", name: node ? "True" : "False" };
    }
    if (node === null) {
        return { kind: "Ident", name: "None" };
    }
    switch (node.Kind) {
        case "Name":
            return convertName(node);
        case "Constant":
            return convertConstant(node);
        case "BinOp":
            return {
                kind: "BinaryExpr",
                left: convertExpr(node.Left),
                op: node.Op || "+",
                right: convertExpr(node.Right),
            };
        case "UnaryOp": {
            const unOp = node.Op || "-";
            let operand = convertExpr(node.Operand);
            // Wrap BoolOp/Compare operands in parens when under "not" to preserve precedence
            if (unOp === "not" && operand.kind === "BinaryExpr") {
                const innerOp = operand.op.trim();
                if (innerOp === "and" || innerOp === "or") {
                    operand = { kind: "ParenExpr", x: operand };
                }
            }
            return {
                kind: "UnaryExpr",
                op: unOp,
                x: operand,
            };
        }
        case "BoolOp":
            return convertBoolOp(node);
        case "Compare":
            return convertCompare(node);
        case "Call":
            return convertCall(node);
        case "Attribute":
            return convertAttribute(node);
        case "Subscript":
            return convertSubscript(node);
        case "Starred":
            return {
                kind: "Py_StarExpr",
                value: convertExpr(node.Value),
                isDouble: false,
            };
        case "List":
            return {
                kind: "CompositeLit",
                elts: (node.Elts || []).map(convertExpr),
            };
        case "Tuple":
            return {
                kind: "Py_TupleExpr",
                elts: (node.Elts || []).map(convertExpr),
            };
        case "Dict":
            return {
                kind: "Py_DictExpr",
                keys: (node.Keys || []).map((k) => k ? convertExpr(k) : null),
                values: (node.Values || []).map(convertExpr),
            };
        case "Set":
            return {
                kind: "Py_SetExpr",
                elts: (node.Elts || []).map(convertExpr),
            };
        case "IfExp":
            return {
                kind: "Py_TernaryExpr",
                value: convertExpr(node.Body),
                test: convertExpr(node.Test),
                orElse: convertExpr(node.OrElse),
            };
        case "Lambda":
            return convertLambda(node);
        case "ListComp":
            return convertComprehension(node, "list");
        case "SetComp":
            return convertComprehension(node, "set");
        case "GeneratorExp":
            return convertComprehension(node, "generator");
        case "DictComp":
            return convertDictComprehension(node);
        case "JoinedStr":
            return convertFString(node);
        case "FormattedValue":
            // Standalone FormattedValue — wrap in an f-string
            return convertFString({ Kind: "JoinedStr", Values: [node] });
        case "Await":
            return {
                kind: "Py_AwaitExpr",
                value: convertExpr(node.Value),
            };
        case "Yield":
            return {
                kind: "Py_YieldExpr",
                value: node.Value ? convertExpr(node.Value) : undefined,
            };
        case "YieldFrom":
            return {
                kind: "Py_YieldFromExpr",
                value: convertExpr(node.Value),
            };
        case "NamedExpr":
            return {
                kind: "Py_WalrusExpr",
                target: node.Target?.Id || node.Target?.Name || "_",
                value: convertExpr(node.Value),
            };
        case "Slice":
            return {
                kind: "SliceExpr",
                x: { kind: "Ident", name: "_" }, // placeholder; actual base is set by Subscript handler
                low: node.Lower ? convertExpr(node.Lower) : undefined,
                high: node.Upper ? convertExpr(node.Upper) : undefined,
                max: node.Step ? convertExpr(node.Step) : undefined,
            };
        // Match patterns
        case "MatchValue":
            return convertExpr(node.Value);
        case "MatchSingleton":
            return convertConstantValue(node.Value);
        case "MatchSequence":
            return {
                kind: "CompositeLit",
                elts: (node.Patterns || []).map(convertExpr),
            };
        case "MatchMapping": {
            const keys = (node.Keys || []).map(convertExpr);
            const patterns = (node.Patterns || []).map(convertExpr);
            const dictKeys = keys;
            return {
                kind: "Py_DictExpr",
                keys: dictKeys,
                values: patterns,
            };
        }
        case "MatchClass": {
            const cls = convertExpr(node.Cls);
            const posPatterns = (node.Patterns || []).map(convertExpr);
            const kwdAttrs = node.KwdAttrs || [];
            const kwdPatterns = (node.KwdPatterns || []).map(convertExpr);
            // Emit as a call-like expression: Class(positional, kwd=pattern)
            const args = [...posPatterns];
            for (let i = 0; i < kwdAttrs.length; i++) {
                args.push({
                    kind: "KeyValueExpr",
                    key: { kind: "Ident", name: kwdAttrs[i] },
                    value: kwdPatterns[i] || { kind: "Ident", name: "_" },
                });
            }
            return { kind: "CallExpr", func: cls, args };
        }
        case "MatchStar": {
            const starName = node.Name || "_";
            return {
                kind: "Py_StarExpr",
                value: { kind: "Ident", name: starName },
                isDouble: false,
            };
        }
        case "MatchAs": {
            if (node.Pattern && node.Name) {
                // pattern as name → emit as BinaryExpr with "as" operator
                return {
                    kind: "BinaryExpr",
                    left: convertExpr(node.Pattern),
                    op: " as ",
                    right: { kind: "Ident", name: node.Name },
                };
            }
            if (node.Name) {
                return { kind: "Ident", name: node.Name };
            }
            // Wildcard _
            return { kind: "Ident", name: "_" };
        }
        case "MatchOr": {
            const patterns = (node.Patterns || []).map(convertExpr);
            return patterns.reduce((left, right) => ({
                kind: "BinaryExpr",
                left,
                op: "|",
                right,
            }));
        }
        default:
            return { kind: "Ident", name: node.Id || node.Name || "_" };
    }
}
function convertName(node) {
    const id = node.Id || "_";
    // Check for alias match on bare names
    const alias = pythonReverseAliasMap[id];
    if (alias)
        return { kind: "Ident", name: alias };
    return { kind: "Ident", name: id };
}
function convertConstant(node) {
    return convertConstantValue(node.Value);
}
function convertConstantValue(value) {
    if (value === null || value === undefined) {
        return { kind: "Ident", name: "None" };
    }
    if (value === true)
        return { kind: "Ident", name: "True" };
    if (value === false)
        return { kind: "Ident", name: "False" };
    if (value === "...")
        return { kind: "Ident", name: "..." };
    if (typeof value === "string") {
        const escaped = escapeString(value);
        return { kind: "BasicLit", type: "STRING", value: `"${escaped}"` };
    }
    if (typeof value === "number") {
        if (Number.isInteger(value)) {
            return { kind: "BasicLit", type: "INT", value: String(value) };
        }
        return { kind: "BasicLit", type: "FLOAT", value: String(value) };
    }
    // Complex number
    if (typeof value === "object" && value !== null && "Real" in value && "Imag" in value) {
        const real = value.Real;
        const imag = value.Imag;
        if (real === 0) {
            return { kind: "BasicLit", type: "FLOAT", value: `${imag}j` };
        }
        return {
            kind: "BinaryExpr",
            left: { kind: "BasicLit", type: "FLOAT", value: String(real) },
            op: "+",
            right: { kind: "BasicLit", type: "FLOAT", value: `${imag}j` },
        };
    }
    return { kind: "BasicLit", type: "STRING", value: `"${String(value)}"` };
}
function escapeString(s) {
    return s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
}
// ---------------------------------------------------------------------------
// BoolOp / Compare chain
// ---------------------------------------------------------------------------
function convertBoolOp(node) {
    const op = node.Op || "and";
    const values = node.Values || [];
    if (values.length === 0)
        return { kind: "Ident", name: "_" };
    if (values.length === 1)
        return convertExpr(values[0]);
    return values.slice(1).reduce((left, val) => ({
        kind: "BinaryExpr",
        left,
        op: ` ${op} `,
        right: convertExpr(val),
    }), convertExpr(values[0]));
}
function convertCompare(node) {
    const left = convertExpr(node.Left);
    const ops = node.Ops || [];
    const comparators = node.Comparators || [];
    if (ops.length === 0)
        return left;
    // Single comparison
    if (ops.length === 1) {
        return {
            kind: "BinaryExpr",
            left,
            op: formatCompOp(ops[0]),
            right: convertExpr(comparators[0]),
        };
    }
    // Chained comparison: a < b < c → a<b and b<c
    let result = {
        kind: "BinaryExpr",
        left,
        op: formatCompOp(ops[0]),
        right: convertExpr(comparators[0]),
    };
    for (let i = 1; i < ops.length; i++) {
        const nextComp = {
            kind: "BinaryExpr",
            left: convertExpr(comparators[i - 1]),
            op: formatCompOp(ops[i]),
            right: convertExpr(comparators[i]),
        };
        result = {
            kind: "BinaryExpr",
            left: result,
            op: " and ",
            right: nextComp,
        };
    }
    return result;
}
function formatCompOp(op) {
    // These ops need spaces around them for readability
    if (op === "in" || op === "not in" || op === "is" || op === "is not") {
        return ` ${op} `;
    }
    return op;
}
// ---------------------------------------------------------------------------
// Call expression
// ---------------------------------------------------------------------------
function convertCall(node) {
    const func = convertExpr(node.Func);
    const positionalArgs = (node.Args || []).map(convertExpr);
    const keywords = node.Keywords || [];
    // Convert keyword arguments
    const kwArgs = keywords.map((kw) => {
        if (kw.Arg === null || kw.Arg === undefined) {
            // **kwargs spread
            return {
                kind: "Py_StarExpr",
                value: convertExpr(kw.Value),
                isDouble: true,
            };
        }
        return {
            kind: "KeyValueExpr",
            key: { kind: "Ident", name: kw.Arg },
            value: convertExpr(kw.Value),
        };
    });
    const allArgs = [...positionalArgs, ...kwArgs];
    // Check for reverse alias on the function
    const funcName = flattenCallName(func);
    if (funcName) {
        const alias = pythonReverseAliasMap[funcName];
        if (alias) {
            return { kind: "CallExpr", func: { kind: "Ident", name: alias }, args: allArgs };
        }
    }
    return { kind: "CallExpr", func, args: allArgs };
}
/** Flatten a selector chain like json.dumps to "json.dumps". */
function flattenCallName(expr) {
    if (expr.kind === "Ident")
        return expr.name;
    if (expr.kind === "SelectorExpr") {
        const prefix = flattenCallName(expr.x);
        if (prefix)
            return `${prefix}.${expr.sel}`;
        return expr.sel;
    }
    return null;
}
// ---------------------------------------------------------------------------
// Attribute access
// ---------------------------------------------------------------------------
function convertAttribute(node) {
    const base = convertExpr(node.Value);
    const attr = node.Attr || "";
    // self.x → .x (handled in emitter, but mark in IR via SelectorExpr with self base)
    // We keep the full SelectorExpr and handle self-elimination in the emitter
    // Check for reverse alias on dotted name
    if (base.kind === "Ident") {
        const fullName = `${base.name}.${attr}`;
        const alias = pythonReverseAliasMap[fullName];
        if (alias)
            return { kind: "Ident", name: alias };
    }
    return { kind: "SelectorExpr", x: base, sel: attr };
}
// ---------------------------------------------------------------------------
// Subscript / Slice
// ---------------------------------------------------------------------------
function convertSubscript(node) {
    const base = convertExpr(node.Value);
    const sliceNode = node.Slice;
    if (!sliceNode) {
        return { kind: "IndexExpr", x: base, index: { kind: "Ident", name: "_" } };
    }
    // Slice
    if (sliceNode.Kind === "Slice") {
        return {
            kind: "SliceExpr",
            x: base,
            low: sliceNode.Lower ? convertExpr(sliceNode.Lower) : undefined,
            high: sliceNode.Upper ? convertExpr(sliceNode.Upper) : undefined,
            max: sliceNode.Step ? convertExpr(sliceNode.Step) : undefined,
        };
    }
    // Tuple subscript (multi-dimensional) — e.g., a[1, 2]
    if (sliceNode.Kind === "Tuple") {
        const elts = (sliceNode.Elts || []).map(convertExpr);
        return {
            kind: "IndexExpr",
            x: base,
            index: { kind: "Py_TupleExpr", elts },
        };
    }
    // Regular index
    return { kind: "IndexExpr", x: base, index: convertExpr(sliceNode) };
}
// ---------------------------------------------------------------------------
// Lambda
// ---------------------------------------------------------------------------
function convertLambda(node) {
    const argsNode = node.Args || {};
    const rawArgs = argsNode.Args || [];
    const defaults = argsNode.Defaults || [];
    const defaultOffset = rawArgs.length - defaults.length;
    const params = rawArgs.map((a, i) => {
        const p = { name: a.Arg || "_" };
        const defIdx = i - defaultOffset;
        if (defIdx >= 0 && defaults[defIdx]) {
            p.default_ = convertExpr(defaults[defIdx]);
        }
        return p;
    });
    // Handle vararg/kwarg in lambda
    if (argsNode.Vararg) {
        params.push({ name: `*${argsNode.Vararg.Arg || "args"}` });
    }
    if (argsNode.Kwarg) {
        params.push({ name: `**${argsNode.Kwarg.Arg || "kwargs"}` });
    }
    const body = convertExpr(node.Body);
    return {
        kind: "Py_LambdaExpr",
        params,
        body,
    };
}
// ---------------------------------------------------------------------------
// Comprehension
// ---------------------------------------------------------------------------
function convertComprehension(node, type) {
    return {
        kind: "Py_ComprehensionExpr",
        type,
        elt: convertExpr(node.Elt),
        generators: (node.Generators || []).map(convertGenerator),
    };
}
function convertDictComprehension(node) {
    return {
        kind: "Py_ComprehensionExpr",
        type: "dict",
        elt: convertExpr(node.Value),
        keyExpr: convertExpr(node.Key),
        generators: (node.Generators || []).map(convertGenerator),
    };
}
function convertGenerator(gen) {
    return {
        target: convertExpr(gen.Target),
        iter: convertExpr(gen.Iter),
        ifs: (gen.Ifs || []).map(convertExpr),
        isAsync: !!gen.IsAsync,
    };
}
// ---------------------------------------------------------------------------
// F-string
// ---------------------------------------------------------------------------
function convertFString(node) {
    const parts = [];
    const values = node.Values || [];
    for (const v of values) {
        if (v.Kind === "Constant" && typeof v.Value === "string") {
            parts.push(v.Value);
        }
        else if (v.Kind === "FormattedValue") {
            const part = {
                expr: convertExpr(v.Value),
            };
            if (v.Conversion) {
                part.conversion = v.Conversion;
            }
            if (v.FormatSpec) {
                // FormatSpec is typically a JoinedStr itself
                if (v.FormatSpec.Kind === "JoinedStr") {
                    part.formatSpec = fstringSpecToString(v.FormatSpec);
                }
                else if (typeof v.FormatSpec === "string") {
                    part.formatSpec = v.FormatSpec;
                }
            }
            parts.push(part);
        }
    }
    return { kind: "Py_FStringExpr", parts };
}
/** Convert a JoinedStr format spec to a simple string. */
function fstringSpecToString(node) {
    const values = node.Values || [];
    let result = "";
    for (const v of values) {
        if (v.Kind === "Constant" && typeof v.Value === "string") {
            result += v.Value;
        }
        else {
            // Nested expression in format spec — approximate as {expr}
            result += `{${exprToString(convertExpr(v.Value || v))}}`;
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// Utility: expression to simple string (for emitting)
// ---------------------------------------------------------------------------
function exprToString(expr) {
    // Minimal recursive printer for use in limited contexts
    switch (expr.kind) {
        case "Ident": return expr.name;
        case "BasicLit": return expr.value;
        case "SelectorExpr": return `${exprToString(expr.x)}.${expr.sel}`;
        case "CallExpr": return `${exprToString(expr.func)}(${expr.args.map(exprToString).join(",")})`;
        case "BinaryExpr": return `${exprToString(expr.left)}${expr.op}${exprToString(expr.right)}`;
        case "UnaryExpr": return `${expr.op}${exprToString(expr.x)}`;
        case "IndexExpr": return `${exprToString(expr.x)}[${exprToString(expr.index)}]`;
        default: return "_";
    }
}
// ===========================================================================
// pythonIrToAETP — convert IR to AET-Python (.aetp) string
// ===========================================================================
export function pythonIrToAETP(program) {
    const parts = ["!py-v1"];
    for (const decl of program.decls) {
        const s = pyNodeToAETP(decl);
        if (s)
            parts.push(s);
    }
    return parts.join(";");
}
// ---------------------------------------------------------------------------
// Node → AET-Python string
// ---------------------------------------------------------------------------
function pyNodeToAETP(node) {
    switch (node.kind) {
        case "FuncDecl": {
            const fd = node;
            return emitFuncDecl(fd);
        }
        case "Py_ClassDecl":
            return emitClassDecl(node);
        case "ReturnStmt": {
            const ret = node;
            if (ret.values.length === 0)
                return "^";
            return `^${ret.values.map(pyExprToAETP).join(",")}`;
        }
        case "IfStmt":
            return emitIfStmt(node);
        case "ForStmt": {
            // while loop: ForStmt with no init/post
            const fs = node;
            const header = fs.cond ? pyExprToAETP(fs.cond) : "";
            return `while ${header}{${pyBlockToAETP(fs.body)}}`;
        }
        case "RangeStmt": {
            const rs = node;
            return emitRangeStmt(rs);
        }
        case "AssignStmt": {
            const as_ = node;
            return `${as_.lhs.map(pyExprToAETP).join(",")}${as_.op}${as_.rhs.map(pyExprToAETP).join(",")}`;
        }
        case "ExprStmt":
            return pyExprToAETP(node.expr);
        case "BranchStmt":
            return node.tok;
        case "VarDecl": {
            const vd = node;
            // Annotation-only variable declarations in class body
            let s = vd.name;
            if (vd.type)
                s += `:${vd.type.name}`;
            if (vd.value)
                s += `=${pyExprToAETP(vd.value)}`;
            return s;
        }
        case "Py_TryExcept":
            return emitTryExcept(node);
        case "Py_WithStmt":
            return emitWithStmt(node);
        case "Py_RaiseStmt": {
            const rs = node;
            if (!rs.exc)
                return "raise";
            let s = `raise ${pyExprToAETP(rs.exc)}`;
            if (rs.cause)
                s += ` from ${pyExprToAETP(rs.cause)}`;
            return s;
        }
        case "Py_AssertStmt": {
            const as_ = node;
            let s = `assert ${pyExprToAETP(as_.test)}`;
            if (as_.msg)
                s += `,${pyExprToAETP(as_.msg)}`;
            return s;
        }
        case "Py_DeleteStmt": {
            const ds = node;
            return `del ${ds.targets.map(pyExprToAETP).join(",")}`;
        }
        case "Py_GlobalStmt":
            return `global ${node.names.join(",")}`;
        case "Py_NonlocalStmt":
            return `nonlocal ${node.names.join(",")}`;
        case "Py_ForElse":
            return emitForElse(node);
        case "Py_WhileElse":
            return emitWhileElse(node);
        case "Py_MatchStmt":
            return emitMatchStmt(node);
        case "ShortDeclStmt": {
            const sd = node;
            return `${sd.names.join(",")}:=${sd.values.map(pyExprToAETP).join(",")}`;
        }
        case "ConstDecl": {
            const cd = node;
            return cd.specs.map(s => `${s.name}${s.value ? `=${pyExprToAETP(s.value)}` : ""}`).join(";");
        }
        case "BlockStmt": {
            return pyBlockToAETP(node);
        }
        default:
            return `/* ${node.kind} */`;
    }
}
// ---------------------------------------------------------------------------
// Function declaration emitter
// ---------------------------------------------------------------------------
function emitFuncDecl(fd) {
    let s = "";
    // Decorators
    for (const dec of fd.decorators || []) {
        s += `@${emitDecoratorExpr(dec.expr)} `;
    }
    // Async prefix
    if (fd.isAsync)
        s += "async ";
    // Function name
    s += fd.name;
    // Parameters
    s += `(${emitParamList(fd.params)})`;
    // Body
    s += `{${pyBlockToAETP(fd.body)}}`;
    return s;
}
function emitDecoratorExpr(expr) {
    const raw = pyExprToAETP(expr);
    // Check for abbreviations
    return DECORATOR_ABBREV_REVERSE[raw] || raw;
}
function emitParamList(params) {
    const parts = [];
    // Positional-only params (before /)
    if (params.posonly && params.posonly.length > 0) {
        parts.push(...params.posonly.map(emitParam));
        parts.push("/");
    }
    // Regular params
    for (const p of params.params) {
        parts.push(emitParam(p));
    }
    // *args
    if (params.vararg) {
        parts.push(`*${params.vararg.name}`);
    }
    else if (params.kwonly && params.kwonly.length > 0) {
        // bare * separator before keyword-only params
        parts.push("*");
    }
    // Keyword-only params
    if (params.kwonly) {
        parts.push(...params.kwonly.map(emitParam));
    }
    // **kwargs
    if (params.kwarg) {
        parts.push(`**${params.kwarg.name}`);
    }
    return parts.join(",");
}
function emitParam(p) {
    let s = p.name;
    // Type annotations are eliminated in default mode
    if (p.default_) {
        s += `=${pyExprToAETP(p.default_)}`;
    }
    return s;
}
// ---------------------------------------------------------------------------
// Class declaration emitter
// ---------------------------------------------------------------------------
function emitClassDecl(cd) {
    let s = "";
    // Decorators
    for (const dec of cd.decorators || []) {
        s += `@${emitDecoratorExpr(dec.expr)} `;
    }
    s += `class ${cd.name}`;
    // Bases and keywords
    const baseExprs = (cd.bases || []).map(pyExprToAETP);
    const kwExprs = (cd.keywords || []).map(kw => `${kw.key}=${pyExprToAETP(kw.value)}`);
    const allArgs = [...baseExprs, ...kwExprs];
    if (allArgs.length > 0) {
        s += `(${allArgs.join(",")})`;
    }
    // Body
    const bodyParts = cd.body.map(pyNodeToAETP).filter(s => s && s !== "");
    s += `{${bodyParts.join(";")}}`;
    return s;
}
// ---------------------------------------------------------------------------
// Control flow emitters
// ---------------------------------------------------------------------------
function emitIfStmt(node) {
    // Detect __name__ == "__main__" guard → @main{...}
    if (isMainGuard(node.cond)) {
        return `@main{${pyBlockToAETP(node.body)}}`;
    }
    let s = `if ${pyExprToAETP(node.cond)}{${pyBlockToAETP(node.body)}}`;
    if (node.else_) {
        if (node.else_.kind === "IfStmt") {
            s += `elif ${pyExprToAETP(node.else_.cond)}{${pyBlockToAETP(node.else_.body)}}`;
            // Continue chaining
            let current = node.else_.else_;
            while (current) {
                if (current.kind === "IfStmt") {
                    const eif = current;
                    s += `elif ${pyExprToAETP(eif.cond)}{${pyBlockToAETP(eif.body)}}`;
                    current = eif.else_;
                }
                else if (current.kind === "BlockStmt") {
                    s += `else{${pyBlockToAETP(current)}}`;
                    current = undefined;
                }
                else {
                    break;
                }
            }
        }
        else if (node.else_.kind === "BlockStmt") {
            s += `else{${pyBlockToAETP(node.else_)}}`;
        }
    }
    return s;
}
/** Detect if condition is __name__ == "__main__" */
function isMainGuard(expr) {
    if (expr.kind !== "BinaryExpr")
        return false;
    const bin = expr;
    if (bin.op !== "==")
        return false;
    const left = bin.left;
    const right = bin.right;
    if (left.kind === "Ident" && left.name === "__name__") {
        if (right.kind === "BasicLit" && right.value === '"__main__"') {
            return true;
        }
    }
    return false;
}
function emitRangeStmt(rs) {
    // Emit for loop: for key,value in expr{body}
    const vars = [];
    if (rs.key)
        vars.push(rs.key);
    if (rs.value)
        vars.push(rs.value);
    const varStr = vars.join(",");
    return `for ${varStr} in ${pyExprToAETP(rs.x)}{${pyBlockToAETP(rs.body)}}`;
}
function emitForElse(node) {
    const asyncPrefix = node.isAsync ? "async " : "";
    const target = pyExprToAETP(node.target);
    let s = `${asyncPrefix}for ${target} in ${pyExprToAETP(node.iter)}{${pyBlockToAETP(node.body)}}`;
    // Only emit else clause if it has statements
    if (node.elseBody.stmts.length > 0) {
        s += `else{${pyBlockToAETP(node.elseBody)}}`;
    }
    return s;
}
function emitWhileElse(node) {
    return `while ${pyExprToAETP(node.cond)}{${pyBlockToAETP(node.body)}}else{${pyBlockToAETP(node.elseBody)}}`;
}
function emitTryExcept(node) {
    let s = `try{${pyBlockToAETP(node.body)}}`;
    for (const h of node.handlers) {
        if (h.type) {
            s += `except ${pyExprToAETP(h.type)}`;
            if (h.name)
                s += ` as ${h.name}`;
        }
        else {
            s += "except";
        }
        s += `{${pyBlockToAETP(h.body)}}`;
    }
    if (node.elseBody) {
        s += `else{${pyBlockToAETP(node.elseBody)}}`;
    }
    if (node.finallyBody) {
        s += `finally{${pyBlockToAETP(node.finallyBody)}}`;
    }
    return s;
}
function emitWithStmt(node) {
    const asyncPrefix = node.isAsync ? "async " : "";
    const items = node.items.map(item => {
        let s = pyExprToAETP(item.contextExpr);
        if (item.optionalVar)
            s += `as ${item.optionalVar}`;
        return s;
    }).join(",");
    return `${asyncPrefix}with ${items}{${pyBlockToAETP(node.body)}}`;
}
function emitMatchStmt(node) {
    const subject = pyExprToAETP(node.subject);
    const cases = node.cases.map(c => {
        let s = `case ${pyExprToAETP(c.pattern)}`;
        if (c.guard)
            s += ` if ${pyExprToAETP(c.guard)}`;
        s += `{${pyBlockToAETP(c.body)}}`;
        return s;
    }).join(";");
    return `match ${subject}{${cases}}`;
}
// ---------------------------------------------------------------------------
// Block → AET-Python string
// ---------------------------------------------------------------------------
function pyBlockToAETP(block) {
    return block.stmts.map(pyNodeToAETP).filter(s => s !== "").join(";");
}
// ---------------------------------------------------------------------------
// Operator precedence (higher number = tighter binding)
// ---------------------------------------------------------------------------
const PREC = {
    " or ": 1, "or": 1,
    " and ": 2, "and": 2,
    " in ": 3, "in": 3, " not in ": 3, "not in": 3,
    " is ": 3, "is": 3, " is not ": 3, "is not": 3,
    "==": 4, "!=": 4, "<": 4, ">": 4, "<=": 4, ">=": 4,
    "|": 5,
    "^": 6,
    "&": 7,
    "<<": 8, ">>": 8,
    "+": 9, "-": 9,
    "*": 10, "/": 10, "//": 10, "%": 10, "@": 10,
    "**": 12,
    " as ": 0,
};
function opPrecedence(op) {
    return PREC[op] ?? PREC[op.trim()] ?? 5;
}
function emitBinaryExpr(expr) {
    const parentPrec = opPrecedence(expr.op);
    const leftStr = needsParens(expr.left, parentPrec, "left", expr.op)
        ? `(${pyExprToAETP(expr.left)})`
        : pyExprToAETP(expr.left);
    const rightStr = needsParens(expr.right, parentPrec, "right", expr.op)
        ? `(${pyExprToAETP(expr.right)})`
        : pyExprToAETP(expr.right);
    return `${leftStr}${expr.op}${rightStr}`;
}
function needsParens(child, parentPrec, side, parentOp) {
    if (child.kind !== "BinaryExpr")
        return false;
    const childPrec = opPrecedence(child.op);
    // Lower precedence child always needs parens
    if (childPrec < parentPrec)
        return true;
    // Same precedence on right side needs parens for non-associative ops
    if (childPrec === parentPrec && side === "right" && parentOp.trim() !== "and" && parentOp.trim() !== "or")
        return true;
    return false;
}
// ---------------------------------------------------------------------------
// Expression → AET-Python string
// ---------------------------------------------------------------------------
function pyExprToAETP(expr) {
    switch (expr.kind) {
        case "Ident":
            return expr.name;
        case "BasicLit":
            return expr.value;
        case "CompositeLit": {
            // List literal
            const elts = expr.elts.map(pyExprToAETP).join(",");
            return `[${elts}]`;
        }
        case "BinaryExpr":
            return emitBinaryExpr(expr);
        case "UnaryExpr": {
            const opStr = expr.op;
            // "not" needs a space after it
            if (opStr === "not")
                return `not ${pyExprToAETP(expr.x)}`;
            return `${opStr}${pyExprToAETP(expr.x)}`;
        }
        case "CallExpr": {
            const args = expr.args.map(pyExprToAETP).join(",");
            return `${pyExprToAETP(expr.func)}(${args})`;
        }
        case "SelectorExpr": {
            const x = pyExprToAETP(expr.x);
            // self.attr → .attr
            if (x === "self")
                return `.${expr.sel}`;
            // cls.attr → keep as cls.attr (@ prefix conflicts with decorators)
            // The emitter will handle cls restoration for classmethods
            return `${x}.${expr.sel}`;
        }
        case "IndexExpr":
            return `${pyExprToAETP(expr.x)}[${pyExprToAETP(expr.index)}]`;
        case "SliceExpr": {
            const base = expr.x.kind === "Ident" && expr.x.name === "_"
                ? "" : pyExprToAETP(expr.x);
            const low = expr.low ? pyExprToAETP(expr.low) : "";
            const high = expr.high ? pyExprToAETP(expr.high) : "";
            if (expr.max) {
                return `${base}[${low}:${high}:${pyExprToAETP(expr.max)}]`;
            }
            return `${base}[${low}:${high}]`;
        }
        case "ParenExpr":
            return `(${pyExprToAETP(expr.x)})`;
        case "KeyValueExpr":
            return `${pyExprToAETP(expr.key)}=${pyExprToAETP(expr.value)}`;
        case "FuncLit": {
            const params = expr.params.map(p => p.name).join(",");
            return `|${params}|${pyBlockToAETP(expr.body)}`;
        }
        // Python-specific expressions
        case "Py_LambdaExpr": {
            const le = expr;
            const params = le.params.map(p => {
                let s = p.name;
                if (p.default_)
                    s += `=${pyExprToAETP(p.default_)}`;
                return s;
            }).join(",");
            return `|${params}|${pyExprToAETP(le.body)}`;
        }
        case "Py_ComprehensionExpr":
            return emitComprehension(expr);
        case "Py_FStringExpr":
            return emitFString(expr);
        case "Py_TernaryExpr": {
            const te = expr;
            return `${pyExprToAETP(te.value)} if ${pyExprToAETP(te.test)} else ${pyExprToAETP(te.orElse)}`;
        }
        case "Py_StarExpr": {
            const se = expr;
            return se.isDouble ? `**${pyExprToAETP(se.value)}` : `*${pyExprToAETP(se.value)}`;
        }
        case "Py_YieldExpr": {
            const ye = expr;
            return ye.value ? `yield ${pyExprToAETP(ye.value)}` : "yield";
        }
        case "Py_YieldFromExpr":
            return `yield from ${pyExprToAETP(expr.value)}`;
        case "Py_AwaitExpr":
            return `await ${pyExprToAETP(expr.value)}`;
        case "Py_WalrusExpr": {
            const we = expr;
            return `${we.target}:=${pyExprToAETP(we.value)}`;
        }
        case "Py_DictExpr": {
            const de = expr;
            const pairs = [];
            for (let i = 0; i < de.values.length; i++) {
                const key = de.keys[i];
                const val = de.values[i];
                if (key === null) {
                    // **spread
                    pairs.push(`**${pyExprToAETP(val)}`);
                }
                else {
                    pairs.push(`${pyExprToAETP(key)}:${pyExprToAETP(val)}`);
                }
            }
            return `{${pairs.join(",")}}`;
        }
        case "Py_SetExpr": {
            const se = expr;
            return `{${se.elts.map(pyExprToAETP).join(",")}}`;
        }
        case "Py_TupleExpr": {
            const te = expr;
            if (te.elts.length === 1) {
                // Single-element tuple needs trailing comma
                return `(${pyExprToAETP(te.elts[0])},)`;
            }
            return `(${te.elts.map(pyExprToAETP).join(",")})`;
        }
        // Fallback for shared IR types
        case "StarExpr":
            return `*${pyExprToAETP(expr.x)}`;
        case "MapTypeExpr":
            return `dict[${pyExprToAETP(expr.key)},${pyExprToAETP(expr.value)}]`;
        case "ArrayTypeExpr":
            return `list[${pyExprToAETP(expr.elt)}]`;
        default:
            return "_";
    }
}
// ---------------------------------------------------------------------------
// Comprehension emitter
// ---------------------------------------------------------------------------
function emitComprehension(comp) {
    const genParts = comp.generators.map(emitGenerator).join(" ");
    switch (comp.type) {
        case "list":
            return `[${pyExprToAETP(comp.elt)} ${genParts}]`;
        case "set":
            return `{${pyExprToAETP(comp.elt)} ${genParts}}`;
        case "generator":
            return `(${pyExprToAETP(comp.elt)} ${genParts})`;
        case "dict": {
            const keyStr = comp.keyExpr ? pyExprToAETP(comp.keyExpr) : "_";
            return `{${keyStr}:${pyExprToAETP(comp.elt)} ${genParts}}`;
        }
    }
}
function emitGenerator(gen) {
    const asyncPrefix = gen.isAsync ? "async " : "";
    let s = `${asyncPrefix}for ${pyExprToAETP(gen.target)} in ${pyExprToAETP(gen.iter)}`;
    for (const cond of gen.ifs) {
        s += ` if ${pyExprToAETP(cond)}`;
    }
    return s;
}
// ---------------------------------------------------------------------------
// F-string emitter
// ---------------------------------------------------------------------------
function emitFString(fstr) {
    let inner = "";
    for (const part of fstr.parts) {
        if (typeof part === "string") {
            inner += part;
        }
        else {
            let exprStr = pyExprToAETP(part.expr);
            // If the expression itself contains quotes, we need careful handling
            // but for most cases, simple embedding works
            let formatted = `{${exprStr}`;
            if (part.conversion) {
                formatted += `!${part.conversion}`;
            }
            if (part.formatSpec) {
                formatted += `:${part.formatSpec}`;
            }
            formatted += "}";
            inner += formatted;
        }
    }
    return `f"${inner}"`;
}
