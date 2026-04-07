package main

import (
	"errors"
	"fmt"
	"testing"
	"time"
)

func testConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts:  5,
		InitialDelay: 1 * time.Millisecond,
		MaxDelay:     100 * time.Millisecond,
		Multiplier:   2.0,
		Jitter:       false,
	}
}

func TestRetrySuccess(t *testing.T) {
	count := 0
	result := Retry(testConfig(), func() error {
		count++
		if count < 3 {
			return fmt.Errorf("fail %d", count)
		}
		return nil
	})
	if result.LastErr != nil {
		t.Fatalf("expected success, got: %v", result.LastErr)
	}
	if result.Attempts != 3 {
		t.Errorf("Attempts = %d, want 3", result.Attempts)
	}
}

func TestRetryImmediateSuccess(t *testing.T) {
	result := Retry(testConfig(), func() error {
		return nil
	})
	if result.LastErr != nil {
		t.Fatalf("unexpected error: %v", result.LastErr)
	}
	if result.Attempts != 1 {
		t.Errorf("Attempts = %d, want 1", result.Attempts)
	}
}

func TestRetryMaxExceeded(t *testing.T) {
	config := testConfig()
	config.MaxAttempts = 3
	result := Retry(config, func() error {
		return fmt.Errorf("always fails")
	})
	if result.LastErr == nil {
		t.Fatal("expected error")
	}
	if !errors.Is(result.LastErr, ErrMaxRetries) {
		t.Errorf("expected ErrMaxRetries, got: %v", result.LastErr)
	}
	if result.Attempts != 3 {
		t.Errorf("Attempts = %d, want 3", result.Attempts)
	}
}

func TestRetryWithResultSuccess(t *testing.T) {
	count := 0
	data, result := RetryWithResult(testConfig(), func() (string, error) {
		count++
		if count < 2 {
			return "", fmt.Errorf("not ready")
		}
		return "payload", nil
	})
	if result.LastErr != nil {
		t.Fatalf("unexpected error: %v", result.LastErr)
	}
	if data != "payload" {
		t.Errorf("data = %q, want payload", data)
	}
	if result.Attempts != 2 {
		t.Errorf("Attempts = %d, want 2", result.Attempts)
	}
}

func TestRetryWithResultFail(t *testing.T) {
	config := testConfig()
	config.MaxAttempts = 2
	data, result := RetryWithResult(config, func() (int, error) {
		return 0, fmt.Errorf("broken")
	})
	if result.LastErr == nil {
		t.Fatal("expected error")
	}
	if data != 0 {
		t.Errorf("data = %d, want 0", data)
	}
}

func TestCalcDelay(t *testing.T) {
	config := RetryConfig{
		InitialDelay: 100 * time.Millisecond,
		MaxDelay:     10 * time.Second,
		Multiplier:   2.0,
		Jitter:       false,
	}
	d0 := calcDelay(0, config)
	if d0 != 100*time.Millisecond {
		t.Errorf("delay(0) = %v, want 100ms", d0)
	}
	d1 := calcDelay(1, config)
	if d1 != 200*time.Millisecond {
		t.Errorf("delay(1) = %v, want 200ms", d1)
	}
	d2 := calcDelay(2, config)
	if d2 != 400*time.Millisecond {
		t.Errorf("delay(2) = %v, want 400ms", d2)
	}
}

func TestCalcDelayMaxCap(t *testing.T) {
	config := RetryConfig{
		InitialDelay: 1 * time.Second,
		MaxDelay:     5 * time.Second,
		Multiplier:   10.0,
		Jitter:       false,
	}
	d := calcDelay(3, config)
	if d > config.MaxDelay {
		t.Errorf("delay %v exceeds max %v", d, config.MaxDelay)
	}
}

func TestDefaultRetryConfig(t *testing.T) {
	config := DefaultRetryConfig()
	if config.MaxAttempts != 5 {
		t.Errorf("MaxAttempts = %d, want 5", config.MaxAttempts)
	}
	if config.Multiplier != 2.0 {
		t.Errorf("Multiplier = %f, want 2.0", config.Multiplier)
	}
}

func TestIsRetryable(t *testing.T) {
	if !IsRetryable(fmt.Errorf("some error")) {
		t.Error("regular error should be retryable")
	}
	if IsRetryable(nil) {
		t.Error("nil should not be retryable")
	}
	wrapped := fmt.Errorf("%w: inner", ErrMaxRetries)
	if IsRetryable(wrapped) {
		t.Error("ErrMaxRetries should not be retryable")
	}
}

func BenchmarkRetryImmediate(b *testing.B) {
	config := testConfig()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Retry(config, func() error { return nil })
	}
}

func BenchmarkCalcDelay(b *testing.B) {
	config := testConfig()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		calcDelay(i%5, config)
	}
}

func BenchmarkRetryWithResultImmediate(b *testing.B) {
	config := testConfig()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		RetryWithResult(config, func() (int, error) { return 42, nil })
	}
}
