# Fibonacci - first 10 numbers
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

print(" ".join(str(fib(i)) for i in range(10)))
