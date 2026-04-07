NB. Ackermann function A(3,4)
ack =: 3 : 0
  'm n' =. y
  if. m = 0 do. n + 1
  elseif. n = 0 do. ack (m-1), 1
  elseif. do. ack (m-1), ack m, n-1
  end.
)
echo 'A(3,4) = ', ": ack 3 4
exit 0
