# Java Fixes Summary

**Date**: 2026-04-09

## Round 1: Fix Emitter Bugs (2 files)

### Fix 1: b02_wordcount — Type witness preservation
- **Problem**: `Map.Entry.<String, Integer>comparingByValue()` lost `<String, Integer>` type witness
- **Root cause**: AETJ output didn't emit `javaTypeArgs` metadata on CallExpr
- **Fix**: AETJ emitter outputs type args, transformer preserves them via offset mapping, Java emitter re-emits them
- **Files**: reverse/java.ts, transformer/java.ts, emitter/java.ts
- **Time**: ~20 min
- **Result**: PASS

### Fix 2: b10_linkedlist — Anonymous inner class
- **Problem**: `new Iterator<>() { ... }` lost anonymous class body
- **Root cause**: No IR representation for anonymous inner classes
- **Fix**: Convert to named inner class (`__Anon_N`), register in parent class
- **Files**: reverse/java.ts, emitter/java.ts, transformer/java.ts
- **Time**: ~25 min
- **Result**: PASS

### Fix 3: Chained assignment splitting
- **Problem**: `head = tail = node` lost the inner assignment side effect
- **Fix**: `flattenChainedAssign` splits into separate statements
- **Files**: reverse/java.ts
- **Result**: Fixed b05_validate edge case

### Fix 4: Post-increment in array index
- **Problem**: `arr[i++] = val` dropped the `i++` side effect
- **Fix**: `collectPostIncDecSideEffects` extracts and emits separately
- **Files**: reverse/java.ts

## Round 2: Boilerplate Class Fixes (3 bugs)

### Fix 5: Missing Objects import
- **Problem**: `import java.util.Objects` not added when using `Objects.equals()`
- **Root cause**: Emitter created fresh ImportTracker, discarding transformer-resolved imports
- **Fix**: Seed ImportTracker from `program.imports`
- **Files**: emitter/java.ts

### Fix 6: Duplicate class from StructDecl
- **Problem**: StructDecl + standalone main() created two classes with same name
- **Root cause**: AETJ output split class body and main() into separate declarations
- **Fix**: Group standalone functions into StructDecl body in `javaIrToAETJ`
- **Files**: reverse/java.ts

### Fix 7: Auto-constructor for non-final fields
- **Problem**: Classes with mutable fields didn't get auto-generated constructor
- **Fix**: Extended `needsAllArgsCtor` to handle non-final fields with no initializers
- **Files**: emitter/java.ts

### Fix 8: Long literal suffix
- **Problem**: `1L` became `1`, causing `int cannot be converted to Long`
- **Fix**: Preserve `L` suffix for long type literals
- **Files**: reverse/java.ts

## Round 3: Spring Boot

### Added 11 Spring Boot annotation aliases
- All verified as single cl100k_base tokens
- Added `isAnnotation` flag for annotation-type aliases
- Pipeline tests pass (javac requires Spring deps)

## Round 4: Boilerplate Tests (5 files)

### Results
| File | Java Tokens | AETJ Tokens | Savings |
|------|:-----------:|:-----------:|:-------:|
| CustomerDTO | 865 | 381 | **56.0%** |
| ProductEntity | 890 | 393 | **55.8%** |
| EmployeeRecord | 769 | 465 | 39.5% |
| AddressVO | 546 | 341 | 37.5% |
| InvoiceDTO | 1,160 | 783 | 32.5% |
| **Average** | | | **44.1%** |
