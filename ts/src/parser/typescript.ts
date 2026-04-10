// Parser: AET-TypeScript source → IR
// Hand-rolled recursive descent parser that directly builds Ts_* IR nodes.
// Input: .aets / .aetx source text (with !ts-v1 / !tsx-v1 header)
// Output: IRProgram with Ts_* declarations

import * as IR from "../ir.js";

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokKind =
  | "ident" | "num" | "str" | "tmpl"
  | "regex" | "punct" | "eof"
  | "jsxText";

interface Tok {
  kind: TokKind;
  value: string;
  start: number;
  end: number;
  line: number;
}

// Ordered longest-first so longer operators match before shorter prefixes.
const PUNCT_MULTI = [
  ">>>=",
  "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=",
  "...", "..=", "?.", "??", "=>", "->", "<=", ">=", "==", "!=",
  "<<", ">>", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
  "&&", "||", "++", "--", "**", ":=", "..",
];

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue",
  "return", "throw", "try", "catch", "finally", "new", "this", "super", "null",
  "true", "false", "undefined", "async", "await", "yield", "void", "typeof",
  "in", "of", "is", "as", "let", "var", "const", "static", "readonly", "abstract",
  "public", "private", "protected", "override", "extends", "implements", "declare",
  "namespace", "module", "enum", "class", "interface", "type", "function",
  "ko", "sat", "ac", "dc", "ns", "ab", "get", "set", "infer", "keyof", "unique",
]);

// cl100k single-letter keywords in type positions: s, n, b, v, u, A, uk, nv, bi, sy
const TYPE_ALIASES: Record<string, string> = {
  s: "string", n: "number", b: "boolean", v: "void", u: "undefined",
  A: "any", uk: "unknown", nv: "never", bi: "bigint", sy: "symbol",
};

const UTILITY_REVERSE: Record<string, string> = {
  RA: "ReadonlyArray", NN: "NonNullable", Ro: "Readonly", Om: "Omit",
  Aw: "Awaited", WM: "WeakMap", WS: "WeakSet",
  FC: "FC", RN: "ReactNode", JE: "JSX.Element",
};

class Lexer {
  private src: string;
  private pos: number = 0;
  private line: number = 1;
  // Stack of context flags: when "in JSX element content" we tokenize text differently.
  private jsxStack: ("child" | "tag")[] = [];
  private lastTok: Tok | null = null;
  private isJsx: boolean;

  constructor(src: string, isJsx: boolean = false) {
    this.src = src;
    this.isJsx = isJsx;
  }

  tokenize(): Tok[] {
    const toks: Tok[] = [];
    while (this.pos < this.src.length) {
      this.skipWsAndComments();
      if (this.pos >= this.src.length) break;
      const tok = this.next();
      if (tok) {
        toks.push(tok);
        this.lastTok = tok;
      }
    }
    toks.push({ kind: "eof", value: "", start: this.pos, end: this.pos, line: this.line });
    return toks;
  }

  private canStartRegex(): boolean {
    // A `/` starts a regex when preceded by: nothing, an operator, (, [, ,, ;, :, =, !, or certain keywords.
    if (!this.lastTok) return true;
    const t = this.lastTok;
    if (t.kind === "punct") {
      if (t.value === ")" || t.value === "]" || t.value === "++" || t.value === "--") return false;
      // JSX mode: never treat `/` as regex after `<`, `>`, or `}` (all JSX-related boundaries).
      if (this.isJsx && (t.value === "<" || t.value === ">" || t.value === "}")) return false;
      return true;
    }
    if (t.kind === "ident") {
      return t.value === "return" || t.value === "typeof" || t.value === "void" ||
             t.value === "delete" || t.value === "in" || t.value === "of" ||
             t.value === "instanceof" || t.value === "new" || t.value === "throw" ||
             t.value === "yield" || t.value === "w" || t.value === "await";
    }
    return false;
  }

  private skipWsAndComments(): void {
    while (this.pos < this.src.length) {
      const c = this.src.charCodeAt(this.pos);
      if (c === 32 || c === 9 || c === 13) { this.pos++; continue; }
      if (c === 10) { this.pos++; this.line++; continue; }
      // comments (shouldn't appear in AET, but tolerate)
      if (c === 47) {
        const next = this.src.charCodeAt(this.pos + 1);
        if (next === 47) {
          while (this.pos < this.src.length && this.src.charCodeAt(this.pos) !== 10) this.pos++;
          continue;
        }
        if (next === 42) {
          this.pos += 2;
          while (this.pos < this.src.length) {
            if (this.src.charCodeAt(this.pos) === 42 && this.src.charCodeAt(this.pos + 1) === 47) {
              this.pos += 2;
              break;
            }
            if (this.src.charCodeAt(this.pos) === 10) this.line++;
            this.pos++;
          }
          continue;
        }
      }
      break;
    }
  }

  private next(): Tok | null {
    const start = this.pos;
    const line = this.line;
    const c = this.src[this.pos];
    const cc = c.charCodeAt(0);

    // Identifier / keyword
    if (isIdentStart(cc)) {
      this.pos++;
      while (this.pos < this.src.length && isIdentCont(this.src.charCodeAt(this.pos))) this.pos++;
      const value = this.src.substring(start, this.pos);
      return { kind: "ident", value, start, end: this.pos, line };
    }
    // Number
    if (cc >= 48 && cc <= 57) {
      this.pos++;
      while (this.pos < this.src.length) {
        const cc2 = this.src.charCodeAt(this.pos);
        // `.` is only part of the number if the next char is a digit (decimal point).
        // If the next char is another `.`, it's the start of a `..` / `..=` range operator.
        if (cc2 === 46) {
          const cc3 = this.src.charCodeAt(this.pos + 1);
          if (cc3 === 46) break; // `..` follows — stop the number here
          this.pos++;
          continue;
        }
        if ((cc2 >= 48 && cc2 <= 57) || cc2 === 101 || cc2 === 69 || cc2 === 120 || cc2 === 95
          || (cc2 >= 97 && cc2 <= 102) || (cc2 >= 65 && cc2 <= 70)) {
          this.pos++;
        } else break;
      }
      return { kind: "num", value: this.src.substring(start, this.pos), start, end: this.pos, line };
    }
    // String
    if (cc === 34 || cc === 39) {
      const quote = cc;
      this.pos++;
      while (this.pos < this.src.length) {
        const c2 = this.src.charCodeAt(this.pos);
        if (c2 === 92) { this.pos += 2; continue; }
        if (c2 === quote) { this.pos++; break; }
        if (c2 === 10) this.line++;
        this.pos++;
      }
      return { kind: "str", value: this.src.substring(start, this.pos), start, end: this.pos, line };
    }
    // Template literal
    if (cc === 96) {
      this.pos++;
      while (this.pos < this.src.length) {
        const c2 = this.src.charCodeAt(this.pos);
        if (c2 === 92) { this.pos += 2; continue; }
        if (c2 === 96) { this.pos++; break; }
        if (c2 === 10) this.line++;
        // Allow ${expr} inside template literals
        if (c2 === 36 && this.src.charCodeAt(this.pos + 1) === 123) {
          this.pos += 2;
          let depth = 1;
          while (this.pos < this.src.length && depth > 0) {
            const cc3 = this.src.charCodeAt(this.pos);
            if (cc3 === 123) depth++;
            else if (cc3 === 125) depth--;
            if (cc3 === 10) this.line++;
            this.pos++;
          }
          continue;
        }
        this.pos++;
      }
      return { kind: "tmpl", value: this.src.substring(start, this.pos), start, end: this.pos, line };
    }
    // Regex literal: /.../flags (when context allows)
    if (cc === 47 && this.canStartRegex()) {
      const savedPos = this.pos;
      this.pos++;
      let inClass = false;
      let ok = false;
      while (this.pos < this.src.length) {
        const c2 = this.src.charCodeAt(this.pos);
        if (c2 === 92) { this.pos += 2; continue; } // escape
        if (c2 === 91) { inClass = true; this.pos++; continue; }
        if (c2 === 93 && inClass) { inClass = false; this.pos++; continue; }
        if (c2 === 47 && !inClass) { this.pos++; ok = true; break; }
        if (c2 === 10) break; // newline ends regex
        this.pos++;
      }
      if (ok) {
        // Consume flags
        while (this.pos < this.src.length) {
          const cc2 = this.src.charCodeAt(this.pos);
          if ((cc2 >= 97 && cc2 <= 122)) this.pos++;
          else break;
        }
        return { kind: "regex", value: this.src.substring(start, this.pos), start, end: this.pos, line };
      }
      // Not a regex — back up and treat as division
      this.pos = savedPos;
    }

    // Punctuation — check multi-char first
    for (const p of PUNCT_MULTI) {
      if (this.src.substring(this.pos, this.pos + p.length) === p) {
        this.pos += p.length;
        return { kind: "punct", value: p, start, end: this.pos, line };
      }
    }
    // Single-char punctuation
    const singleCharPunct = "{}[]()<>:;,.!?@#$%^&*+-=/~|";
    if (singleCharPunct.includes(c)) {
      this.pos++;
      return { kind: "punct", value: c, start, end: this.pos, line };
    }
    // Unknown — skip
    this.pos++;
    return null;
  }
}

function isIdentStart(cc: number): boolean {
  return (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95;
}
function isIdentCont(cc: number): boolean {
  return isIdentStart(cc) || (cc >= 48 && cc <= 57);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface ParseResult {
  ir?: IR.IRProgram;
  errors: string[];
}

export function parseTypescriptAET(source: string): ParseResult {
  // Handle version header
  const lines = source.split("\n");
  let offset = 0;
  let isJsx = false;
  let requiredImports: string[] = [];

  // Accept both the new short headers (!ts1/!tsx1, v1 since 0.2.1) and the legacy long form.
  if (lines.length > 0 && (lines[0] === "!ts1" || lines[0] === "!tsx1" || lines[0] === "!ts-v1" || lines[0] === "!tsx-v1")) {
    isJsx = lines[0] === "!tsx1" || lines[0] === "!tsx-v1";
    offset = lines[0].length + 1;
  }
  // Collect required import hints
  while (offset < source.length) {
    const nlPos = source.indexOf("\n", offset);
    const lineEnd = nlPos === -1 ? source.length : nlPos;
    const line = source.substring(offset, lineEnd);
    if (line.startsWith("!r:")) {
      requiredImports.push(line.substring(3));
      offset = lineEnd + 1;
    } else {
      break;
    }
  }

  const body = source.substring(offset);
  const lexer = new Lexer(body, isJsx);
  const tokens = lexer.tokenize();

  const parser = new Parser(tokens, isJsx);
  try {
    const decls = parser.parseProgram();
    const program: IR.IRProgram = {
      kind: "Program",
      package: isJsx ? "tsx-v1" : "ts-v1",
      imports: [],
      decls,
      stmtIndex: 0,
    };
    // Attach required imports as metadata
    (program as any).requiredImports = requiredImports;
    return { ir: program, errors: parser.errors };
  } catch (e: any) {
    return { errors: [e.message || String(e)] };
  }
}

class Parser {
  private toks: Tok[];
  private pos: number = 0;
  private _stmtIdx: number = 0;
  public errors: string[] = [];
  public isJsx: boolean;
  // Context: inside class body (affects .attr meaning)
  private _insideClass: boolean = false;

  constructor(toks: Tok[], isJsx: boolean) {
    this.toks = toks;
    this.isJsx = isJsx;
  }

  // ---------------------- Utility ----------------------

  private peek(offset: number = 0): Tok {
    return this.toks[Math.min(this.pos + offset, this.toks.length - 1)];
  }

  private tok(): Tok {
    return this.toks[this.pos];
  }

  private advance(): Tok {
    const t = this.toks[this.pos];
    if (this.pos < this.toks.length - 1) this.pos++;
    return t;
  }

  private match(kind: TokKind, value?: string): boolean {
    const t = this.tok();
    if (t.kind !== kind) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }

  private eat(kind: TokKind, value?: string): Tok {
    const t = this.tok();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new Error(`Parse error: expected ${kind}${value ? ` '${value}'` : ""} but got ${t.kind} '${t.value}' at line ${t.line}`);
    }
    return this.advance();
  }

  private tryEat(kind: TokKind, value?: string): boolean {
    if (this.match(kind, value)) { this.advance(); return true; }
    return false;
  }

  private nextIdx(): number {
    return this._stmtIdx++;
  }

  private skipSemis(): void {
    while (this.match("punct", ";")) this.advance();
  }

  // Consume a single `>` to close a type argument list. When the current token
  // is `>>`, `>=`, `>>=`, `>>>`, or `>>>=`, split it: consume just the leading
  // `>` and leave the remainder as the next token.
  private eatClosingAngle(): void {
    const t = this.tok();
    if (t.kind !== "punct") {
      throw new Error(`expected '>' but got ${t.kind} '${t.value}' at line ${t.line}`);
    }
    if (t.value === ">") { this.advance(); return; }
    if (t.value === ">=") { t.value = "="; return; }
    if (t.value === ">>") { t.value = ">"; return; }
    if (t.value === ">>=") { t.value = ">="; return; }
    if (t.value === ">>>") { t.value = ">>"; return; }
    if (t.value === ">>>=") { t.value = ">>="; return; }
    throw new Error(`expected '>' but got '${t.value}' at line ${t.line}`);
  }

  private isClosingAngle(): boolean {
    const t = this.tok();
    if (t.kind !== "punct") return false;
    return t.value === ">" || t.value === ">=" || t.value === ">>" ||
           t.value === ">>=" || t.value === ">>>" || t.value === ">>>=";
  }

  // ---------------------- Top level ----------------------

  parseProgram(): IR.IRNode[] {
    const decls: IR.IRNode[] = [];
    while (!this.match("eof")) {
      this.skipSemis();
      if (this.match("eof")) break;
      const d = this.parseTopLevel();
      if (d) decls.push(d);
      this.skipSemis();
    }
    return decls;
  }

  private parseTopLevel(): IR.IRNode | null {
    // Parse modifier prefixes: +, +d, dc, ab, decorators
    const mods = this.parseModifierPrefix();

    // Decorator(s)
    while (this.match("punct", "@")) {
      // @Name or @Name(args) — this could be a class/interface decl OR a decorator.
      // If @ is followed by an ident AND then `{`, it's a decl. Otherwise it's a decorator.
      const savedPos = this.pos;
      this.advance(); // consume @
      if (this.match("ident")) {
        const peekName = this.tok().value;
        const next = this.peek(1);
        // If @Name{ — it's a declaration
        if (next.kind === "punct" && (next.value === "{" || next.value === "<" || next.value === ":" || next.value === "[")) {
          this.pos = savedPos;
          break;
        }
        // If @Name( — could be decorator call
        // Back up and let decorator parsing happen
        this.pos = savedPos;
        mods.decorators.push(this.parseDecorator());
        continue;
      }
      this.pos = savedPos;
      break;
    }

    // Now parse the actual declaration
    const t = this.tok();
    if (t.kind === "punct") {
      if (t.value === "@") return this.parseInterfaceOrClass(mods);
      if (t.value === "=") return this.parseTypeAliasDecl(mods);
      if (t.value === "#") return this.parseEnumDecl(mods);
      if (t.value === ":=") return this.parseVarStmt("const", mods);
    }
    if (t.kind === "ident") {
      // 'a' prefix = async
      if (t.value === "a" && this.peek(1).kind === "ident") {
        this.advance(); // consume 'a'
        const node = this.parseTopLevel();
        if (node && node.kind === "Ts_FuncDecl") {
          (node as IR.Ts_FuncDecl).isAsync = true;
        } else if (node && node.kind === "Ts_VarStmt") {
          // async not applicable to var stmt directly — reattach
        }
        return node;
      }
      if (t.value === "let") { this.advance(); return this.parseVarStmt("let", mods); }
      if (t.value === "var") { this.advance(); return this.parseVarStmt("var", mods); }
      if (t.value === "cn") {
        this.advance();
        if (this.match("punct", "#")) return this.parseEnumDecl(mods, /*isConst*/ true);
      }
      if (t.value === "ns") { this.advance(); return this.parseNamespaceDecl(mods); }
      if (t.value === "ab") {
        this.advance();
        const next = this.parseTopLevel();
        if (next && next.kind === "Ts_ClassDecl") {
          (next as IR.Ts_ClassDecl).isAbstract = true;
        }
        return next;
      }
      if (t.value === "dc") {
        this.advance();
        const next = this.parseTopLevel();
        if (next) {
          (next as any).declare = true;
          if (next.kind === "Ts_FuncDecl") {
            (next as IR.Ts_FuncDecl).declare = true;
          }
        }
        return next;
      }
      // Function declaration: name(params) { ... }
      if (this.isFunctionStart()) return this.parseFuncDecl(mods);
    }
    // Export default expression: `+d X` (parsed as an expression statement but wrapped so the emitter knows)
    if (mods.isDefault) {
      const expr = this.parseExpr();
      // Wrap as a special "export default" function declaration with an expression body.
      // We encode it as a VarStmt with a single declarator whose binding is a sentinel
      // "__exportDefault__" and whose value is the expression. The emitter handles this specially.
      return {
        kind: "Ts_VarStmt",
        keyword: "const",
        declarations: [{
          binding: { kind: "Ident", name: "__exportDefault__" } as IR.IRIdent,
          value: expr,
        }],
        isExported: true,
        stmtIndex: this.nextIdx(),
      } as IR.Ts_VarStmt;
    }
    // Fall back to statement (assignment, expr)
    return this.parseStmt();
  }

  private parseModifierPrefix(): { isExported: boolean; isDefault: boolean; decorators: IR.IRExpr[] } {
    let isExported = false;
    let isDefault = false;
    const decorators: IR.IRExpr[] = [];
    while (true) {
      const t = this.tok();
      if (t.kind === "punct" && t.value === "+") {
        this.advance();
        isExported = true;
        if (this.match("ident", "d")) {
          this.advance();
          isDefault = true;
        }
        continue;
      }
      break;
    }
    return { isExported, isDefault, decorators };
  }

  private parseDecorator(): IR.IRExpr {
    this.eat("punct", "@");
    return this.parsePrimaryExpr();
  }

  private isFunctionStart(): boolean {
    // name(...) { ... }  OR  name<...>(...)
    if (!this.match("ident")) return false;
    // Type params: name<T>
    let p = 1;
    if (this.peek(p).kind === "punct" && this.peek(p).value === "<") {
      // skip through matching >
      let depth = 1;
      p++;
      while (p < this.toks.length - this.pos && depth > 0) {
        const ch = this.peek(p);
        if (ch.kind === "punct" && ch.value === "<") depth++;
        if (ch.kind === "punct" && ch.value === ">") depth--;
        if (ch.kind === "eof") return false;
        p++;
      }
    }
    if (this.peek(p).kind !== "punct" || this.peek(p).value !== "(") return false;
    // Now skip through matching )
    let pdepth = 1;
    p++;
    while (p < this.toks.length - this.pos && pdepth > 0) {
      const ch = this.peek(p);
      if (ch.kind === "punct" && ch.value === "(") pdepth++;
      if (ch.kind === "punct" && ch.value === ")") pdepth--;
      if (ch.kind === "eof") return false;
      p++;
    }
    // Optional return type: ->
    if (this.peek(p).kind === "punct" && this.peek(p).value === "->") {
      // skip the type
      p++;
      // Simple heuristic: advance until { or ;
      while (p < this.toks.length - this.pos) {
        const ch = this.peek(p);
        if (ch.kind === "punct" && (ch.value === "{" || ch.value === ";")) break;
        if (ch.kind === "eof") return false;
        p++;
      }
    }
    // Expect { for function body
    return this.peek(p).kind === "punct" && this.peek(p).value === "{";
  }

  // ---------------------- Interface / Class ----------------------

  private parseInterfaceOrClass(mods: { isExported: boolean; isDefault: boolean; decorators: IR.IRExpr[] }): IR.IRNode {
    this.eat("punct", "@");
    const name = this.eat("ident").value;
    const typeParams = this.parseOptTypeParams();

    // Heritage
    let superClass: IR.Ts_TypeRef | undefined;
    const implementsList: IR.Ts_TypeRef[] = [];
    const heritage: IR.Ts_TypeRef[] = [];

    while (true) {
      if (this.match("punct", ":")) {
        this.advance();
        // extends clause — for interface, accumulate into heritage; for class, first is super
        while (true) {
          const tr = this.parseTypeRef();
          heritage.push(tr);
          if (!superClass) superClass = tr;
          if (!this.tryEat("punct", ",")) break;
        }
        continue;
      }
      if (this.match("punct", "[")) {
        this.advance();
        while (true) {
          implementsList.push(this.parseTypeRef());
          if (!this.tryEat("punct", ",")) break;
        }
        this.eat("punct", "]");
        continue;
      }
      break;
    }

    this.eat("punct", "{");
    // We don't know yet if it's interface or class. Look at first member: if ctor (init()) or field with value or method with body → class. Otherwise interface.
    // Peek inside: scan until matching } to see if any member has a body {..} after (params)
    const bodyStart = this.pos;
    const isClass = this.lookAheadHasClassBody();

    if (isClass) {
      const prev = this._insideClass;
      this._insideClass = true;
      const members = this.parseClassBody();
      this._insideClass = prev;
      const cls: IR.Ts_ClassDecl = {
        kind: "Ts_ClassDecl",
        name,
        typeParams,
        superClass: superClass,
        implements: implementsList.length > 0 ? implementsList : undefined,
        members,
        isExported: mods.isExported,
        isAbstract: false,
        isDefault: mods.isDefault,
        decorators: mods.decorators.length > 0 ? mods.decorators : undefined,
        stmtIndex: this.nextIdx(),
      };
      return cls;
    }

    const members = this.parseInterfaceBody();
    const iface: IR.Ts_InterfaceDecl = {
      kind: "Ts_InterfaceDecl",
      name,
      typeParams,
      heritage: heritage.length > 0 ? heritage : undefined,
      members,
      isExported: mods.isExported,
      stmtIndex: this.nextIdx(),
    };
    return iface;
  }

  private lookAheadHasClassBody(): boolean {
    let depth = 1;
    let p = 0;
    while (p < 5000) {
      const ch = this.peek(p);
      if (ch.kind === "eof") return false;
      if (ch.kind === "punct" && ch.value === "{") depth++;
      if (ch.kind === "punct" && ch.value === "}") {
        depth--;
        if (depth === 0) return false;
      }
      // Look for: ident '(' ... ')' '{' — a method with body — only at top level of class body (depth === 1)
      if (depth === 1 && (ch.kind === "ident" || (ch.kind === "punct" && ch.value === "init"))) {
        // Check if the pattern is name(...) {
        let q = p + 1;
        // skip type params
        if (this.peek(q).kind === "punct" && this.peek(q).value === "<") {
          let d = 1;
          q++;
          while (q < 5000 && d > 0) {
            const c = this.peek(q);
            if (c.kind === "eof") return false;
            if (c.kind === "punct" && c.value === "<") d++;
            if (c.kind === "punct" && c.value === ">") d--;
            q++;
          }
        }
        if (this.peek(q).kind === "punct" && this.peek(q).value === "(") {
          // skip to matching )
          let d = 1;
          q++;
          while (q < 5000 && d > 0) {
            const c = this.peek(q);
            if (c.kind === "eof") return false;
            if (c.kind === "punct" && c.value === "(") d++;
            if (c.kind === "punct" && c.value === ")") d--;
            q++;
          }
          // optional -> type
          if (this.peek(q).kind === "punct" && this.peek(q).value === "->") {
            q++;
            while (q < 5000) {
              const c = this.peek(q);
              if (c.kind === "eof") return false;
              if (c.kind === "punct" && (c.value === "{" || c.value === ";")) break;
              q++;
            }
          }
          if (this.peek(q).kind === "punct" && this.peek(q).value === "{") {
            return true;
          }
        }
      }
      // Look for field initializer with a value
      if (depth === 1 && (ch.kind === "punct" && (ch.value === "-" || ch.value === "~" || ch.value === "$" || ch.value === "!" || ch.value === "+"))) {
        return true;
      }
      if (depth === 1 && ch.kind === "ident" && ch.value === "init") return true;
      if (depth === 1 && ch.kind === "ident" && (ch.value === "ab")) return true;
      p++;
    }
    return false;
  }

  private parseInterfaceBody(): IR.Ts_TypeMember[] {
    const members: IR.Ts_TypeMember[] = [];
    while (!this.match("punct", "}") && !this.match("eof")) {
      const m = this.parseInterfaceMember();
      if (m) members.push(m);
      if (this.match("punct", ";")) this.advance();
    }
    this.eat("punct", "}");
    return members;
  }

  private parseInterfaceMember(): IR.Ts_TypeMember | null {
    let readonly = false;
    if (this.match("punct", "!")) { readonly = true; this.advance(); }

    // Index signature: [name:type]:type
    if (this.match("punct", "[")) {
      this.advance();
      const keyName = this.eat("ident").value;
      this.eat("punct", ":");
      const keyType = this.parseTypeExpr();
      this.eat("punct", "]");
      this.eat("punct", ":");
      const valueType = this.parseTypeExpr();
      return {
        name: "",
        readonly,
        indexSignature: { keyName, keyType },
        type: valueType,
      };
    }

    // Property or method
    if (!this.match("ident") && !this.match("str")) return null;
    const nameTok = this.advance();
    const name = nameTok.kind === "str" ? nameTok.value : nameTok.value;

    // Optional
    let optional = false;
    if (this.match("punct", "?")) { optional = true; this.advance(); }

    // Method: <...>(...)  or (...)
    const typeParams = this.parseOptTypeParams();
    if (this.match("punct", "(")) {
      const params = this.parseTsParamList();
      let returnType: IR.Ts_TypeExpr | undefined;
      if (this.tryEat("punct", "->")) {
        returnType = this.parseTypeExpr();
      }
      return {
        name,
        isMethod: true,
        params,
        returnType,
        typeParams,
        optional,
        readonly,
      };
    }

    // Property with type
    let type: IR.Ts_TypeExpr | undefined;
    if (this.tryEat("punct", ":")) {
      type = this.parseTypeExpr();
    }
    return { name, type, optional, readonly };
  }

  private parseClassBody(): IR.Ts_ClassMember[] {
    const members: IR.Ts_ClassMember[] = [];
    while (!this.match("punct", "}") && !this.match("eof")) {
      const m = this.parseClassMember();
      if (m) members.push(m);
      if (this.match("punct", ";")) this.advance();
    }
    this.eat("punct", "}");
    return members;
  }

  private parseClassMember(): IR.Ts_ClassMember | null {
    // Modifier prefixes: -, ~, $, !, ^, a, ab
    let access: "public" | "private" | "protected" | undefined;
    let isStatic = false;
    let isReadonly = false;
    let isAsync = false;
    let isAbstract = false;
    let isOverride = false;
    const decorators: IR.IRExpr[] = [];

    while (true) {
      if (this.match("punct", "@")) {
        decorators.push(this.parseDecorator());
        continue;
      }
      if (this.match("punct", "-")) { this.advance(); access = "private"; continue; }
      if (this.match("punct", "~")) { this.advance(); access = "protected"; continue; }
      if (this.match("punct", "+")) { this.advance(); access = "public"; continue; }
      if (this.match("punct", "$")) { this.advance(); isStatic = true; continue; }
      if (this.match("punct", "!")) { this.advance(); isReadonly = true; continue; }
      if (this.match("punct", "^")) { this.advance(); isOverride = true; continue; }
      if (this.match("ident", "a") && this.peek(1).kind === "ident") {
        this.advance(); isAsync = true; continue;
      }
      if (this.match("ident", "ab")) { this.advance(); isAbstract = true; continue; }
      break;
    }

    // Constructor (init)
    if (this.match("ident", "init")) {
      this.advance();
      const params = this.parseTsParamList(/*allowCtorMods*/ true);
      let body: IR.Ts_BlockStmt;
      if (this.match("punct", "{")) {
        body = this.parseBlockStmt();
      } else {
        body = { kind: "Ts_BlockStmt", stmts: [] };
      }
      return {
        kind: "Ts_CtorDecl",
        params,
        body,
        access,
      };
    }

    // Getter / setter
    if (this.match("ident", "get") && this.peek(1).kind === "ident") {
      this.advance();
      const name = this.eat("ident").value;
      this.eat("punct", "(");
      this.eat("punct", ")");
      let returnType: IR.Ts_TypeExpr | undefined;
      if (this.tryEat("punct", "->")) returnType = this.parseTypeExpr();
      const body = this.parseBlockStmt();
      return { kind: "Ts_GetterDecl", name, returnType, body, access, isStatic };
    }
    if (this.match("ident", "set") && this.peek(1).kind === "ident") {
      this.advance();
      const name = this.eat("ident").value;
      this.eat("punct", "(");
      const paramName = this.eat("ident").value;
      let paramType: IR.Ts_TypeExpr | undefined;
      if (this.tryEat("punct", ":")) paramType = this.parseTypeExpr();
      this.eat("punct", ")");
      const body = this.parseBlockStmt();
      return {
        kind: "Ts_SetterDecl",
        name,
        param: { name: paramName, type: paramType },
        body,
        access,
        isStatic,
      };
    }

    // Field or method
    if (!this.match("ident") && !this.match("str")) return null;
    const nameTok = this.advance();
    const name = nameTok.value;

    let optional = false;
    if (this.match("punct", "?")) { optional = true; this.advance(); }

    // Method: optional type params, then (...)
    const typeParams = this.parseOptTypeParams();
    if (this.match("punct", "(") || (typeParams && this.match("punct", "("))) {
      const params = this.parseTsParamList();
      let returnType: IR.Ts_TypeExpr | undefined;
      if (this.tryEat("punct", "->")) returnType = this.parseTypeExpr();
      let body: IR.Ts_BlockStmt | undefined;
      if (this.match("punct", "{")) {
        body = this.parseBlockStmt();
      }
      return {
        kind: "Ts_MethodDecl",
        name,
        typeParams,
        params,
        returnType,
        body,
        access,
        isStatic,
        isAsync,
        isAbstract,
        isGenerator: false,
        isOverride,
        decorators: decorators.length > 0 ? decorators : undefined,
      };
    }

    // Field
    let type: IR.Ts_TypeExpr | undefined;
    if (this.tryEat("punct", ":")) {
      type = this.parseTypeExpr();
    }
    let value: IR.IRExpr | undefined;
    if (this.tryEat("punct", "=")) {
      value = this.parseExpr();
    }
    return {
      kind: "Ts_FieldDecl",
      name,
      type,
      value,
      access,
      isStatic,
      isReadonly,
      optional,
      decorators: decorators.length > 0 ? decorators : undefined,
    };
  }

  // ---------------------- Type alias / Enum / Namespace ----------------------

  private parseTypeAliasDecl(mods: { isExported: boolean }): IR.Ts_TypeAliasDecl {
    this.eat("punct", "=");
    const name = this.eat("ident").value;
    const typeParams = this.parseOptTypeParams();
    this.eat("punct", "=");
    const type = this.parseTypeExpr();
    return {
      kind: "Ts_TypeAliasDecl",
      name,
      typeParams,
      type,
      isExported: mods.isExported,
      stmtIndex: this.nextIdx(),
    };
  }

  private parseEnumDecl(mods: { isExported: boolean }, isConst: boolean = false): IR.Ts_EnumDecl {
    this.eat("punct", "#");
    const name = this.eat("ident").value;
    this.eat("punct", "{");
    const members: { name: string; value?: IR.IRExpr }[] = [];
    while (!this.match("punct", "}") && !this.match("eof")) {
      const n = this.eat("ident").value;
      let value: IR.IRExpr | undefined;
      if (this.tryEat("punct", "=")) {
        value = this.parseExpr();
      }
      members.push({ name: n, value });
      if (!this.tryEat("punct", ",")) break;
    }
    this.eat("punct", "}");
    return {
      kind: "Ts_EnumDecl",
      name,
      members,
      isConst,
      isExported: mods.isExported,
      stmtIndex: this.nextIdx(),
    };
  }

  private parseNamespaceDecl(mods: { isExported: boolean }): IR.Ts_NamespaceDecl {
    const name = this.eat("ident").value;
    this.eat("punct", "{");
    const body: IR.IRNode[] = [];
    while (!this.match("punct", "}") && !this.match("eof")) {
      this.skipSemis();
      if (this.match("punct", "}")) break;
      const d = this.parseTopLevel();
      if (d) body.push(d);
      this.skipSemis();
    }
    this.eat("punct", "}");
    return {
      kind: "Ts_NamespaceDecl",
      name,
      body,
      isExported: mods.isExported,
      stmtIndex: this.nextIdx(),
    };
  }

  // ---------------------- Function / Variable ----------------------

  private parseFuncDecl(mods: { isExported: boolean; isDefault: boolean }, isAsync: boolean = false): IR.Ts_FuncDecl {
    const name = this.eat("ident").value;
    const typeParams = this.parseOptTypeParams();
    const params = this.parseTsParamList();
    let returnType: IR.Ts_TypeExpr | undefined;
    if (this.tryEat("punct", "->")) returnType = this.parseTypeExpr();
    const body = this.parseBlockStmt();
    return {
      kind: "Ts_FuncDecl",
      name,
      typeParams,
      params,
      returnType,
      body,
      isAsync,
      isGenerator: false,
      isExported: mods.isExported,
      isDefault: mods.isDefault,
      stmtIndex: this.nextIdx(),
    };
  }

  private parseVarStmt(keyword: "const" | "let" | "var", mods: { isExported: boolean }): IR.Ts_VarStmt {
    if (keyword === "const") this.eat("punct", ":=");
    const decls: IR.Ts_VarDeclarator[] = [];
    while (true) {
      const binding = this.parseBindingPattern();
      let type: IR.Ts_TypeExpr | undefined;
      if (this.tryEat("punct", ":")) {
        type = this.parseTypeExpr();
      }
      let value: IR.IRExpr | undefined;
      if (this.tryEat("punct", "=")) {
        value = this.parseExpr();
      }
      decls.push({ binding, type, value });
      if (!this.tryEat("punct", ",")) break;
    }
    return {
      kind: "Ts_VarStmt",
      keyword,
      declarations: decls,
      isExported: mods.isExported,
      stmtIndex: this.nextIdx(),
    };
  }

  private parseBindingPattern(): IR.IRExpr {
    if (this.match("punct", "[")) {
      this.advance();
      const elts: IR.IRExpr[] = [];
      while (!this.match("punct", "]") && !this.match("eof")) {
        if (this.match("punct", ",")) {
          this.advance();
          elts.push({ kind: "Ident", name: "" } as IR.IRIdent);
          continue;
        }
        elts.push(this.parseBindingPattern());
        if (!this.tryEat("punct", ",")) break;
      }
      this.eat("punct", "]");
      return { kind: "Ts_ArrayLit", elements: elts } as IR.Ts_ArrayLit;
    }
    if (this.match("punct", "{")) {
      this.advance();
      const props: IR.Ts_ObjectProperty[] = [];
      while (!this.match("punct", "}") && !this.match("eof")) {
        if (this.match("punct", "...")) {
          this.advance();
          const val = this.parseBindingPattern();
          props.push({ kind: "spread", value: val });
        } else {
          const name = this.eat("ident").value;
          let value: IR.IRExpr;
          if (this.tryEat("punct", ":")) {
            value = this.parseBindingPattern();
            props.push({ kind: "property", key: { kind: "Ident", name }, value, computed: false, shorthand: false });
          } else {
            props.push({ kind: "property", key: { kind: "Ident", name }, value: { kind: "Ident", name }, computed: false, shorthand: true });
          }
        }
        if (!this.tryEat("punct", ",")) break;
      }
      this.eat("punct", "}");
      return { kind: "Ts_ObjectLit", properties: props } as IR.Ts_ObjectLit;
    }
    const name = this.eat("ident").value;
    return { kind: "Ident", name } as IR.IRIdent;
  }

  // ---------------------- Type params / param list ----------------------

  private parseOptTypeParams(): IR.Ts_TypeParam[] | undefined {
    if (!this.match("punct", "<")) return undefined;
    // Distinguish type parameter list from JSX/less-than. Simple heuristic: parse until '>'.
    this.advance();
    const params: IR.Ts_TypeParam[] = [];
    while (!this.match("punct", ">") && !this.match("eof")) {
      const name = this.eat("ident").value;
      let constraint: IR.Ts_TypeExpr | undefined;
      let default_: IR.Ts_TypeExpr | undefined;
      if (this.tryEat("punct", ":")) constraint = this.parseTypeExpr();
      if (this.tryEat("punct", "=")) default_ = this.parseTypeExpr();
      params.push({ name, constraint, default_ });
      if (!this.tryEat("punct", ",")) break;
    }
    this.eatClosingAngle();
    return params;
  }

  private parseTsParamList(allowCtorMods: boolean = false): IR.Ts_Param[] {
    this.eat("punct", "(");
    const params: IR.Ts_Param[] = [];
    while (!this.match("punct", ")") && !this.match("eof")) {
      let modifier: string | undefined;
      if (allowCtorMods) {
        if (this.match("punct", "-")) { this.advance(); modifier = "private"; }
        else if (this.match("punct", "~")) { this.advance(); modifier = "protected"; }
        else if (this.match("punct", "+")) { this.advance(); modifier = "public"; }
        if (this.match("punct", "!")) { this.advance(); modifier = (modifier ?? "public") + " readonly"; }
      }
      let rest = false;
      if (this.match("punct", "...")) { rest = true; this.advance(); }

      // Name can be destructuring pattern OR simple ident
      let name: string;
      if (this.match("punct", "{") || this.match("punct", "[")) {
        // destructuring — collapse to a stringified form for now
        const start = this.pos;
        this.parseBindingPattern();
        name = this.toks.slice(start, this.pos).map(t => t.value).join("");
      } else {
        name = this.eat("ident").value;
      }
      let optional = false;
      if (this.match("punct", "?")) { optional = true; this.advance(); }
      let type: IR.Ts_TypeExpr | undefined;
      if (this.tryEat("punct", ":")) type = this.parseTypeExpr();
      let default_: IR.IRExpr | undefined;
      if (this.tryEat("punct", "=")) default_ = this.parseExpr();
      params.push({ name, type, optional, default_, rest, modifier });
      if (!this.tryEat("punct", ",")) break;
    }
    this.eat("punct", ")");
    return params;
  }

  // ---------------------- Type expressions ----------------------

  parseTypeExpr(): IR.Ts_TypeExpr {
    return this.parseUnionType();
  }

  private parseUnionType(): IR.Ts_TypeExpr {
    // optional leading |
    if (this.match("punct", "|")) this.advance();
    const first = this.parseIntersectionType();
    if (!this.match("punct", "|")) return first;
    const types: IR.Ts_TypeExpr[] = [first];
    while (this.tryEat("punct", "|")) {
      types.push(this.parseIntersectionType());
    }
    return { kind: "Ts_UnionType", types };
  }

  private parseIntersectionType(): IR.Ts_TypeExpr {
    if (this.match("punct", "&")) this.advance();
    const first = this.parseConditionalType();
    if (!this.match("punct", "&")) return first;
    const types: IR.Ts_TypeExpr[] = [first];
    while (this.tryEat("punct", "&")) {
      types.push(this.parseConditionalType());
    }
    return { kind: "Ts_IntersectionType", types };
  }

  private parseConditionalType(): IR.Ts_TypeExpr {
    const check = this.parsePrimaryType();
    if (this.match("punct", ":") && this.lookAheadConditional()) {
      this.advance();
      const extendsType = this.parsePrimaryType();
      this.eat("punct", "?");
      const trueType = this.parseTypeExpr();
      this.eat("punct", ":");
      const falseType = this.parseTypeExpr();
      return { kind: "Ts_ConditionalType", checkType: check, extendsType, trueType, falseType };
    }
    return check;
  }

  private lookAheadConditional(): boolean {
    // After `:` in type expression context, we're usually just extends.
    // Conditional types in AET-TS: T:U?X:Y. Need to detect the `?` later.
    // Simple heuristic: scan ahead a limited number of tokens and look for a ?
    // at matching depth (no unclosed brackets).
    let p = 1;
    let angle = 0, paren = 0, square = 0, brace = 0;
    while (p < 200) {
      const t = this.peek(p);
      if (t.kind === "eof") return false;
      if (t.kind === "punct") {
        if (t.value === "<") angle++;
        else if (t.value === ">") angle--;
        else if (t.value === "(") paren++;
        else if (t.value === ")") paren--;
        else if (t.value === "[") square++;
        else if (t.value === "]") square--;
        else if (t.value === "{") brace++;
        else if (t.value === "}") brace--;
        else if (t.value === "?" && angle === 0 && paren === 0 && square === 0 && brace === 0) return true;
        else if ((t.value === ";" || t.value === ",") && angle === 0 && paren === 0 && square === 0 && brace === 0) return false;
      }
      p++;
    }
    return false;
  }

  private parsePrimaryType(): IR.Ts_TypeExpr {
    let type = this.parseAtomType();
    // Postfix: [] for array, [...] for indexed access
    while (true) {
      if (this.match("punct", "[")) {
        const next = this.peek(1);
        if (next.kind === "punct" && next.value === "]") {
          this.advance(); this.advance();
          type = { kind: "Ts_ArrayType", elt: type };
          continue;
        }
        this.advance();
        const idx = this.parseTypeExpr();
        this.eat("punct", "]");
        type = { kind: "Ts_IndexedAccessType", object: type, index: idx };
        continue;
      }
      break;
    }
    return type;
  }

  private parseAtomType(): IR.Ts_TypeExpr {
    const t = this.tok();

    // Type alias shortcuts (s, n, b, v, u, A, uk, nv, bi, sy)
    if (t.kind === "ident" && TYPE_ALIASES[t.value]) {
      this.advance();
      return { kind: "Ts_TypeRef", name: TYPE_ALIASES[t.value] };
    }
    // keyof / typeof / infer
    if (t.kind === "ident" && t.value === "ko") {
      this.advance();
      return { kind: "Ts_KeyofType", type: this.parseAtomType() };
    }
    if (t.kind === "ident" && t.value === "keyof") {
      this.advance();
      return { kind: "Ts_KeyofType", type: this.parseAtomType() };
    }
    if (t.kind === "ident" && t.value === "typeof") {
      this.advance();
      const expr = this.parsePrimaryExpr();
      return { kind: "Ts_TypeofType", expr };
    }
    if (t.kind === "ident" && t.value === "infer") {
      this.advance();
      const name = this.eat("ident").value;
      return { kind: "Ts_InferType", name };
    }
    // Readonly modifier used in type contexts (e.g., !T[] before array)
    if (t.kind === "punct" && t.value === "!") {
      // Could be ambient "!T" modifier — treat as no-op for simplicity in value types
      this.advance();
      return this.parseAtomType();
    }

    // Literal types
    if (t.kind === "str") {
      this.advance();
      return { kind: "Ts_LiteralType", value: t.value.substring(1, t.value.length - 1), litKind: "string" };
    }
    if (t.kind === "num") {
      this.advance();
      return { kind: "Ts_LiteralType", value: t.value, litKind: "number" };
    }
    if (t.kind === "ident" && (t.value === "true" || t.value === "false")) {
      this.advance();
      return { kind: "Ts_LiteralType", value: t.value, litKind: "boolean" };
    }
    if (t.kind === "ident" && t.value === "null") {
      this.advance();
      return { kind: "Ts_LiteralType", value: "null", litKind: "null" };
    }

    // Parenthesized type or function type
    if (t.kind === "punct" && t.value === "(") {
      // could be (A | B) type OR (params) -> type
      const savedPos = this.pos;
      // Try function type: (x:T, y:T)->rt
      try {
        return this.tryParseFnType();
      } catch {
        this.pos = savedPos;
        this.advance();
        const inner = this.parseTypeExpr();
        this.eat("punct", ")");
        return { kind: "Ts_ParenType", inner };
      }
    }

    // Tuple
    if (t.kind === "punct" && t.value === "[") {
      this.advance();
      const elts: IR.Ts_TypeExpr[] = [];
      while (!this.match("punct", "]") && !this.match("eof")) {
        elts.push(this.parseTypeExpr());
        if (!this.tryEat("punct", ",")) break;
      }
      this.eat("punct", "]");
      return { kind: "Ts_TupleType", elts };
    }

    // Type literal {...}
    if (t.kind === "punct" && t.value === "{") {
      this.advance();
      // Mapped type: {[K in ...]:T[K]} or {![K in ...]:...} or {?[K in ...]:...}
      let mappedReadonly: "+" | "-" | true | undefined;
      if (this.match("punct", "!") && this.peek(1).kind === "punct" && this.peek(1).value === "[") {
        mappedReadonly = true;
        this.advance();
      }
      if (this.match("punct", "[")) {
        return this.finishMappedType(mappedReadonly);
      }
      const members: IR.Ts_TypeMember[] = [];
      while (!this.match("punct", "}") && !this.match("eof")) {
        const m = this.parseInterfaceMember();
        if (m) members.push(m);
        if (!this.tryEat("punct", ";")) {
          this.tryEat("punct", ",");
        }
      }
      this.eat("punct", "}");
      return { kind: "Ts_TypeLit", members };
    }

    // Type reference
    if (t.kind === "ident") {
      return this.parseTypeRef();
    }

    throw new Error(`Unexpected token in type: ${t.kind} '${t.value}' at line ${t.line}`);
  }

  private finishMappedType(readonlyToken?: "+" | "-" | true): IR.Ts_TypeExpr {
    // we've already consumed `{` (and optional `!` for readonly), now expect `[`
    this.eat("punct", "[");
    const name = this.eat("ident").value;
    this.eat("ident", "in"); // "in" keyword
    const constraint = this.parseTypeExpr();
    this.eat("punct", "]");
    let optionalToken: "+" | "-" | true | undefined;
    if (this.match("punct", "?")) { this.advance(); optionalToken = true; }
    this.eat("punct", ":");
    const type = this.parseTypeExpr();
    this.eat("punct", "}");
    return {
      kind: "Ts_MappedType",
      typeParam: name,
      constraint,
      type,
      readonlyToken,
      optionalToken,
    };
  }

  private tryParseFnType(): IR.Ts_TypeExpr {
    // (params)->rt
    this.eat("punct", "(");
    const params: IR.Ts_Param[] = [];
    while (!this.match("punct", ")") && !this.match("eof")) {
      let rest = false;
      if (this.match("punct", "...")) { rest = true; this.advance(); }
      let name: string;
      if (this.match("ident")) {
        name = this.advance().value;
      } else {
        name = "_";
      }
      let optional = false;
      if (this.match("punct", "?")) { optional = true; this.advance(); }
      let type: IR.Ts_TypeExpr | undefined;
      if (this.tryEat("punct", ":")) type = this.parseTypeExpr();
      params.push({ name, type, optional, rest });
      if (!this.tryEat("punct", ",")) break;
    }
    this.eat("punct", ")");
    this.eat("punct", "->");
    const returnType = this.parseTypeExpr();
    return { kind: "Ts_FnType", params, returnType };
  }

  private parseTypeRef(): IR.Ts_TypeRef {
    let name = this.eat("ident").value;
    name = UTILITY_REVERSE[name] || name;
    while (this.match("punct", ".")) {
      this.advance();
      name += "." + this.eat("ident").value;
    }
    let typeArgs: IR.Ts_TypeExpr[] | undefined;
    if (this.match("punct", "<")) {
      typeArgs = this.parseTypeArgList();
    }
    return { kind: "Ts_TypeRef", name, typeArgs };
  }

  private parseTypeArgList(): IR.Ts_TypeExpr[] {
    this.eat("punct", "<");
    const args: IR.Ts_TypeExpr[] = [];
    while (!this.match("punct", ">") && !this.isClosingAngle() && !this.match("eof")) {
      args.push(this.parseTypeExpr());
      if (!this.tryEat("punct", ",")) break;
    }
    this.eatClosingAngle();
    return args;
  }

  // ---------------------- Statements ----------------------

  parseStmt(): IR.IRNode {
    const t = this.tok();

    if (t.kind === "punct" && t.value === "{") return this.parseBlockStmt();
    if (t.kind === "ident") {
      switch (t.value) {
        case "if": return this.parseIfStmt();
        case "for": return this.parseForStmt();
        case "while": return this.parseWhileStmt();
        case "do": return this.parseDoWhileStmt();
        case "switch": return this.parseSwitchStmt();
        case "try": return this.parseTryStmt();
        case "throw": {
          this.advance();
          const e = this.parseExpr();
          return { kind: "Ts_ThrowStmt", expr: e, stmtIndex: this.nextIdx() } as IR.Ts_ThrowStmt;
        }
        case "break": {
          this.advance();
          let label: string | undefined;
          if (this.match("ident")) label = this.advance().value;
          return { kind: "Ts_BreakStmt", label, stmtIndex: this.nextIdx() } as IR.Ts_BreakStmt;
        }
        case "continue": {
          this.advance();
          let label: string | undefined;
          if (this.match("ident")) label = this.advance().value;
          return { kind: "Ts_ContinueStmt", label, stmtIndex: this.nextIdx() } as IR.Ts_ContinueStmt;
        }
        case "let": case "var": {
          const kw = this.advance().value as "let" | "var";
          return this.parseVarStmt(kw, { isExported: false });
        }
      }
    }
    // ^ = return
    if (t.kind === "punct" && t.value === "^") {
      this.advance();
      if (this.match("punct", ";") || this.match("punct", "}") || this.match("eof")) {
        return { kind: "Ts_ReturnStmt", stmtIndex: this.nextIdx() } as IR.Ts_ReturnStmt;
      }
      const value = this.parseExpr();
      return { kind: "Ts_ReturnStmt", value, stmtIndex: this.nextIdx() } as IR.Ts_ReturnStmt;
    }
    // := = const decl
    if (t.kind === "punct" && t.value === ":=") {
      return this.parseVarStmt("const", { isExported: false });
    }
    // Fall back: expression statement
    const expr = this.parseExpr();
    return { kind: "Ts_ExprStmt", expr, stmtIndex: this.nextIdx() } as IR.Ts_ExprStmt;
  }

  private parseBlockStmt(): IR.Ts_BlockStmt {
    this.eat("punct", "{");
    const stmts: IR.IRNode[] = [];
    while (!this.match("punct", "}") && !this.match("eof")) {
      this.skipSemis();
      if (this.match("punct", "}")) break;
      stmts.push(this.parseStmt());
      this.skipSemis();
    }
    this.eat("punct", "}");
    return { kind: "Ts_BlockStmt", stmts };
  }

  private parseIfStmt(): IR.Ts_IfStmt {
    this.eat("ident", "if");
    const cond = this.parseExpr();
    const thenStmt = this.parseBlockStmt();
    let elseStmt: IR.IRNode | undefined;
    if (this.tryEat("ident", "else")) {
      if (this.match("ident", "if")) {
        elseStmt = this.parseIfStmt();
      } else {
        elseStmt = this.parseBlockStmt();
      }
    }
    return {
      kind: "Ts_IfStmt",
      cond,
      then: thenStmt,
      else_: elseStmt,
      stmtIndex: this.nextIdx(),
    };
  }

  private parseForStmt(): IR.IRNode {
    this.eat("ident", "for");

    // Range-for shortcut: `for IDENT:=start..end{...}` or `for IDENT:=start..=end{...}`.
    // Detected before general init parsing; falls through if the pattern doesn't match.
    if (this.match("ident") && this.peek(1).kind === "punct" && this.peek(1).value === ":=") {
      const savePos = this.pos;
      const loopVar = this.advance().value;
      this.advance(); // consume :=
      const start = this.parseRangeBoundExpr();
      if (this.match("punct", "..") || this.match("punct", "..=")) {
        const op = this.advance().value;
        const end = this.parseExpr();
        const body = this.parseBlockStmt();
        const initVar: IR.Ts_VarStmt = {
          kind: "Ts_VarStmt",
          keyword: "let",
          declarations: [{ binding: { kind: "Ident", name: loopVar } as IR.IRIdent, value: start }],
          isExported: false,
          stmtIndex: this.nextIdx(),
        };
        const cmpOp = op === "..=" ? "<=" : "<";
        const cond: IR.IRBinaryExpr = {
          kind: "BinaryExpr",
          left: { kind: "Ident", name: loopVar } as IR.IRIdent,
          op: cmpOp,
          right: end,
        };
        const update: IR.IRUnaryExpr = {
          kind: "UnaryExpr",
          op: "++_post",
          x: { kind: "Ident", name: loopVar } as IR.IRIdent,
        };
        return {
          kind: "Ts_ForStmt",
          init: initVar,
          cond,
          update,
          body,
          stmtIndex: this.nextIdx(),
        } as IR.Ts_ForStmt;
      }
      this.pos = savePos;
    }

    // for await a of b  |  for a of b  |  for a in b  |  for init;cond;upd
    let isAwait = false;
    if (this.match("ident", "a") && this.peek(1).kind === "ident") {
      this.advance();
      isAwait = true;
    }
    // Try to read init, then check for 'of' or 'in'
    let init: IR.IRNode | IR.IRExpr;
    if (this.match("punct", ":=")) {
      this.advance();
      const name = this.eat("ident").value;
      init = {
        kind: "Ts_VarStmt",
        keyword: "const",
        declarations: [{ binding: { kind: "Ident", name } as IR.IRIdent }],
        isExported: false,
        stmtIndex: this.nextIdx(),
      } as IR.Ts_VarStmt;
    } else if (this.match("ident", "let") || this.match("ident", "var")) {
      const kw = this.advance().value as "let" | "var";
      const name = this.eat("ident").value;
      init = {
        kind: "Ts_VarStmt",
        keyword: kw,
        declarations: [{ binding: { kind: "Ident", name } as IR.IRIdent }],
        isExported: false,
        stmtIndex: this.nextIdx(),
      } as IR.Ts_VarStmt;
    } else {
      init = this.parseExpr();
    }

    if (this.match("ident", "of") || this.match("ident", "in")) {
      const kind = this.advance().value;
      const iter = this.parseExpr();
      const body = this.parseBlockStmt();
      if (kind === "of") {
        return { kind: "Ts_ForOfStmt", init, iter, body, isAwait, stmtIndex: this.nextIdx() } as IR.Ts_ForOfStmt;
      }
      return { kind: "Ts_ForInStmt", init, iter, body, stmtIndex: this.nextIdx() } as IR.Ts_ForInStmt;
    }

    // C-style for
    if ((init as any).kind === "Ts_VarStmt") {
      const v = init as IR.Ts_VarStmt;
      if (this.tryEat("punct", "=")) {
        v.declarations[0].value = this.parseExpr();
      }
      v.keyword = "let";
    }
    this.eat("punct", ";");
    let cond: IR.IRExpr | undefined;
    if (!this.match("punct", ";")) cond = this.parseExpr();
    this.eat("punct", ";");
    let update: IR.IRExpr | undefined;
    if (!this.match("punct", "{")) update = this.parseExpr();
    const body = this.parseBlockStmt();
    return {
      kind: "Ts_ForStmt",
      init,
      cond,
      update,
      body,
      stmtIndex: this.nextIdx(),
    } as IR.Ts_ForStmt;
  }

  // Parse a range-bound expression: stops at `..` or `..=` without consuming them.
  private parseRangeBoundExpr(): IR.IRExpr {
    return this.parseLogicalOr();
  }

  private parseWhileStmt(): IR.Ts_WhileStmt {
    this.eat("ident", "while");
    const cond = this.parseExpr();
    const body = this.parseBlockStmt();
    return { kind: "Ts_WhileStmt", cond, body, stmtIndex: this.nextIdx() };
  }

  private parseDoWhileStmt(): IR.Ts_DoWhileStmt {
    this.eat("ident", "do");
    const body = this.parseBlockStmt();
    this.eat("ident", "while");
    const cond = this.parseExpr();
    return { kind: "Ts_DoWhileStmt", cond, body, stmtIndex: this.nextIdx() };
  }

  private parseSwitchStmt(): IR.Ts_SwitchStmt {
    this.eat("ident", "switch");
    const tag = this.parseExpr();
    this.eat("punct", "{");
    const cases: IR.Ts_SwitchCase[] = [];
    while (!this.match("punct", "}") && !this.match("eof")) {
      let value: IR.IRExpr | undefined;
      if (this.tryEat("ident", "case")) {
        value = this.parseExpr();
      } else if (this.tryEat("punct", "_")) {
        value = undefined;
      } else {
        break;
      }
      this.eat("punct", ":");
      const body: IR.IRNode[] = [];
      while (!this.match("ident", "case") && !this.match("punct", "_") && !this.match("punct", "}") && !this.match("eof")) {
        this.skipSemis();
        if (this.match("ident", "case") || this.match("punct", "_") || this.match("punct", "}")) break;
        body.push(this.parseStmt());
        this.skipSemis();
      }
      cases.push({ value, body });
    }
    this.eat("punct", "}");
    return { kind: "Ts_SwitchStmt", tag, cases, stmtIndex: this.nextIdx() };
  }

  private parseTryStmt(): IR.Ts_TryStmt {
    this.eat("ident", "try");
    const tryBody = this.parseBlockStmt();
    let catchParam: { name: string; type?: IR.Ts_TypeExpr } | undefined;
    let catchBody: IR.Ts_BlockStmt | undefined;
    let finallyBody: IR.Ts_BlockStmt | undefined;
    if (this.tryEat("ident", "catch")) {
      if (this.match("ident")) {
        const name = this.advance().value;
        let type: IR.Ts_TypeExpr | undefined;
        if (this.tryEat("punct", ":")) type = this.parseTypeExpr();
        catchParam = { name, type };
      }
      catchBody = this.parseBlockStmt();
    }
    if (this.tryEat("ident", "finally")) {
      finallyBody = this.parseBlockStmt();
    }
    return {
      kind: "Ts_TryStmt",
      tryBody,
      catchParam,
      catchBody,
      finallyBody,
      stmtIndex: this.nextIdx(),
    };
  }

  // ---------------------- Expressions ----------------------

  parseExpr(): IR.IRExpr {
    return this.parseAssignExpr();
  }

  private parseAssignExpr(): IR.IRExpr {
    // Lambda / arrow: check (params)=>body
    if (this.isArrowStart()) return this.parseArrowFn();

    const left = this.parseTernaryExpr();
    if (this.match("punct", "=") || this.match("punct", "+=") || this.match("punct", "-=")
      || this.match("punct", "*=") || this.match("punct", "/=") || this.match("punct", "%=")
      || this.match("punct", "**=") || this.match("punct", "&=") || this.match("punct", "|=")
      || this.match("punct", "^=") || this.match("punct", "<<=") || this.match("punct", ">>=")
      || this.match("punct", "&&=") || this.match("punct", "||=") || this.match("punct", "??=")) {
      const op = this.advance().value;
      const right = this.parseAssignExpr();
      return { kind: "BinaryExpr", left, op, right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private isArrowStart(): boolean {
    // (x,y)=>... OR (x:T,y:T)=>... OR x=>...
    // Also: a (x)=>... for async
    let p = 0;
    if (this.peek(p).kind === "ident" && this.peek(p).value === "a" && this.peek(p + 1).kind === "punct" && this.peek(p + 1).value === "(") {
      p = 1;
    }
    if (this.peek(p).kind === "punct" && this.peek(p).value === "(") {
      // find matching ) and check for =>
      let depth = 1;
      let q = p + 1;
      while (q < 2000) {
        const c = this.peek(q);
        if (c.kind === "eof") return false;
        if (c.kind === "punct" && c.value === "(") depth++;
        else if (c.kind === "punct" && c.value === ")") { depth--; if (depth === 0) { q++; break; } }
        q++;
      }
      // Skip return type annotation if present: ->T
      if (this.peek(q).kind === "punct" && this.peek(q).value === "->") {
        q++;
        while (q < 2000) {
          const c = this.peek(q);
          if (c.kind === "eof") return false;
          if (c.kind === "punct" && c.value === "=>") return true;
          if (c.kind === "punct" && (c.value === ";" || c.value === "," || c.value === ")" || c.value === "}")) return false;
          q++;
        }
      }
      return this.peek(q).kind === "punct" && this.peek(q).value === "=>";
    }
    // single ident => body
    if (this.peek(0).kind === "ident" && this.peek(1).kind === "punct" && this.peek(1).value === "=>") return true;
    return false;
  }

  private parseArrowFn(): IR.IRExpr {
    let isAsync = false;
    if (this.match("ident", "a") && this.peek(1).kind === "punct" && this.peek(1).value === "(") {
      this.advance();
      isAsync = true;
    }
    let params: IR.Ts_Param[];
    if (this.match("punct", "(")) {
      params = this.parseTsParamList();
    } else {
      const name = this.eat("ident").value;
      params = [{ name }];
    }
    let returnType: IR.Ts_TypeExpr | undefined;
    if (this.tryEat("punct", "->")) returnType = this.parseTypeExpr();
    this.eat("punct", "=>");
    let body: IR.IRExpr | IR.Ts_BlockStmt;
    if (this.match("punct", "{")) {
      body = this.parseBlockStmt();
    } else {
      body = this.parseAssignExpr();
    }
    return {
      kind: "Ts_ArrowFn",
      params,
      returnType,
      body,
      isAsync,
    } as IR.Ts_ArrowFn;
  }

  private parseTernaryExpr(): IR.IRExpr {
    const cond = this.parseLogicalOr();
    if (this.match("punct", "?")) {
      // but not ?. (optional chain)
      const next = this.peek(1);
      if (next.kind === "punct" && next.value === ".") return cond;
      this.advance();
      const then = this.parseAssignExpr();
      this.eat("punct", ":");
      const else_ = this.parseAssignExpr();
      return { kind: "Ts_ConditionalExpr", cond, then, else_ } as IR.Ts_ConditionalExpr;
    }
    return cond;
  }

  private parseLogicalOr(): IR.IRExpr {
    let left = this.parseNullishCoal();
    while (this.match("punct", "||")) {
      this.advance();
      const right = this.parseNullishCoal();
      left = { kind: "BinaryExpr", left, op: "||", right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseNullishCoal(): IR.IRExpr {
    let left = this.parseLogicalAnd();
    while (this.match("punct", "??")) {
      this.advance();
      const right = this.parseLogicalAnd();
      left = { kind: "BinaryExpr", left, op: "??", right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseLogicalAnd(): IR.IRExpr {
    let left = this.parseBitOr();
    while (this.match("punct", "&&")) {
      this.advance();
      const right = this.parseBitOr();
      left = { kind: "BinaryExpr", left, op: "&&", right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseBitOr(): IR.IRExpr {
    let left = this.parseBitXor();
    while (this.match("punct", "|")) {
      this.advance();
      const right = this.parseBitXor();
      left = { kind: "BinaryExpr", left, op: "|", right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseBitXor(): IR.IRExpr {
    let left = this.parseBitAnd();
    while (this.match("punct", "^") && !this.isAtReturnCtx()) {
      this.advance();
      const right = this.parseBitAnd();
      left = { kind: "BinaryExpr", left, op: "^", right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private isAtReturnCtx(): boolean {
    return false; // ^ is handled at stmt level
  }

  private parseBitAnd(): IR.IRExpr {
    let left = this.parseEquality();
    while (this.match("punct", "&")) {
      this.advance();
      const right = this.parseEquality();
      left = { kind: "BinaryExpr", left, op: "&", right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseEquality(): IR.IRExpr {
    let left = this.parseComparison();
    while (this.match("punct", "==") || this.match("punct", "!=") || this.match("punct", "===") || this.match("punct", "!==")) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { kind: "BinaryExpr", left, op, right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseComparison(): IR.IRExpr {
    let left = this.parseShift();
    while (this.match("punct", "<") || this.match("punct", ">") || this.match("punct", "<=") || this.match("punct", ">=")
      || this.match("ident", "in") || this.match("ident", "is") || this.match("ident", "as")) {
      const t = this.tok();
      if (t.value === "as") {
        this.advance();
        // as const
        if (this.match("ident", "ac") || this.match("ident", "const")) {
          this.advance();
          left = { kind: "Ts_AsExpr", expr: left, type: { kind: "Ts_TypeRef", name: "const" }, asConst: true } as IR.Ts_AsExpr;
          continue;
        }
        const type = this.parseTypeExpr();
        left = { kind: "Ts_AsExpr", expr: left, type } as IR.Ts_AsExpr;
        continue;
      }
      if (t.value === "is") {
        // x is Type — type predicate; unlikely outside function return type
        this.advance();
        const type = this.parseTypeExpr();
        left = {
          kind: "Ts_TypePredicateExpr",
          paramName: (left as IR.IRIdent).name || "_",
          type,
        } as IR.Ts_TypePredicateExpr as any;
        continue;
      }
      const op = this.advance().value;
      const right = this.parseShift();
      left = { kind: "BinaryExpr", left, op, right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseShift(): IR.IRExpr {
    let left = this.parseAdditive();
    while (this.match("punct", "<<") || this.match("punct", ">>") || this.match("punct", ">>>")) {
      const op = this.advance().value;
      const right = this.parseAdditive();
      left = { kind: "BinaryExpr", left, op, right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseAdditive(): IR.IRExpr {
    let left = this.parseMultiplicative();
    while (this.match("punct", "+") || this.match("punct", "-")) {
      // Ignore '+' that might be part of modifier — but at expression level + is addition
      const op = this.advance().value;
      const right = this.parseMultiplicative();
      left = { kind: "BinaryExpr", left, op, right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseMultiplicative(): IR.IRExpr {
    let left = this.parseExponent();
    while (this.match("punct", "*") || this.match("punct", "/") || this.match("punct", "%")) {
      const op = this.advance().value;
      const right = this.parseExponent();
      left = { kind: "BinaryExpr", left, op, right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseExponent(): IR.IRExpr {
    const left = this.parseUnary();
    if (this.match("punct", "**")) {
      this.advance();
      const right = this.parseExponent();
      return { kind: "BinaryExpr", left, op: "**", right } as IR.IRBinaryExpr;
    }
    return left;
  }

  private parseUnary(): IR.IRExpr {
    const t = this.tok();
    // w x = await x
    if (t.kind === "ident" && t.value === "w" && !(this.peek(1).kind === "punct" && (this.peek(1).value === "=" || this.peek(1).value === "," || this.peek(1).value === ")" || this.peek(1).value === "}" || this.peek(1).value === ";"))) {
      this.advance();
      const e = this.parseUnary();
      return { kind: "Ts_AwaitExpr", expr: e } as IR.Ts_AwaitExpr;
    }
    if (t.kind === "ident" && t.value === "await") {
      this.advance();
      const e = this.parseUnary();
      return { kind: "Ts_AwaitExpr", expr: e } as IR.Ts_AwaitExpr;
    }
    if (t.kind === "ident" && t.value === "typeof") {
      this.advance();
      const e = this.parseUnary();
      return { kind: "UnaryExpr", op: "typeof ", x: e } as IR.IRUnaryExpr;
    }
    if (t.kind === "ident" && t.value === "void") {
      this.advance();
      const e = this.parseUnary();
      return { kind: "UnaryExpr", op: "void ", x: e } as IR.IRUnaryExpr;
    }
    if (t.kind === "ident" && t.value === "new") {
      this.advance();
      const callee = this.parsePrimaryExpr();
      let args: IR.IRExpr[] = [];
      if (this.tryEat("punct", "(")) {
        while (!this.match("punct", ")") && !this.match("eof")) {
          args.push(this.parseAssignExpr());
          if (!this.tryEat("punct", ",")) break;
        }
        this.eat("punct", ")");
      }
      // Continue with postfix (property access, method calls) on the new expression.
      return this.continuePostfix({ kind: "Ts_NewExpr", callee, args } as IR.Ts_NewExpr);
    }
    if (t.kind === "ident" && t.value === "yield") {
      this.advance();
      let delegate = false;
      if (this.match("punct", "*")) { this.advance(); delegate = true; }
      let expr: IR.IRExpr | undefined;
      if (!this.match("punct", ";") && !this.match("punct", ",") && !this.match("punct", ")") && !this.match("punct", "}")) {
        expr = this.parseAssignExpr();
      }
      return { kind: "Ts_YieldExpr", expr, delegate } as IR.Ts_YieldExpr;
    }
    if (t.kind === "punct" && (t.value === "!" || t.value === "-" || t.value === "+" || t.value === "~")) {
      const op = this.advance().value;
      const e = this.parseUnary();
      return { kind: "UnaryExpr", op, x: e } as IR.IRUnaryExpr;
    }
    if (t.kind === "punct" && (t.value === "++" || t.value === "--")) {
      const op = this.advance().value;
      const e = this.parseUnary();
      return { kind: "UnaryExpr", op, x: e } as IR.IRUnaryExpr;
    }
    if (t.kind === "punct" && t.value === "...") {
      this.advance();
      const e = this.parseUnary();
      return { kind: "Ts_SpreadExpr", expr: e } as IR.Ts_SpreadExpr;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): IR.IRExpr {
    const expr = this.parsePrimaryExpr();
    return this.continuePostfix(expr);
  }

  private continuePostfix(start: IR.IRExpr): IR.IRExpr {
    let expr = start;
    while (true) {
      if (this.match("punct", "!")) {
        // non-null assertion, but only if not followed by expression start
        const n = this.peek(1);
        if (n.kind === "punct" && (n.value === ";" || n.value === "," || n.value === ")" || n.value === "}" || n.value === "]" || n.value === "." || n.value === "?." || n.value === "(" || n.value === "[" || n.value === "<")) {
          this.advance();
          expr = { kind: "Ts_NonNullExpr", expr } as IR.Ts_NonNullExpr;
          continue;
        }
      }
      if (this.match("punct", "?.")) {
        this.advance();
        if (this.match("punct", "(")) {
          // optional call
          this.advance();
          const args: IR.IRExpr[] = [];
          while (!this.match("punct", ")") && !this.match("eof")) {
            args.push(this.parseAssignExpr());
            if (!this.tryEat("punct", ",")) break;
          }
          this.eat("punct", ")");
          expr = { kind: "CallExpr", func: expr, args } as IR.IRCallExpr;
          continue;
        }
        if (this.match("punct", "[")) {
          this.advance();
          const idx = this.parseExpr();
          this.eat("punct", "]");
          expr = { kind: "IndexExpr", x: expr, index: idx } as IR.IRIndexExpr;
          continue;
        }
        const name = this.eat("ident").value;
        expr = { kind: "SelectorExpr", x: expr, sel: name } as IR.IRSelectorExpr;
        continue;
      }
      if (this.match("punct", ".")) {
        this.advance();
        const name = this.eat("ident").value;
        expr = { kind: "SelectorExpr", x: expr, sel: name } as IR.IRSelectorExpr;
        continue;
      }
      if (this.match("punct", "[")) {
        this.advance();
        const idx = this.parseExpr();
        this.eat("punct", "]");
        expr = { kind: "IndexExpr", x: expr, index: idx } as IR.IRIndexExpr;
        continue;
      }
      if (this.match("punct", "(")) {
        this.advance();
        const args: IR.IRExpr[] = [];
        while (!this.match("punct", ")") && !this.match("eof")) {
          args.push(this.parseAssignExpr());
          if (!this.tryEat("punct", ",")) break;
        }
        this.eat("punct", ")");
        expr = { kind: "CallExpr", func: expr, args } as IR.IRCallExpr;
        continue;
      }
      if (this.match("punct", "++") || this.match("punct", "--")) {
        const op = this.advance().value;
        expr = { kind: "UnaryExpr", op: op + "_post", x: expr } as IR.IRUnaryExpr;
        continue;
      }
      break;
    }
    return expr;
  }

  private parsePrimaryExpr(): IR.IRExpr {
    const t = this.tok();

    // Leading dot: .x inside class → this.x
    if (t.kind === "punct" && t.value ===".") {
      if (this._insideClass && this.peek(1).kind === "ident") {
        this.advance();
        const name = this.eat("ident").value;
        return {
          kind: "SelectorExpr",
          x: { kind: "Ident", name: "this" } as IR.IRIdent,
          sel: name,
        } as IR.IRSelectorExpr;
      }
    }

    if (t.kind === "ident") {
      if (t.value === "true" || t.value === "false") {
        this.advance();
        return { kind: "Ident", name: t.value } as IR.IRIdent;
      }
      if (t.value === "null" || t.value === "undefined") {
        this.advance();
        return { kind: "Ident", name: t.value } as IR.IRIdent;
      }
      if (t.value === "this") {
        this.advance();
        return { kind: "Ident", name: "this" } as IR.IRIdent;
      }
      if (t.value === "super") {
        this.advance();
        return { kind: "Ident", name: "super" } as IR.IRIdent;
      }
      this.advance();
      return { kind: "Ident", name: t.value } as IR.IRIdent;
    }

    if (t.kind === "num") {
      this.advance();
      return { kind: "BasicLit", type: t.value.includes(".") ? "FLOAT" : "INT", value: t.value } as IR.IRBasicLit;
    }

    if (t.kind === "str") {
      this.advance();
      return { kind: "BasicLit", type: "STRING", value: t.value } as IR.IRBasicLit;
    }

    if (t.kind === "tmpl") {
      this.advance();
      return parseTemplateLiteral(t.value);
    }

    if (t.kind === "regex") {
      this.advance();
      // Parse /pattern/flags
      const raw = t.value;
      const lastSlash = raw.lastIndexOf("/");
      const pattern = raw.substring(1, lastSlash);
      const flags = raw.substring(lastSlash + 1);
      return { kind: "Ts_RegexLit", pattern, flags } as IR.Ts_RegexLit;
    }

    if (t.kind === "punct" && t.value === "(") {
      this.advance();
      const inner = this.parseExpr();
      this.eat("punct", ")");
      return { kind: "ParenExpr", x: inner } as IR.IRParenExpr;
    }

    if (t.kind === "punct" && t.value === "[") {
      this.advance();
      const elements: (IR.IRExpr | null)[] = [];
      while (!this.match("punct", "]") && !this.match("eof")) {
        if (this.match("punct", ",")) {
          elements.push(null);
          this.advance();
          continue;
        }
        elements.push(this.parseAssignExpr());
        if (!this.tryEat("punct", ",")) break;
      }
      this.eat("punct", "]");
      return { kind: "Ts_ArrayLit", elements } as IR.Ts_ArrayLit;
    }

    if (t.kind === "punct" && t.value === "{") {
      return this.parseObjectLit();
    }

    if (t.kind === "punct" && t.value === "<") {
      // JSX element (if tsx mode) OR type assertion
      if (this.isJsx) {
        return this.parseJsxElement();
      }
      // Type assertion <T>expr
      this.advance();
      const type = this.parseTypeExpr();
      this.eat("punct", ">");
      const expr = this.parseUnary();
      return { kind: "Ts_TypeAssertion", type, expr } as IR.Ts_TypeAssertion;
    }

    throw new Error(`Unexpected token in expression: ${t.kind} '${t.value}' at line ${t.line}`);
  }

  private parseObjectLit(): IR.Ts_ObjectLit {
    this.eat("punct", "{");
    const properties: IR.Ts_ObjectProperty[] = [];
    while (!this.match("punct", "}") && !this.match("eof")) {
      if (this.match("punct", "...")) {
        this.advance();
        const val = this.parseAssignExpr();
        properties.push({ kind: "spread", value: val });
      } else if (this.match("ident", "get") && this.peek(1).kind === "ident") {
        this.advance();
        const name = this.eat("ident").value;
        this.eat("punct", "(");
        this.eat("punct", ")");
        const body = this.parseBlockStmt();
        properties.push({ kind: "getter", name, body });
      } else if (this.match("ident", "set") && this.peek(1).kind === "ident") {
        this.advance();
        const name = this.eat("ident").value;
        this.eat("punct", "(");
        const p: IR.Ts_Param = { name: this.eat("ident").value };
        if (this.tryEat("punct", ":")) p.type = this.parseTypeExpr();
        this.eat("punct", ")");
        const body = this.parseBlockStmt();
        properties.push({ kind: "setter", name, param: p, body });
      } else {
        // computed key? [expr]
        let computed = false;
        let key: IR.IRExpr;
        if (this.match("punct", "[")) {
          this.advance();
          key = this.parseExpr();
          this.eat("punct", "]");
          computed = true;
        } else if (this.match("str")) {
          key = { kind: "BasicLit", type: "STRING", value: this.advance().value } as IR.IRBasicLit;
        } else if (this.match("num")) {
          key = { kind: "BasicLit", type: "INT", value: this.advance().value } as IR.IRBasicLit;
        } else {
          const name = this.eat("ident").value;
          key = { kind: "Ident", name } as IR.IRIdent;
        }
        if (this.match("punct", "(")) {
          // method
          const params = this.parseTsParamList();
          let returnType: IR.Ts_TypeExpr | undefined;
          if (this.tryEat("punct", "->")) returnType = this.parseTypeExpr();
          const body = this.parseBlockStmt();
          const name = (key as IR.IRIdent).name || (key as IR.IRBasicLit).value;
          properties.push({ kind: "method", name, params, returnType, body, isAsync: false, isGenerator: false });
        } else if (this.tryEat("punct", ":")) {
          const value = this.parseAssignExpr();
          properties.push({ kind: "property", key, value, computed, shorthand: false });
        } else {
          // shorthand
          properties.push({ kind: "property", key, value: key, computed: false, shorthand: true });
        }
      }
      if (!this.tryEat("punct", ",")) break;
    }
    this.eat("punct", "}");
    return { kind: "Ts_ObjectLit", properties };
  }

  // ---------------------- JSX ----------------------

  private parseJsxElement(): IR.IRExpr {
    this.eat("punct", "<");
    // Fragment
    if (this.match("punct", ">")) {
      this.advance();
      const children = this.parseJsxChildren();
      this.eat("punct", "<");
      this.eat("punct", "/");
      this.eat("punct", ">");
      return { kind: "Ts_JsxFragment", children } as IR.Ts_JsxFragment;
    }
    // Element
    const tagName = this.parseJsxTagName();
    const attributes = this.parseJsxAttributes();
    // Self-closing
    if (this.match("punct", "/")) {
      this.advance();
      this.eat("punct", ">");
      return {
        kind: "Ts_JsxSelfClose",
        tagName,
        attributes,
      } as IR.Ts_JsxSelfClose;
    }
    this.eat("punct", ">");
    const children = this.parseJsxChildren();
    // Closing tag: </tagName>
    this.eat("punct", "<");
    this.eat("punct", "/");
    // consume closing tag name (may be dotted)
    this.parseJsxTagName();
    this.eat("punct", ">");
    return {
      kind: "Ts_JsxElement",
      tagName,
      attributes,
      children,
      selfClosing: false,
    } as IR.Ts_JsxElement;
  }

  private parseJsxTagName(): string {
    let name = this.eat("ident").value;
    while (this.match("punct", ".")) {
      this.advance();
      name += "." + this.eat("ident").value;
    }
    return name;
  }

  private parseJsxAttributes(): IR.Ts_JsxAttribute[] {
    const attrs: IR.Ts_JsxAttribute[] = [];
    while (true) {
      if (this.match("punct", "/") || this.match("punct", ">")) break;
      if (this.match("punct", "{")) {
        // spread
        this.advance();
        this.eat("punct", "...");
        const expr = this.parseExpr();
        this.eat("punct", "}");
        attrs.push({ name: "", value: expr, spread: true });
        continue;
      }
      if (!this.match("ident")) break;
      const name = this.advance().value;
      let value: IR.IRExpr | undefined;
      if (this.match("punct", "=")) {
        this.advance();
        if (this.match("str")) {
          const s = this.advance().value;
          value = { kind: "BasicLit", type: "STRING", value: s.substring(1, s.length - 1) } as IR.IRBasicLit;
        } else if (this.match("punct", "{")) {
          this.advance();
          value = this.parseExpr();
          this.eat("punct", "}");
        }
      }
      attrs.push({ name, value });
    }
    return attrs;
  }

  private parseJsxChildren(): IR.IRExpr[] {
    const children: IR.IRExpr[] = [];
    while (true) {
      // Check for </ (closing)
      if (this.match("punct", "<")) {
        const next = this.peek(1);
        if (next.kind === "punct" && next.value === "/") return children;
        children.push(this.parseJsxElement());
        continue;
      }
      if (this.match("punct", "{")) {
        this.advance();
        if (this.match("punct", "}")) {
          this.advance();
          children.push({ kind: "Ts_JsxExpression", expr: { kind: "Ident", name: "" } } as IR.Ts_JsxExpression);
          continue;
        }
        const expr = this.parseExpr();
        this.eat("punct", "}");
        children.push({ kind: "Ts_JsxExpression", expr } as IR.Ts_JsxExpression);
        continue;
      }
      // JSX text — accumulate ident/num/whitespace until < or {
      if (this.match("ident") || this.match("num") || this.match("str")) {
        const text = this.advance().value;
        children.push({ kind: "Ts_JsxText", text } as IR.Ts_JsxText);
        continue;
      }
      break;
    }
    return children;
  }
}

// ---------------------------------------------------------------------------
// Template literal parsing (convert raw `...${expr}...` text to Ts_TemplateLit)
// ---------------------------------------------------------------------------

function parseTemplateLiteral(raw: string): IR.Ts_TemplateLit {
  // raw starts and ends with `
  const body = raw.substring(1, raw.length - 1);
  const parts: (string | IR.IRExpr)[] = [];
  let current = "";
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) {
      current += body.substring(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "$" && body[i + 1] === "{") {
      parts.push(current);
      current = "";
      i += 2;
      let depth = 1;
      let exprText = "";
      while (i < body.length && depth > 0) {
        const ch = body[i];
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) break; }
        exprText += ch;
        i++;
      }
      i++; // consume closing }
      // Parse exprText as expression
      const sub = parseTypescriptAET("!ts-v1\n" + exprText);
      if (sub.ir && sub.ir.decls.length > 0) {
        const d = sub.ir.decls[0];
        if ((d as any).kind === "Ts_ExprStmt") {
          parts.push((d as IR.Ts_ExprStmt).expr);
        } else {
          parts.push({ kind: "Ident", name: exprText } as IR.IRIdent);
        }
      } else {
        parts.push({ kind: "Ident", name: exprText } as IR.IRIdent);
      }
      continue;
    }
    current += c;
    i++;
  }
  parts.push(current);
  return { kind: "Ts_TemplateLit", parts };
}
