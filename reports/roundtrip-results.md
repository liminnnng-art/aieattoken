# Round-Trip Test Results

Method: Parse AET → Transform to IR → Re-parse same AET → Compare IRs using ast-diff tool.
All comparisons at AST level (not string comparison).

## Group A: RosettaCode Tasks

| # | Task | Parse 1 | Parse 2 | AST Equal | Status |
|---|------|---------|---------|-----------|--------|
| 1 | fibonacci | OK | OK | Yes | PASS |
| 2 | fizzbuzz | OK | OK | Yes | PASS |
| 3 | gcd | OK | OK | Yes | PASS |
| 4 | factorial | OK | OK | Yes | PASS |
| 5 | sieve | OK | OK | Yes | PASS |
| 6 | ackermann | OK | OK | Yes | PASS |
| 7 | hanoi | OK | OK | Yes | PASS |
| 8 | bubblesort | OK | OK | Yes | PASS |
| 9 | binsearch | OK | OK | Yes | PASS |
| 10 | caesar | OK | OK | Yes | PASS |
| 11 | palindrome | OK | OK | Yes | PASS |
| 12 | doors100 | OK | OK | Yes | PASS |
| 13 | reverse | OK | OK | Yes | PASS |
| 14 | tokenize | OK | OK | Yes | PASS |
| 15 | roman | OK | OK | Yes | PASS |
| 16 | luhn | OK | OK | Yes | PASS |
| 17 | matrix | OK | OK | Yes | PASS |

## Summary

- **17/17 Group A round-trip tests pass**
- AST comparison excludes: stmtIndex (positional), struct tags (auto-generated)
- All round-trips produce semantically identical ASTs
