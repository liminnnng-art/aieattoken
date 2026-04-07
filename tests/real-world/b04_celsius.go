package main

import "fmt"

type Temperature struct {
	Value float64
	Unit  string
}

func (t Temperature) ToCelsius() float64 {
	switch t.Unit {
	case "F":
		return (t.Value - 32) * 5 / 9
	case "K":
		return t.Value - 273.15
	default:
		return t.Value
	}
}

func (t Temperature) ToFahrenheit() float64 {
	switch t.Unit {
	case "C":
		return t.Value*9/5 + 32
	case "K":
		return (t.Value-273.15)*9/5 + 32
	default:
		return t.Value
	}
}

func (t Temperature) ToKelvin() float64 {
	switch t.Unit {
	case "C":
		return t.Value + 273.15
	case "F":
		return (t.Value-32)*5/9 + 273.15
	default:
		return t.Value
	}
}

func (t Temperature) String() string {
	return fmt.Sprintf("%.2f%s", t.Value, t.Unit)
}

func main() {
	temps := []Temperature{
		{100, "C"},
		{212, "F"},
		{373.15, "K"},
	}
	for _, t := range temps {
		fmt.Printf("%s -> C=%.2f F=%.2f K=%.2f\n",
			t.String(), t.ToCelsius(), t.ToFahrenheit(), t.ToKelvin())
	}
}
