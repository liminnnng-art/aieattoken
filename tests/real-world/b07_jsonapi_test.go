package main

import (
	"encoding/json"
	"testing"
)

func TestNewSuccessResponse(t *testing.T) {
	data := map[string]string{"msg": "hello"}
	resp, err := NewSuccessResponse(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Success {
		t.Error("Success should be true")
	}
	if resp.Data == nil {
		t.Error("Data should not be nil")
	}
	if resp.Timestamp == "" {
		t.Error("Timestamp should not be empty")
	}
}

func TestNewErrorResponse(t *testing.T) {
	resp := NewErrorResponse(404, "not found")
	if resp.Success {
		t.Error("Success should be false")
	}
	if resp.Error == nil {
		t.Fatal("Error should not be nil")
	}
	if resp.Error.Code != 404 {
		t.Errorf("Error.Code = %d, want 404", resp.Error.Code)
	}
	if resp.Error.Message != "not found" {
		t.Errorf("Error.Message = %s, want 'not found'", resp.Error.Message)
	}
}

func TestAPIErrorString(t *testing.T) {
	e := APIError{Code: 500, Message: "internal"}
	got := e.Error()
	want := "API error 500: internal"
	if got != want {
		t.Errorf("Error() = %s, want %s", got, want)
	}
}

func TestNewPaginatedResponse(t *testing.T) {
	items := []int{1, 2, 3}
	resp, err := NewPaginatedResponse(items, 1, 10, 25)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Pagination == nil {
		t.Fatal("Pagination should not be nil")
	}
	if resp.Pagination.TotalPages != 3 {
		t.Errorf("TotalPages = %d, want 3", resp.Pagination.TotalPages)
	}
	if resp.Pagination.Page != 1 {
		t.Errorf("Page = %d, want 1", resp.Pagination.Page)
	}
}

func TestPaginationExactDivision(t *testing.T) {
	items := []int{1}
	resp, err := NewPaginatedResponse(items, 1, 5, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Pagination.TotalPages != 4 {
		t.Errorf("TotalPages = %d, want 4", resp.Pagination.TotalPages)
	}
}

func TestToJSON(t *testing.T) {
	resp, err := NewSuccessResponse("hello")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	output, err := resp.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON error: %v", err)
	}
	var parsed APIResponse
	if err := json.Unmarshal([]byte(output), &parsed); err != nil {
		t.Fatalf("cannot parse JSON output: %v", err)
	}
	if !parsed.Success {
		t.Error("parsed response should be success")
	}
}

func TestFetchUsersInvalidPage(t *testing.T) {
	_, err := fetchUsers(0)
	if err == nil {
		t.Error("expected error for page 0")
	}
}

func TestFetchUsersValid(t *testing.T) {
	resp, err := fetchUsers(1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Success {
		t.Error("response should be success")
	}
	var users []User
	if err := json.Unmarshal(resp.Data, &users); err != nil {
		t.Fatalf("cannot unmarshal users: %v", err)
	}
	if len(users) != 2 {
		t.Errorf("got %d users, want 2", len(users))
	}
}

func BenchmarkNewSuccessResponse(b *testing.B) {
	data := map[string]string{"key": "value"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		NewSuccessResponse(data)
	}
}

func BenchmarkToJSON(b *testing.B) {
	resp, _ := NewSuccessResponse(map[string]string{"key": "value"})
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp.ToJSON()
	}
}

func BenchmarkNewPaginatedResponse(b *testing.B) {
	items := []int{1, 2, 3, 4, 5}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		NewPaginatedResponse(items, 1, 10, 100)
	}
}
