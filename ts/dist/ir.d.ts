export type IRNode = IRProgram | IRFuncDecl | IRStructDecl | IRInterfaceDecl | IRTypeAlias | IRBlockStmt | IRIfStmt | IRForStmt | IRRangeStmt | IRSwitchStmt | IRCaseClause | IRSelectStmt | IRCommClause | IRReturnStmt | IRDeferStmt | IRGoStmt | IRAssignStmt | IRShortDeclStmt | IRExprStmt | IRIncDecStmt | IRSendStmt | IRBranchStmt | IRVarDecl | IRConstDecl | Java_ClassDecl | Java_TryCatch | Java_EnhancedFor | Java_ThrowStmt | Java_RecordDecl | Java_EnumDecl | Java_SealedInterfaceDecl | Py_ClassDecl | Py_TryExcept | Py_WithStmt | Py_MatchStmt | Py_RaiseStmt | Py_AssertStmt | Py_DeleteStmt | Py_GlobalStmt | Py_NonlocalStmt | Py_ForElse | Py_WhileElse;
export type IRExpr = IRIdent | IRBasicLit | IRCompositeLit | IRFuncLit | IRBinaryExpr | IRUnaryExpr | IRCallExpr | IRSelectorExpr | IRIndexExpr | IRSliceExpr | IRTypeAssertExpr | IRStarExpr | IRUnaryRecvExpr | IRKeyValueExpr | IRParenExpr | IRErrorPropExpr | IRPipeExpr | IRMapTypeExpr | IRArrayTypeExpr | IRChanTypeExpr | IRFuncTypeExpr | IRInterfaceTypeExpr | IRStructTypeExpr | IRRawGoExpr | Java_NewExpr | Java_LambdaExpr | Java_InstanceofExpr | Java_CastExpr | Java_TernaryExpr | Java_SwitchExpr | Py_LambdaExpr | Py_ComprehensionExpr | Py_FStringExpr | Py_TernaryExpr | Py_StarExpr | Py_YieldExpr | Py_YieldFromExpr | Py_AwaitExpr | Py_WalrusExpr | Py_DictExpr | Py_SetExpr | Py_TupleExpr;
export type IRType = {
    name: string;
    isPointer?: boolean;
    isSlice?: boolean;
    isMap?: boolean;
    isChan?: boolean;
    elementType?: IRType;
    keyType?: IRType;
    valueType?: IRType;
};
export interface IRProgram {
    kind: "Program";
    package: string;
    imports: IRImport[];
    decls: IRNode[];
    stmtIndex: number;
}
export interface IRImport {
    path: string;
    alias?: string;
}
export interface IRFuncDecl {
    kind: "FuncDecl";
    name: string;
    receiver?: {
        name: string;
        type: IRType;
        pointer: boolean;
    };
    typeParams?: string[];
    params: IRParam[];
    results: IRType[];
    body: IRBlockStmt;
    stmtIndex: number;
}
export interface IRParam {
    name: string;
    type: IRType;
}
export interface IRStructDecl {
    kind: "StructDecl";
    name: string;
    fields: IRField[];
    stmtIndex: number;
}
export interface IRField {
    name: string;
    type: IRType;
    tag?: string;
}
export interface IRInterfaceDecl {
    kind: "InterfaceDecl";
    name: string;
    methods: IRMethodSig[];
    stmtIndex: number;
}
export interface IRMethodSig {
    name: string;
    params: IRParam[];
    results: IRType[];
}
export interface IRTypeAlias {
    kind: "TypeAlias";
    name: string;
    underlying: IRType;
    stmtIndex: number;
}
export interface IRBlockStmt {
    kind: "BlockStmt";
    stmts: (IRNode | IRExprStmt)[];
}
export interface IRIfStmt {
    kind: "IfStmt";
    init?: IRNode;
    cond: IRExpr;
    body: IRBlockStmt;
    else_?: IRNode;
    stmtIndex: number;
}
export interface IRForStmt {
    kind: "ForStmt";
    init?: IRNode;
    cond?: IRExpr;
    post?: IRNode;
    body: IRBlockStmt;
    stmtIndex: number;
}
export interface IRRangeStmt {
    kind: "RangeStmt";
    key?: string;
    value?: string;
    x: IRExpr;
    body: IRBlockStmt;
    stmtIndex: number;
}
export interface IRSwitchStmt {
    kind: "SwitchStmt";
    init?: IRNode;
    tag?: IRExpr;
    cases: IRCaseClause[];
    stmtIndex: number;
}
export interface IRCaseClause {
    kind: "CaseClause";
    values?: IRExpr[];
    body: (IRNode | IRExprStmt)[];
}
export interface IRSelectStmt {
    kind: "SelectStmt";
    cases: IRCommClause[];
    stmtIndex: number;
}
export interface IRCommClause {
    kind: "CommClause";
    comm?: IRNode;
    body: (IRNode | IRExprStmt)[];
}
export interface IRReturnStmt {
    kind: "ReturnStmt";
    values: IRExpr[];
    stmtIndex: number;
}
export interface IRDeferStmt {
    kind: "DeferStmt";
    call: IRExpr;
    stmtIndex: number;
}
export interface IRGoStmt {
    kind: "GoStmt";
    call: IRExpr;
    stmtIndex: number;
}
export interface IRAssignStmt {
    kind: "AssignStmt";
    lhs: IRExpr[];
    rhs: IRExpr[];
    op: string;
    stmtIndex: number;
}
export interface IRShortDeclStmt {
    kind: "ShortDeclStmt";
    names: string[];
    values: IRExpr[];
    stmtIndex: number;
}
export interface IRExprStmt {
    kind: "ExprStmt";
    expr: IRExpr;
    stmtIndex: number;
}
export interface IRIncDecStmt {
    kind: "IncDecStmt";
    x: IRExpr;
    op: "++" | "--";
    stmtIndex: number;
}
export interface IRSendStmt {
    kind: "SendStmt";
    chan: IRExpr;
    value: IRExpr;
    stmtIndex: number;
}
export interface IRBranchStmt {
    kind: "BranchStmt";
    tok: "break" | "continue" | "goto" | "fallthrough";
    label?: string;
    stmtIndex: number;
}
export interface IRVarDecl {
    kind: "VarDecl";
    name: string;
    type?: IRType;
    value?: IRExpr;
    stmtIndex: number;
}
export interface IRConstDecl {
    kind: "ConstDecl";
    specs: {
        name: string;
        type?: IRType;
        value?: IRExpr;
    }[];
    stmtIndex: number;
}
export interface IRIdent {
    kind: "Ident";
    name: string;
}
export interface IRBasicLit {
    kind: "BasicLit";
    type: "INT" | "FLOAT" | "STRING" | "CHAR" | "RUNE";
    value: string;
}
export interface IRCompositeLit {
    kind: "CompositeLit";
    type?: IRExpr;
    elts: IRExpr[];
}
export interface IRFuncLit {
    kind: "FuncLit";
    params: IRParam[];
    results: IRType[];
    body: IRBlockStmt;
}
export interface IRBinaryExpr {
    kind: "BinaryExpr";
    left: IRExpr;
    op: string;
    right: IRExpr;
}
export interface IRUnaryExpr {
    kind: "UnaryExpr";
    op: string;
    x: IRExpr;
}
export interface IRCallExpr {
    kind: "CallExpr";
    func: IRExpr;
    args: IRExpr[];
    ellipsis?: boolean;
}
export interface IRSelectorExpr {
    kind: "SelectorExpr";
    x: IRExpr;
    sel: string;
}
export interface IRIndexExpr {
    kind: "IndexExpr";
    x: IRExpr;
    index: IRExpr;
}
export interface IRSliceExpr {
    kind: "SliceExpr";
    x: IRExpr;
    low?: IRExpr;
    high?: IRExpr;
    max?: IRExpr;
}
export interface IRTypeAssertExpr {
    kind: "TypeAssertExpr";
    x: IRExpr;
    type: IRType;
}
export interface IRStarExpr {
    kind: "StarExpr";
    x: IRExpr;
}
export interface IRUnaryRecvExpr {
    kind: "UnaryRecvExpr";
    x: IRExpr;
}
export interface IRKeyValueExpr {
    kind: "KeyValueExpr";
    key: IRExpr;
    value: IRExpr;
}
export interface IRParenExpr {
    kind: "ParenExpr";
    x: IRExpr;
}
export interface IRErrorPropExpr {
    kind: "ErrorPropExpr";
    x: IRExpr;
    wrap?: string;
}
export interface IRPipeExpr {
    kind: "PipeExpr";
    x: IRExpr;
    op: "map" | "filter" | "reduce";
    fn: IRExpr;
    init?: IRExpr;
}
export interface IRMapTypeExpr {
    kind: "MapTypeExpr";
    key: IRExpr;
    value: IRExpr;
}
export interface IRArrayTypeExpr {
    kind: "ArrayTypeExpr";
    elt: IRExpr;
    len?: IRExpr;
}
export interface IRChanTypeExpr {
    kind: "ChanTypeExpr";
    value: IRExpr;
    dir: "both" | "send" | "recv";
}
export interface IRFuncTypeExpr {
    kind: "FuncTypeExpr";
    params: IRParam[];
    results: IRType[];
}
export interface IRInterfaceTypeExpr {
    kind: "InterfaceTypeExpr";
    methods: IRMethodSig[];
}
export interface IRStructTypeExpr {
    kind: "StructTypeExpr";
    fields: IRField[];
}
export interface IRRawGoExpr {
    kind: "RawGoExpr";
    code: string;
}
export declare function simpleType(name: string): IRType;
export declare function pointerType(base: IRType): IRType;
export declare function sliceType(elt: IRType): IRType;
export declare function mapType(key: IRType, val: IRType): IRType;
export interface Java_ClassDecl {
    kind: "Java_ClassDecl";
    name: string;
    modifiers: string[];
    superClass?: string;
    interfaces: string[];
    fields: IRField[];
    methods: IRFuncDecl[];
    constructors: IRFuncDecl[];
    innerClasses: Java_ClassDecl[];
    stmtIndex: number;
}
export interface Java_TryCatch {
    kind: "Java_TryCatch";
    body: IRBlockStmt;
    catches: Java_CatchClause[];
    finallyBody?: IRBlockStmt;
    resources?: IRNode[];
    stmtIndex: number;
}
export interface Java_CatchClause {
    exceptionType: IRType;
    name: string;
    body: IRBlockStmt;
}
export interface Java_EnhancedFor {
    kind: "Java_EnhancedFor";
    varName: string;
    varType?: IRType;
    iterable: IRExpr;
    body: IRBlockStmt;
    stmtIndex: number;
}
export interface Java_ThrowStmt {
    kind: "Java_ThrowStmt";
    expr: IRExpr;
    stmtIndex: number;
}
export interface Java_NewExpr {
    kind: "Java_NewExpr";
    type: IRType;
    args: IRExpr[];
}
export interface Java_LambdaExpr {
    kind: "Java_LambdaExpr";
    params: IRParam[];
    body: IRBlockStmt | IRExpr;
}
export interface Java_InstanceofExpr {
    kind: "Java_InstanceofExpr";
    expr: IRExpr;
    type: IRType;
    binding?: string;
}
export interface Java_CastExpr {
    kind: "Java_CastExpr";
    type: IRType;
    expr: IRExpr;
}
export interface Java_TernaryExpr {
    kind: "Java_TernaryExpr";
    cond: IRExpr;
    ifTrue: IRExpr;
    ifFalse: IRExpr;
}
export interface Java_RecordDecl {
    kind: "Java_RecordDecl";
    name: string;
    typeParams: string[];
    components: IRParam[];
    interfaces: string[];
    methods: IRFuncDecl[];
    stmtIndex: number;
}
export interface Java_EnumDecl {
    kind: "Java_EnumDecl";
    name: string;
    values: {
        name: string;
        args: IRExpr[];
    }[];
    fields: IRField[];
    methods: IRFuncDecl[];
    constructors: IRFuncDecl[];
    interfaces: string[];
    stmtIndex: number;
}
export interface Java_SealedInterfaceDecl {
    kind: "Java_SealedInterfaceDecl";
    name: string;
    typeParams: string[];
    permits: string[];
    methods: IRMethodSig[];
    stmtIndex: number;
}
export interface Java_SwitchExpr {
    kind: "Java_SwitchExpr";
    tag: IRExpr;
    cases: Java_SwitchExprCase[];
}
export interface Java_SwitchExprCase {
    values: IRExpr[] | null;
    body: IRExpr | IRBlockStmt;
}
export interface Py_ClassDecl {
    kind: "Py_ClassDecl";
    name: string;
    bases: IRExpr[];
    keywords: {
        key: string;
        value: IRExpr;
    }[];
    decorators: Py_Decorator[];
    body: (IRNode | IRExprStmt)[];
    stmtIndex: number;
}
export interface Py_Decorator {
    expr: IRExpr;
}
export interface Py_FuncDecl {
    kind: "FuncDecl";
    name: string;
    isAsync: boolean;
    params: Py_ParamList;
    returnType?: string;
    decorators: Py_Decorator[];
    body: IRBlockStmt;
    stmtIndex: number;
}
export interface Py_ParamList {
    params: Py_Param[];
    vararg?: Py_Param;
    kwarg?: Py_Param;
    kwonly?: Py_Param[];
    posonly?: Py_Param[];
}
export interface Py_Param {
    name: string;
    type?: string;
    default_?: IRExpr;
}
export interface Py_TryExcept {
    kind: "Py_TryExcept";
    body: IRBlockStmt;
    handlers: Py_ExceptHandler[];
    elseBody?: IRBlockStmt;
    finallyBody?: IRBlockStmt;
    stmtIndex: number;
}
export interface Py_ExceptHandler {
    type?: IRExpr;
    name?: string;
    body: IRBlockStmt;
}
export interface Py_WithStmt {
    kind: "Py_WithStmt";
    isAsync: boolean;
    items: Py_WithItem[];
    body: IRBlockStmt;
    stmtIndex: number;
}
export interface Py_WithItem {
    contextExpr: IRExpr;
    optionalVar?: string;
}
export interface Py_MatchStmt {
    kind: "Py_MatchStmt";
    subject: IRExpr;
    cases: Py_MatchCase[];
    stmtIndex: number;
}
export interface Py_MatchCase {
    pattern: IRExpr;
    guard?: IRExpr;
    body: IRBlockStmt;
}
export interface Py_RaiseStmt {
    kind: "Py_RaiseStmt";
    exc?: IRExpr;
    cause?: IRExpr;
    stmtIndex: number;
}
export interface Py_AssertStmt {
    kind: "Py_AssertStmt";
    test: IRExpr;
    msg?: IRExpr;
    stmtIndex: number;
}
export interface Py_DeleteStmt {
    kind: "Py_DeleteStmt";
    targets: IRExpr[];
    stmtIndex: number;
}
export interface Py_GlobalStmt {
    kind: "Py_GlobalStmt";
    names: string[];
    stmtIndex: number;
}
export interface Py_NonlocalStmt {
    kind: "Py_NonlocalStmt";
    names: string[];
    stmtIndex: number;
}
export interface Py_ForElse {
    kind: "Py_ForElse";
    isAsync: boolean;
    target: IRExpr;
    iter: IRExpr;
    body: IRBlockStmt;
    elseBody: IRBlockStmt;
    stmtIndex: number;
}
export interface Py_WhileElse {
    kind: "Py_WhileElse";
    cond: IRExpr;
    body: IRBlockStmt;
    elseBody: IRBlockStmt;
    stmtIndex: number;
}
export interface Py_LambdaExpr {
    kind: "Py_LambdaExpr";
    params: Py_Param[];
    body: IRExpr;
}
export interface Py_ComprehensionExpr {
    kind: "Py_ComprehensionExpr";
    type: "list" | "dict" | "set" | "generator";
    elt: IRExpr;
    keyExpr?: IRExpr;
    generators: Py_Comprehension[];
}
export interface Py_Comprehension {
    target: IRExpr;
    iter: IRExpr;
    ifs: IRExpr[];
    isAsync: boolean;
}
export interface Py_FStringExpr {
    kind: "Py_FStringExpr";
    parts: (string | {
        expr: IRExpr;
        conversion?: string;
        formatSpec?: string;
    })[];
}
export interface Py_TernaryExpr {
    kind: "Py_TernaryExpr";
    value: IRExpr;
    test: IRExpr;
    orElse: IRExpr;
}
export interface Py_StarExpr {
    kind: "Py_StarExpr";
    value: IRExpr;
    isDouble: boolean;
}
export interface Py_YieldExpr {
    kind: "Py_YieldExpr";
    value?: IRExpr;
}
export interface Py_YieldFromExpr {
    kind: "Py_YieldFromExpr";
    value: IRExpr;
}
export interface Py_AwaitExpr {
    kind: "Py_AwaitExpr";
    value: IRExpr;
}
export interface Py_WalrusExpr {
    kind: "Py_WalrusExpr";
    target: string;
    value: IRExpr;
}
export interface Py_DictExpr {
    kind: "Py_DictExpr";
    keys: (IRExpr | null)[];
    values: IRExpr[];
}
export interface Py_SetExpr {
    kind: "Py_SetExpr";
    elts: IRExpr[];
}
export interface Py_TupleExpr {
    kind: "Py_TupleExpr";
    elts: IRExpr[];
}
export interface Py_SlotsDecl {
    names: string[];
}
export declare const PY_MAGIC_METHODS: Record<string, string>;
export declare const PY_MAGIC_REVERSE: Record<string, string>;
