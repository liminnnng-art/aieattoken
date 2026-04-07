package main

import (
	"math"
	"testing"
)

func almostEqual(a, b float64) bool {
	return math.Abs(a-b) < 0.01
}

func TestCelsiusToFahrenheit(t *testing.T) {
	temp := Temperature{100, "C"}
	if got := temp.ToFahrenheit(); !almostEqual(got, 212) {
		t.Errorf("100C -> F = %f, want 212", got)
	}
}

func TestFahrenheitToCelsius(t *testing.T) {
	temp := Temperature{32, "F"}
	if got := temp.ToCelsius(); !almostEqual(got, 0) {
		t.Errorf("32F -> C = %f, want 0", got)
	}
}

func TestKelvinToCelsius(t *testing.T) {
	temp := Temperature{273.15, "K"}
	if got := temp.ToCelsius(); !almostEqual(got, 0) {
		t.Errorf("273.15K -> C = %f, want 0", got)
	}
}

func TestCelsiusToKelvin(t *testing.T) {
	temp := Temperature{0, "C"}
	if got := temp.ToKelvin(); !almostEqual(got, 273.15) {
		t.Errorf("0C -> K = %f, want 273.15", got)
	}
}

func TestBoilingPoint(t *testing.T) {
	c := Temperature{100, "C"}
	f := Temperature{212, "F"}
	k := Temperature{373.15, "K"}
	if !almostEqual(c.ToCelsius(), f.ToCelsius()) {
		t.Error("boiling point mismatch C vs F")
	}
	if !almostEqual(c.ToCelsius(), k.ToCelsius()) {
		t.Error("boiling point mismatch C vs K")
	}
}

func TestString(t *testing.T) {
	temp := Temperature{100.5, "C"}
	if got := temp.String(); got != "100.50C" {
		t.Errorf("String() = %s, want 100.50C", got)
	}
}

func BenchmarkToCelsius(b *testing.B) {
	temp := Temperature{212, "F"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		temp.ToCelsius()
	}
}

func BenchmarkToFahrenheit(b *testing.B) {
	temp := Temperature{100, "C"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		temp.ToFahrenheit()
	}
}

func BenchmarkToKelvin(b *testing.B) {
	temp := Temperature{100, "C"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		temp.ToKelvin()
	}
}
