NB. Palindrome detection
ispal =: -: |.
words =: 'racecar';'hello';'level';'madam'
echo (> ,. ': ' ,"1 0 ":@ispal@>)"0 words
exit 0
