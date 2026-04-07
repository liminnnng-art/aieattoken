// IR (Intermediate Representation) types
// Aligned with Go AST node types: FunctionDecl, IfStmt, ForStmt, AssignStmt, CallExpr, etc.
// Java-specific nodes use Java_ prefix. Go emitter errors on Java_ nodes; Java emitter errors on Go-only nodes.
// These exist only in memory — not serialized to file format.
// Utility: create simple types
export function simpleType(name) {
    return { name };
}
export function pointerType(base) {
    return { name: "*" + base.name, isPointer: true, elementType: base };
}
export function sliceType(elt) {
    return { name: "[]" + elt.name, isSlice: true, elementType: elt };
}
export function mapType(key, val) {
    return { name: `map[${key.name}]${val.name}`, isMap: true, keyType: key, valueType: val };
}
