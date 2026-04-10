// IR (Intermediate Representation) types
// Aligned with Go AST node types: FunctionDecl, IfStmt, ForStmt, AssignStmt, CallExpr, etc.
// Java-specific nodes use Java_ prefix. Go emitter errors on Java_ nodes; Java emitter errors on Go-only nodes.
// Python-specific nodes use Py_ prefix.
// These exist only in memory — not serialized to file format.

export type IRNode =
  | IRProgram
  | IRFuncDecl
  | IRStructDecl
  | IRInterfaceDecl
  | IRTypeAlias
  | IRBlockStmt
  | IRIfStmt
  | IRForStmt
  | IRRangeStmt
  | IRSwitchStmt
  | IRCaseClause
  | IRSelectStmt
  | IRCommClause
  | IRReturnStmt
  | IRDeferStmt
  | IRGoStmt
  | IRAssignStmt
  | IRShortDeclStmt
  | IRExprStmt
  | IRIncDecStmt
  | IRSendStmt
  | IRBranchStmt
  | IRVarDecl
  | IRConstDecl
  // Java-specific nodes
  | Java_ClassDecl
  | Java_TryCatch
  | Java_EnhancedFor
  | Java_ThrowStmt
  // AET-Java specific nodes (v1)
  | Java_RecordDecl
  | Java_EnumDecl
  | Java_SealedInterfaceDecl
  // Python-specific nodes
  | Py_ClassDecl
  | Py_TryExcept
  | Py_WithStmt
  | Py_MatchStmt
  | Py_RaiseStmt
  | Py_AssertStmt
  | Py_DeleteStmt
  | Py_GlobalStmt
  | Py_NonlocalStmt
  | Py_ForElse
  | Py_WhileElse
  // TypeScript-specific nodes (v1)
  | Ts_InterfaceDecl
  | Ts_TypeAliasDecl
  | Ts_ClassDecl
  | Ts_EnumDecl
  | Ts_FuncDecl
  | Ts_VarStmt
  | Ts_IfStmt
  | Ts_ForStmt
  | Ts_ForInStmt
  | Ts_ForOfStmt
  | Ts_WhileStmt
  | Ts_DoWhileStmt
  | Ts_SwitchStmt
  | Ts_TryStmt
  | Ts_ThrowStmt
  | Ts_ReturnStmt
  | Ts_ExprStmt
  | Ts_BlockStmt
  | Ts_BreakStmt
  | Ts_ContinueStmt
  | Ts_LabeledStmt
  | Ts_NamespaceDecl;

export type IRExpr =
  | IRIdent
  | IRBasicLit
  | IRCompositeLit
  | IRFuncLit
  | IRBinaryExpr
  | IRUnaryExpr
  | IRCallExpr
  | IRSelectorExpr
  | IRIndexExpr
  | IRSliceExpr
  | IRTypeAssertExpr
  | IRStarExpr
  | IRUnaryRecvExpr
  | IRKeyValueExpr
  | IRParenExpr
  | IRErrorPropExpr
  | IRPipeExpr
  | IRMapTypeExpr
  | IRArrayTypeExpr
  | IRChanTypeExpr
  | IRFuncTypeExpr
  | IRInterfaceTypeExpr
  | IRStructTypeExpr
  | IRRawGoExpr
  // Java-specific expressions
  | Java_NewExpr
  | Java_LambdaExpr
  | Java_InstanceofExpr
  | Java_CastExpr
  | Java_TernaryExpr
  // AET-Java specific expressions (v1)
  | Java_SwitchExpr
  // Python-specific expressions
  | Py_LambdaExpr
  | Py_ComprehensionExpr
  | Py_FStringExpr
  | Py_TernaryExpr
  | Py_StarExpr
  | Py_YieldExpr
  | Py_YieldFromExpr
  | Py_AwaitExpr
  | Py_WalrusExpr
  | Py_DictExpr
  | Py_SetExpr
  | Py_TupleExpr
  // TypeScript-specific expressions
  | Ts_ArrowFn
  | Ts_TemplateLit
  | Ts_TaggedTemplate
  | Ts_TypeAssertion
  | Ts_AsExpr
  | Ts_SatisfiesExpr
  | Ts_NonNullExpr
  | Ts_ObjectLit
  | Ts_ArrayLit
  | Ts_SpreadExpr
  | Ts_AwaitExpr
  | Ts_YieldExpr
  | Ts_ConditionalExpr
  | Ts_NewExpr
  | Ts_RegexLit
  | Ts_JsxElement
  | Ts_JsxFragment
  | Ts_JsxExpression
  | Ts_JsxText
  | Ts_JsxSelfClose
  // TypeScript type-level expressions
  | Ts_UnionType
  | Ts_IntersectionType
  | Ts_TupleType
  | Ts_ArrayType
  | Ts_TypeRef
  | Ts_TypeLit
  | Ts_FnType
  | Ts_ConditionalType
  | Ts_MappedType
  | Ts_IndexedAccessType
  | Ts_LiteralType
  | Ts_TemplateLiteralType
  | Ts_ParenType
  | Ts_TypeofType
  | Ts_KeyofType
  | Ts_InferType
  | Ts_TypePredicateExpr;

export type IRType = {
  name: string;        // "int", "string", "error", "[]byte", "map[string]int", "*User", etc.
  isPointer?: boolean;
  isSlice?: boolean;
  isMap?: boolean;
  isChan?: boolean;
  elementType?: IRType;
  keyType?: IRType;
  valueType?: IRType;
};

// Top-level program
export interface IRProgram {
  kind: "Program";
  package: string;       // Auto-detected or "main"
  imports: IRImport[];   // Auto-resolved
  decls: IRNode[];
  stmtIndex: number;
}

export interface IRImport {
  path: string;          // e.g., "fmt", "encoding/json"
  alias?: string;        // e.g., "." for dot-import
}

// Function declaration
export interface IRFuncDecl {
  kind: "FuncDecl";
  name: string;
  receiver?: { name: string; type: IRType; pointer: boolean };
  typeParams?: string[];  // Method-level type parameters (e.g., <T> on generic methods)
  params: IRParam[];
  results: IRType[];     // Return types
  body: IRBlockStmt;
  stmtIndex: number;
}

export interface IRParam {
  name: string;
  type: IRType;
}

// Struct declaration
export interface IRStructDecl {
  kind: "StructDecl";
  name: string;
  fields: IRField[];
  stmtIndex: number;
}

export interface IRField {
  name: string;
  type: IRType;
  tag?: string;          // Go struct tag
}

// Interface declaration
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

// Type alias
export interface IRTypeAlias {
  kind: "TypeAlias";
  name: string;
  underlying: IRType;
  stmtIndex: number;
}

// Statements
export interface IRBlockStmt {
  kind: "BlockStmt";
  stmts: (IRNode | IRExprStmt)[];
}

export interface IRIfStmt {
  kind: "IfStmt";
  init?: IRNode;         // Optional init statement
  cond: IRExpr;
  body: IRBlockStmt;
  else_?: IRNode;        // IfStmt or BlockStmt
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
  x: IRExpr;            // The thing being iterated
  body: IRBlockStmt;
  stmtIndex: number;
}

export interface IRSwitchStmt {
  kind: "SwitchStmt";
  init?: IRNode;
  tag?: IRExpr;          // Switch expression (nil for tagless switch)
  cases: IRCaseClause[];
  stmtIndex: number;
}

export interface IRCaseClause {
  kind: "CaseClause";
  values?: IRExpr[];     // nil for default
  body: (IRNode | IRExprStmt)[];
}

export interface IRSelectStmt {
  kind: "SelectStmt";
  cases: IRCommClause[];
  stmtIndex: number;
}

export interface IRCommClause {
  kind: "CommClause";
  comm?: IRNode;         // Send or receive statement; nil for default
  body: (IRNode | IRExprStmt)[];
}

export interface IRReturnStmt {
  kind: "ReturnStmt";
  values: IRExpr[];
  stmtIndex: number;
}

export interface IRDeferStmt {
  kind: "DeferStmt";
  call: IRExpr;          // CallExpr or FuncLit
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
  op: string;            // "=", "+=", "-=", etc.
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
  specs: { name: string; type?: IRType; value?: IRExpr }[];
  stmtIndex: number;
}

// Expressions
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
  type?: IRExpr;         // Type expression
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
  op: string;            // "!", "-", "&", "^", etc.
  x: IRExpr;
}

export interface IRCallExpr {
  kind: "CallExpr";
  func: IRExpr;
  args: IRExpr[];
  ellipsis?: boolean;    // f(args...)
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

// AET-specific: error propagation
export interface IRErrorPropExpr {
  kind: "ErrorPropExpr";
  x: IRExpr;             // The expression that returns (value, error)
  wrap?: string;         // Optional error wrapping message
}

// AET-specific: pipe operations
export interface IRPipeExpr {
  kind: "PipeExpr";
  x: IRExpr;
  op: "map" | "filter" | "reduce";
  fn: IRExpr;
  init?: IRExpr;         // For reduce
}

// Type expressions used in composite literals, make(), etc.
export interface IRMapTypeExpr {
  kind: "MapTypeExpr";
  key: IRExpr;
  value: IRExpr;
}

export interface IRArrayTypeExpr {
  kind: "ArrayTypeExpr";
  elt: IRExpr;
  len?: IRExpr;          // nil for slice
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

// Escape hatch: raw Go expression (for things too complex for AET)
export interface IRRawGoExpr {
  kind: "RawGoExpr";
  code: string;
}

// Utility: create simple types
export function simpleType(name: string): IRType {
  return { name };
}

export function pointerType(base: IRType): IRType {
  return { name: "*" + base.name, isPointer: true, elementType: base };
}

export function sliceType(elt: IRType): IRType {
  return { name: "[]" + elt.name, isSlice: true, elementType: elt };
}

export function mapType(key: IRType, val: IRType): IRType {
  return { name: `map[${key.name}]${val.name}`, isMap: true, keyType: key, valueType: val };
}

// ============= Java-Specific IR Nodes =============
// These are used by the Java reverse parser (Java → IR) and Java emitter (IR → Java).
// Go emitter MUST error when encountering any Java_ node.

// Java class declaration (wraps methods and fields)
export interface Java_ClassDecl {
  kind: "Java_ClassDecl";
  name: string;
  modifiers: string[];           // "public", "abstract", "final", etc.
  superClass?: string;
  interfaces: string[];
  fields: IRField[];
  methods: IRFuncDecl[];
  constructors: IRFuncDecl[];
  innerClasses: Java_ClassDecl[];
  stmtIndex: number;
}

// Try-catch-finally
export interface Java_TryCatch {
  kind: "Java_TryCatch";
  body: IRBlockStmt;
  catches: Java_CatchClause[];
  finallyBody?: IRBlockStmt;
  resources?: IRNode[];          // try-with-resources
  stmtIndex: number;
}

export interface Java_CatchClause {
  exceptionType: IRType;
  name: string;
  body: IRBlockStmt;
}

// Enhanced for loop: for (Type x : collection) { ... }
export interface Java_EnhancedFor {
  kind: "Java_EnhancedFor";
  varName: string;
  varType?: IRType;
  iterable: IRExpr;
  body: IRBlockStmt;
  stmtIndex: number;
}

// Throw statement
export interface Java_ThrowStmt {
  kind: "Java_ThrowStmt";
  expr: IRExpr;
  stmtIndex: number;
}

// new expression: new Type(args)
export interface Java_NewExpr {
  kind: "Java_NewExpr";
  type: IRType;
  args: IRExpr[];
}

// Lambda expression: (params) -> body
export interface Java_LambdaExpr {
  kind: "Java_LambdaExpr";
  params: IRParam[];
  body: IRBlockStmt | IRExpr;    // single expr or block
}

// instanceof check (with optional pattern binding for Java 16+)
export interface Java_InstanceofExpr {
  kind: "Java_InstanceofExpr";
  expr: IRExpr;
  type: IRType;
  binding?: string;           // pattern variable name (e.g., "obj" in "x instanceof Foo obj")
}

// Cast expression: (Type) expr
export interface Java_CastExpr {
  kind: "Java_CastExpr";
  type: IRType;
  expr: IRExpr;
}

// Ternary expression: cond ? a : b
export interface Java_TernaryExpr {
  kind: "Java_TernaryExpr";
  cond: IRExpr;
  ifTrue: IRExpr;
  ifFalse: IRExpr;
}

// ============= AET-Java v1 IR Nodes =============
// These support Java 14+ features needed by AET-Java syntax.

// Record declaration: @Name(Type field, ...)
export interface Java_RecordDecl {
  kind: "Java_RecordDecl";
  name: string;
  typeParams: string[];
  components: IRParam[];            // record components (fields)
  interfaces: string[];
  methods: IRFuncDecl[];            // explicit methods (e.g., custom toString)
  stmtIndex: number;
}

// Enum declaration: #Name{VALUE1, VALUE2, ...}
export interface Java_EnumDecl {
  kind: "Java_EnumDecl";
  name: string;
  values: { name: string; args: IRExpr[] }[];
  fields: IRField[];
  methods: IRFuncDecl[];
  constructors: IRFuncDecl[];
  interfaces: string[];
  stmtIndex: number;
}

// Sealed interface declaration: @Name[+Permitted1,Permitted2;methods]
export interface Java_SealedInterfaceDecl {
  kind: "Java_SealedInterfaceDecl";
  name: string;
  typeParams: string[];
  permits: string[];
  methods: IRMethodSig[];
  stmtIndex: number;
}

// Switch expression (Java 14+): switch expr { case VAL -> result; ... }
export interface Java_SwitchExpr {
  kind: "Java_SwitchExpr";
  tag: IRExpr;
  cases: Java_SwitchExprCase[];
}

export interface Java_SwitchExprCase {
  values: IRExpr[] | null;          // null = default
  body: IRExpr | IRBlockStmt;       // expression or block with yield
}

// ============= Python-Specific IR Nodes =============
// These are used by the Python reverse parser (Python → IR) and Python emitter (IR → Python).
// Go/Java emitters MUST error when encountering any Py_ node.

// Python class declaration
export interface Py_ClassDecl {
  kind: "Py_ClassDecl";
  name: string;
  bases: IRExpr[];                   // base classes
  keywords: { key: string; value: IRExpr }[];  // metaclass=Meta, etc.
  decorators: Py_Decorator[];
  body: (IRNode | IRExprStmt)[];     // methods, assignments, inner classes
  stmtIndex: number;
}

export interface Py_Decorator {
  expr: IRExpr;                      // the decorator expression
}

// Python function declaration (extends FuncDecl concept)
export interface Py_FuncDecl {
  kind: "FuncDecl";
  name: string;                      // includes magic method short forms: "init", "str", etc.
  isAsync: boolean;
  params: Py_ParamList;
  returnType?: string;               // type annotation (typed mode only)
  decorators: Py_Decorator[];
  body: IRBlockStmt;
  stmtIndex: number;
}

export interface Py_ParamList {
  params: Py_Param[];
  vararg?: Py_Param;                 // *args
  kwarg?: Py_Param;                  // **kwargs
  kwonly?: Py_Param[];               // keyword-only params (after *)
  posonly?: Py_Param[];              // positional-only params (before /)
}

export interface Py_Param {
  name: string;
  type?: string;                     // type annotation
  default_?: IRExpr;                 // default value
}

// Try / Except / Else / Finally
export interface Py_TryExcept {
  kind: "Py_TryExcept";
  body: IRBlockStmt;
  handlers: Py_ExceptHandler[];
  elseBody?: IRBlockStmt;
  finallyBody?: IRBlockStmt;
  stmtIndex: number;
}

export interface Py_ExceptHandler {
  type?: IRExpr;                     // exception type(s) — may be tuple
  name?: string;                     // "as name"
  body: IRBlockStmt;
}

// With statement
export interface Py_WithStmt {
  kind: "Py_WithStmt";
  isAsync: boolean;
  items: Py_WithItem[];
  body: IRBlockStmt;
  stmtIndex: number;
}

export interface Py_WithItem {
  contextExpr: IRExpr;
  optionalVar?: string;              // "as name"
}

// Match / Case (Python 3.10+)
export interface Py_MatchStmt {
  kind: "Py_MatchStmt";
  subject: IRExpr;
  cases: Py_MatchCase[];
  stmtIndex: number;
}

export interface Py_MatchCase {
  pattern: IRExpr;                   // pattern expression
  guard?: IRExpr;                    // optional guard ("if expr")
  body: IRBlockStmt;
}

// Raise statement
export interface Py_RaiseStmt {
  kind: "Py_RaiseStmt";
  exc?: IRExpr;
  cause?: IRExpr;                    // "from" clause
  stmtIndex: number;
}

// Assert statement
export interface Py_AssertStmt {
  kind: "Py_AssertStmt";
  test: IRExpr;
  msg?: IRExpr;
  stmtIndex: number;
}

// Delete statement
export interface Py_DeleteStmt {
  kind: "Py_DeleteStmt";
  targets: IRExpr[];
  stmtIndex: number;
}

// Global statement
export interface Py_GlobalStmt {
  kind: "Py_GlobalStmt";
  names: string[];
  stmtIndex: number;
}

// Nonlocal statement
export interface Py_NonlocalStmt {
  kind: "Py_NonlocalStmt";
  names: string[];
  stmtIndex: number;
}

// For-else (Python-specific: for...else)
export interface Py_ForElse {
  kind: "Py_ForElse";
  isAsync: boolean;
  target: IRExpr;                    // loop variable(s)
  iter: IRExpr;                      // iterable
  body: IRBlockStmt;
  elseBody: IRBlockStmt;
  stmtIndex: number;
}

// While-else (Python-specific: while...else)
export interface Py_WhileElse {
  kind: "Py_WhileElse";
  cond: IRExpr;
  body: IRBlockStmt;
  elseBody: IRBlockStmt;
  stmtIndex: number;
}

// Python lambda: |params| expr
export interface Py_LambdaExpr {
  kind: "Py_LambdaExpr";
  params: Py_Param[];
  body: IRExpr;
}

// List/Dict/Set/Generator comprehension
export interface Py_ComprehensionExpr {
  kind: "Py_ComprehensionExpr";
  type: "list" | "dict" | "set" | "generator";
  elt: IRExpr;                       // the output expression
  keyExpr?: IRExpr;                  // for dict comp: key expression
  generators: Py_Comprehension[];
}

export interface Py_Comprehension {
  target: IRExpr;
  iter: IRExpr;
  ifs: IRExpr[];
  isAsync: boolean;
}

// F-string
export interface Py_FStringExpr {
  kind: "Py_FStringExpr";
  parts: (string | { expr: IRExpr; conversion?: string; formatSpec?: string })[];
}

// Python ternary: value if condition else other
export interface Py_TernaryExpr {
  kind: "Py_TernaryExpr";
  value: IRExpr;
  test: IRExpr;
  orElse: IRExpr;
}

// Star expression: *expr
export interface Py_StarExpr {
  kind: "Py_StarExpr";
  value: IRExpr;
  isDouble: boolean;                 // ** for kwargs
}

// Yield expression
export interface Py_YieldExpr {
  kind: "Py_YieldExpr";
  value?: IRExpr;
}

// Yield from expression
export interface Py_YieldFromExpr {
  kind: "Py_YieldFromExpr";
  value: IRExpr;
}

// Await expression
export interface Py_AwaitExpr {
  kind: "Py_AwaitExpr";
  value: IRExpr;
}

// Walrus operator: name := expr
export interface Py_WalrusExpr {
  kind: "Py_WalrusExpr";
  target: string;
  value: IRExpr;
}

// Dict literal: {k: v, ...}
export interface Py_DictExpr {
  kind: "Py_DictExpr";
  keys: (IRExpr | null)[];           // null for **spread
  values: IRExpr[];
}

// Set literal: {a, b, c}
export interface Py_SetExpr {
  kind: "Py_SetExpr";
  elts: IRExpr[];
}

// Tuple expression: (a, b, c)
export interface Py_TupleExpr {
  kind: "Py_TupleExpr";
  elts: IRExpr[];
}

// Slots declaration helper
export interface Py_SlotsDecl {
  names: string[];
}

// Magic method name mapping (short → dunder)
export const PY_MAGIC_METHODS: Record<string, string> = {
  "init": "__init__",
  "str": "__str__",
  "repr": "__repr__",
  "eq": "__eq__",
  "hash": "__hash__",
  "ln": "__len__",
  "iter": "__iter__",
  "next": "__next__",
  "enter": "__enter__",
  "exit": "__exit__",
  "gi": "__getitem__",
  "si": "__setitem__",
  "ct": "__contains__",
  "call": "__call__",
  "lt": "__lt__",
  "le": "__le__",
  "gt": "__gt__",
  "ge": "__ge__",
  "dget": "__get__",
  "dset": "__set__",
  "dsn": "__set_name__",
  "bool": "__bool__",
  "del": "__del__",
  "aenter": "__aenter__",
  "aexit": "__aexit__",
  "aiter": "__aiter__",
  "anext": "__anext__",
  "add": "__add__",
  "sub": "__sub__",
  "mul": "__mul__",
  "truediv": "__truediv__",
  "floordiv": "__floordiv__",
  "mod": "__mod__",
  "pow": "__pow__",
  "neg": "__neg__",
  "pos": "__pos__",
  "abs": "__abs__",
  "invert": "__invert__",
};

// Reverse mapping (dunder → short)
export const PY_MAGIC_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(PY_MAGIC_METHODS).map(([k, v]) => [v, k])
);

// ============= TypeScript-Specific IR Nodes =============
// Used by reverse/typescript.ts (TS source → IR) and emitter/typescript.ts (IR → TS).

export interface Ts_Param {
  name: string;
  type?: Ts_TypeExpr;
  optional?: boolean;
  default_?: IRExpr;
  rest?: boolean;
  modifier?: string;
}

export type Ts_TypeExpr =
  | Ts_TypeRef
  | Ts_ArrayType
  | Ts_TupleType
  | Ts_UnionType
  | Ts_IntersectionType
  | Ts_FnType
  | Ts_TypeLit
  | Ts_ConditionalType
  | Ts_MappedType
  | Ts_IndexedAccessType
  | Ts_LiteralType
  | Ts_TemplateLiteralType
  | Ts_ParenType
  | Ts_TypeofType
  | Ts_KeyofType
  | Ts_InferType
  | Ts_TypePredicateExpr;

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
  indexSignature?: { keyName: string; keyType: Ts_TypeExpr };
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

export type Ts_ClassMember =
  | Ts_FieldDecl
  | Ts_MethodDecl
  | Ts_CtorDecl
  | Ts_GetterDecl
  | Ts_SetterDecl;

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
  members: { name: string; value?: IRExpr }[];
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
  catchParam?: { name: string; type?: Ts_TypeExpr };
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

export type Ts_ObjectProperty =
  | { kind: "property"; key: IRExpr; value: IRExpr; computed: boolean; shorthand: boolean }
  | { kind: "method"; name: string; params: Ts_Param[]; returnType?: Ts_TypeExpr; body: Ts_BlockStmt; isAsync: boolean; isGenerator: boolean }
  | { kind: "getter"; name: string; body: Ts_BlockStmt }
  | { kind: "setter"; name: string; param: Ts_Param; body: Ts_BlockStmt }
  | { kind: "spread"; value: IRExpr };

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

