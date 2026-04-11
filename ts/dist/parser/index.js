// AET Parser: Chevrotain-based parser for Aieattoken syntax
// Produces a CST (Concrete Syntax Tree) which is then converted to IR
import { createToken, Lexer, CstParser, tokenMatcher } from "chevrotain";
// ============= TOKENS =============
// Version marker
export const VersionMarker = createToken({ name: "VersionMarker", pattern: /!(?:v[0-9]+|go-v[0-9]+)/ });
// Keywords (all single cl100k_base tokens)
export const If = createToken({ name: "If", pattern: /if/, longer_alt: undefined });
export const Else = createToken({ name: "Else", pattern: /else/ });
export const For = createToken({ name: "For", pattern: /for/ });
export const Range = createToken({ name: "Range", pattern: /range/ });
export const Switch = createToken({ name: "Switch", pattern: /switch/ });
export const Case = createToken({ name: "Case", pattern: /case/ });
export const Default = createToken({ name: "Default", pattern: /default/ });
export const Select = createToken({ name: "Select", pattern: /select/ });
export const Go = createToken({ name: "Go", pattern: /go/, longer_alt: undefined });
export const Defer = createToken({ name: "Defer", pattern: /defer/ });
export const Make = createToken({ name: "Make", pattern: /make/ });
export const Append = createToken({ name: "Append", pattern: /append/ });
export const Len = createToken({ name: "Len", pattern: /len/ });
export const Cap = createToken({ name: "Cap", pattern: /cap/ });
export const Delete = createToken({ name: "Delete", pattern: /delete/ });
export const Copy = createToken({ name: "Copy", pattern: /copy/ });
export const New = createToken({ name: "New", pattern: /new/ });
export const Map = createToken({ name: "Map", pattern: /map/ });
export const Chan = createToken({ name: "Chan", pattern: /chan/ });
export const Const = createToken({ name: "Const", pattern: /const/ });
export const Var = createToken({ name: "Var", pattern: /var/ });
export const True = createToken({ name: "True", pattern: /true/ });
export const False = createToken({ name: "False", pattern: /false/ });
export const Nil = createToken({ name: "Nil", pattern: /nil/ });
export const Struct = createToken({ name: "Struct", pattern: /struct/ });
export const Interface = createToken({ name: "Interface", pattern: /interface/ });
export const Break = createToken({ name: "Break", pattern: /break/ });
export const Continue = createToken({ name: "Continue", pattern: /continue/ });
export const Fallthrough = createToken({ name: "Fallthrough", pattern: /fallthrough/ });
export const Func = createToken({ name: "Func", pattern: /func/ });
export const Type = createToken({ name: "Type", pattern: /type/ });
// AET-specific
export const At = createToken({ name: "At", pattern: /@/ }); // struct/interface decl
export const Caret = createToken({ name: "Caret", pattern: /\^/ }); // early return
export const Question = createToken({ name: "Question", pattern: /\?/ }); // error propagation
export const QuestionBang = createToken({ name: "QuestionBang", pattern: /\?!/ });
// Pipe and BitOr share '|' — use single token, disambiguate in parser
export const Pipe = createToken({ name: "Pipe", pattern: /\|/ });
// Hash: # prefix for len() operator
export const Hash = createToken({ name: "Hash", pattern: /#/ });
// Pipe operations (treated as keywords when following |)
export const Filter = createToken({ name: "Filter", pattern: /filter/ });
// Operators
export const Arrow = createToken({ name: "Arrow", pattern: /->/ });
export const ChanArrow = createToken({ name: "ChanArrow", pattern: /<-/ });
export const ShortDecl = createToken({ name: "ShortDecl", pattern: /:=/ });
export const Assign = createToken({ name: "Assign", pattern: /=/, longer_alt: undefined });
export const PlusAssign = createToken({ name: "PlusAssign", pattern: /\+=/ });
export const MinusAssign = createToken({ name: "MinusAssign", pattern: /-=/ });
export const MulAssign = createToken({ name: "MulAssign", pattern: /\*=/ });
export const DivAssign = createToken({ name: "DivAssign", pattern: /\/=/ });
export const ModAssign = createToken({ name: "ModAssign", pattern: /%=/ });
export const AndAssign = createToken({ name: "AndAssign", pattern: /&=/ });
export const OrAssign = createToken({ name: "OrAssign", pattern: /\|=/ });
export const XorAssign = createToken({ name: "XorAssign", pattern: /\^=/ });
export const ShlAssign = createToken({ name: "ShlAssign", pattern: /<<=/ });
export const ShrAssign = createToken({ name: "ShrAssign", pattern: />>=/ });
export const LogAnd = createToken({ name: "LogAnd", pattern: /&&/ });
export const LogOr = createToken({ name: "LogOr", pattern: /\|\|/ });
export const Eq = createToken({ name: "Eq", pattern: /==/ });
export const Neq = createToken({ name: "Neq", pattern: /!=/ });
export const Leq = createToken({ name: "Leq", pattern: /<=/ });
export const Geq = createToken({ name: "Geq", pattern: />=/ });
export const Shl = createToken({ name: "Shl", pattern: /<</ });
export const Shr = createToken({ name: "Shr", pattern: />>/ });
export const Inc = createToken({ name: "Inc", pattern: /\+\+/ });
export const Dec = createToken({ name: "Dec", pattern: /--/ });
export const Ellipsis = createToken({ name: "Ellipsis", pattern: /\.\.\./ });
export const DotDot = createToken({ name: "DotDot", pattern: /\.\./ });
export const Plus = createToken({ name: "Plus", pattern: /\+/, longer_alt: undefined });
export const Minus = createToken({ name: "Minus", pattern: /-/, longer_alt: undefined });
export const Star = createToken({ name: "Star", pattern: /\*/, longer_alt: undefined });
export const Slash = createToken({ name: "Slash", pattern: /\//, longer_alt: undefined });
export const Percent = createToken({ name: "Percent", pattern: /%/, longer_alt: undefined });
export const Amp = createToken({ name: "Amp", pattern: /&/, longer_alt: undefined });
// BitOr reuses Pipe token — same char '|'
// BitXor reuses Caret token — same char '^'
export const Tilde = createToken({ name: "Tilde", pattern: /~/ });
export const Bang = createToken({ name: "Bang", pattern: /!/, longer_alt: undefined });
export const Lt = createToken({ name: "Lt", pattern: /</, longer_alt: undefined });
export const Gt = createToken({ name: "Gt", pattern: />/, longer_alt: undefined });
export const Dot = createToken({ name: "Dot", pattern: /\./, longer_alt: undefined });
// Delimiters
export const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const LBrack = createToken({ name: "LBrack", pattern: /\[/ });
export const RBrack = createToken({ name: "RBrack", pattern: /\]/ });
export const Semi = createToken({ name: "Semi", pattern: /;/ });
export const Colon = createToken({ name: "Colon", pattern: /:/, longer_alt: undefined });
export const Comma = createToken({ name: "Comma", pattern: /,/ });
// Literals
export const StringLit = createToken({ name: "StringLit", pattern: /"(?:[^"\\]|\\.)*"/ });
export const RawStringLit = createToken({ name: "RawStringLit", pattern: /`[^`]*`/ });
export const RuneLit = createToken({ name: "RuneLit", pattern: /'(?:[^'\\]|\\.)'/ });
export const FloatLit = createToken({ name: "FloatLit", pattern: /[0-9]+\.[0-9]+(?:[eE][+-]?[0-9]+)?/ });
export const HexLit = createToken({ name: "HexLit", pattern: /0[xX][0-9a-fA-F]+/ });
export const OctLit = createToken({ name: "OctLit", pattern: /0[oO][0-7]+/ });
export const BinLit = createToken({ name: "BinLit", pattern: /0[bB][01]+/ });
export const IntLit = createToken({ name: "IntLit", pattern: /[0-9]+/ });
// v1 backward-compatible abbreviated keywords
export const Mk = createToken({ name: "Mk", pattern: /mk/, longer_alt: undefined });
export const Apl = createToken({ name: "Apl", pattern: /apl/, longer_alt: undefined });
export const Ln = createToken({ name: "Ln", pattern: /ln/, longer_alt: undefined });
export const Rng = createToken({ name: "Rng", pattern: /rng/, longer_alt: undefined });
export const Mp = createToken({ name: "Mp", pattern: /mp/, longer_alt: undefined });
export const Flt = createToken({ name: "Flt", pattern: /flt/, longer_alt: undefined });
export const Ty = createToken({ name: "Ty", pattern: /ty/, longer_alt: undefined });
export const Fn = createToken({ name: "Fn", pattern: /fn/, longer_alt: undefined });
export const Nw = createToken({ name: "Nw", pattern: /nw/, longer_alt: undefined });
export const Cp = createToken({ name: "Cp", pattern: /cp/, longer_alt: undefined });
export const Dx = createToken({ name: "Dx", pattern: /dx/, longer_alt: undefined });
export const Cpy = createToken({ name: "Cpy", pattern: /cpy/, longer_alt: undefined });
export const Ft = createToken({ name: "Ft", pattern: /ft/, longer_alt: undefined });
// Numeric type keywords (f64, i64, etc.)
export const F64 = createToken({ name: "F64", pattern: /f64/, longer_alt: undefined });
export const I64 = createToken({ name: "I64", pattern: /i64/, longer_alt: undefined });
export const F32 = createToken({ name: "F32", pattern: /f32/, longer_alt: undefined });
export const I32 = createToken({ name: "I32", pattern: /i32/, longer_alt: undefined });
export const I16 = createToken({ name: "I16", pattern: /i16/, longer_alt: undefined });
export const I8 = createToken({ name: "I8", pattern: /i8/, longer_alt: undefined });
export const U64 = createToken({ name: "U64", pattern: /u64/, longer_alt: undefined });
// Identifier (must come AFTER all keywords)
export const Ident = createToken({ name: "Ident", pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });
// Whitespace (skipped)
export const WS = createToken({ name: "WS", pattern: /[\s\t\n\r]+/, group: Lexer.SKIPPED });
// Token order matters: longer_alt patterns and keywords before Ident
// QuestionBang before Question, Ellipsis before Dot, etc.
const allTokens = [
    WS,
    // Multi-char operators (longer first)
    VersionMarker, QuestionBang, Ellipsis, DotDot, Arrow, ChanArrow, ShortDecl,
    ShlAssign, ShrAssign, AndAssign, OrAssign, XorAssign,
    PlusAssign, MinusAssign, MulAssign, DivAssign, ModAssign,
    LogAnd, LogOr, Eq, Neq, Leq, Geq, Shl, Shr, Inc, Dec,
    // Literals (before operators that start with same chars)
    StringLit, RawStringLit, RuneLit, FloatLit, HexLit, OctLit, BinLit, IntLit,
    // Keywords (before Ident)
    If, Else, For, Range, Switch, Case, Default, Select,
    Go, Defer, Make, Append, Len, Cap, Delete, Copy, New,
    Map, Chan, Const, Var, True, False, Nil,
    Struct, Interface, Break, Continue, Fallthrough, Func, Type, Filter,
    // v1 abbreviated keywords (before Ident, longer patterns first)
    Cpy, Apl, Rng, Flt, Mk, Ln, Mp, Ty, Fn, Nw, Cp, Dx, Ft,
    // Numeric type keywords (before Ident)
    F64, I64, F32, I32, I16, U64, I8,
    // Identifier
    Ident,
    // Hash (before single-char operators)
    Hash,
    // Single-char operators and delimiters
    At, Question,
    Assign, Plus, Minus, Star, Slash, Percent,
    Amp, Pipe, Caret, Tilde, Bang,
    Lt, Gt, Dot,
    LBrace, RBrace, LParen, RParen, LBrack, RBrack,
    Semi, Colon, Comma,
];
export const AETLexer = new Lexer(allTokens);
// ============= PARSER =============
export class AETParser extends CstParser {
    constructor() {
        super(allTokens, { recoveryEnabled: false });
        this.performSelfAnalysis();
    }
    // Program: VersionMarker? (TopLevelDecl (Semi TopLevelDecl)*)?
    program = this.RULE("program", () => {
        this.OPTION(() => this.CONSUME(VersionMarker));
        this.OPTION2(() => {
            this.OPTION3(() => this.CONSUME(Semi));
            this.SUBRULE(this.topLevelDecl);
            this.MANY(() => {
                this.CONSUME2(Semi);
                this.SUBRULE2(this.topLevelDecl);
            });
        });
        this.OPTION4(() => this.CONSUME3(Semi));
    });
    // TopLevelDecl: structDecl | interfaceDecl | typeAlias | constDecl | varDecl | funcDecl
    topLevelDecl = this.RULE("topLevelDecl", () => {
        this.OR([
            { ALT: () => this.SUBRULE(this.structDecl) },
            { ALT: () => this.SUBRULE(this.constDecl) },
            { ALT: () => this.SUBRULE(this.varDecl) },
            { ALT: () => this.SUBRULE(this.funcOrMethodDecl) },
        ]);
    });
    // StructDecl: '@' Ident '{' fieldList '}'
    // InterfaceDecl: '@' Ident '[' methodList ']'
    // TypeAlias: '@' Ident '=' typeExpr
    structDecl = this.RULE("structDecl", () => {
        this.CONSUME(At);
        this.CONSUME(Ident);
        this.OR([
            { ALT: () => {
                    this.CONSUME(LBrace);
                    this.OPTION(() => this.SUBRULE(this.fieldList));
                    this.CONSUME(RBrace);
                } },
            { ALT: () => {
                    this.CONSUME(LBrack);
                    this.OPTION2(() => this.SUBRULE(this.methodSigList));
                    this.CONSUME(RBrack);
                } },
            { ALT: () => {
                    this.CONSUME(Assign);
                    this.SUBRULE(this.typeExpr);
                } },
        ]);
    });
    fieldList = this.RULE("fieldList", () => {
        this.SUBRULE(this.fieldDecl);
        this.MANY(() => {
            this.CONSUME(Semi);
            this.SUBRULE2(this.fieldDecl);
        });
    });
    fieldDecl = this.RULE("fieldDecl", () => {
        this.CONSUME(Ident);
        this.CONSUME(Colon);
        this.SUBRULE(this.typeExpr);
    });
    methodSigList = this.RULE("methodSigList", () => {
        this.SUBRULE(this.methodSig);
        this.MANY(() => {
            this.CONSUME(Semi);
            this.SUBRULE2(this.methodSig);
        });
    });
    methodSig = this.RULE("methodSig", () => {
        this.CONSUME(Ident);
        this.CONSUME(LParen);
        this.OPTION(() => this.SUBRULE(this.paramList));
        this.CONSUME(RParen);
        this.OPTION2(() => {
            this.CONSUME(Arrow);
            this.SUBRULE(this.returnType);
        });
    });
    // FuncDecl: Ident '.' Ident '(' paramList? ')' ('->' returnType)? '{' body '}'  (method)
    //         | Ident '(' paramList? ')' ('->' returnType)? '{' body '}'              (function)
    funcOrMethodDecl = this.RULE("funcOrMethodDecl", () => {
        this.CONSUME(Ident);
        this.OR([
            { ALT: () => {
                    // Method: TypeName.methodName(...)
                    this.CONSUME(Dot);
                    this.CONSUME2(Ident);
                    this.CONSUME(LParen);
                    this.OPTION(() => this.SUBRULE(this.paramList));
                    this.CONSUME(RParen);
                    this.OPTION2(() => {
                        this.CONSUME(Arrow);
                        this.SUBRULE(this.returnType);
                    });
                    this.CONSUME(LBrace);
                    this.SUBRULE(this.stmtList);
                    this.CONSUME(RBrace);
                } },
            { ALT: () => {
                    // Function: name(...)
                    this.CONSUME2(LParen);
                    this.OPTION3(() => this.SUBRULE2(this.paramList));
                    this.CONSUME2(RParen);
                    this.OPTION4(() => {
                        this.CONSUME2(Arrow);
                        this.SUBRULE2(this.returnType);
                    });
                    this.CONSUME2(LBrace);
                    this.SUBRULE2(this.stmtList);
                    this.CONSUME2(RBrace);
                } },
        ]);
    });
    paramList = this.RULE("paramList", () => {
        this.SUBRULE(this.param);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.param);
        });
    });
    param = this.RULE("param", () => {
        this.OPTION(() => this.CONSUME(Ellipsis)); // variadic
        this.CONSUME(Ident);
        this.OPTION2(() => {
            this.CONSUME(Colon);
            this.OPTION3(() => this.CONSUME2(Ellipsis));
            this.SUBRULE(this.typeExpr);
        });
    });
    returnType = this.RULE("returnType", () => {
        this.OR([
            { ALT: () => {
                    this.CONSUME(LParen);
                    this.SUBRULE(this.typeExpr);
                    this.MANY(() => {
                        this.CONSUME(Comma);
                        this.SUBRULE2(this.typeExpr);
                    });
                    this.CONSUME(RParen);
                } },
            { ALT: () => {
                    this.CONSUME(Bang);
                    this.OPTION(() => this.SUBRULE3(this.typeExpr)); // !T or bare !
                } },
            { ALT: () => this.SUBRULE4(this.typeExpr) },
        ]);
    });
    // Type expressions
    typeExpr = this.RULE("typeExpr", () => {
        this.OR([
            { ALT: () => {
                    this.CONSUME(Star);
                    this.SUBRULE(this.typeExpr);
                } },
            { ALT: () => {
                    this.CONSUME(LBrack);
                    // Fixed-size array: `[N]T`. Optional integer literal inside brackets.
                    // When absent, the rule matches slice syntax `[]T`. Uses OPTION4
                    // because OPTION, OPTION2, OPTION3 are already used elsewhere in
                    // this rule (Func paramList, Func return type, Ident.Ident).
                    this.OPTION4(() => this.CONSUME(IntLit));
                    this.CONSUME(RBrack);
                    this.SUBRULE2(this.typeExpr);
                } },
            { ALT: () => {
                    this.OR2([
                        { ALT: () => this.CONSUME(Map) },
                        { ALT: () => this.CONSUME(Mp) },
                    ]);
                    this.CONSUME2(LBrack);
                    this.SUBRULE3(this.typeExpr);
                    this.CONSUME2(RBrack);
                    this.SUBRULE4(this.typeExpr);
                } },
            { ALT: () => {
                    this.CONSUME(Chan);
                    this.SUBRULE5(this.typeExpr);
                } },
            { ALT: () => {
                    this.OR3([
                        { ALT: () => this.CONSUME(Func) },
                        { ALT: () => this.CONSUME(Fn) },
                    ]);
                    this.CONSUME(LParen);
                    this.OPTION(() => this.SUBRULE(this.paramList));
                    this.CONSUME(RParen);
                    this.OPTION2(() => {
                        this.SUBRULE6(this.typeExpr);
                    });
                } },
            // Numeric type keywords (f64, i64, etc.)
            { ALT: () => this.CONSUME(F64) },
            { ALT: () => this.CONSUME(I64) },
            { ALT: () => this.CONSUME(F32) },
            { ALT: () => this.CONSUME(I32) },
            { ALT: () => this.CONSUME(I16) },
            { ALT: () => this.CONSUME(I8) },
            { ALT: () => this.CONSUME(U64) },
            { ALT: () => {
                    this.CONSUME(Ident);
                    this.OPTION3(() => {
                        this.CONSUME(Dot);
                        this.CONSUME2(Ident);
                    });
                } },
        ]);
    });
    // Statements
    stmtList = this.RULE("stmtList", () => {
        this.MANY(() => {
            this.SUBRULE(this.stmt);
            this.OPTION(() => this.CONSUME(Semi));
        });
    });
    stmt = this.RULE("stmt", () => {
        this.OR([
            { ALT: () => this.SUBRULE(this.ifStmt) },
            { ALT: () => this.SUBRULE(this.forStmt) },
            { ALT: () => this.SUBRULE(this.switchStmt) },
            { ALT: () => this.SUBRULE(this.selectStmt) },
            { ALT: () => this.SUBRULE(this.returnStmt) },
            { ALT: () => this.SUBRULE(this.deferStmt) },
            { ALT: () => this.SUBRULE(this.goStmt) },
            { ALT: () => this.SUBRULE(this.branchStmt) },
            { ALT: () => this.SUBRULE(this.varDecl) },
            { ALT: () => this.SUBRULE(this.constDecl) },
            { ALT: () => this.SUBRULE(this.simpleStmt) },
        ]);
    });
    simpleStmt = this.RULE("simpleStmt", () => {
        this.SUBRULE(this.exprList);
        this.OPTION(() => {
            this.OR([
                { ALT: () => {
                        this.CONSUME(ShortDecl);
                        this.SUBRULE2(this.exprList);
                    } },
                { ALT: () => {
                        this.OR2([
                            { ALT: () => this.CONSUME(Assign) },
                            { ALT: () => this.CONSUME(PlusAssign) },
                            { ALT: () => this.CONSUME(MinusAssign) },
                            { ALT: () => this.CONSUME(MulAssign) },
                            { ALT: () => this.CONSUME(DivAssign) },
                            { ALT: () => this.CONSUME(ModAssign) },
                        ]);
                        this.SUBRULE3(this.exprList);
                    } },
                { ALT: () => this.CONSUME(Inc) },
                { ALT: () => this.CONSUME(Dec) },
                { ALT: () => {
                        this.CONSUME(ChanArrow);
                        this.SUBRULE4(this.expr);
                    } },
            ]);
        });
    });
    exprList = this.RULE("exprList", () => {
        this.SUBRULE(this.expr);
        this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.expr);
        });
    });
    // If statement
    // Note: condition expression must not consume the opening {
    ifStmt = this.RULE("ifStmt", () => {
        this.CONSUME(If);
        // Check for init; cond pattern (composite lit disabled in conditions)
        this.noCompositeLit = true;
        this.OR([
            { GATE: () => this.hasIfInit(), ALT: () => {
                    this.SUBRULE(this.simpleStmt);
                    this.CONSUME(Semi);
                    this.SUBRULE(this.expr);
                } },
            { ALT: () => {
                    this.SUBRULE2(this.expr);
                } },
        ]);
        this.noCompositeLit = false;
        this.CONSUME(LBrace);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
        this.OPTION2(() => {
            this.CONSUME(Else);
            this.OR2([
                { ALT: () => this.SUBRULE2(this.ifStmt) },
                { ALT: () => {
                        this.CONSUME2(LBrace);
                        this.SUBRULE2(this.stmtList);
                        this.CONSUME2(RBrace);
                    } },
            ]);
        });
    });
    hasIfInit() {
        // Check if there's a semicolon before the { that indicates init; cond pattern
        let depth = 0;
        let i = 1;
        while (i < 50) {
            const t = this.LA(i);
            if (!t)
                break;
            if (tokenMatcher(t, LParen) || tokenMatcher(t, LBrack))
                depth++;
            if (tokenMatcher(t, RParen) || tokenMatcher(t, RBrack))
                depth--;
            if (depth === 0 && tokenMatcher(t, LBrace))
                break;
            if (depth === 0 && tokenMatcher(t, Semi))
                return true;
            i++;
        }
        return false;
    }
    // For statement
    // Uses GATE to detect: range, 3-clause, condition-only, or infinite
    forStmt = this.RULE("forStmt", () => {
        this.CONSUME(For);
        this.noCompositeLit = true;
        this.OR([
            // for k, v := range expr { ... }
            { GATE: () => this.isRangeLoop(), ALT: () => {
                    this.SUBRULE(this.exprList);
                    this.CONSUME(ShortDecl);
                    this.OR2([
                        { ALT: () => this.CONSUME(Range) },
                        { ALT: () => this.CONSUME(Rng) },
                    ]);
                    this.SUBRULE(this.expr);
                    this.noCompositeLit = false;
                    this.CONSUME(LBrace);
                    this.SUBRULE(this.stmtList);
                    this.CONSUME(RBrace);
                } },
            // for i:=start..end { ... } (numeric range)
            { GATE: () => this.isDotDotFor(), ALT: () => {
                    this.CONSUME2(Ident); // loop var
                    this.CONSUME2(ShortDecl);
                    this.SUBRULE4(this.expr); // start
                    this.CONSUME(DotDot);
                    this.SUBRULE5(this.expr); // end
                    this.noCompositeLit = false;
                    this.CONSUME4(LBrace);
                    this.SUBRULE4(this.stmtList);
                    this.CONSUME4(RBrace);
                } },
            // for init; cond; post { ... } (3-clause)
            { GATE: () => this.isThreeClauseFor(), ALT: () => {
                    this.SUBRULE2(this.simpleStmt); // init
                    this.CONSUME2(Semi);
                    this.SUBRULE2(this.expr); // cond
                    this.CONSUME3(Semi);
                    this.SUBRULE3(this.simpleStmt); // post
                    this.noCompositeLit = false;
                    this.CONSUME2(LBrace);
                    this.SUBRULE2(this.stmtList);
                    this.CONSUME2(RBrace);
                } },
            // for cond { ... } or for { ... } (infinite)
            { ALT: () => {
                    this.OPTION(() => this.SUBRULE3(this.expr));
                    this.noCompositeLit = false;
                    this.CONSUME3(LBrace);
                    this.SUBRULE3(this.stmtList);
                    this.CONSUME3(RBrace);
                } },
        ]);
    });
    isDotDotFor() {
        let i = 1;
        while (i < 30) {
            const t = this.LA(i);
            if (!t)
                break;
            if (tokenMatcher(t, LBrace))
                break;
            if (tokenMatcher(t, DotDot))
                return true;
            i++;
        }
        return false;
    }
    isThreeClauseFor() {
        // Count semicolons before the opening brace
        let semiCount = 0;
        let depth = 0;
        let i = 1;
        while (i < 50) {
            const t = this.LA(i);
            if (!t)
                break;
            if (tokenMatcher(t, LParen) || tokenMatcher(t, LBrack))
                depth++;
            if (tokenMatcher(t, RParen) || tokenMatcher(t, RBrack))
                depth--;
            if (depth === 0 && tokenMatcher(t, LBrace))
                break;
            if (depth === 0 && tokenMatcher(t, Semi))
                semiCount++;
            i++;
        }
        return semiCount >= 2;
    }
    isRangeLoop() {
        // Look ahead to see if this is a range loop
        let i = 1;
        let t = this.LA(i);
        while (t && !tokenMatcher(t, LBrace) && !tokenMatcher(t, RBrace)) {
            if (tokenMatcher(t, Range) || tokenMatcher(t, Rng))
                return true;
            i++;
            t = this.LA(i);
            if (i > 20)
                break;
        }
        return false;
    }
    // Switch statement
    switchStmt = this.RULE("switchStmt", () => {
        this.CONSUME(Switch);
        this.noCompositeLit = true;
        this.OPTION(() => this.SUBRULE(this.expr));
        this.noCompositeLit = false;
        this.CONSUME(LBrace);
        this.MANY(() => this.SUBRULE(this.caseClause));
        this.CONSUME(RBrace);
    });
    caseClause = this.RULE("caseClause", () => {
        this.OR([
            { ALT: () => {
                    this.CONSUME(Case);
                    this.SUBRULE(this.exprList);
                    this.CONSUME(Colon);
                    this.SUBRULE(this.stmtList);
                } },
            { ALT: () => {
                    this.CONSUME(Default);
                    this.CONSUME2(Colon);
                    this.SUBRULE2(this.stmtList);
                } },
        ]);
    });
    // Select statement
    selectStmt = this.RULE("selectStmt", () => {
        this.CONSUME(Select);
        this.CONSUME(LBrace);
        this.MANY(() => this.SUBRULE(this.commClause));
        this.CONSUME(RBrace);
    });
    commClause = this.RULE("commClause", () => {
        this.OR([
            { ALT: () => {
                    this.CONSUME(Case);
                    this.SUBRULE(this.simpleStmt);
                    this.CONSUME(Colon);
                    this.SUBRULE(this.stmtList);
                } },
            { ALT: () => {
                    this.CONSUME(Default);
                    this.CONSUME2(Colon);
                    this.SUBRULE2(this.stmtList);
                } },
        ]);
    });
    // Return: '^' exprList?
    returnStmt = this.RULE("returnStmt", () => {
        this.CONSUME(Caret);
        this.OPTION(() => this.SUBRULE(this.exprList));
    });
    // Defer
    deferStmt = this.RULE("deferStmt", () => {
        this.CONSUME(Defer);
        this.OR([
            { GATE: () => this.LA(1).tokenType === LBrace, ALT: () => {
                    this.CONSUME(LBrace);
                    this.SUBRULE(this.stmtList);
                    this.CONSUME(RBrace);
                } },
            { ALT: () => this.SUBRULE(this.expr) },
        ]);
    });
    // Go statement
    goStmt = this.RULE("goStmt", () => {
        this.CONSUME(Go);
        this.OR([
            { GATE: () => this.LA(1).tokenType === LBrace, ALT: () => {
                    this.CONSUME(LBrace);
                    this.SUBRULE(this.stmtList);
                    this.CONSUME(RBrace);
                } },
            { ALT: () => this.SUBRULE(this.expr) },
        ]);
    });
    // Branch statements
    branchStmt = this.RULE("branchStmt", () => {
        this.OR([
            { ALT: () => this.CONSUME(Break) },
            { ALT: () => this.CONSUME(Continue) },
            { ALT: () => this.CONSUME(Fallthrough) },
            { ALT: () => this.CONSUME(Ft) },
        ]);
    });
    // Var declaration
    varDecl = this.RULE("varDecl", () => {
        this.CONSUME(Var);
        this.CONSUME(Ident);
        this.OPTION(() => this.SUBRULE(this.typeExpr));
        this.OPTION2(() => {
            this.CONSUME(Assign);
            this.SUBRULE(this.expr);
        });
    });
    // Const declaration
    constDecl = this.RULE("constDecl", () => {
        this.CONSUME(Const);
        this.OR([
            { ALT: () => {
                    this.CONSUME(LParen);
                    this.MANY(() => {
                        this.CONSUME(Ident);
                        this.OPTION(() => {
                            this.CONSUME(Assign);
                            this.SUBRULE(this.expr);
                        });
                        this.OPTION2(() => this.CONSUME(Semi));
                    });
                    this.CONSUME(RParen);
                } },
            { ALT: () => {
                    this.CONSUME2(Ident);
                    this.OPTION3(() => {
                        this.CONSUME2(Assign);
                        this.SUBRULE2(this.expr);
                    });
                } },
        ]);
    });
    // ============= EXPRESSIONS =============
    // Operator precedence (low to high):
    // || && == != < > <= >= + - | ^ * / % << >> & &^ unary
    expr = this.RULE("expr", () => {
        this.SUBRULE(this.orExpr);
    });
    orExpr = this.RULE("orExpr", () => {
        this.SUBRULE(this.andExpr);
        this.MANY(() => {
            this.CONSUME(LogOr);
            this.SUBRULE2(this.andExpr);
        });
    });
    andExpr = this.RULE("andExpr", () => {
        this.SUBRULE(this.compareExpr);
        this.MANY(() => {
            this.CONSUME(LogAnd);
            this.SUBRULE2(this.compareExpr);
        });
    });
    compareExpr = this.RULE("compareExpr", () => {
        this.SUBRULE(this.addExpr);
        this.OPTION(() => {
            this.OR([
                { ALT: () => this.CONSUME(Eq) },
                { ALT: () => this.CONSUME(Neq) },
                { ALT: () => this.CONSUME(Lt) },
                { ALT: () => this.CONSUME(Gt) },
                { ALT: () => this.CONSUME(Leq) },
                { ALT: () => this.CONSUME(Geq) },
            ]);
            this.SUBRULE2(this.addExpr);
        });
    });
    addExpr = this.RULE("addExpr", () => {
        this.SUBRULE(this.mulExpr);
        this.MANY(() => {
            this.OR([
                { ALT: () => this.CONSUME(Plus) },
                { ALT: () => this.CONSUME(Minus) },
                { ALT: () => this.CONSUME(Pipe) },
                { ALT: () => this.CONSUME(Caret) },
            ]);
            this.SUBRULE2(this.mulExpr);
        });
    });
    mulExpr = this.RULE("mulExpr", () => {
        this.SUBRULE(this.unaryExpr);
        this.MANY(() => {
            this.OR([
                { ALT: () => this.CONSUME(Star) },
                { ALT: () => this.CONSUME(Slash) },
                { ALT: () => this.CONSUME(Percent) },
                { ALT: () => this.CONSUME(Shl) },
                { ALT: () => this.CONSUME(Shr) },
                { ALT: () => this.CONSUME(Amp) },
            ]);
            this.SUBRULE2(this.unaryExpr);
        });
    });
    unaryExpr = this.RULE("unaryExpr", () => {
        this.OR([
            { ALT: () => {
                    this.OR2([
                        { ALT: () => this.CONSUME(Plus) },
                        { ALT: () => this.CONSUME(Minus) },
                        { ALT: () => this.CONSUME(Bang) },
                        { ALT: () => this.CONSUME(Star) },
                        { ALT: () => this.CONSUME(Amp) },
                        { ALT: () => this.CONSUME(ChanArrow) },
                        { ALT: () => this.CONSUME(Hash) },
                    ]);
                    this.SUBRULE(this.unaryExpr);
                } },
            { ALT: () => this.SUBRULE(this.postfixExpr) },
        ]);
    });
    postfixExpr = this.RULE("postfixExpr", () => {
        this.SUBRULE(this.primaryExpr);
        this.MANY(() => {
            this.OR([
                // Function call
                { ALT: () => {
                        this.CONSUME(LParen);
                        this.OPTION(() => {
                            this.SUBRULE(this.exprList);
                            this.OPTION2(() => this.CONSUME(Ellipsis));
                        });
                        this.CONSUME(RParen);
                    } },
                // Index / slice
                { ALT: () => {
                        this.CONSUME(LBrack);
                        this.OR2([
                            // Slice: [low:high] or [low:high:max]
                            { GATE: () => this.isSliceExpr(), ALT: () => {
                                    this.OPTION3(() => this.SUBRULE2(this.expr));
                                    this.CONSUME(Colon);
                                    this.OPTION4(() => this.SUBRULE3(this.expr));
                                    this.OPTION5(() => {
                                        this.CONSUME2(Colon);
                                        this.SUBRULE4(this.expr);
                                    });
                                } },
                            // Index: [expr]
                            { ALT: () => this.SUBRULE5(this.expr) },
                        ]);
                        this.CONSUME(RBrack);
                    } },
                // Selector: .ident
                { ALT: () => {
                        this.CONSUME(Dot);
                        this.OR3([
                            { ALT: () => this.CONSUME(Ident) },
                            // Type assertion: .(Type)
                            { ALT: () => {
                                    this.CONSUME2(LParen);
                                    this.SUBRULE(this.typeExpr);
                                    this.CONSUME2(RParen);
                                } },
                        ]);
                    } },
                // Error propagation: ?  or  ?!"msg"
                { ALT: () => {
                        this.OR4([
                            { ALT: () => {
                                    this.CONSUME(QuestionBang);
                                    this.CONSUME(StringLit);
                                } },
                            { ALT: () => this.CONSUME(Question) },
                        ]);
                    } },
                // Pipe: |op(fn)
                { ALT: () => {
                        this.CONSUME(Pipe);
                        this.OR5([
                            { ALT: () => this.CONSUME2(Map) },
                            { ALT: () => this.CONSUME(Filter) },
                        ]);
                        this.CONSUME3(LParen);
                        this.SUBRULE6(this.expr);
                        this.CONSUME3(RParen);
                    } },
            ]);
        });
    });
    isSliceExpr() {
        let depth = 1;
        let i = 1;
        while (depth > 0 && i < 50) {
            const t = this.LA(i);
            if (!t)
                break;
            if (tokenMatcher(t, LBrack))
                depth++;
            if (tokenMatcher(t, RBrack))
                depth--;
            if (depth === 1 && tokenMatcher(t, Colon))
                return true;
            i++;
        }
        return false;
    }
    primaryExpr = this.RULE("primaryExpr", () => {
        this.OR([
            // Parenthesized expr
            { ALT: () => {
                    this.CONSUME(LParen);
                    this.SUBRULE(this.expr);
                    this.CONSUME(RParen);
                } },
            // Lambda: { params | body }
            { GATE: () => this.isLambda(), ALT: () => {
                    this.CONSUME(LBrace);
                    this.SUBRULE(this.paramList);
                    this.CONSUME(Pipe);
                    this.SUBRULE(this.stmtList);
                    this.CONSUME(RBrace);
                } },
            // Composite literal with type: TypeName { ... }
            // Handled in postfixExpr via selector + call
            // Builtins (full and abbreviated forms)
            { ALT: () => {
                    this.OR2([
                        { ALT: () => this.CONSUME(Make) },
                        { ALT: () => this.CONSUME(Mk) },
                        { ALT: () => this.CONSUME(Append) },
                        { ALT: () => this.CONSUME(Apl) },
                        { ALT: () => this.CONSUME(Len) },
                        { ALT: () => this.CONSUME(Ln) },
                        { ALT: () => this.CONSUME(Cap) },
                        { ALT: () => this.CONSUME(Delete) },
                        { ALT: () => this.CONSUME(Dx) },
                        { ALT: () => this.CONSUME(Copy) },
                        { ALT: () => this.CONSUME(Cpy) },
                        { ALT: () => this.CONSUME(Cp) },
                        { ALT: () => this.CONSUME(New) },
                        { ALT: () => this.CONSUME(Nw) },
                    ]);
                } },
            // Func literal: func(params)(rets){body}
            { ALT: () => {
                    this.CONSUME(Func);
                    this.CONSUME2(LParen);
                    this.OPTION(() => this.SUBRULE2(this.paramList));
                    this.CONSUME2(RParen);
                    this.OPTION2(() => this.SUBRULE(this.returnType));
                    this.CONSUME2(LBrace);
                    this.SUBRULE2(this.stmtList);
                    this.CONSUME2(RBrace);
                } },
            // Literals
            { ALT: () => this.CONSUME(StringLit) },
            { ALT: () => this.CONSUME(RawStringLit) },
            { ALT: () => this.CONSUME(RuneLit) },
            { ALT: () => this.CONSUME(FloatLit) },
            { ALT: () => this.CONSUME(HexLit) },
            { ALT: () => this.CONSUME(OctLit) },
            { ALT: () => this.CONSUME(BinLit) },
            { ALT: () => this.CONSUME(IntLit) },
            { ALT: () => this.CONSUME(True) },
            { ALT: () => this.CONSUME(False) },
            { ALT: () => this.CONSUME(Nil) },
            // Map type literal: map[K]V or map[K]V{...}
            { ALT: () => {
                    this.CONSUME(Map);
                    this.CONSUME(LBrack);
                    this.SUBRULE(this.typeExpr);
                    this.CONSUME(RBrack);
                    this.SUBRULE2(this.typeExpr);
                    this.OPTION5(() => this.SUBRULE2(this.litBody));
                } },
            // Slice type literal: []T or []T{...}
            { ALT: () => {
                    this.CONSUME2(LBrack);
                    this.CONSUME2(RBrack);
                    this.SUBRULE3(this.typeExpr);
                    this.OPTION6(() => this.SUBRULE3(this.litBody));
                } },
            // Composite literal: Ident { kvpairs } — must come before plain Ident
            // Disabled inside for/if/switch conditions (same as Go: ambiguity resolved by context)
            { GATE: () => {
                    if (this.noCompositeLit)
                        return false;
                    const t1 = this.LA(1);
                    const t2 = this.LA(2);
                    return t1 && t2 && t1.tokenType === Ident && t2.tokenType === LBrace;
                }, ALT: () => this.SUBRULE(this.compositeLit) },
            // Identifier
            { ALT: () => this.CONSUME2(Ident) },
        ]);
    });
    // Key-value or plain expression: expr OR expr:expr OR {elts} (nested composite literal)
    kvExpr = this.RULE("kvExpr", () => {
        this.OR([
            // Nested composite literal without type: {expr, expr, ...}
            { GATE: () => {
                    const t = this.LA(1);
                    return t && tokenMatcher(t, LBrace);
                }, ALT: () => {
                    this.SUBRULE2(this.litBody);
                } },
            // Regular expression (with optional key:value)
            { ALT: () => {
                    this.SUBRULE(this.expr);
                    this.OPTION(() => {
                        this.CONSUME(Colon);
                        this.SUBRULE2(this.expr);
                    });
                } },
        ]);
    });
    // Shared literal body: { kvExpr, kvExpr, ... }
    litBody = this.RULE("litBody", () => {
        this.CONSUME(LBrace);
        this.OPTION2(() => {
            this.SUBRULE(this.kvExpr);
            this.MANY(() => {
                this.CONSUME(Comma);
                this.SUBRULE2(this.kvExpr);
            });
            this.OPTION3(() => this.CONSUME2(Comma));
        });
        this.CONSUME(RBrace);
    });
    compositeLit = this.RULE("compositeLit", () => {
        this.CONSUME(Ident); // Type name
        this.SUBRULE(this.litBody);
    });
    // Flag: when true, disable composite literal parsing (inside for/if/switch conditions)
    noCompositeLit = false;
    isLambda() {
        // Check if this is {params|body} pattern
        if (!tokenMatcher(this.LA(1), LBrace))
            return false;
        let depth = 1;
        let i = 2;
        while (depth > 0 && i < 30) {
            const t = this.LA(i);
            if (!t)
                break;
            if (tokenMatcher(t, LBrace))
                depth++;
            if (tokenMatcher(t, RBrace))
                depth--;
            if (depth === 1 && tokenMatcher(t, Pipe))
                return true;
            i++;
        }
        return false;
    }
}
// Singleton parser instance
const parser = new AETParser();
export function parse(code) {
    const lexResult = AETLexer.tokenize(code);
    if (lexResult.errors.length > 0) {
        return { errors: lexResult.errors.map(e => e.message), cst: null };
    }
    parser.input = lexResult.tokens;
    const cst = parser.program();
    if (parser.errors.length > 0) {
        return { errors: parser.errors.map(e => e.message), cst: null };
    }
    return { errors: [], cst };
}
