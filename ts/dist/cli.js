#!/usr/bin/env node
// Aieattoken CLI: transpile between AET, IR, and Go
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { parse } from "./parser/index.js";
import { transform, loadAliases } from "./transformer/index.js";
import { emit } from "./emitter/index.js";
import { astDiff, formatDiff } from "./ast-diff/index.js";
// Initialize aliases
const aliasPath = resolve(process.cwd(), "..", "stdlib-aliases.json");
loadAliases(aliasPath);
const args = process.argv.slice(2);
const command = args[0];
function usage() {
    console.log(`Usage:
  aet compile <file.aet>          # AET → Go (stdout)
  aet compile <file.aet> -o out.go  # AET → Go (file)
  aet diff <file1.aet> <file2.aet>  # AST diff between two AET files
  aet parse <file.aet>             # Show parse tree (debug)
  aet ir <file.aet>                # Show IR (debug)
  aet tokens <file>                # Count cl100k_base tokens`);
}
if (!command) {
    usage();
    process.exit(1);
}
switch (command) {
    case "compile": {
        const file = args[1];
        if (!file) {
            console.error("Missing input file");
            process.exit(1);
        }
        const code = readFileSync(resolve(file), "utf-8");
        const result = compileAET(code);
        if (result.error) {
            console.error(result.error);
            process.exit(1);
        }
        const outIdx = args.indexOf("-o");
        if (outIdx !== -1 && args[outIdx + 1]) {
            writeFileSync(resolve(args[outIdx + 1]), result.go);
            console.log(`Written to ${args[outIdx + 1]}`);
        }
        else {
            console.log(result.go);
        }
        break;
    }
    case "diff": {
        const file1 = args[1];
        const file2 = args[2];
        if (!file1 || !file2) {
            console.error("Missing input files");
            process.exit(1);
        }
        const code1 = readFileSync(resolve(file1), "utf-8");
        const code2 = readFileSync(resolve(file2), "utf-8");
        const ir1 = compileToIR(code1);
        const ir2 = compileToIR(code2);
        if (ir1.error) {
            console.error(`File 1: ${ir1.error}`);
            process.exit(1);
        }
        if (ir2.error) {
            console.error(`File 2: ${ir2.error}`);
            process.exit(1);
        }
        const diff = astDiff(ir1.ir, ir2.ir);
        console.log(formatDiff(diff));
        process.exit(diff.equal ? 0 : 1);
        break;
    }
    case "parse": {
        const file = args[1];
        if (!file) {
            console.error("Missing input file");
            process.exit(1);
        }
        const code = readFileSync(resolve(file), "utf-8");
        const result = parse(code);
        if (result.errors.length > 0) {
            console.error("Parse errors:", result.errors);
            process.exit(1);
        }
        console.log(JSON.stringify(result.cst, null, 2));
        break;
    }
    case "ir": {
        const file = args[1];
        if (!file) {
            console.error("Missing input file");
            process.exit(1);
        }
        const code = readFileSync(resolve(file), "utf-8");
        const result = compileToIR(code);
        if (result.error) {
            console.error(result.error);
            process.exit(1);
        }
        console.log(JSON.stringify(result.ir, null, 2));
        break;
    }
    default:
        usage();
        process.exit(1);
}
function compileAET(code) {
    const ir = compileToIR(code);
    if (ir.error)
        return { error: ir.error };
    return { go: emit(ir.ir) };
}
function compileToIR(code) {
    const parseResult = parse(code);
    if (parseResult.errors.length > 0) {
        return { error: `Parse error: ${parseResult.errors.join("; ")}` };
    }
    if (!parseResult.cst) {
        return { error: "No CST produced" };
    }
    const ir = transform(parseResult.cst);
    return { ir };
}
// Export for programmatic use
export { compileAET, compileToIR };
