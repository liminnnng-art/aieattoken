;; Tokenize a string by comma
(doseq [t (clojure.string/split "Hello,How,Are,You,Today" #",")]
  (println t))
