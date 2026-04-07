package main

import (
	"errors"
	"fmt"
	"math/rand"
	"time"
)

type RetryConfig struct {
	MaxAttempts int
	InitialDelay time.Duration
	MaxDelay     time.Duration
	Multiplier   float64
	Jitter       bool
}

func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts:  5,
		InitialDelay: 100 * time.Millisecond,
		MaxDelay:     10 * time.Second,
		Multiplier:   2.0,
		Jitter:       true,
	}
}

type RetryResult struct {
	Attempts int
	LastErr  error
	Duration time.Duration
}

var ErrMaxRetries = errors.New("max retries exceeded")

func calcDelay(attempt int, config RetryConfig) time.Duration {
	delay := float64(config.InitialDelay)
	for i := 0; i < attempt; i++ {
		delay *= config.Multiplier
	}
	if delay > float64(config.MaxDelay) {
		delay = float64(config.MaxDelay)
	}
	if config.Jitter {
		delay = delay * (0.5 + rand.Float64()*0.5)
	}
	return time.Duration(delay)
}

func Retry(config RetryConfig, fn func() error) RetryResult {
	start := time.Now()
	var lastErr error
	for attempt := 0; attempt < config.MaxAttempts; attempt++ {
		lastErr = fn()
		if lastErr == nil {
			return RetryResult{
				Attempts: attempt + 1,
				Duration: time.Since(start),
			}
		}
		if attempt < config.MaxAttempts-1 {
			delay := calcDelay(attempt, config)
			time.Sleep(delay)
		}
	}
	return RetryResult{
		Attempts: config.MaxAttempts,
		LastErr:  fmt.Errorf("%w: %v", ErrMaxRetries, lastErr),
		Duration: time.Since(start),
	}
}

func RetryWithResult[T any](config RetryConfig, fn func() (T, error)) (T, RetryResult) {
	start := time.Now()
	var lastErr error
	var zero T
	for attempt := 0; attempt < config.MaxAttempts; attempt++ {
		result, err := fn()
		if err == nil {
			return result, RetryResult{
				Attempts: attempt + 1,
				Duration: time.Since(start),
			}
		}
		lastErr = err
		if attempt < config.MaxAttempts-1 {
			delay := calcDelay(attempt, config)
			time.Sleep(delay)
		}
	}
	return zero, RetryResult{
		Attempts: config.MaxAttempts,
		LastErr:  fmt.Errorf("%w: %v", ErrMaxRetries, lastErr),
		Duration: time.Since(start),
	}
}

func IsRetryable(err error) bool {
	return err != nil && !errors.Is(err, ErrMaxRetries)
}

func main() {
	callCount := 0
	flaky := func() error {
		callCount++
		if callCount < 3 {
			return fmt.Errorf("temporary failure (attempt %d)", callCount)
		}
		return nil
	}

	config := DefaultRetryConfig()
	config.MaxAttempts = 5
	config.InitialDelay = 10 * time.Millisecond
	config.Jitter = false

	result := Retry(config, flaky)
	if result.LastErr != nil {
		fmt.Printf("Failed after %d attempts: %v\n", result.Attempts, result.LastErr)
	} else {
		fmt.Printf("Succeeded after %d attempts in %v\n", result.Attempts, result.Duration)
	}

	fetchCount := 0
	fetchData := func() (string, error) {
		fetchCount++
		if fetchCount < 2 {
			return "", fmt.Errorf("connection refused")
		}
		return "data-payload", nil
	}

	data, result2 := RetryWithResult(config, fetchData)
	if result2.LastErr != nil {
		fmt.Printf("Fetch failed: %v\n", result2.LastErr)
	} else {
		fmt.Printf("Fetched %q in %d attempts\n", data, result2.Attempts)
	}
}
