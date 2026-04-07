package main

import (
	"math"
	"testing"
)

var testCSVData = `name,age,score,active
Alice,30,95.5,true
Bob,25,82.3,true
Charlie,35,71.0,false
Diana,28,91.2,true
Eve,33,88.7,false`

func TestParseCSV(t *testing.T) {
	records, err := parseCSV(testCSVData)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(records) != 5 {
		t.Fatalf("got %d records, want 5", len(records))
	}
	if records[0].Name != "Alice" {
		t.Errorf("records[0].Name = %s, want Alice", records[0].Name)
	}
	if records[0].Age != 30 {
		t.Errorf("records[0].Age = %d, want 30", records[0].Age)
	}
	if records[0].Score != 95.5 {
		t.Errorf("records[0].Score = %f, want 95.5", records[0].Score)
	}
	if !records[0].Active {
		t.Error("records[0].Active should be true")
	}
}

func TestParseCSVEmpty(t *testing.T) {
	_, err := parseCSV("name\n")
	if err != nil {
		t.Logf("got expected-ish error: %v", err)
	}
}

func TestParseCSVNoHeader(t *testing.T) {
	_, err := parseCSV("just one line")
	if err == nil {
		t.Error("expected error for single-line CSV")
	}
}

func TestParseCSVMissingName(t *testing.T) {
	_, err := parseCSV("age,score\n30,95.5\n")
	if err == nil {
		t.Error("expected error for missing name column")
	}
}

func TestFilterActive(t *testing.T) {
	records, _ := parseCSV(testCSVData)
	active := filterActive(records)
	if len(active) != 3 {
		t.Errorf("filterActive returned %d, want 3", len(active))
	}
	for _, r := range active {
		if !r.Active {
			t.Errorf("inactive record %s in filtered results", r.Name)
		}
	}
}

func TestSortByScore(t *testing.T) {
	records, _ := parseCSV(testCSVData)
	sorted := sortByScore(records)
	if sorted[0].Name != "Alice" {
		t.Errorf("top scorer = %s, want Alice", sorted[0].Name)
	}
	for i := 1; i < len(sorted); i++ {
		if sorted[i].Score > sorted[i-1].Score {
			t.Errorf("not sorted: %s (%.1f) > %s (%.1f)",
				sorted[i].Name, sorted[i].Score, sorted[i-1].Name, sorted[i-1].Score)
		}
	}
}

func TestAverageScore(t *testing.T) {
	records, _ := parseCSV(testCSVData)
	avg := averageScore(records)
	expected := (95.5 + 82.3 + 71.0 + 91.2 + 88.7) / 5
	if math.Abs(avg-expected) > 0.01 {
		t.Errorf("averageScore = %f, want %f", avg, expected)
	}
}

func TestAverageScoreEmpty(t *testing.T) {
	avg := averageScore(nil)
	if avg != 0 {
		t.Errorf("averageScore(nil) = %f, want 0", avg)
	}
}

func TestToCSV(t *testing.T) {
	records := []Record{
		{Name: "Test", Age: 25, Score: 90.0, Active: true},
	}
	output, err := toCSV(records)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if output == "" {
		t.Error("output should not be empty")
	}
}

func TestRoundTrip(t *testing.T) {
	records, err := parseCSV(testCSVData)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	output, err := toCSV(records)
	if err != nil {
		t.Fatalf("toCSV error: %v", err)
	}
	records2, err := parseCSV(output)
	if err != nil {
		t.Fatalf("re-parse error: %v", err)
	}
	if len(records2) != len(records) {
		t.Errorf("round trip: got %d records, want %d", len(records2), len(records))
	}
}

func BenchmarkParseCSV(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parseCSV(testCSVData)
	}
}

func BenchmarkFilterActive(b *testing.B) {
	records, _ := parseCSV(testCSVData)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		filterActive(records)
	}
}

func BenchmarkSortByScore(b *testing.B) {
	records, _ := parseCSV(testCSVData)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		sortByScore(records)
	}
}

func BenchmarkToCSV(b *testing.B) {
	records, _ := parseCSV(testCSVData)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		toCSV(records)
	}
}
