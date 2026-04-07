;; Binary search - find 7 in sorted array
(defn binary-search [arr target]
  (loop [lo 0 hi (dec (count arr))]
    (when (<= lo hi)
      (let [mid (quot (+ lo hi) 2)
            v (nth arr mid)]
        (cond
          (= v target) mid
          (< v target) (recur (inc mid) hi)
          :else        (recur lo (dec mid)))))))

(let [arr [1 2 3 4 5 6 7 8 9 10]
      target 7
      idx (binary-search arr target)]
  (if idx
    (println (str "Found " target " at index " idx))
    (println (str target " not found"))))
