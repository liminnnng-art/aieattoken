package main

import "testing"

func TestValidateEmailValid(t *testing.T) {
	cases := []string{
		"user@example.com",
		"test@test.co.uk",
		"valid+tag@gmail.com",
		"name.surname@domain.org",
	}
	for _, email := range cases {
		r := validateEmail(email)
		if !r.Valid {
			t.Errorf("validateEmail(%q) should be valid, got error: %s", email, r.Error)
		}
	}
}

func TestValidateEmailInvalid(t *testing.T) {
	cases := []struct {
		email string
		errMsg string
	}{
		{"", "empty email"},
		{"bad-email", "missing @"},
		{"no-at-sign.com", "missing @"},
		{"@missing-local.com", "invalid format"},
		{"missing-domain@", "invalid format"},
	}
	for _, tc := range cases {
		r := validateEmail(tc.email)
		if r.Valid {
			t.Errorf("validateEmail(%q) should be invalid", tc.email)
		}
		if r.Error != tc.errMsg {
			t.Errorf("validateEmail(%q) error = %q, want %q", tc.email, r.Error, tc.errMsg)
		}
	}
}

func TestValidateBatch(t *testing.T) {
	emails := []string{"good@test.com", "bad", "ok@ok.org"}
	results := validateBatch(emails)
	if len(results) != 3 {
		t.Fatalf("validateBatch returned %d results, want 3", len(results))
	}
	if !results[0].Valid {
		t.Error("results[0] should be valid")
	}
	if results[1].Valid {
		t.Error("results[1] should be invalid")
	}
	if !results[2].Valid {
		t.Error("results[2] should be valid")
	}
}

func TestValidateEmailTrimSpace(t *testing.T) {
	r := validateEmail("  user@example.com  ")
	if !r.Valid {
		t.Error("should trim whitespace and validate")
	}
}

func BenchmarkValidateEmail(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		validateEmail("user@example.com")
	}
}

func BenchmarkValidateEmailInvalid(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		validateEmail("not-an-email")
	}
}

func BenchmarkValidateBatch(b *testing.B) {
	emails := []string{
		"a@b.com", "c@d.org", "bad", "x@y.co.uk", "",
		"test@test.com", "nope", "ok@ok.io", "z@z.z", "hi@bye.net",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		validateBatch(emails)
	}
}
