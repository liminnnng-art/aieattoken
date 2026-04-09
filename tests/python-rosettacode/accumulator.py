def accumulator(initial):
    total = initial
    def add(n):
        nonlocal total
        total += n
        return total
    return add
a = accumulator(10)
print(a(5))   # 15
print(a(3))   # 18
print(a(12))  # 30
