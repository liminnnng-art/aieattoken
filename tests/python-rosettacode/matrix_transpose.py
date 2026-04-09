matrix = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]]
transposed = [list(row) for row in zip(*matrix)]
print("Original:")
for row in matrix: print(row)
print("Transposed:")
for row in transposed: print(row)
