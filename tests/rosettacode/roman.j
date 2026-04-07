NB. Roman numerals encoding
toroman =: 3 : 0
  vals =. 1000 900 500 400 100 90 50 40 10 9 5 4 1
  syms =. 'M';'CM';'D';'CD';'C';'XC';'L';'XL';'X';'IX';'V';'IV';'I'
  r =. ''
  n =. y
  for_i. i. # vals do.
    v =. i { vals
    while. n >: v do.
      r =. r , > i { syms
      n =. n - v
    end.
  end.
  r
)
echo '1990 = ', toroman 1990
echo '2008 = ', toroman 2008
echo '1666 = ', toroman 1666
exit 0
