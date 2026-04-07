package main

import "testing"

func TestStackPushPop(t *testing.T) {
	s := NewStack()
	s.Push(1)
	s.Push(2)
	s.Push(3)

	val, err := s.Pop()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != 3 {
		t.Errorf("Pop() = %d, want 3", val)
	}
}

func TestStackPopEmpty(t *testing.T) {
	s := NewStack()
	_, err := s.Pop()
	if err == nil {
		t.Error("expected error from empty stack Pop()")
	}
}

func TestStackPeek(t *testing.T) {
	s := NewStack()
	s.Push(42)
	val, err := s.Peek()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != 42 {
		t.Errorf("Peek() = %d, want 42", val)
	}
	if s.Size() != 1 {
		t.Errorf("Size() = %d after Peek, want 1", s.Size())
	}
}

func TestStackSize(t *testing.T) {
	s := NewStack()
	if s.Size() != 0 {
		t.Errorf("empty stack Size() = %d, want 0", s.Size())
	}
	s.Push(1)
	s.Push(2)
	if s.Size() != 2 {
		t.Errorf("Size() = %d, want 2", s.Size())
	}
}

func TestStackIsEmpty(t *testing.T) {
	s := NewStack()
	if !s.IsEmpty() {
		t.Error("new stack should be empty")
	}
	s.Push(1)
	if s.IsEmpty() {
		t.Error("stack with elements should not be empty")
	}
}

func BenchmarkStackPush(b *testing.B) {
	s := NewStack()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.Push(i)
	}
}

func BenchmarkStackPushPop(b *testing.B) {
	s := NewStack()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.Push(i)
		s.Pop()
	}
}
