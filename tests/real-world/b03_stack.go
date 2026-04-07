package main

import (
	"errors"
	"fmt"
)

type Stack struct {
	items []int
}

func NewStack() *Stack {
	return &Stack{items: make([]int, 0)}
}

func (s *Stack) Push(val int) {
	s.items = append(s.items, val)
}

func (s *Stack) Pop() (int, error) {
	if len(s.items) == 0 {
		return 0, errors.New("stack is empty")
	}
	val := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return val, nil
}

func (s *Stack) Peek() (int, error) {
	if len(s.items) == 0 {
		return 0, errors.New("stack is empty")
	}
	return s.items[len(s.items)-1], nil
}

func (s *Stack) Size() int {
	return len(s.items)
}

func (s *Stack) IsEmpty() bool {
	return len(s.items) == 0
}

func main() {
	s := NewStack()
	s.Push(10)
	s.Push(20)
	s.Push(30)
	fmt.Printf("Size: %d\n", s.Size())

	val, err := s.Pop()
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Printf("Popped: %d\n", val)

	top, err := s.Peek()
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Printf("Top: %d\n", top)
	fmt.Printf("Empty: %v\n", s.IsEmpty())
}
