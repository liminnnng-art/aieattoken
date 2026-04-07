// IR (Intermediate Representation) types
// Aligned with Go AST node types: FunctionDecl, IfStmt, ForStmt, AssignStmt, CallExpr, etc.
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
  | IRConstDecl;

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
  | IRRawGoExpr;

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
