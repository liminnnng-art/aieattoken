;; Roman numerals encoding
(defn to-roman [n]
  (let [vals  [1000 900 500 400 100 90 50 40 10 9 5 4 1]
        syms  ["M" "CM" "D" "CD" "C" "XC" "L" "XL" "X" "IX" "V" "IV" "I"]]
    (loop [n n i 0 result ""]
      (if (>= i (count vals))
        result
        (if (>= n (nth vals i))
          (recur (- n (nth vals i)) i (str result (nth syms i)))
          (recur n (inc i) result))))))

(doseq [n [1990 2008 1666]]
  (println (str n " = " (to-roman n))))
