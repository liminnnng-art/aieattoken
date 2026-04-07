;; Fibonacci - first 10 numbers
(defn fib [n]
  (if (<= n 1) n
    (+ (fib (- n 1)) (fib (- n 2)))))

(println (clojure.string/join " " (map fib (range 10))))
