import * as IR from "../ir.js";
export declare function loadPythonReverseAliases(path?: string): void;
export declare function parsePythonFile(pythonFilePath: string): any;
export declare function pythonAstToIR(pyAst: any): IR.IRProgram;
export declare function pythonIrToAETP(program: IR.IRProgram): string;
