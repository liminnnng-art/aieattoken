# Java Round-Trip Results v2 — AET-Java

**Date**: 2026-04-08
**Pipeline**: Java -> AETJ -> IR -> Java -> javac -> run -> stdout compare

## Results

| # | File | Rev | Parse | Transform | Emit | javac | Run | stdout |
|---|------|:---:|:-----:|:---------:|:----:|:-----:|:---:|:------:|
| 1 | Ackermann | OK | OK | OK | OK | OK | OK | MATCH |
| 2 | Binsearch | OK | OK | OK | OK | OK | OK | MATCH |
| 3 | Bubblesort | OK | OK | OK | OK | OK | OK | MATCH |
| 4 | Caesar | OK | OK | OK | OK | OK | OK | MATCH |
| 5 | Doors100 | OK | OK | OK | OK | OK | OK | MATCH |
| 6 | Factorial | OK | OK | OK | OK | OK | OK | MATCH |
| 7 | fibonacci | OK | OK | OK | OK | OK | OK | MATCH |
| 8 | Fibonacci_gen | OK | OK | OK | OK | OK | OK | MATCH |
| 9 | Fizzbuzz | OK | OK | OK | OK | OK | OK | MATCH |
| 10 | Gcd | OK | OK | OK | OK | OK | OK | MATCH |
| 11 | Hanoi | OK | OK | OK | OK | OK | OK | MATCH |
| 12 | Luhn | OK | OK | OK | OK | OK | OK | MATCH |
| 13 | Matrix | OK | OK | OK | OK | OK | OK | MATCH |
| 14 | Palindrome | OK | OK | OK | OK | OK | OK | MATCH |
| 15 | Reverse | OK | OK | OK | OK | OK | OK | MATCH |
| 16 | Roman | OK | OK | OK | OK | OK | OK | MATCH |
| 17 | Tokenize | OK | OK | OK | OK | OK | OK | MATCH |
| 18 | b01_maxmin | OK | OK | OK | OK | OK | OK | MATCH |
| 19 | b02_wordcount | OK | OK | OK | OK | FAIL | - | - |
| 20 | b03_stack | OK | OK | OK | OK | OK | OK | MATCH |
| 21 | b04_celsius | OK | OK | OK | OK | OK | OK | MATCH |
| 22 | b05_validate | OK | OK | OK | OK | OK | OK | MATCH |
| 23 | b06_kvstore | OK | OK | OK | OK | OK | OK | MATCH |
| 24 | b07_jsonlike | OK | OK | OK | OK | OK | OK | MATCH |
| 25 | b08_csv | OK | OK | OK | OK | OK | OK | MATCH |
| 26 | b09_calculator | OK | OK | OK | OK | OK | OK | MATCH |
| 27 | b10_linkedlist | OK | OK | OK | OK | FAIL | - | - |

## Summary

- **Full round-trip pass**: 25/27 (93%)
- **AETJ parse success**: 27/27 (100%)
- **IR transform success**: 27/27 (100%)
- **Java emit success**: 27/27 (100%)
- **javac compile success**: 25/27 (93%)
- **stdout correctness**: 25/25 (100% of compilable)
