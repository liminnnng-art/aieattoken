def is_perfect(n):
    return n > 1 and sum(i for i in range(1, n) if n % i == 0) == n
print([n for n in range(1, 10001) if is_perfect(n)])
