package sample

import (
	"fmt"
	"io"
	"sync"
)

// Status represents the status of a task.
type Status int

const (
	StatusPending Status = iota
	StatusRunning
	StatusDone
)

var defaultTimeout = 30

// Task represents a unit of work.
type Task struct {
	ID      int
	Name    string
	Status  Status
	Tags    map[string]string
	Handler func(data []byte) error
}

// Processor defines how tasks are processed.
type Processor interface {
	Process(task *Task) error
	Cancel(id int) bool
}

// StringAlias is a type alias.
type StringAlias = string

// NewTask creates a new task with the given name.
func NewTask(name string, tags ...string) *Task {
	t := &Task{
		ID:   1,
		Name: name,
		Tags: make(map[string]string),
	}
	for i := 0; i < len(tags)-1; i += 2 {
		t.Tags[tags[i]] = tags[i+1]
	}
	return t
}

// Run executes the task.
func (t *Task) Run(w io.Writer) error {
	if t.Status != StatusPending {
		return fmt.Errorf("task %d is not pending", t.ID)
	}

	t.Status = StatusRunning
	defer func() {
		t.Status = StatusDone
	}()

	// Range over tags
	for key, value := range t.Tags {
		fmt.Fprintf(w, "%s=%s\n", key, value)
	}

	// Switch statement
	switch t.Name {
	case "fast":
		fmt.Fprintln(w, "running fast")
	case "slow":
		fmt.Fprintln(w, "running slow")
	default:
		fmt.Fprintln(w, "running normal")
	}

	// Channel operations
	ch := make(chan int, 1)
	go func() {
		ch <- 42
	}()

	select {
	case val := <-ch:
		fmt.Fprintf(w, "received: %d\n", val)
	}

	return nil
}

// ProcessAll runs all tasks concurrently.
func ProcessAll(tasks []*Task) []error {
	var mu sync.Mutex
	var errs []error

	var wg sync.WaitGroup
	for _, task := range tasks {
		wg.Add(1)
		go func(t *Task) {
			defer wg.Done()
			if err := t.Run(io.Discard); err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
			}
		}(task)
	}

	wg.Wait()

	if len(errs) == 0 {
		return nil
	}
	return errs
}

// TypeAssertExample demonstrates type assertions and type switches.
func TypeAssertExample(v interface{}) string {
	// Type assertion
	if s, ok := v.(string); ok {
		return s
	}

	// Type switch
	switch x := v.(type) {
	case int:
		return fmt.Sprintf("%d", x)
	case bool:
		if x {
			return "true"
		}
		return "false"
	default:
		return "unknown"
	}
}

// SliceOps demonstrates slice operations.
func SliceOps(data []int) []int {
	result := data[1:3]
	full := data[:]
	_ = full
	result = append(result, data[0])
	return result
}
