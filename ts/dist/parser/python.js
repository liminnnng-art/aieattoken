// AET-Python Parser: Chevrotain-based parser for AET-Python syntax (.aetp files)
// Produces a CST (Concrete Syntax Tree) which is then converted to IR
// Separate from the AET-Go parser — shares no tokens or grammar rules.
import { createToken, Lexer, CstParser } from "chevrotain";
// ============= TOKENS =============
// All keywords/operators verified as single cl100k_base tokens where possible.
// Identifier: defined first so keywords can reference it via longer_alt.
// In the allTokens array, Ident appears AFTER keywords (keywords take priority).
export const Ident = createToken({ name: "Ident", pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });
// Version marker: !py-v1, !py-v2, etc.
export const PyVersionMarker = createToken({
    name: "PyVersionMarker",
    pattern: /!py-v[0-9]+/,
});
// --- Keywords ---
// All keywords use longer_alt: Ident so that e.g. "island" matches Ident, not "is" + "land".
export const Class = createToken({ name: "Class", pattern: /class/, longer_alt: Ident });
export const If = createToken({ name: "If", pattern: /if/, longer_alt: Ident });
export const Elif = createToken({ name: "Elif", pattern: /elif/, longer_alt: Ident });
export const Else = createToken({ name: "Else", pattern: /else/, longer_alt: Ident });
export const For = createToken({ name: "For", pattern: /for/, longer_alt: Ident });
export const While = createToken({ name: "While", pattern: /while/, longer_alt: Ident });
export const In = createToken({ name: "In", pattern: /in/, longer_alt: Ident });
export const Not = createToken({ name: "Not", pattern: /not/, longer_alt: Ident });
export const And = createToken({ name: "And", pattern: /and/, longer_alt: Ident });
export const Or = createToken({ name: "Or", pattern: /or/, longer_alt: Ident });
export const Is = createToken({ name: "Is", pattern: /is/, longer_alt: Ident });
export const Try = createToken({ name: "Try", pattern: /try/, longer_alt: Ident });
export const Except = createToken({ name: "Except", pattern: /except/, longer_alt: Ident });
export const Finally = createToken({ name: "Finally", pattern: /finally/, longer_alt: Ident });
export const Raise = createToken({ name: "Raise", pattern: /raise/, longer_alt: Ident });
export const With = createToken({ name: "With", pattern: /with/, longer_alt: Ident });
export const As = createToken({ name: "As", pattern: /as/, longer_alt: Ident });
export const Async = createToken({ name: "Async", pattern: /async/, longer_alt: Ident });
export const Await = createToken({ name: "Await", pattern: /await/, longer_alt: Ident });
export const Match = createToken({ name: "Match", pattern: /match/, longer_alt: Ident });
export const Case = createToken({ name: "Case", pattern: /case/, longer_alt: Ident });
export const Yield = createToken({ name: "Yield", pattern: /yield/, longer_alt: Ident });
export const From = createToken({ name: "From", pattern: /from/, longer_alt: Ident });
export const Global = createToken({ name: "Global", pattern: /global/, longer_alt: Ident });
export const Nonlocal = createToken({ name: "Nonlocal", pattern: /nonlocal/, longer_alt: Ident });
export const Del = createToken({ name: "Del", pattern: /del/, longer_alt: Ident });
export const Assert = createToken({ name: "Assert", pattern: /assert/, longer_alt: Ident });
export const Pass = createToken({ name: "Pass", pattern: /pass/, longer_alt: Ident });
export const Break = createToken({ name: "Break", pattern: /break/, longer_alt: Ident });
export const Continue = createToken({ name: "Continue", pattern: /continue/, longer_alt: Ident });
export const PyTrue = createToken({ name: "PyTrue", pattern: /True/, longer_alt: Ident });
export const PyFalse = createToken({ name: "PyFalse", pattern: /False/, longer_alt: Ident });
export const PyNone = createToken({ name: "PyNone", pattern: /None/, longer_alt: Ident });
// AET-Python specific keywords
export const Slots = createToken({ name: "Slots", pattern: /slots/, longer_alt: Ident });
// --- AET-specific symbols ---
// ^ = return
export const Caret = createToken({ name: "Caret", pattern: /\^/ });
// | = lambda delimiter (also bitwise OR — disambiguated in parser)
export const Pipe = createToken({ name: "Pipe", pattern: /\|/ });
// @ = decorator prefix
export const At = createToken({ name: "At", pattern: /@/ });
// @main and @dc are recognized as decorator patterns in the grammar (@ + Ident).
// The parser handles them in decoratorExpr and mainBlock rules.
// --- Operators (multi-char, longest match first) ---
export const DoubleStar = createToken({ name: "DoubleStar", pattern: /\*\*/ });
export const FloorDiv = createToken({ name: "FloorDiv", pattern: /\/\// });
export const Arrow = createToken({ name: "Arrow", pattern: /->/ });
export const Walrus = createToken({ name: "Walrus", pattern: /:=/ });
export const FloorDivAssign = createToken({ name: "FloorDivAssign", pattern: /\/\/=/ });
export const DoubleStarAssign = createToken({ name: "DoubleStarAssign", pattern: /\*\*=/ });
export const ShlAssign = createToken({ name: "ShlAssign", pattern: /<<=/ });
export const ShrAssign = createToken({ name: "ShrAssign", pattern: />>=/ });
export const PlusAssign = createToken({ name: "PlusAssign", pattern: /\+=/ });
export const MinusAssign = createToken({ name: "MinusAssign", pattern: /-=/ });
export const MulAssign = createToken({ name: "MulAssign", pattern: /\*=/ });
export const DivAssign = createToken({ name: "DivAssign", pattern: /\/=/ });
export const ModAssign = createToken({ name: "ModAssign", pattern: /%=/ });
export const AmpAssign = createToken({ name: "AmpAssign", pattern: /&=/ });
export const PipeAssign = createToken({ name: "PipeAssign", pattern: /\|=/ });
export const CaretAssign = createToken({ name: "CaretAssign", pattern: /\^=/ });
export const Shl = createToken({ name: "Shl", pattern: /<</ });
export const Shr = createToken({ name: "Shr", pattern: />>/ });
export const Eq = createToken({ name: "Eq", pattern: /==/ });
export const Neq = createToken({ name: "Neq", pattern: /!=/ });
export const Leq = createToken({ name: "Leq", pattern: /<=/ });
export const Geq = createToken({ name: "Geq", pattern: />=/ });
export const Ellipsis = createToken({ name: "Ellipsis", pattern: /\.\.\./ });
// Single-char operators
export const Assign = createToken({ name: "Assign", pattern: /=/ });
export const Plus = createToken({ name: "Plus", pattern: /\+/ });
export const Minus = createToken({ name: "Minus", pattern: /-/ });
export const Star = createToken({ name: "Star", pattern: /\*/ });
export const Slash = createToken({ name: "Slash", pattern: /\// });
export const Percent = createToken({ name: "Percent", pattern: /%/ });
export const Amp = createToken({ name: "Amp", pattern: /&/ });
export const Tilde = createToken({ name: "Tilde", pattern: /~/ });
export const Lt = createToken({ name: "Lt", pattern: /</ });
export const Gt = createToken({ name: "Gt", pattern: />/ });
export const Dot = createToken({ name: "Dot", pattern: /\./ });
export const Colon = createToken({ name: "Colon", pattern: /:/ });
// --- Delimiters ---
export const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const LBrack = createToken({ name: "LBrack", pattern: /\[/ });
export const RBrack = createToken({ name: "RBrack", pattern: /\]/ });
export const Semi = createToken({ name: "Semi", pattern: /;/ });
export const Comma = createToken({ name: "Comma", pattern: /,/ });
// --- Literals ---
// F-strings: f"..." or f'...' (including nested braces for expressions)
// Triple-quoted f-strings first (longer match)
export const FStringTripleDouble = createToken({
    name: "FStringTripleDouble",
    pattern: /f"""(?:[^"\\]|\\.|"(?!"")|""(?!"))*"""/,
});
export const FStringTripleSingle = createToken({
    name: "FStringTripleSingle",
    pattern: /f'''(?:[^'\\]|\\.|'(?!'')|''(?!'))*'''/,
});
export const FStringDouble = createToken({
    name: "FStringDouble",
    pattern: /f"(?:[^"\\]|\\.)*"/,
});
export const FStringSingle = createToken({
    name: "FStringSingle",
    pattern: /f'(?:[^'\\]|\\.)*'/,
});
// Raw strings: r"..." or r'...'
export const RawStringTripleDouble = createToken({
    name: "RawStringTripleDouble",
    pattern: /r"""(?:[^"\\]|\\.|"(?!"")|""(?!"))*"""/,
});
export const RawStringTripleSingle = createToken({
    name: "RawStringTripleSingle",
    pattern: /r'''(?:[^'\\]|\\.|'(?!'')|''(?!'))*'''/,
});
export const RawStringDouble = createToken({
    name: "RawStringDouble",
    pattern: /r"(?:[^"\\]|\\.)*"/,
});
export const RawStringSingle = createToken({
    name: "RawStringSingle",
    pattern: /r'(?:[^'\\]|\\.)*'/,
});
// rb/br strings (raw bytes)
export const RBStringDouble = createToken({
    name: "RBStringDouble",
    pattern: /(?:rb|br)"(?:[^"\\]|\\.)*"/,
});
export const RBStringSingle = createToken({
    name: "RBStringSingle",
    pattern: /(?:rb|br)'(?:[^'\\]|\\.)*'/,
});
// rf/fr strings (raw f-strings)
export const RFStringDouble = createToken({
    name: "RFStringDouble",
    pattern: /(?:rf|fr)"(?:[^"\\]|\\.)*"/,
});
export const RFStringSingle = createToken({
    name: "RFStringSingle",
    pattern: /(?:rf|fr)'(?:[^'\\]|\\.)*'/,
});
// Byte strings: b"..." or b'...'
export const ByteStringDouble = createToken({
    name: "ByteStringDouble",
    pattern: /b"(?:[^"\\]|\\.)*"/,
});
export const ByteStringSingle = createToken({
    name: "ByteStringSingle",
    pattern: /b'(?:[^'\\]|\\.)*'/,
});
// Triple-quoted strings (longer match before single-quoted)
export const TripleDoubleString = createToken({
    name: "TripleDoubleString",
    pattern: /"""(?:[^"\\]|\\.|"(?!"")|""(?!"))*"""/,
});
export const TripleSingleString = createToken({
    name: "TripleSingleString",
    pattern: /'''(?:[^'\\]|\\.|'(?!'')|''(?!'))*'''/,
});
// Regular strings
export const DoubleString = createToken({
    name: "DoubleString",
    pattern: /"(?:[^"\\]|\\.)*"/,
});
export const SingleString = createToken({
    name: "SingleString",
    pattern: /'(?:[^'\\]|\\.)*'/,
});
// Number literals
export const FloatLit = createToken({
    name: "FloatLit",
    pattern: /[0-9](?:_?[0-9])*\.[0-9](?:_?[0-9])*(?:[eE][+-]?[0-9](?:_?[0-9])*)?|[0-9](?:_?[0-9])*[eE][+-]?[0-9](?:_?[0-9])*/,
});
export const HexLit = createToken({ name: "HexLit", pattern: /0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*/ });
export const OctLit = createToken({ name: "OctLit", pattern: /0[oO][0-7](?:_?[0-7])*/ });
export const BinLit = createToken({ name: "BinLit", pattern: /0[bB][01](?:_?[01])*/ });
export const IntLit = createToken({ name: "IntLit", pattern: /[0-9](?:_?[0-9])*/ });
// Underscore — special for patterns like case _:
export const Underscore = createToken({ name: "Underscore", pattern: /_/, longer_alt: Ident });
// --- Whitespace & Comments (skipped) ---
export const LineComment = createToken({ name: "LineComment", pattern: /#[^\n]*/, group: Lexer.SKIPPED });
export const WS = createToken({ name: "WS", pattern: /[\s\t\n\r]+/, group: Lexer.SKIPPED });
// ============= TOKEN ORDERING =============
// Token order matters: longer patterns first, keywords before Ident.
const allTokens = [
    WS,
    LineComment,
    // Version marker (before operators that start with !)
    PyVersionMarker,
    // Multi-char operators (longest match first)
    FloorDivAssign, DoubleStarAssign, ShlAssign, ShrAssign,
    PlusAssign, MinusAssign, MulAssign, DivAssign, ModAssign,
    AmpAssign, PipeAssign, CaretAssign,
    Walrus, Eq, Neq, Leq, Geq, Shl, Shr,
    DoubleStar, FloorDiv, Arrow, Ellipsis,
    // String literals (longest prefixes first)
    // Triple-quoted before single-quoted
    // Prefixed strings before plain strings
    RFStringDouble, RFStringSingle,
    RBStringDouble, RBStringSingle,
    FStringTripleDouble, FStringTripleSingle,
    FStringDouble, FStringSingle,
    RawStringTripleDouble, RawStringTripleSingle,
    RawStringDouble, RawStringSingle,
    ByteStringDouble, ByteStringSingle,
    TripleDoubleString, TripleSingleString,
    DoubleString, SingleString,
    // Number literals (float before int)
    FloatLit, HexLit, OctLit, BinLit, IntLit,
    // Keywords (before Ident — all have longer_alt: Ident)
    Class, Elif, Else, Except, Finally, Async, Await, Assert,
    Break, Continue, Global, Nonlocal, Match,
    Raise, While, Yield, From, Slots,
    Case, With, Del, Pass, For, If, In, Not, And, Or, Is,
    Try, As,
    PyTrue, PyFalse, PyNone,
    // Underscore (before Ident)
    Underscore,
    // Identifier (after all keywords)
    Ident,
    // Single-char operators and delimiters
    At, Caret, Pipe, Tilde,
    Assign, Plus, Minus, Star, Slash, Percent, Amp,
    Lt, Gt,
    LBrace, RBrace, LParen, RParen, LBrack, RBrack,
    Semi, Colon, Comma, Dot,
];
export const AETPythonLexer = new Lexer(allTokens);
// ============= PARSER =============
export class AETPythonParser extends CstParser {
    constructor() {
        super(allTokens, { recoveryEnabled: false, maxLookahead: 2 });
        this.performSelfAnalysis();
    }
    // ─────────────── Program ───────────────
    // program: PyVersionMarker? ';'? (topLevelStmt ';'?)*
    program = this.RULE("program", () => {
        this.OPTION(() => this.CONSUME(PyVersionMarker));
        this.OPTION2(() => this.CONSUME(Semi));
        this.MANY(() => {
            this.SUBRULE(this.topLevelStmt);
            this.OPTION3(() => this.CONSUME2(Semi));
        });
    });
    // ─────────────── Top-Level Statements ───────────────
    // topLevelStmt: decoratedDef | classDecl | funcDef | mainBlock | forStmt | whileStmt
    //             | ifStmt | tryStmt | matchStmt | withStmt | assertStmt | delStmt
    //             | globalStmt | nonlocalStmt | assignOrExprStmt
    topLevelStmt = this.RULE("topLevelStmt", () => {
        this.OR([
            // Decorated def: starts with @
            { GATE: () => this.LA(1).tokenType === At,
                ALT: () => this.SUBRULE(this.decoratedDefOrMain) },
            // Class: starts with 'class'
            { ALT: () => this.SUBRULE(this.classDecl) },
            // Async func/for/with: starts with 'async'
            { GATE: () => this.LA(1).tokenType === Async,
                ALT: () => this.SUBRULE(this.asyncStmt) },
            // Control flow
            { ALT: () => this.SUBRULE(this.ifStmt) },
            { ALT: () => this.SUBRULE(this.forStmt) },
            { ALT: () => this.SUBRULE(this.whileStmt) },
            { ALT: () => this.SUBRULE(this.tryStmt) },
            { ALT: () => this.SUBRULE(this.matchStmt) },
            { ALT: () => this.SUBRULE(this.withStmt) },
            { ALT: () => this.SUBRULE(this.assertStmt) },
            { ALT: () => this.SUBRULE(this.delStmt) },
            { ALT: () => this.SUBRULE(this.globalStmt) },
            { ALT: () => this.SUBRULE(this.nonlocalStmt) },
            { ALT: () => this.SUBRULE(this.raiseStmt) },
            // funcDef: Ident '(' ...
            { GATE: () => this.isFuncDef(),
                ALT: () => this.SUBRULE(this.funcDef) },
            // assignOrExprStmt: fallback
            { ALT: () => this.SUBRULE(this.assignOrExprStmt) },
        ]);
    });
    // ─────────────── Decorated Definitions & @main ───────────────
    // decoratedDefOrMain: ('@' decoratorExpr)+ (funcDef | classDecl)
    //                   | '@' 'main' '{' stmtList '}'
    decoratedDefOrMain = this.RULE("decoratedDefOrMain", () => {
        // Check if this is @main{...}
        this.OR([
            { GATE: () => this.isMainBlock(),
                ALT: () => this.SUBRULE(this.mainBlock) },
            { ALT: () => this.SUBRULE(this.decoratedDef) },
        ]);
    });
    mainBlock = this.RULE("mainBlock", () => {
        this.CONSUME(At);
        this.CONSUME(Ident); // 'main'
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
    });
    decoratedDef = this.RULE("decoratedDef", () => {
        this.AT_LEAST_ONE(() => {
            this.CONSUME(At);
            this.SUBRULE(this.decoratorExpr);
            // Allow optional ';' between decorators and before the def
            this.OPTION(() => this.CONSUME(Semi));
        });
        this.OR([
            { ALT: () => this.SUBRULE(this.classDecl) },
            // @dc shorthand: class decl without `class` keyword (Ident '{' or Ident '(')
            { GATE: () => this.isDcClassDecl(),
                ALT: () => this.SUBRULE(this.dcClassDecl) },
            { GATE: () => this.LA(1).tokenType === Async,
                ALT: () => {
                    this.CONSUME(Async);
                    this.SUBRULE(this.funcDef);
                }
            },
            { ALT: () => this.SUBRULE2(this.funcDef) },
        ]);
    });
    // decoratorExpr: IDENT ('.' IDENT)* ('(' callArgs ')')?
    decoratorExpr = this.RULE("decoratorExpr", () => {
        this.CONSUME(Ident);
        this.MANY(() => {
            this.CONSUME(Dot);
            this.CONSUME2(Ident);
        });
        this.OPTION(() => {
            this.CONSUME(LParen);
            this.OPTION2(() => this.SUBRULE(this.callArgs));
            this.CONSUME(RParen);
        });
    });
    // ─────────────── Class Declaration ───────────────
    // classDecl: 'class' IDENT ('(' callArgs ')')? '{' classBody '}'
    classDecl = this.RULE("classDecl", () => {
        this.CONSUME(Class);
        this.CONSUME(Ident);
        this.OPTION(() => {
            this.CONSUME(LParen);
            this.OPTION2(() => this.SUBRULE(this.callArgs));
            this.CONSUME(RParen);
        });
        this.CONSUME(LBrace);
        this.SUBRULE(this.classBody);
        this.CONSUME(RBrace);
    });
    // dcClassDecl: IDENT ('(' callArgs ')')? '{' classBody '}'
    // Used after @dc decorator — 'class' keyword is omitted
    dcClassDecl = this.RULE("dcClassDecl", () => {
        this.CONSUME(Ident);
        this.OPTION(() => {
            this.CONSUME(LParen);
            this.OPTION2(() => this.SUBRULE(this.callArgs));
            this.CONSUME(RParen);
        });
        this.CONSUME(LBrace);
        this.SUBRULE(this.classBody);
        this.CONSUME(RBrace);
    });
    // classBody: (classMember ';'?)*
    classBody = this.RULE("classBody", () => {
        this.MANY(() => {
            this.SUBRULE(this.classMember);
            this.OPTION(() => this.CONSUME(Semi));
        });
    });
    // classMember: decoratedDef | classDecl | slotsDecl | asyncStmt | funcDef | assignOrExprStmt
    classMember = this.RULE("classMember", () => {
        this.OR([
            { GATE: () => this.LA(1).tokenType === At,
                ALT: () => this.SUBRULE(this.decoratedDef) },
            { ALT: () => this.SUBRULE(this.classDecl) },
            { GATE: () => this.isSlotsDecl(),
                ALT: () => this.SUBRULE(this.slotsDecl) },
            // Async methods: async funcDef, async for, async with
            { GATE: () => this.LA(1).tokenType === Async,
                ALT: () => this.SUBRULE(this.asyncStmt) },
            { GATE: () => this.isFuncDef(),
                ALT: () => this.SUBRULE(this.funcDef) },
            { ALT: () => this.SUBRULE(this.assignOrExprStmt) },
        ]);
    });
    // slotsDecl: 'slots' '(' identList ')'
    slotsDecl = this.RULE("slotsDecl", () => {
        this.CONSUME(Slots);
        this.CONSUME(LParen);
        this.OPTION(() => this.SUBRULE(this.identList));
        this.CONSUME(RParen);
    });
    // identList: IDENT (',' IDENT)*
    identList = this.RULE("identList", () => {
        this.CONSUME(Ident);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.CONSUME2(Ident);
        });
    });
    // ─────────────── Function Definition ───────────────
    // funcDef: IDENT '(' paramList? ')' ('->' typeExpr)? '{' stmtList '}'
    funcDef = this.RULE("funcDef", () => {
        this.CONSUME(Ident);
        this.CONSUME(LParen);
        this.OPTION(() => this.SUBRULE(this.paramList));
        this.CONSUME(RParen);
        this.OPTION2(() => {
            this.CONSUME(Arrow);
            this.SUBRULE(this.typeExpr);
        });
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
    });
    // asyncStmt: 'async' (funcDef | forStmt | withStmt)
    asyncStmt = this.RULE("asyncStmt", () => {
        this.CONSUME(Async);
        this.OR([
            { GATE: () => this.isFuncDef(),
                ALT: () => this.SUBRULE(this.funcDef) },
            { GATE: () => this.LA(1).tokenType === For,
                ALT: () => this.SUBRULE(this.forStmt) },
            { GATE: () => this.LA(1).tokenType === With,
                ALT: () => this.SUBRULE(this.withStmt) },
        ]);
    });
    // paramList: param (',' param)*
    paramList = this.RULE("paramList", () => {
        this.SUBRULE(this.param);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.param);
        });
        // Allow trailing comma
        this.OPTION(() => this.CONSUME2(Comma));
    });
    // param: ('*' | '**' | '/')? IDENT (':' typeExpr)? ('=' expr)?
    //      | '*'   (bare * for keyword-only separator)
    param = this.RULE("param", () => {
        this.OR([
            // ** kwargs
            { GATE: () => this.LA(1).tokenType === DoubleStar,
                ALT: () => {
                    this.CONSUME(DoubleStar);
                    this.CONSUME(Ident);
                    this.OPTION(() => {
                        this.CONSUME(Colon);
                        this.SUBRULE(this.typeExpr);
                    });
                }
            },
            // * or *args
            { GATE: () => this.LA(1).tokenType === Star,
                ALT: () => {
                    this.CONSUME(Star);
                    this.OPTION2(() => {
                        this.CONSUME2(Ident);
                        this.OPTION3(() => {
                            this.CONSUME2(Colon);
                            this.SUBRULE2(this.typeExpr);
                        });
                    });
                }
            },
            // / (positional-only marker)
            { GATE: () => this.LA(1).tokenType === Slash,
                ALT: () => {
                    this.CONSUME(Slash);
                }
            },
            // Regular param: IDENT (':' typeExpr)? ('=' expr)?
            { ALT: () => {
                    this.CONSUME3(Ident);
                    this.OPTION4(() => {
                        this.CONSUME3(Colon);
                        this.SUBRULE3(this.typeExpr);
                    });
                    this.OPTION5(() => {
                        this.CONSUME(Assign);
                        this.SUBRULE(this.expr);
                    });
                } },
        ]);
    });
    // ─────────────── Type Expressions ───────────────
    // typeExpr: primaryType ('|' primaryType)* ('?')?
    // Used in typed mode for parameter/return annotations
    typeExpr = this.RULE("typeExpr", () => {
        this.SUBRULE(this.primaryType);
        this.MANY(() => {
            this.CONSUME(Pipe);
            this.SUBRULE2(this.primaryType);
        });
    });
    // primaryType: IDENT ('.' IDENT)* ('[' typeExpr (',' typeExpr)* ']')? ('?')?
    //            | '(' typeExpr (',' typeExpr)* ')' '->' typeExpr   (Callable)
    //            | IDENT '[]'
    primaryType = this.RULE("primaryType", () => {
        this.OR([
            // Callable: (params) -> retType
            { GATE: () => this.isCallableType(),
                ALT: () => {
                    this.CONSUME(LParen);
                    this.OPTION(() => {
                        this.SUBRULE(this.typeExpr);
                        this.MANY(() => {
                            this.CONSUME(Comma);
                            this.SUBRULE2(this.typeExpr);
                        });
                    });
                    this.CONSUME(RParen);
                    this.CONSUME(Arrow);
                    this.SUBRULE3(this.typeExpr);
                }
            },
            // Named type: IDENT.IDENT[T,U]?
            { ALT: () => {
                    this.CONSUME(Ident);
                    this.MANY2(() => {
                        this.CONSUME(Dot);
                        this.CONSUME2(Ident);
                    });
                    this.OPTION2(() => {
                        this.CONSUME(LBrack);
                        this.SUBRULE4(this.typeExpr);
                        this.MANY3(() => {
                            this.CONSUME2(Comma);
                            this.SUBRULE5(this.typeExpr);
                        });
                        this.CONSUME(RBrack);
                    });
                } },
        ]);
    });
    // ─────────────── Statement List ───────────────
    // stmtList: (stmt ';'?)*
    // Note: '^' (Caret/return) can start a new statement without a preceding ';'
    stmtList = this.RULE("stmtList", () => {
        this.MANY(() => {
            this.SUBRULE(this.stmt);
            this.OPTION(() => this.CONSUME(Semi));
        });
    });
    // ─────────────── Statements ───────────────
    stmt = this.RULE("stmt", () => {
        this.OR([
            { ALT: () => this.SUBRULE(this.returnStmt) },
            { ALT: () => this.SUBRULE(this.ifStmt) },
            { ALT: () => this.SUBRULE(this.forStmt) },
            { ALT: () => this.SUBRULE(this.whileStmt) },
            { ALT: () => this.SUBRULE(this.tryStmt) },
            { ALT: () => this.SUBRULE(this.withStmt) },
            { ALT: () => this.SUBRULE(this.matchStmt) },
            { ALT: () => this.SUBRULE(this.raiseStmt) },
            { ALT: () => this.SUBRULE(this.assertStmt) },
            { ALT: () => this.SUBRULE(this.delStmt) },
            { ALT: () => this.SUBRULE(this.breakStmt) },
            { ALT: () => this.SUBRULE(this.continueStmt) },
            { ALT: () => this.SUBRULE(this.passStmt) },
            { ALT: () => this.SUBRULE(this.globalStmt) },
            { ALT: () => this.SUBRULE(this.nonlocalStmt) },
            // async func/for/with
            { GATE: () => this.LA(1).tokenType === Async,
                ALT: () => this.SUBRULE(this.asyncStmt) },
            // funcDef inside blocks (e.g., closures)
            { GATE: () => this.isFuncDef(),
                ALT: () => this.SUBRULE(this.funcDef) },
            // yield from / yield
            { GATE: () => this.LA(1).tokenType === Yield,
                ALT: () => this.SUBRULE(this.yieldStmt) },
            // Decorated defs inside blocks
            { GATE: () => this.LA(1).tokenType === At,
                ALT: () => this.SUBRULE(this.decoratedDef) },
            // Class inside blocks
            { GATE: () => this.LA(1).tokenType === Class,
                ALT: () => this.SUBRULE(this.classDecl) },
            // assignOrExprStmt: fallback for assignments and expressions
            { ALT: () => this.SUBRULE(this.assignOrExprStmt) },
        ]);
    });
    // ─────────────── Return Statement ───────────────
    // returnStmt: '^' expr?
    returnStmt = this.RULE("returnStmt", () => {
        this.CONSUME(Caret);
        this.OPTION(() => this.SUBRULE(this.expr));
    });
    // ─────────────── If Statement ───────────────
    // ifStmt: 'if' expr '{' stmtList '}' ('elif' expr '{' stmtList '}')* ('else' '{' stmtList '}')?
    ifStmt = this.RULE("ifStmt", () => {
        this.CONSUME(If);
        this.SUBRULE(this.expr);
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
        this.MANY(() => {
            this.CONSUME(Elif);
            this.SUBRULE2(this.expr);
            this.CONSUME2(LBrace);
            this.SUBRULE2(this.stmtList);
            this.CONSUME2(RBrace);
        });
        this.OPTION(() => {
            this.CONSUME(Else);
            this.CONSUME3(LBrace);
            this.SUBRULE3(this.stmtList);
            this.CONSUME3(RBrace);
        });
    });
    // ─────────────── For Statement ───────────────
    // forStmt: 'for' targetList 'in' expr '{' stmtList '}' ('else' '{' stmtList '}')?
    forStmt = this.RULE("forStmt", () => {
        this.CONSUME(For);
        this.SUBRULE(this.targetList);
        this.CONSUME(In);
        this.SUBRULE(this.expr);
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
        this.OPTION(() => {
            this.CONSUME(Else);
            this.CONSUME2(LBrace);
            this.SUBRULE2(this.stmtList);
            this.CONSUME2(RBrace);
        });
    });
    // targetList: target (',' target)*
    // target: ('*')? IDENT trailer* | '(' targetList ')' | '[' targetList ']'
    targetList = this.RULE("targetList", () => {
        this.SUBRULE(this.target);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.target);
        });
    });
    target = this.RULE("target", () => {
        this.OR([
            // Parenthesized target
            { GATE: () => this.LA(1).tokenType === LParen,
                ALT: () => {
                    this.CONSUME(LParen);
                    this.SUBRULE(this.targetList);
                    this.CONSUME(RParen);
                }
            },
            // Bracketed target
            { GATE: () => this.LA(1).tokenType === LBrack,
                ALT: () => {
                    this.CONSUME(LBrack);
                    this.SUBRULE2(this.targetList);
                    this.CONSUME(RBrack);
                }
            },
            // *name (starred)
            { GATE: () => this.LA(1).tokenType === Star,
                ALT: () => {
                    this.CONSUME(Star);
                    this.CONSUME(Ident);
                }
            },
            // .attr (self attribute in class context)
            { GATE: () => this.LA(1).tokenType === Dot,
                ALT: () => {
                    this.CONSUME(Dot);
                    this.CONSUME2(Ident);
                    this.MANY2(() => {
                        this.OR2([
                            { ALT: () => {
                                    this.CONSUME2(Dot);
                                    this.CONSUME3(Ident);
                                } },
                            { ALT: () => {
                                    this.CONSUME2(LBrack);
                                    this.SUBRULE(this.expr);
                                    this.CONSUME2(RBrack);
                                } },
                        ]);
                    });
                }
            },
            // _
            { GATE: () => this.LA(1).tokenType === Underscore,
                ALT: () => this.CONSUME(Underscore) },
            // name with optional trailers (.attr, [subscript])
            { ALT: () => {
                    this.CONSUME4(Ident);
                    this.MANY3(() => {
                        this.OR3([
                            { ALT: () => {
                                    this.CONSUME3(Dot);
                                    this.CONSUME5(Ident);
                                } },
                            { ALT: () => {
                                    this.CONSUME3(LBrack);
                                    this.SUBRULE2(this.expr);
                                    this.CONSUME3(RBrack);
                                } },
                        ]);
                    });
                } },
        ]);
    });
    // ─────────────── While Statement ───────────────
    // whileStmt: 'while' expr '{' stmtList '}' ('else' '{' stmtList '}')?
    whileStmt = this.RULE("whileStmt", () => {
        this.CONSUME(While);
        this.SUBRULE(this.expr);
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
        this.OPTION(() => {
            this.CONSUME(Else);
            this.CONSUME2(LBrace);
            this.SUBRULE2(this.stmtList);
            this.CONSUME2(RBrace);
        });
    });
    // ─────────────── Try Statement ───────────────
    // tryStmt: 'try' '{' stmtList '}' exceptClause* ('else' '{' stmtList '}')? ('finally' '{' stmtList '}')?
    tryStmt = this.RULE("tryStmt", () => {
        this.CONSUME(Try);
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
        this.MANY(() => this.SUBRULE(this.exceptClause));
        this.OPTION(() => {
            this.CONSUME(Else);
            this.CONSUME2(LBrace);
            this.SUBRULE2(this.stmtList);
            this.CONSUME2(RBrace);
        });
        this.OPTION2(() => {
            this.CONSUME(Finally);
            this.CONSUME3(LBrace);
            this.SUBRULE3(this.stmtList);
            this.CONSUME3(RBrace);
        });
    });
    // exceptClause: 'except' (expr ('as' IDENT)?)? '{' stmtList '}'
    exceptClause = this.RULE("exceptClause", () => {
        this.CONSUME(Except);
        this.OPTION(() => {
            this.SUBRULE(this.expr);
            this.OPTION2(() => {
                this.CONSUME(As);
                this.CONSUME(Ident);
            });
        });
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
    });
    // ─────────────── With Statement ───────────────
    // withStmt: 'with' withItem (',' withItem)* '{' stmtList '}'
    withStmt = this.RULE("withStmt", () => {
        this.CONSUME(With);
        this.SUBRULE(this.withItem);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.withItem);
        });
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
    });
    // withItem: expr ('as' IDENT)?
    withItem = this.RULE("withItem", () => {
        this.SUBRULE(this.expr);
        this.OPTION(() => {
            this.CONSUME(As);
            this.CONSUME(Ident);
        });
    });
    // ─────────────── Match Statement ───────────────
    // matchStmt: 'match' expr '{' caseClause* '}'
    matchStmt = this.RULE("matchStmt", () => {
        this.CONSUME(Match);
        this.SUBRULE(this.expr);
        this.CONSUME(LBrace);
        this.MANY(() => this.SUBRULE(this.caseClause));
        this.CONSUME(RBrace);
    });
    // caseClause: 'case' pattern ('if' expr)? '{' stmtList '}'
    caseClause = this.RULE("caseClause", () => {
        this.CONSUME(Case);
        this.SUBRULE(this.pattern);
        this.OPTION(() => {
            this.CONSUME(If);
            this.SUBRULE(this.expr);
        });
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
        this.OPTION2(() => this.CONSUME(Semi));
    });
    // pattern: patternAtom ('|' patternAtom)* ('as' IDENT)?
    pattern = this.RULE("pattern", () => {
        this.SUBRULE(this.patternAtom);
        this.MANY(() => {
            this.CONSUME(Pipe);
            this.SUBRULE2(this.patternAtom);
        });
        this.OPTION(() => {
            this.CONSUME(As);
            this.CONSUME(Ident);
        });
    });
    // patternAtom: '_' | literal | IDENT ('(' patternArgs? ')')? | '(' pattern (',' pattern)* ')' | '[' pattern (',' pattern)* ']' | '{' patternKV (',' patternKV)* '}'
    patternAtom = this.RULE("patternAtom", () => {
        this.OR([
            // Wildcard
            { GATE: () => this.LA(1).tokenType === Underscore,
                ALT: () => this.CONSUME(Underscore) },
            // '*' name (star pattern in sequences)
            { GATE: () => this.LA(1).tokenType === Star,
                ALT: () => {
                    this.CONSUME(Star);
                    this.OR2([
                        { ALT: () => this.CONSUME(Ident) },
                        { ALT: () => this.CONSUME2(Underscore) },
                    ]);
                }
            },
            // '**' name (double star pattern in mappings)
            { GATE: () => this.LA(1).tokenType === DoubleStar,
                ALT: () => {
                    this.CONSUME(DoubleStar);
                    this.CONSUME2(Ident);
                }
            },
            // Tuple / group pattern
            { GATE: () => this.LA(1).tokenType === LParen,
                ALT: () => {
                    this.CONSUME(LParen);
                    this.OPTION(() => {
                        this.SUBRULE(this.pattern);
                        this.MANY(() => {
                            this.CONSUME(Comma);
                            this.SUBRULE2(this.pattern);
                        });
                        this.OPTION2(() => this.CONSUME2(Comma));
                    });
                    this.CONSUME(RParen);
                }
            },
            // Sequence pattern
            { GATE: () => this.LA(1).tokenType === LBrack,
                ALT: () => {
                    this.CONSUME(LBrack);
                    this.OPTION3(() => {
                        this.SUBRULE3(this.pattern);
                        this.MANY2(() => {
                            this.CONSUME3(Comma);
                            this.SUBRULE4(this.pattern);
                        });
                        this.OPTION4(() => this.CONSUME4(Comma));
                    });
                    this.CONSUME(RBrack);
                }
            },
            // Mapping pattern
            { GATE: () => this.LA(1).tokenType === LBrace,
                ALT: () => {
                    this.CONSUME(LBrace);
                    this.OPTION5(() => {
                        this.SUBRULE(this.patternKV);
                        this.MANY3(() => {
                            this.CONSUME5(Comma);
                            this.SUBRULE2(this.patternKV);
                        });
                        this.OPTION6(() => this.CONSUME6(Comma));
                    });
                    this.CONSUME(RBrace);
                }
            },
            // None / True / False
            { ALT: () => this.CONSUME(PyNone) },
            { ALT: () => this.CONSUME(PyTrue) },
            { ALT: () => this.CONSUME(PyFalse) },
            // Ellipsis
            { ALT: () => this.CONSUME(Ellipsis) },
            // Negative number literals
            { GATE: () => this.LA(1).tokenType === Minus,
                ALT: () => {
                    this.CONSUME(Minus);
                    this.OR3([
                        { ALT: () => this.CONSUME(IntLit) },
                        { ALT: () => this.CONSUME(FloatLit) },
                    ]);
                }
            },
            // Number literals
            { ALT: () => this.CONSUME2(IntLit) },
            { ALT: () => this.CONSUME2(FloatLit) },
            // String literals
            { ALT: () => this.SUBRULE(this.stringLit) },
            // Ident with optional class pattern: Ident.Ident...( patternArgs )
            { ALT: () => {
                    this.CONSUME3(Ident);
                    this.MANY4(() => {
                        this.CONSUME(Dot);
                        this.CONSUME4(Ident);
                    });
                    this.OPTION7(() => {
                        this.CONSUME2(LParen);
                        this.OPTION8(() => this.SUBRULE(this.patternArgs));
                        this.CONSUME2(RParen);
                    });
                } },
        ]);
    });
    // patternArgs: patternArg (',' patternArg)*
    patternArgs = this.RULE("patternArgs", () => {
        this.SUBRULE(this.patternArg);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.patternArg);
        });
        this.OPTION(() => this.CONSUME2(Comma));
    });
    // patternArg: (IDENT '=')? pattern
    patternArg = this.RULE("patternArg", () => {
        // Check for keyword pattern: ident=pattern
        this.OPTION(() => {
            this.CONSUME(Ident);
            this.CONSUME(Assign);
        });
        this.SUBRULE(this.pattern);
    });
    // patternKV: (expr ':' pattern) | ('**' IDENT)
    patternKV = this.RULE("patternKV", () => {
        this.OR([
            { GATE: () => this.LA(1).tokenType === DoubleStar,
                ALT: () => {
                    this.CONSUME(DoubleStar);
                    this.CONSUME(Ident);
                }
            },
            { ALT: () => {
                    this.SUBRULE(this.expr);
                    this.CONSUME(Colon);
                    this.SUBRULE(this.pattern);
                } },
        ]);
    });
    // ─────────────── Raise Statement ───────────────
    // raiseStmt: 'raise' expr? ('from' expr)?
    raiseStmt = this.RULE("raiseStmt", () => {
        this.CONSUME(Raise);
        this.OPTION(() => {
            this.SUBRULE(this.expr);
            this.OPTION2(() => {
                this.CONSUME(From);
                this.SUBRULE2(this.expr);
            });
        });
    });
    // ─────────────── Assert Statement ───────────────
    // assertStmt: 'assert' expr (',' expr)?
    assertStmt = this.RULE("assertStmt", () => {
        this.CONSUME(Assert);
        this.SUBRULE(this.expr);
        this.OPTION(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.expr);
        });
    });
    // ─────────────── Del Statement ───────────────
    // delStmt: 'del' expr (',' expr)*
    delStmt = this.RULE("delStmt", () => {
        this.CONSUME(Del);
        this.SUBRULE(this.expr);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.expr);
        });
    });
    // ─────────────── Break / Continue / Pass ───────────────
    breakStmt = this.RULE("breakStmt", () => {
        this.CONSUME(Break);
    });
    continueStmt = this.RULE("continueStmt", () => {
        this.CONSUME(Continue);
    });
    passStmt = this.RULE("passStmt", () => {
        this.CONSUME(Pass);
    });
    // ─────────────── Yield Statement ───────────────
    // yieldStmt: 'yield' 'from' expr | 'yield' expr?
    yieldStmt = this.RULE("yieldStmt", () => {
        this.CONSUME(Yield);
        this.OR([
            { GATE: () => this.LA(1).tokenType === From,
                ALT: () => {
                    this.CONSUME(From);
                    this.SUBRULE(this.expr);
                }
            },
            { ALT: () => {
                    this.OPTION(() => this.SUBRULE2(this.expr));
                } },
        ]);
    });
    // ─────────────── Global / Nonlocal Statements ───────────────
    globalStmt = this.RULE("globalStmt", () => {
        this.CONSUME(Global);
        this.SUBRULE(this.identList);
    });
    nonlocalStmt = this.RULE("nonlocalStmt", () => {
        this.CONSUME(Nonlocal);
        this.SUBRULE(this.identList);
    });
    // ─────────────── Assignment or Expression Statement ───────────────
    // assignOrExprStmt: exprList (assignOp exprList)?
    // Handles both plain expressions and assignments.
    // Also handles augmented assignments: x += 1, etc.
    // Also handles walrus: (x := expr) via the expression grammar.
    assignOrExprStmt = this.RULE("assignOrExprStmt", () => {
        this.SUBRULE(this.targetExprList);
        this.OPTION(() => {
            this.OR([
                // Simple assignment: = rhs
                { ALT: () => {
                        this.CONSUME(Assign);
                        this.SUBRULE(this.assignRHS);
                    } },
                // Augmented assignment: +=, -=, *=, /=, //=, %=, **=, &=, |=, ^=, <<=, >>=
                { ALT: () => {
                        this.SUBRULE(this.augAssignOp);
                        this.SUBRULE2(this.expr);
                    } },
                // Type-annotated assignment: x: type (= expr)?
                { GATE: () => this.LA(1).tokenType === Colon,
                    ALT: () => {
                        this.CONSUME(Colon);
                        this.SUBRULE(this.typeExpr);
                        this.OPTION2(() => {
                            this.CONSUME2(Assign);
                            this.SUBRULE3(this.expr);
                        });
                    }
                },
            ]);
        });
    });
    // augAssignOp: one of the augmented assignment operators
    augAssignOp = this.RULE("augAssignOp", () => {
        this.OR([
            { ALT: () => this.CONSUME(PlusAssign) },
            { ALT: () => this.CONSUME(MinusAssign) },
            { ALT: () => this.CONSUME(MulAssign) },
            { ALT: () => this.CONSUME(DivAssign) },
            { ALT: () => this.CONSUME(FloorDivAssign) },
            { ALT: () => this.CONSUME(ModAssign) },
            { ALT: () => this.CONSUME(DoubleStarAssign) },
            { ALT: () => this.CONSUME(AmpAssign) },
            { ALT: () => this.CONSUME(PipeAssign) },
            { ALT: () => this.CONSUME(CaretAssign) },
            { ALT: () => this.CONSUME(ShlAssign) },
            { ALT: () => this.CONSUME(ShrAssign) },
        ]);
    });
    // assignRHS: yieldExpr | starExprList
    assignRHS = this.RULE("assignRHS", () => {
        this.OR([
            { GATE: () => this.LA(1).tokenType === Yield,
                ALT: () => this.SUBRULE(this.yieldExpr) },
            { ALT: () => this.SUBRULE(this.starExprList) },
        ]);
    });
    // starExprList: starExpr (',' starExpr)* ','?
    starExprList = this.RULE("starExprList", () => {
        this.SUBRULE(this.starExpr);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.starExpr);
        });
        this.OPTION(() => this.CONSUME2(Comma));
    });
    // starExpr: '*' expr | expr
    starExpr = this.RULE("starExpr", () => {
        this.OPTION(() => this.CONSUME(Star));
        this.SUBRULE(this.expr);
    });
    // targetExprList: expr (',' expr)*
    // targetExprList: starExpr (',' starExpr)* — allows *name on LHS of assignment
    targetExprList = this.RULE("targetExprList", () => {
        this.SUBRULE(this.starExpr);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.starExpr);
        });
    });
    // ─────────────── Argument List (for function calls) ───────────────
    // argList: arg (',' arg)* ','?
    argList = this.RULE("argList", () => {
        this.SUBRULE(this.arg);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.arg);
        });
        this.OPTION(() => this.CONSUME2(Comma));
    });
    // arg: '**' expr | '*' expr | (IDENT '=')? expr | comprehension
    arg = this.RULE("arg", () => {
        this.OR([
            // **kwargs
            { GATE: () => this.LA(1).tokenType === DoubleStar,
                ALT: () => {
                    this.CONSUME(DoubleStar);
                    this.SUBRULE(this.expr);
                }
            },
            // *args
            { GATE: () => this.LA(1).tokenType === Star,
                ALT: () => {
                    this.CONSUME(Star);
                    this.SUBRULE2(this.expr);
                }
            },
            // keyword=value or positional
            { ALT: () => {
                    this.SUBRULE3(this.expr);
                    // Check for keyword argument: ident=expr
                    // This is handled by backtracking: if expr is an ident and next is '=', it's keyword
                } },
        ]);
    });
    // ============= EXPRESSIONS =============
    // Python operator precedence (low to high):
    // lambda, ternary, or, and, not, comparison (in/not in/is/is not),
    // |, ^, &, <</>>, +/-, */@//%//, unary +/-/~, **, await, primary
    // expr: lambdaExpr | ternaryExpr
    expr = this.RULE("expr", () => {
        this.OR([
            // Lambda: |params|expr
            { GATE: () => this.isLambdaExpr(),
                ALT: () => this.SUBRULE(this.lambdaExpr) },
            // Walrus: name := expr (named expression)
            { GATE: () => this.isWalrusExpr(),
                ALT: () => {
                    this.CONSUME(Ident);
                    this.CONSUME(Walrus);
                    this.SUBRULE(this.expr);
                }
            },
            // Ternary / standard expression
            { ALT: () => this.SUBRULE(this.ternaryExpr) },
        ]);
    });
    // lambdaExpr: '|' paramList? '|' expr
    lambdaExpr = this.RULE("lambdaExpr", () => {
        this.CONSUME(Pipe);
        this.OPTION(() => this.SUBRULE(this.lambdaParamList));
        this.CONSUME2(Pipe);
        this.SUBRULE(this.expr);
    });
    // Simplified lambda param list (no type annotations)
    lambdaParamList = this.RULE("lambdaParamList", () => {
        this.SUBRULE(this.lambdaParam);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.lambdaParam);
        });
    });
    lambdaParam = this.RULE("lambdaParam", () => {
        this.OR([
            { GATE: () => this.LA(1).tokenType === DoubleStar,
                ALT: () => {
                    this.CONSUME(DoubleStar);
                    this.CONSUME(Ident);
                }
            },
            { GATE: () => this.LA(1).tokenType === Star,
                ALT: () => {
                    this.CONSUME(Star);
                    this.OPTION(() => this.CONSUME2(Ident));
                }
            },
            { ALT: () => {
                    this.CONSUME3(Ident);
                    this.OPTION2(() => {
                        this.CONSUME(Assign);
                        // Use xorBitExpr (not full expr) to avoid consuming '|' which
                        // would clash with the lambda closing delimiter
                        this.SUBRULE(this.xorBitExpr);
                    });
                } },
        ]);
    });
    // ternaryExpr: orExpr ('if' orExpr 'else' expr)?
    ternaryExpr = this.RULE("ternaryExpr", () => {
        this.SUBRULE(this.orExpr);
        this.OPTION(() => {
            this.CONSUME(If);
            this.SUBRULE2(this.orExpr);
            this.CONSUME(Else);
            this.SUBRULE(this.expr);
        });
    });
    // orExpr: andExpr ('or' andExpr)*
    orExpr = this.RULE("orExpr", () => {
        this.SUBRULE(this.andExpr);
        this.MANY(() => {
            this.CONSUME(Or);
            this.SUBRULE2(this.andExpr);
        });
    });
    // andExpr: notExpr ('and' notExpr)*
    andExpr = this.RULE("andExpr", () => {
        this.SUBRULE(this.notExpr);
        this.MANY(() => {
            this.CONSUME(And);
            this.SUBRULE2(this.notExpr);
        });
    });
    // notExpr: 'not' notExpr | compExpr
    notExpr = this.RULE("notExpr", () => {
        this.OR([
            { ALT: () => {
                    this.CONSUME(Not);
                    this.SUBRULE(this.notExpr);
                } },
            { ALT: () => this.SUBRULE(this.compExpr) },
        ]);
    });
    // compExpr: orBitExpr (compOp orBitExpr)*
    // compOp: '==' | '!=' | '<' | '>' | '<=' | '>=' | 'in' | 'not' 'in' | 'is' | 'is' 'not'
    compExpr = this.RULE("compExpr", () => {
        this.SUBRULE(this.orBitExpr);
        this.MANY(() => {
            this.SUBRULE(this.compOp);
            this.SUBRULE2(this.orBitExpr);
        });
    });
    compOp = this.RULE("compOp", () => {
        this.OR([
            { ALT: () => this.CONSUME(Eq) },
            { ALT: () => this.CONSUME(Neq) },
            { ALT: () => this.CONSUME(Leq) },
            { ALT: () => this.CONSUME(Geq) },
            { ALT: () => this.CONSUME(Lt) },
            { ALT: () => this.CONSUME(Gt) },
            // 'not' 'in'
            { GATE: () => this.LA(1).tokenType === Not && this.LA(2).tokenType === In,
                ALT: () => {
                    this.CONSUME(Not);
                    this.CONSUME(In);
                }
            },
            // 'in'
            { ALT: () => this.CONSUME2(In) },
            // 'is' 'not'
            { GATE: () => this.LA(1).tokenType === Is && this.LA(2).tokenType === Not,
                ALT: () => {
                    this.CONSUME(Is);
                    this.CONSUME2(Not);
                }
            },
            // 'is'
            { ALT: () => this.CONSUME2(Is) },
        ]);
    });
    // orBitExpr: xorBitExpr ('|' xorBitExpr)*
    // Note: '|' is also used for lambda — disambiguated by isLambdaExpr GATE.
    orBitExpr = this.RULE("orBitExpr", () => {
        this.SUBRULE(this.xorBitExpr);
        this.MANY(() => {
            this.CONSUME(Pipe);
            this.SUBRULE2(this.xorBitExpr);
        });
    });
    // xorBitExpr: andBitExpr ('^' andBitExpr)*
    // Note: '^' is also used for return — context prevents ambiguity (^ only starts a statement).
    xorBitExpr = this.RULE("xorBitExpr", () => {
        this.SUBRULE(this.andBitExpr);
        this.MANY(() => {
            this.CONSUME(Caret);
            this.SUBRULE2(this.andBitExpr);
        });
    });
    // andBitExpr: shiftExpr ('&' shiftExpr)*
    andBitExpr = this.RULE("andBitExpr", () => {
        this.SUBRULE(this.shiftExpr);
        this.MANY(() => {
            this.CONSUME(Amp);
            this.SUBRULE2(this.shiftExpr);
        });
    });
    // shiftExpr: addExpr (('<<' | '>>') addExpr)*
    shiftExpr = this.RULE("shiftExpr", () => {
        this.SUBRULE(this.addExpr);
        this.MANY(() => {
            this.OR([
                { ALT: () => this.CONSUME(Shl) },
                { ALT: () => this.CONSUME(Shr) },
            ]);
            this.SUBRULE2(this.addExpr);
        });
    });
    // addExpr: mulExpr (('+' | '-') mulExpr)*
    addExpr = this.RULE("addExpr", () => {
        this.SUBRULE(this.mulExpr);
        this.MANY(() => {
            this.OR([
                { ALT: () => this.CONSUME(Plus) },
                { ALT: () => this.CONSUME(Minus) },
            ]);
            this.SUBRULE2(this.mulExpr);
        });
    });
    // mulExpr: unaryExpr (('*' | '/' | '//' | '%' | '@') unaryExpr)*
    mulExpr = this.RULE("mulExpr", () => {
        this.SUBRULE(this.unaryExpr);
        this.MANY(() => {
            this.OR([
                { ALT: () => this.CONSUME(Star) },
                { ALT: () => this.CONSUME(Slash) },
                { ALT: () => this.CONSUME(FloorDiv) },
                { ALT: () => this.CONSUME(Percent) },
                { ALT: () => this.CONSUME(At) },
            ]);
            this.SUBRULE2(this.unaryExpr);
        });
    });
    // unaryExpr: ('+' | '-' | '~') unaryExpr | powerExpr
    unaryExpr = this.RULE("unaryExpr", () => {
        this.OR([
            { ALT: () => {
                    this.OR2([
                        { ALT: () => this.CONSUME(Plus) },
                        { ALT: () => this.CONSUME(Minus) },
                        { ALT: () => this.CONSUME(Tilde) },
                    ]);
                    this.SUBRULE(this.unaryExpr);
                } },
            { ALT: () => this.SUBRULE(this.powerExpr) },
        ]);
    });
    // powerExpr: awaitExpr ('**' unaryExpr)?
    powerExpr = this.RULE("powerExpr", () => {
        this.SUBRULE(this.awaitExpr);
        this.OPTION(() => {
            this.CONSUME(DoubleStar);
            this.SUBRULE(this.unaryExpr);
        });
    });
    // awaitExpr: 'await' primaryExpr | primaryExpr
    awaitExpr = this.RULE("awaitExpr", () => {
        this.OR([
            { ALT: () => {
                    this.CONSUME(Await);
                    this.SUBRULE(this.primaryExpr);
                } },
            { ALT: () => this.SUBRULE2(this.primaryExpr) },
        ]);
    });
    // primaryExpr: atom trailer*
    primaryExpr = this.RULE("primaryExpr", () => {
        this.SUBRULE(this.atom);
        this.MANY(() => this.SUBRULE(this.trailer));
    });
    // trailer: callArgs | subscript | dotAccess
    trailer = this.RULE("trailer", () => {
        this.OR([
            // Call: '(' argList? ')'
            { ALT: () => {
                    this.CONSUME(LParen);
                    this.OPTION(() => this.SUBRULE(this.callArgs));
                    this.CONSUME(RParen);
                } },
            // Subscript: '[' subscriptList ']'
            { ALT: () => {
                    this.CONSUME(LBrack);
                    this.SUBRULE(this.subscriptList);
                    this.CONSUME(RBrack);
                } },
            // Dot access: '.' attrName (attrName allows keywords like 'match')
            { ALT: () => {
                    this.CONSUME(Dot);
                    this.SUBRULE(this.attrName);
                } },
        ]);
    });
    // attrName: Ident or soft-keywords that can appear as attribute names after '.'
    attrName = this.RULE("attrName", () => {
        this.OR([
            { ALT: () => this.CONSUME(Ident) },
            { ALT: () => this.CONSUME(Match) },
            { ALT: () => this.CONSUME(Case) },
            { ALT: () => this.CONSUME(Slots) },
        ]);
    });
    // callArgs: callArg (',' callArg)* ','?
    // Handles positional, keyword, *args, **kwargs, and generator expressions
    callArgs = this.RULE("callArgs", () => {
        this.OR([
            // Generator expression inside call: expr compFor+
            { GATE: () => this.isGenExprInCall(),
                ALT: () => {
                    this.SUBRULE(this.expr);
                    this.AT_LEAST_ONE(() => this.SUBRULE(this.compFor));
                }
            },
            // Regular arguments
            { ALT: () => {
                    this.SUBRULE(this.callArg);
                    this.MANY(() => {
                        this.CONSUME(Comma);
                        this.SUBRULE2(this.callArg);
                    });
                    this.OPTION(() => this.CONSUME2(Comma));
                } },
        ]);
    });
    // callArg: '**' expr | '*' expr | IDENT '=' expr | expr
    callArg = this.RULE("callArg", () => {
        this.OR([
            // **kwargs
            { GATE: () => this.LA(1).tokenType === DoubleStar,
                ALT: () => {
                    this.CONSUME(DoubleStar);
                    this.SUBRULE(this.expr);
                }
            },
            // *args
            { GATE: () => this.LA(1).tokenType === Star,
                ALT: () => {
                    this.CONSUME(Star);
                    this.SUBRULE2(this.expr);
                }
            },
            // keyword=value (GATE: identLike followed by =)
            { GATE: () => this.isKeywordArg(),
                ALT: () => {
                    this.SUBRULE(this.keywordArgName);
                    this.CONSUME(Assign);
                    this.SUBRULE3(this.expr);
                }
            },
            // Positional argument
            { ALT: () => this.SUBRULE4(this.expr) },
        ]);
    });
    // keywordArgName: Ident or keyword tokens that can be used as keyword argument names
    keywordArgName = this.RULE("keywordArgName", () => {
        this.OR([
            { ALT: () => this.CONSUME(Ident) },
            { ALT: () => this.CONSUME(Slots) },
            { ALT: () => this.CONSUME(Match) },
            { ALT: () => this.CONSUME(Case) },
        ]);
    });
    // subscriptList: subscript (',' subscript)* ','?
    subscriptList = this.RULE("subscriptList", () => {
        this.SUBRULE(this.subscript);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.subscript);
        });
        this.OPTION(() => this.CONSUME2(Comma));
    });
    // subscript: expr? ':' expr? (':' expr?)? | expr
    subscript = this.RULE("subscript", () => {
        this.OR([
            // Slice: expr? ':' expr? (':' expr?)?
            { GATE: () => this.isSliceExpr(),
                ALT: () => {
                    this.OPTION(() => this.SUBRULE(this.expr));
                    this.CONSUME(Colon);
                    this.OPTION2(() => this.SUBRULE2(this.expr));
                    this.OPTION3(() => {
                        this.CONSUME2(Colon);
                        this.OPTION4(() => this.SUBRULE3(this.expr));
                    });
                }
            },
            // Plain index
            { ALT: () => this.SUBRULE4(this.expr) },
        ]);
    });
    // ─────────────── Atom ───────────────
    // atom: IDENT | NUMBER | STRING | FSTRING | True | False | None | '...'
    //     | parenExpr | listExpr | dictSetExpr | '.attr' (self attribute)
    atom = this.RULE("atom", () => {
        this.OR([
            // Parenthesized: tuple, generator, walrus, plain expr
            { GATE: () => this.LA(1).tokenType === LParen,
                ALT: () => this.SUBRULE(this.parenExpr) },
            // List literal / list comprehension
            { GATE: () => this.LA(1).tokenType === LBrack,
                ALT: () => this.SUBRULE(this.listExpr) },
            // Dict/set literal or comprehension
            { GATE: () => this.LA(1).tokenType === LBrace,
                ALT: () => this.SUBRULE(this.dictSetExpr) },
            // Self attribute access: .attr
            { GATE: () => this.LA(1).tokenType === Dot && this.LA(2).tokenType === Ident,
                ALT: () => {
                    this.CONSUME(Dot);
                    this.CONSUME(Ident);
                }
            },
            // Walrus operator in expressions: (name := expr) handled in parenExpr
            // Boolean / None literals
            { ALT: () => this.CONSUME(PyTrue) },
            { ALT: () => this.CONSUME(PyFalse) },
            { ALT: () => this.CONSUME(PyNone) },
            // Ellipsis
            { ALT: () => this.CONSUME(Ellipsis) },
            // String literals (all types)
            { ALT: () => this.SUBRULE(this.stringLit) },
            // Number literals (float before int for correct priority)
            { ALT: () => this.CONSUME(FloatLit) },
            { ALT: () => this.CONSUME(HexLit) },
            { ALT: () => this.CONSUME(OctLit) },
            { ALT: () => this.CONSUME(BinLit) },
            { ALT: () => this.CONSUME(IntLit) },
            // Identifier
            { ALT: () => this.CONSUME2(Ident) },
        ]);
    });
    // stringLit: aggregates all string token types
    stringLit = this.RULE("stringLit", () => {
        this.OR([
            { ALT: () => this.CONSUME(FStringTripleDouble) },
            { ALT: () => this.CONSUME(FStringTripleSingle) },
            { ALT: () => this.CONSUME(FStringDouble) },
            { ALT: () => this.CONSUME(FStringSingle) },
            { ALT: () => this.CONSUME(RFStringDouble) },
            { ALT: () => this.CONSUME(RFStringSingle) },
            { ALT: () => this.CONSUME(RawStringTripleDouble) },
            { ALT: () => this.CONSUME(RawStringTripleSingle) },
            { ALT: () => this.CONSUME(RawStringDouble) },
            { ALT: () => this.CONSUME(RawStringSingle) },
            { ALT: () => this.CONSUME(RBStringDouble) },
            { ALT: () => this.CONSUME(RBStringSingle) },
            { ALT: () => this.CONSUME(ByteStringDouble) },
            { ALT: () => this.CONSUME(ByteStringSingle) },
            { ALT: () => this.CONSUME(TripleDoubleString) },
            { ALT: () => this.CONSUME(TripleSingleString) },
            { ALT: () => this.CONSUME(DoubleString) },
            { ALT: () => this.CONSUME(SingleString) },
        ]);
    });
    // parenExpr: '(' ')'                          -- empty tuple
    //          | '(' expr compFor+ ')'             -- generator expr
    //          | '(' starExprList ')'              -- tuple or parenthesized expr
    parenExpr = this.RULE("parenExpr", () => {
        this.CONSUME(LParen);
        // Empty parens () or contents
        this.OR([
            // Non-empty: expr list with optional comprehension
            { GATE: () => this.LA(1).tokenType !== RParen,
                ALT: () => {
                    this.SUBRULE(this.starExprList);
                    this.OPTION(() => this.SUBRULE(this.compFor));
                }
            },
            // Empty tuple/parens: ()
            { ALT: () => { } },
        ]);
        this.CONSUME(RParen);
    });
    // listExpr: '[' ']' | '[' starExprList compFor? ']'
    listExpr = this.RULE("listExpr", () => {
        this.CONSUME(LBrack);
        this.OPTION(() => {
            this.SUBRULE(this.starExprList);
            // List comprehension
            this.OPTION2(() => this.SUBRULE(this.compFor));
        });
        this.CONSUME(RBrack);
    });
    // dictSetExpr: '{' '}' | '{' dictSetItems compFor? '}'
    // Handles dict literals, set literals, dict comprehensions, and set comprehensions.
    dictSetExpr = this.RULE("dictSetExpr", () => {
        this.CONSUME(LBrace);
        this.OR([
            // ** unpacking in dict: {**d1, **d2}
            { GATE: () => this.LA(1).tokenType === DoubleStar,
                ALT: () => {
                    this.SUBRULE(this.dictItems);
                }
            },
            // Dict/set with first expression
            { GATE: () => this.LA(1).tokenType !== RBrace,
                ALT: () => {
                    this.SUBRULE(this.expr);
                    this.OR2([
                        // Dict: first item has ':'
                        { GATE: () => this.LA(1).tokenType === Colon,
                            ALT: () => {
                                this.CONSUME(Colon);
                                this.SUBRULE2(this.expr);
                                this.OR3([
                                    // Dict comprehension
                                    { GATE: () => this.LA(1).tokenType === For,
                                        ALT: () => this.SUBRULE(this.compFor) },
                                    // Dict literal (remaining items) — last alternative can be empty
                                    { ALT: () => {
                                            this.MANY(() => {
                                                this.CONSUME(Comma);
                                                this.SUBRULE(this.dictItem);
                                            });
                                            this.OPTION(() => this.CONSUME2(Comma));
                                        } },
                                ]);
                            }
                        },
                        // Set comprehension
                        { GATE: () => this.LA(1).tokenType === For,
                            ALT: () => this.SUBRULE2(this.compFor) },
                        // Set literal (remaining items) — last alternative can be empty
                        { ALT: () => {
                                this.MANY2(() => {
                                    this.CONSUME3(Comma);
                                    this.SUBRULE3(this.starExpr);
                                });
                                this.OPTION2(() => this.CONSUME4(Comma));
                            } },
                    ]);
                }
            },
            // Empty dict/set: {} — must be last (empty alternative)
            { ALT: () => { } },
        ]);
        this.CONSUME(RBrace);
    });
    // dictItems: dictItem (',' dictItem)* ','?
    dictItems = this.RULE("dictItems", () => {
        this.SUBRULE(this.dictItem);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.dictItem);
        });
        this.OPTION(() => this.CONSUME2(Comma));
    });
    // dictItem: '**' expr | expr ':' expr
    dictItem = this.RULE("dictItem", () => {
        this.OR([
            { GATE: () => this.LA(1).tokenType === DoubleStar,
                ALT: () => {
                    this.CONSUME(DoubleStar);
                    this.SUBRULE(this.expr);
                }
            },
            { ALT: () => {
                    this.SUBRULE2(this.expr);
                    this.CONSUME(Colon);
                    this.SUBRULE3(this.expr);
                } },
        ]);
    });
    // ─────────────── Comprehensions ───────────────
    // compFor: 'for' targetList 'in' orExpr compIter*
    compFor = this.RULE("compFor", () => {
        this.OPTION(() => this.CONSUME(Async));
        this.CONSUME(For);
        this.SUBRULE(this.targetList);
        this.CONSUME(In);
        this.SUBRULE(this.orExpr);
        this.MANY(() => this.SUBRULE(this.compIter));
    });
    // compIter: compFor | compIf
    compIter = this.RULE("compIter", () => {
        this.OR([
            { GATE: () => this.LA(1).tokenType === For || (this.LA(1).tokenType === Async && this.LA(2).tokenType === For),
                ALT: () => this.SUBRULE(this.compFor) },
            { ALT: () => this.SUBRULE(this.compIf) },
        ]);
    });
    // compIf: 'if' orExpr
    compIf = this.RULE("compIf", () => {
        this.CONSUME(If);
        this.SUBRULE(this.orExpr);
    });
    // ─────────────── Yield Expressions ───────────────
    // yieldExpr: 'yield' 'from' expr | 'yield' exprList?
    yieldExpr = this.RULE("yieldExpr", () => {
        this.CONSUME(Yield);
        this.OR([
            { GATE: () => this.LA(1).tokenType === From,
                ALT: () => {
                    this.CONSUME(From);
                    this.SUBRULE(this.expr);
                }
            },
            { ALT: () => {
                    this.OPTION(() => this.SUBRULE2(this.expr));
                } },
        ]);
    });
    // ============= GATE / LOOKAHEAD HELPERS =============
    // Check if current position is a function definition: IDENT '(' ...
    isFuncDef() {
        const t1 = this.LA(1);
        const t2 = this.LA(2);
        return t1 !== undefined && t2 !== undefined &&
            t1.tokenType === Ident && t2.tokenType === LParen &&
            this.isFuncDefFull();
    }
    // More thorough check: find matching ')' then check for '{' or '->'
    isFuncDefFull() {
        let depth = 0;
        let i = 2; // start after Ident, at '('
        while (i < 200) {
            const t = this.LA(i);
            if (!t || t.tokenType === undefined)
                break;
            if (t.tokenType === LParen)
                depth++;
            if (t.tokenType === RParen) {
                depth--;
                if (depth === 0) {
                    // After closing ')', expect '{' or '->'
                    const next = this.LA(i + 1);
                    if (!next)
                        return false;
                    return next.tokenType === LBrace || next.tokenType === Arrow;
                }
            }
            i++;
        }
        return false;
    }
    // Check if '@main' pattern
    isMainBlock() {
        if (this.LA(1).tokenType !== At)
            return false;
        const t2 = this.LA(2);
        if (!t2 || t2.tokenType !== Ident)
            return false;
        if (t2.image !== "main")
            return false;
        const t3 = this.LA(3);
        return t3 !== undefined && t3.tokenType === LBrace;
    }
    // Check if @dc class shorthand: IDENT '{' (without `class` keyword, not a funcDef).
    // Only matches IDENT '{' pattern (class without bases). Classes with bases like
    // IDENT '(' ... ')' '{' are ambiguous with funcDef, so those are NOT matched here —
    // they still need the `class` keyword.
    isDcClassDecl() {
        const t1 = this.LA(1);
        if (!t1 || t1.tokenType !== Ident)
            return false;
        const t2 = this.LA(2);
        if (!t2)
            return false;
        // Only IDENT '{' — unambiguously a class (funcDef always has '(' after name)
        return t2.tokenType === LBrace;
    }
    // Check if 'slots' '(' pattern
    isSlotsDecl() {
        const t1 = this.LA(1);
        const t2 = this.LA(2);
        return t1 !== undefined && t2 !== undefined &&
            t1.tokenType === Slots && t2.tokenType === LParen;
    }
    // Check if this is a lambda: | ... | expr
    // Need to verify the second '|' exists at the right depth
    // Check if this is a walrus expression: IDENT ':=' expr
    isWalrusExpr() {
        const t1 = this.LA(1);
        const t2 = this.LA(2);
        return t1 !== undefined && t2 !== undefined &&
            t1.tokenType === Ident && t2.tokenType === Walrus;
    }
    isLambdaExpr() {
        if (this.LA(1).tokenType !== Pipe)
            return false;
        // Look for matching '|' — it should appear before any '{', '}', ';'
        let depth = 0;
        let i = 2;
        while (i < 50) {
            const t = this.LA(i);
            if (!t || t.tokenType === undefined)
                break;
            // Stop at statement-level tokens
            if (t.tokenType === LBrace || t.tokenType === RBrace || t.tokenType === Semi)
                return false;
            if (t.tokenType === LParen || t.tokenType === LBrack)
                depth++;
            if (t.tokenType === RParen || t.tokenType === RBrack)
                depth--;
            if (depth === 0 && t.tokenType === Pipe)
                return true;
            i++;
        }
        return false;
    }
    // Check if a subscript contains ':' (slice) at the current bracket depth
    isSliceExpr() {
        let depth = 0;
        let i = 1;
        while (i < 80) {
            const t = this.LA(i);
            if (!t || t.tokenType === undefined)
                break;
            if (t.tokenType === LBrack || t.tokenType === LParen || t.tokenType === LBrace)
                depth++;
            if (t.tokenType === RBrack) {
                if (depth === 0)
                    break;
                depth--;
            }
            if (t.tokenType === RParen || t.tokenType === RBrace)
                depth--;
            if (depth === 0 && t.tokenType === Colon)
                return true;
            i++;
        }
        return false;
    }
    // Check if IDENT '=' pattern (keyword argument)
    isKeywordArg() {
        const t1 = this.LA(1);
        const t2 = this.LA(2);
        return t1 !== undefined && t2 !== undefined &&
            this.isIdentLikeToken(t1) && t2.tokenType === Assign;
    }
    // Check if a token is identifier-like (Ident or keywords that can appear as keyword arg names)
    isIdentLikeToken(t) {
        const tt = t.tokenType;
        return tt === Ident || tt === Slots || tt === Match || tt === Case ||
            tt === PyTrue || tt === PyFalse || tt === PyNone;
    }
    // Check if this is a generator expression in a call: expr compFor
    // Needs to find 'for' at depth 0 before ')' and after an expr
    isGenExprInCall() {
        let depth = 0;
        let i = 1;
        while (i < 100) {
            const t = this.LA(i);
            if (!t || t.tokenType === undefined)
                break;
            if (t.tokenType === LParen || t.tokenType === LBrack || t.tokenType === LBrace)
                depth++;
            if (t.tokenType === RParen || t.tokenType === RBrack || t.tokenType === RBrace) {
                if (depth === 0)
                    break;
                depth--;
            }
            // 'for' at depth 0 indicates generator expression
            if (depth === 0 && t.tokenType === For)
                return true;
            // comma at depth 0 means it's a regular argument list
            if (depth === 0 && t.tokenType === Comma)
                return false;
            i++;
        }
        return false;
    }
    // Check if '(' starts a callable type annotation
    isCallableType() {
        if (this.LA(1).tokenType !== LParen)
            return false;
        let depth = 1;
        let i = 2;
        while (depth > 0 && i < 50) {
            const t = this.LA(i);
            if (!t || t.tokenType === undefined)
                break;
            if (t.tokenType === LParen)
                depth++;
            if (t.tokenType === RParen) {
                depth--;
                if (depth === 0) {
                    const next = this.LA(i + 1);
                    return next !== undefined && next.tokenType === Arrow;
                }
            }
            i++;
        }
        return false;
    }
}
// ============= PUBLIC API =============
// Lazy singleton parser instance (constructed on first use)
let parser = null;
function getParser() {
    if (!parser) {
        parser = new AETPythonParser();
    }
    return parser;
}
export function parsePython(code) {
    const lexResult = AETPythonLexer.tokenize(code);
    if (lexResult.errors.length > 0) {
        return { errors: lexResult.errors.map(e => e.message), cst: null };
    }
    const p = getParser();
    p.input = lexResult.tokens;
    const cst = p.program();
    if (p.errors.length > 0) {
        return { errors: p.errors.map(e => e.message), cst: null };
    }
    return { errors: [], cst };
}
