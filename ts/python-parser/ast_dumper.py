#!/usr/bin/env python3
"""
ast_dumper.py - Parses Python source files and outputs JSON AST to stdout.

Uses Python's built-in ast module (no external dependencies).
Run: python ast_dumper.py <source-file.py>

Requires Python 3.10+ for match/case support.
"""

import ast
import json
import sys


def check_version():
    if sys.version_info < (3, 10):
        print(
            f"Error: Python 3.10+ required, got {sys.version_info.major}.{sys.version_info.minor}",
            file=sys.stderr,
        )
        sys.exit(1)


# ---------------------------------------------------------------------------
# Operator / unary op / bool op / cmp op mappings
# ---------------------------------------------------------------------------

OPERATOR_MAP = {
    ast.Add: "+",
    ast.Sub: "-",
    ast.Mult: "*",
    ast.Div: "/",
    ast.FloorDiv: "//",
    ast.Mod: "%",
    ast.Pow: "**",
    ast.LShift: "<<",
    ast.RShift: ">>",
    ast.BitOr: "|",
    ast.BitXor: "^",
    ast.BitAnd: "&",
    ast.MatMult: "@",
}

UNARY_OP_MAP = {
    ast.Invert: "~",
    ast.Not: "not",
    ast.UAdd: "+",
    ast.USub: "-",
}

BOOL_OP_MAP = {
    ast.And: "and",
    ast.Or: "or",
}

CMP_OP_MAP = {
    ast.Eq: "==",
    ast.NotEq: "!=",
    ast.Lt: "<",
    ast.LtE: "<=",
    ast.Gt: ">",
    ast.GtE: ">=",
    ast.Is: "is",
    ast.IsNot: "is not",
    ast.In: "in",
    ast.NotIn: "not in",
}


def op_str(op):
    """Convert an operator AST node to its string representation."""
    return OPERATOR_MAP.get(type(op), type(op).__name__)


def unary_op_str(op):
    return UNARY_OP_MAP.get(type(op), type(op).__name__)


def bool_op_str(op):
    return BOOL_OP_MAP.get(type(op), type(op).__name__)


def cmp_op_str(op):
    return CMP_OP_MAP.get(type(op), type(op).__name__)


# ---------------------------------------------------------------------------
# AST node -> dict conversion
# ---------------------------------------------------------------------------


def convert_node(node):
    """Recursively convert an AST node to a JSON-serializable dict."""
    if node is None:
        return None

    if isinstance(node, list):
        return [convert_node(item) for item in node]

    if not isinstance(node, ast.AST):
        # Primitive value (str, int, float, bool, bytes, etc.)
        return node

    kind = type(node).__name__
    handler = NODE_HANDLERS.get(kind)
    if handler is not None:
        return handler(node)

    # Fallback: generic conversion for unhandled node types
    return _generic_convert(node)


def _generic_convert(node):
    """Generic fallback: convert any AST node by iterating its fields."""
    result = {"Kind": type(node).__name__}
    for field, value in ast.iter_fields(node):
        key = _pascal_case(field)
        result[key] = convert_node(value)
    return result


def _pascal_case(s):
    """Convert snake_case field name to PascalCase."""
    return "".join(part.capitalize() for part in s.split("_"))


# ---------------------------------------------------------------------------
# Node-specific handlers
# ---------------------------------------------------------------------------


def _module(node):
    return {
        "Kind": "Module",
        "Body": convert_node(node.body),
    }


def _function_def(node, is_async=False):
    kind = "AsyncFunctionDef" if is_async else "FunctionDef"
    return {
        "Kind": kind,
        "Name": node.name,
        "Decorators": convert_node(node.decorator_list),
        "Args": _convert_arguments(node.args),
        "Returns": convert_node(node.returns),
        "Body": convert_node(node.body),
    }


def _async_function_def(node):
    return _function_def(node, is_async=True)


def _convert_arguments(node):
    """Convert an ast.arguments node."""
    return {
        "Args": [_convert_arg(a) for a in node.args],
        "Vararg": _convert_arg(node.vararg) if node.vararg else None,
        "Kwarg": _convert_arg(node.kwarg) if node.kwarg else None,
        "Defaults": convert_node(node.defaults),
        "KwDefaults": convert_node(node.kw_defaults),
        "PosOnlyArgs": [_convert_arg(a) for a in node.posonlyargs],
        "KwOnlyArgs": [_convert_arg(a) for a in node.kwonlyargs],
    }


def _convert_arg(node):
    """Convert an ast.arg node."""
    result = {
        "Arg": node.arg,
        "Annotation": convert_node(node.annotation),
    }
    if node.type_comment:
        result["TypeComment"] = node.type_comment
    return result


def _class_def(node):
    return {
        "Kind": "ClassDef",
        "Name": node.name,
        "Bases": convert_node(node.bases),
        "Keywords": [_convert_keyword(kw) for kw in node.keywords],
        "Decorators": convert_node(node.decorator_list),
        "Body": convert_node(node.body),
    }


def _convert_keyword(node):
    return {
        "Arg": node.arg,  # None for **kwargs
        "Value": convert_node(node.value),
    }


def _return(node):
    return {
        "Kind": "Return",
        "Value": convert_node(node.value),
    }


def _delete(node):
    return {
        "Kind": "Delete",
        "Targets": convert_node(node.targets),
    }


def _assign(node):
    result = {
        "Kind": "Assign",
        "Targets": convert_node(node.targets),
        "Value": convert_node(node.value),
    }
    if node.type_comment:
        result["TypeComment"] = node.type_comment
    return result


def _aug_assign(node):
    return {
        "Kind": "AugAssign",
        "Target": convert_node(node.target),
        "Op": op_str(node.op),
        "Value": convert_node(node.value),
    }


def _ann_assign(node):
    return {
        "Kind": "AnnAssign",
        "Target": convert_node(node.target),
        "Annotation": convert_node(node.annotation),
        "Value": convert_node(node.value),
        "Simple": node.simple,
    }


def _for(node, is_async=False):
    kind = "AsyncFor" if is_async else "For"
    return {
        "Kind": kind,
        "Target": convert_node(node.target),
        "Iter": convert_node(node.iter),
        "Body": convert_node(node.body),
        "OrElse": convert_node(node.orelse),
    }


def _async_for(node):
    return _for(node, is_async=True)


def _while(node):
    return {
        "Kind": "While",
        "Test": convert_node(node.test),
        "Body": convert_node(node.body),
        "OrElse": convert_node(node.orelse),
    }


def _if(node):
    return {
        "Kind": "If",
        "Test": convert_node(node.test),
        "Body": convert_node(node.body),
        "OrElse": convert_node(node.orelse),
    }


def _with(node, is_async=False):
    kind = "AsyncWith" if is_async else "With"
    return {
        "Kind": kind,
        "Items": [_convert_withitem(item) for item in node.items],
        "Body": convert_node(node.body),
    }


def _async_with(node):
    return _with(node, is_async=True)


def _convert_withitem(node):
    return {
        "ContextExpr": convert_node(node.context_expr),
        "OptionalVars": convert_node(node.optional_vars),
    }


def _match(node):
    return {
        "Kind": "Match",
        "Subject": convert_node(node.subject),
        "Cases": [_convert_match_case(c) for c in node.cases],
    }


def _convert_match_case(node):
    return {
        "Pattern": convert_node(node.pattern),
        "Guard": convert_node(node.guard),
        "Body": convert_node(node.body),
    }


# Match patterns (Python 3.10+)

def _match_value(node):
    return {
        "Kind": "MatchValue",
        "Value": convert_node(node.value),
    }


def _match_singleton(node):
    return {
        "Kind": "MatchSingleton",
        "Value": node.value,
    }


def _match_sequence(node):
    return {
        "Kind": "MatchSequence",
        "Patterns": convert_node(node.patterns),
    }


def _match_mapping(node):
    return {
        "Kind": "MatchMapping",
        "Keys": convert_node(node.keys),
        "Patterns": convert_node(node.patterns),
        "Rest": node.rest,
    }


def _match_class(node):
    return {
        "Kind": "MatchClass",
        "Cls": convert_node(node.cls),
        "Patterns": convert_node(node.patterns),
        "KwdAttrs": node.kwd_attrs,
        "KwdPatterns": convert_node(node.kwd_patterns),
    }


def _match_star(node):
    return {
        "Kind": "MatchStar",
        "Name": node.name,
    }


def _match_as(node):
    return {
        "Kind": "MatchAs",
        "Pattern": convert_node(node.pattern),
        "Name": node.name,
    }


def _match_or(node):
    return {
        "Kind": "MatchOr",
        "Patterns": convert_node(node.patterns),
    }


def _raise(node):
    return {
        "Kind": "Raise",
        "Exc": convert_node(node.exc),
        "Cause": convert_node(node.cause),
    }


def _try(node):
    return {
        "Kind": "Try",
        "Body": convert_node(node.body),
        "Handlers": [_convert_excepthandler(h) for h in node.handlers],
        "OrElse": convert_node(node.orelse),
        "FinalBody": convert_node(node.finalbody),
    }


def _try_star(node):
    return {
        "Kind": "TryStar",
        "Body": convert_node(node.body),
        "Handlers": [_convert_excepthandler(h) for h in node.handlers],
        "OrElse": convert_node(node.orelse),
        "FinalBody": convert_node(node.finalbody),
    }


def _convert_excepthandler(node):
    return {
        "Kind": "ExceptHandler",
        "Type": convert_node(node.type),
        "Name": node.name,
        "Body": convert_node(node.body),
    }


def _assert(node):
    return {
        "Kind": "Assert",
        "Test": convert_node(node.test),
        "Msg": convert_node(node.msg),
    }


def _import(node):
    return {
        "Kind": "Import",
        "Names": [_convert_alias(a) for a in node.names],
    }


def _import_from(node):
    return {
        "Kind": "ImportFrom",
        "Module": node.module,
        "Names": [_convert_alias(a) for a in node.names],
        "Level": node.level,
    }


def _convert_alias(node):
    return {
        "Name": node.name,
        "AsName": node.asname,
    }


def _global(node):
    return {
        "Kind": "Global",
        "Names": node.names,
    }


def _nonlocal(node):
    return {
        "Kind": "Nonlocal",
        "Names": node.names,
    }


def _expr_stmt(node):
    return {
        "Kind": "Expr",
        "Value": convert_node(node.value),
    }


def _pass(node):
    return {"Kind": "Pass"}


def _break(node):
    return {"Kind": "Break"}


def _continue(node):
    return {"Kind": "Continue"}


# ---------------------------------------------------------------------------
# Expression handlers
# ---------------------------------------------------------------------------


def _bool_op(node):
    return {
        "Kind": "BoolOp",
        "Op": bool_op_str(node.op),
        "Values": convert_node(node.values),
    }


def _named_expr(node):
    return {
        "Kind": "NamedExpr",
        "Target": convert_node(node.target),
        "Value": convert_node(node.value),
    }


def _bin_op(node):
    return {
        "Kind": "BinOp",
        "Left": convert_node(node.left),
        "Op": op_str(node.op),
        "Right": convert_node(node.right),
    }


def _unary_op(node):
    return {
        "Kind": "UnaryOp",
        "Op": unary_op_str(node.op),
        "Operand": convert_node(node.operand),
    }


def _lambda(node):
    return {
        "Kind": "Lambda",
        "Args": _convert_arguments(node.args),
        "Body": convert_node(node.body),
    }


def _if_exp(node):
    return {
        "Kind": "IfExp",
        "Test": convert_node(node.test),
        "Body": convert_node(node.body),
        "OrElse": convert_node(node.orelse),
    }


def _dict(node):
    return {
        "Kind": "Dict",
        "Keys": convert_node(node.keys),
        "Values": convert_node(node.values),
    }


def _set(node):
    return {
        "Kind": "Set",
        "Elts": convert_node(node.elts),
    }


def _list_comp(node):
    return {
        "Kind": "ListComp",
        "Elt": convert_node(node.elt),
        "Generators": [_convert_comprehension(g) for g in node.generators],
    }


def _set_comp(node):
    return {
        "Kind": "SetComp",
        "Elt": convert_node(node.elt),
        "Generators": [_convert_comprehension(g) for g in node.generators],
    }


def _generator_exp(node):
    return {
        "Kind": "GeneratorExp",
        "Elt": convert_node(node.elt),
        "Generators": [_convert_comprehension(g) for g in node.generators],
    }


def _dict_comp(node):
    return {
        "Kind": "DictComp",
        "Key": convert_node(node.key),
        "Value": convert_node(node.value),
        "Generators": [_convert_comprehension(g) for g in node.generators],
    }


def _convert_comprehension(node):
    return {
        "Target": convert_node(node.target),
        "Iter": convert_node(node.iter),
        "Ifs": convert_node(node.ifs),
        "IsAsync": node.is_async,
    }


def _await(node):
    return {
        "Kind": "Await",
        "Value": convert_node(node.value),
    }


def _yield(node):
    return {
        "Kind": "Yield",
        "Value": convert_node(node.value),
    }


def _yield_from(node):
    return {
        "Kind": "YieldFrom",
        "Value": convert_node(node.value),
    }


def _compare(node):
    return {
        "Kind": "Compare",
        "Left": convert_node(node.left),
        "Ops": [cmp_op_str(op) for op in node.ops],
        "Comparators": convert_node(node.comparators),
    }


def _call(node):
    return {
        "Kind": "Call",
        "Func": convert_node(node.func),
        "Args": convert_node(node.args),
        "Keywords": [_convert_keyword(kw) for kw in node.keywords],
    }


def _formatted_value(node):
    # conversion: -1 means no conversion, otherwise ord of 's', 'r', 'a'
    conv = None
    if node.conversion and node.conversion != -1:
        conv = chr(node.conversion)
    return {
        "Kind": "FormattedValue",
        "Value": convert_node(node.value),
        "Conversion": conv,
        "FormatSpec": convert_node(node.format_spec),
    }


def _joined_str(node):
    return {
        "Kind": "JoinedStr",
        "Values": convert_node(node.values),
    }


def _constant(node):
    value = node.value
    # Handle special types that are not JSON-serializable
    if isinstance(value, bytes):
        value = value.decode("latin-1", errors="replace")
    elif isinstance(value, complex):
        value = {"Real": value.real, "Imag": value.imag}
    elif isinstance(value, type(...)):
        value = "..."
    elif isinstance(value, frozenset):
        value = list(value)
    result = {
        "Kind": "Constant",
        "Value": value,
    }
    if node.kind is not None:
        result["ConstKind"] = node.kind
    return result


def _attribute(node):
    return {
        "Kind": "Attribute",
        "Value": convert_node(node.value),
        "Attr": node.attr,
    }


def _subscript(node):
    return {
        "Kind": "Subscript",
        "Value": convert_node(node.value),
        "Slice": convert_node(node.slice),
    }


def _starred(node):
    return {
        "Kind": "Starred",
        "Value": convert_node(node.value),
    }


def _name(node):
    return {
        "Kind": "Name",
        "Id": node.id,
    }


def _list(node):
    return {
        "Kind": "List",
        "Elts": convert_node(node.elts),
    }


def _tuple(node):
    return {
        "Kind": "Tuple",
        "Elts": convert_node(node.elts),
    }


def _slice(node):
    return {
        "Kind": "Slice",
        "Lower": convert_node(node.lower),
        "Upper": convert_node(node.upper),
        "Step": convert_node(node.step),
    }


# ---------------------------------------------------------------------------
# Type parameter handlers (Python 3.12+ PEP 695)
# ---------------------------------------------------------------------------


def _type_alias(node):
    """Handle type statement (PEP 695): type Alias = ..."""
    result = {
        "Kind": "TypeAlias",
        "Name": convert_node(node.name),
        "Value": convert_node(node.value),
    }
    if hasattr(node, "type_params"):
        result["TypeParams"] = convert_node(node.type_params)
    return result


def _type_var(node):
    result = {"Kind": "TypeVar", "Name": node.name}
    if hasattr(node, "bound") and node.bound:
        result["Bound"] = convert_node(node.bound)
    return result


def _type_var_tuple(node):
    return {"Kind": "TypeVarTuple", "Name": node.name}


def _param_spec(node):
    return {"Kind": "ParamSpec", "Name": node.name}


# ---------------------------------------------------------------------------
# Handler dispatch table
# ---------------------------------------------------------------------------

NODE_HANDLERS = {
    # Module
    "Module": _module,
    "Interactive": lambda n: {"Kind": "Interactive", "Body": convert_node(n.body)},
    "Expression": lambda n: {"Kind": "Expression", "Body": convert_node(n.body)},
    "FunctionType": lambda n: {
        "Kind": "FunctionType",
        "ArgTypes": convert_node(n.argtypes),
        "Returns": convert_node(n.returns),
    },
    # Statements
    "FunctionDef": _function_def,
    "AsyncFunctionDef": _async_function_def,
    "ClassDef": _class_def,
    "Return": _return,
    "Delete": _delete,
    "Assign": _assign,
    "AugAssign": _aug_assign,
    "AnnAssign": _ann_assign,
    "For": _for,
    "AsyncFor": _async_for,
    "While": _while,
    "If": _if,
    "With": _with,
    "AsyncWith": _async_with,
    "Match": _match,
    "Raise": _raise,
    "Try": _try,
    "TryStar": _try_star,
    "Assert": _assert,
    "Import": _import,
    "ImportFrom": _import_from,
    "Global": _global,
    "Nonlocal": _nonlocal,
    "Expr": _expr_stmt,
    "Pass": _pass,
    "Break": _break,
    "Continue": _continue,
    # Expressions
    "BoolOp": _bool_op,
    "NamedExpr": _named_expr,
    "BinOp": _bin_op,
    "UnaryOp": _unary_op,
    "Lambda": _lambda,
    "IfExp": _if_exp,
    "Dict": _dict,
    "Set": _set,
    "ListComp": _list_comp,
    "SetComp": _set_comp,
    "GeneratorExp": _generator_exp,
    "DictComp": _dict_comp,
    "Await": _await,
    "Yield": _yield,
    "YieldFrom": _yield_from,
    "Compare": _compare,
    "Call": _call,
    "FormattedValue": _formatted_value,
    "JoinedStr": _joined_str,
    "Constant": _constant,
    "Attribute": _attribute,
    "Subscript": _subscript,
    "Starred": _starred,
    "Name": _name,
    "List": _list,
    "Tuple": _tuple,
    "Slice": _slice,
    # Match patterns (Python 3.10+)
    "MatchValue": _match_value,
    "MatchSingleton": _match_singleton,
    "MatchSequence": _match_sequence,
    "MatchMapping": _match_mapping,
    "MatchClass": _match_class,
    "MatchStar": _match_star,
    "MatchAs": _match_as,
    "MatchOr": _match_or,
    # Type parameters (Python 3.12+)
    "TypeAlias": _type_alias,
    "TypeVar": _type_var,
    "TypeVarTuple": _type_var_tuple,
    "ParamSpec": _param_spec,
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    check_version()

    if len(sys.argv) < 2:
        print("Usage: python ast_dumper.py <python-source-file>", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            source = f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: Could not read file: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        tree = ast.parse(source, filename=file_path, type_comments=True)
    except SyntaxError as e:
        print(f"Error: Syntax error in {file_path}: {e}", file=sys.stderr)
        sys.exit(1)

    result = convert_node(tree)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
