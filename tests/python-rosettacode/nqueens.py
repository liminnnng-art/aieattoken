def queens(n):
    def solve(row, cols, diag1, diag2):
        if row == n:
            yield list(cols)
            return
        for col in range(n):
            if col not in cols and (row-col) not in diag1 and (row+col) not in diag2:
                yield from solve(row+1, cols+[col], diag1|{row-col}, diag2|{row+col})
    return list(solve(0, [], set(), set()))
solutions = queens(8)
print(f"8-Queens solutions: {len(solutions)}")
print(f"First solution: {solutions[0]}")
