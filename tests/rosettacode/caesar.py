# Caesar cipher with shift 13
def caesar_encrypt(s, shift):
    result = []
    for c in s:
        if c.isupper():
            result.append(chr((ord(c) - ord('A') + shift) % 26 + ord('A')))
        elif c.islower():
            result.append(chr((ord(c) - ord('a') + shift) % 26 + ord('a')))
        else:
            result.append(c)
    return "".join(result)

def caesar_decrypt(s, shift):
    return caesar_encrypt(s, 26 - shift)

text = "The quick brown fox jumps over the lazy dog"
shift = 13
encrypted = caesar_encrypt(text, shift)
decrypted = caesar_decrypt(encrypted, shift)
print(f"Original:  {text}")
print(f"Encrypted: {encrypted}")
print(f"Decrypted: {decrypted}")
