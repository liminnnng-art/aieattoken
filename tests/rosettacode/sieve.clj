;; Sieve of Eratosthenes - primes up to 100
(defn sieve [limit]
  (let [composites (set (for [i (range 2 (inc (Math/sqrt limit)))
                              j (range (* i i) (inc limit) i)]
                          j))]
    (filter #(not (composites %)) (range 2 (inc limit)))))

(println (clojure.string/join " " (sieve 100)))
