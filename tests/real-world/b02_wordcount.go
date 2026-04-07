package main

import (
	"fmt"
	"sort"
	"strings"
)

func wordCount(text string) map[string]int {
	counts := make(map[string]int)
	words := strings.Fields(strings.ToLower(text))
	for _, w := range words {
		w = strings.Trim(w, ".,!?;:\"'()-")
		if w != "" {
			counts[w]++
		}
	}
	return counts
}

func topWords(counts map[string]int, n int) []string {
	type wc struct {
		word  string
		count int
	}
	pairs := make([]wc, 0, len(counts))
	for w, c := range counts {
		pairs = append(pairs, wc{w, c})
	}
	sort.Slice(pairs, func(i, j int) bool {
		return pairs[i].count > pairs[j].count
	})
	result := make([]string, 0, n)
	for i := 0; i < n && i < len(pairs); i++ {
		result = append(result, fmt.Sprintf("%s:%d", pairs[i].word, pairs[i].count))
	}
	return result
}

func main() {
	text := "the quick brown fox jumps over the lazy dog the fox the dog"
	counts := wordCount(text)
	fmt.Println("Word frequencies:")
	for w, c := range counts {
		fmt.Printf("  %s: %d\n", w, c)
	}
	fmt.Println("Top 3:", topWords(counts, 3))
}
