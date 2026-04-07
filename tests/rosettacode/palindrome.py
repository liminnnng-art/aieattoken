# Palindrome detection
def is_palindrome(s):
    return s == s[::-1]

for word in ["racecar", "hello", "level", "madam"]:
    print(f"{word}: {is_palindrome(word)}")
