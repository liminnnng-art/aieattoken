#!/usr/bin/env node
import { transform } from "./transformer/index.js";
import { transformJava } from "./transformer/java.js";
import { transformPython } from "./transformer/python.js";
declare function convertGoToAET(goFilePath: string, goCode: string): string | null;
declare function convertJavaToAET(javaFilePath: string, javaCode: string): string | null;
declare function convertJavaToAETJ(javaFilePath: string, javaCode: string): string | null;
declare function compileAETJToIR(code: string): {
    ir?: ReturnType<typeof transformJava>;
    error?: string;
};
declare function compileAETPToIR(code: string): {
    ir?: ReturnType<typeof transformPython>;
    error?: string;
};
declare function convertPythonToAETP(pyFilePath: string, _pyCode: string): string | null;
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
export { compileAET, compileAETToJava, compileToIR, compileAETJToIR, compileAETPToIR, convertGoToAET, convertJavaToAET, convertJavaToAETJ, convertPythonToAETP };
