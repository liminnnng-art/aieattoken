# Luhn test
def luhn(s):
    digits = [int(c) for c in reversed(s)]
    total = 0
    for i, d in enumerate(digits):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0

for t in ["49927398716", "49927398717", "1234567812345678"]:
    print(f"{t}: {luhn(t)}")
