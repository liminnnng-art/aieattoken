import { CstNode } from "chevrotain";
import * as IR from "../ir.js";
export declare function loadAliases(path?: string): void;
export declare function transform(cst: CstNode): IR.IRProgram;
