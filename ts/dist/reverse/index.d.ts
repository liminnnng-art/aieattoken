import * as IR from "../ir.js";
export declare function loadReverseAliases(path?: string): void;
export declare function parseGoFile(goFilePath: string): any;
export declare function goAstToIR(goAst: any): IR.IRProgram;
export declare function irToAET(program: IR.IRProgram): string;
