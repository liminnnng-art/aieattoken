// Compare token efficiency across Go, J, Clojure, Python for common algorithms
// Using cl100k_base tokenizer on representative implementations from RosettaCode

import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("cl100k_base");

function countTokens(code) {
  return enc.encode(code).length;
}

// Representative RosettaCode implementations in each language
// Selected for variety: math, strings, sorting, data structures

const tasks = [
  {
    name: "Fibonacci sequence",
    go: `package main

import "fmt"

func fibonacci(n int) int {
\tif n <= 1 {
\t\treturn n
\t}
\treturn fibonacci(n-1) + fibonacci(n-2)
}

func main() {
\tfor i := 0; i < 10; i++ {
\t\tfmt.Printf("%d ", fibonacci(i))
\t}
\tfmt.Println()
}`,
    j: `fib =: (-&2 +&$: -&1)^:(1&<)
fib"0 i.10`,
    clojure: `(defn fib [n]
  (if (<= n 1) n
    (+ (fib (- n 1)) (fib (- n 2)))))
(doseq [i (range 10)]
  (print (fib i) " "))
(println)`,
    python: `def fib(n):
    if n <= 1: return n
    return fib(n-1) + fib(n-2)

for i in range(10):
    print(fib(i), end=" ")
print()`
  },
  {
    name: "FizzBuzz",
    go: `package main

import "fmt"

func main() {
\tfor i := 1; i <= 100; i++ {
\t\tswitch {
\t\tcase i%15 == 0:
\t\t\tfmt.Println("FizzBuzz")
\t\tcase i%3 == 0:
\t\t\tfmt.Println("Fizz")
\t\tcase i%5 == 0:
\t\t\tfmt.Println("Buzz")
\t\tdefault:
\t\t\tfmt.Println(i)
\t\t}
\t}
}`,
    j: `FB =: ('FizzBuzz' ; 'Fizz' ; 'Buzz' ; ":)@.(0 , 0 ~: 3 5 15 |/ ]) "0
FB >: i.100`,
    clojure: `(doseq [i (range 1 101)]
  (println (cond
    (zero? (mod i 15)) "FizzBuzz"
    (zero? (mod i 3)) "Fizz"
    (zero? (mod i 5)) "Buzz"
    :else i)))`,
    python: `for i in range(1, 101):
    if i % 15 == 0: print("FizzBuzz")
    elif i % 3 == 0: print("Fizz")
    elif i % 5 == 0: print("Buzz")
    else: print(i)`
  },
  {
    name: "Bubble sort",
    go: `package main

import "fmt"

func bubbleSort(a []int) {
\tfor i := len(a) - 1; i >= 1; i-- {
\t\tfor j := 0; j < i; j++ {
\t\t\tif a[j] > a[j+1] {
\t\t\t\ta[j], a[j+1] = a[j+1], a[j]
\t\t\t}
\t\t}
\t}
}

func main() {
\ta := []int{5, 3, 8, 4, 2}
\tbubbleSort(a)
\tfmt.Println(a)
}`,
    j: `bsort =: (] {~ [: /: [: +/\\ 2 </\\ ]) ^:_
bsort 5 3 8 4 2`,
    clojure: `(defn bubble-sort [coll]
  (let [v (vec coll)]
    (reduce (fn [v i]
      (reduce (fn [v j]
        (if (> (v j) (v (inc j)))
          (assoc v j (v (inc j)) (inc j) (v j))
          v))
        v (range (- (count v) 1 i))))
      v (range (count v)))))
(println (bubble-sort [5 3 8 4 2]))`,
    python: `def bubble_sort(a):
    for i in range(len(a)-1, 0, -1):
        for j in range(i):
            if a[j] > a[j+1]:
                a[j], a[j+1] = a[j+1], a[j]
    return a

print(bubble_sort([5, 3, 8, 4, 2]))`
  },
  {
    name: "Greatest common divisor",
    go: `package main

import "fmt"

func gcd(a, b int) int {
\tfor b != 0 {
\t\ta, b = b, a%b
\t}
\treturn a
}

func main() {
\tfmt.Println(gcd(48, 18))
}`,
    j: `48 +. 18`,
    clojure: `(defn gcd [a b]
  (if (zero? b) a (recur b (mod a b))))
(println (gcd 48 18))`,
    python: `def gcd(a, b):
    while b: a, b = b, a % b
    return a

print(gcd(48, 18))`
  },
  {
    name: "Reverse a string",
    go: `package main

import "fmt"

func reverse(s string) string {
\trunes := []rune(s)
\tfor i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
\t\trunes[i], runes[j] = runes[j], runes[i]
\t}
\treturn string(runes)
}

func main() {
\tfmt.Println(reverse("Hello, World!"))
}`,
    j: `|. 'Hello, World!'`,
    clojure: `(println (apply str (reverse "Hello, World!")))`,
    python: `print("Hello, World!"[::-1])`
  },
  {
    name: "Sieve of Eratosthenes",
    go: `package main

import "fmt"

func sieve(limit int) []int {
\tis_prime := make([]bool, limit+1)
\tfor i := 2; i <= limit; i++ {
\t\tis_prime[i] = true
\t}
\tfor i := 2; i*i <= limit; i++ {
\t\tif is_prime[i] {
\t\t\tfor j := i * i; j <= limit; j += i {
\t\t\t\tis_prime[j] = false
\t\t\t}
\t\t}
\t}
\tvar primes []int
\tfor i := 2; i <= limit; i++ {
\t\tif is_prime[i] {
\t\t\tprimes = append(primes, i)
\t\t}
\t}
\treturn primes
}

func main() {
\tfmt.Println(sieve(100))
}`,
    j: `(#~ 1&p:) 2+i.99`,
    clojure: `(defn sieve [limit]
  (let [s (boolean-array (inc limit) true)]
    (doseq [i (range 2 (inc (Math/sqrt limit)))]
      (when (aget s i)
        (doseq [j (range (* i i) (inc limit) i)]
          (aset s j false))))
    (filter #(aget s %) (range 2 (inc limit)))))
(println (sieve 100))`,
    python: `def sieve(limit):
    is_prime = [True] * (limit + 1)
    for i in range(2, int(limit**0.5) + 1):
        if is_prime[i]:
            for j in range(i*i, limit+1, i):
                is_prime[j] = False
    return [i for i in range(2, limit+1) if is_prime[i]]

print(sieve(100))`
  },
  {
    name: "Factorial",
    go: `package main

import "fmt"

func factorial(n int) int {
\tif n == 0 {
\t\treturn 1
\t}
\treturn n * factorial(n-1)
}

func main() {
\tfor i := 0; i <= 10; i++ {
\t\tfmt.Printf("%d! = %d\\n", i, factorial(i))
\t}
}`,
    j: `(,. ; !)"0 i.11`,
    clojure: `(defn factorial [n]
  (if (zero? n) 1 (* n (factorial (dec n)))))
(doseq [i (range 11)]
  (println (str i "! = " (factorial i))))`,
    python: `def factorial(n):
    return 1 if n == 0 else n * factorial(n-1)

for i in range(11):
    print(f"{i}! = {factorial(i)}")`
  },
  {
    name: "Caesar cipher",
    go: `package main

import "fmt"

func caesar(text string, shift int) string {
\tresult := make([]byte, len(text))
\tfor i, c := range text {
\t\tswitch {
\t\tcase c >= 'a' && c <= 'z':
\t\t\tresult[i] = byte('a' + (int(c-'a')+shift)%26)
\t\tcase c >= 'A' && c <= 'Z':
\t\t\tresult[i] = byte('A' + (int(c-'A')+shift)%26)
\t\tdefault:
\t\t\tresult[i] = byte(c)
\t\t}
\t}
\treturn string(result)
}

func main() {
\tplain := "The quick brown fox jumps over the lazy dog"
\tenc := caesar(plain, 13)
\tdec := caesar(enc, -13)
\tfmt.Println(enc)
\tfmt.Println(dec)
}`,
    j: `caesar =: 4 : '(a.{~26|((a.i.y)-a.i.''a'')+x) (I.y e.''abcdefghijklmnopqrstuvwxyz'')} y'
13 caesar 'the quick brown fox jumps over the lazy dog'`,
    clojure: `(defn caesar [text shift]
  (apply str
    (map (fn [c]
      (cond
        (<= (int \\a) (int c) (int \\z))
        (char (+ (int \\a) (mod (+ (- (int c) (int \\a)) shift) 26)))
        (<= (int \\A) (int c) (int \\Z))
        (char (+ (int \\A) (mod (+ (- (int c) (int \\A)) shift) 26)))
        :else c))
      text)))
(let [plain "The quick brown fox jumps over the lazy dog"]
  (println (caesar plain 13))
  (println (caesar (caesar plain 13) -13)))`,
    python: `def caesar(text, shift):
    result = []
    for c in text:
        if c.isalpha():
            base = ord('A') if c.isupper() else ord('a')
            result.append(chr((ord(c) - base + shift) % 26 + base))
        else:
            result.append(c)
    return ''.join(result)

plain = "The quick brown fox jumps over the lazy dog"
enc = caesar(plain, 13)
print(enc)
print(caesar(enc, -13))`
  },
  {
    name: "Binary search",
    go: `package main

import "fmt"

func binarySearch(a []int, target int) int {
\tlo, hi := 0, len(a)-1
\tfor lo <= hi {
\t\tmid := (lo + hi) / 2
\t\tswitch {
\t\tcase a[mid] == target:
\t\t\treturn mid
\t\tcase a[mid] < target:
\t\t\tlo = mid + 1
\t\tdefault:
\t\t\thi = mid - 1
\t\t}
\t}
\treturn -1
}

func main() {
\ta := []int{1, 3, 5, 7, 9, 11, 13, 15}
\tfmt.Println(binarySearch(a, 7))
}`,
    j: `a =: 1 3 5 7 9 11 13 15
a I. 7`,
    clojure: `(defn binary-search [a target]
  (loop [lo 0 hi (dec (count a))]
    (when (<= lo hi)
      (let [mid (quot (+ lo hi) 2)
            v (a mid)]
        (cond
          (= v target) mid
          (< v target) (recur (inc mid) hi)
          :else (recur lo (dec mid)))))))
(println (binary-search [1 3 5 7 9 11 13 15] 7))`,
    python: `def binary_search(a, target):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == target: return mid
        elif a[mid] < target: lo = mid + 1
        else: hi = mid - 1
    return -1

print(binary_search([1, 3, 5, 7, 9, 11, 13, 15], 7))`
  },
  {
    name: "ROT13",
    go: `package main

import (
\t"fmt"
\t"strings"
)

func rot13(s string) string {
\treturn strings.Map(func(r rune) rune {
\t\tswitch {
\t\tcase r >= 'a' && r <= 'z':
\t\t\treturn 'a' + (r-'a'+13)%26
\t\tcase r >= 'A' && r <= 'Z':
\t\t\treturn 'A' + (r-'A'+13)%26
\t\t}
\t\treturn r
\t}, s)
}

func main() {
\tfmt.Println(rot13("Hello, World!"))
}`,
    j: `rot13 =: (a.{~13|~26|a.&.(i.&a.)) :. ]
rot13 'Hello, World!'`,
    clojure: `(defn rot13 [s]
  (apply str
    (map (fn [c]
      (let [i (int c)]
        (cond
          (<= 65 i 90) (char (+ 65 (mod (+ (- i 65) 13) 26)))
          (<= 97 i 122) (char (+ 97 (mod (+ (- i 97) 13) 26)))
          :else c)))
      s)))
(println (rot13 "Hello, World!"))`,
    python: `import codecs
print(codecs.encode("Hello, World!", "rot_13"))`
  },
  {
    name: "Palindrome detection",
    go: `package main

import (
\t"fmt"
\t"strings"
)

func isPalindrome(s string) bool {
\ts = strings.ToLower(s)
\trunes := []rune(s)
\tfor i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
\t\tif runes[i] != runes[j] {
\t\t\treturn false
\t\t}
\t}
\treturn true
}

func main() {
\twords := []string{"racecar", "hello", "level", "world"}
\tfor _, w := range words {
\t\tfmt.Printf("%s: %v\\n", w, isPalindrome(w))
\t}
}`,
    j: `palindrome =: -: |.
palindrome &> 'racecar';'hello';'level';'world'`,
    clojure: `(defn palindrome? [s]
  (let [s (clojure.string/lower-case s)]
    (= s (apply str (reverse s)))))
(doseq [w ["racecar" "hello" "level" "world"]]
  (println (str w ": " (palindrome? w))))`,
    python: `def is_palindrome(s):
    s = s.lower()
    return s == s[::-1]

for w in ["racecar", "hello", "level", "world"]:
    print(f"{w}: {is_palindrome(w)}")`
  },
  {
    name: "Towers of Hanoi",
    go: `package main

import "fmt"

func hanoi(n int, from, to, via string) {
\tif n > 0 {
\t\thanoi(n-1, from, via, to)
\t\tfmt.Printf("Move disk %d from %s to %s\\n", n, from, to)
\t\thanoi(n-1, via, to, from)
\t}
}

func main() {
\thanoi(4, "A", "B", "C")
}`,
    j: `hanoi =: 3 : 0
hanoi =: 3 : 'if. 1<y do. (x,{.z) hanoi y-1 [ echo y;'' '';(1{x);'' -> '';(0{x) [ ({:z,x) hanoi y-1 end.'`,
    clojure: `(defn hanoi [n from to via]
  (when (pos? n)
    (hanoi (dec n) from via to)
    (println (str "Move disk " n " from " from " to " to))
    (hanoi (dec n) via to from)))
(hanoi 4 "A" "B" "C")`,
    python: `def hanoi(n, frm, to, via):
    if n > 0:
        hanoi(n-1, frm, via, to)
        print(f"Move disk {n} from {frm} to {to}")
        hanoi(n-1, via, to, frm)

hanoi(4, "A", "B", "C")`
  }
];

// Analyze each task
const results = tasks.map(task => {
  const goTokens = countTokens(task.go);
  const jTokens = countTokens(task.j);
  const clojureTokens = countTokens(task.clojure);
  const pythonTokens = countTokens(task.python);
  return {
    name: task.name,
    go: goTokens,
    j: jTokens,
    clojure: clojureTokens,
    python: pythonTokens,
    goLines: task.go.split("\n").length,
    jLines: task.j.split("\n").length,
    clojureLines: task.clojure.split("\n").length,
    pythonLines: task.python.split("\n").length,
    jSavingsVsGo: ((1 - jTokens / goTokens) * 100).toFixed(1),
    clojureSavingsVsGo: ((1 - clojureTokens / goTokens) * 100).toFixed(1),
    pythonSavingsVsGo: ((1 - pythonTokens / goTokens) * 100).toFixed(1)
  };
});

// Summary statistics
const totals = results.reduce((acc, r) => ({
  go: acc.go + r.go,
  j: acc.j + r.j,
  clojure: acc.clojure + r.clojure,
  python: acc.python + r.python
}), { go: 0, j: 0, clojure: 0, python: 0 });

// Analyze what makes J so efficient
const jPatterns = {
  "No boilerplate": "J has no import/package/main/func - just expressions",
  "Tacit programming": "Functions composed without naming arguments (point-free)",
  "Single-char primitives": "Built-in operations are 1-2 chars: +/ (sum), |. (reverse), #~ (filter)",
  "Array orientation": "Operations apply to whole arrays implicitly, no loops needed",
  "No type declarations": "Types are implicit based on data",
  "No error handling": "Errors are handled by the runtime, not in user code",
  "Dense operators": "Mathematical notation instead of English keywords"
};

const clojurePatterns = {
  "No type declarations": "Dynamic typing eliminates all type annotations",
  "Expression-based": "Everything is an expression, no statements vs expressions distinction",
  "Higher-order functions": "map, filter, reduce replace explicit loops",
  "No error boilerplate": "Exceptions handle errors without explicit checking",
  "Minimal syntax": "Only parentheses for structure, no braces/brackets/semicolons",
  "Standard library naming": "Functions like 'inc', 'dec', 'pos?' are short",
  "Destructuring": "Pattern matching in function arguments"
};

const pythonPatterns = {
  "No type declarations": "Dynamic typing (though type hints exist)",
  "No braces": "Indentation-based structure saves tokens",
  "List comprehensions": "[x for x in items if pred(x)] replaces multi-line loops",
  "No error boilerplate": "Exceptions, not explicit error checking",
  "String operations": "Slicing notation s[::-1] is very token-efficient",
  "Standard library": "Rich builtins reduce code: sorted(), reversed(), etc.",
  "No main function": "Top-level code executes directly"
};

console.log(JSON.stringify({ results, totals, jPatterns, clojurePatterns, pythonPatterns }, null, 2));

enc.free();
