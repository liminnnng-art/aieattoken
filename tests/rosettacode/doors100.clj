;; 100 doors problem
(let [doors (reduce (fn [d pass]
                      (reduce #(update %1 %2 not)
                              d (range pass 101 pass)))
                    (vec (repeat 101 false))
                    (range 1 101))
      open (filter #(nth doors %) (range 1 101))]
  (println (str "Open doors: " (clojure.string/join " " open))))
