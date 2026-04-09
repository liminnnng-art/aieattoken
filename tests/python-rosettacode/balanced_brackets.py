def is_balanced(s):
    stack = []
    for c in s:
        if c == '[': stack.append(c)
        elif c == ']':
            if not stack: return False
            stack.pop()
    return len(stack) == 0
tests = ["", "[]", "[][]", "[[][]]", "][", "][][", "[]][[]"]
for t in tests:
    print(f"{t!r:12s} -> {is_balanced(t)}")
