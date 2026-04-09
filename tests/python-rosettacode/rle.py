from itertools import groupby
def rle_encode(s):
    return "".join(f"{len(list(g))}{k}" for k, g in groupby(s))
def rle_decode(s):
    result = []
    i = 0
    while i < len(s):
        count = ""
        while i < len(s) and s[i].isdigit():
            count += s[i]; i += 1
        result.append(s[i] * int(count)); i += 1
    return "".join(result)
original = "WWWWWWWWWWWWBWWWWWWWWWWWWBBBWWWWWWWWWWWWWWWWWWWWWWWWBWWWWWWWWWWWWWW"
encoded = rle_encode(original)
decoded = rle_decode(encoded)
print(f"Original: {original}")
print(f"Encoded:  {encoded}")
print(f"Decoded match: {decoded == original}")
