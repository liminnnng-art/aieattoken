package main

import "fmt"

func binarySearch(arr []int, target int) int {
	lo, hi := 0, len(arr)-1
	for lo <= hi {
		mid := (lo + hi) / 2
		if arr[mid] == target {
			return mid
		} else if arr[mid] < target {
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return -1
}

func main() {
	arr := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	target := 7
	idx := binarySearch(arr, target)
	if idx >= 0 {
		fmt.Printf("Found %d at index %d\n", target, idx)
	} else {
		fmt.Printf("%d not found\n", target)
	}
}
