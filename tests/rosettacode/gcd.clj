;; Greatest common divisor of 48 and 18
(defn gcd [a b]
  (if (zero? b) a (recur b (mod a b))))

(println (gcd 48 18))
