def hailstone(n):
    seq = [n]
    while n != 1:
        n = n // 2 if n % 2 == 0 else 3 * n + 1
        seq.append(n)
    return seq
h27 = hailstone(27)
print(f"Hailstone(27): length={len(h27)}")
print(f"First 4: {h27[:4]}")
print(f"Last 4:  {h27[-4:]}")
longest = max(range(1, 100001), key=lambda n: len(hailstone(n)))
print(f"Longest under 100000: {longest} (length {len(hailstone(longest))})")
