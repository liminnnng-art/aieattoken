;; Ackermann function A(3,4)
(defn ackermann [m n]
  (cond
    (zero? m) (inc n)
    (zero? n) (ackermann (dec m) 1)
    :else     (ackermann (dec m) (ackermann m (dec n)))))

(println (str "A(3,4) = " (ackermann 3 4)))
