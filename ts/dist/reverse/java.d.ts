import * as IR from "../ir.js";
export declare function loadJavaReverseAliases(path?: string): void;
export declare function parseJavaFile(javaFilePath: string): any;
export declare function javaAstToIR(javaAst: any): IR.IRProgram;
export declare function javaIrToAET(program: IR.IRProgram): string;
export declare function javaIrToAETJ(program: IR.IRProgram): string;
