# 100 doors problem
doors = [False] * 101
for p in range(1, 101):
    for d in range(p, 101, p):
        doors[d] = not doors[d]

open_doors = [i for i in range(1, 101) if doors[i]]
print("Open doors:", " ".join(map(str, open_doors)))
