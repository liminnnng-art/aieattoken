// IR (Intermediate Representation) types
// Aligned with Go AST node types: FunctionDecl, IfStmt, ForStmt, AssignStmt, CallExpr, etc.
// Java-specific nodes use Java_ prefix. Go emitter errors on Java_ nodes; Java emitter errors on Go-only nodes.
// Python-specific nodes use Py_ prefix.
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
// Magic method name mapping (short → dunder)
export const PY_MAGIC_METHODS = {
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
    "$get": "__get__",
    "$set": "__set__",
    "$sn": "__set_name__",
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
export const PY_MAGIC_REVERSE = Object.fromEntries(Object.entries(PY_MAGIC_METHODS).map(([k, v]) => [v, k]));
