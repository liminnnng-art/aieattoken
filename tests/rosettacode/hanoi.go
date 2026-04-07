package main

import "fmt"

func hanoi(n int, from, to, via string) {
	if n == 1 {
		fmt.Printf("Move disk 1 from %s to %s\n", from, to)
		return
	}
	hanoi(n-1, from, via, to)
	fmt.Printf("Move disk %d from %s to %s\n", n, from, to)
	hanoi(n-1, via, to, from)
}

func main() {
	hanoi(4, "A", "C", "B")
}
