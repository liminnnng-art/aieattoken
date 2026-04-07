;; Reverse a string
(let [s "Hello, World!"]
  (println (str "Original: " s))
  (println (str "Reversed: " (apply str (reverse s)))))
