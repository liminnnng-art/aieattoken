# AET-Java Demo v2

**Date**: 2026-04-08
**Syntax**: AET-Java v1 (.aetj files)

## Example 1: Generics + Constructor Auto-generation

### Java (79 tokens)
```java
public class Gcd {
    static int gcd(int a, int b) {
        while (b != 0) {
            int temp = b;
            b = a % b;
            a = temp;
        }
        return a;
    }

    public static void main(String[] args) {
        System.out.println(gcd(40902, 24140));
    }
}
```

### AET-Java (45 tokens, 43.0% saved)
```
!java-v1;$+gcd(int a,int b)->int{while b!=0{var temp=b;b=a%b;a=temp};^a};main(){pl(gcd(40902,24140))}
```

### Key compressions:
- `public class Gcd { ... }` -> implicit (no wrapper needed)
- `public static` -> `$+`
- `return a` -> `^a`
- `int temp = b` -> `var temp=b`
- `System.out.println()` -> `pl()`
- `public static void main(String[] args)` -> `main()`

---

## Example 2: Enum + Switch Expression + Inner Class

### Java (b04_celsius.java, 1038 tokens)
```java
public class b04_celsius {
    enum Unit { CELSIUS, FAHRENHEIT, KELVIN }

    static class Temperature {
        private final double value;
        private final Unit unit;

        Temperature(double value, Unit unit) {
            this.value = value;
            this.unit = unit;
        }

        private double toCelsius() {
            return switch (unit) {
                case CELSIUS -> value;
                case FAHRENHEIT -> (value - 32.0) * 5.0 / 9.0;
                case KELVIN -> value - 273.15;
            };
        }

        Temperature convertTo(Unit target) {
            double celsius = toCelsius();
            double result = switch (target) { ... };
            return new Temperature(result, target);
        }

        @Override
        public String toString() {
            String symbol = switch (unit) {
                case CELSIUS -> "C";
                case FAHRENHEIT -> "F";
                case KELVIN -> "K";
            };
            return String.format("%.2f %s", value, symbol);
        }
    }
    ...
}
```

### AET-Java (715 tokens, 31.1% saved)
```
!java-v1;...;#Unit{CELSIUS,FAHRENHEIT,KELVIN};@Temperature{!double value;!Unit unit;
-toCelsius()->double{^switch unit{CELSIUS->value;FAHRENHEIT->(value-32.0)*5.0/9.0;KELVIN->value-273.15}}
convertTo(Unit target)->Temperature{var celsius=toCelsius();var result=switch target{CELSIUS->celsius;
FAHRENHEIT->celsius*9.0/5.0+32.0;KELVIN->celsius+273.15};^Temperature(result,target)}
+toString()->String{var symbol=switch unit{CELSIUS->"C";FAHRENHEIT->"F";KELVIN->"K"};^sf("%.2f %s",value,symbol)}}
```

### Key compressions:
- `enum Unit { ... }` -> `#Unit{...}`
- `static class Temperature` -> `@Temperature{...}` (nested = static by default)
- `private final double value` -> `!double value`
- Constructor auto-generated (all `this.x = x` eliminated)
- `switch (unit) { case X -> ... }` -> `switch unit{X->...}` (no `case`, no `()`)
- `@Override public String toString()` -> `+toString()->String`
- `new Temperature(result, target)` -> `Temperature(result,target)` (no `new`)
- `String.format(...)` -> `sf(...)`

---

## Example 3: Lambda + Stream Operations

### Java (fragment)
```java
counts.entrySet().stream()
    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()
        .thenComparing(Map.Entry.comparingByKey()))
    .forEach(e -> System.out.println(e.getKey() + ": " + e.getValue()));
```

### AET-Java (fragment)
```
counts.entrySet()|ord({a,b|...})|fe({e|pl(e.getKey()+": "+e.getValue())})
```

### Key compressions:
- `.stream().sorted()` -> `|ord()`
- `.forEach()` -> `|fe()`
- `e -> System.out.println(...)` -> `{e|pl(...)}`

---

## Example 4: Generic Class with Inner Class

### Java (b03_stack.java fragment)
```java
static class GenericStack<T> {
    private final ArrayList<T> items = new ArrayList<>();

    void push(T item) { items.add(item); }
    T pop() {
        if (items.isEmpty()) throw new EmptyStackException();
        return items.remove(items.size() - 1);
    }
    T peek() {
        if (items.isEmpty()) throw new EmptyStackException();
        return items.get(items.size() - 1);
    }
    boolean isEmpty() { return items.isEmpty(); }
    int size() { return items.size(); }
}
```

### AET-Java
```
@GenericStack<T>{!ArrayList<T> items=ArrayList<>();
push(T item){items.add(item)}
pop()->T{if items.isEmpty(){throw EmptyStackException()};^items.remove(items.size()-1)}
peek()->T{if items.isEmpty(){throw EmptyStackException()};^items.get(items.size()-1)}
isEmpty()->boolean{^items.isEmpty()}
size()->int{^items.size()}}
```

### Key compressions:
- `static class GenericStack<T>` -> `@GenericStack<T>`
- `private final ArrayList<T> items = new ArrayList<>()` -> `!ArrayList<T> items=ArrayList<>()`
- `throw new EmptyStackException()` -> `throw EmptyStackException()` (no `new`)
- `return items.remove(...)` -> `^items.remove(...)`
- All method access modifiers eliminated (package-private default)

---

## Syntax Summary Table

| Java | AET-Java | Savings |
|------|----------|---------|
| `public class Name { }` | `@Name{ }` | class boilerplate |
| `enum Name { A, B }` | `#Name{A,B}` | enum keyword |
| `private final Type x;` | `!Type x` | modifier prefix |
| `public static void main(...)` | `main()` | 65% |
| `new ClassName(args)` | `ClassName(args)` | `new` eliminated |
| `switch (x) { case A -> ... }` | `switch x{A->...}` | no `case`/`()` |
| `(params) -> expr` | `{params\|expr}` | lambda |
| `.stream().map().filter()` | `\|mp()\|flt()` | pipe ops |
| `try { } catch (Ex e) { }` | `tc{ }(Ex e){ }` | try-catch |
| `System.out.println()` | `pl()` | stdlib alias |
| `@Override` | (auto) | eliminated |
| imports | (auto) | eliminated |
| Constructor (`this.x = x`) | (auto) | eliminated |
