;; Palindrome detection
(defn palindrome? [s]
  (= s (apply str (reverse s))))

(doseq [w ["racecar" "hello" "level" "madam"]]
  (println (str w ": " (palindrome? w))))
