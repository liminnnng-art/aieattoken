# AET-Python RosettaCode Task Candidates

## Existing Tasks (Already in Go Test Suite)

These 17 tasks already have `.py` files in `tests/rosettacode/`:

| # | Task | Complexity | Python Features |
|---|------|-----------|----------------|
| 1 | ackermann | Simple | Recursion |
| 2 | binsearch | Simple | List operations |
| 3 | bubblesort | Simple | In-place mutation |
| 4 | caesar | Simple | String manipulation |
| 5 | doors100 | Simple | List comprehension |
| 6 | factorial | Simple | Recursion |
| 7 | fibonacci | Simple | Loop/recursion |
| 8 | fizzbuzz | Simple | Conditional, print |
| 9 | gcd | Simple | Recursion |
| 10 | hanoi | Simple | Recursion, print |
| 11 | luhn | Medium | String/digit manipulation |
| 12 | matrix | Medium | 2D list operations |
| 13 | palindrome | Simple | String operations |
| 14 | reverse | Simple | String/list reversal |
| 15 | roman | Medium | Dict mapping |
| 16 | sieve | Medium | List, filtering |
| 17 | tokenize | Medium | String parsing |

## New Candidate Tasks (Need to Write)

### Tier 1: High Priority (Showcases Python Features)

| # | Task | Complexity | Python-Specific Patterns | Notes |
|---|------|-----------|-------------------------|-------|
| 18 | **Quicksort** | Medium | List comprehensions for partition, unpacking | Classic Pythonic sort |
| 19 | **Merge sort** | Medium | Slicing, yield, list concatenation | Generator-based merge |
| 20 | **Flatten a list** | Simple | `yield from`, isinstance, recursion | Distinctly Pythonic |
| 21 | **List comprehensions** | Simple | Triple-nested comprehension | The task IS about comprehensions |
| 22 | **Accumulator factory** | Simple | Closures, `nonlocal`, lambda | Tests closure model |
| 23 | **Generator/Exponential** | Medium | `yield`, itertools, lazy eval | Core Python feature |
| 24 | **N-queens** | Complex | Generators, backtracking, `all()` | Complex algorithm |
| 25 | **Levenshtein distance** | Medium | 2D list comprehension, `min()` | DP with comprehensions |
| 26 | **Topological sort** | Complex | defaultdict, set operations, generators | Graph algorithm |
| 27 | **Knapsack 0-1** | Complex | dataclass, enumerate, DP | OOP + algorithm |

### Tier 2: Medium Priority (Good Coverage)

| # | Task | Complexity | Python-Specific Patterns |
|---|------|-----------|-------------------------|
| 28 | **Happy numbers** | Simple | set(), str(), sum with generator |
| 29 | **Balanced brackets** | Simple | Stack via list.append/pop |
| 30 | **Rot-13** | Simple | str.maketrans, str.translate |
| 31 | **Run-length encoding** | Simple | itertools.groupby, generators |
| 32 | **Matrix transposition** | Simple | `zip(*matrix)` idiom |
| 33 | **Power set** | Medium | itertools.combinations, generators |
| 34 | **Counting sort** | Simple | defaultdict, comprehensions |
| 35 | **Perfect numbers** | Simple | sum with generator expression |
| 36 | **Hailstone sequence** | Simple | Conditional expression, append |

### Tier 3: Nice to Have

| # | Task | Complexity | Python-Specific Patterns |
|---|------|-----------|-------------------------|
| 37 | **Selection sort** | Simple | enumerate, min with key |
| 38 | **Insertion sort** | Simple | Tuple unpacking swap |
| 39 | **Cocktail sort** | Simple | range with negative step |
| 40 | **Permutations** | Medium | itertools or recursive yield |
| 41 | **Look-and-say** | Simple | groupby, join |
| 42 | **Anagrams** | Medium | defaultdict, sorted as key |
| 43 | **Stack** | Simple | Class with __len__, __bool__ |

## Selected 15+ Tasks for Testing

From existing (17) + new candidates, selecting **20 tasks** for AET-Python testing:

### From Existing (use Python versions):
1. fibonacci
2. factorial
3. fizzbuzz
4. sieve
5. palindrome
6. caesar
7. bubblesort
8. matrix
9. luhn
10. gcd

### New (to write):
11. quicksort
12. flatten_list
13. list_comprehensions (Pythagorean triples)
14. accumulator_factory
15. levenshtein
16. happy_numbers
17. balanced_brackets
18. rot13
19. run_length_encoding
20. matrix_transposition

## Feature Coverage Matrix

| Feature | Tasks That Test It |
|---------|--------------------|
| List comprehension | quicksort, list_comprehensions, levenshtein, happy_numbers |
| Generator / yield | flatten_list, accumulator_factory |
| Closures / nonlocal | accumulator_factory |
| Recursion | fibonacci, factorial, flatten_list, quicksort |
| String manipulation | caesar, palindrome, rot13, run_length_encoding |
| itertools | run_length_encoding |
| set operations | happy_numbers |
| zip / enumerate | matrix_transposition |
| Class / OOP | balanced_brackets (stack class), levenshtein |
| Conditional expression | fizzbuzz, happy_numbers |
| dict operations | caesar, roman |
| sum / min / max | happy_numbers, levenshtein |
