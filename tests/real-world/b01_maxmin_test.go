package main

import "testing"

func TestFindMax(t *testing.T) {
	tests := []struct {
		input []int
		want  int
		err   bool
	}{
		{[]int{3, 1, 4, 1, 5, 9}, 9, false},
		{[]int{-5, -1, -3}, -1, false},
		{[]int{42}, 42, false},
		{[]int{}, 0, true},
	}
	for _, tt := range tests {
		got, err := findMax(tt.input)
		if (err != nil) != tt.err {
			t.Errorf("findMax(%v) error = %v, wantErr %v", tt.input, err, tt.err)
		}
		if !tt.err && got != tt.want {
			t.Errorf("findMax(%v) = %d, want %d", tt.input, got, tt.want)
		}
	}
}

func TestFindMin(t *testing.T) {
	tests := []struct {
		input []int
		want  int
		err   bool
	}{
		{[]int{3, 1, 4, 1, 5, 9}, 1, false},
		{[]int{-5, -1, -3}, -5, false},
		{[]int{42}, 42, false},
		{[]int{}, 0, true},
	}
	for _, tt := range tests {
		got, err := findMin(tt.input)
		if (err != nil) != tt.err {
			t.Errorf("findMin(%v) error = %v, wantErr %v", tt.input, err, tt.err)
		}
		if !tt.err && got != tt.want {
			t.Errorf("findMin(%v) = %d, want %d", tt.input, got, tt.want)
		}
	}
}

func TestFindMaxMin(t *testing.T) {
	max, min, err := findMaxMin([]int{3, 1, 4, 1, 5, 9, 2, 6})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if max != 9 {
		t.Errorf("max = %d, want 9", max)
	}
	if min != 1 {
		t.Errorf("min = %d, want 1", min)
	}
}

func BenchmarkFindMax(b *testing.B) {
	data := make([]int, 10000)
	for i := range data {
		data[i] = i * 7 % 9973
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		findMax(data)
	}
}

func BenchmarkFindMin(b *testing.B) {
	data := make([]int, 10000)
	for i := range data {
		data[i] = i * 7 % 9973
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		findMin(data)
	}
}

func BenchmarkFindMaxMin(b *testing.B) {
	data := make([]int, 10000)
	for i := range data {
		data[i] = i * 7 % 9973
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		findMaxMin(data)
	}
}
