# Binary search - find 7 in sorted array
def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1

arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
target = 7
idx = binary_search(arr, target)
if idx >= 0:
    print(f"Found {target} at index {idx}")
else:
    print(f"{target} not found")
