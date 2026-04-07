NB. Towers of Hanoi - 4 disks
hanoi =: 3 : 0
  'n f t v' =. y
  if. n = 1 do.
    echo 'Move disk 1 from ', f, ' to ', t
  else.
    hanoi (n-1); f; v; t
    echo ('Move disk ', (": n), ' from ', f, ' to ', t)
    hanoi (n-1); v; t; f
  end.
)
hanoi 4; 'A'; 'C'; 'B'
exit 0
