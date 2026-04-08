/**
 * migrate-v3.ts — Migrate .aet files from v1/v2 keywords to v3
 *
 * Usage:
 *   node dist/migrate-v3.js <file-or-directory> [--dry-run]
 *
 * Replaces old keywords with shortened v3 equivalents,
 * respecting string literal boundaries and word boundaries.
 */
import fs from "node:fs";
import path from "node:path";
// ---------------------------------------------------------------------------
// Keyword replacement table (old -> new).
// ORDER MATTERS: longer keywords must come first so that e.g. "interface"
// is replaced before a hypothetical "inter" match, "delete" before "del", etc.
// ---------------------------------------------------------------------------
const KEYWORD_MAP = [
    ["interface", "_in"],
    ["fallthrough", "fth"],
    ["continue", "cnt"],
    ["filter", "flt"],
    ["append", "apl"],
    ["delete", "dx"],
    ["range", "rng"],
    ["copy", "cpy"],
    ["func", "fn"],
    ["type", "ty"],
    ["make", "mk"],
    ["new", "nw"],
    ["map", "mp"],
    ["len", "ln"],
    ["cap", "cp"],
];
// Characters that act as keyword delimiters in AET.
// A keyword is bounded by: start-of-string, end-of-string, or one of these.
const DELIMITERS = new Set([
    " ", "\t", "\n", "\r",
    "(", ")", "{", "}", "[", "]",
    ";", ",", ":", ".", "=", "!",
    "+", "-", "*", "/", "%",
    "&", "|", "^", "~",
    "<", ">",
    "?", "@", "#",
    "'",
    "\0",
]);
/**
 * Check whether a character (or undefined = boundary) is a keyword delimiter.
 */
function isDelimiter(ch) {
    if (ch === undefined)
        return true; // start/end of segment
    return DELIMITERS.has(ch);
}
/**
 * Split AET source into alternating segments of [code, string, code, string, ...].
 * String literals are delimited by `"..."`. We handle escaped quotes (`\"`).
 * Segments at even indices are code; segments at odd indices are string literals
 * (including the surrounding quotes).
 */
function splitCodeAndStrings(src) {
    const segments = [];
    let current = "";
    let inString = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inString) {
            current += ch;
            if (ch === "\\" && i + 1 < src.length) {
                // escaped character — consume next char too
                current += src[++i];
            }
            else if (ch === '"') {
                // end of string literal
                segments.push(current);
                current = "";
                inString = false;
            }
        }
        else {
            if (ch === '"') {
                // start of string literal — flush code segment
                segments.push(current);
                current = '"';
                inString = true;
            }
            else {
                current += ch;
            }
        }
    }
    // flush remaining
    if (current.length > 0) {
        segments.push(current);
    }
    return segments;
}
/**
 * Replace keywords in a code segment (not a string literal).
 * Uses manual scanning to enforce word-boundary rules via delimiter checks.
 */
function replaceKeywordsInCode(code, replacements) {
    for (const [oldKw, newKw] of replacements) {
        let result = "";
        let i = 0;
        while (i < code.length) {
            // Check if `oldKw` occurs at position i
            if (code.startsWith(oldKw, i)) {
                const before = i === 0 ? undefined : code[i - 1];
                const after = i + oldKw.length >= code.length ? undefined : code[i + oldKw.length];
                if (isDelimiter(before) && isDelimiter(after)) {
                    // It's a keyword match — replace
                    result += newKw;
                    i += oldKw.length;
                    continue;
                }
            }
            result += code[i];
            i++;
        }
        code = result;
    }
    return code;
}
/**
 * Replace the version marker: !v1 or !v2 -> !v3
 */
function replaceVersionMarker(src) {
    return src.replace(/^!v[12]\b/, "!v3");
}
/**
 * Migrate a single .aet file's content from v1/v2 to v3.
 * Returns [newContent, changes] where changes lists what was modified.
 */
function migrateContent(src) {
    const changes = [];
    // Step 1: Replace version marker
    const versionReplaced = replaceVersionMarker(src);
    if (versionReplaced !== src) {
        const oldVersion = src.match(/^(!v[12])/)?.[1] ?? "!v1/!v2";
        changes.push(`${oldVersion} -> !v3`);
    }
    // Step 2: Split into code and string segments
    const segments = splitCodeAndStrings(versionReplaced);
    // Step 3: Replace keywords only in code segments (even indices)
    const newSegments = segments.map((seg, idx) => {
        if (idx % 2 === 0) {
            // Code segment — apply keyword replacements
            return replaceKeywordsInCode(seg, KEYWORD_MAP);
        }
        // String literal — leave untouched
        return seg;
    });
    const result = newSegments.join("");
    // Determine which keywords were actually replaced
    if (result !== versionReplaced) {
        for (const [oldKw, newKw] of KEYWORD_MAP) {
            // Check if this particular keyword was present in the original code segments
            // and got replaced
            const origCode = segments.filter((_, i) => i % 2 === 0).join("\x00");
            const newCode = newSegments.filter((_, i) => i % 2 === 0).join("\x00");
            if (origCode !== newCode) {
                // Count occurrences of the old keyword in original code
                const oldSegments = splitCodeAndStrings(versionReplaced);
                let count = 0;
                for (let si = 0; si < oldSegments.length; si += 2) {
                    const codeSeg = oldSegments[si];
                    let pos = 0;
                    while (pos < codeSeg.length) {
                        if (codeSeg.startsWith(oldKw, pos)) {
                            const before = pos === 0 ? undefined : codeSeg[pos - 1];
                            const after = pos + oldKw.length >= codeSeg.length
                                ? undefined
                                : codeSeg[pos + oldKw.length];
                            if (isDelimiter(before) && isDelimiter(after)) {
                                count++;
                            }
                        }
                        pos++;
                    }
                }
                if (count > 0) {
                    changes.push(`${oldKw} -> ${newKw} (${count}x)`);
                }
            }
        }
    }
    return [result, changes];
}
/**
 * Collect all .aet files from a path (file or directory, non-recursive for files,
 * recursive for directories).
 */
function collectAetFiles(targetPath) {
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
        if (targetPath.endsWith(".aet")) {
            return [targetPath];
        }
        return [];
    }
    if (stat.isDirectory()) {
        const files = [];
        const entries = fs.readdirSync(targetPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(targetPath, entry.name);
            if (entry.isDirectory()) {
                files.push(...collectAetFiles(fullPath));
            }
            else if (entry.isFile() && entry.name.endsWith(".aet")) {
                files.push(fullPath);
            }
        }
        return files;
    }
    return [];
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const targets = args.filter((a) => !a.startsWith("--"));
    if (targets.length === 0) {
        console.error("Usage: node migrate-v3.js <file-or-directory> [...] [--dry-run]");
        process.exit(1);
    }
    let totalFiles = 0;
    let modifiedFiles = 0;
    let totalChanges = 0;
    for (const target of targets) {
        const resolvedPath = path.resolve(target);
        if (!fs.existsSync(resolvedPath)) {
            console.error(`Path not found: ${resolvedPath}`);
            continue;
        }
        const files = collectAetFiles(resolvedPath);
        for (const filePath of files) {
            totalFiles++;
            const src = fs.readFileSync(filePath, "utf-8");
            const [newContent, changes] = migrateContent(src);
            if (changes.length > 0) {
                modifiedFiles++;
                totalChanges += changes.length;
                const rel = path.relative(process.cwd(), filePath);
                console.log(`\n  ${rel}:`);
                for (const change of changes) {
                    console.log(`    - ${change}`);
                }
                if (!dryRun) {
                    fs.writeFileSync(filePath, newContent, "utf-8");
                }
            }
        }
    }
    console.log(`\n--- Migration summary ---`);
    console.log(`  Files scanned:  ${totalFiles}`);
    console.log(`  Files modified: ${modifiedFiles}`);
    console.log(`  Total changes:  ${totalChanges}`);
    if (dryRun) {
        console.log(`  (dry-run mode — no files were written)`);
    }
}
main();
