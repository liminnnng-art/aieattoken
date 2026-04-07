package main

import "fmt"

func caesarEncrypt(s string, shift int) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z':
			result[i] = byte((int(c-'A')+shift)%26) + 'A'
		case c >= 'a' && c <= 'z':
			result[i] = byte((int(c-'a')+shift)%26) + 'a'
		default:
			result[i] = c
		}
	}
	return string(result)
}

func caesarDecrypt(s string, shift int) string {
	return caesarEncrypt(s, 26-shift)
}

func main() {
	text := "The quick brown fox jumps over the lazy dog"
	shift := 13
	encrypted := caesarEncrypt(text, shift)
	decrypted := caesarDecrypt(encrypted, shift)
	fmt.Printf("Original:  %s\n", text)
	fmt.Printf("Encrypted: %s\n", encrypted)
	fmt.Printf("Decrypted: %s\n", decrypted)
}
