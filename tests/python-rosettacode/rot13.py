import string
rot13 = str.maketrans(
    string.ascii_lowercase + string.ascii_uppercase,
    string.ascii_lowercase[13:] + string.ascii_lowercase[:13] +
    string.ascii_uppercase[13:] + string.ascii_uppercase[:13]
)
msg = "The Quick Brown Fox Jumps Over The Lazy Dog"
encoded = msg.translate(rot13)
decoded = encoded.translate(rot13)
print(f"Original: {msg}")
print(f"Encoded:  {encoded}")
print(f"Decoded:  {decoded}")
