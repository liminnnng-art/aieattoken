;; FizzBuzz 1 to 100
(doseq [i (range 1 101)]
  (println
    (cond
      (zero? (mod i 15)) "FizzBuzz"
      (zero? (mod i 3))  "Fizz"
      (zero? (mod i 5))  "Buzz"
      :else              i)))
