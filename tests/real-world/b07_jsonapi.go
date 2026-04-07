package main

import (
	"encoding/json"
	"fmt"
	"time"
)

type APIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e APIError) Error() string {
	return fmt.Sprintf("API error %d: %s", e.Code, e.Message)
}

type Pagination struct {
	Page       int `json:"page"`
	PerPage    int `json:"per_page"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

type APIResponse struct {
	Success    bool            `json:"success"`
	Data       json.RawMessage `json:"data,omitempty"`
	Error      *APIError       `json:"error,omitempty"`
	Pagination *Pagination     `json:"pagination,omitempty"`
	Timestamp  string          `json:"timestamp"`
}

func NewSuccessResponse(data interface{}) (*APIResponse, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("marshal data: %w", err)
	}
	return &APIResponse{
		Success:   true,
		Data:      raw,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func NewErrorResponse(code int, message string) *APIResponse {
	return &APIResponse{
		Success:   false,
		Error:     &APIError{Code: code, Message: message},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
}

func NewPaginatedResponse(data interface{}, page, perPage, total int) (*APIResponse, error) {
	resp, err := NewSuccessResponse(data)
	if err != nil {
		return nil, err
	}
	totalPages := total / perPage
	if total%perPage != 0 {
		totalPages++
	}
	resp.Pagination = &Pagination{
		Page:       page,
		PerPage:    perPage,
		Total:      total,
		TotalPages: totalPages,
	}
	return resp, nil
}

func (r *APIResponse) ToJSON() (string, error) {
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal response: %w", err)
	}
	return string(data), nil
}

type User struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

func fetchUsers(page int) (*APIResponse, error) {
	if page < 1 {
		return nil, fmt.Errorf("invalid page: %d", page)
	}
	users := []User{
		{ID: 1, Name: "Alice", Email: "alice@example.com"},
		{ID: 2, Name: "Bob", Email: "bob@example.com"},
	}
	resp, err := NewPaginatedResponse(users, page, 10, 25)
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func main() {
	resp, err := fetchUsers(1)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	output, err := resp.ToJSON()
	if err != nil {
		fmt.Println("JSON error:", err)
		return
	}
	fmt.Println(output)

	fmt.Println()
	errResp := NewErrorResponse(404, "user not found")
	output, err = errResp.ToJSON()
	if err != nil {
		fmt.Println("JSON error:", err)
		return
	}
	fmt.Println(output)
}
