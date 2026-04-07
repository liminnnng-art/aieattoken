# RosettaCode Tasks with Go, J, Clojure, and Python Implementations

Source repository: [acmeism/RosettaCodeData](https://github.com/acmeism/RosettaCodeData)
Repository structure: `Task/{TaskName}/{Language}/`

## Selection Criteria

- All four languages (Go, J, Clojure, Python) must have implementations in the RosettaCodeData mirror
- Tasks are algorithmically interesting and varied in complexity
- Tasks exercise a range of Go features: loops, recursion, functions, error handling, data structures, string manipulation, math, sorting, concurrency, I/O, etc.
- Trivial display-only tasks (e.g., "Hello world/Text") are excluded

## Candidate Tasks (30 tasks)

| # | Task Name | Repo Path | Description | Complexity | Go Features Exercised | RosettaCode Link |
|---|-----------|-----------|-------------|------------|----------------------|------------------|
| 1 | Fibonacci sequence | `Task/Fibonacci-sequence/` | Generate Fibonacci numbers using iteration or recursion | Simple | Loops, recursion, functions, integer arithmetic | [Link](https://rosettacode.org/wiki/Fibonacci_sequence) |
| 2 | FizzBuzz | `Task/FizzBuzz/` | Print numbers 1-100, replacing multiples of 3/5 with Fizz/Buzz | Simple | Loops, conditionals, modulo, fmt output | [Link](https://rosettacode.org/wiki/FizzBuzz) |
| 3 | Sieve of Eratosthenes | `Task/Sieve-of-Eratosthenes/` | Find all primes up to a limit using the classic sieve algorithm | Medium | Slices, boolean arrays, loops, indexing | [Link](https://rosettacode.org/wiki/Sieve_of_Eratosthenes) |
| 4 | Ackermann function | `Task/Ackermann-function/` | Compute the Ackermann function, a classic example of deep recursion | Medium | Recursion, function calls, stack depth | [Link](https://rosettacode.org/wiki/Ackermann_function) |
| 5 | Factorial | `Task/Factorial/` | Compute n! iteratively and/or recursively | Simple | Loops, recursion, big integers (math/big) | [Link](https://rosettacode.org/wiki/Factorial) |
| 6 | Greatest common divisor | `Task/Greatest-common-divisor/` | Compute GCD using Euclidean algorithm | Simple | Recursion, modulo arithmetic, functions | [Link](https://rosettacode.org/wiki/Greatest_common_divisor) |
| 7 | Towers of Hanoi | `Task/Towers-of-Hanoi/` | Solve the classic Tower of Hanoi puzzle recursively | Medium | Recursion, string formatting, function parameters | [Link](https://rosettacode.org/wiki/Towers_of_Hanoi) |
| 8 | Bubble sort | `Task/Sorting-algorithms-Bubble-sort/` | Implement bubble sort on an array of numbers | Medium | Slices, nested loops, swap, comparison | [Link](https://rosettacode.org/wiki/Sorting_algorithms/Bubble_sort) |
| 9 | Quicksort | `Task/Sorting-algorithms-Quicksort/` | Implement quicksort with partitioning | Complex | Slices, recursion, partitioning, generics or interfaces | [Link](https://rosettacode.org/wiki/Sorting_algorithms/Quicksort) |
| 10 | Merge sort | `Task/Sorting-algorithms-Merge-sort/` | Implement merge sort with array splitting and merging | Complex | Slices, recursion, append, slice manipulation | [Link](https://rosettacode.org/wiki/Sorting_algorithms/Merge_sort) |
| 11 | Binary search | `Task/Binary-search/` | Search a sorted array using binary search | Medium | Slices, loops, index arithmetic, comparison | [Link](https://rosettacode.org/wiki/Binary_search) |
| 12 | Caesar cipher | `Task/Caesar-cipher/` | Encrypt/decrypt text by shifting letters in the alphabet | Medium | Strings, rune manipulation, modular arithmetic, byte ops | [Link](https://rosettacode.org/wiki/Caesar_cipher) |
| 13 | ROT13 | `Task/Rot-13/` | Apply the ROT13 substitution cipher to text | Simple | Strings, byte/rune processing, conditionals | [Link](https://rosettacode.org/wiki/Rot-13) |
| 14 | Levenshtein distance | `Task/Levenshtein-distance/` | Compute edit distance between two strings using dynamic programming | Complex | 2D slices, nested loops, min function, string indexing | [Link](https://rosettacode.org/wiki/Levenshtein_distance) |
| 15 | Roman numerals encode | `Task/Roman-numerals-Encode/` | Convert an integer to its Roman numeral representation | Medium | Arrays/slices of structs, loops, string building | [Link](https://rosettacode.org/wiki/Roman_numerals/Encode) |
| 16 | Roman numerals decode | `Task/Roman-numerals-Decode/` | Convert a Roman numeral string back to an integer | Medium | Maps, string iteration, conditionals | [Link](https://rosettacode.org/wiki/Roman_numerals/Decode) |
| 17 | 100 doors | `Task/100-doors/` | Toggle 100 doors in multiple passes, determine which are open | Simple | Arrays, nested loops, boolean logic | [Link](https://rosettacode.org/wiki/100_doors) |
| 18 | Palindrome detection | `Task/Palindrome-detection/` | Check whether a string reads the same forwards and backwards | Simple | Strings, rune slices, two-pointer technique | [Link](https://rosettacode.org/wiki/Palindrome_detection) |
| 19 | Balanced brackets | `Task/Balanced-brackets/` | Check if a string of brackets is properly balanced | Medium | Stacks (slice as stack), loops, conditionals | [Link](https://rosettacode.org/wiki/Balanced_brackets) |
| 20 | Flatten a list | `Task/Flatten-a-list/` | Flatten a nested list/array structure into a single-level list | Medium | Recursion, type assertions, interface{}, slices | [Link](https://rosettacode.org/wiki/Flatten_a_list) |
| 21 | Matrix multiplication | `Task/Matrix-multiplication/` | Multiply two matrices together | Medium | 2D slices, triple-nested loops, index arithmetic | [Link](https://rosettacode.org/wiki/Matrix_multiplication) |
| 22 | Matrix transposition | `Task/Matrix-transposition/` | Transpose rows and columns of a matrix | Simple | 2D slices, nested loops, index swapping | [Link](https://rosettacode.org/wiki/Matrix_transposition) |
| 23 | Luhn test | `Task/Luhn-test-of-credit-card-numbers/` | Validate credit card numbers using the Luhn algorithm | Medium | String processing, digit extraction, modular arithmetic | [Link](https://rosettacode.org/wiki/Luhn_test_of_credit_card_numbers) |
| 24 | Longest common subsequence | `Task/Longest-common-subsequence/` | Find LCS of two strings using dynamic programming | Complex | 2D slices, nested loops, string building, DP table | [Link](https://rosettacode.org/wiki/Longest_common_subsequence) |
| 25 | Accumulator factory | `Task/Accumulator-factory/` | Create a function that returns a stateful accumulator closure | Medium | Closures, first-class functions, state capture | [Link](https://rosettacode.org/wiki/Accumulator_factory) |
| 26 | N-queens problem | `Task/N-queens-problem/` | Place N queens on an NxN board with no conflicts | Complex | Backtracking, recursion, slices, constraint checking | [Link](https://rosettacode.org/wiki/N-queens_problem) |
| 27 | Tree traversal | `Task/Tree-traversal/` | Implement pre-order, in-order, post-order, and level-order traversal | Complex | Structs (tree nodes), pointers, recursion, queues | [Link](https://rosettacode.org/wiki/Tree_traversal) |
| 28 | Tokenize a string | `Task/Tokenize-a-string/` | Split a string into tokens based on a delimiter | Simple | strings.Split, loops, fmt output | [Link](https://rosettacode.org/wiki/Tokenize_a_string) |
| 29 | Reverse a string | `Task/Reverse-a-string/` | Reverse the characters in a string (with Unicode awareness) | Simple | Rune conversion, slice reversal, string building | [Link](https://rosettacode.org/wiki/Reverse_a_string) |
| 30 | Power set | `Task/Power-set/` | Generate all subsets of a given set | Medium | Bit manipulation or recursion, slices, append | [Link](https://rosettacode.org/wiki/Power_set) |

## Tasks by Complexity

### Simple (8 tasks)
- Fibonacci sequence, FizzBuzz, Factorial, Greatest common divisor, ROT13, 100 doors, Palindrome detection, Tokenize a string, Reverse a string, Matrix transposition

### Medium (13 tasks)
- Sieve of Eratosthenes, Ackermann function, Towers of Hanoi, Bubble sort, Binary search, Caesar cipher, Roman numerals (encode/decode), Balanced brackets, Flatten a list, Matrix multiplication, Luhn test, Accumulator factory, Power set

### Complex (7 tasks)
- Quicksort, Merge sort, Levenshtein distance, Longest common subsequence, N-queens problem, Tree traversal

## Go Features Coverage

| Go Feature | Tasks That Exercise It |
|------------|----------------------|
| Loops (for) | FizzBuzz, Sieve, Bubble sort, Binary search, 100 doors, Matrix multiplication |
| Recursion | Fibonacci, Ackermann, Factorial, GCD, Towers of Hanoi, Quicksort, Merge sort, Tree traversal, N-queens |
| Slices | Sieve, Bubble sort, Quicksort, Merge sort, Binary search, Flatten a list, Matrix ops, Power set |
| Maps | Roman numerals decode, Caesar cipher |
| Strings/Runes | Caesar cipher, ROT13, Palindrome, Reverse string, Tokenize, Levenshtein, LCS |
| Structs | Tree traversal, Roman numerals encode (value pairs) |
| Closures | Accumulator factory |
| Type assertions | Flatten a list |
| Bit manipulation | Power set |
| Dynamic programming | Levenshtein distance, Longest common subsequence |
| Backtracking | N-queens problem |
| 2D slices | Matrix multiplication, Matrix transposition, Levenshtein, LCS |
| fmt formatting | FizzBuzz, Towers of Hanoi, all output tasks |
| Integer arithmetic | Fibonacci, Factorial, GCD, Luhn test |
| Boolean arrays | Sieve of Eratosthenes, 100 doors |
| Stack (via slice) | Balanced brackets |

## Notes

- Task names in the repository use hyphens as separators (e.g., `Fibonacci-sequence`)
- RosettaCode wiki URLs use underscores (e.g., `Fibonacci_sequence`)
- The repository path format is: `Task/{TaskName}/{Language}/` where Language is exactly `Go`, `J`, `Clojure`, or `Python`
- Go, Python, J, and Clojure are among the most-represented languages in the RosettaCodeData repository
- All 30 tasks listed above are well-established RosettaCode tasks with extensive multi-language coverage
- J implementations may use the idiomatic tacit/array style; Go implementations tend to be more verbose but explicit
