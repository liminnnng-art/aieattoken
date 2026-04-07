package main

import (
	"fmt"
	"math"
	"sync"
	"time"
)

type DataPoint struct {
	ID        int
	Value     float64
	Timestamp time.Time
	Tags      []string
}

type Result struct {
	ID       int
	Original float64
	Processed float64
	Label    string
}

func generate(count int) <-chan DataPoint {
	out := make(chan DataPoint)
	go func() {
		defer close(out)
		for i := 0; i < count; i++ {
			out <- DataPoint{
				ID:        i,
				Value:     float64(i) * 1.5,
				Timestamp: time.Now(),
				Tags:      []string{"raw"},
			}
		}
	}()
	return out
}

func filter(in <-chan DataPoint, minVal float64) <-chan DataPoint {
	out := make(chan DataPoint)
	go func() {
		defer close(out)
		for dp := range in {
			if dp.Value >= minVal {
				out <- dp
			}
		}
	}()
	return out
}

func transform(in <-chan DataPoint, fn func(float64) float64) <-chan DataPoint {
	out := make(chan DataPoint)
	go func() {
		defer close(out)
		for dp := range in {
			dp.Value = fn(dp.Value)
			dp.Tags = append(dp.Tags, "transformed")
			out <- dp
		}
	}()
	return out
}

func classify(in <-chan DataPoint) <-chan Result {
	out := make(chan Result)
	go func() {
		defer close(out)
		for dp := range in {
			label := "low"
			if dp.Value >= 10 {
				label = "medium"
			}
			if dp.Value >= 50 {
				label = "high"
			}
			out <- Result{
				ID:        dp.ID,
				Original:  float64(dp.ID) * 1.5,
				Processed: dp.Value,
				Label:     label,
			}
		}
	}()
	return out
}

func fanOut(in <-chan DataPoint, n int) []<-chan DataPoint {
	outs := make([]<-chan DataPoint, n)
	chs := make([]chan DataPoint, n)
	for i := 0; i < n; i++ {
		chs[i] = make(chan DataPoint)
		outs[i] = chs[i]
	}
	go func() {
		defer func() {
			for _, ch := range chs {
				close(ch)
			}
		}()
		idx := 0
		for dp := range in {
			chs[idx%n] <- dp
			idx++
		}
	}()
	return outs
}

func fanIn(channels ...<-chan Result) <-chan Result {
	out := make(chan Result)
	var wg sync.WaitGroup
	for _, ch := range channels {
		wg.Add(1)
		go func(c <-chan Result) {
			defer wg.Done()
			for r := range c {
				out <- r
			}
		}(ch)
	}
	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}

func collect(in <-chan Result) []Result {
	var results []Result
	for r := range in {
		results = append(results, r)
	}
	return results
}

func summarize(results []Result) {
	if len(results) == 0 {
		fmt.Println("No results")
		return
	}
	counts := map[string]int{}
	totalProcessed := 0.0
	for _, r := range results {
		counts[r.Label]++
		totalProcessed += r.Processed
	}
	fmt.Printf("Total: %d results\n", len(results))
	fmt.Printf("Average processed value: %.2f\n", totalProcessed/float64(len(results)))
	for label, count := range counts {
		fmt.Printf("  %s: %d\n", label, count)
	}
}

func RunPipeline(count int, workers int) []Result {
	source := generate(count)
	filtered := filter(source, 5.0)
	branches := fanOut(filtered, workers)

	resultChans := make([]<-chan Result, workers)
	for i, branch := range branches {
		transformed := transform(branch, func(v float64) float64 {
			return math.Sqrt(v) * 10
		})
		resultChans[i] = classify(transformed)
	}

	merged := fanIn(resultChans...)
	return collect(merged)
}

func main() {
	start := time.Now()
	results := RunPipeline(100, 4)
	elapsed := time.Since(start)

	summarize(results)
	fmt.Printf("Pipeline completed in %v\n", elapsed)
}
