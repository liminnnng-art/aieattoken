// Emitter: Converts IR to valid PEP 8 compliant Python source code
import * as IR from "../ir.js";
const STDLIB_ALIASES = {
    jd: { python: "json.dumps", pkg: "json" },
    jl: { python: "json.loads", pkg: "json" },
    jld: { python: "json.load", pkg: "json" },
    jdp: { python: "json.dump", pkg: "json" },
    pj: { python: "os.path.join", pkg: "os.path" },
    pe: { python: "os.path.exists", pkg: "os.path" },
    Pa: { python: "Path", pkg: "pathlib", fromImport: "from pathlib import Path" },
    oe: { python: "os.environ", pkg: "os" },
    gl: { python: "logging.getLogger", pkg: "logging" },
    li: { python: "logging.info", pkg: "logging" },
    lw: { python: "logging.warning", pkg: "logging" },
    le: { python: "logging.error", pkg: "logging" },
    dd: { python: "defaultdict", pkg: "collections", fromImport: "from collections import defaultdict" },
    Ct: { python: "Counter", pkg: "collections", fromImport: "from collections import Counter" },
    dq: { python: "deque", pkg: "collections", fromImport: "from collections import deque" },
    dn: { python: "datetime.now", pkg: "datetime", fromImport: "from datetime import datetime" },
    td: { python: "timedelta", pkg: "datetime", fromImport: "from datetime import timedelta" },
    ar: { python: "asyncio.run", pkg: "asyncio" },
    ag: { python: "asyncio.gather", pkg: "asyncio" },
    asl: { python: "asyncio.sleep", pkg: "asyncio" },
    sa: { python: "sys.argv", pkg: "sys" },
    sx: { python: "sys.exit", pkg: "sys" },
    rm: { python: "re.match", pkg: "re" },
    rs: { python: "re.search", pkg: "re" },
    rc: { python: "re.compile", pkg: "re" },
    ic: { python: "itertools.chain", pkg: "itertools" },
    ig: { python: "itertools.groupby", pkg: "itertools" },
    lc: { python: "lru_cache", pkg: "functools", fromImport: "from functools import lru_cache" },
    fi: { python: "field", pkg: "dataclasses", fromImport: "from dataclasses import field" },
    isi: { python: "isinstance", pkg: "builtins", auto: true },
    iss: { python: "issubclass", pkg: "builtins", auto: true },
    ha: { python: "hasattr", pkg: "builtins", auto: true },
    rv: { python: "reversed", pkg: "builtins", auto: true },
};
// Popular third-party aliases
const POPULAR_ALIASES = {
    rg: { python: "requests.get", pkg: "requests" },
    rp: { python: "requests.post", pkg: "requests" },
    DF: { python: "pd.DataFrame", pkg: "pandas" },
    Sr: { python: "pd.Series", pkg: "pandas" },
    na: { python: "np.array", pkg: "numpy" },
    nz: { python: "np.zeros", pkg: "numpy" },
    no: { python: "np.ones", pkg: "numpy" },
};
// ─── Import tracker ───────────────────────────────────────────────────────────
class ImportTracker {
    // "from X import Y" items: maps module -> set of names
    fromImports = new Map();
    // bare "import X" items
    bareImports = new Set();
    // raw "from X import Y" strings (for aliases with fromImport)
    rawFromImports = new Set();
    addBare(module) {
        if (module === "builtins")
            return;
        this.bareImports.add(module);
    }
    addFrom(module, name) {
        if (module === "builtins")
            return;
        if (!this.fromImports.has(module)) {
            this.fromImports.set(module, new Set());
        }
        this.fromImports.get(module).add(name);
    }
    addRawFrom(raw) {
        this.rawFromImports.add(raw);
    }
    /** Track a package used via dotted access (e.g., "json" from json.dumps). */
    trackPkg(pkg) {
        if (!pkg || pkg === "builtins")
            return;
        // If pkg has a dot, import the top-level module
        // e.g., "os.path" -> "import os.path" or "os" -> "import os"
        this.bareImports.add(pkg);
    }
    /**
     * Emit sorted import block.
     * PEP 8 ordering: stdlib, then third-party, then local.
     * Groups separated by blank lines.
     */
    getImportLines() {
        const STDLIB_MODULES = new Set([
            "abc", "argparse", "asyncio", "bisect", "collections", "contextlib",
            "copy", "csv", "dataclasses", "datetime", "decimal", "enum",
            "functools", "glob", "hashlib", "heapq", "http", "inspect",
            "io", "itertools", "json", "logging", "math", "operator",
            "os", "os.path", "pathlib", "pickle", "pprint", "random",
            "re", "shutil", "signal", "socket", "sqlite3", "string",
            "struct", "subprocess", "sys", "tempfile", "textwrap",
            "threading", "time", "typing", "unittest", "urllib",
            "uuid", "warnings", "weakref", "xml", "zipfile",
        ]);
        const THIRDPARTY_MODULES = new Set([
            "numpy", "pandas", "requests", "flask", "django",
            "sqlalchemy", "celery", "redis", "boto3", "pytest",
            "pydantic", "fastapi", "httpx", "aiohttp",
        ]);
        function classify(module) {
            const top = module.split(".")[0];
            if (STDLIB_MODULES.has(top) || STDLIB_MODULES.has(module))
                return "stdlib";
            if (THIRDPARTY_MODULES.has(top))
                return "thirdparty";
            return "local";
        }
        // Collect all import lines grouped by category
        const groups = {
            stdlib: [], thirdparty: [], local: [],
        };
        // Bare imports
        for (const mod of [...this.bareImports].sort()) {
            const cat = classify(mod);
            groups[cat].push(`import ${mod}`);
        }
        // From imports
        for (const [mod, names] of [...this.fromImports.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            const cat = classify(mod);
            const sortedNames = [...names].sort();
            groups[cat].push(`from ${mod} import ${sortedNames.join(", ")}`);
        }
        // Raw from imports (from alias definitions)
        for (const raw of [...this.rawFromImports].sort()) {
            // Extract module for classification
            const match = raw.match(/^from\s+(\S+)\s+import/);
            const mod = match ? match[1] : "";
            const cat = classify(mod);
            // Avoid duplicating if already present as a structured fromImport
            const alreadyPresent = groups[cat].some(line => line === raw);
            if (!alreadyPresent) {
                groups[cat].push(raw);
            }
        }
        // Deduplicate and sort within groups
        for (const key of ["stdlib", "thirdparty", "local"]) {
            groups[key] = [...new Set(groups[key])].sort();
        }
        const lines = [];
        if (groups.stdlib.length > 0) {
            lines.push(...groups.stdlib);
        }
        if (groups.thirdparty.length > 0) {
            if (lines.length > 0)
                lines.push("");
            lines.push(...groups.thirdparty);
        }
        if (groups.local.length > 0) {
            if (lines.length > 0)
                lines.push("");
            lines.push(...groups.local);
        }
        return lines;
    }
}
// ─── Module-level state reset per emit call ───────────────────────────────────
let importTracker;
let emitOptions;
// Track if we are inside a class body (for self restoration)
let _insideClassBody = false;
// Current class name stack (for nested classes)
let _classNameStack = [];
// ─── Public entry point ───────────────────────────────────────────────────────
export function emitPython(program, options) {
    importTracker = new ImportTracker();
    emitOptions = options ?? {};
    _insideClassBody = false;
    _classNameStack = [];
    // Emit all top-level declarations
    const bodyLines = [];
    let prevKind = "";
    for (let i = 0; i < program.decls.length; i++) {
        const decl = program.decls[i];
        // 2 blank lines between top-level definitions (PEP 8)
        if (i > 0 && isTopLevelDefinition(decl)) {
            bodyLines.push("");
            bodyLines.push("");
        }
        else if (i > 0 && isTopLevelDefinition(program.decls[i - 1]) && !isTopLevelDefinition(decl)) {
            bodyLines.push("");
            bodyLines.push("");
        }
        else if (i > 0) {
            // At least one blank line between top-level statements if previous was also a definition
            if (prevKind !== "") {
                // blank line between non-definition top-level statements for readability
            }
        }
        bodyLines.push(emitNode(decl, 0));
        prevKind = decl.kind;
    }
    // Assemble final output: imports, then body
    const header = [];
    const importLines = importTracker.getImportLines();
    if (importLines.length > 0) {
        header.push(...importLines);
        header.push("");
        header.push("");
    }
    // Join and ensure single trailing newline
    const result = header.join("\n") + bodyLines.join("\n");
    return result.replace(/\n*$/, "\n");
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function isTopLevelDefinition(node) {
    return node.kind === "FuncDecl" || node.kind === "Py_ClassDecl" ||
        node.kind === "StructDecl" || node.kind === "InterfaceDecl";
}
function indent(level) {
    return "    ".repeat(level);
}
// ─── Node emission ────────────────────────────────────────────────────────────
function emitNode(node, level) {
    switch (node.kind) {
        case "FuncDecl": return emitFuncDecl(node, level);
        case "StructDecl": return emitStructAsClass(node, level);
        case "InterfaceDecl": return emitInterfaceAsABC(node, level);
        case "TypeAlias": return emitTypeAlias(node, level);
        case "BlockStmt": return emitBlockBody(node, level);
        case "IfStmt": return emitIfStmt(node, level);
        case "ForStmt": return emitForStmt(node, level);
        case "RangeStmt": return emitRangeStmt(node, level);
        case "SwitchStmt": return emitSwitchStmt(node, level);
        case "ReturnStmt": return emitReturnStmt(node, level);
        case "AssignStmt": return emitAssignStmt(node, level);
        case "ShortDeclStmt": return emitShortDeclStmt(node, level);
        case "ExprStmt": return `${indent(level)}${emitExpr(node.expr)}`;
        case "IncDecStmt": return emitIncDecStmt(node, level);
        case "BranchStmt": return emitBranchStmt(node, level);
        case "VarDecl": return emitVarDecl(node, level);
        case "ConstDecl": return emitConstDecl(node, level);
        // Go-specific nodes — emit Python equivalents where possible
        case "DeferStmt": return emitDeferStmt(node, level);
        case "GoStmt": return emitGoStmt(node, level);
        case "SendStmt": return `${indent(level)}# channel send not supported in Python`;
        case "SelectStmt": return `${indent(level)}# select not supported in Python`;
        case "CommClause": return `${indent(level)}# comm clause not supported in Python`;
        // Python-specific nodes
        case "Py_ClassDecl": return emitPyClassDecl(node, level);
        case "Py_TryExcept": return emitPyTryExcept(node, level);
        case "Py_WithStmt": return emitPyWithStmt(node, level);
        case "Py_MatchStmt": return emitPyMatchStmt(node, level);
        case "Py_RaiseStmt": return emitPyRaiseStmt(node, level);
        case "Py_AssertStmt": return emitPyAssertStmt(node, level);
        case "Py_DeleteStmt": return emitPyDeleteStmt(node, level);
        case "Py_GlobalStmt": return emitPyGlobalStmt(node, level);
        case "Py_NonlocalStmt": return emitPyNonlocalStmt(node, level);
        case "Py_ForElse": return emitPyForElse(node, level);
        case "Py_WhileElse": return emitPyWhileElse(node, level);
        // Java-specific nodes — error in Python emitter
        case "Java_ClassDecl":
        case "Java_TryCatch":
        case "Java_EnhancedFor":
        case "Java_ThrowStmt":
        case "Java_RecordDecl":
        case "Java_EnumDecl":
        case "Java_SealedInterfaceDecl":
            throw new Error(`Java-specific construct ${node.kind} not supported for Python target`);
        default:
            return `${indent(level)}# unknown node: ${node.kind}`;
    }
}
// ─── Function declaration ─────────────────────────────────────────────────────
function emitFuncDecl(node, level) {
    const lines = [];
    // Check if this is a Py_FuncDecl with Python-specific fields
    const pyNode = node;
    const isAsync = pyNode.isAsync ?? false;
    const decorators = pyNode.decorators ?? [];
    const pyParams = pyNode.params;
    // Resolve magic method name
    let funcName = node.name;
    if (IR.PY_MAGIC_METHODS[funcName]) {
        funcName = IR.PY_MAGIC_METHODS[funcName];
    }
    // Emit decorators
    for (const dec of decorators) {
        lines.push(`${indent(level)}@${emitExpr(dec.expr)}`);
    }
    // Build parameter list
    let paramStr;
    const isMethod = _insideClassBody;
    if (isPyParamList(pyParams)) {
        paramStr = emitPyParamList(pyParams, isMethod);
    }
    else {
        // Standard IR params (from Go/shared IR)
        const irParams = node.params;
        const paramParts = [];
        // Add self for methods
        if (isMethod) {
            paramParts.push("self");
        }
        for (const p of irParams) {
            if (emitOptions.typed && p.type) {
                paramParts.push(`${p.name}: ${mapTypeToPython(p.type)}`);
            }
            else {
                paramParts.push(p.name);
            }
        }
        paramStr = paramParts.join(", ");
    }
    // Return type annotation
    let returnAnnotation = "";
    if (emitOptions.typed) {
        if (pyNode.returnType) {
            returnAnnotation = ` -> ${pyNode.returnType}`;
        }
        else {
            const irNode = node;
            if (irNode.results && irNode.results.length > 0) {
                if (irNode.results.length === 1) {
                    returnAnnotation = ` -> ${mapTypeToPython(irNode.results[0])}`;
                }
                else {
                    const types = irNode.results.map(r => mapTypeToPython(r)).join(", ");
                    returnAnnotation = ` -> tuple[${types}]`;
                }
            }
        }
    }
    // Async prefix
    const asyncPrefix = isAsync ? "async " : "";
    lines.push(`${indent(level)}${asyncPrefix}def ${funcName}(${paramStr})${returnAnnotation}:`);
    // Docstring (if --docs mode)
    if (emitOptions.docs) {
        const docstring = generateDocstring(funcName, node);
        if (docstring) {
            lines.push(`${indent(level + 1)}${docstring}`);
        }
    }
    // Body
    const bodyStr = emitBlockBodyIndented(node.body, level + 1);
    if (bodyStr.trim() === "") {
        lines.push(`${indent(level + 1)}pass`);
    }
    else {
        lines.push(bodyStr);
    }
    return lines.join("\n");
}
/** Check if the params object is a Py_ParamList (has the params array structure). */
function isPyParamList(obj) {
    return obj && Array.isArray(obj.params);
}
/** Emit a Python-specific parameter list. */
function emitPyParamList(paramList, isMethod) {
    const parts = [];
    // Add self for methods
    if (isMethod) {
        parts.push("self");
    }
    // Positional-only params (before /)
    if (paramList.posonly && paramList.posonly.length > 0) {
        for (const p of paramList.posonly) {
            parts.push(emitPyParam(p));
        }
        parts.push("/");
    }
    // Regular params
    for (const p of paramList.params) {
        parts.push(emitPyParam(p));
    }
    // *args
    if (paramList.vararg) {
        parts.push(`*${emitPyParam(paramList.vararg)}`);
    }
    else if (paramList.kwonly && paramList.kwonly.length > 0) {
        // bare * to mark keyword-only
        parts.push("*");
    }
    // Keyword-only params (after *)
    if (paramList.kwonly) {
        for (const p of paramList.kwonly) {
            parts.push(emitPyParam(p));
        }
    }
    // **kwargs
    if (paramList.kwarg) {
        parts.push(`**${emitPyParam(paramList.kwarg)}`);
    }
    return parts.join(", ");
}
function emitPyParam(param) {
    let s = param.name;
    if (emitOptions.typed && param.type) {
        s += `: ${param.type}`;
    }
    if (param.default_) {
        // PEP 8: no spaces around = in keyword args/defaults
        s += `=${emitExpr(param.default_)}`;
    }
    return s;
}
/** Generate a minimal docstring from the function signature. */
function generateDocstring(name, node) {
    // Skip for trivial functions
    const irNode = node;
    if (!irNode.params || irNode.params.length === 0) {
        return `"""${name}."""`;
    }
    return `"""${name}."""`;
}
// ─── Struct -> Python class ───────────────────────────────────────────────────
function emitStructAsClass(node, level) {
    const lines = [];
    lines.push(`${indent(level)}class ${node.name}:`);
    if (node.fields.length === 0) {
        lines.push(`${indent(level + 1)}pass`);
        return lines.join("\n");
    }
    // __init__ method
    const paramParts = node.fields.map(f => {
        if (emitOptions.typed) {
            return `${f.name}: ${mapTypeToPython(f.type)}`;
        }
        return f.name;
    });
    lines.push(`${indent(level + 1)}def __init__(self, ${paramParts.join(", ")}):`);
    for (const f of node.fields) {
        lines.push(`${indent(level + 2)}self.${f.name} = ${f.name}`);
    }
    // __repr__
    lines.push("");
    lines.push(`${indent(level + 1)}def __repr__(self):`);
    if (node.fields.length === 0) {
        lines.push(`${indent(level + 2)}return f"${node.name}()"`);
    }
    else {
        const fieldFmts = node.fields.map(f => `${f.name}={self.${f.name}!r}`);
        lines.push(`${indent(level + 2)}return f"${node.name}(${fieldFmts.join(', ')})"`);
    }
    return lines.join("\n");
}
// ─── Interface -> ABC ─────────────────────────────────────────────────────────
function emitInterfaceAsABC(node, level) {
    importTracker.addFrom("abc", "ABC");
    importTracker.addFrom("abc", "abstractmethod");
    const lines = [];
    lines.push(`${indent(level)}class ${node.name}(ABC):`);
    if (node.methods.length === 0) {
        lines.push(`${indent(level + 1)}pass`);
        return lines.join("\n");
    }
    for (let i = 0; i < node.methods.length; i++) {
        if (i > 0)
            lines.push("");
        const m = node.methods[i];
        lines.push(`${indent(level + 1)}@abstractmethod`);
        const params = ["self", ...m.params.map(p => {
                if (emitOptions.typed) {
                    return `${p.name}: ${mapTypeToPython(p.type)}`;
                }
                return p.name;
            })].join(", ");
        let retAnnotation = "";
        if (emitOptions.typed && m.results.length > 0) {
            retAnnotation = ` -> ${mapTypeToPython(m.results[0])}`;
        }
        lines.push(`${indent(level + 1)}def ${m.name}(${params})${retAnnotation}:`);
        lines.push(`${indent(level + 2)}...`);
    }
    return lines.join("\n");
}
// ─── Type alias ───────────────────────────────────────────────────────────────
function emitTypeAlias(node, level) {
    return `${indent(level)}${node.name} = ${mapTypeToPython(node.underlying)}`;
}
// ─── Block body helpers ───────────────────────────────────────────────────────
/** Emit block body statements, each on its own line at the given indent level. */
function emitBlockBodyIndented(block, level) {
    if (block.stmts.length === 0) {
        return `${indent(level)}pass`;
    }
    return block.stmts.map(s => emitNode(s, level)).join("\n");
}
/** Emit block body for inline use (e.g., inside already-started blocks). */
function emitBlockBody(block, level) {
    if (block.stmts.length === 0) {
        return `${indent(level)}pass`;
    }
    return block.stmts.map(s => emitNode(s, level)).join("\n");
}
// ─── If statement ─────────────────────────────────────────────────────────────
function emitIfStmt(node, level) {
    let s = "";
    // Python does not have init statements in if — emit as preceding statement
    if (node.init) {
        s += emitNode(node.init, level) + "\n";
    }
    s += `${indent(level)}if ${emitCondExpr(node.cond)}:\n`;
    s += emitBlockBodyIndented(node.body, level + 1);
    if (node.else_) {
        if (node.else_.kind === "IfStmt") {
            s += "\n" + `${indent(level)}elif ` + emitIfStmtElif(node.else_, level);
        }
        else if (node.else_.kind === "BlockStmt") {
            s += "\n" + `${indent(level)}else:\n`;
            s += emitBlockBodyIndented(node.else_, level + 1);
        }
    }
    return s;
}
/** Emit the elif/else continuation of an if chain. */
function emitIfStmtElif(node, level) {
    let s = "";
    // Init statement before the elif condition
    if (node.init) {
        // Emit as a comment — Python can't have init in elif
        s += `${emitCondExpr(node.cond)}:  # init: ${emitNode(node.init, 0).trim()}\n`;
    }
    else {
        s += `${emitCondExpr(node.cond)}:\n`;
    }
    s += emitBlockBodyIndented(node.body, level + 1);
    if (node.else_) {
        if (node.else_.kind === "IfStmt") {
            s += "\n" + `${indent(level)}elif ` + emitIfStmtElif(node.else_, level);
        }
        else if (node.else_.kind === "BlockStmt") {
            s += "\n" + `${indent(level)}else:\n`;
            s += emitBlockBodyIndented(node.else_, level + 1);
        }
    }
    return s;
}
// ─── For statement ────────────────────────────────────────────────────────────
function emitForStmt(node, level) {
    let s = "";
    if (node.init && node.post) {
        // Classic for loop -> while loop with init before and post at end
        s += emitNode(node.init, level) + "\n";
        const cond = node.cond ? emitExpr(node.cond) : "True";
        s += `${indent(level)}while ${cond}:\n`;
        s += emitBlockBodyIndented(node.body, level + 1);
        s += "\n" + emitNode(node.post, level + 1);
    }
    else if (node.cond) {
        // While loop
        s += `${indent(level)}while ${emitExpr(node.cond)}:\n`;
        s += emitBlockBodyIndented(node.body, level + 1);
    }
    else {
        // Infinite loop
        s += `${indent(level)}while True:\n`;
        s += emitBlockBodyIndented(node.body, level + 1);
    }
    return s;
}
// ─── Range statement ──────────────────────────────────────────────────────────
function emitRangeStmt(node, level) {
    let s = "";
    const iterable = emitExpr(node.x);
    if (node.value && node.key && node.key !== "_") {
        // for key, value in enumerate(x):
        s += `${indent(level)}for ${node.key}, ${node.value} in enumerate(${iterable}):\n`;
    }
    else if (node.value) {
        // for value in x:
        s += `${indent(level)}for ${node.value} in ${iterable}:\n`;
    }
    else if (node.key && node.key !== "_") {
        // for key in range(len(x)):
        s += `${indent(level)}for ${node.key} in range(len(${iterable})):\n`;
    }
    else {
        // for _ in x:
        s += `${indent(level)}for _ in ${iterable}:\n`;
    }
    s += emitBlockBodyIndented(node.body, level + 1);
    return s;
}
// ─── Switch statement ─────────────────────────────────────────────────────────
function emitSwitchStmt(node, level) {
    let s = "";
    // Init statement
    if (node.init) {
        s += emitNode(node.init, level) + "\n";
    }
    if (node.tag) {
        // Emit as match/case (Python 3.10+)
        s += `${indent(level)}match ${emitExpr(node.tag)}:\n`;
        for (const c of node.cases) {
            if (c.values) {
                const pattern = c.values.map(emitExpr).join(" | ");
                s += `${indent(level + 1)}case ${pattern}:\n`;
            }
            else {
                s += `${indent(level + 1)}case _:\n`;
            }
            if (c.body.length === 0) {
                s += `${indent(level + 2)}pass\n`;
            }
            else {
                for (const stmt of c.body) {
                    // Skip break/fallthrough — Python match/case doesn't need them
                    if (stmt.kind === "BranchStmt") {
                        const bs = stmt;
                        if (bs.tok === "break" || bs.tok === "fallthrough")
                            continue;
                    }
                    s += emitNode(stmt, level + 2) + "\n";
                }
            }
        }
    }
    else {
        // Tagless switch -> if/elif/else chain
        s += emitTaglessSwitch(node, level);
    }
    return s.replace(/\n+$/, "");
}
function emitTaglessSwitch(node, level) {
    let s = "";
    let first = true;
    for (const c of node.cases) {
        if (c.values) {
            const cond = c.values.map(emitExpr).join(" or ");
            if (first) {
                s += `${indent(level)}if ${cond}:\n`;
                first = false;
            }
            else {
                s += `${indent(level)}elif ${cond}:\n`;
            }
        }
        else {
            s += `${indent(level)}else:\n`;
        }
        if (c.body.length === 0) {
            s += `${indent(level + 1)}pass\n`;
        }
        else {
            for (const stmt of c.body) {
                if (stmt.kind === "BranchStmt") {
                    const bs = stmt;
                    if (bs.tok === "break" || bs.tok === "fallthrough")
                        continue;
                }
                s += emitNode(stmt, level + 1) + "\n";
            }
        }
    }
    return s;
}
// ─── Return statement ─────────────────────────────────────────────────────────
function emitReturnStmt(node, level) {
    if (node.values.length === 0) {
        return `${indent(level)}return`;
    }
    if (node.values.length === 1) {
        return `${indent(level)}return ${emitExpr(node.values[0])}`;
    }
    // Multiple return values -> return as tuple
    const vals = node.values.map(emitExpr).join(", ");
    return `${indent(level)}return ${vals}`;
}
// ─── Assignment statement ─────────────────────────────────────────────────────
function emitAssignStmt(node, level) {
    const lhs = node.lhs.map(emitExpr).join(", ");
    const rhs = node.rhs.map(emitExpr).join(", ");
    return `${indent(level)}${lhs} ${node.op} ${rhs}`;
}
// ─── Short declaration ────────────────────────────────────────────────────────
function emitShortDeclStmt(node, level) {
    // Error propagation
    if (node.values.length === 1 && node.values[0].kind === "ErrorPropExpr") {
        return emitErrorPropDecl(node.names, node.values[0], level);
    }
    if (node.names.length === 1 && node.values.length === 1) {
        return `${indent(level)}${node.names[0]} = ${emitExpr(node.values[0])}`;
    }
    // Multiple assignments -> tuple unpacking
    if (node.names.length === node.values.length) {
        const names = node.names.join(", ");
        const values = node.values.map(emitExpr).join(", ");
        return `${indent(level)}${names} = ${values}`;
    }
    // Fallback: multiple names, single value (tuple unpack)
    const names = node.names.join(", ");
    const values = node.values.map(emitExpr).join(", ");
    return `${indent(level)}${names} = ${values}`;
}
function emitErrorPropDecl(names, errProp, level) {
    // In Python, error propagation is typically just a try/except
    const lines = [];
    lines.push(`${indent(level)}try:`);
    if (names.length === 1) {
        lines.push(`${indent(level + 1)}${names[0]} = ${emitExpr(errProp.x)}`);
    }
    else {
        lines.push(`${indent(level + 1)}${names.join(", ")} = ${emitExpr(errProp.x)}`);
    }
    lines.push(`${indent(level)}except Exception as e:`);
    if (errProp.wrap) {
        lines.push(`${indent(level + 1)}raise RuntimeError("${errProp.wrap}") from e`);
    }
    else {
        lines.push(`${indent(level + 1)}raise`);
    }
    return lines.join("\n");
}
// ─── IncDec statement ─────────────────────────────────────────────────────────
function emitIncDecStmt(node, level) {
    const x = emitExpr(node.x);
    if (node.op === "++") {
        return `${indent(level)}${x} += 1`;
    }
    return `${indent(level)}${x} -= 1`;
}
// ─── Branch statement ─────────────────────────────────────────────────────────
function emitBranchStmt(node, level) {
    switch (node.tok) {
        case "break": return `${indent(level)}break`;
        case "continue": return `${indent(level)}continue`;
        case "goto": return `${indent(level)}# goto ${node.label ?? ""} (not supported in Python)`;
        case "fallthrough": return `${indent(level)}# fallthrough (not applicable in Python)`;
        default: return `${indent(level)}# unknown branch: ${node.tok}`;
    }
}
// ─── Var declaration ──────────────────────────────────────────────────────────
function emitVarDecl(node, level) {
    if (node.value) {
        if (emitOptions.typed && node.type) {
            return `${indent(level)}${node.name}: ${mapTypeToPython(node.type)} = ${emitExpr(node.value)}`;
        }
        return `${indent(level)}${node.name} = ${emitExpr(node.value)}`;
    }
    if (node.type) {
        // Declaration without value — use type annotation with default
        const pyType = mapTypeToPython(node.type);
        const defaultVal = getDefaultValue(node.type);
        if (emitOptions.typed) {
            return `${indent(level)}${node.name}: ${pyType} = ${defaultVal}`;
        }
        return `${indent(level)}${node.name} = ${defaultVal}`;
    }
    return `${indent(level)}${node.name} = None`;
}
// ─── Const declaration ────────────────────────────────────────────────────────
function emitConstDecl(node, level) {
    const lines = [];
    for (const spec of node.specs) {
        // Python constants are UPPER_CASE by convention; we emit as-is
        if (spec.value) {
            if (emitOptions.typed && spec.type) {
                lines.push(`${indent(level)}${spec.name}: ${mapTypeToPython(spec.type)} = ${emitExpr(spec.value)}`);
            }
            else {
                lines.push(`${indent(level)}${spec.name} = ${emitExpr(spec.value)}`);
            }
        }
        else {
            lines.push(`${indent(level)}${spec.name} = None`);
        }
    }
    return lines.join("\n");
}
// ─── Go-specific nodes (best-effort translation) ─────────────────────────────
function emitDeferStmt(node, level) {
    // Python has no defer — emit as atexit or comment
    return `${indent(level)}# defer: ${emitExpr(node.call)}  (consider using try/finally or atexit)`;
}
function emitGoStmt(node, level) {
    // Emit as asyncio.create_task or threading hint
    return `${indent(level)}# go: ${emitExpr(node.call)}  (consider using asyncio.create_task or threading.Thread)`;
}
// ─── Python-specific node emission ────────────────────────────────────────────
function emitPyClassDecl(node, level) {
    const lines = [];
    // Decorators
    for (const dec of node.decorators) {
        lines.push(`${indent(level)}@${emitExpr(dec.expr)}`);
    }
    // Class header
    const baseParts = [];
    for (const base of node.bases) {
        baseParts.push(emitExpr(base));
    }
    for (const kw of node.keywords) {
        baseParts.push(`${kw.key}=${emitExpr(kw.value)}`);
    }
    if (baseParts.length > 0) {
        lines.push(`${indent(level)}class ${node.name}(${baseParts.join(", ")}):`);
    }
    else {
        lines.push(`${indent(level)}class ${node.name}:`);
    }
    // Body
    const savedInsideClassBody = _insideClassBody;
    _insideClassBody = true;
    _classNameStack.push(node.name);
    if (node.body.length === 0) {
        lines.push(`${indent(level + 1)}pass`);
    }
    else {
        for (let i = 0; i < node.body.length; i++) {
            const stmt = node.body[i];
            // 1 blank line between methods in a class (PEP 8)
            if (i > 0 && (stmt.kind === "FuncDecl" || node.body[i - 1].kind === "FuncDecl")) {
                lines.push("");
            }
            lines.push(emitNode(stmt, level + 1));
        }
    }
    _insideClassBody = savedInsideClassBody;
    _classNameStack.pop();
    return lines.join("\n");
}
function emitPyTryExcept(node, level) {
    const lines = [];
    lines.push(`${indent(level)}try:`);
    lines.push(emitBlockBodyIndented(node.body, level + 1));
    for (const handler of node.handlers) {
        if (handler.type && handler.name) {
            lines.push(`${indent(level)}except ${emitExpr(handler.type)} as ${handler.name}:`);
        }
        else if (handler.type) {
            lines.push(`${indent(level)}except ${emitExpr(handler.type)}:`);
        }
        else {
            lines.push(`${indent(level)}except:`);
        }
        lines.push(emitBlockBodyIndented(handler.body, level + 1));
    }
    if (node.elseBody) {
        lines.push(`${indent(level)}else:`);
        lines.push(emitBlockBodyIndented(node.elseBody, level + 1));
    }
    if (node.finallyBody) {
        lines.push(`${indent(level)}finally:`);
        lines.push(emitBlockBodyIndented(node.finallyBody, level + 1));
    }
    return lines.join("\n");
}
function emitPyWithStmt(node, level) {
    const lines = [];
    const asyncPrefix = node.isAsync ? "async " : "";
    const items = node.items.map(item => {
        let s = emitExpr(item.contextExpr);
        if (item.optionalVar) {
            s += ` as ${item.optionalVar}`;
        }
        return s;
    }).join(", ");
    lines.push(`${indent(level)}${asyncPrefix}with ${items}:`);
    lines.push(emitBlockBodyIndented(node.body, level + 1));
    return lines.join("\n");
}
function emitPyMatchStmt(node, level) {
    const lines = [];
    lines.push(`${indent(level)}match ${emitExpr(node.subject)}:`);
    for (const matchCase of node.cases) {
        let caseHeader = `${indent(level + 1)}case ${emitExpr(matchCase.pattern)}`;
        if (matchCase.guard) {
            caseHeader += ` if ${emitExpr(matchCase.guard)}`;
        }
        caseHeader += ":";
        lines.push(caseHeader);
        lines.push(emitBlockBodyIndented(matchCase.body, level + 2));
    }
    return lines.join("\n");
}
function emitPyRaiseStmt(node, level) {
    if (!node.exc) {
        return `${indent(level)}raise`;
    }
    let s = `${indent(level)}raise ${emitExpr(node.exc)}`;
    if (node.cause) {
        s += ` from ${emitExpr(node.cause)}`;
    }
    return s;
}
function emitPyAssertStmt(node, level) {
    let s = `${indent(level)}assert ${emitExpr(node.test)}`;
    if (node.msg) {
        s += `, ${emitExpr(node.msg)}`;
    }
    return s;
}
function emitPyDeleteStmt(node, level) {
    const targets = node.targets.map(emitExpr).join(", ");
    return `${indent(level)}del ${targets}`;
}
function emitPyGlobalStmt(node, level) {
    return `${indent(level)}global ${node.names.join(", ")}`;
}
function emitPyNonlocalStmt(node, level) {
    return `${indent(level)}nonlocal ${node.names.join(", ")}`;
}
function emitPyForElse(node, level) {
    const lines = [];
    const asyncPrefix = node.isAsync ? "async " : "";
    lines.push(`${indent(level)}${asyncPrefix}for ${emitExpr(node.target)} in ${emitExpr(node.iter)}:`);
    lines.push(emitBlockBodyIndented(node.body, level + 1));
    lines.push(`${indent(level)}else:`);
    lines.push(emitBlockBodyIndented(node.elseBody, level + 1));
    return lines.join("\n");
}
function emitPyWhileElse(node, level) {
    const lines = [];
    lines.push(`${indent(level)}while ${emitExpr(node.cond)}:`);
    lines.push(emitBlockBodyIndented(node.body, level + 1));
    lines.push(`${indent(level)}else:`);
    lines.push(emitBlockBodyIndented(node.elseBody, level + 1));
    return lines.join("\n");
}
// ─── Expression emission ──────────────────────────────────────────────────────
/** Emit condition expression, stripping outer parens to avoid double-wrapping. */
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
            return emitSelectorExpr(expr);
        case "IndexExpr":
            return `${emitExpr(expr.x)}[${emitExpr(expr.index)}]`;
        case "SliceExpr":
            return emitSliceExpr(expr);
        case "TypeAssertExpr":
            return emitTypeAssertExpr(expr);
        case "StarExpr":
            // Go pointer dereference — just emit the inner expression
            return emitExpr(expr.x);
        case "UnaryRecvExpr":
            return `# channel receive not supported in Python`;
        case "KeyValueExpr":
            return `${emitExpr(expr.key)}: ${emitExpr(expr.value)}`;
        case "ParenExpr":
            return `(${emitExpr(expr.x)})`;
        case "ErrorPropExpr":
            return emitExpr(expr.x);
        case "PipeExpr":
            return emitPipeExpr(expr);
        case "MapTypeExpr":
            return `dict[${emitExpr(expr.key)}, ${emitExpr(expr.value)}]`;
        case "ArrayTypeExpr":
            return `list[${emitExpr(expr.elt)}]`;
        case "ChanTypeExpr":
            return `# chan type not supported in Python`;
        case "FuncTypeExpr":
            return emitFuncTypeExpr(expr);
        case "InterfaceTypeExpr":
            return "object";
        case "StructTypeExpr":
            return "object";
        case "RawGoExpr":
            return `# raw Go: ${expr.code}`;
        // Python-specific expressions
        case "Py_LambdaExpr":
            return emitPyLambdaExpr(expr);
        case "Py_ComprehensionExpr":
            return emitPyComprehensionExpr(expr);
        case "Py_FStringExpr":
            return emitPyFStringExpr(expr);
        case "Py_TernaryExpr":
            return emitPyTernaryExpr(expr);
        case "Py_StarExpr":
            return emitPyStarExpr(expr);
        case "Py_YieldExpr":
            return emitPyYieldExpr(expr);
        case "Py_YieldFromExpr":
            return emitPyYieldFromExpr(expr);
        case "Py_AwaitExpr":
            return emitPyAwaitExpr(expr);
        case "Py_WalrusExpr":
            return emitPyWalrusExpr(expr);
        case "Py_DictExpr":
            return emitPyDictExpr(expr);
        case "Py_SetExpr":
            return emitPySetExpr(expr);
        case "Py_TupleExpr":
            return emitPyTupleExpr(expr);
        // Java-specific expressions — error in Python emitter
        case "Java_NewExpr":
        case "Java_LambdaExpr":
        case "Java_InstanceofExpr":
        case "Java_CastExpr":
        case "Java_TernaryExpr":
        case "Java_SwitchExpr":
            throw new Error(`Java-specific expression ${expr.kind} not supported for Python target`);
        default:
            return `# unknown expr: ${expr.kind}`;
    }
}
// ─── Identifier emission ──────────────────────────────────────────────────────
function emitIdent(expr) {
    switch (expr.name) {
        case "nil": return "None";
        case "null": return "None";
        case "true": return "True";
        case "false": return "False";
        case "iota": return "# iota (use enum.auto())";
        default: {
            // Check stdlib aliases
            const alias = STDLIB_ALIASES[expr.name];
            if (alias) {
                if (alias.fromImport) {
                    importTracker.addRawFrom(alias.fromImport);
                }
                else if (!alias.auto) {
                    importTracker.trackPkg(alias.pkg);
                }
                return alias.python;
            }
            // Check popular aliases
            const popAlias = POPULAR_ALIASES[expr.name];
            if (popAlias) {
                importTracker.trackPkg(popAlias.pkg);
                return popAlias.python;
            }
            return expr.name;
        }
    }
}
// ─── Basic literal emission ───────────────────────────────────────────────────
function emitBasicLit(expr) {
    switch (expr.type) {
        case "STRING":
            return expr.value;
        case "CHAR":
        case "RUNE":
            // Python uses strings for characters
            // Convert 'x' to "x"
            if (expr.value.startsWith("'") && expr.value.endsWith("'")) {
                return expr.value;
            }
            return expr.value;
        case "INT":
            return expr.value;
        case "FLOAT":
            return expr.value;
        default:
            return expr.value;
    }
}
// ─── Composite literal emission ───────────────────────────────────────────────
function emitCompositeLit(expr) {
    if (!expr.type) {
        // No type — emit as list literal
        const elts = expr.elts.map(emitExpr).join(", ");
        return `[${elts}]`;
    }
    const typeExpr = expr.type;
    // Map literal -> dict
    if (typeExpr.kind === "MapTypeExpr") {
        if (expr.elts.length === 0) {
            return "{}";
        }
        const pairs = expr.elts.map(emitExpr).join(", ");
        return `{${pairs}}`;
    }
    // Array/slice literal -> list
    if (typeExpr.kind === "ArrayTypeExpr") {
        const elts = expr.elts.map(emitExpr).join(", ");
        return `[${elts}]`;
    }
    // Struct literal -> constructor call
    if (typeExpr.kind === "Ident") {
        const args = expr.elts.map(e => {
            if (e.kind === "KeyValueExpr") {
                // Named args: key=value
                return `${emitExpr(e.key)}=${emitExpr(e.value)}`;
            }
            return emitExpr(e);
        }).join(", ");
        return `${typeExpr.name}(${args})`;
    }
    // Fallback
    const elts = expr.elts.map(emitExpr).join(", ");
    return `[${elts}]`;
}
// ─── Function literal emission ────────────────────────────────────────────────
function emitFuncLit(expr) {
    // Single-statement body can be a lambda
    if (expr.body.stmts.length === 1) {
        const stmt = expr.body.stmts[0];
        if (stmt.kind === "ReturnStmt" && stmt.values.length === 1) {
            const params = expr.params.map(p => p.name).join(", ");
            return `lambda ${params}: ${emitExpr(stmt.values[0])}`;
        }
        if (stmt.kind === "ExprStmt") {
            const params = expr.params.map(p => p.name).join(", ");
            return `lambda ${params}: ${emitExpr(stmt.expr)}`;
        }
    }
    // Multi-statement body — cannot be a lambda, emit as a local def
    // This is a heuristic; the parent should handle naming
    const params = expr.params.map(p => p.name).join(", ");
    const body = emitBlockBodyIndented(expr.body, 1);
    return `(lambda ${params}: None)  # multi-statement function literal — refactor needed`;
}
// ─── Binary expression emission ───────────────────────────────────────────────
function emitBinaryExpr(expr) {
    const left = emitExpr(expr.left);
    const right = emitExpr(expr.right);
    // Map Go/C operators to Python equivalents
    switch (expr.op) {
        case "&&": return `${left} and ${right}`;
        case "||": return `${left} or ${right}`;
        default: return `${left} ${expr.op} ${right}`;
    }
}
// ─── Unary expression emission ────────────────────────────────────────────────
function emitUnaryExpr(expr) {
    switch (expr.op) {
        case "!": return `not ${emitExpr(expr.x)}`;
        case "&": return emitExpr(expr.x); // Address-of has no Python equivalent
        case "^": return `~${emitExpr(expr.x)}`; // Go bitwise NOT
        default: return `${expr.op}${emitExpr(expr.x)}`;
    }
}
// ─── Call expression emission ─────────────────────────────────────────────────
function emitCallArg(arg) {
    // KeyValueExpr in a call context is a keyword argument: key=value
    // (not dict syntax key: value)
    if (arg.kind === "KeyValueExpr") {
        return `${emitExpr(arg.key)}=${emitExpr(arg.value)}`;
    }
    return emitExpr(arg);
}
function emitCallExpr(expr) {
    const args = expr.args.map(emitCallArg).join(", ");
    // Check if function is a stdlib alias
    if (expr.func.kind === "Ident") {
        const name = expr.func.name;
        const alias = STDLIB_ALIASES[name];
        if (alias) {
            if (alias.fromImport) {
                importTracker.addRawFrom(alias.fromImport);
            }
            else if (!alias.auto) {
                importTracker.trackPkg(alias.pkg);
            }
            return `${alias.python}(${args})`;
        }
        const popAlias = POPULAR_ALIASES[name];
        if (popAlias) {
            importTracker.trackPkg(popAlias.pkg);
            return `${popAlias.python}(${args})`;
        }
        // Built-in function mappings
        switch (name) {
            case "_t":
                // Ternary: _t(cond, ifTrue, ifFalse) -> value if cond else other
                if (expr.args.length === 3) {
                    return `${emitExpr(expr.args[1])} if ${emitExpr(expr.args[0])} else ${emitExpr(expr.args[2])}`;
                }
                break;
            case "ln":
            case "len":
                return `len(${args})`;
            case "cp":
            case "cap":
                return `len(${args})`;
            case "apl":
            case "append":
                if (expr.args.length >= 2) {
                    const lst = emitExpr(expr.args[0]);
                    if (expr.args.length === 2) {
                        return `${lst}.append(${emitExpr(expr.args[1])})`;
                    }
                    // Multiple elements
                    const elts = expr.args.slice(1).map(emitExpr).join(", ");
                    return `${lst}.extend([${elts}])`;
                }
                break;
            case "mk":
            case "make":
                return emitMakeCall(expr.args);
            case "nw":
            case "new":
                if (expr.args.length === 1) {
                    return `${emitExpr(expr.args[0])}()`;
                }
                break;
            case "dx":
            case "delete":
                if (expr.args.length === 2) {
                    return `del ${emitExpr(expr.args[0])}[${emitExpr(expr.args[1])}]`;
                }
                break;
            case "close":
                return `${emitExpr(expr.args[0])}.close()`;
            case "panic":
                return `raise RuntimeError(${args})`;
            case "println":
                return `print(${args})`;
            case "print":
                return `print(${args}, end="")`;
            case "string":
                if (expr.args.length === 1)
                    return `str(${args})`;
                break;
            case "int":
                if (expr.args.length === 1)
                    return `int(${args})`;
                break;
            case "int64":
                if (expr.args.length === 1)
                    return `int(${args})`;
                break;
            case "float64":
                if (expr.args.length === 1)
                    return `float(${args})`;
                break;
            case "float32":
                if (expr.args.length === 1)
                    return `float(${args})`;
                break;
            case "byte":
                if (expr.args.length === 1)
                    return `ord(${args})`;
                break;
            case "rune":
                if (expr.args.length === 1)
                    return `chr(${args})`;
                break;
        }
    }
    // Stdlib package method calls (e.g., fmt.Println -> print)
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
    const ellipsis = expr.ellipsis ? "" : ""; // Python handles *args differently
    return `${funcStr}(${args}${ellipsis})`;
}
function emitMakeCall(args) {
    if (args.length === 0)
        return `# make()`;
    const typeArg = args[0];
    if (typeArg.kind === "MapTypeExpr") {
        return "{}";
    }
    if (typeArg.kind === "ArrayTypeExpr") {
        if (args.length > 1) {
            // make([]int, n) -> [0] * n
            const size = emitExpr(args[1]);
            return `[None] * ${size}`;
        }
        return "[]";
    }
    if (typeArg.kind === "ChanTypeExpr") {
        importTracker.addFrom("asyncio", "Queue");
        return "asyncio.Queue()";
    }
    return `${emitExpr(typeArg)}()`;
}
/** Map Go stdlib package.method calls to Python equivalents. */
function mapStdlibCall(pkg, method, args) {
    const argStr = args.map(emitExpr).join(", ");
    switch (pkg) {
        case "fmt":
            switch (method) {
                case "Println": return `print(${argStr})`;
                case "Printf":
                    if (args.length >= 1) {
                        // Convert Printf format to Python
                        return `print(${emitExpr(args[0])} % (${args.slice(1).map(emitExpr).join(", ")}), end="")`;
                    }
                    return `print(${argStr})`;
                case "Print": return `print(${argStr}, end="")`;
                case "Sprintf":
                    if (args.length >= 1) {
                        return `${emitExpr(args[0])} % (${args.slice(1).map(emitExpr).join(", ")})`;
                    }
                    return `str(${argStr})`;
                case "Fprintf": {
                    if (args.length >= 2) {
                        const writer = emitExpr(args[0]);
                        const rest = args.slice(1).map(emitExpr).join(", ");
                        return `${writer}.write(${rest})`;
                    }
                    return `print(${argStr})`;
                }
                case "Errorf":
                    if (args.length >= 1) {
                        return `RuntimeError(${emitExpr(args[0])} % (${args.slice(1).map(emitExpr).join(", ")}))`;
                    }
                    return `RuntimeError(${argStr})`;
            }
            break;
        case "strings":
            switch (method) {
                case "Contains":
                    return args.length === 2 ? `(${emitExpr(args[1])} in ${emitExpr(args[0])})` : null;
                case "HasPrefix":
                    return args.length === 2 ? `${emitExpr(args[0])}.startswith(${emitExpr(args[1])})` : null;
                case "HasSuffix":
                    return args.length === 2 ? `${emitExpr(args[0])}.endswith(${emitExpr(args[1])})` : null;
                case "Split":
                    return args.length === 2 ? `${emitExpr(args[0])}.split(${emitExpr(args[1])})` : null;
                case "Join":
                    return args.length === 2 ? `${emitExpr(args[1])}.join(${emitExpr(args[0])})` : null;
                case "Replace":
                    return args.length >= 3 ? `${emitExpr(args[0])}.replace(${emitExpr(args[1])}, ${emitExpr(args[2])})` : null;
                case "ToLower":
                    return args.length === 1 ? `${emitExpr(args[0])}.lower()` : null;
                case "ToUpper":
                    return args.length === 1 ? `${emitExpr(args[0])}.upper()` : null;
                case "TrimSpace":
                    return args.length === 1 ? `${emitExpr(args[0])}.strip()` : null;
                case "Repeat":
                    return args.length === 2 ? `${emitExpr(args[0])} * ${emitExpr(args[1])}` : null;
                case "Index":
                    return args.length === 2 ? `${emitExpr(args[0])}.find(${emitExpr(args[1])})` : null;
                case "Count":
                    return args.length === 2 ? `${emitExpr(args[0])}.count(${emitExpr(args[1])})` : null;
                case "Trim":
                    return args.length === 2 ? `${emitExpr(args[0])}.strip(${emitExpr(args[1])})` : null;
            }
            break;
        case "strconv":
            switch (method) {
                case "Itoa":
                    return args.length === 1 ? `str(${emitExpr(args[0])})` : null;
                case "Atoi":
                    return args.length === 1 ? `int(${emitExpr(args[0])})` : null;
                case "FormatBool":
                    return args.length === 1 ? `str(${emitExpr(args[0])})` : null;
                case "ParseBool":
                    return args.length === 1 ? `bool(${emitExpr(args[0])})` : null;
                case "FormatFloat":
                    return args.length >= 1 ? `str(${emitExpr(args[0])})` : null;
                case "ParseFloat":
                    return args.length >= 1 ? `float(${emitExpr(args[0])})` : null;
                case "ParseInt":
                    return args.length >= 1 ? `int(${emitExpr(args[0])})` : null;
            }
            break;
        case "math":
            importTracker.addBare("math");
            switch (method) {
                case "Abs": return `abs(${argStr})`;
                case "Max": return `max(${argStr})`;
                case "Min": return `min(${argStr})`;
                case "Sqrt": return `math.sqrt(${argStr})`;
                case "Pow": return `${emitExpr(args[0])} ** ${emitExpr(args[1])}`;
                case "Floor": return `math.floor(${argStr})`;
                case "Ceil": return `math.ceil(${argStr})`;
                case "Round": return `round(${argStr})`;
                case "Log": return `math.log(${argStr})`;
                case "Log10": return `math.log10(${argStr})`;
                case "Sin": return `math.sin(${argStr})`;
                case "Cos": return `math.cos(${argStr})`;
            }
            break;
        case "os":
            importTracker.addBare("os");
            switch (method) {
                case "Exit": {
                    importTracker.addBare("sys");
                    return `sys.exit(${argStr})`;
                }
                case "Getenv":
                    return `os.environ.get(${argStr})`;
            }
            break;
        case "sort":
            switch (method) {
                case "Ints":
                case "Strings":
                    return args.length === 1 ? `${emitExpr(args[0])}.sort()` : null;
                case "Slice":
                    if (args.length === 2) {
                        return `${emitExpr(args[0])}.sort(key=${emitExpr(args[1])})`;
                    }
                    return args.length === 1 ? `${emitExpr(args[0])}.sort()` : null;
            }
            break;
        case "json":
            importTracker.addBare("json");
            return `json.${method.toLowerCase()}(${argStr})`;
        case "re":
            importTracker.addBare("re");
            return `re.${method.toLowerCase()}(${argStr})`;
    }
    return null;
}
// ─── Selector expression ──────────────────────────────────────────────────────
function emitSelectorExpr(expr) {
    // Self attribute restoration: if inside a class body and the selector
    // target is omitted or the parent is effectively "self"
    const x = emitExpr(expr.x);
    return `${x}.${expr.sel}`;
}
// ─── Slice expression ─────────────────────────────────────────────────────────
function emitSliceExpr(expr) {
    const x = emitExpr(expr.x);
    const low = expr.low ? emitExpr(expr.low) : "";
    const high = expr.high ? emitExpr(expr.high) : "";
    // Python slice: x[low:high]
    return `${x}[${low}:${high}]`;
}
// ─── Type assertion ───────────────────────────────────────────────────────────
function emitTypeAssertExpr(expr) {
    // Python has no type assertion; use a cast hint
    const typeName = mapTypeToPython(expr.type);
    return `${emitExpr(expr.x)}  # type: ${typeName}`;
}
// ─── Pipe expression ──────────────────────────────────────────────────────────
function emitPipeExpr(expr) {
    const collection = emitExpr(expr.x);
    const fn = emitExpr(expr.fn);
    switch (expr.op) {
        case "map":
            return `list(map(${fn}, ${collection}))`;
        case "filter":
            return `list(filter(${fn}, ${collection}))`;
        case "reduce": {
            importTracker.addFrom("functools", "reduce");
            const init = expr.init ? `, ${emitExpr(expr.init)}` : "";
            return `reduce(${fn}, ${collection}${init})`;
        }
        default:
            return `# pipe: ${expr.op}`;
    }
}
// ─── Func type expression ─────────────────────────────────────────────────────
function emitFuncTypeExpr(expr) {
    importTracker.addFrom("typing", "Callable");
    const params = expr.params.map(p => mapTypeToPython(p.type)).join(", ");
    if (expr.results.length === 0) {
        return `Callable[[${params}], None]`;
    }
    if (expr.results.length === 1) {
        return `Callable[[${params}], ${mapTypeToPython(expr.results[0])}]`;
    }
    const rets = expr.results.map(r => mapTypeToPython(r)).join(", ");
    return `Callable[[${params}], tuple[${rets}]]`;
}
// ─── Python-specific expression emission ──────────────────────────────────────
function emitPyLambdaExpr(expr) {
    const params = expr.params.map(p => {
        let s = p.name;
        if (p.default_) {
            s += `=${emitExpr(p.default_)}`;
        }
        return s;
    }).join(", ");
    return `lambda ${params}: ${emitExpr(expr.body)}`;
}
function emitPyComprehensionExpr(expr) {
    let generators = "";
    for (const gen of expr.generators) {
        const asyncPrefix = gen.isAsync ? "async " : "";
        generators += ` ${asyncPrefix}for ${emitExpr(gen.target)} in ${emitExpr(gen.iter)}`;
        for (const ifClause of gen.ifs) {
            generators += ` if ${emitExpr(ifClause)}`;
        }
    }
    switch (expr.type) {
        case "list":
            return `[${emitExpr(expr.elt)}${generators}]`;
        case "set":
            return `{${emitExpr(expr.elt)}${generators}}`;
        case "dict": {
            const key = expr.keyExpr ? emitExpr(expr.keyExpr) : emitExpr(expr.elt);
            const val = expr.keyExpr ? emitExpr(expr.elt) : "";
            if (expr.keyExpr) {
                return `{${key}: ${val}${generators}}`;
            }
            return `{${key}${generators}}`;
        }
        case "generator":
            return `(${emitExpr(expr.elt)}${generators})`;
        default:
            return `[${emitExpr(expr.elt)}${generators}]`;
    }
}
function emitPyFStringExpr(expr) {
    let result = 'f"';
    for (const part of expr.parts) {
        if (typeof part === "string") {
            result += part;
        }
        else {
            result += "{" + emitExpr(part.expr);
            if (part.conversion) {
                result += "!" + part.conversion;
            }
            if (part.formatSpec) {
                result += ":" + part.formatSpec;
            }
            result += "}";
        }
    }
    result += '"';
    return result;
}
function emitPyTernaryExpr(expr) {
    return `${emitExpr(expr.value)} if ${emitExpr(expr.test)} else ${emitExpr(expr.orElse)}`;
}
function emitPyStarExpr(expr) {
    const prefix = expr.isDouble ? "**" : "*";
    return `${prefix}${emitExpr(expr.value)}`;
}
function emitPyYieldExpr(expr) {
    if (expr.value) {
        return `yield ${emitExpr(expr.value)}`;
    }
    return "yield";
}
function emitPyYieldFromExpr(expr) {
    return `yield from ${emitExpr(expr.value)}`;
}
function emitPyAwaitExpr(expr) {
    return `await ${emitExpr(expr.value)}`;
}
function emitPyWalrusExpr(expr) {
    return `(${expr.target} := ${emitExpr(expr.value)})`;
}
function emitPyDictExpr(expr) {
    if (expr.keys.length === 0) {
        return "{}";
    }
    const pairs = [];
    for (let i = 0; i < expr.keys.length; i++) {
        const key = expr.keys[i];
        const value = expr.values[i];
        if (key === null) {
            // **spread
            pairs.push(`**${emitExpr(value)}`);
        }
        else {
            pairs.push(`${emitExpr(key)}: ${emitExpr(value)}`);
        }
    }
    return `{${pairs.join(", ")}}`;
}
function emitPySetExpr(expr) {
    if (expr.elts.length === 0) {
        return "set()";
    }
    const elts = expr.elts.map(emitExpr).join(", ");
    return `{${elts}}`;
}
function emitPyTupleExpr(expr) {
    if (expr.elts.length === 0) {
        return "()";
    }
    if (expr.elts.length === 1) {
        return `(${emitExpr(expr.elts[0])},)`;
    }
    const elts = expr.elts.map(emitExpr).join(", ");
    return `(${elts})`;
}
// ─── Type mapping ─────────────────────────────────────────────────────────────
function mapTypeToPython(irType) {
    const name = irType.name;
    // Pointer — strip
    if (irType.isPointer && irType.elementType) {
        return mapTypeToPython(irType.elementType);
    }
    // Map type
    if (irType.isMap && irType.keyType && irType.valueType) {
        const k = mapTypeToPython(irType.keyType);
        const v = mapTypeToPython(irType.valueType);
        return `dict[${k}, ${v}]`;
    }
    // Slice/array type
    if (irType.isSlice && irType.elementType) {
        return `list[${mapTypeToPython(irType.elementType)}]`;
    }
    // Channel type
    if (irType.isChan) {
        return "object  # channel";
    }
    // Primitive and common type mapping by name
    switch (name) {
        case "int": return "int";
        case "int8": return "int";
        case "int16": return "int";
        case "int32": return "int";
        case "int64": return "int";
        case "uint": return "int";
        case "uint8": return "int";
        case "uint16": return "int";
        case "uint32": return "int";
        case "uint64": return "int";
        case "float32": return "float";
        case "float64": return "float";
        case "string": return "str";
        case "bool": return "bool";
        case "byte": return "int";
        case "rune": return "str";
        case "error": return "Exception";
        case "interface{}": return "object";
        case "_in": return "object";
        case "any": return "object";
        case "void": return "None";
    }
    // Pointer prefix in name
    if (name.startsWith("*")) {
        return mapTypeToPython({ name: name.substring(1) });
    }
    // Slice prefix in name
    if (name.startsWith("[]")) {
        const elt = name.substring(2);
        return `list[${mapTypeToPython({ name: elt })}]`;
    }
    // Map prefix: map[K]V or mp[K]V
    const mapMatch = name.match(/^(?:map|mp)\[(.+?)\](.+)$/);
    if (mapMatch) {
        const k = mapTypeToPython({ name: mapMatch[1] });
        const v = mapTypeToPython({ name: mapMatch[2] });
        return `dict[${k}, ${v}]`;
    }
    // Chan prefix
    if (name.startsWith("chan ") || name.startsWith("chan<-") || name.startsWith("<-chan")) {
        return "object  # channel";
    }
    // Pass through user-defined types as-is
    return name;
}
/** Get a sensible Python default value for a given IR type. */
function getDefaultValue(irType) {
    const name = irType.name;
    if (irType.isMap)
        return "{}";
    if (irType.isSlice)
        return "[]";
    switch (name) {
        case "int":
        case "int8":
        case "int16":
        case "int32":
        case "int64":
        case "uint":
        case "uint8":
        case "uint16":
        case "uint32":
        case "uint64":
        case "byte":
            return "0";
        case "float32":
        case "float64":
            return "0.0";
        case "string":
            return '""';
        case "bool":
            return "False";
        case "rune":
            return '""';
        default:
            return "None";
    }
}
