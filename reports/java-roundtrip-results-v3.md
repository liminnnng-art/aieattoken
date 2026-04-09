# Java Round-Trip Results v3 — AET-Java

**Date**: 2026-04-09
**Pipeline**: Java -> AETJ -> IR -> Java -> javac -> run -> stdout compare

## Results

| # | File | Group | Pipeline | javac | stdout |
|---|------|:-----:|:--------:|:-----:|:------:|
| 1 | Ackermann | A | OK | OK | MATCH |
| 2 | Binsearch | A | OK | OK | MATCH |
| 3 | Bubblesort | A | OK | OK | MATCH |
| 4 | Caesar | A | OK | OK | MATCH |
| 5 | Doors100 | A | OK | OK | MATCH |
| 6 | Factorial | A | OK | OK | MATCH |
| 7 | fibonacci | A | OK | OK | MATCH |
| 8 | Fibonacci_gen | A | OK | OK | MATCH |
| 9 | Fizzbuzz | A | OK | OK | MATCH |
| 10 | Gcd | A | OK | OK | MATCH |
| 11 | Hanoi | A | OK | OK | MATCH |
| 12 | Luhn | A | OK | OK | MATCH |
| 13 | Matrix | A | OK | OK | MATCH |
| 14 | Palindrome | A | OK | OK | MATCH |
| 15 | Reverse | A | OK | OK | MATCH |
| 16 | Roman | A | OK | OK | MATCH |
| 17 | Tokenize | A | OK | OK | MATCH |
| 18 | b01_maxmin | B | OK | OK | MATCH |
| 19 | b02_wordcount | B | OK | OK | MATCH |
| 20 | b03_stack | B | OK | OK | MATCH |
| 21 | b04_celsius | B | OK | OK | MATCH |
| 22 | b05_validate | B | OK | OK | MATCH |
| 23 | b06_kvstore | B | OK | OK | MATCH |
| 24 | b07_jsonlike | B | OK | OK | MATCH |
| 25 | b08_csv | B | OK | OK | MATCH |
| 26 | b09_calculator | B | OK | OK | MATCH |
| 27 | b10_linkedlist | B | OK | OK | MATCH |
| 28 | UserController | Sp | OK | N/A | N/A |
| 29 | OrderService | Sp | OK | N/A | N/A |
| 30 | CustomerDTO | Bp | OK | OK | MATCH |
| 31 | ProductEntity | Bp | OK | OK | MATCH |
| 32 | EmployeeRecord | Bp | OK | OK | MATCH |
| 33 | AddressVO | Bp | OK | OK | MATCH |
| 34 | InvoiceDTO | Bp | OK | OK | MATCH |

## Summary

- **Pipeline success**: 34/34 (100%)
- **javac compile**: 32/32 compilable (100%) — 2 Spring Boot files need Spring deps
- **stdout match**: 32/32 (100%)
- **Round-trip pass**: 27/27 core + 5/5 boilerplate = **32/32** (100%)
