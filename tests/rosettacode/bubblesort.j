NB. Bubble sort
bsort =: (([ , -@[ }. ]) /: 2 </\ ]) ^: _ ^: (#@] - 1:)
arr =: 5 3 8 4 2 7 1 6
echo 'Before: ', ": arr
echo 'After:  ', ": /:~ arr
exit 0
