package main

import "fmt"

func sieve(limit int) []int {
	is_prime := make([]bool, limit+1)
	for i := 2; i <= limit; i++ {
		is_prime[i] = true
	}
	for i := 2; i*i <= limit; i++ {
		if is_prime[i] {
			for j := i * i; j <= limit; j += i {
				is_prime[j] = false
			}
		}
	}
	var primes []int
	for i := 2; i <= limit; i++ {
		if is_prime[i] {
			primes = append(primes, i)
		}
	}
	return primes
}

func main() {
	primes := sieve(100)
	for i, p := range primes {
		if i > 0 {
			fmt.Print(" ")
		}
		fmt.Print(p)
	}
	fmt.Println()
}
