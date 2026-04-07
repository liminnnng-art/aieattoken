package main

import (
	"testing"
)

// Fibonacci — same implementation in both original Go and AET-transpiled Go
func fibonacci(n int) int {
	if n <= 1 {
		return n
	}
	return fibonacci(n-1) + fibonacci(n-2)
}

func BenchmarkFibonacci(b *testing.B) {
	for i := 0; i < b.N; i++ {
		fibonacci(20)
	}
}

// Sieve of Eratosthenes
func sieve(limit int) []int {
	is := make([]bool, limit+1)
	for i := 2; i <= limit; i++ {
		is[i] = true
	}
	for i := 2; i*i <= limit; i++ {
		if is[i] {
			for j := i * i; j <= limit; j += i {
				is[j] = false
			}
		}
	}
	var primes []int
	for i := 2; i <= limit; i++ {
		if is[i] {
			primes = append(primes, i)
		}
	}
	return primes
}

func BenchmarkSieve(b *testing.B) {
	for i := 0; i < b.N; i++ {
		sieve(10000)
	}
}

// Bubble sort
func bubbleSort(a []int) {
	for i := len(a) - 1; i >= 1; i-- {
		for j := 0; j < i; j++ {
			if a[j] > a[j+1] {
				a[j], a[j+1] = a[j+1], a[j]
			}
		}
	}
}

func BenchmarkBubbleSort(b *testing.B) {
	for i := 0; i < b.N; i++ {
		a := []int{9, 8, 7, 6, 5, 4, 3, 2, 1, 0}
		bubbleSort(a)
	}
}

// Caesar cipher
func caesar(text string, shift int) string {
	result := make([]byte, len(text))
	for i, c := range text {
		switch {
		case c >= 'a' && c <= 'z':
			result[i] = byte('a' + (int(c-'a')+shift)%26)
		case c >= 'A' && c <= 'Z':
			result[i] = byte('A' + (int(c-'A')+shift)%26)
		default:
			result[i] = byte(c)
		}
	}
	return string(result)
}

func BenchmarkCaesar(b *testing.B) {
	text := "The quick brown fox jumps over the lazy dog"
	for i := 0; i < b.N; i++ {
		caesar(text, 13)
	}
}

// Luhn test
func luhn(s string) bool {
	sum := 0
	alt := false
	for i := len(s) - 1; i >= 0; i-- {
		n := int(s[i] - '0')
		if alt {
			n *= 2
			if n > 9 {
				n -= 9
			}
		}
		sum += n
		alt = !alt
	}
	return sum%10 == 0
}

func BenchmarkLuhn(b *testing.B) {
	for i := 0; i < b.N; i++ {
		luhn("49927398716")
	}
}
