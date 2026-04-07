import * as IR from "../ir.js";
export interface JavaEmitOptions {
    className?: string;
    packageName?: string;
}
export declare function emit(program: IR.IRProgram, options?: JavaEmitOptions): string;
export declare function emitExpr(expr: IR.IRExpr): string;
