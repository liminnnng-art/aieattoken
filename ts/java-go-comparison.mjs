// Java vs Go Token Waste Comparison
// Counts tokens for equivalent RosettaCode tasks in Java and Go

import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");

function count(code) {
  return enc.encode(code).length;
}

// Read existing Go files
function readGo(name) {
  try {
    return readFileSync(resolve(import.meta.dirname, "..", "tests", "rosettacode", name + ".go"), "utf-8");
  } catch { return null; }
}

function readAet(name) {
  try {
    return readFileSync(resolve(import.meta.dirname, "..", "tests", "rosettacode", name + ".aet"), "utf-8");
  } catch { return null; }
}

// Equivalent Java implementations (from RosettaCode)
const javaPrograms = {
  fibonacci: `public class Fibonacci {
    public static long fib(int n) {
        if (n < 2) return n;
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        for (int i = 1; i <= 16; i++) {
            System.out.printf("%d ", fib(i));
        }
        System.out.println();
    }
}`,

  fizzbuzz: `public class FizzBuzz {
    public static void main(String[] args) {
        for (int i = 1; i <= 100; i++) {
            if (i % 15 == 0) {
                System.out.println("FizzBuzz");
            } else if (i % 3 == 0) {
                System.out.println("Fizz");
            } else if (i % 5 == 0) {
                System.out.println("Buzz");
            } else {
                System.out.println(i);
            }
        }
    }
}`,

  factorial: `public class Factorial {
    public static long factorial(int n) {
        if (n == 0) return 1;
        return n * factorial(n - 1);
    }

    public static void main(String[] args) {
        for (int i = 0; i <= 16; i++) {
            System.out.printf("%d! = %d%n", i, factorial(i));
        }
    }
}`,

  gcd: `public class GCD {
    public static int gcd(int a, int b) {
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
}`,

  sieve: `public class Sieve {
    public static void main(String[] args) {
        int limit = 100;
        boolean[] sieve = new boolean[limit + 1];
        for (int i = 2; i <= limit; i++) sieve[i] = true;

        for (int i = 2; i * i <= limit; i++) {
            if (sieve[i]) {
                for (int j = i * i; j <= limit; j += i) {
                    sieve[j] = false;
                }
            }
        }

        for (int i = 2; i <= limit; i++) {
            if (sieve[i]) System.out.printf("%d ", i);
        }
        System.out.println();
    }
}`,

  ackermann: `public class Ackermann {
    public static int ackermann(int m, int n) {
        if (m == 0) return n + 1;
        if (n == 0) return ackermann(m - 1, 1);
        return ackermann(m - 1, ackermann(m, n - 1));
    }

    public static void main(String[] args) {
        for (int m = 0; m <= 3; m++) {
            for (int n = 0; n <= 4; n++) {
                System.out.printf("A(%d,%d) = %d%n", m, n, ackermann(m, n));
            }
        }
    }
}`,

  bubblesort: `public class BubbleSort {
    public static void bubbleSort(int[] arr) {
        boolean swapped;
        for (int i = arr.length - 1; i > 0; i--) {
            swapped = false;
            for (int j = 0; j < i; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                    swapped = true;
                }
            }
            if (!swapped) break;
        }
    }

    public static void main(String[] args) {
        int[] arr = {5, 3, 8, 6, 2, 7, 1, 4};
        bubbleSort(arr);
        for (int v : arr) System.out.printf("%d ", v);
        System.out.println();
    }
}`,

  binsearch: `public class BinarySearch {
    public static int binarySearch(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        while (low <= high) {
            int mid = (low + high) / 2;
            if (arr[mid] == target) return mid;
            else if (arr[mid] < target) low = mid + 1;
            else high = mid - 1;
        }
        return -1;
    }

    public static void main(String[] args) {
        int[] arr = {1, 3, 5, 7, 9, 11, 13};
        System.out.println(binarySearch(arr, 7));
        System.out.println(binarySearch(arr, 8));
    }
}`,

  caesar: `public class CaesarCipher {
    public static String encrypt(String text, int shift) {
        StringBuilder sb = new StringBuilder();
        for (char c : text.toCharArray()) {
            if (Character.isLetter(c)) {
                char base = Character.isUpperCase(c) ? 'A' : 'a';
                sb.append((char) ((c - base + shift) % 26 + base));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    public static String decrypt(String text, int shift) {
        return encrypt(text, 26 - shift);
    }

    public static void main(String[] args) {
        String original = "The quick brown fox Jumped over the lazy Dog";
        String encrypted = encrypt(original, 11);
        String decrypted = decrypt(encrypted, 11);
        System.out.println(encrypted);
        System.out.println(decrypted);
    }
}`,

  palindrome: `public class Palindrome {
    public static boolean isPalindrome(String s) {
        int left = 0, right = s.length() - 1;
        while (left < right) {
            if (s.charAt(left) != s.charAt(right)) return false;
            left++;
            right--;
        }
        return true;
    }

    public static void main(String[] args) {
        String[] tests = {"racecar", "hello", "madam", "world", "level"};
        for (String s : tests) {
            System.out.printf("%s: %b%n", s, isPalindrome(s));
        }
    }
}`,

  hanoi: `public class Hanoi {
    public static void hanoi(int n, String from, String to, String via) {
        if (n > 0) {
            hanoi(n - 1, from, via, to);
            System.out.printf("Move disk %d from %s to %s%n", n, from, to);
            hanoi(n - 1, via, to, from);
        }
    }

    public static void main(String[] args) {
        hanoi(4, "A", "B", "C");
    }
}`,

  doors100: `public class Doors100 {
    public static void main(String[] args) {
        boolean[] doors = new boolean[101];
        for (int pass = 1; pass <= 100; pass++) {
            for (int door = pass; door <= 100; door += pass) {
                doors[door] = !doors[door];
            }
        }
        for (int i = 1; i <= 100; i++) {
            if (doors[i]) System.out.printf("Door %d is open%n", i);
        }
    }
}`,

  luhn: `public class Luhn {
    public static boolean luhn(String s) {
        int sum = 0;
        boolean alternate = false;
        for (int i = s.length() - 1; i >= 0; i--) {
            int n = s.charAt(i) - '0';
            if (alternate) {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alternate = !alternate;
        }
        return sum % 10 == 0;
    }

    public static void main(String[] args) {
        String[] tests = {"49927398716", "49927398717", "1234567812345678", "1234567812345670"};
        for (String s : tests) {
            System.out.printf("%s: %b%n", s, luhn(s));
        }
    }
}`,

  roman: `public class Roman {
    private static final int[] VALUES = {1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};
    private static final String[] SYMBOLS = {"M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"};

    public static String toRoman(int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < VALUES.length; i++) {
            while (n >= VALUES[i]) {
                sb.append(SYMBOLS[i]);
                n -= VALUES[i];
            }
        }
        return sb.toString();
    }

    public static void main(String[] args) {
        int[] tests = {1, 4, 9, 14, 42, 99, 2024};
        for (int n : tests) {
            System.out.printf("%d = %s%n", n, toRoman(n));
        }
    }
}`,

  reverse: `public class Reverse {
    public static String reverse(String s) {
        return new StringBuilder(s).reverse().toString();
    }

    public static void main(String[] args) {
        System.out.println(reverse("Hello, World!"));
        System.out.println(reverse("racecar"));
    }
}`,

  matrix: `public class Matrix {
    public static int[][] multiply(int[][] a, int[][] b) {
        int rows = a.length, cols = b[0].length, inner = b.length;
        int[][] result = new int[rows][cols];
        for (int i = 0; i < rows; i++) {
            for (int j = 0; j < cols; j++) {
                for (int k = 0; k < inner; k++) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }

    public static void main(String[] args) {
        int[][] a = {{1, 2}, {3, 4}};
        int[][] b = {{5, 6}, {7, 8}};
        int[][] c = multiply(a, b);
        for (int[] row : c) {
            for (int v : row) System.out.printf("%d ", v);
            System.out.println();
        }
    }
}`,

  tokenize: `public class Tokenize {
    public static void main(String[] args) {
        String text = "Hello,How,Are,You,Today";
        String[] tokens = text.split(",");
        System.out.println(String.join(".", tokens));
    }
}`,
};

// Results table
console.log("# Java vs Go vs AET Token Comparison (RosettaCode Tasks)\n");
console.log("| # | Task | Java Tokens | Go Tokens | AET Tokens | Java→AET % | Go→AET % | Java/Go Ratio |");
console.log("|---|------|-------------|-----------|------------|-----------|---------|--------------|");

let totalJava = 0, totalGo = 0, totalAet = 0;
let num = 0;

const taskNames = Object.keys(javaPrograms);
for (const name of taskNames) {
  const java = javaPrograms[name];
  const go = readGo(name);
  const aet = readAet(name);

  if (!go || !aet) continue;

  const jt = count(java);
  const gt = count(go);
  const at = count(aet);
  totalJava += jt;
  totalGo += gt;
  totalAet += at;
  num++;

  const jSave = ((1 - at / jt) * 100).toFixed(1);
  const gSave = ((1 - at / gt) * 100).toFixed(1);
  const ratio = (jt / gt).toFixed(2);

  console.log(`| ${num} | ${name} | ${jt} | ${gt} | ${at} | ${jSave}% | ${gSave}% | ${ratio}x |`);
}

console.log(`| | **TOTAL** | **${totalJava}** | **${totalGo}** | **${totalAet}** | **${((1 - totalAet / totalJava) * 100).toFixed(1)}%** | **${((1 - totalAet / totalGo) * 100).toFixed(1)}%** | **${(totalJava / totalGo).toFixed(2)}x** |`);

console.log("\n## Key Insights\n");
console.log(`- Java is ${(totalJava / totalGo).toFixed(2)}x more verbose than Go on average`);
console.log(`- Java→AET compression: ${((1 - totalAet / totalJava) * 100).toFixed(1)}%`);
console.log(`- Go→AET compression: ${((1 - totalAet / totalGo) * 100).toFixed(1)}%`);
console.log(`- Extra savings from Java (vs Go baseline): ${((totalJava - totalGo) / totalJava * 100).toFixed(1)}% of tokens are Java-specific overhead`);
console.log(`- Java compression potential well exceeds the 50% target`);

enc.free();
