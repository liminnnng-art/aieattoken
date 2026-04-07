;; Caesar cipher with shift 13
(defn caesar-encrypt [s shift]
  (apply str
    (map (fn [c]
           (cond
             (Character/isUpperCase c)
             (char (+ (int \A) (mod (+ (- (int c) (int \A)) shift) 26)))
             (Character/isLowerCase c)
             (char (+ (int \a) (mod (+ (- (int c) (int \a)) shift) 26)))
             :else c))
         s)))

(defn caesar-decrypt [s shift]
  (caesar-encrypt s (- 26 shift)))

(let [text "The quick brown fox jumps over the lazy dog"
      shift 13
      encrypted (caesar-encrypt text shift)
      decrypted (caesar-decrypt encrypted shift)]
  (println (str "Original:  " text))
  (println (str "Encrypted: " encrypted))
  (println (str "Decrypted: " decrypted)))
