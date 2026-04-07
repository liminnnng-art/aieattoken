package main

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

func TestConvertFile(t *testing.T) {
	src := `package sample

import (
	"fmt"
	"io"
)

type Status int

const StatusPending Status = 0

var defaultTimeout = 30

type Task struct {
	ID   int
	Name string
}

type Processor interface {
	Process(task *Task) error
}

func NewTask(name string) *Task {
	return &Task{ID: 1, Name: name}
}

func (t *Task) Run(w io.Writer) error {
	if t.Name == "" {
		return fmt.Errorf("empty name")
	}

	for i := 0; i < 10; i++ {
		fmt.Fprintf(w, "%d\n", i)
	}

	for key, value := range map[string]string{"a": "b"} {
		fmt.Fprintf(w, "%s=%s\n", key, value)
	}

	switch t.Name {
	case "fast":
		fmt.Fprintln(w, "fast")
	default:
		fmt.Fprintln(w, "default")
	}

	ch := make(chan int, 1)
	go func() { ch <- 42 }()

	select {
	case val := <-ch:
		fmt.Fprintf(w, "%d\n", val)
	}

	defer func() {}()

	return nil
}
`

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "test.go", src, parser.ParseComments)
	if err != nil {
		t.Fatalf("failed to parse: %v", err)
	}

	result := convertFile(fset, file)

	// Marshal to JSON
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal JSON: %v", err)
	}

	// Verify it's valid JSON by unmarshaling
	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}

	// Check top-level fields
	if parsed["Kind"] != "File" {
		t.Errorf("expected Kind=File, got %v", parsed["Kind"])
	}
	if parsed["Package"] != "sample" {
		t.Errorf("expected Package=sample, got %v", parsed["Package"])
	}

	// Check imports exist
	imports, ok := parsed["Imports"].([]interface{})
	if !ok {
		t.Fatal("expected Imports array")
	}
	if len(imports) != 2 {
		t.Errorf("expected 2 imports, got %d", len(imports))
	}

	// Check declarations exist
	decls, ok := parsed["Decls"].([]interface{})
	if !ok {
		t.Fatal("expected Decls array")
	}
	if len(decls) < 6 {
		t.Errorf("expected at least 6 declarations, got %d", len(decls))
	}

	// Find function declarations
	funcCount := 0
	for _, d := range decls {
		dm, ok := d.(map[string]interface{})
		if !ok {
			continue
		}
		if dm["Kind"] == "FuncDecl" {
			funcCount++
		}
	}
	if funcCount != 2 {
		t.Errorf("expected 2 FuncDecl, got %d", funcCount)
	}

	// Verify the Run method has a receiver
	for _, d := range decls {
		dm, ok := d.(map[string]interface{})
		if !ok {
			continue
		}
		if dm["Kind"] == "FuncDecl" && dm["Name"] == "Run" {
			if dm["Recv"] == nil {
				t.Error("Run method should have a receiver")
			}
			// Check body contains expected statement kinds
			body, ok := dm["Body"].(map[string]interface{})
			if !ok {
				t.Fatal("expected Body")
			}
			stmts, ok := body["Stmts"].([]interface{})
			if !ok {
				t.Fatal("expected Stmts in body")
			}

			stmtKinds := map[string]bool{}
			for _, s := range stmts {
				sm, ok := s.(map[string]interface{})
				if !ok {
					continue
				}
				if kind, ok := sm["Kind"].(string); ok {
					stmtKinds[kind] = true
				}
			}

			expectedKinds := []string{"IfStmt", "ForStmt", "RangeStmt", "SwitchStmt", "GoStmt", "SelectStmt", "DeferStmt", "ReturnStmt"}
			for _, ek := range expectedKinds {
				if !stmtKinds[ek] {
					t.Errorf("expected statement kind %s in Run body", ek)
				}
			}
		}
	}

	// Print a snippet to verify structure (for manual inspection during test)
	t.Logf("JSON output length: %d bytes", len(data))
	t.Logf("Top-level keys: Kind=%v, Package=%v, Imports=%d, Decls=%d",
		parsed["Kind"], parsed["Package"], len(imports), len(decls))
}

func TestConvertExprTypes(t *testing.T) {
	src := `package sample

func example() {
	// Binary
	x := 1 + 2
	// Unary
	y := -x
	// Call
	z := fmt.Sprintf("%d", x)
	// Selector
	_ = z
	// Index
	a := []int{1, 2, 3}
	b := a[0]
	// Slice
	c := a[1:2]
	_ = b
	_ = c
	// Star (pointer)
	var p *int
	_ = *p
	// Composite lit
	m := map[string]int{"a": 1}
	_ = m
	// Func lit
	f := func() {}
	_ = f
	// Type assert
	var v interface{}
	s := v.(string)
	_ = s
	_ = y
}
`
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "test.go", src, parser.ParseComments)
	if err != nil {
		t.Fatalf("failed to parse: %v", err)
	}

	result := convertFile(fset, file)
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	// Validate JSON
	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	// Check we have declarations
	decls, ok := parsed["Decls"].([]interface{})
	if !ok || len(decls) == 0 {
		t.Fatal("expected at least 1 decl")
	}

	t.Logf("Expression test JSON output: %d bytes", len(data))
}

func TestConvertTypeDeclarations(t *testing.T) {
	src := `package sample

type MyStruct struct {
	Name string
	Age  int
}

type MyInterface interface {
	DoSomething(x int) error
}

type MyMap map[string][]int

type MyArray [10]string

type MyChan chan<- int

type MyAlias = string
`
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "test.go", src, parser.ParseComments)
	if err != nil {
		t.Fatalf("failed to parse: %v", err)
	}

	result := convertFile(fset, file)
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	decls := parsed["Decls"].([]interface{})
	if len(decls) != 6 {
		t.Errorf("expected 6 type declarations, got %d", len(decls))
	}

	// Verify struct type
	d0 := decls[0].(map[string]interface{})
	specs := d0["Specs"].([]interface{})
	spec0 := specs[0].(map[string]interface{})
	if spec0["Kind"] != "TypeSpec" {
		t.Errorf("expected TypeSpec, got %v", spec0["Kind"])
	}
	if spec0["Name"] != "MyStruct" {
		t.Errorf("expected name MyStruct, got %v", spec0["Name"])
	}

	typeNode := spec0["Type"].(map[string]interface{})
	if typeNode["Kind"] != "StructType" {
		t.Errorf("expected StructType, got %v", typeNode["Kind"])
	}

	// Verify alias
	d5 := decls[5].(map[string]interface{})
	specs5 := d5["Specs"].([]interface{})
	spec5 := specs5[0].(map[string]interface{})
	if spec5["Assign"] != true {
		t.Errorf("expected type alias (Assign=true), got %v", spec5["Assign"])
	}

	t.Logf("Type declarations test: %d bytes", len(data))
}

func TestErrorHandling(t *testing.T) {
	// Test with invalid source
	src := `package sample

func broken( {
`
	fset := token.NewFileSet()
	_, err := parser.ParseFile(fset, "test.go", src, 0)
	if err == nil {
		t.Error("expected parse error for invalid source")
	}
}

// Verify all node types are handled without panics
func TestNoPanics(t *testing.T) {
	src := `package sample

import "fmt"

type S struct{ X int }

func main() {
	// Various node types
	s := S{X: 1}
	fmt.Println(s.X)
	p := &s
	_ = (*p).X
	arr := [3]int{1, 2, 3}
	sl := arr[:]
	_ = sl
	m := map[string]int{"k": 1}
	_ = m
	ch := make(chan int)
	close(ch)
	i := 0
	i++
	_ = i
loop:
	for {
		break loop
	}
	goto loop
}
`
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "test.go", src, parser.ParseComments)
	if err != nil {
		t.Fatalf("failed to parse: %v", err)
	}

	// Should not panic
	result := convertFile(fset, file)
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	t.Logf("No-panic test passed, output: %d bytes", len(data))
}

// Verify the file output has position information.
func TestPositionInfo(t *testing.T) {
	src := `package sample

func hello() {}
`
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "test.go", src, 0)
	if err != nil {
		t.Fatalf("failed to parse: %v", err)
	}

	result := convertFile(fset, file)

	posNode, ok := result["Pos"].(Node)
	if !ok {
		t.Fatal("expected Pos node")
	}
	if posNode["Line"] != 1 {
		t.Errorf("expected line 1, got %v", posNode["Line"])
	}

	// Function should be on line 3
	decls := result["Decls"].([]interface{})
	fn := decls[0].(Node)
	fnPos := fn["Pos"].(Node)
	if fnPos["Line"] != 3 {
		t.Errorf("expected function on line 3, got %v", fnPos["Line"])
	}
}

// Silence the unused import warning
var _ = ast.Inspect
