"""
Python Token Analyzer for AET-Python Phase 1
Uses Python's tokenize module for accurate token classification,
outputs JSON for consumption by the Node.js tiktoken counter.
"""
import tokenize
import json
import sys
import io
import ast
import re
from pathlib import Path
from collections import defaultdict

PYTHON_KEYWORDS = {
    'def', 'return', 'class', 'if', 'elif', 'else', 'for', 'while',
    'import', 'from', 'with', 'as', 'try', 'except', 'raise', 'finally',
    'yield', 'async', 'await', 'lambda', 'pass', 'break', 'continue',
    'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None',
    'global', 'nonlocal', 'del', 'assert', 'match', 'case', 'type',
}

BUILTIN_FUNCTIONS = {
    'print', 'len', 'range', 'int', 'str', 'float', 'bool', 'list',
    'dict', 'set', 'tuple', 'type', 'isinstance', 'issubclass',
    'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed',
    'min', 'max', 'sum', 'abs', 'round', 'open', 'input',
    'super', 'property', 'staticmethod', 'classmethod', 'abstractmethod',
    'hasattr', 'getattr', 'setattr', 'delattr', 'vars', 'dir',
    'id', 'hash', 'repr', 'format', 'iter', 'next', 'any', 'all',
    'chr', 'ord', 'hex', 'oct', 'bin',
}

OPERATORS = {
    '+', '-', '*', '/', '//', '%', '**', '=', '+=', '-=', '*=', '/=',
    '//=', '%=', '**=', '==', '!=', '<', '>', '<=', '>=', '&', '|',
    '^', '~', '<<', '>>', '&=', '|=', '^=', '<<=', '>>=', ':=',
    '->', '@', '@=',
}

DELIMITERS = {'(', ')', '[', ']', '{', '}', ',', ':', ';', '.', '...'}


def classify_token(tok_type, tok_string, prev_token=None):
    """Classify a Python token into our analysis categories."""
    if tok_type == tokenize.INDENT or tok_type == tokenize.DEDENT:
        return 'indentation'
    if tok_type == tokenize.NEWLINE or tok_type == tokenize.NL:
        return 'whitespace'
    if tok_type == tokenize.COMMENT:
        return 'comment'
    if tok_type == tokenize.STRING:
        # Check if it's a docstring (triple-quoted at start of body)
        if tok_string.startswith('"""') or tok_string.startswith("'''"):
            return 'docstring'
        return 'string_literal'
    if tok_type == tokenize.NUMBER:
        return 'number_literal'
    if tok_type == tokenize.NAME:
        if tok_string in PYTHON_KEYWORDS:
            return 'keyword'
        if tok_string == 'self':
            return 'self'
        if tok_string == 'cls':
            return 'cls'
        if tok_string.startswith('__') and tok_string.endswith('__'):
            return 'magic_method'
        if tok_string in BUILTIN_FUNCTIONS:
            return 'builtin'
        return 'identifier'
    if tok_type == tokenize.OP:
        if tok_string in OPERATORS:
            return 'operator'
        if tok_string in DELIMITERS:
            return 'delimiter'
        return 'operator'
    if tok_type == tokenize.ENCODING:
        return 'encoding'
    if tok_type == tokenize.ENDMARKER:
        return 'endmarker'
    return 'other'


def analyze_indentation(source):
    """Analyze indentation patterns in detail."""
    lines = source.split('\n')
    total_indent_spaces = 0
    indent_levels = defaultdict(int)
    max_indent = 0
    indented_lines = 0

    for line in lines:
        if not line.strip():  # skip empty lines
            continue
        leading = len(line) - len(line.lstrip())
        if leading > 0:
            total_indent_spaces += leading
            indent_level = leading // 4  # assume 4-space indent
            indent_levels[indent_level] += 1
            indented_lines += 1
            max_indent = max(max_indent, indent_level)

    return {
        'total_indent_spaces': total_indent_spaces,
        'indented_lines': indented_lines,
        'total_lines': len([l for l in lines if l.strip()]),
        'max_indent_level': max_indent,
        'indent_distribution': dict(indent_levels),
    }


def analyze_structures(source):
    """Analyze Python-specific structures using AST."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {}

    structures = defaultdict(int)
    imports = []
    decorators = []
    type_hints = []
    comprehensions = []

    for node in ast.walk(tree):
        # Function definitions
        if isinstance(node, ast.FunctionDef):
            structures['def'] += 1
            if node.decorator_list:
                for d in node.decorator_list:
                    structures['decorator'] += 1
                    decorators.append(ast.dump(d))
            if node.returns:
                structures['return_annotation'] += 1
                type_hints.append(f"return:{ast.dump(node.returns)}")
            for arg in node.args.args:
                if arg.annotation:
                    structures['param_annotation'] += 1
                    type_hints.append(f"param:{ast.dump(arg.annotation)}")
            if node.args.vararg:
                structures['args'] += 1
            if node.args.kwarg:
                structures['kwargs'] += 1

        elif isinstance(node, ast.AsyncFunctionDef):
            structures['async_def'] += 1
            if node.decorator_list:
                for d in node.decorator_list:
                    structures['decorator'] += 1

        # Class definitions
        elif isinstance(node, ast.ClassDef):
            structures['class'] += 1
            if node.bases:
                structures['inheritance'] += len(node.bases)
            if node.decorator_list:
                for d in node.decorator_list:
                    structures['class_decorator'] += 1

        # Imports
        elif isinstance(node, ast.Import):
            structures['import'] += 1
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            structures['from_import'] += 1
            if node.module:
                imports.append(f"from {node.module}")

        # Control flow
        elif isinstance(node, ast.If):
            structures['if'] += 1
        elif isinstance(node, ast.For):
            structures['for'] += 1
        elif isinstance(node, ast.While):
            structures['while'] += 1
        elif isinstance(node, ast.With):
            structures['with'] += 1
        elif isinstance(node, ast.AsyncWith):
            structures['async_with'] += 1

        # Error handling
        elif isinstance(node, ast.Try):
            structures['try'] += 1
        elif isinstance(node, ast.ExceptHandler):
            structures['except'] += 1
        elif isinstance(node, ast.Raise):
            structures['raise'] += 1

        # Comprehensions
        elif isinstance(node, ast.ListComp):
            structures['list_comp'] += 1
        elif isinstance(node, ast.DictComp):
            structures['dict_comp'] += 1
        elif isinstance(node, ast.SetComp):
            structures['set_comp'] += 1
        elif isinstance(node, ast.GeneratorExp):
            structures['generator_exp'] += 1

        # Expressions
        elif isinstance(node, ast.Lambda):
            structures['lambda'] += 1
        elif isinstance(node, ast.Yield):
            structures['yield'] += 1
        elif isinstance(node, ast.YieldFrom):
            structures['yield_from'] += 1
        elif isinstance(node, ast.Await):
            structures['await'] += 1
        elif isinstance(node, ast.NamedExpr):
            structures['walrus'] += 1
        elif isinstance(node, ast.Match):
            structures['match'] += 1

        # Attribute access (self.x)
        elif isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name) and node.value.id == 'self':
                structures['self_attr'] += 1

        # Return
        elif isinstance(node, ast.Return):
            structures['return'] += 1

        # f-strings
        elif isinstance(node, ast.JoinedStr):
            structures['fstring'] += 1

        # Assert
        elif isinstance(node, ast.Assert):
            structures['assert'] += 1

    return {
        'structures': dict(structures),
        'imports': imports,
        'decorator_count': len(decorators),
        'type_hint_count': len(type_hints),
    }


def analyze_self_usage(source):
    """Count self references in detail."""
    self_param = 0  # self as method parameter
    self_attr = 0   # self.x accesses
    self_method = 0 # self.method() calls

    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {'self_param': 0, 'self_attr': 0, 'self_method': 0}

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.args.args and node.args.args[0].arg == 'self':
                self_param += 1
        elif isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name) and node.value.id == 'self':
                self_attr += 1
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                if isinstance(node.func.value, ast.Name) and node.func.value.id == 'self':
                    self_method += 1

    return {
        'self_param': self_param,
        'self_attr': self_attr,
        'self_method': self_method,
        'total_self': self_param + self_attr + self_method,
    }


def analyze_docstrings(source):
    """Extract and analyze docstrings."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {'count': 0, 'total_chars': 0}

    docstrings = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)):
            if (node.body and isinstance(node.body[0], ast.Expr)
                    and isinstance(node.body[0].value, ast.Constant)):
                val = node.body[0].value
                ds = val.value
                if isinstance(ds, str):
                    docstrings.append(ds)

    return {
        'count': len(docstrings),
        'total_chars': sum(len(d) for d in docstrings),
        'docstrings': docstrings,
    }


def analyze_file(filepath):
    """Complete analysis of a single Python file."""
    source = Path(filepath).read_text(encoding='utf-8')
    lines = source.split('\n')

    # Token classification
    tokens_by_category = defaultdict(list)
    token_list = []

    try:
        readline = io.BytesIO(source.encode('utf-8')).readline
        for tok in tokenize.tokenize(readline):
            tok_type, tok_string, start, end, line = tok
            category = classify_token(tok_type, tok_string)
            if category in ('encoding', 'endmarker'):
                continue
            tokens_by_category[category].append(tok_string)
            token_list.append({
                'type': category,
                'string': tok_string,
                'line': start[0],
            })
    except tokenize.TokenError as e:
        print(f"Warning: tokenize error in {filepath}: {e}", file=sys.stderr)

    # Build category text chunks for tiktoken counting
    category_texts = {}
    for cat, toks in tokens_by_category.items():
        category_texts[cat] = toks

    # Indentation analysis
    indent_info = analyze_indentation(source)

    # Structure analysis
    structure_info = analyze_structures(source)

    # Self usage analysis
    self_info = analyze_self_usage(source)

    # Docstring analysis
    docstring_info = analyze_docstrings(source)

    # Build indentation text (actual whitespace at line starts)
    indent_text = ''
    for line in lines:
        if line.strip():
            leading = len(line) - len(line.lstrip())
            if leading > 0:
                indent_text += line[:leading]

    # Variable name analysis
    identifiers = tokens_by_category.get('identifier', [])
    id_freq = defaultdict(int)
    for ident in identifiers:
        id_freq[ident] += 1

    return {
        'file': str(filepath),
        'lines': len(lines),
        'non_empty_lines': len([l for l in lines if l.strip()]),
        'source': source,
        'category_tokens': {k: v for k, v in tokens_by_category.items()},
        'indent_info': indent_info,
        'indent_text': indent_text,
        'structure_info': structure_info,
        'self_info': self_info,
        'docstring_info': docstring_info,
        'identifier_frequency': dict(id_freq),
        'token_list': token_list,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python-token-analyzer.py <file1.py> [file2.py ...]")
        sys.exit(1)

    results = []
    for filepath in sys.argv[1:]:
        result = analyze_file(filepath)
        results.append(result)

    # Output JSON to stdout
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
