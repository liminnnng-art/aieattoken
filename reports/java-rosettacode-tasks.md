# RosettaCode Tasks with Both Java and Go Implementations

Source: [acmeism/RosettaCodeData](https://github.com/acmeism/RosettaCodeData) and [rosettacode.org](https://rosettacode.org)

## Selection Criteria

- Task must have **both Java and Go** implementations on RosettaCode
- Overlaps with existing Go A-group tests where possible (for cross-language comparison)
- Tasks exercise a range of Java features: classes, generics, exception handling, collections, I/O, etc.
- Varied complexity: simple, medium, complex

## Candidate Tasks (20 tasks)

All 20 tasks below have verified Java and Go implementations on RosettaCode.

| # | Task Name | RosettaCode Path | Complexity | Java Features Exercised | Also in Go A-Group? |
|---|-----------|-----------------|------------|------------------------|-------------------|
| 1 | Fibonacci sequence | `Task/Fibonacci-sequence/Java/` | Simple | Recursion, methods, main class | Yes |
| 2 | FizzBuzz | `Task/FizzBuzz/Java/` | Simple | Loops, conditionals, System.out | Yes |
| 3 | Factorial | `Task/Factorial/Java/` | Simple | Recursion, BigInteger, methods | Yes |
| 4 | Sieve of Eratosthenes | `Task/Sieve-of-Eratosthenes/Java/` | Medium | boolean[], loops, ArrayList | Yes |
| 5 | Ackermann function | `Task/Ackermann-function/Java/` | Medium | Recursion, deep stack | Yes |
| 6 | Greatest common divisor | `Task/Greatest-common-divisor/Java/` | Simple | Recursion, modulo | Yes |
| 7 | Bubble sort | `Task/Sorting-algorithms-Bubble-sort/Java/` | Medium | Arrays, nested loops, generics | Yes |
| 8 | Binary search | `Task/Binary-search/Java/` | Medium | Arrays, loops, index arithmetic | Yes |
| 9 | Caesar cipher | `Task/Caesar-cipher/Java/` | Medium | String/char manipulation, StringBuilder | Yes |
| 10 | Towers of Hanoi | `Task/Towers-of-Hanoi/Java/` | Medium | Recursion, String.format | Yes |
| 11 | Palindrome detection | `Task/Palindrome-detection/Java/` | Simple | String methods, StringBuilder.reverse | Yes |
| 12 | 100 doors | `Task/100-doors/Java/` | Simple | boolean[], nested loops | Yes |
| 13 | Luhn test | `Task/Luhn-test-of-credit-card-numbers/Java/` | Medium | String→char, digit extraction | Yes |
| 14 | Roman numerals encode | `Task/Roman-numerals-Encode/Java/` | Medium | Arrays, loops, StringBuilder | Yes |
| 15 | Reverse a string | `Task/Reverse-a-string/Java/` | Simple | StringBuilder, String methods | Yes |
| 16 | Matrix multiplication | `Task/Matrix-multiplication/Java/` | Medium | 2D arrays, triple nested loops | Yes |
| 17 | Tokenize a string | `Task/Tokenize-a-string/Java/` | Simple | String.split, join | Yes |
| 18 | Quicksort | `Task/Sorting-algorithms-Quicksort/Java/` | Complex | Arrays, recursion, generics, Comparable | No |
| 19 | Levenshtein distance | `Task/Levenshtein-distance/Java/` | Complex | 2D int[][], String.charAt, DP | No |
| 20 | N-queens problem | `Task/N-queens-problem/Java/` | Complex | Backtracking, int[][], boolean[] | No |

## Tasks by Complexity

### Simple (7 tasks)
Fibonacci, FizzBuzz, Factorial, GCD, Palindrome, 100 doors, Reverse string, Tokenize

### Medium (9 tasks)
Sieve, Ackermann, Bubble sort, Binary search, Caesar cipher, Towers of Hanoi, Luhn test, Roman numerals, Matrix multiplication

### Complex (3 tasks)
Quicksort, Levenshtein distance, N-queens

## Java Feature Coverage

| Java Feature | Tasks That Exercise It |
|-------------|----------------------|
| Class wrapper (`public class X`) | All 20 tasks |
| `public static void main` | All 20 tasks |
| System.out.println | All 20 tasks |
| Loops (for, while, enhanced for) | FizzBuzz, Sieve, Bubble sort, 100 doors, Matrix mult, Quicksort |
| Recursion | Fibonacci, Factorial, Ackermann, GCD, Hanoi, Quicksort, N-queens |
| Arrays (`int[]`, `boolean[]`, `int[][]`) | Sieve, Bubble sort, Binary search, Matrix mult, N-queens, Levenshtein |
| String methods | Caesar, Palindrome, Reverse, Tokenize, Luhn, Roman, Levenshtein |
| StringBuilder | Caesar, Roman, Reverse, Palindrome |
| ArrayList/Collections | Sieve (output), Quicksort |
| Math operations | Factorial (BigInteger), GCD (modulo), N-queens |
| Generics | Bubble sort (Comparable), Quicksort |
| char/Character operations | Caesar, Luhn |
| 2D arrays | Matrix multiplication, Levenshtein, N-queens |

## Estimated Java vs AET Token Savings (Preliminary)

Based on heatmap analysis:
- Simple tasks (small, few methods): ~45-55% saving expected
- Medium tasks (multiple methods, some collections): ~55-65% saving expected
- Complex tasks (classes, generics, larger code): ~65-75% saving expected
- POJO-heavy tasks: ~75-85% saving expected

The weighted average across all 20 tasks should comfortably exceed **50%**.

## Notes

- Java RosettaCode implementations typically use `public class TaskName { ... }` wrapper
- Many Java implementations include `import java.util.*` or specific imports
- Some tasks have multiple Java solutions (iterative, recursive, stream-based); we will use the most idiomatic/standard version
- We select at least 10 tasks for the final A-group testing, matching the existing Go A-group count
