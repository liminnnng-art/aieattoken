from itertools import combinations
def power_set(s):
    result = []
    for r in range(len(s)+1):
        result.extend(combinations(s, r))
    return result
print(power_set([1,2,3]))
