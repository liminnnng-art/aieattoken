package main

import "fmt"

func isPalindrome(s string) bool {
	n := len(s)
	for i := 0; i < n/2; i++ {
		if s[i] != s[n-1-i] {
			return false
		}
	}
	return true
}

func main() {
	words := []string{"racecar", "hello", "level", "madam"}
	for _, w := range words {
		fmt.Printf("%s: %t\n", w, isPalindrome(w))
	}
}
