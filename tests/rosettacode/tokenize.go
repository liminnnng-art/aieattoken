package main

import (
	"fmt"
	"strings"
)

func main() {
	s := "Hello,How,Are,You,Today"
	tokens := strings.Split(s, ",")
	for _, t := range tokens {
		fmt.Println(t)
	}
}
