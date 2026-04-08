import * as IR from "../ir.js";
export interface PythonEmitOptions {
    typed?: boolean;
    docs?: boolean;
}
export declare function emitPython(program: IR.IRProgram, options?: PythonEmitOptions): string;
export declare function emitExpr(expr: IR.IRExpr): string;
