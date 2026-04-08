# AET-Go v2: Concurrency Compression Analysis

## Goroutine Patterns

| Pattern | Go Tokens | AET v1 Tokens | v2 Proposed | v2 Tokens | Saving |
|---------|-----------|---------------|-------------|-----------|--------|
| `go func() { doWork() }()` | 9 | 5 (`go{doWork()}`) | `go{doWork()}` | 5 | 44% vs Go |
| Named goroutine: `go process()` | 3 | 3 | 3 | 3 | 0% |
| Goroutine with closure vars | 12 | 8 | 8 | 8 | 33% vs Go |

**Decision:** Keep `go{...}` syntax (already optimal). `go` is 1 token; `G` is also 1 token = zero benefit. The savings come from eliminating `func(){}()` boilerplate, which v1 already does.

## Channel Patterns

| Pattern | Go Tokens | AET v2 Tokens | Saving |
|---------|-----------|---------------|--------|
| `ch := make(chan int)` | 6 | `ch:=make(chan int)` = 6 | 0% |
| `ch := make(chan int, 10)` | 9 | `ch:=make(chan int,10)` = 8 | 11% |
| `ch <- value` | 3 | `ch<-value` = 3 | 0% |
| `v := <-ch` | 4 | `v:=<-ch` = 4 | 0% |
| Close: `close(ch)` | 3 | `close(ch)` = 3 | 0% |

**Decision:** Channel operations are already tightly tokenized. `make(chan T)` could potentially use a shorter form but channels are medium-frequency. Keep Go-native syntax.

## Select Statement

| Pattern | Go Tokens | AET v2 Tokens | Saving |
|---------|-----------|---------------|--------|
| 3-case select with bodies | 33 | 29 | 12% |
| 2-case select (typical) | 22 | 19 | 14% |

Savings come from whitespace removal and stdlib aliases, not structural changes.

**Decision:** Keep `select{case ...:...;case ...:...;default:...}` syntax. Already compressed via semicolons.

## Defer

| Pattern | Go Tokens | AET v2 Tokens | Saving |
|---------|-----------|---------------|--------|
| `defer file.Close()` | 4 | `defer f.Close()` = 4 | 0% |
| `defer func() { cleanup() }()` | 7 | `defer{cleanup()}` = 4 | 43% |

**Decision:** Keep `defer` keyword (1 token). `D` is also 1 token = zero benefit. Anonymous defer `defer{...}` saves vs `defer func(){...}()`.

## WaitGroup Pattern (Composite)

```
// Go: 25 tokens
var wg sync.WaitGroup
wg.Add(1)
go func() {
    defer wg.Done()
    process()
}()
wg.Wait()

// AET v2: 17 tokens (32% saving)
wg:=wg{};wg.Add(1);go{defer wg.Done();process()};wg.Wait()
```

Note: `wg` is a stdlib alias for `sync.WaitGroup`.

## Real-World Concurrent Fetch Pattern

```
// Go: 42 tokens
var wg sync.WaitGroup
results := make([]string, len(urls))
for i, url := range urls {
    wg.Add(1)
    go func(i int, url string) {
        defer wg.Done()
        results[i] = fetch(url)
    }(i, url)
}
wg.Wait()

// AET v2: 30 tokens (29% saving)
wg:=wg{};results:=make([]string,#urls);for i,url:=range urls{wg.Add(1);go{defer wg.Done();results[i]=fetch(url)}};wg.Wait()
```

Key savings: `#urls` for `len(urls)`, anonymous goroutine, whitespace elimination.

## Panic/Recover

| Pattern | Go Tokens | AET v2 Tokens | Saving |
|---------|-----------|---------------|--------|
| `panic("error")` | 4 | 4 | 0% |
| Full defer-recover pattern | 22 | 15 | 32% |

Panic/recover is rare in idiomatic Go. Not worth special syntax.

**Decision:** Keep `panic`/`recover` as-is (both 1 token).

## Mutex Pattern

| Pattern | Go Tokens | AET v2 Tokens | Saving |
|---------|-----------|---------------|--------|
| `mu.Lock(); defer mu.Unlock()` | 7 | 7 | 0% |

Already compact. `mx` is stdlib alias for `sync.Mutex`.

## Summary: Concurrency Compression ROI

| Strategy | Per-Instance Saving | Frequency | ROI |
|----------|-------------------|-----------|-----|
| `go{...}` (eliminate func wrapper) | 4 tokens (44%) | Medium-High | **HIGH** |
| `defer{...}` (anonymous defer) | 3 tokens (43%) | Medium | **MEDIUM** |
| `#x` for `len(x)` in concurrent patterns | 1 token (33%) | High | **HIGH** |
| Keyword rename (`go`->`G`, `defer`->`D`) | 0 tokens | — | **ZERO** |
| Channel syntax changes | 0-1 tokens | Medium | **LOW** |
| Select/panic/recover changes | 0 tokens | Low | **ZERO** |

**Bottom line:** Concurrency compression gains come from **structural simplification** (eliminating `func(){}()` wrappers), not keyword renaming. All Go concurrency keywords are already 1 token each.
