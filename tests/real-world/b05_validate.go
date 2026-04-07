package main

import (
	"fmt"
	"regexp"
	"strings"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type ValidationResult struct {
	Email string
	Valid bool
	Error string
}

func validateEmail(email string) ValidationResult {
	email = strings.TrimSpace(email)
	if email == "" {
		return ValidationResult{Email: email, Valid: false, Error: "empty email"}
	}
	if len(email) > 254 {
		return ValidationResult{Email: email, Valid: false, Error: "too long"}
	}
	if !strings.Contains(email, "@") {
		return ValidationResult{Email: email, Valid: false, Error: "missing @"}
	}
	if !emailRegex.MatchString(email) {
		return ValidationResult{Email: email, Valid: false, Error: "invalid format"}
	}
	return ValidationResult{Email: email, Valid: true, Error: ""}
}

func validateBatch(emails []string) []ValidationResult {
	results := make([]ValidationResult, len(emails))
	for i, e := range emails {
		results[i] = validateEmail(e)
	}
	return results
}

func main() {
	emails := []string{
		"user@example.com",
		"bad-email",
		"test@test.co.uk",
		"",
		"no-at-sign.com",
		"valid+tag@gmail.com",
	}
	results := validateBatch(emails)
	for _, r := range results {
		if r.Valid {
			fmt.Printf("  OK: %s\n", r.Email)
		} else {
			fmt.Printf("FAIL: %-25s (%s)\n", r.Email, r.Error)
		}
	}
}
