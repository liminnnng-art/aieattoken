#!/usr/bin/env node
import { transform } from "./transformer/index.js";
declare function compileAET(code: string): {
    go?: string;
    error?: string;
};
declare function compileToIR(code: string): {
    ir?: ReturnType<typeof transform>;
    error?: string;
};
export { compileAET, compileToIR };
