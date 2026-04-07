// AST Diff: Compare two IR ASTs for semantic equivalence
// Used for round-trip testing: Go → AET → Go → AET, comparing the two AET ASTs
export function astDiff(a, b) {
    const diffs = [];
    // Compare declarations (skip package/imports as those are auto-generated)
    compareDeclLists(a.decls, b.decls, "root", diffs);
    return { equal: diffs.length === 0, differences: diffs };
}
function compareDeclLists(a, b, path, diffs) {
    if (a.length !== b.length) {
        diffs.push(`${path}: different number of declarations (${a.length} vs ${b.length})`);
        return;
    }
    for (let i = 0; i < a.length; i++) {
        compareNodes(a[i], b[i], `${path}[${i}]`, diffs);
    }
}
function compareNodes(a, b, path, diffs) {
    if (a === null && b === null)
        return;
    if (a === null || b === null) {
        diffs.push(`${path}: one is null`);
        return;
    }
    if (a === undefined && b === undefined)
        return;
    if (a === undefined || b === undefined) {
        diffs.push(`${path}: one is undefined`);
        return;
    }
    if (typeof a !== typeof b) {
        diffs.push(`${path}: type mismatch (${typeof a} vs ${typeof b})`);
        return;
    }
    if (typeof a !== "object") {
        // Skip stmtIndex comparisons (they're positional, not semantic)
        if (path.endsWith(".stmtIndex"))
            return;
        if (a !== b) {
            diffs.push(`${path}: value mismatch ("${a}" vs "${b}")`);
        }
        return;
    }
    if (Array.isArray(a)) {
        if (!Array.isArray(b)) {
            diffs.push(`${path}: array vs non-array`);
            return;
        }
        if (a.length !== b.length) {
            diffs.push(`${path}: array length mismatch (${a.length} vs ${b.length})`);
            return;
        }
        for (let i = 0; i < a.length; i++) {
            compareNodes(a[i], b[i], `${path}[${i}]`, diffs);
        }
        return;
    }
    // Object comparison
    const skipKeys = new Set(["stmtIndex", "tag", "modifiers"]);
    const keysA = Object.keys(a).filter(k => !skipKeys.has(k));
    const keysB = Object.keys(b).filter(k => !skipKeys.has(k));
    const allKeys = new Set([...keysA, ...keysB]);
    for (const key of allKeys) {
        if (skipKeys.has(key))
            continue; // Skip positional/auto-generated info
        compareNodes(a[key], b[key], `${path}.${key}`, diffs);
    }
}
// Pretty-print diff results
export function formatDiff(result) {
    if (result.equal)
        return "ASTs are semantically equivalent.";
    const lines = [`AST Diff: ${result.differences.length} difference(s) found:`];
    for (const d of result.differences) {
        lines.push(`  - ${d}`);
    }
    return lines.join("\n");
}
