// AET-Java Parser: Chevrotain-based parser for AET-Java syntax (.aetj files)
// Produces a CST (Concrete Syntax Tree) which is then converted to IR
// Separate from the AET-Go parser — shares no tokens or grammar rules.

import { createToken, Lexer, CstParser, IToken, tokenMatcher } from "chevrotain";

// ============= TOKENS =============
// All keywords/operators verified as single cl100k_base tokens.

// Identifier: defined first so keywords can reference it via longer_alt.
// In the allTokens array, Ident appears AFTER keywords (keywords take priority).
export const Ident = createToken({ name: "Ident", pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });

// Version marker: !java-v1, !java-v2, etc.
export const JavaVersionMarker = createToken({
  name: "JavaVersionMarker",
  pattern: /!java-v[0-9]+/,
});

// --- Keywords ---
// All keywords use longer_alt: Ident so that e.g. "island" matches Ident, not "is" + "land".
export const If = createToken({ name: "If", pattern: /if/, longer_alt: Ident });
export const Else = createToken({ name: "Else", pattern: /else/, longer_alt: Ident });
export const For = createToken({ name: "For", pattern: /for/, longer_alt: Ident });
export const While = createToken({ name: "While", pattern: /while/, longer_alt: Ident });
export const Switch = createToken({ name: "Switch", pattern: /switch/, longer_alt: Ident });
export const Break = createToken({ name: "Break", pattern: /break/, longer_alt: Ident });
export const Continue = createToken({ name: "Continue", pattern: /continue/, longer_alt: Ident });
export const Var = createToken({ name: "Var", pattern: /var/, longer_alt: Ident });
export const True = createToken({ name: "True", pattern: /true/, longer_alt: Ident });
export const False = createToken({ name: "False", pattern: /false/, longer_alt: Ident });
export const Null = createToken({ name: "Null", pattern: /null/, longer_alt: Ident });
export const Throw = createToken({ name: "Throw", pattern: /throw/, longer_alt: Ident });
export const This = createToken({ name: "This", pattern: /this/, longer_alt: Ident });
export const Super = createToken({ name: "Super", pattern: /super/, longer_alt: Ident });
export const New = createToken({ name: "New", pattern: /new/, longer_alt: Ident });
export const Is = createToken({ name: "Is", pattern: /is/, longer_alt: Ident });
export const Default = createToken({ name: "Default", pattern: /default/, longer_alt: Ident });
export const Abs = createToken({ name: "Abs", pattern: /abs/, longer_alt: Ident });

// Try-catch / try-with-resources keywords
export const Tc = createToken({ name: "Tc", pattern: /tc/, longer_alt: Ident });
export const Tw = createToken({ name: "Tw", pattern: /tw/, longer_alt: Ident });

// Stream pipe operations
export const Mp = createToken({ name: "Mp", pattern: /mp/, longer_alt: Ident });
export const Flt = createToken({ name: "Flt", pattern: /flt/, longer_alt: Ident });
export const Fm = createToken({ name: "Fm", pattern: /fm/, longer_alt: Ident });
export const Red = createToken({ name: "Red", pattern: /red/, longer_alt: Ident });
export const Ord = createToken({ name: "Ord", pattern: /ord/, longer_alt: Ident });
export const Fe = createToken({ name: "Fe", pattern: /fe/, longer_alt: Ident });
export const Col = createToken({ name: "Col", pattern: /col/, longer_alt: Ident });

// Yield (used inside switch expression blocks)
export const Yield = createToken({ name: "Yield", pattern: /yield/, longer_alt: Ident });

// --- AET-specific symbols ---
export const At = createToken({ name: "At", pattern: /@/ });          // class/record/interface marker
export const Hash = createToken({ name: "Hash", pattern: /#/ });      // enum marker
export const Caret = createToken({ name: "Caret", pattern: /\^/ });   // return (early return)
export const Dollar = createToken({ name: "Dollar", pattern: /\$/ }); // static modifier

// Error propagation: ?! must come before ?
export const QuestionBang = createToken({ name: "QuestionBang", pattern: /\?!/ });
export const Question = createToken({ name: "Question", pattern: /\?/ });

// Pipe / bitwise OR share '|'
export const Pipe = createToken({ name: "Pipe", pattern: /\|/ });

// --- Operators (multi-char, longest first for tokenization) ---
export const Arrow = createToken({ name: "Arrow", pattern: /->/ });
export const MethodRef = createToken({ name: "MethodRef", pattern: /::/ });
export const ShortDecl = createToken({ name: "ShortDecl", pattern: /:=/ });
// Note: '>>' (Shr) and '>>>' (UnsignedShr) are NOT separate tokens.
// Instead, they are handled in the grammar by consuming consecutive '>' tokens.
// This solves the Java generics '>>' ambiguity (e.g., Map<String,List<Integer>>).
export const Shl = createToken({ name: "Shl", pattern: /<</ });
export const LogAnd = createToken({ name: "LogAnd", pattern: /&&/ });
export const LogOr = createToken({ name: "LogOr", pattern: /\|\|/ });
export const Eq = createToken({ name: "Eq", pattern: /==/ });
export const Neq = createToken({ name: "Neq", pattern: /!=/ });
export const Leq = createToken({ name: "Leq", pattern: /<=/ });
export const Geq = createToken({ name: "Geq", pattern: />=/ });
export const Inc = createToken({ name: "Inc", pattern: /\+\+/ });
export const Dec = createToken({ name: "Dec", pattern: /--/ });

// Assignment operators (compound)
export const PlusAssign = createToken({ name: "PlusAssign", pattern: /\+=/ });
export const MinusAssign = createToken({ name: "MinusAssign", pattern: /-=/ });
export const MulAssign = createToken({ name: "MulAssign", pattern: /\*=/ });
export const DivAssign = createToken({ name: "DivAssign", pattern: /\/=/ });
export const ModAssign = createToken({ name: "ModAssign", pattern: /%=/ });

// Simple assignment
export const Assign = createToken({ name: "Assign", pattern: /=/, longer_alt: undefined });

// Single-char operators
export const Plus = createToken({ name: "Plus", pattern: /\+/, longer_alt: undefined });
export const Minus = createToken({ name: "Minus", pattern: /-/, longer_alt: undefined });
export const Star = createToken({ name: "Star", pattern: /\*/, longer_alt: undefined });
export const Slash = createToken({ name: "Slash", pattern: /\//, longer_alt: undefined });
export const Percent = createToken({ name: "Percent", pattern: /%/, longer_alt: undefined });
export const Amp = createToken({ name: "Amp", pattern: /&/, longer_alt: undefined });
export const Tilde = createToken({ name: "Tilde", pattern: /~/ });
export const Bang = createToken({ name: "Bang", pattern: /!/, longer_alt: undefined });
export const Lt = createToken({ name: "Lt", pattern: /</, longer_alt: undefined });
export const Gt = createToken({ name: "Gt", pattern: />/, longer_alt: undefined });
export const Dot = createToken({ name: "Dot", pattern: /\./, longer_alt: undefined });

// --- Delimiters ---
export const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const LBrack = createToken({ name: "LBrack", pattern: /\[/ });
export const RBrack = createToken({ name: "RBrack", pattern: /\]/ });
export const Semi = createToken({ name: "Semi", pattern: /;/ });
export const Colon = createToken({ name: "Colon", pattern: /:/, longer_alt: undefined });
export const Comma = createToken({ name: "Comma", pattern: /,/ });

// --- Literals ---
export const StringLit = createToken({ name: "StringLit", pattern: /"(?:[^"\\]|\\.)*"/ });
export const CharLit = createToken({ name: "CharLit", pattern: /'(?:[^'\\]|\\.)'/ });
export const FloatLit = createToken({
  name: "FloatLit",
  pattern: /[0-9]+\.[0-9]+(?:[eE][+-]?[0-9]+)?[fFdD]?/,
});
export const HexLit = createToken({ name: "HexLit", pattern: /0[xX][0-9a-fA-F]+[lL]?/ });
export const LongLit = createToken({ name: "LongLit", pattern: /[0-9]+[lL]/ });
export const IntLit = createToken({ name: "IntLit", pattern: /[0-9]+/ });

// Underscore: standalone '_' for default case in switch.
// longer_alt ensures _abc matches Ident, standalone _ matches Underscore.
export const Underscore = createToken({ name: "Underscore", pattern: /_/, longer_alt: Ident });

// --- Whitespace (skipped) ---
export const WS = createToken({ name: "WS", pattern: /[\s\t\n\r]+/, group: Lexer.SKIPPED });

// ============= TOKEN ORDER =============
// Ordering is critical: longer patterns first, keywords before Ident.
const allTokens = [
  WS,
  // Version marker (longest prefix)
  JavaVersionMarker,
  // Multi-char operators (longest first)
  QuestionBang,
  Arrow, MethodRef, ShortDecl,
  PlusAssign, MinusAssign, MulAssign, DivAssign, ModAssign,
  LogAnd, LogOr, Eq, Neq, Leq, Geq, Shl, Inc, Dec,
  // Literals (before operators that start with same chars)
  StringLit, CharLit, FloatLit, HexLit, LongLit, IntLit,
  // Keywords (before Ident, longer keywords first to avoid prefix conflicts)
  Default, Continue, Switch, While, Throw, Super, Break, False, Yield,
  Else, This, True, Null,
  Abs, Col, Flt,
  For, New, Var, Red, Ord,
  Tc, Tw, Mp, Fm, Fe, Is, If,
  // Underscore (before Ident — longer_alt ensures _abc matches Ident)
  Underscore,
  // Identifier (catches everything else)
  Ident,
  // Single-char operators and delimiters
  At, Hash, Dollar,
  Assign, Plus, Minus, Star, Slash, Percent,
  Amp, Pipe, Caret, Tilde, Bang, Question,
  Lt, Gt, Dot,
  LBrace, RBrace, LParen, RParen, LBrack, RBrack,
  Semi, Colon, Comma,
];

export const AETJavaLexer = new Lexer(allTokens);

// ============= PARSER =============

export class AETJavaParser extends CstParser {
  constructor() {
    super(allTokens, { recoveryEnabled: false });
    this.performSelfAnalysis();
  }

  // Flag: when true, disable composite literal / ambiguous brace parsing
  // (inside for/if/while/switch conditions where { starts a block)
  private noCompositeLit = false;

  // ===== TOP LEVEL =====

  // program = JavaVersionMarker ';' topDecl*
  public program = this.RULE("program", () => {
    this.CONSUME(JavaVersionMarker);
    this.OPTION(() => this.CONSUME(Semi));
    this.MANY(() => {
      this.SUBRULE(this.topDecl);
      this.OPTION2(() => this.CONSUME2(Semi));
    });
  });

  // topDecl = classDecl | recordDecl | enumDecl | interfaceDecl | funcDecl | varDeclStmt
  // classDecl, recordDecl, interfaceDecl all start with optional modifiers then '@'
  // enumDecl starts with optional modifiers then '#'
  // funcDecl / varDeclStmt start with identifier or keyword
  private topDecl = this.RULE("topDecl", () => {
    this.OR([
      // @ => class, record, or interface
      { GATE: () => this.isAtDecl(), ALT: () => this.SUBRULE(this.atDecl) },
      // # => enum
      { GATE: () => this.isHashDecl(), ALT: () => this.SUBRULE(this.enumDecl) },
      // Everything else: function or var decl at top level
      { ALT: () => this.SUBRULE(this.topFuncOrVarDecl) },
    ]);
  });

  // Check if we are at a modifier sequence followed by '@'
  private isAtDecl(): boolean {
    let i = 1;
    while (i < 20) {
      const t = this.LA(i);
      if (!t || t.tokenType === undefined) return false;
      if (tokenMatcher(t, At)) return true;
      // Skip modifier tokens
      if (
        tokenMatcher(t, Plus) || tokenMatcher(t, Minus) ||
        tokenMatcher(t, Tilde) || tokenMatcher(t, Dollar) ||
        tokenMatcher(t, Bang) || tokenMatcher(t, Abs)
      ) {
        i++;
        continue;
      }
      return false;
    }
    return false;
  }

  // Check if we are at a modifier sequence followed by '#'
  private isHashDecl(): boolean {
    let i = 1;
    while (i < 20) {
      const t = this.LA(i);
      if (!t || t.tokenType === undefined) return false;
      if (tokenMatcher(t, Hash)) return true;
      if (
        tokenMatcher(t, Plus) || tokenMatcher(t, Minus) ||
        tokenMatcher(t, Tilde) || tokenMatcher(t, Dollar) ||
        tokenMatcher(t, Bang) || tokenMatcher(t, Abs)
      ) {
        i++;
        continue;
      }
      return false;
    }
    return false;
  }

  // ===== MODIFIERS =====
  // Modifiers: +, -, ~, $, !, abs
  // Consumed greedily before declarations.
  private modifiers = this.RULE("modifiers", () => {
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(Plus) },
        { ALT: () => this.CONSUME(Minus) },
        { ALT: () => this.CONSUME(Tilde) },
        { ALT: () => this.CONSUME(Dollar) },
        { ALT: () => this.CONSUME(Bang) },
        { ALT: () => this.CONSUME(Abs) },
      ]);
    });
  });

  // ===== @ DECLARATIONS (class / record / interface) =====
  // atDecl = modifiers '@' Ident typeParams? (classBody | recordDecl | interfaceDecl)
  private atDecl = this.RULE("atDecl", () => {
    this.SUBRULE(this.modifiers);
    this.CONSUME(At);
    this.CONSUME(Ident);
    this.OPTION(() => this.SUBRULE(this.typeParams));
    this.OR([
      // Record: '(' paramList ')' implements? recordBody?
      { ALT: () => this.SUBRULE(this.recordSuffix) },
      // Interface: '[' interfaceBody ']'
      { ALT: () => this.SUBRULE(this.interfaceSuffix) },
      // Class: inheritance? '{' classBody '}'
      { ALT: () => this.SUBRULE(this.classSuffix) },
    ]);
  });

  // typeParams = '<' typeParam (',' typeParam)* '>'
  private typeParams = this.RULE("typeParams", () => {
    this.CONSUME(Lt);
    this.SUBRULE(this.typeParam);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.typeParam);
    });
    this.CONSUME(Gt);
  });

  // typeParam = Ident (':' typeBound)?
  // ':' means 'extends' for type parameter bounds
  private typeParam = this.RULE("typeParam", () => {
    this.CONSUME(Ident);
    this.OPTION(() => {
      this.CONSUME(Colon);
      this.SUBRULE(this.typeBound);
    });
  });

  // typeBound = typeExpr ('&' typeExpr)*   (intersection types)
  private typeBound = this.RULE("typeBound", () => {
    this.SUBRULE(this.typeExpr);
    this.MANY(() => {
      this.CONSUME(Amp);
      this.SUBRULE2(this.typeExpr);
    });
  });

  // ===== CLASS =====
  // classSuffix = inheritance? '{' classBody '}'
  private classSuffix = this.RULE("classSuffix", () => {
    this.OPTION(() => this.SUBRULE(this.inheritance));
    this.CONSUME(LBrace);
    this.SUBRULE(this.classBody);
    this.CONSUME(RBrace);
  });

  // inheritance = (':' type)? ('[' type (',' type)* ']')?
  // ':' = extends, '[...]' = implements
  private inheritance = this.RULE("inheritance", () => {
    this.OR([
      { ALT: () => {
        this.CONSUME(Colon);
        this.SUBRULE(this.typeExpr);
        this.OPTION(() => {
          this.CONSUME(LBrack);
          this.SUBRULE2(this.typeExpr);
          this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE3(this.typeExpr);
          });
          this.CONSUME(RBrack);
        });
      }},
      { ALT: () => {
        this.CONSUME2(LBrack);
        this.SUBRULE4(this.typeExpr);
        this.MANY2(() => {
          this.CONSUME2(Comma);
          this.SUBRULE5(this.typeExpr);
        });
        this.CONSUME2(RBrack);
      }},
    ]);
  });

  // classBody = (fieldDecl | methodDecl | constructorDecl | atDecl | enumDecl)*
  // Each member separated by ';'
  private classBody = this.RULE("classBody", () => {
    this.MANY(() => {
      this.SUBRULE(this.classMember);
      this.OPTION(() => this.CONSUME(Semi));
    });
  });

  // classMember: dispatch based on lookahead
  //  - modifiers? '@' => nested class/record/interface
  //  - modifiers? '#' => nested enum
  //  - modifiers? '(' => constructor
  //  - modifiers? Ident '(' => method
  //  - modifiers? Type Ident => field
  private classMember = this.RULE("classMember", () => {
    this.OR([
      // Nested class/record/interface
      { GATE: () => this.isAtDecl(), ALT: () => this.SUBRULE(this.atDecl) },
      // Nested enum
      { GATE: () => this.isHashDecl(), ALT: () => this.SUBRULE(this.enumDecl) },
      // Constructor: modifiers? '(' ...
      { GATE: () => this.isConstructor(), ALT: () => this.SUBRULE(this.constructorDecl) },
      // Method: modifiers? Ident '(' ...
      { GATE: () => this.isMethod(), ALT: () => this.SUBRULE(this.methodDecl) },
      // Field: modifiers? Type Ident ...
      { ALT: () => this.SUBRULE(this.fieldDecl) },
    ]);
  });

  // Check if current position is a constructor: modifiers* '('
  private isConstructor(): boolean {
    let i = 1;
    while (i < 20) {
      const t = this.LA(i);
      if (!t || t.tokenType === undefined) return false;
      if (tokenMatcher(t, LParen)) return true;
      if (
        tokenMatcher(t, Plus) || tokenMatcher(t, Minus) ||
        tokenMatcher(t, Tilde) || tokenMatcher(t, Dollar) ||
        tokenMatcher(t, Bang) || tokenMatcher(t, Abs)
      ) {
        i++;
        continue;
      }
      return false;
    }
    return false;
  }

  // Check if current position is a method: modifiers* typeParams? Ident '('
  // Method names start with lowercase typically, but we check structurally:
  // after skipping modifiers, we need (optional '<'..'>') then Ident followed by '('
  private isMethod(): boolean {
    let i = 1;
    // Skip modifiers
    while (i < 20) {
      const t = this.LA(i);
      if (!t || t.tokenType === undefined) return false;
      if (
        tokenMatcher(t, Plus) || tokenMatcher(t, Minus) ||
        tokenMatcher(t, Tilde) || tokenMatcher(t, Dollar) ||
        tokenMatcher(t, Bang) || tokenMatcher(t, Abs)
      ) {
        i++;
        continue;
      }
      break;
    }
    // Check for optional type params: '<' ... '>'
    const tpStart = this.LA(i);
    if (tpStart && tokenMatcher(tpStart, Lt)) {
      // Skip past the type params block
      let depth = 1;
      i++;
      while (i < 40 && depth > 0) {
        const t = this.LA(i);
        if (!t || t.tokenType === undefined) return false;
        if (tokenMatcher(t, Lt)) depth++;
        if (tokenMatcher(t, Gt)) depth--;
        i++;
      }
      if (depth !== 0) return false;
    }
    // Now expect Ident '('
    const nameToken = this.LA(i);
    if (!nameToken || !tokenMatcher(nameToken, Ident)) return false;
    const parenToken = this.LA(i + 1);
    if (!parenToken) return false;
    return tokenMatcher(parenToken, LParen);
  }

  // constructorDecl = modifiers '(' paramList? ')' block
  private constructorDecl = this.RULE("constructorDecl", () => {
    this.SUBRULE(this.modifiers);
    this.CONSUME(LParen);
    this.OPTION(() => this.SUBRULE(this.paramList));
    this.CONSUME(RParen);
    this.SUBRULE(this.block);
  });

  // methodDecl = modifiers typeParams? Ident '(' paramList? ')' ('->' type)? block?
  // Block is optional for abstract methods (abs modifier).
  private methodDecl = this.RULE("methodDecl", () => {
    this.SUBRULE(this.modifiers);
    this.OPTION4(() => this.SUBRULE(this.typeParams));
    this.CONSUME(Ident);
    this.CONSUME(LParen);
    this.OPTION(() => this.SUBRULE(this.paramList));
    this.CONSUME(RParen);
    this.OPTION2(() => {
      this.CONSUME(Arrow);
      this.SUBRULE(this.typeExpr);
    });
    // Body is optional (abstract methods have no body)
    this.OPTION3(() => this.SUBRULE(this.block));
  });

  // fieldDecl = modifiers type Ident ('=' expr)?
  private fieldDecl = this.RULE("fieldDecl", () => {
    this.SUBRULE(this.modifiers);
    this.SUBRULE(this.typeExpr);
    this.CONSUME(Ident);
    this.OPTION(() => {
      this.CONSUME(Assign);
      this.SUBRULE(this.expr);
    });
  });

  // ===== RECORD =====
  // recordSuffix = '(' paramList? ')' ('[' type (',' type)* ']')? recordBody?
  private recordSuffix = this.RULE("recordSuffix", () => {
    this.CONSUME(LParen);
    this.OPTION(() => this.SUBRULE(this.paramList));
    this.CONSUME(RParen);
    // Optional implements
    this.OPTION2(() => {
      this.CONSUME(LBrack);
      this.SUBRULE(this.typeExpr);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.SUBRULE2(this.typeExpr);
      });
      this.CONSUME(RBrack);
    });
    // Optional body
    this.OPTION3(() => {
      this.CONSUME(LBrace);
      this.SUBRULE(this.classBody);
      this.CONSUME(RBrace);
    });
  });

  // ===== INTERFACE =====
  // interfaceSuffix = '[' interfaceBody ']'
  // interfaceBody starts with optional '+' for sealed permits, then method sigs
  private interfaceSuffix = this.RULE("interfaceSuffix", () => {
    this.CONSUME(LBrack);
    this.OPTION(() => this.SUBRULE(this.interfaceBody));
    this.CONSUME(RBrack);
  });

  // interfaceBody = sealedPermits? methodSigList?
  // sealedPermits = '+' Ident (',' Ident)* (';' methodSigList)?
  // methodSigList = methodSig (';' methodSig)*
  private interfaceBody = this.RULE("interfaceBody", () => {
    this.OR([
      // Sealed: starts with '+'
      { GATE: () => {
        const t = this.LA(1);
        return t !== undefined && tokenMatcher(t, Plus);
      }, ALT: () => {
        this.CONSUME(Plus);
        this.CONSUME(Ident);
        this.MANY(() => {
          this.CONSUME(Comma);
          this.CONSUME2(Ident);
        });
        // Optional method signatures after ';'
        this.OPTION(() => {
          this.CONSUME(Semi);
          this.SUBRULE(this.methodSigList);
        });
      }},
      // Regular interface: method signatures
      { ALT: () => this.SUBRULE2(this.methodSigList) },
    ]);
  });

  private methodSigList = this.RULE("methodSigList", () => {
    this.SUBRULE(this.methodSig);
    this.MANY(() => {
      this.CONSUME(Semi);
      this.SUBRULE2(this.methodSig);
    });
  });

  // methodSig = modifiers? Ident '(' paramList? ')' ('->' type)?
  private methodSig = this.RULE("methodSig", () => {
    this.SUBRULE(this.modifiers);
    this.CONSUME(Ident);
    this.CONSUME(LParen);
    this.OPTION(() => this.SUBRULE(this.paramList));
    this.CONSUME(RParen);
    this.OPTION2(() => {
      this.CONSUME(Arrow);
      this.SUBRULE(this.typeExpr);
    });
    // Interface default methods can have a body
    this.OPTION3(() => this.SUBRULE(this.block));
  });

  // ===== ENUM =====
  // enumDecl = modifiers '#' Ident '{' enumValues (';' classBody)? '}'
  private enumDecl = this.RULE("enumDecl", () => {
    this.SUBRULE(this.modifiers);
    this.CONSUME(Hash);
    this.CONSUME(Ident);
    this.CONSUME(LBrace);
    this.SUBRULE(this.enumValues);
    // Optional class body after ';'
    this.OPTION(() => {
      this.CONSUME(Semi);
      this.SUBRULE(this.classBody);
    });
    this.CONSUME(RBrace);
  });

  // enumValues = enumValue (',' enumValue)*
  private enumValues = this.RULE("enumValues", () => {
    this.SUBRULE(this.enumValue);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.enumValue);
    });
  });

  // enumValue = Ident ('(' exprList? ')')?
  private enumValue = this.RULE("enumValue", () => {
    this.CONSUME(Ident);
    this.OPTION(() => {
      this.CONSUME(LParen);
      this.OPTION2(() => this.SUBRULE(this.exprList));
      this.CONSUME(RParen);
    });
  });

  // ===== TOP-LEVEL FUNCTION OR VAR DECL =====
  // At the top level outside a class, we can have:
  //   funcDecl: Ident '(' paramList? ')' ('->' type)? block
  //   varDecl: 'var' Ident '=' expr
  //   constDecl: '!' Type Ident '=' expr (effectively static final at top level)
  private topFuncOrVarDecl = this.RULE("topFuncOrVarDecl", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.varDeclStmt) },
      { ALT: () => {
        // Function: modifiers? typeParams? Ident '(' ...
        this.SUBRULE(this.modifiers);
        this.OPTION3(() => this.SUBRULE(this.typeParams));
        this.CONSUME(Ident);
        this.CONSUME(LParen);
        this.OPTION(() => this.SUBRULE(this.paramList));
        this.CONSUME(RParen);
        this.OPTION2(() => {
          this.CONSUME(Arrow);
          this.SUBRULE(this.typeExpr);
        });
        this.SUBRULE(this.block);
      }},
    ]);
  });

  // ===== PARAMETER LIST =====
  // paramList = param (',' param)*
  // Parameters use Java order: Type name (type before name)
  // Type can be omitted when inferable
  private paramList = this.RULE("paramList", () => {
    this.SUBRULE(this.param);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.param);
    });
  });

  // param = typeExpr Ident | Ident (type-only or name-only when inferable)
  // We parse: typeExpr Ident? — if no second ident, the typeExpr was actually the name
  private param = this.RULE("param", () => {
    this.SUBRULE(this.typeExpr);
    this.OPTION(() => this.CONSUME(Ident));
  });

  // ===== TYPE EXPRESSIONS =====
  // typeExpr = baseType typeArgs? arraySuffix*
  // baseType = Ident ('.' Ident)*
  // typeArgs = '<' typeExpr (',' typeExpr)* '>'  | '<>'
  // arraySuffix = '[' ']'
  private typeExpr = this.RULE("typeExpr", () => {
    this.SUBRULE(this.baseType);
    this.OPTION(() => this.SUBRULE(this.typeArgs));
    // Array suffix: '[]' — only consume '[' if immediately followed by ']'
    this.MANY({
      GATE: () => {
        return tokenMatcher(this.LA(1), LBrack) && tokenMatcher(this.LA(2), RBrack);
      },
      DEF: () => {
        this.CONSUME(LBrack);
        this.CONSUME(RBrack);
      },
    });
  });

  // baseType = Ident ('.' Ident)*
  private baseType = this.RULE("baseType", () => {
    this.CONSUME(Ident);
    this.MANY(() => {
      // Must be careful: '.' Ident in type context
      // Only consume if followed by an identifier
      this.CONSUME(Dot);
      this.CONSUME2(Ident);
    });
  });

  // typeArgs = '<' (typeArgEntry (',' typeArgEntry)*)? '>'
  // Also handles diamond operator '<>'
  // Note: '>>' (Shr) and '>>>' (UnsignedShr) are handled as nested closing brackets.
  // When we expect '>' to close type args, we also accept '>>' and '>>>' if they
  // represent multiple closing brackets (the "Java generics >> problem").
  private typeArgs = this.RULE("typeArgs", () => {
    this.CONSUME(Lt);
    this.OPTION(() => {
      this.SUBRULE(this.typeArgEntry);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.SUBRULE2(this.typeArgEntry);
      });
    });
    this.CONSUME(Gt);
  });

  // typeArgEntry = '?' ('extends'|'super' type)? | type
  // We simplify: typeExpr can be preceded by '?' for wildcard bounds
  private typeArgEntry = this.RULE("typeArgEntry", () => {
    this.OR([
      { GATE: () => {
        const t = this.LA(1);
        return t !== undefined && tokenMatcher(t, Question);
      }, ALT: () => {
        this.CONSUME(Question);
        this.OPTION(() => {
          this.OR2([
            { ALT: () => this.CONSUME(Colon) },   // ? extends -> ? :
            { ALT: () => this.CONSUME(Super) },    // ? super
          ]);
          this.SUBRULE(this.typeExpr);
        });
      }},
      { ALT: () => this.SUBRULE2(this.typeExpr) },
    ]);
  });

  // ===== BLOCK & STATEMENTS =====

  // block = '{' stmtList '}'
  private block = this.RULE("block", () => {
    this.CONSUME(LBrace);
    this.SUBRULE(this.stmtList);
    this.CONSUME(RBrace);
  });

  // stmtList = (stmt (';' | EOF))*
  private stmtList = this.RULE("stmtList", () => {
    this.MANY(() => {
      this.SUBRULE(this.stmt);
      this.OPTION(() => this.CONSUME(Semi));
    });
  });

  // stmt dispatches to the various statement types.
  // Note: switchStmt is NOT listed here because 'switch' is also a valid
  // expression (switch expression). It is handled via simpleStmt -> expr ->
  // primaryExpr -> switchStmt. This avoids ambiguity.
  private stmt = this.RULE("stmt", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.ifStmt) },
      { ALT: () => this.SUBRULE(this.forStmt) },
      { ALT: () => this.SUBRULE(this.whileStmt) },
      { ALT: () => this.SUBRULE(this.tryCatchStmt) },
      { ALT: () => this.SUBRULE(this.tryWithStmt) },
      { ALT: () => this.SUBRULE(this.throwStmt) },
      { ALT: () => this.SUBRULE(this.returnStmt) },
      { ALT: () => this.SUBRULE(this.branchStmt) },
      { ALT: () => this.SUBRULE(this.varDeclStmt) },
      { ALT: () => this.SUBRULE(this.yieldStmt) },
      { ALT: () => this.SUBRULE(this.simpleStmt) },
    ]);
  });

  // ===== IF =====
  // ifStmt = 'if' expr block ('else' (ifStmt | block))?
  private ifStmt = this.RULE("ifStmt", () => {
    this.CONSUME(If);
    this.noCompositeLit = true;
    this.SUBRULE(this.expr);
    this.noCompositeLit = false;
    this.SUBRULE(this.block);
    this.OPTION(() => {
      this.CONSUME(Else);
      this.OR([
        { ALT: () => this.SUBRULE2(this.ifStmt) },
        { ALT: () => this.SUBRULE2(this.block) },
      ]);
    });
  });

  // ===== FOR =====
  // forStmt = 'for' '(' forClause ')' block
  // forClause = forInit ';' expr? ';' forPost    (traditional)
  //           | type? Ident ':' expr              (enhanced for-each)
  private forStmt = this.RULE("forStmt", () => {
    this.CONSUME(For);
    this.CONSUME(LParen);
    this.OR([
      // Enhanced for-each with type: (Type Ident ':' expr)
      { GATE: () => this.isForEach() && this.isForEachTyped(), ALT: () => {
        this.SUBRULE(this.typeExpr);
        this.CONSUME(Ident);
        this.CONSUME(Colon);
        this.SUBRULE(this.expr);
      }},
      // Enhanced for-each without type: (Ident ':' expr)
      { GATE: () => this.isForEach() && !this.isForEachTyped(), ALT: () => {
        this.CONSUME2(Ident);
        this.CONSUME2(Colon);
        this.SUBRULE2(this.expr);
      }},
      // Traditional for: (init ; cond ; post)
      { ALT: () => {
        this.OPTION2(() => this.SUBRULE(this.forInit));
        this.CONSUME(Semi);
        this.OPTION3(() => this.SUBRULE3(this.expr));
        this.CONSUME2(Semi);
        this.OPTION4(() => this.SUBRULE(this.forPost));
      }},
    ]);
    this.CONSUME(RParen);
    this.SUBRULE(this.block);
  });

  // Detect for-each: scan inside parens for ':' not preceded by ';'
  private isForEach(): boolean {
    let depth = 1; // already consumed '('
    let i = 1;
    while (i < 50 && depth > 0) {
      const t = this.LA(i);
      if (!t || t.tokenType === undefined) break;
      if (tokenMatcher(t, LParen)) depth++;
      if (tokenMatcher(t, RParen)) depth--;
      if (depth === 0) break;
      // If we see ':' before any ';' at depth 1, it's for-each
      if (depth === 1 && tokenMatcher(t, Colon)) return true;
      if (depth === 1 && tokenMatcher(t, Semi)) return false;
      i++;
    }
    return false;
  }

  // Check if for-each has a type before the variable name.
  // Typed:   for(Type name : ...) -> Ident Ident ':'  or  Ident<...> Ident ':'
  // Untyped: for(name : ...) -> Ident ':'
  private isForEachTyped(): boolean {
    const t1 = this.LA(1);
    if (!t1 || !tokenMatcher(t1, Ident)) return false;
    const t2 = this.LA(2);
    if (!t2) return false;
    // Ident ':' => untyped (name only)
    if (tokenMatcher(t2, Colon)) return false;
    // Ident Ident => typed (Type name)
    if (tokenMatcher(t2, Ident)) return true;
    // Ident '<' => generic type, typed
    if (tokenMatcher(t2, Lt)) return true;
    // Ident '[' ']' => array type, typed
    if (tokenMatcher(t2, LBrack)) return true;
    // Ident '.' => qualified type, typed
    if (tokenMatcher(t2, Dot)) return true;
    return false;
  }

  // forInit = varDeclStmt | simpleStmt
  private forInit = this.RULE("forInit", () => {
    this.OR([
      { GATE: () => {
        const t = this.LA(1);
        return t !== undefined && tokenMatcher(t, Var);
      }, ALT: () => this.SUBRULE(this.varDeclStmt) },
      { ALT: () => this.SUBRULE(this.simpleStmt) },
    ]);
  });

  // forPost = simpleStmt
  private forPost = this.RULE("forPost", () => {
    this.SUBRULE(this.simpleStmt);
  });

  // ===== WHILE =====
  // whileStmt = 'while' expr block
  private whileStmt = this.RULE("whileStmt", () => {
    this.CONSUME(While);
    this.noCompositeLit = true;
    this.SUBRULE(this.expr);
    this.noCompositeLit = false;
    this.SUBRULE(this.block);
  });

  // ===== SWITCH =====
  // switchStmt = 'switch' expr '{' switchCase (';' switchCase)* '}'
  private switchStmt = this.RULE("switchStmt", () => {
    this.CONSUME(Switch);
    this.noCompositeLit = true;
    this.SUBRULE(this.expr);
    this.noCompositeLit = false;
    this.CONSUME(LBrace);
    this.OPTION(() => {
      this.SUBRULE(this.switchCase);
      this.MANY(() => {
        this.CONSUME(Semi);
        this.SUBRULE2(this.switchCase);
      });
    });
    this.CONSUME(RBrace);
  });

  // switchCase = (exprList | '_' | 'default') '->' (expr | block)
  private switchCase = this.RULE("switchCase", () => {
    this.OR([
      { ALT: () => this.CONSUME(Underscore) },
      { ALT: () => this.CONSUME(Default) },
      { ALT: () => this.SUBRULE(this.exprList) },
    ]);
    this.CONSUME(Arrow);
    this.OR2([
      { GATE: () => {
        const t = this.LA(1);
        return t !== undefined && tokenMatcher(t, LBrace);
      }, ALT: () => this.SUBRULE(this.block) },
      { ALT: () => this.SUBRULE(this.expr) },
    ]);
  });

  // ===== TRY-CATCH =====
  // tryCatchStmt = 'tc' block ('(' type ('|' type)* Ident ')' block)+ ('!' block)?
  private tryCatchStmt = this.RULE("tryCatchStmt", () => {
    this.CONSUME(Tc);
    this.SUBRULE(this.block);
    this.AT_LEAST_ONE(() => this.SUBRULE(this.catchClause));
    // Optional finally: '!' block
    this.OPTION(() => {
      this.CONSUME(Bang);
      this.SUBRULE2(this.block);
    });
  });

  // catchClause = '(' type ('|' type)* Ident ')' block
  private catchClause = this.RULE("catchClause", () => {
    this.CONSUME(LParen);
    this.SUBRULE(this.typeExpr);
    this.MANY(() => {
      this.CONSUME(Pipe);
      this.SUBRULE2(this.typeExpr);
    });
    this.CONSUME(Ident);
    this.CONSUME(RParen);
    this.SUBRULE(this.block);
  });

  // ===== TRY-WITH-RESOURCES =====
  // tryWithStmt = 'tw' '(' varDeclStmt ')' block ('(' type Ident ')' block)*
  private tryWithStmt = this.RULE("tryWithStmt", () => {
    this.CONSUME(Tw);
    this.CONSUME(LParen);
    this.SUBRULE(this.twResource);
    this.MANY(() => {
      this.CONSUME(Semi);
      this.SUBRULE2(this.twResource);
    });
    this.CONSUME(RParen);
    this.SUBRULE(this.block);
    // Optional catch clauses
    this.MANY2(() => this.SUBRULE(this.catchClause));
    // Optional finally
    this.OPTION(() => {
      this.CONSUME(Bang);
      this.SUBRULE2(this.block);
    });
  });

  // twResource = 'var' Ident '=' expr | typeExpr Ident '=' expr
  private twResource = this.RULE("twResource", () => {
    this.OR([
      { GATE: () => {
        const t = this.LA(1);
        return t !== undefined && tokenMatcher(t, Var);
      }, ALT: () => {
        this.CONSUME(Var);
        this.CONSUME(Ident);
        this.CONSUME(Assign);
        this.SUBRULE(this.expr);
      }},
      { ALT: () => {
        this.SUBRULE(this.typeExpr);
        this.CONSUME2(Ident);
        this.CONSUME2(Assign);
        this.SUBRULE2(this.expr);
      }},
    ]);
  });

  // ===== THROW =====
  // throwStmt = 'throw' expr
  private throwStmt = this.RULE("throwStmt", () => {
    this.CONSUME(Throw);
    this.SUBRULE(this.expr);
  });

  // ===== RETURN =====
  // returnStmt = '^' expr?
  private returnStmt = this.RULE("returnStmt", () => {
    this.CONSUME(Caret);
    // Return value is optional. If next token is ';' or '}' there's no value.
    this.OPTION(() => {
      // Only consume expr if the next token is not a statement terminator
      this.SUBRULE(this.expr);
    });
  });

  // ===== YIELD =====
  // yieldStmt = 'yield' expr
  private yieldStmt = this.RULE("yieldStmt", () => {
    this.CONSUME(Yield);
    this.SUBRULE(this.expr);
  });

  // ===== BRANCH =====
  // branchStmt = 'break' | 'continue'
  private branchStmt = this.RULE("branchStmt", () => {
    this.OR([
      { ALT: () => this.CONSUME(Break) },
      { ALT: () => this.CONSUME(Continue) },
    ]);
  });

  // ===== VAR DECLARATION =====
  // varDeclStmt = 'var' Ident (':' typeExpr)? '=' expr
  // Also: Ident ':=' expr (short declaration)
  private varDeclStmt = this.RULE("varDeclStmt", () => {
    this.CONSUME(Var);
    this.CONSUME(Ident);
    this.OPTION(() => {
      this.CONSUME(Colon);
      this.SUBRULE(this.typeExpr);
    });
    this.CONSUME(Assign);
    this.SUBRULE(this.expr);
  });

  // ===== SIMPLE STATEMENT (expression or assignment) =====
  // simpleStmt = expr (assignOp expr | ':=' expr | '++' | '--')?
  // simpleStmt = assignExpr
  // assignExpr = expr (assignOp assignExpr | ':=' expr | '++' | '--')?
  // The assignExpr allows chained assignment: a = b = c
  private simpleStmt = this.RULE("simpleStmt", () => {
    this.SUBRULE(this.assignExpr);
  });

  // assignExpr = expr (assignOp assignExpr | ':=' expr | '++' | '--')?
  private assignExpr = this.RULE("assignExpr", () => {
    this.SUBRULE(this.expr);
    this.OPTION(() => {
      this.OR([
        { ALT: () => {
          this.CONSUME(ShortDecl);
          this.SUBRULE2(this.expr);
        }},
        { ALT: () => {
          this.OR2([
            { ALT: () => this.CONSUME(Assign) },
            { ALT: () => this.CONSUME(PlusAssign) },
            { ALT: () => this.CONSUME(MinusAssign) },
            { ALT: () => this.CONSUME(MulAssign) },
            { ALT: () => this.CONSUME(DivAssign) },
            { ALT: () => this.CONSUME(ModAssign) },
          ]);
          // Recursive: allows chained assignments like a = b = c
          this.SUBRULE(this.assignExpr);
        }},
        { ALT: () => this.CONSUME(Inc) },
        { ALT: () => this.CONSUME(Dec) },
      ]);
    });
  });

  // exprList = expr (',' expr)*
  private exprList = this.RULE("exprList", () => {
    this.SUBRULE(this.expr);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.expr);
    });
  });

  // ============= EXPRESSIONS =============
  // Operator precedence (low to high):
  //   ternary: expr '?' expr ':' expr
  //   logicalOr: '||'
  //   logicalAnd: '&&'
  //   comparison: '==' '!=' '<' '>' '<=' '>='
  //   additive: '+' '-' '|' '^'
  //   multiplicative: '*' '/' '%' '<<' '>>' '>>>' '&'
  //   unary: '+' '-' '!' '~' '(Type)' cast
  //   postfix: call '()' index '[]' selector '.' 'is' '?' '?!' '|' pipe '::'
  //   primary: literals, ident, '(expr)', lambda, 'new', switchExpr

  private expr = this.RULE("expr", () => {
    this.SUBRULE(this.ternaryExpr);
  });

  // ternaryExpr = orExpr ('?' expr ':' expr | '?' | '?!' StringLit)*
  // Handles ternary, error propagation, and error wrapping at this level
  // to avoid ambiguity between '?' (ternary) and '?' (error prop) in postfixExpr.
  private ternaryExpr = this.RULE("ternaryExpr", () => {
    this.SUBRULE(this.orExpr);
    this.MANY(() => {
      this.OR([
        // Error wrapping: ?! "msg"
        { ALT: () => {
          this.CONSUME(QuestionBang);
          this.CONSUME(StringLit);
        }},
        // Ternary: '?' expr ':' expr
        { GATE: () => this.isTernaryQuestion(), ALT: () => {
          this.CONSUME(Question);
          this.SUBRULE(this.expr);
          this.CONSUME(Colon);
          this.SUBRULE2(this.expr);
        }},
        // Error propagation: standalone '?'
        { ALT: () => {
          this.CONSUME2(Question);
        }},
      ]);
    });
  });

  // Detect if '?' is a ternary operator by scanning ahead for ':' at the same depth.
  private isTernaryQuestion(): boolean {
    const t1 = this.LA(1);
    if (!t1 || !tokenMatcher(t1, Question)) return false;

    // After '?', scan for ':' at depth 0.
    // If we find ':' before ';', '}' at depth 0, it's ternary.
    let depth = 0;
    let i = 2;
    while (i < 60) {
      const t = this.LA(i);
      if (!t || t.tokenType === undefined) return false;
      if (tokenMatcher(t, LParen) || tokenMatcher(t, LBrack) || tokenMatcher(t, LBrace)) depth++;
      if (tokenMatcher(t, RParen) || tokenMatcher(t, RBrack) || tokenMatcher(t, RBrace)) {
        depth--;
        if (depth < 0) return false; // Past our scope
      }
      if (depth === 0 && tokenMatcher(t, Colon)) return true;
      if (depth === 0 && tokenMatcher(t, Semi)) return false;
      i++;
    }
    return false;
  }

  // orExpr = andExpr ('||' andExpr)*
  private orExpr = this.RULE("orExpr", () => {
    this.SUBRULE(this.andExpr);
    this.MANY(() => {
      this.CONSUME(LogOr);
      this.SUBRULE2(this.andExpr);
    });
  });

  // andExpr = compareExpr ('&&' compareExpr)*
  private andExpr = this.RULE("andExpr", () => {
    this.SUBRULE(this.compareExpr);
    this.MANY(() => {
      this.CONSUME(LogAnd);
      this.SUBRULE2(this.compareExpr);
    });
  });

  // compareExpr = addExpr (compareOp addExpr)?
  private compareExpr = this.RULE("compareExpr", () => {
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

  // addExpr = mulExpr (('+' | '-' | '|' | '^') mulExpr)*
  private addExpr = this.RULE("addExpr", () => {
    this.SUBRULE(this.mulExpr);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(Plus) },
        { ALT: () => this.CONSUME(Minus) },
        // '|' as bitwise OR (not pipe op — pipe is postfix)
        // Only consume '|' here if next token is NOT a pipe operation keyword
        { GATE: () => {
          const next = this.LA(2);
          return next !== undefined &&
            !tokenMatcher(next, Mp) && !tokenMatcher(next, Flt) &&
            !tokenMatcher(next, Fm) && !tokenMatcher(next, Red) &&
            !tokenMatcher(next, Ord) && !tokenMatcher(next, Fe) &&
            !tokenMatcher(next, Col);
        }, ALT: () => this.CONSUME(Pipe) },
        { ALT: () => this.CONSUME(Caret) },
      ]);
      this.SUBRULE2(this.mulExpr);
    });
  });

  // mulExpr = unaryExpr (('*' | '/' | '%' | '<<' | '>>' | '>>>' | '&') unaryExpr)*
  // mulExpr = unaryExpr (('*' | '/' | '%' | '<<' | '>>' | '&') unaryExpr)*
  // Note: '>>' is handled as a SUBRULE (shiftRight) with two consecutive Gt tokens.
  private mulExpr = this.RULE("mulExpr", () => {
    this.SUBRULE(this.unaryExpr);
    this.MANY({
      GATE: () => this.isMulOp(),
      DEF: () => {
        this.OR([
          { ALT: () => this.CONSUME(Star) },
          { ALT: () => this.CONSUME(Slash) },
          { ALT: () => this.CONSUME(Percent) },
          { ALT: () => this.CONSUME(Shl) },
          // '>>' (Shr): two adjacent Gt tokens without whitespace
          { ALT: () => {
            this.CONSUME(Gt);
            this.CONSUME2(Gt);
          }},
          { ALT: () => this.CONSUME(Amp) },
        ]);
        this.SUBRULE2(this.unaryExpr);
      },
    });
  });

  // Check if current token starts a multiplicative operator.
  // Excludes lone '>' (which is comparison) — only matches '>>' (shift right).
  private isMulOp(): boolean {
    const t1 = this.LA(1);
    if (!t1) return false;
    if (tokenMatcher(t1, Star) || tokenMatcher(t1, Slash) ||
        tokenMatcher(t1, Percent) || tokenMatcher(t1, Shl) ||
        tokenMatcher(t1, Amp)) {
      return true;
    }
    // '>>' = two adjacent Gt tokens
    if (tokenMatcher(t1, Gt)) {
      const t2 = this.LA(2);
      if (!t2 || !tokenMatcher(t2, Gt)) return false;
      return t1.endOffset !== undefined && t2.startOffset !== undefined &&
             t2.startOffset === t1.endOffset + 1;
    }
    return false;
  }

  // unaryExpr = ('+' | '-' | '!' | '~') unaryExpr
  //           | '(' Type ')' unaryExpr   (cast)
  //           | postfixExpr
  private unaryExpr = this.RULE("unaryExpr", () => {
    this.OR([
      // Cast expression: (Type) expr
      { GATE: () => this.isCastExpr(), ALT: () => {
        this.CONSUME(LParen);
        this.SUBRULE(this.typeExpr);
        this.CONSUME(RParen);
        this.SUBRULE(this.unaryExpr);
      }},
      // Unary prefix operators
      { ALT: () => {
        this.OR2([
          { ALT: () => this.CONSUME(Plus) },
          { ALT: () => this.CONSUME(Minus) },
          { ALT: () => this.CONSUME(Bang) },
          { ALT: () => this.CONSUME(Tilde) },
        ]);
        this.SUBRULE2(this.unaryExpr);
      }},
      // Pre-increment / pre-decrement
      { ALT: () => {
        this.OR3([
          { ALT: () => this.CONSUME(Inc) },
          { ALT: () => this.CONSUME(Dec) },
        ]);
        this.SUBRULE3(this.unaryExpr);
      }},
      { ALT: () => this.SUBRULE(this.postfixExpr) },
    ]);
  });

  // Detect cast: '(' followed by a type name and then ')' with an expression after
  // Heuristic: '(' Ident ')' where Ident looks like a type (primitive or starts w/ uppercase)
  // We also match '(' Ident '.' Ident ')' for qualified types
  private isCastExpr(): boolean {
    if (!tokenMatcher(this.LA(1), LParen)) return false;

    // Scan inside parens to see if it's a simple type
    let i = 2;
    const t2 = this.LA(i);
    if (!t2 || !tokenMatcher(t2, Ident)) return false;

    // Check if it's a primitive type keyword
    const name = t2.image;
    const primitives = ["int", "long", "short", "byte", "char", "float", "double", "boolean"];
    const isPrimitive = primitives.includes(name);

    i++;
    // Allow dotted types: Ident.Ident
    while (true) {
      const td = this.LA(i);
      if (!td) return false;
      if (tokenMatcher(td, Dot)) {
        i++;
        const ti = this.LA(i);
        if (!ti || !tokenMatcher(ti, Ident)) return false;
        i++;
        continue;
      }
      break;
    }

    // Allow array suffix: []
    while (true) {
      const lb = this.LA(i);
      if (lb && tokenMatcher(lb, LBrack)) {
        i++;
        const rb = this.LA(i);
        if (!rb || !tokenMatcher(rb, RBrack)) return false;
        i++;
        continue;
      }
      break;
    }

    // Must end with ')'
    const closing = this.LA(i);
    if (!closing || !tokenMatcher(closing, RParen)) return false;

    // After ')' there should be an expression token (not an operator)
    const after = this.LA(i + 1);
    if (!after) return false;

    // Cast is valid if it's a primitive, or if the type starts with uppercase
    // And the token after ')' looks like it starts an expression
    if (isPrimitive) return true;

    // Check first char uppercase (class name convention)
    if (name.length > 0 && name[0] >= 'A' && name[0] <= 'Z') return true;

    return false;
  }

  // postfixExpr = primaryExpr (postfixOp)*
  // postfixOp = call | index | selector | instanceof | errorProp | pipe | methodRef | postIncDec
  private postfixExpr = this.RULE("postfixExpr", () => {
    this.SUBRULE(this.primaryExpr);
    this.MANY(() => {
      this.OR([
        // Function call: '(' exprList? ')'
        { ALT: () => {
          this.CONSUME(LParen);
          this.OPTION(() => this.SUBRULE(this.exprList));
          this.CONSUME(RParen);
        }},
        // Index: '[' expr ']'
        { ALT: () => {
          this.CONSUME(LBrack);
          this.SUBRULE(this.expr);
          this.CONSUME(RBrack);
        }},
        // Selector: '.' typeArgs? Ident
        // Optional typeArgs for type witnesses: e.g., Map.Entry.<String,Integer>comparingByValue()
        { ALT: () => {
          this.CONSUME(Dot);
          this.OPTION5(() => {
            if (this.isTypeArgs()) {
              this.SUBRULE2(this.typeArgs);
            }
          });
          this.CONSUME(Ident);
        }},
        // Method reference: '::' Ident
        { ALT: () => {
          this.CONSUME(MethodRef);
          this.OR2([
            { ALT: () => this.CONSUME2(Ident) },
            { ALT: () => this.CONSUME(New) },
          ]);
        }},
        // instanceof: 'is' Type Ident?
        { ALT: () => {
          this.CONSUME(Is);
          this.SUBRULE(this.typeExpr);
          // Optional pattern binding variable
          this.OPTION2(() => this.CONSUME3(Ident));
        }},
        // Note: '?' (error prop) and '?!' (error wrapping) are handled in
        // ternaryExpr to avoid ambiguity with ternary '?' operator.
        // Pipe operations: '|' pipeOp '(' exprList? ')'
        { GATE: () => this.isPipeOp(), ALT: () => {
          this.CONSUME(Pipe);
          this.OR4([
            { ALT: () => this.CONSUME(Mp) },
            { ALT: () => this.CONSUME(Flt) },
            { ALT: () => this.CONSUME(Fm) },
            { ALT: () => this.CONSUME(Red) },
            { ALT: () => this.CONSUME(Ord) },
            { ALT: () => this.CONSUME(Fe) },
            { ALT: () => this.CONSUME(Col) },
          ]);
          this.CONSUME2(LParen);
          this.OPTION3(() => this.SUBRULE2(this.exprList));
          this.CONSUME2(RParen);
        }},
        // Post-increment/decrement
        { ALT: () => this.CONSUME(Inc) },
        { ALT: () => this.CONSUME(Dec) },
      ]);
    });
  });

  // Check if '|' is followed by a pipe operation keyword
  private isPipeOp(): boolean {
    const t1 = this.LA(1);
    if (!t1 || !tokenMatcher(t1, Pipe)) return false;
    const t2 = this.LA(2);
    if (!t2) return false;
    return (
      tokenMatcher(t2, Mp) || tokenMatcher(t2, Flt) ||
      tokenMatcher(t2, Fm) || tokenMatcher(t2, Red) ||
      tokenMatcher(t2, Ord) || tokenMatcher(t2, Fe) ||
      tokenMatcher(t2, Col)
    );
  }

  // primaryExpr = literals | ident | '(' expr ')' | lambda | 'new' Type '(' args ')' |
  //               switchExpr | 'this' | 'super'
  private primaryExpr = this.RULE("primaryExpr", () => {
    this.OR([
      // Parenthesized expression: '(' expr ')'
      { ALT: () => {
        this.CONSUME(LParen);
        this.SUBRULE(this.expr);
        this.CONSUME(RParen);
      }},
      // Lambda: '{' params '|' body '}'
      { GATE: () => this.isLambda(), ALT: () => {
        this.CONSUME(LBrace);
        this.OPTION(() => this.SUBRULE(this.lambdaParams));
        this.CONSUME(Pipe);
        this.SUBRULE(this.stmtList);
        this.CONSUME(RBrace);
      }},
      // Array/collection initializer: '{' exprList? '}'
      { GATE: () => {
        const t = this.LA(1);
        return t !== undefined && tokenMatcher(t, LBrace) && !this.isLambda();
      }, ALT: () => {
        this.CONSUME2(LBrace);
        this.OPTION5(() => {
          this.SUBRULE3(this.expr);
          this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE4(this.expr);
          });
          this.OPTION6(() => this.CONSUME2(Comma)); // trailing comma
        });
        this.CONSUME2(RBrace);
      }},
      // Switch expression (switch as a value)
      { ALT: () => this.SUBRULE(this.switchStmt) },
      // Explicit 'new': 'new' Type '(' args ')' or 'new' Type '[' size ']' or 'new' Type[]{...}
      { ALT: () => {
        this.CONSUME(New);
        this.SUBRULE(this.typeExpr);
        this.OR6([
          // new Type(args) — constructor call
          { ALT: () => {
            this.CONSUME2(LParen);
            this.OPTION2(() => this.SUBRULE(this.exprList));
            this.CONSUME2(RParen);
          }},
          // new Type[size] or new Type[size1][size2] — array creation with size(s)
          // Also handles trailing empty brackets: new Type[size][]
          { ALT: () => {
            this.CONSUME2(LBrack);
            this.SUBRULE5(this.expr);
            this.CONSUME2(RBrack);
            // Additional dimension brackets: [size] or []
            this.MANY3({
              GATE: () => tokenMatcher(this.LA(1), LBrack),
              DEF: () => {
                this.CONSUME3(LBrack);
                this.OR7([
                  // [size] — another sized dimension
                  { GATE: () => !tokenMatcher(this.LA(1), RBrack),
                    ALT: () => {
                      this.SUBRULE8(this.expr);
                      this.CONSUME3(RBrack);
                    }},
                  // [] — trailing empty bracket
                  { ALT: () => {
                    this.CONSUME4(RBrack);
                  }},
                ]);
              },
            });
          }},
          // new Type[]{expr, expr, ...} — array creation with initializer
          // (the [] is already consumed by typeExpr, so we just see '{')
          { ALT: () => {
            this.CONSUME3(LBrace);
            this.OPTION7(() => {
              this.SUBRULE6(this.expr);
              this.MANY2(() => {
                this.CONSUME3(Comma);
                this.SUBRULE7(this.expr);
              });
              this.OPTION8(() => this.CONSUME4(Comma)); // trailing comma
            });
            this.CONSUME3(RBrace);
          }},
        ]);
      }},
      // 'this'
      { ALT: () => this.CONSUME(This) },
      // 'super'
      { ALT: () => this.CONSUME(Super) },
      // Boolean / null literals
      { ALT: () => this.CONSUME(True) },
      { ALT: () => this.CONSUME(False) },
      { ALT: () => this.CONSUME(Null) },
      // Numeric literals
      { ALT: () => this.CONSUME(FloatLit) },
      { ALT: () => this.CONSUME(HexLit) },
      { ALT: () => this.CONSUME(LongLit) },
      { ALT: () => this.CONSUME(IntLit) },
      // String / char literals
      { ALT: () => this.CONSUME(StringLit) },
      { ALT: () => this.CONSUME(CharLit) },
      // Identifier (plain or with type args for generic constructor calls without 'new')
      { ALT: () => {
        this.CONSUME(Ident);
        // Optional type arguments for generic expressions: Ident '<' ... '>'
        // Only consume '<' if it looks like type args (not comparison)
        this.OPTION3(() => {
          // GATE: Check if this looks like type arguments, not comparison
          if (this.isTypeArgs()) {
            this.SUBRULE(this.typeArgs);
          }
        });
      }},
    ]);
  });

  // Detect if '<' after ident is type args (e.g., ArrayList<String>()) vs comparison
  // Heuristic: scan for matching '>' ensuring valid type content
  private isTypeArgs(): boolean {
    const t1 = this.LA(1);
    if (!t1 || !tokenMatcher(t1, Lt)) return false;

    let depth = 1;
    let i = 2;
    while (depth > 0 && i < 30) {
      const t = this.LA(i);
      if (!t || t.tokenType === undefined) return false;
      if (tokenMatcher(t, Lt)) depth++;
      if (tokenMatcher(t, Gt)) {
        depth--;
        if (depth === 0) {
          // After '>', check what follows: '(' means constructor/method call (type args)
          // ')' or ',' means we're in a type position (type args)
          // Anything else: not type args
          const after = this.LA(i + 1);
          if (!after) return true; // end of input, treat as type args
          return (
            tokenMatcher(after, LParen) ||
            tokenMatcher(after, RParen) ||
            tokenMatcher(after, Comma) ||
            tokenMatcher(after, LBrack) ||
            tokenMatcher(after, RBrack) ||
            tokenMatcher(after, Ident) ||
            tokenMatcher(after, Semi) ||
            tokenMatcher(after, LBrace) ||
            tokenMatcher(after, Dot)
          );
        }
      }
      // Invalid type content - bail
      // These tokens cannot appear inside type arguments
      if (
        tokenMatcher(t, Semi) || tokenMatcher(t, LBrace) ||
        tokenMatcher(t, RBrace) || tokenMatcher(t, Assign) ||
        tokenMatcher(t, LogAnd) || tokenMatcher(t, LogOr) ||
        tokenMatcher(t, Eq) || tokenMatcher(t, Neq) ||
        tokenMatcher(t, Leq) || tokenMatcher(t, Geq) ||
        tokenMatcher(t, Plus) || tokenMatcher(t, Minus) ||
        tokenMatcher(t, Star) || tokenMatcher(t, Slash) ||
        tokenMatcher(t, Percent) || tokenMatcher(t, Bang) ||
        tokenMatcher(t, IntLit) || tokenMatcher(t, FloatLit) ||
        tokenMatcher(t, StringLit) || tokenMatcher(t, CharLit)
      ) {
        return false;
      }
      i++;
    }
    return false;
  }

  // Lambda params: Ident (',' Ident)* — simple untyped params before '|'
  // Also supports typed params: Type Ident (',' Type Ident)*
  // We reuse paramList for typed, but for untyped we just parse comma-separated idents
  private lambdaParams = this.RULE("lambdaParams", () => {
    this.SUBRULE(this.lambdaParam);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.lambdaParam);
    });
  });

  // lambdaParam = typeExpr Ident? — same as regular param
  private lambdaParam = this.RULE("lambdaParam", () => {
    this.SUBRULE(this.typeExpr);
    this.OPTION(() => this.CONSUME(Ident));
  });

  // Check if '{' starts a lambda: scan for '|' at depth 1
  private isLambda(): boolean {
    if (!tokenMatcher(this.LA(1), LBrace)) return false;
    let depth = 1;
    let i = 2;
    while (depth > 0 && i < 40) {
      const t = this.LA(i);
      if (!t || t.tokenType === undefined) break;
      if (tokenMatcher(t, LBrace)) depth++;
      if (tokenMatcher(t, RBrace)) depth--;
      if (depth === 1 && tokenMatcher(t, Pipe)) return true;
      // If we hit a semicolon at depth 1 before pipe, it's a block not a lambda
      if (depth === 1 && tokenMatcher(t, Semi)) return false;
      i++;
    }
    return false;
  }
}

// ============= SINGLETON & PARSE FUNCTION =============

const parser = new AETJavaParser();

export function parseJava(code: string) {
  const lexResult = AETJavaLexer.tokenize(code);
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
