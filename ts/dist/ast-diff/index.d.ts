import * as IR from "../ir.js";
export interface DiffResult {
    equal: boolean;
    differences: string[];
}
export declare function astDiff(a: IR.IRProgram, b: IR.IRProgram): DiffResult;
export declare function formatDiff(result: DiffResult): string;
