package main

import (
	"testing"
)

func TestGenerate(t *testing.T) {
	ch := generate(10)
	count := 0
	for dp := range ch {
		if dp.ID != count {
			t.Errorf("expected ID %d, got %d", count, dp.ID)
		}
		count++
	}
	if count != 10 {
		t.Errorf("generated %d items, want 10", count)
	}
}

func TestFilter(t *testing.T) {
	ch := generate(10)
	filtered := filter(ch, 5.0)
	count := 0
	for dp := range filtered {
		if dp.Value < 5.0 {
			t.Errorf("filtered value %.2f < 5.0", dp.Value)
		}
		count++
	}
	if count == 0 {
		t.Error("filter returned no results")
	}
}

func TestTransform(t *testing.T) {
	ch := generate(5)
	doubled := transform(ch, func(v float64) float64 { return v * 2 })
	for dp := range doubled {
		expected := float64(dp.ID) * 1.5 * 2
		if dp.Value != expected {
			t.Errorf("ID %d: got %.2f, want %.2f", dp.ID, dp.Value, expected)
		}
	}
}

func TestClassify(t *testing.T) {
	ch := make(chan DataPoint, 3)
	ch <- DataPoint{ID: 1, Value: 5}
	ch <- DataPoint{ID: 2, Value: 25}
	ch <- DataPoint{ID: 3, Value: 75}
	close(ch)

	results := classify(ch)
	labels := map[int]string{}
	for r := range results {
		labels[r.ID] = r.Label
	}
	if labels[1] != "low" {
		t.Errorf("ID 1 label = %s, want low", labels[1])
	}
	if labels[2] != "medium" {
		t.Errorf("ID 2 label = %s, want medium", labels[2])
	}
	if labels[3] != "high" {
		t.Errorf("ID 3 label = %s, want high", labels[3])
	}
}

func TestCollect(t *testing.T) {
	ch := make(chan Result, 3)
	ch <- Result{ID: 1, Label: "a"}
	ch <- Result{ID: 2, Label: "b"}
	ch <- Result{ID: 3, Label: "c"}
	close(ch)

	results := collect(ch)
	if len(results) != 3 {
		t.Errorf("collected %d results, want 3", len(results))
	}
}

func TestRunPipeline(t *testing.T) {
	results := RunPipeline(50, 2)
	if len(results) == 0 {
		t.Fatal("pipeline produced no results")
	}
	for _, r := range results {
		if r.Label == "" {
			t.Errorf("result ID %d has empty label", r.ID)
		}
		if r.Processed < 0 {
			t.Errorf("result ID %d has negative processed value", r.ID)
		}
	}
}

func TestRunPipelineSingleWorker(t *testing.T) {
	results := RunPipeline(20, 1)
	if len(results) == 0 {
		t.Fatal("pipeline with 1 worker produced no results")
	}
}

func TestFanOutFanIn(t *testing.T) {
	source := generate(20)
	filtered := filter(source, 0)
	branches := fanOut(filtered, 3)

	resultChans := make([]<-chan Result, 3)
	for i, branch := range branches {
		resultChans[i] = classify(branch)
	}
	merged := fanIn(resultChans...)
	results := collect(merged)
	if len(results) != 20 {
		t.Errorf("fan out/in produced %d results, want 20", len(results))
	}
}

func BenchmarkRunPipeline10(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		RunPipeline(10, 2)
	}
}

func BenchmarkRunPipeline100(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		RunPipeline(100, 4)
	}
}

func BenchmarkRunPipeline1000(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		RunPipeline(1000, 4)
	}
}

func BenchmarkGenerate(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ch := generate(100)
		for range ch {
		}
	}
}
