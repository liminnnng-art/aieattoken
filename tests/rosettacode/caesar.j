NB. Caesar cipher with shift 13 (ROT13)
rot13 =: 3 : 0
  i =. (a. i. y) - a. i. 'a'
  upper =. (a. i. y) - a. i. 'A'
  low =. (y >: 'a') *. y <: 'z'
  up =. (y >: 'A') *. y <: 'Z'
  r =. y
  r =. ((26 | i + 13) { 'abcdefghijklmnopqrstuvwxyz') (I. low)} r
  r =. ((26 | upper + 13) { 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') (I. up)} r
)
text =: 'The quick brown fox jumps over the lazy dog'
enc =: rot13 text
dec =: rot13 enc
echo 'Original:  ', text
echo 'Encrypted: ', enc
echo 'Decrypted: ', dec
exit 0
