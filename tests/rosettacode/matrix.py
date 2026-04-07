# Matrix transposition
def print_matrix(m):
    for row in m:
        print(" ".join(f"{v:2d}" for v in row))

def transpose(m):
    return [list(row) for row in zip(*m)]

m = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
]

print("Original:")
print_matrix(m)
print("Transposed:")
print_matrix(transpose(m))
