package main

import "testing"

func TestWordCount(t *testing.T) {
	counts := wordCount("the cat sat on the mat the cat")
	if counts["the"] != 3 {
		t.Errorf("the = %d, want 3", counts["the"])
	}
	if counts["cat"] != 2 {
		t.Errorf("cat = %d, want 2", counts["cat"])
	}
	if counts["sat"] != 1 {
		t.Errorf("sat = %d, want 1", counts["sat"])
	}
}

func TestWordCountEmpty(t *testing.T) {
	counts := wordCount("")
	if len(counts) != 0 {
		t.Errorf("expected empty map, got %v", counts)
	}
}

func TestWordCountPunctuation(t *testing.T) {
	counts := wordCount("hello, hello! HELLO.")
	if counts["hello"] != 3 {
		t.Errorf("hello = %d, want 3", counts["hello"])
	}
}

func TestTopWords(t *testing.T) {
	counts := map[string]int{"apple": 5, "banana": 3, "cherry": 8, "date": 1}
	top := topWords(counts, 2)
	if len(top) != 2 {
		t.Fatalf("topWords returned %d items, want 2", len(top))
	}
	if top[0] != "cherry:8" {
		t.Errorf("top[0] = %s, want cherry:8", top[0])
	}
}

func BenchmarkWordCount(b *testing.B) {
	text := "the quick brown fox jumps over the lazy dog the fox the dog and the cat sat on the mat"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		wordCount(text)
	}
}

func BenchmarkTopWords(b *testing.B) {
	counts := map[string]int{
		"the": 100, "a": 80, "is": 60, "of": 50, "and": 45,
		"to": 40, "in": 35, "it": 30, "for": 25, "on": 20,
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		topWords(counts, 5)
	}
}
