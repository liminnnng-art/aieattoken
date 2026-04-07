#!/usr/bin/env node
import { transform } from "./transformer/index.js";
declare function convertGoToAET(goFilePath: string, goCode: string): string | null;
declare function convertJavaToAET(javaFilePath: string, javaCode: string): string | null;
declare function compileAET(code: string): {
    go?: string;
    error?: string;
};
declare function compileAETToJava(code: string, className?: string): {
    java?: string;
    error?: string;
};
declare function compileToIR(code: string): {
    ir?: ReturnType<typeof transform>;
    error?: string;
};
export { compileAET, compileAETToJava, compileToIR, convertGoToAET, convertJavaToAET };
