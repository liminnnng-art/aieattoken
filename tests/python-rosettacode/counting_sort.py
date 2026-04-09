from collections import defaultdict
def counting_sort(arr):
    counts = defaultdict(int)
    for x in arr: counts[x] += 1
    result = []
    for key in range(min(arr), max(arr)+1):
        result.extend([key]*counts[key])
    return result
data = [4,2,2,8,3,3,1,7,5,5,4]
print(f"Before: {data}")
print(f"After:  {counting_sort(data)}")
