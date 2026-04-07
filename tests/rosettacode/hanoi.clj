;; Towers of Hanoi - 4 disks
(defn hanoi [n from to via]
  (when (pos? n)
    (hanoi (dec n) from via to)
    (println (str "Move disk " n " from " from " to " to))
    (hanoi (dec n) via to from)))

(hanoi 4 "A" "C" "B")
