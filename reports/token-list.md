# Token Analysis Report (cl100k_base)

Reference for designing programming language syntax with minimal token cost.

Generated: 2026-04-07T12:45:36.794Z

## Single-Token ASCII Characters

95 of 95 printable ASCII characters encode as a single token.

| Char | Code | Token ID |
|------|------|----------|
| ` ` | 32 | 220 |
| `!` | 33 | 0 |
| `"` | 34 | 1 |
| `#` | 35 | 2 |
| `$` | 36 | 3 |
| `%` | 37 | 4 |
| `&` | 38 | 5 |
| `'` | 39 | 6 |
| `(` | 40 | 7 |
| `)` | 41 | 8 |
| `*` | 42 | 9 |
| `+` | 43 | 10 |
| `,` | 44 | 11 |
| `-` | 45 | 12 |
| `.` | 46 | 13 |
| `/` | 47 | 14 |
| `0` | 48 | 15 |
| `1` | 49 | 16 |
| `2` | 50 | 17 |
| `3` | 51 | 18 |
| `4` | 52 | 19 |
| `5` | 53 | 20 |
| `6` | 54 | 21 |
| `7` | 55 | 22 |
| `8` | 56 | 23 |
| `9` | 57 | 24 |
| `:` | 58 | 25 |
| `;` | 59 | 26 |
| `<` | 60 | 27 |
| `=` | 61 | 28 |
| `>` | 62 | 29 |
| `?` | 63 | 30 |
| `@` | 64 | 31 |
| `A` | 65 | 32 |
| `B` | 66 | 33 |
| `C` | 67 | 34 |
| `D` | 68 | 35 |
| `E` | 69 | 36 |
| `F` | 70 | 37 |
| `G` | 71 | 38 |
| `H` | 72 | 39 |
| `I` | 73 | 40 |
| `J` | 74 | 41 |
| `K` | 75 | 42 |
| `L` | 76 | 43 |
| `M` | 77 | 44 |
| `N` | 78 | 45 |
| `O` | 79 | 46 |
| `P` | 80 | 47 |
| `Q` | 81 | 48 |
| `R` | 82 | 49 |
| `S` | 83 | 50 |
| `T` | 84 | 51 |
| `U` | 85 | 52 |
| `V` | 86 | 53 |
| `W` | 87 | 54 |
| `X` | 88 | 55 |
| `Y` | 89 | 56 |
| `Z` | 90 | 57 |
| `[` | 91 | 58 |
| `\` | 92 | 59 |
| `]` | 93 | 60 |
| `^` | 94 | 61 |
| `_` | 95 | 62 |
| ``` | 96 | 63 |
| `a` | 97 | 64 |
| `b` | 98 | 65 |
| `c` | 99 | 66 |
| `d` | 100 | 67 |
| `e` | 101 | 68 |
| `f` | 102 | 69 |
| `g` | 103 | 70 |
| `h` | 104 | 71 |
| `i` | 105 | 72 |
| `j` | 106 | 73 |
| `k` | 107 | 74 |
| `l` | 108 | 75 |
| `m` | 109 | 76 |
| `n` | 110 | 77 |
| `o` | 111 | 78 |
| `p` | 112 | 79 |
| `q` | 113 | 80 |
| `r` | 114 | 81 |
| `s` | 115 | 82 |
| `t` | 116 | 83 |
| `u` | 117 | 84 |
| `v` | 118 | 85 |
| `w` | 119 | 86 |
| `x` | 120 | 87 |
| `y` | 121 | 88 |
| `z` | 122 | 89 |
| `{` | 123 | 90 |
| `\|` | 124 | 91 |
| `}` | 125 | 92 |
| `~` | 126 | 93 |

## Multi-Token ASCII Characters

All printable ASCII characters encode as single tokens.

## Single-Token Symbol Combinations

100 of 116 tested combinations encode as a single token.

| Combo | Token ID |
|-------|----------|
| `:=` | 14543 |
| `!=` | 5947 |
| `==` | 419 |
| `>=` | 10123 |
| `<=` | 8367 |
| `=>` | 2228 |
| `->` | 405 |
| `<-` | 46442 |
| `..` | 497 |
| `::` | 487 |
| `//` | 322 |
| `/*` | 1075 |
| `*/` | 1850 |
| `&&` | 7827 |
| `||` | 8651 |
| `++` | 1044 |
| `--` | 313 |
| `>>` | 2511 |
| `<<` | 2501 |
| `+=` | 8664 |
| `-=` | 34715 |
| `*=` | 41108 |
| `/=` | 67495 |
| `%=` | 36305 |
| `|=` | 88903 |
| `#{` | 12297 |
| `$(` | 8693 |
| `${` | 2420 |
| `@@` | 19741 |
| `?.` | 4710 |
| `?:` | 4925 |
| `??` | 7801 |
| `!!` | 3001 |
| `...` | 1131 |
| `==>` | 85753 |
| `///` | 2640 |
| `/**` | 3747 |
| `()` | 368 |
| `[]` | 1318 |
| `{}` | 6390 |
| `<>` | 21806 |
| `.*` | 5013 |
| `::` | 487 |
| `\n` | 1734 |
| `\t` | 5061 |
| `\\` | 3505 |
| `fn` | 8998 |
| `if` | 333 |
| `do` | 3055 |
| `or` | 269 |
| `in` | 258 |
| `is` | 285 |
| `as` | 300 |
| `at` | 266 |
| `go` | 3427 |
| `to` | 998 |
| `ok` | 564 |
| `eq` | 11251 |
| `ne` | 818 |
| `lt` | 4937 |
| `gt` | 5289 |
| `le` | 273 |
| `ge` | 713 |
| `def` | 755 |
| `let` | 1169 |
| `var` | 959 |
| `val` | 838 |
| `nil` | 8551 |
| `mut` | 7129 |
| `pub` | 9780 |
| `use` | 817 |
| `int` | 396 |
| `str` | 496 |
| `err` | 618 |
| `buf` | 6034 |
| `ptr` | 3589 |
| `ref` | 1116 |
| `ret` | 2171 |
| `end` | 408 |
| `for` | 2000 |
| `not` | 1962 |
| `and` | 438 |
| `any` | 3852 |
| `all` | 543 |
| `new` | 943 |
| `del` | 9783 |
| `try` | 1568 |
| `get` | 456 |
| `set` | 751 |
| `has` | 4752 |
| `len` | 2963 |
| `cap` | 11600 |
| `max` | 2880 |
| `min` | 1083 |
| `add` | 723 |
| `sub` | 2008 |
| `mul` | 25133 |
| `div` | 614 |
| `mod` | 2658 |
| `xor` | 72411 |

### Multi-Token Combinations (for comparison)

| Combo | Tokens | Token IDs |
|-------|--------|-----------|
| `&=` | 2 | 5, 28 |
| `^=` | 2 | 61, 28 |
| `<<=` | 2 | 2501, 28 |
| `>>=` | 2 | 2511, 28 |
| `&&=` | 2 | 7827, 28 |
| `||=` | 2 | 8651, 28 |
| `@{` | 2 | 31, 90 |
| `~>` | 2 | 93, 29 |
| `|>` | 2 | 91, 29 |
| `<|` | 2 | 27, 91 |
| `<<-` | 2 | 2501, 12 |
| `**/` | 2 | 334, 14 |
| `->*` | 2 | 405, 9 |
| `0x` | 2 | 15, 87 |
| `0b` | 2 | 15, 65 |
| `0o` | 2 | 15, 78 |

## Go Keywords Token Cost

### Keywords

| Keyword | Tokens | Token IDs |
|---------|--------|-----------|
| `break` | 1 | 9137 |
| `case` | 1 | 5756 |
| `chan` | 1 | 5776 |
| `const` | 1 | 1040 |
| `continue` | 1 | 9726 |
| `default` | 1 | 2309 |
| `defer` | 1 | 63195 |
| `else` | 1 | 1531 |
| `fallthrough` | 2 | 13772, 20322 |
| `for` | 1 | 2000 |
| `func` | 1 | 2900 |
| `go` | 1 | 3427 |
| `goto` | 1 | 29635 |
| `if` | 1 | 333 |
| `import` | 1 | 475 |
| `interface` | 1 | 5077 |
| `map` | 1 | 2235 |
| `package` | 1 | 1757 |
| `range` | 1 | 9866 |
| `return` | 1 | 693 |
| `select` | 1 | 1779 |
| `struct` | 1 | 1257 |
| `switch` | 1 | 17790 |
| `type` | 1 | 1337 |
| `var` | 1 | 959 |

### Built-in Functions and Types

| Identifier | Tokens | Token IDs |
|------------|--------|-----------|
| `append` | 1 | 5200 |
| `cap` | 1 | 11600 |
| `close` | 1 | 5669 |
| `complex` | 1 | 24126 |
| `copy` | 1 | 8728 |
| `delete` | 1 | 4644 |
| `imag` | 1 | 29116 |
| `len` | 1 | 2963 |
| `make` | 1 | 7072 |
| `new` | 1 | 943 |
| `panic` | 1 | 19621 |
| `print` | 1 | 1374 |
| `println` | 1 | 34755 |
| `real` | 1 | 8110 |
| `recover` | 1 | 75383 |
| `bool` | 1 | 2707 |
| `byte` | 1 | 3867 |
| `complex64` | 2 | 24126, 1227 |
| `complex128` | 2 | 24126, 4386 |
| `error` | 1 | 850 |
| `float32` | 2 | 3733, 843 |
| `float64` | 2 | 3733, 1227 |
| `int` | 1 | 396 |
| `int8` | 2 | 396, 23 |
| `int16` | 2 | 396, 845 |
| `int32` | 2 | 396, 843 |
| `int64` | 2 | 396, 1227 |
| `rune` | 2 | 81, 2957 |
| `string` | 1 | 928 |
| `uint` | 1 | 2557 |
| `uint8` | 2 | 2557, 23 |
| `uint16` | 2 | 2557, 845 |
| `uint32` | 2 | 2557, 843 |
| `uint64` | 2 | 2557, 1227 |
| `uintptr` | 1 | 52480 |
| `true` | 1 | 1904 |
| `false` | 1 | 3934 |
| `iota` | 2 | 72, 6217 |
| `nil` | 1 | 8551 |

### Common Go Identifiers

| Identifier | Tokens | Token IDs |
|------------|--------|-----------|
| `fmt` | 1 | 12784 |
| `err` | 1 | 618 |
| `ctx` | 1 | 3858 |
| `req` | 1 | 3031 |
| `res` | 1 | 417 |
| `log` | 1 | 848 |
| `os` | 1 | 437 |
| `io` | 1 | 822 |
| `http` | 1 | 1277 |
| `json` | 1 | 2285 |
| `time` | 1 | 1712 |
| `sync` | 1 | 13293 |
| `math` | 1 | 10590 |
| `sort` | 1 | 7003 |
| `flag` | 1 | 10104 |
| `main` | 1 | 3902 |
| `init` | 1 | 2381 |
| `test` | 1 | 1985 |
| `run` | 1 | 6236 |
| `get` | 1 | 456 |
| `set` | 1 | 751 |
| `put` | 1 | 631 |
| `New` | 1 | 3648 |
| `Get` | 1 | 1991 |
| `Set` | 1 | 1681 |
| `Put` | 1 | 19648 |
| `Run` | 1 | 6869 |
| `Add` | 1 | 2261 |
| `Del` | 1 | 16939 |
| `Error` | 1 | 1480 |
| `String` | 1 | 707 |
| `Close` | 1 | 8084 |
| `Read` | 1 | 4518 |
| `Write` | 1 | 8144 |
| `Handle` | 1 | 7144 |
| `Serve` | 1 | 61521 |
| `Listen` | 1 | 39814 |
| `Printf` | 1 | 43836 |
| `Println` | 2 | 9171, 2312 |
| `Errorf` | 2 | 1480, 69 |
| `Sprintf` | 2 | 50, 2578 |
| `Context` | 1 | 2014 |
| `Handler` | 1 | 3126 |
| `Server` | 1 | 5592 |
| `Request` | 1 | 1939 |
| `Response` | 1 | 2647 |
| `Reader` | 1 | 5172 |
| `Writer` | 1 | 6628 |
| `Buffer` | 1 | 4187 |
| `Mutex` | 1 | 39199 |
| `WaitGroup` | 2 | 14524, 2878 |
| `Channel` | 1 | 9826 |

**Keyword stats:** 24/25 keywords are single tokens. Average token cost: 1.04

## Useful Single-Token Unicode Symbols

Found 121 single-token Unicode symbols across tested ranges.

### Math Operators (1 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| − | U+2212 | 34363 |

### Arrows (4 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ← | U+2190 | 72958 |
| ↑ | U+2191 | 77386 |
| → | U+2192 | 52118 |
| ↓ | U+2193 | 80129 |

### Box Drawing (7 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ─ | U+2500 | 14897 |
| ━ | U+2501 | 60315 |
| │ | U+2502 | 73987 |
| ═ | U+2550 | 39860 |
| ║ | U+2551 | 64497 |
| ╗ | U+2557 | 86866 |
| ╝ | U+255D | 84475 |

### Geometric Shapes (3 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ■ | U+25A0 | 47774 |
| ► | U+25BA | 83564 |
| ● | U+25CF | 45048 |

### Misc Symbols (6 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ★ | U+2605 | 27347 |
| ☆ | U+2606 | 47238 |
| ☴ | U+2634 | 67580 |
| ♀ | U+2640 | 32990 |
| ♥ | U+2665 | 77809 |
| ♪ | U+266A | 40620 |

### Dingbats (1 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ✔ | U+2714 | 75351 |

### Braille (1 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ⠀ | U+2800 | 75819 |

### Misc Math-A (1 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ⟩ | U+27E9 | 40709 |

### Latin Extended-A (31 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ā | U+0101 | 31757 |
| ă | U+0103 | 6845 |
| ą | U+0105 | 5985 |
| ć | U+0107 | 7886 |
| č | U+010D | 13453 |
| Đ | U+0110 | 41325 |
| đ | U+0111 | 52096 |
| ē | U+0113 | 79083 |
| ę | U+0119 | 5267 |
| ě | U+011B | 22161 |
| ğ | U+011F | 11257 |
| ī | U+012B | 61711 |
| İ | U+0130 | 48880 |
| ı | U+0131 | 3862 |
| ł | U+0142 | 4697 |
| ń | U+0144 | 19699 |
| ō | U+014D | 56761 |
| ő | U+0151 | 17221 |
| œ | U+0153 | 52822 |
| ř | U+0159 | 29432 |
| ś | U+015B | 7545 |
| ş | U+015F | 7370 |
| š | U+0161 | 11906 |
| ţ | U+0163 | 30561 |
| ť | U+0165 | 75901 |
| ū | U+016B | 54056 |
| ů | U+016F | 52353 |
| ű | U+0171 | 52359 |
| ź | U+017A | 40611 |
| ż | U+017C | 6077 |
| ž | U+017E | 12453 |

### Greek (27 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ά | U+03AC | 75234 |
| έ | U+03AD | 80531 |
| ή | U+03AE | 74030 |
| ί | U+03AF | 55241 |
| α | U+03B1 | 19481 |
| β | U+03B2 | 52355 |
| γ | U+03B3 | 60474 |
| δ | U+03B4 | 86486 |
| ε | U+03B5 | 31243 |
| η | U+03B7 | 42524 |
| θ | U+03B8 | 89638 |
| ι | U+03B9 | 30862 |
| κ | U+03BA | 68437 |
| λ | U+03BB | 34586 |
| μ | U+03BC | 44223 |
| ν | U+03BD | 34369 |
| ο | U+03BF | 28654 |
| π | U+03C0 | 49345 |
| ρ | U+03C1 | 39179 |
| ς | U+03C2 | 46742 |
| σ | U+03C3 | 45028 |
| τ | U+03C4 | 36924 |
| υ | U+03C5 | 54556 |
| φ | U+03C6 | 86134 |
| χ | U+03C7 | 90202 |
| ω | U+03C9 | 57971 |
| ό | U+03CC | 76295 |

### CJK Symbols (12 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| 　 | U+3000 | 23249 |
| 、 | U+3001 | 5486 |
| 。 | U+3002 | 1811 |
| 《 | U+300A | 28038 |
| 》 | U+300B | 26123 |
| 「 | U+300C | 13177 |
| 」 | U+300D | 10646 |
| 『 | U+300E | 44620 |
| 』 | U+300F | 36761 |
| 【 | U+3010 | 11144 |
| 】 | U+3011 | 11199 |
| 〜 | U+301C | 56040 |

### General Punctuation (22 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ​ | U+200B | 16067 |
| ‌ | U+200C | 90464 |
| ‎ | U+200E | 79338 |
| ‐ | U+2010 | 31021 |
| ‑ | U+2011 | 57064 |
| – | U+2013 | 4235 |
| — | U+2014 | 2345 |
| ― | U+2015 | 63072 |
| ‘ | U+2018 | 14336 |
| ’ | U+2019 | 529 |
| ‚ | U+201A | 73238 |
| “ | U+201C | 2118 |
| ” | U+201D | 863 |
| „ | U+201E | 56163 |
| † | U+2020 | 84362 |
| • | U+2022 | 6806 |
| … | U+2026 | 1981 |
| ‰ | U+2030 | 85725 |
| ′ | U+2032 | 39615 |
| ″ | U+2033 | 22308 |
| › | U+203A | 69209 |
| ※ | U+203B | 64780 |

### Super/Subscripts (3 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ₀ | U+2080 | 90769 |
| ₁ | U+2081 | 32086 |
| ₂ | U+2082 | 32907 |

### Currency (1 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| € | U+20AC | 15406 |

### Letterlike (1 single-token symbols)

| Symbol | Codepoint | Token ID |
|--------|-----------|----------|
| ™ | U+2122 | 16500 |

## Syntax Design Implications

### Key Findings for Language Syntax Design

#### 1. Free (Single-Token) ASCII Characters

All standard ASCII punctuation and alphanumeric characters are single tokens.
This means single-character operators like `+`, `-`, `*`, `/`, `=`, `<`, `>`,
`!`, `&`, `|`, `^`, `~`, `%`, `@`, `#`, `$`, `?` are the cheapest possible operators.

#### 2. Cheapest Multi-Character Operators

The following common operator combinations are also single tokens (same cost as a single character):

| Operator | Notes |
|----------|-------|
| `:=` | Short variable declaration (Go-style) |
| `!=` | Not equal |
| `==` | Equality |
| `>=` | Greater or equal |
| `<=` | Less or equal |
| `=>` | Arrow / fat arrow |
| `->` | Arrow / return type |
| `<-` | Channel operator |
| `..` | Range operator |
| `::` | Scope resolution / cons |
| `//` | Line comment |
| `/*` | Block comment start |
| `*/` | Block comment end |
| `&&` | Logical AND |
| `||` | Logical OR |
| `++` | Increment |
| `--` | Decrement |
| `>>` | Right shift |
| `<<` | Left shift |
| `+=` | Add-assign |
| `-=` | Subtract-assign |
| `*=` | Multiply-assign |
| `/=` | Divide-assign |
| `%=` | Modulo-assign |
| `|=` | Bitwise OR-assign |
| `#{` | Map/set literal |
| `$(` | Command substitution |
| `${` | String interpolation |
| `@@` |  |
| `?.` | Optional chaining |
| `?:` | Ternary / Elvis |
| `??` | Null coalescing |
| `!!` | Double bang / force unwrap |
| `...` | Spread / variadic |
| `==>` | Double arrow |
| `///` | Doc comment |
| `/**` | Block doc comment start |
| `()` | Parentheses pair |
| `[]` | Brackets pair |
| `{}` | Braces pair |
| `<>` | Angle brackets / diamond |
| `.*` |  |
| `::` | Scope resolution / cons |
| `\n` |  |
| `\t` |  |
| `\\` |  |

#### 3. Short Keywords That Are Single Tokens

These short identifiers/keywords cost only 1 token each:

`fn`, `if`, `do`, `or`, `in`, `is`, `as`, `at`, `go`, `to`, `ok`, `eq`, `ne`, `lt`, `gt`, `le`, `ge`, `def`, `let`, `var`, `val`, `nil`, `mut`, `pub`, `use`, `int`, `str`, `err`, `buf`, `ptr`, `ref`, `ret`, `end`, `for`, `not`, `and`, `any`, `all`, `new`, `del`, `try`, `get`, `set`, `has`, `len`, `cap`, `max`, `min`, `add`, `sub`, `mul`, `div`, `mod`, `xor`

#### 4. Go Keyword Efficiency

Keywords requiring multiple tokens (more expensive):

- `fallthrough` = 2 tokens

#### 5. Unicode Opportunities

Found 121 Unicode symbols that are single tokens.
Notable single-token Unicode symbols useful for syntax:

| Symbol | Name | Codepoint | Token ID |
|--------|------|-----------|----------|
| ← | Left Arrow | U+2190 | 72958 |
| ↑ | Up Arrow | U+2191 | 77386 |
| → | Right Arrow | U+2192 | 52118 |
| ↓ | Down Arrow | U+2193 | 80129 |
| α | Greek | U+03B1 | 19481 |
| β | Greek | U+03B2 | 52355 |
| γ | Greek | U+03B3 | 60474 |
| δ | Greek | U+03B4 | 86486 |
| ε | Greek | U+03B5 | 31243 |
| η | Greek | U+03B7 | 42524 |
| θ | Greek | U+03B8 | 89638 |
| ι | Greek | U+03B9 | 30862 |
| κ | Greek | U+03BA | 68437 |
| λ | Greek | U+03BB | 34586 |
| μ | Greek | U+03BC | 44223 |
| ν | Greek | U+03BD | 34369 |
| ο | Greek | U+03BF | 28654 |
| π | Greek | U+03C0 | 49345 |
| ρ | Greek | U+03C1 | 39179 |
| ς | Greek | U+03C2 | 46742 |
| σ | Greek | U+03C3 | 45028 |
| τ | Greek | U+03C4 | 36924 |
| υ | Greek | U+03C5 | 54556 |
| φ | Greek | U+03C6 | 86134 |
| χ | Greek | U+03C7 | 90202 |
| ω | Greek | U+03C9 | 57971 |

#### 6. Recommendations for Token-Efficient Syntax

1. **Use single ASCII characters for operators** where possible: all are 1 token.
2. **Prefer common multi-char operators** that are already single tokens:
   `:=`, `!=`, `==`, `>=`, `<=`, `->`, `<-`, `&&`, `||`, `..`, `::`, `//`
3. **Short keywords** (2-3 chars) that are single tokens are very efficient:
   `fn`, `if`, `do`, `or`, `in`, `is`, `as`, `go`, `for`, `var`, `let`, `nil`, `pub`, `use`, `mut`, `def`, `val`
4. **Bracket pairs** `()`, `[]`, `{}` are each single tokens (2 chars, 1 token).
5. **All Go keywords** are single tokens, confirming that common English keywords are well-represented in the tokenizer.
6. **Unicode arrows and math symbols** are available as single tokens and could be
   used for specialized operators or as alternatives to multi-char ASCII sequences.
7. **Avoid long compound operators** - 3+ character operators like `<<=`, `>>=`
   may or may not be single tokens; test them before adopting.
8. **String interpolation** syntax `${` is a single token - good for template literals.
