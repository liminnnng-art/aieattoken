;; Luhn test
(defn luhn? [s]
  (let [digits (map #(- (int %) (int \0)) (reverse s))
        doubled (map-indexed (fn [i d]
                               (if (odd? i)
                                 (let [d2 (* 2 d)]
                                   (if (> d2 9) (- d2 9) d2))
                                 d))
                             digits)]
    (zero? (mod (reduce + doubled) 10))))

(doseq [t ["49927398716" "49927398717" "1234567812345678"]]
  (println (str t ": " (luhn? t))))
