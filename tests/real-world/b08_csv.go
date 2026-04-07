package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

type Record struct {
	Name   string
	Age    int
	Score  float64
	Active bool
}

func parseCSV(data string) ([]Record, error) {
	reader := csv.NewReader(strings.NewReader(data))
	rows, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read csv: %w", err)
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("csv must have header and at least one row")
	}

	header := rows[0]
	nameIdx, ageIdx, scoreIdx, activeIdx := -1, -1, -1, -1
	for i, h := range header {
		switch strings.TrimSpace(strings.ToLower(h)) {
		case "name":
			nameIdx = i
		case "age":
			ageIdx = i
		case "score":
			scoreIdx = i
		case "active":
			activeIdx = i
		}
	}
	if nameIdx == -1 {
		return nil, fmt.Errorf("missing 'name' column")
	}

	records := make([]Record, 0, len(rows)-1)
	for lineNum, row := range rows[1:] {
		rec := Record{}
		if nameIdx < len(row) {
			rec.Name = strings.TrimSpace(row[nameIdx])
		}
		if ageIdx >= 0 && ageIdx < len(row) {
			age, err := strconv.Atoi(strings.TrimSpace(row[ageIdx]))
			if err != nil {
				return nil, fmt.Errorf("line %d: invalid age: %w", lineNum+2, err)
			}
			rec.Age = age
		}
		if scoreIdx >= 0 && scoreIdx < len(row) {
			score, err := strconv.ParseFloat(strings.TrimSpace(row[scoreIdx]), 64)
			if err != nil {
				return nil, fmt.Errorf("line %d: invalid score: %w", lineNum+2, err)
			}
			rec.Score = score
		}
		if activeIdx >= 0 && activeIdx < len(row) {
			rec.Active = strings.TrimSpace(strings.ToLower(row[activeIdx])) == "true"
		}
		records = append(records, rec)
	}
	return records, nil
}

func filterActive(records []Record) []Record {
	result := make([]Record, 0)
	for _, r := range records {
		if r.Active {
			result = append(result, r)
		}
	}
	return result
}

func sortByScore(records []Record) []Record {
	sorted := make([]Record, len(records))
	copy(sorted, records)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Score > sorted[j].Score
	})
	return sorted
}

func averageScore(records []Record) float64 {
	if len(records) == 0 {
		return 0
	}
	total := 0.0
	for _, r := range records {
		total += r.Score
	}
	return total / float64(len(records))
}

func toCSV(records []Record) (string, error) {
	var buf strings.Builder
	writer := csv.NewWriter(&buf)
	err := writer.Write([]string{"name", "age", "score", "active"})
	if err != nil {
		return "", fmt.Errorf("write header: %w", err)
	}
	for _, r := range records {
		row := []string{
			r.Name,
			strconv.Itoa(r.Age),
			strconv.FormatFloat(r.Score, 'f', 2, 64),
			strconv.FormatBool(r.Active),
		}
		err := writer.Write(row)
		if err != nil {
			return "", fmt.Errorf("write row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return "", fmt.Errorf("flush: %w", err)
	}
	return buf.String(), nil
}

func main() {
	data := `name,age,score,active
Alice,30,95.5,true
Bob,25,82.3,true
Charlie,35,71.0,false
Diana,28,91.2,true
Eve,33,88.7,false`

	records, err := parseCSV(data)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Parse error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Total records: %d\n", len(records))
	fmt.Printf("Average score: %.2f\n", averageScore(records))

	active := filterActive(records)
	fmt.Printf("Active records: %d\n", len(active))

	sorted := sortByScore(records)
	fmt.Println("Top scorer:", sorted[0].Name)

	output, err := toCSV(active)
	if err != nil {
		fmt.Fprintf(os.Stderr, "CSV write error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Active records CSV:")
	fmt.Print(output)
}
