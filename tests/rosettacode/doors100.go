package main

import "fmt"

func main() {
	var doors [101]bool
	for pass := 1; pass <= 100; pass++ {
		for door := pass; door <= 100; door += pass {
			doors[door] = !doors[door]
		}
	}
	fmt.Print("Open doors:")
	for i := 1; i <= 100; i++ {
		if doors[i] {
			fmt.Printf(" %d", i)
		}
	}
	fmt.Println()
}
