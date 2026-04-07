;; Bubble sort
(defn bubble-pass [coll]
  (reduce (fn [acc x]
            (if (and (seq acc) (> (peek acc) x))
              (conj (pop acc) x (peek acc))
              (conj acc x)))
          [] coll))

(defn bubble-sort [coll]
  (let [sorted (bubble-pass coll)]
    (if (= sorted coll) sorted (recur sorted))))

(let [arr [5 3 8 4 2 7 1 6]]
  (println "Before:" arr)
  (println "After: " (bubble-sort arr)))
