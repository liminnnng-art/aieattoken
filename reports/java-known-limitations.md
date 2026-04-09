# Java Known Limitations

**Date**: 2026-04-09

## Resolved (Previously Known)

| Issue | Status | Fix |
|-------|--------|-----|
| Type witness on generic methods | RESOLVED | Preserve `javaTypeArgs` through pipeline |
| Anonymous inner classes | RESOLVED | Convert to named `__Anon_N` inner classes |
| Chained assignments | RESOLVED | Split into separate statements |
| Long literal suffix | RESOLVED | Preserve `L` suffix |
| StructDecl + standalone main() | RESOLVED | Group into single class body |

## Current Limitations

### 1. Spring Framework compilation
- **Scope**: Spring Boot annotation classes cannot be compiled without Spring dependencies
- **Impact**: Pipeline (reverse -> parse -> transform -> emit) works correctly
- **Workaround**: Use `aet convert` for compression without compilation. AETJ syntax is correct.
- **Severity**: Low (by design — Spring is a runtime dependency)

### 2. Complex stream API type inference
- **Scope**: Some complex stream chains with nested generic types may lose type information
- **Example**: `stream().collect(Collectors.groupingBy(..., Collectors.counting()))`
- **Impact**: Generated Java may need manual type annotations for edge cases
- **Severity**: Low (rare patterns, most stream operations work)

### 3. Anonymous inner classes with constructor arguments
- **Scope**: Anonymous classes that pass arguments to the superclass constructor
- **Example**: `new Thread("name") { ... }` — the `"name"` argument may be lost
- **Impact**: Most anonymous classes (Iterator, Runnable, Comparator) don't use this pattern
- **Workaround**: Use named inner classes or lambdas (modern Java best practice)
- **Severity**: Low

### 4. Method-local classes
- **Scope**: Classes defined inside method bodies (not inner classes, not anonymous)
- **Impact**: Extremely rare in modern Java
- **Severity**: Very low

### 5. Multi-catch with different exception types
- **Scope**: `catch (IOException | SQLException e)` — multi-catch with `|`
- **Impact**: Parser supports it but reverse parser may not generate it
- **Workaround**: Use separate catch blocks
- **Severity**: Low

### 6. Token savings ceiling (~30% average)
- **Scope**: Average savings across diverse Java code is ~28-32%
- **Root cause**: Identifier names (variables, methods, classes) cannot be compressed and dominate token count
- **Boilerplate-heavy code**: Achieves 44-56% savings where constructor/getter/setter elimination helps most
- **Algorithm-heavy code**: Achieves 28-35% where there's less boilerplate to eliminate
- **Impact**: The 50% target is achievable for POJO/DTO-heavy code but not for algorithm-heavy code
