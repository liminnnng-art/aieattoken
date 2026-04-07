;; Factorial 0! through 10!
(defn factorial [n]
  (reduce * 1 (range 1 (inc n))))

(doseq [i (range 11)]
  (println (str i "! = " (factorial i))))
