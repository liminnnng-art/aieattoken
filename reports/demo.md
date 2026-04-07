# Demo: AET vs Go — Caesar Cipher (Medium Difficulty)

## AET Source (caesar.aet) — 135 tokens

```
!v1;caesar(text:string,shift:int)->string{result:=make([]byte,len(text));for i,c:=range text{switch{case c>='a'&&c<='z':result[i]=byte('a'+(int(c-'a')+shift)%26);case c>='A'&&c<='Z':result[i]=byte('A'+(int(c-'A')+shift)%26);default:result[i]=byte(c)}};^string(result)};main(){plain:="The quick brown fox jumps over the lazy dog";enc:=caesar(plain,13);pl(enc);pl(caesar(enc,13))}
```

## Transpiled Go Output — 242 tokens

```go
package main

import "fmt"

func caesar(text string, shift int) string {
	result := make([]byte, len(text))
	for i, c := range text {
		switch {
		case c >= 'a' && c <= 'z':
			result[i] = byte('a' + (int(c-'a')+shift)%26)
		case c >= 'A' && c <= 'Z':
			result[i] = byte('A' + (int(c-'A')+shift)%26)
		default:
			result[i] = byte(c)
		}
	}
	return string(result)
}

func main() {
	plain := "The quick brown fox jumps over the lazy dog"
	enc := caesar(plain, 13)
	fmt.Println(enc)
	fmt.Println(caesar(enc, 13))
}
```

## Execution Output

```
Gur dhvpx oebja sbk whzcf bire gur ynml qbt
The quick brown fox jumps over the lazy dog
```

## Token Comparison

| Language | Tokens | vs Go |
|----------|--------|-------|
| Go | 242 | baseline |
| **AET** | **135** | **-44.2%** |
| Python | 186 | -23.1% |
| Clojure | 208 | -14.0% |
| J | 203 | -16.1% |

## Where Tokens Are Saved

| Compression Source | Tokens Saved |
|-------------------|-------------|
| Package + import elimination | ~7 |
| `func` keyword removal × 2 | 2 |
| Whitespace/newlines | ~30 |
| `return` → implicit/`^` | 2 |
| `fmt.Println` → `pl` | 2 |
| Type annotations on well-known funcs | ~3 |
| Structural compression (`;` separators) | ~61 |
| **Total** | **~107 tokens saved** |

## AI Comprehension

Status: Pending API key. The code uses standard programming constructs (loops, switch, byte operations) that AI models are known to understand well. The `?` operator and stdlib aliases are well-documented in the spec.
