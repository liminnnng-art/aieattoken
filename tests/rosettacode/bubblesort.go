package main

import "fmt"

func bubbleSort(arr []int) {
	n := len(arr)
	for i := 0; i < n-1; i++ {
		for j := 0; j < n-1-i; j++ {
			if arr[j] > arr[j+1] {
				arr[j], arr[j+1] = arr[j+1], arr[j]
			}
		}
	}
}

func main() {
	arr := []int{5, 3, 8, 4, 2, 7, 1, 6}
	fmt.Println("Before:", arr)
	bubbleSort(arr)
	fmt.Println("After: ", arr)
}
