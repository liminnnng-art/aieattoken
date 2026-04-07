# Java Round-Trip Test Results

Full round-trip: Java source to AET to Java source, then compare output.

## Group A -- RosettaCode (16 tests)

### Passing Tests (8/16)

| Test | Java Tokens | AET Tokens | Saving |
|------|------------:|-----------:|-------:|
| Ackermann | 148 | 103 | 30.4% |
| Doors100 | 116 | 81 | 30.2% |
| Factorial | 87 | 63 | 27.6% |
| Fizzbuzz | 112 | 65 | 42.0% |
| Gcd | 79 | 48 | 39.2% |
| Hanoi | 161 | 117 | 27.3% |
| Palindrome | 131 | 94 | 28.2% |
| Tokenize | 88 | 62 | 29.5% |
| **Subtotal** | **922** | **633** | **31.3%** |

These tests use straightforward control flow (if/else, for loops, recursion) and simple data types. The AET parser handles these patterns correctly in both directions.

### Failing Tests (8/16)

| Test | Saving | Failure Reason |
|------|-------:|----------------|
| Binsearch | 30.1% | `len()` used in array context -- parser expects Go-style `len()`, Java uses `.length` |
| Bubblesort | 34.0% | switch/case conflict -- Java switch semantics differ from Go |
| Caesar | 28.4% | `append` keyword -- Java StringBuilder.append vs Go append() |
| Luhn | 31.6% | Ternary operator -- `? :` not in original AET grammar (Go lacks ternary) |
| Matrix | 22.4% | Array type in loop -- Java array declarations in for-each context |
| Reverse | 20.9% | StringBuilder reverse -- `.reverse()` method chaining not handled |
| Roman | 22.3% | Array initializer -- Java `new int[]{}` syntax not parsed |
| fibonacci | 37.6% | Filename case -- `fibonacci` vs `Fibonacci` class name mismatch |

### Failure Categories

| Category | Count | Tests |
|----------|------:|-------|
| Java-specific syntax not in AET grammar | 4 | Luhn, Matrix, Roman, Reverse |
| Go/Java semantic mismatch | 2 | Binsearch, Bubblesort |
| Java stdlib method patterns | 1 | Caesar |
| Tooling/naming issue | 1 | fibonacci |

## Group B -- Real-World (10 tests)

All 10 tests fail at the AET to Java parse stage. The forward path (Java to AET) works correctly for all of them.

| Test | Saving | Status |
|------|-------:|--------|
| b01_maxmin | 26.9% | Parser error |
| b02_wordcount | 28.3% | Parser error |
| b03_stack | 31.3% | Parser error |
| b04_celsius | 38.2% | Parser error |
| b05_validate | 28.9% | Parser error |
| b06_kvstore | 23.6% | Parser error |
| b07_jsonlike | 35.6% | Parser error |
| b08_csv | 26.8% | Parser error |
| b09_calculator | 27.7% | Parser error |
| b10_linkedlist | 32.7% | Parser error |

B Group failures are caused by a higher density of Java-specific constructs (generics, method chaining, enhanced for-each, access modifiers) that the AET parser does not yet support. These are parser limitations -- the AET representation is correct, but the reverse parser cannot reconstruct the Java source from it.

## Key Findings

1. **Java to AET path is fully functional** for all 26 tests across both groups and all complexity levels.
2. **AET to Java path works for simple/medium algorithmic code** -- 8 of 16 Group A tests pass full round-trip.
3. **Failures are parser limitations, not emitter bugs.** The AET parser was built for Go patterns and needs grammar extensions for Java-specific constructs.
4. **Most fixable failure:** the `fibonacci` filename case issue is a tooling bug, not a language problem.
5. **Hardest failures:** ternary operators and array initializers require AET grammar additions since Go does not have equivalents.
