;; Matrix transposition
(defn print-matrix [m]
  (doseq [row m]
    (println (clojure.string/join " " (map #(format "%2d" %) row)))))

(let [m [[1 2 3 4]
         [5 6 7 8]
         [9 10 11 12]]]
  (println "Original:")
  (print-matrix m)
  (println "Transposed:")
  (print-matrix (apply mapv vector m)))
