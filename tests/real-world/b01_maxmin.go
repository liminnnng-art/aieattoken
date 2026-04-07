package main

import "fmt"

func findMax(nums []int) (int, error) {
	if len(nums) == 0 {
		return 0, fmt.Errorf("empty slice")
	}
	max := nums[0]
	for _, n := range nums {
		if n > max {
			max = n
		}
	}
	return max, nil
}

func findMin(nums []int) (int, error) {
	if len(nums) == 0 {
		return 0, fmt.Errorf("empty slice")
	}
	min := nums[0]
	for _, n := range nums {
		if n < min {
			min = n
		}
	}
	return min, nil
}

func findMaxMin(nums []int) (int, int, error) {
	max, err := findMax(nums)
	if err != nil {
		return 0, 0, err
	}
	min, err := findMin(nums)
	if err != nil {
		return 0, 0, err
	}
	return max, min, nil
}

func main() {
	data := []int{3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5}
	max, min, err := findMaxMin(data)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Printf("Max: %d, Min: %d\n", max, min)
}
