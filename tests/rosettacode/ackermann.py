# Ackermann function A(3,4)
import sys
sys.setrecursionlimit(10000)

def ackermann(m, n):
    if m == 0:
        return n + 1
    if n == 0:
        return ackermann(m - 1, 1)
    return ackermann(m - 1, ackermann(m, n - 1))

print(f"A(3,4) = {ackermann(3, 4)}")
