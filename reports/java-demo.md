# Demo: AET vs Java -- Factorial (Medium Difficulty)

## Original Java Source -- 87 tokens

```java
public class Factorial {
    public static long factorial(int n) {
        if (n == 0) return 1;
        return n * factorial(n - 1);
    }

    public static void main(String[] args) {
        for (int i = 0; i <= 16; i++) {
            System.out.printf("%d! = %d%n", i, factorial(i));
        }
    }
}
```

## AET Representation -- 63 tokens

```
!v2;factorial(n:int)->int64{if (n==0){^1};^n*factorial(n-1)};main(args:[]string){for i:=0;i<=16;i++{pf("%d! = %d%n",i,factorial(i))}}
```

## Regenerated Java Source (from AET)

```java
public class Factorial {

    public static long factorial(int n) {
        if (n == 0) {
            return 1;
        }
        return n * factorial(n - 1);

    }

    public static void main(String[] args) {
        for (var i = 0; i <= 16; i++) {
            System.out.printf("%d! = %d%n", i, factorial(i));
        }

    }
}
```

Round-trip status: **PASS** -- regenerated Java produces identical output to original.

## Token Comparison

| Representation | Tokens | vs Java |
|----------------|-------:|--------:|
| Java source | 87 | baseline |
| **AET** | **63** | **-27.6%** |

## Where Tokens Are Saved

| Compression Source | Tokens Saved |
|-------------------|------------:|
| `public class Factorial {` wrapper | ~5 |
| `public static` modifiers x 2 | ~4 |
| `return` to `^` | 2 |
| `System.out.printf` to `pf` | ~3 |
| `String[] args` type annotation | ~2 |
| Whitespace/newlines to `;` separators | ~8 |
| **Total** | **~24 tokens** |

## What This Demonstrates

This is a clean algorithmic program -- the simplest category for Java. The 27.6% savings come primarily from eliminating Java's structural overhead:

- **Class wrapper** -- Java requires every function to live inside a class. AET drops the class shell entirely.
- **Access modifiers** -- `public static` on every method is pure ceremony for a standalone program. AET infers these from context.
- **Verbose stdlib** -- `System.out.printf` becomes `pf`, a 3-token savings per call.
- **Return keyword** -- `return` becomes `^`, saving 1 token per return statement.

Real-world Java with POJO boilerplate, import blocks, getter/setter chains, and try-catch patterns would see significantly higher savings than 27.6%.
