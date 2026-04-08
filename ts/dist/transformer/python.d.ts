import { CstNode } from "chevrotain";
import * as IR from "../ir.js";
export declare function loadPythonAliases(path?: string): void;
export declare function transformPython(cst: CstNode): IR.IRProgram;
