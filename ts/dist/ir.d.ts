export type IRNode = IRProgram | IRFuncDecl | IRStructDecl | IRInterfaceDecl | IRTypeAlias | IRBlockStmt | IRIfStmt | IRForStmt | IRRangeStmt | IRSwitchStmt | IRCaseClause | IRSelectStmt | IRCommClause | IRReturnStmt | IRDeferStmt | IRGoStmt | IRAssignStmt | IRShortDeclStmt | IRExprStmt | IRIncDecStmt | IRSendStmt | IRBranchStmt | IRVarDecl | IRConstDecl | Java_ClassDecl | Java_TryCatch | Java_EnhancedFor | Java_ThrowStmt | Java_RecordDecl | Java_EnumDecl | Java_SealedInterfaceDecl | Py_ClassDecl | Py_TryExcept | Py_WithStmt | Py_MatchStmt | Py_RaiseStmt | Py_AssertStmt | Py_DeleteStmt | Py_GlobalStmt | Py_NonlocalStmt | Py_ForElse | Py_WhileElse | Ts_InterfaceDecl | Ts_TypeAliasDecl | Ts_ClassDecl | Ts_EnumDecl | Ts_FuncDecl | Ts_VarStmt | Ts_IfStmt | Ts_ForStmt | Ts_ForInStmt | Ts_ForOfStmt | Ts_WhileStmt | Ts_DoWhileStmt | Ts_SwitchStmt | Ts_TryStmt | Ts_ThrowStmt | Ts_ReturnStmt | Ts_ExprStmt | Ts_BlockStmt | Ts_BreakStmt | Ts_ContinueStmt | Ts_LabeledStmt | Ts_NamespaceDecl;
export type IRExpr = IRIdent | IRBasicLit | IRCompositeLit | IRFuncLit | IRBinaryExpr | IRUnaryExpr | IRCallExpr | IRSelectorExpr | IRIndexExpr | IRSliceExpr | IRTypeAssertExpr | IRStarExpr | IRUnaryRecvExpr | IRKeyValueExpr | IRParenExpr | IRErrorPropExpr | IRPipeExpr | IRMapTypeExpr | IRArrayTypeExpr | IRChanTypeExpr | IRFuncTypeExpr | IRInterfaceTypeExpr | IRStructTypeExpr | IRRawGoExpr | Java_NewExpr | Java_LambdaExpr | Java_InstanceofExpr | Java_CastExpr | Java_TernaryExpr | Java_SwitchExpr | Py_LambdaExpr | Py_ComprehensionExpr | Py_FStringExpr | Py_TernaryExpr | Py_StarExpr | Py_YieldExpr | Py_YieldFromExpr | Py_AwaitExpr | Py_WalrusExpr | Py_DictExpr | Py_SetExpr | Py_TupleExpr | Ts_ArrowFn | Ts_TemplateLit | Ts_TaggedTemplate | Ts_TypeAssertion | Ts_AsExpr | Ts_SatisfiesExpr | Ts_NonNullExpr | Ts_ObjectLit | Ts_ArrayLit | Ts_SpreadExpr | Ts_AwaitExpr | Ts_YieldExpr | Ts_ConditionalExpr | Ts_NewExpr | Ts_RegexLit | Ts_JsxElement | Ts_JsxFragment | Ts_JsxExpression | Ts_JsxText | Ts_JsxSelfClose | Ts_UnionType | Ts_IntersectionType | Ts_TupleType | Ts_ArrayType | Ts_TypeRef | Ts_TypeLit | Ts_FnType | Ts_ConditionalType | Ts_MappedType | Ts_IndexedAccessType | Ts_LiteralType | Ts_TemplateLiteralType | Ts_ParenType | Ts_TypeofType | Ts_KeyofType | Ts_InferType | Ts_TypePredicateExpr;
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
export interface Ts_Param {
    name: string;
    type?: Ts_TypeExpr;
    optional?: boolean;
    default_?: IRExpr;
    rest?: boolean;
    modifier?: string;
}
export type Ts_TypeExpr = Ts_TypeRef | Ts_ArrayType | Ts_TupleType | Ts_UnionType | Ts_IntersectionType | Ts_FnType | Ts_TypeLit | Ts_ConditionalType | Ts_MappedType | Ts_IndexedAccessType | Ts_LiteralType | Ts_TemplateLiteralType | Ts_ParenType | Ts_TypeofType | Ts_KeyofType | Ts_InferType | Ts_TypePredicateExpr;
export interface Ts_TypeParam {
    name: string;
    constraint?: Ts_TypeExpr;
    default_?: Ts_TypeExpr;
}
export interface Ts_TypeRef {
    kind: "Ts_TypeRef";
    name: string;
    typeArgs?: Ts_TypeExpr[];
}
export interface Ts_ArrayType {
    kind: "Ts_ArrayType";
    elt: Ts_TypeExpr;
}
export interface Ts_TupleType {
    kind: "Ts_TupleType";
    elts: Ts_TypeExpr[];
    labels?: (string | undefined)[];
}
export interface Ts_UnionType {
    kind: "Ts_UnionType";
    types: Ts_TypeExpr[];
}
export interface Ts_IntersectionType {
    kind: "Ts_IntersectionType";
    types: Ts_TypeExpr[];
}
export interface Ts_FnType {
    kind: "Ts_FnType";
    typeParams?: Ts_TypeParam[];
    params: Ts_Param[];
    returnType: Ts_TypeExpr;
}
export interface Ts_TypeLit {
    kind: "Ts_TypeLit";
    members: Ts_TypeMember[];
}
export interface Ts_TypeMember {
    name: string;
    type?: Ts_TypeExpr;
    optional?: boolean;
    readonly?: boolean;
    isMethod?: boolean;
    params?: Ts_Param[];
    returnType?: Ts_TypeExpr;
    typeParams?: Ts_TypeParam[];
    indexSignature?: {
        keyName: string;
        keyType: Ts_TypeExpr;
    };
}
export interface Ts_ConditionalType {
    kind: "Ts_ConditionalType";
    checkType: Ts_TypeExpr;
    extendsType: Ts_TypeExpr;
    trueType: Ts_TypeExpr;
    falseType: Ts_TypeExpr;
}
export interface Ts_MappedType {
    kind: "Ts_MappedType";
    typeParam: string;
    constraint: Ts_TypeExpr;
    nameType?: Ts_TypeExpr;
    type: Ts_TypeExpr;
    readonlyToken?: "+" | "-" | true;
    optionalToken?: "+" | "-" | true;
}
export interface Ts_IndexedAccessType {
    kind: "Ts_IndexedAccessType";
    object: Ts_TypeExpr;
    index: Ts_TypeExpr;
}
export interface Ts_LiteralType {
    kind: "Ts_LiteralType";
    value: string;
    litKind: "string" | "number" | "boolean" | "null" | "undefined";
}
export interface Ts_TemplateLiteralType {
    kind: "Ts_TemplateLiteralType";
    parts: (string | Ts_TypeExpr)[];
}
export interface Ts_ParenType {
    kind: "Ts_ParenType";
    inner: Ts_TypeExpr;
}
export interface Ts_TypeofType {
    kind: "Ts_TypeofType";
    expr: IRExpr;
}
export interface Ts_KeyofType {
    kind: "Ts_KeyofType";
    type: Ts_TypeExpr;
}
export interface Ts_InferType {
    kind: "Ts_InferType";
    name: string;
    constraint?: Ts_TypeExpr;
}
export interface Ts_TypePredicateExpr {
    kind: "Ts_TypePredicateExpr";
    paramName: string;
    type: Ts_TypeExpr;
    asserts?: boolean;
}
export interface Ts_InterfaceDecl {
    kind: "Ts_InterfaceDecl";
    name: string;
    typeParams?: Ts_TypeParam[];
    heritage?: Ts_TypeRef[];
    members: Ts_TypeMember[];
    isExported: boolean;
    stmtIndex: number;
}
export interface Ts_TypeAliasDecl {
    kind: "Ts_TypeAliasDecl";
    name: string;
    typeParams?: Ts_TypeParam[];
    type: Ts_TypeExpr;
    isExported: boolean;
    stmtIndex: number;
}
export interface Ts_ClassDecl {
    kind: "Ts_ClassDecl";
    name: string;
    typeParams?: Ts_TypeParam[];
    superClass?: Ts_TypeRef;
    implements?: Ts_TypeRef[];
    members: Ts_ClassMember[];
    isExported: boolean;
    isAbstract: boolean;
    isDefault: boolean;
    decorators?: IRExpr[];
    stmtIndex: number;
}
export type Ts_ClassMember = Ts_FieldDecl | Ts_MethodDecl | Ts_CtorDecl | Ts_GetterDecl | Ts_SetterDecl;
export interface Ts_FieldDecl {
    kind: "Ts_FieldDecl";
    name: string;
    type?: Ts_TypeExpr;
    value?: IRExpr;
    access?: "public" | "private" | "protected";
    isStatic: boolean;
    isReadonly: boolean;
    optional?: boolean;
    declare?: boolean;
    decorators?: IRExpr[];
}
export interface Ts_MethodDecl {
    kind: "Ts_MethodDecl";
    name: string;
    typeParams?: Ts_TypeParam[];
    params: Ts_Param[];
    returnType?: Ts_TypeExpr;
    body?: Ts_BlockStmt;
    access?: "public" | "private" | "protected";
    isStatic: boolean;
    isAsync: boolean;
    isAbstract: boolean;
    isGenerator: boolean;
    isOverride: boolean;
    decorators?: IRExpr[];
}
export interface Ts_CtorDecl {
    kind: "Ts_CtorDecl";
    params: Ts_Param[];
    body: Ts_BlockStmt;
    access?: "public" | "private" | "protected";
}
export interface Ts_GetterDecl {
    kind: "Ts_GetterDecl";
    name: string;
    returnType?: Ts_TypeExpr;
    body: Ts_BlockStmt;
    access?: "public" | "private" | "protected";
    isStatic: boolean;
}
export interface Ts_SetterDecl {
    kind: "Ts_SetterDecl";
    name: string;
    param: Ts_Param;
    body: Ts_BlockStmt;
    access?: "public" | "private" | "protected";
    isStatic: boolean;
}
export interface Ts_EnumDecl {
    kind: "Ts_EnumDecl";
    name: string;
    members: {
        name: string;
        value?: IRExpr;
    }[];
    isConst: boolean;
    isExported: boolean;
    stmtIndex: number;
}
export interface Ts_NamespaceDecl {
    kind: "Ts_NamespaceDecl";
    name: string;
    body: IRNode[];
    isExported: boolean;
    stmtIndex: number;
}
export interface Ts_FuncDecl {
    kind: "Ts_FuncDecl";
    name: string;
    typeParams?: Ts_TypeParam[];
    params: Ts_Param[];
    returnType?: Ts_TypeExpr;
    body?: Ts_BlockStmt;
    isAsync: boolean;
    isGenerator: boolean;
    isExported: boolean;
    isDefault: boolean;
    declare?: boolean;
    stmtIndex: number;
}
export interface Ts_VarStmt {
    kind: "Ts_VarStmt";
    keyword: "const" | "let" | "var";
    declarations: Ts_VarDeclarator[];
    isExported: boolean;
    stmtIndex: number;
}
export interface Ts_VarDeclarator {
    binding: IRExpr;
    type?: Ts_TypeExpr;
    value?: IRExpr;
}
export interface Ts_BlockStmt {
    kind: "Ts_BlockStmt";
    stmts: IRNode[];
}
export interface Ts_IfStmt {
    kind: "Ts_IfStmt";
    cond: IRExpr;
    then: IRNode;
    else_?: IRNode;
    stmtIndex: number;
}
export interface Ts_ForStmt {
    kind: "Ts_ForStmt";
    init?: IRNode | IRExpr;
    cond?: IRExpr;
    update?: IRExpr;
    body: IRNode;
    stmtIndex: number;
}
export interface Ts_ForInStmt {
    kind: "Ts_ForInStmt";
    init: IRNode | IRExpr;
    iter: IRExpr;
    body: IRNode;
    stmtIndex: number;
}
export interface Ts_ForOfStmt {
    kind: "Ts_ForOfStmt";
    init: IRNode | IRExpr;
    iter: IRExpr;
    body: IRNode;
    isAwait: boolean;
    stmtIndex: number;
}
export interface Ts_WhileStmt {
    kind: "Ts_WhileStmt";
    cond: IRExpr;
    body: IRNode;
    stmtIndex: number;
}
export interface Ts_DoWhileStmt {
    kind: "Ts_DoWhileStmt";
    cond: IRExpr;
    body: IRNode;
    stmtIndex: number;
}
export interface Ts_SwitchStmt {
    kind: "Ts_SwitchStmt";
    tag: IRExpr;
    cases: Ts_SwitchCase[];
    stmtIndex: number;
}
export interface Ts_SwitchCase {
    value?: IRExpr;
    body: IRNode[];
}
export interface Ts_TryStmt {
    kind: "Ts_TryStmt";
    tryBody: Ts_BlockStmt;
    catchParam?: {
        name: string;
        type?: Ts_TypeExpr;
    };
    catchBody?: Ts_BlockStmt;
    finallyBody?: Ts_BlockStmt;
    stmtIndex: number;
}
export interface Ts_ThrowStmt {
    kind: "Ts_ThrowStmt";
    expr: IRExpr;
    stmtIndex: number;
}
export interface Ts_ReturnStmt {
    kind: "Ts_ReturnStmt";
    value?: IRExpr;
    stmtIndex: number;
}
export interface Ts_ExprStmt {
    kind: "Ts_ExprStmt";
    expr: IRExpr;
    stmtIndex: number;
}
export interface Ts_BreakStmt {
    kind: "Ts_BreakStmt";
    label?: string;
    stmtIndex: number;
}
export interface Ts_ContinueStmt {
    kind: "Ts_ContinueStmt";
    label?: string;
    stmtIndex: number;
}
export interface Ts_LabeledStmt {
    kind: "Ts_LabeledStmt";
    label: string;
    body: IRNode;
    stmtIndex: number;
}
export interface Ts_ArrowFn {
    kind: "Ts_ArrowFn";
    typeParams?: Ts_TypeParam[];
    params: Ts_Param[];
    returnType?: Ts_TypeExpr;
    body: IRExpr | Ts_BlockStmt;
    isAsync: boolean;
}
export interface Ts_TemplateLit {
    kind: "Ts_TemplateLit";
    parts: (string | IRExpr)[];
}
export interface Ts_TaggedTemplate {
    kind: "Ts_TaggedTemplate";
    tag: IRExpr;
    template: Ts_TemplateLit;
}
export interface Ts_TypeAssertion {
    kind: "Ts_TypeAssertion";
    type: Ts_TypeExpr;
    expr: IRExpr;
}
export interface Ts_AsExpr {
    kind: "Ts_AsExpr";
    expr: IRExpr;
    type: Ts_TypeExpr;
    asConst?: boolean;
}
export interface Ts_SatisfiesExpr {
    kind: "Ts_SatisfiesExpr";
    expr: IRExpr;
    type: Ts_TypeExpr;
}
export interface Ts_NonNullExpr {
    kind: "Ts_NonNullExpr";
    expr: IRExpr;
}
export interface Ts_ObjectLit {
    kind: "Ts_ObjectLit";
    properties: Ts_ObjectProperty[];
}
export type Ts_ObjectProperty = {
    kind: "property";
    key: IRExpr;
    value: IRExpr;
    computed: boolean;
    shorthand: boolean;
} | {
    kind: "method";
    name: string;
    params: Ts_Param[];
    returnType?: Ts_TypeExpr;
    body: Ts_BlockStmt;
    isAsync: boolean;
    isGenerator: boolean;
} | {
    kind: "getter";
    name: string;
    body: Ts_BlockStmt;
} | {
    kind: "setter";
    name: string;
    param: Ts_Param;
    body: Ts_BlockStmt;
} | {
    kind: "spread";
    value: IRExpr;
};
export interface Ts_ArrayLit {
    kind: "Ts_ArrayLit";
    elements: (IRExpr | null)[];
}
export interface Ts_SpreadExpr {
    kind: "Ts_SpreadExpr";
    expr: IRExpr;
}
export interface Ts_AwaitExpr {
    kind: "Ts_AwaitExpr";
    expr: IRExpr;
}
export interface Ts_YieldExpr {
    kind: "Ts_YieldExpr";
    expr?: IRExpr;
    delegate?: boolean;
}
export interface Ts_ConditionalExpr {
    kind: "Ts_ConditionalExpr";
    cond: IRExpr;
    then: IRExpr;
    else_: IRExpr;
}
export interface Ts_NewExpr {
    kind: "Ts_NewExpr";
    callee: IRExpr;
    typeArgs?: Ts_TypeExpr[];
    args: IRExpr[];
}
export interface Ts_RegexLit {
    kind: "Ts_RegexLit";
    pattern: string;
    flags: string;
}
export interface Ts_JsxElement {
    kind: "Ts_JsxElement";
    tagName: string;
    attributes: Ts_JsxAttribute[];
    children: IRExpr[];
    selfClosing: boolean;
    typeArgs?: Ts_TypeExpr[];
}
export interface Ts_JsxSelfClose {
    kind: "Ts_JsxSelfClose";
    tagName: string;
    attributes: Ts_JsxAttribute[];
    typeArgs?: Ts_TypeExpr[];
}
export interface Ts_JsxFragment {
    kind: "Ts_JsxFragment";
    children: IRExpr[];
}
export interface Ts_JsxAttribute {
    name: string;
    value?: IRExpr;
    spread?: boolean;
}
export interface Ts_JsxExpression {
    kind: "Ts_JsxExpression";
    expr: IRExpr;
}
export interface Ts_JsxText {
    kind: "Ts_JsxText";
    text: string;
}
