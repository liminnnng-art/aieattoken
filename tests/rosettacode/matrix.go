package main

import "fmt"

func transpose(m [][]int) [][]int {
	rows := len(m)
	cols := len(m[0])
	t := make([][]int, cols)
	for i := range t {
		t[i] = make([]int, rows)
		for j := range t[i] {
			t[i][j] = m[j][i]
		}
	}
	return t
}

func printMatrix(m [][]int) {
	for _, row := range m {
		for j, v := range row {
			if j > 0 {
				fmt.Print(" ")
			}
			fmt.Printf("%2d", v)
		}
		fmt.Println()
	}
}

func main() {
	m := [][]int{
		{1, 2, 3, 4},
		{5, 6, 7, 8},
		{9, 10, 11, 12},
	}
	fmt.Println("Original:")
	printMatrix(m)
	fmt.Println("Transposed:")
	printMatrix(transpose(m))
}
