# Greatest common divisor of 48 and 18
def gcd(a, b):
    while b:
        a, b = b, a % b
    return a

print(gcd(48, 18))
