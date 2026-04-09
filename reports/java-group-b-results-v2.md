# Java Group B Results v2 — AET-Java (.aetj) Syntax

**Date**: 2026-04-08
**Parser**: AET-Java dedicated parser (parser/java.ts)
**Syntax**: AET-Java v1 (.aetj files)

## Results Summary

| # | File | Java Tokens | AETJ Tokens | Savings | Status | Notes |
|---|------|:-----------:|:-----------:|:-------:|:------:|-------|
| 1 | b01_maxmin | 465 | 322 | 30.8% | PASS | arrays, static methods |
| 2 | b02_wordcount | 357 | 254 | 28.9% | ERROR | type witness on stream chain |
| 3 | b03_stack | 432 | 295 | 31.7% | PASS | generics, exceptions |
| 4 | b04_celsius | 1,038 | 688 | 33.7% | PASS | enum, switch expr, inner class |
| 5 | b05_validate | 1,225 | 927 | 24.3% | PASS | generic methods, interface, regex |
| 6 | b06_kvstore | 969 | 757 | 21.9% | PASS | Optional, generics, HashMap |
| 7 | b07_jsonlike | 1,320 | 978 | 25.9% | PASS | sealed, records, pattern matching |
| 8 | b08_csv | 1,448 | 1,097 | 24.2% | PASS | string parsing, collections |
| 9 | b09_calculator | 1,812 | 1,275 | 29.6% | PASS | enum, switch, recursive descent |
| 10 | b10_linkedlist | 3,098 | 2,181 | 29.6% | ERROR | anonymous inner class (Iterator) |

## Aggregate

- **Total Java tokens (passing)**: 9,509
- **Total AETJ tokens (passing)**: 6,239
- **Average savings (passing)**: 27.8%
- **Pass rate**: 8/10 (80%)

## vs Previous (shared AET)

| Metric | Previous AET | AET-Java v2 |
|--------|:-----------:|:-----------:|
| Pass rate | 0/10 (0%) | **8/10 (80%)** |
| Files fixed | 0 | **8 files newly passing** |

## Remaining Errors

| File | Root Cause |
|------|-----------|
| b02_wordcount | `Map.Entry.<String, Integer>comparingByValue()` — explicit type witness on generic method lost through transpile |
| b10_linkedlist | `new Iterator<T>() { ... }` — anonymous inner class implementing interface not supported in IR |
