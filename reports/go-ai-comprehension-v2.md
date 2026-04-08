# AET-Go v2 AI Comprehension Test Examples

These examples test whether an AI can understand AET-Go v2 syntax.
For each example, the AI should be able to explain what the code does
and identify the Go equivalent.

---

## Example 1: Simple Function (fibonacci + range loop)

### AET-Go v2

```
!go-v2;fibonacci(n:int)->int{if n<=1{^n};a:=0;b:=1;for i:=2;i<=n;i++{a,b=b,a+b};b};main(){results:=make([]int,0);for i:=0;i<=12;i++{results+=fibonacci(i)};for _,v:=range results{pf("%d ",v)};pl();pf("Count: %d\n",#results)}
```

### Go Equivalent

```go
package main

import "fmt"

func fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    a := 0
    b := 1
    for i := 2; i <= n; i++ {
        a, b = b, a+b
    }
    return b
}

func main() {
    results := make([]int, 0)
    for i := 0; i <= 12; i++ {
        results = append(results, fibonacci(i))
    }
    for _, v := range results {
        fmt.Printf("%d ", v)
    }
    fmt.Println()
    fmt.Printf("Count: %d\n", len(results))
}
```

### What this tests

- **Implicit return**: `fibonacci` returns `b` as the last expression without `return`
- **Early return with `^`**: `^n` maps to `return n`
- **`+=` append sugar**: `results+=fibonacci(i)` maps to `results = append(results, fibonacci(i))`
- **`#` len operator**: `#results` maps to `len(results)`
- **Stdlib aliases**: `pf` = `fmt.Printf`, `pl` = `fmt.Println`
- **No `func` keyword**: bare `fibonacci(n:int)->int{...}` declares a function
- **Typed parameters**: `n:int` with colon separator, `->int` for return type

---

## Example 2: Error Handling (file read with ? propagation)

### AET-Go v2

```
!go-v2;@Config{Host:string;Port:int;Debug:bool};parsePort(s:string)->!int{port:=Ai(s)?!"invalid port";if port<1||port>65535{^0,Ef("port out of range: %d",port)};^port,nil};loadConfig(path:string)->!*Config{data:=rf(path)?!"reading config";lines:=ss(St(string(data)),"\n");if #lines<3{^nil,En("config requires at least 3 lines")};host:=St(lines[0]);port:=parsePort(St(lines[1]))?;debug:=St(lines[2])=="true";^&Config{Host:host,Port:port,Debug:debug},nil};main(){cfg:=loadConfig("app.conf")?;pf("Server: %s:%d (debug=%v)\n",cfg.Host,cfg.Port,cfg.Debug)}
```

### Go Equivalent

```go
package main

import (
    "errors"
    "fmt"
    "os"
    "strconv"
    "strings"
)

type Config struct {
    Host  string
    Port  int
    Debug bool
}

func parsePort(s string) (int, error) {
    port, err := strconv.Atoi(s)
    if err != nil {
        return 0, fmt.Errorf("invalid port: %w", err)
    }
    if port < 1 || port > 65535 {
        return 0, fmt.Errorf("port out of range: %d", port)
    }
    return port, nil
}

func loadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("reading config: %w", err)
    }
    lines := strings.Split(strings.TrimSpace(string(data)), "\n")
    if len(lines) < 3 {
        return nil, errors.New("config requires at least 3 lines")
    }
    host := strings.TrimSpace(lines[0])
    port, err := parsePort(strings.TrimSpace(lines[1]))
    if err != nil {
        return nil, err
    }
    debug := strings.TrimSpace(lines[2]) == "true"
    return &Config{Host: host, Port: port, Debug: debug}, nil
}

func main() {
    cfg, err := loadConfig("app.conf")
    if err != nil {
        fmt.Println(err)
        os.Exit(1)
    }
    fmt.Printf("Server: %s:%d (debug=%v)\n", cfg.Host, cfg.Port, cfg.Debug)
}
```

### What this tests

- **`->!T` error return sugar**: `->!int` expands to `(int, error)`, `->!*Config` expands to `(*Config, error)`
- **`?` error propagation**: `rf(path)?` unwraps the result or returns the error
- **`?!` error wrapping**: `rf(path)?!"reading config"` wraps the error with context via `fmt.Errorf`
- **`#` len operator**: `#lines` maps to `len(lines)`
- **`@Config{...}` struct declaration**: replaces `type Config struct { ... }`
- **Stdlib aliases**: `rf` = `os.ReadFile`, `Ai` = `strconv.Atoi`, `ss` = `strings.Split`, `St` = `strings.TrimSpace`, `En` = `errors.New`, `Ef` = `fmt.Errorf`, `pf` = `fmt.Printf`
- **Error propagation chain**: `parsePort` uses `?!`, then `loadConfig` calls `parsePort` with `?`

---

## Example 3: Goroutine + Channel (concurrent worker pool)

### AET-Go v2

```
!go-v2;@Job{ID:int;Payload:string};@Result{JobID:int;Output:string;Duration:time.Duration};worker(id:int,jobs:<-chan Job,results:chan<- Result){for j:=range jobs{start:=tn();processed:=sf("[worker-%d] %s",id,Su(j.Payload));Tk(50*Tm);results<-Result{JobID:j.ID,Output:processed,Duration:Ts(start)}}};main(){const numWorkers=3;const numJobs=9;jobs:=make(chan Job,numJobs);results:=make(chan Result,numJobs);var wg wg;for w:=1;w<=numWorkers;w++{wg.Add(1);go{defer wg.Done();worker(w,jobs,results)}};for j:=1;j<=numJobs;j++{jobs<-Job{ID:j,Payload:sf("task-%d",j)}};close(jobs);go{wg.Wait();close(results)};for r:=range results{pf("Job #%d: %s (%v)\n",r.JobID,r.Output,r.Duration)};pl("All jobs complete")}
```

### Go Equivalent

```go
package main

import (
    "fmt"
    "strings"
    "sync"
    "time"
)

type Job struct {
    ID      int
    Payload string
}

type Result struct {
    JobID    int
    Output   string
    Duration time.Duration
}

func worker(id int, jobs <-chan Job, results chan<- Result) {
    for j := range jobs {
        start := time.Now()
        processed := fmt.Sprintf("[worker-%d] %s", id, strings.ToUpper(j.Payload))
        time.Sleep(50 * time.Millisecond)
        results <- Result{JobID: j.ID, Output: processed, Duration: time.Since(start)}
    }
}

func main() {
    const numWorkers = 3
    const numJobs = 9
    jobs := make(chan Job, numJobs)
    results := make(chan Result, numJobs)

    var wg sync.WaitGroup
    for w := 1; w <= numWorkers; w++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            worker(w, jobs, results)
        }()
    }

    for j := 1; j <= numJobs; j++ {
        jobs <- Job{ID: j, Payload: fmt.Sprintf("task-%d", j)}
    }
    close(jobs)

    go func() {
        wg.Wait()
        close(results)
    }()

    for r := range results {
        fmt.Printf("Job #%d: %s (%v)\n", r.JobID, r.Output, r.Duration)
    }
    fmt.Println("All jobs complete")
}
```

### What this tests

- **Anonymous goroutine `go{...}`**: `go{defer wg.Done();worker(w,jobs,results)}` expands to `go func() { defer wg.Done(); worker(w, jobs, results) }()`
- **`var wg wg`**: `wg` type alias maps to `sync.WaitGroup`
- **Channel operations**: `<-chan`, `chan<-`, send/receive syntax preserved from Go
- **`@Job{...}` / `@Result{...}`**: struct declarations with typed fields
- **Stdlib aliases**: `sf` = `fmt.Sprintf`, `Su` = `strings.ToUpper`, `tn` = `time.Now`, `Ts` = `time.Since`, `Tk` = `time.Sleep`, `Tm` = `time.Millisecond`, `pf` = `fmt.Printf`, `pl` = `fmt.Println`
- **Concurrency pattern**: worker pool with fan-out via buffered channels, WaitGroup for synchronization, goroutine to close results channel after all workers finish

---

## Example 4: Struct + Method (key-value store with TTL)

### AET-Go v2

```
!go-v2;@Item{Value:string;Expires:time.Time;HasTTL:bool};Item.IsExpired()->bool{if !i.HasTTL{^false};^tn().After(i.Expires)};@Store{mu:mx;data:map[string]Item;stats:map[string]int};NewStore()->*Store{^&Store{data:make(map[string]Item),stats:make(map[string]int)}};Store.Set(key:string,val:string){s.mu.Lock();defer s.mu.Unlock();s.data[key]=Item{Value:val};s.stats["sets"]++};Store.SetTTL(key:string,val:string,ttl:time.Duration){s.mu.Lock();defer s.mu.Unlock();s.data[key]=Item{Value:val,Expires:tn().Add(ttl),HasTTL:true};s.stats["sets"]++};Store.Get(key:string)->!string{s.mu.Lock();defer s.mu.Unlock();item,ok:=s.data[key];if !ok{^"",Ef("key %q not found",key)};if item.IsExpired(){delete(s.data,key);^"",Ef("key %q expired",key)};s.stats["gets"]++;^item.Value,nil};Store.Delete(key:string)->!{s.mu.Lock();defer s.mu.Unlock();if _,ok:=s.data[key];!ok{^Ef("key %q not found",key)};delete(s.data,key);s.stats["deletes"]++;^nil};Store.Keys()->[]string{s.mu.Lock();defer s.mu.Unlock();keys:=make([]string,0,#s.data);for k,item:=range s.data{if !item.IsExpired(){keys+=k}};^keys};Store.Len()->int{^#s.Keys()};Store.Stats()->string{s.mu.Lock();defer s.mu.Unlock();^sf("sets=%d gets=%d deletes=%d items=%d",s.stats["sets"],s.stats["gets"],s.stats["deletes"],#s.data)};main(){store:=NewStore();store.Set("name","Alice");store.Set("role","admin");store.SetTTL("token","abc123",2*Tc);val:=store.Get("name")?;pf("name = %s\n",val);pf("keys = %v\n",store.Keys());pf("len = %d\n",store.Len());store.Delete("role")?;pf("after delete: %v\n",store.Keys());pf("stats: %s\n",store.Stats())}
```

### Go Equivalent

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

type Item struct {
    Value  string
    Expires time.Time
    HasTTL bool
}

func (i *Item) IsExpired() bool {
    if !i.HasTTL {
        return false
    }
    return time.Now().After(i.Expires)
}

type Store struct {
    mu    sync.Mutex
    data  map[string]Item
    stats map[string]int
}

func NewStore() *Store {
    return &Store{
        data:  make(map[string]Item),
        stats: make(map[string]int),
    }
}

func (s *Store) Set(key string, val string) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.data[key] = Item{Value: val}
    s.stats["sets"]++
}

func (s *Store) SetTTL(key string, val string, ttl time.Duration) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.data[key] = Item{Value: val, Expires: time.Now().Add(ttl), HasTTL: true}
    s.stats["sets"]++
}

func (s *Store) Get(key string) (string, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    item, ok := s.data[key]
    if !ok {
        return "", fmt.Errorf("key %q not found", key)
    }
    if item.IsExpired() {
        delete(s.data, key)
        return "", fmt.Errorf("key %q expired", key)
    }
    s.stats["gets"]++
    return item.Value, nil
}

func (s *Store) Delete(key string) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    if _, ok := s.data[key]; !ok {
        return fmt.Errorf("key %q not found", key)
    }
    delete(s.data, key)
    s.stats["deletes"]++
    return nil
}

func (s *Store) Keys() []string {
    s.mu.Lock()
    defer s.mu.Unlock()
    keys := make([]string, 0, len(s.data))
    for k, item := range s.data {
        if !item.IsExpired() {
            keys = append(keys, k)
        }
    }
    return keys
}

func (s *Store) Len() int {
    return len(s.Keys())
}

func (s *Store) Stats() string {
    s.mu.Lock()
    defer s.mu.Unlock()
    return fmt.Sprintf("sets=%d gets=%d deletes=%d items=%d",
        s.stats["sets"], s.stats["gets"], s.stats["deletes"], len(s.data))
}

func main() {
    store := NewStore()
    store.Set("name", "Alice")
    store.Set("role", "admin")
    store.SetTTL("token", "abc123", 2*time.Second)

    val, err := store.Get("name")
    if err != nil {
        fmt.Println(err)
        return
    }
    fmt.Printf("name = %s\n", val)
    fmt.Printf("keys = %v\n", store.Keys())
    fmt.Printf("len = %d\n", store.Len())

    err = store.Delete("role")
    if err != nil {
        fmt.Println(err)
        return
    }
    fmt.Printf("after delete: %v\n", store.Keys())
    fmt.Printf("stats: %s\n", store.Stats())
}
```

### What this tests

- **`@Struct{...}` declaration**: `@Item{...}` and `@Store{...}` replace `type X struct { ... }`
- **Method declaration**: `Store.Get(key:string)->!string{...}` declares a pointer-receiver method
- **Receiver auto-naming**: `Store` methods use `s` (first letter lowercased), `Item` uses `i`
- **`->!T` error return**: `->!string` expands to `(string, error)`
- **`->!` bare error return**: `Store.Delete` returns just `error`
- **`#` len operator**: `#s.data` maps to `len(s.data)`, `#s.Keys()` maps to `len(s.Keys())`
- **`+=` append sugar**: `keys+=k` maps to `keys = append(keys, k)`
- **`mx` sync alias**: `mu:mx` declares a `sync.Mutex` field
- **`Tc` time alias**: `Tc` = `time.Second`
- **`?` in main**: `store.Get("name")?` propagates error in main context
- **Stdlib aliases**: `Ef` = `fmt.Errorf`, `sf` = `fmt.Sprintf`, `pf` = `fmt.Printf`, `tn` = `time.Now`

---

## Example 5: HTTP Server (with error handling and JSON)

### AET-Go v2

```
!go-v2;@Todo{ID:int;Title:string;Done:bool};@TodoStore{mu:mx;items:[]Todo;nextID:int};NewTodoStore()->*TodoStore{^&TodoStore{items:make([]Todo,0),nextID:1}};TodoStore.Add(title:string)->Todo{t.mu.Lock();defer t.mu.Unlock();todo:=Todo{ID:t.nextID,Title:title,Done:false};t.nextID++;t.items+=todo;^todo};TodoStore.GetAll()->[]Todo{t.mu.Lock();defer t.mu.Unlock();result:=make([]Todo,#t.items);copy(result,t.items);^result};TodoStore.Toggle(id:int)->!{t.mu.Lock();defer t.mu.Unlock();for i:=range t.items{if t.items[i].ID==id{t.items[i].Done=!t.items[i].Done;^nil}};^Ef("todo %d not found",id)};@Server{store:*TodoStore};NewServer()->*Server{^&Server{store:NewTodoStore()}};Server.handleList(w:http.ResponseWriter,r:*http.Request){todos:=s.store.GetAll();w.Header().Set("Content-Type","application/json");Je(w).Encode(todos)};Server.handleAdd(w:http.ResponseWriter,r:*http.Request){var input struct{Title string};if err:=jd(r.Body).Decode(&input);err!=nil{He(w,"invalid JSON",http.StatusBadRequest);^};if #input.Title==0{He(w,"title required",http.StatusBadRequest);^};todo:=s.store.Add(input.Title);w.Header().Set("Content-Type","application/json");w.WriteHeader(http.StatusCreated);Je(w).Encode(todo)};Server.handleToggle(w:http.ResponseWriter,r:*http.Request){idStr:=r.URL.Query().Get("id");id,err:=Ai(idStr);if err!=nil{He(w,"invalid id",http.StatusBadRequest);^};if err:=s.store.Toggle(id);err!=nil{He(w,err.Error(),Nf);^};w.WriteHeader(Ok)};main(){srv:=NewServer();mux:=Hm();mux.HandleFunc("/todos",{w,r|switch r.Method{case Mg:srv.handleList(w,r);case http.MethodPost:srv.handleAdd(w,r);default:He(w,"method not allowed",http.StatusMethodNotAllowed)}});mux.HandleFunc("/todos/toggle",{w,r|srv.handleToggle(w,r)});pf("Listening on :8080\n");if err:=hl(":8080",mux);err!=nil{Lf(err)}}
```

### Go Equivalent

```go
package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "strconv"
    "sync"
)

type Todo struct {
    ID    int    `json:"id"`
    Title string `json:"title"`
    Done  bool   `json:"done"`
}

type TodoStore struct {
    mu     sync.Mutex
    items  []Todo
    nextID int
}

func NewTodoStore() *TodoStore {
    return &TodoStore{items: make([]Todo, 0), nextID: 1}
}

func (t *TodoStore) Add(title string) Todo {
    t.mu.Lock()
    defer t.mu.Unlock()
    todo := Todo{ID: t.nextID, Title: title, Done: false}
    t.nextID++
    t.items = append(t.items, todo)
    return todo
}

func (t *TodoStore) GetAll() []Todo {
    t.mu.Lock()
    defer t.mu.Unlock()
    result := make([]Todo, len(t.items))
    copy(result, t.items)
    return result
}

func (t *TodoStore) Toggle(id int) error {
    t.mu.Lock()
    defer t.mu.Unlock()
    for i := range t.items {
        if t.items[i].ID == id {
            t.items[i].Done = !t.items[i].Done
            return nil
        }
    }
    return fmt.Errorf("todo %d not found", id)
}

type Server struct {
    store *TodoStore
}

func NewServer() *Server {
    return &Server{store: NewTodoStore()}
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
    todos := s.store.GetAll()
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(todos)
}

func (s *Server) handleAdd(w http.ResponseWriter, r *http.Request) {
    var input struct{ Title string }
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        http.Error(w, "invalid JSON", http.StatusBadRequest)
        return
    }
    if len(input.Title) == 0 {
        http.Error(w, "title required", http.StatusBadRequest)
        return
    }
    todo := s.store.Add(input.Title)
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(todo)
}

func (s *Server) handleToggle(w http.ResponseWriter, r *http.Request) {
    idStr := r.URL.Query().Get("id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        http.Error(w, "invalid id", http.StatusBadRequest)
        return
    }
    if err := s.store.Toggle(id); err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }
    w.WriteHeader(http.StatusOK)
}

func main() {
    srv := NewServer()
    mux := http.NewServeMux()
    mux.HandleFunc("/todos", func(w http.ResponseWriter, r *http.Request) {
        switch r.Method {
        case http.MethodGet:
            srv.handleList(w, r)
        case http.MethodPost:
            srv.handleAdd(w, r)
        default:
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        }
    })
    mux.HandleFunc("/todos/toggle", func(w http.ResponseWriter, r *http.Request) {
        srv.handleToggle(w, r)
    })
    fmt.Printf("Listening on :8080\n")
    if err := http.ListenAndServe(":8080", mux); err != nil {
        log.Fatal(err)
    }
}
```

### What this tests

- **Combines all v2 features** in a realistic HTTP application
- **HTTP aliases**: `hl` = `http.ListenAndServe`, `Hm` = `http.NewServeMux`, `He` = `http.Error`, `Ok` = `http.StatusOK`, `Nf` = `http.StatusNotFound`, `Mg` = `http.MethodGet`
- **JSON aliases**: `Je` = `json.NewEncoder`, `jd` = `json.NewDecoder`
- **Lambda syntax**: `{w,r|...}` for anonymous handler functions with pipe separator
- **`@Struct{...}`**: multiple struct declarations (`Todo`, `TodoStore`, `Server`)
- **Method declaration**: `Server.handleList(w:http.ResponseWriter,r:*http.Request)` with auto-receiver `s`
- **`->!` bare error return**: `TodoStore.Toggle` returns just `error`
- **`#` len operator**: `#input.Title` maps to `len(input.Title)`, `#t.items` maps to `len(t.items)`
- **`+=` append sugar**: `t.items+=todo` maps to `t.items = append(t.items, todo)`
- **`mx` sync alias**: mutex field declaration
- **`^` early return**: used throughout handlers for error early-exit
- **`Lf` log alias**: `Lf` = `log.Fatal`
- **Auto JSON tags**: struct fields get lowercase JSON tags automatically during transpilation
- **No imports/package**: transpiler auto-resolves `net/http`, `encoding/json`, `fmt`, `log`, `strconv`, `sync`

---

## Summary of v2 Features Covered

| Feature | Ex.1 | Ex.2 | Ex.3 | Ex.4 | Ex.5 |
|---------|------|------|------|------|------|
| `!go-v2` version marker | x | x | x | x | x |
| No `func` keyword | x | x | x | x | x |
| `^` early return | x | x | | x | x |
| Implicit return (last expr) | x | | | | |
| `@Struct{...}` declaration | | x | x | x | x |
| `TypeName.method()` syntax | | | | x | x |
| `->T` return type | x | | | | |
| `->!T` error return sugar | | x | | x | x |
| `->!` bare error return | | | | x | x |
| `?` error propagation | | x | | | |
| `?!` error wrapping | | x | | | |
| `#` len operator | x | x | | x | x |
| `+=` append sugar | x | | | x | x |
| `go{...}` anonymous goroutine | | | x | | |
| `{params\|body}` lambda | | | | | x |
| Channel operations | | | x | | |
| `var wg wg` (WaitGroup) | | | x | | |
| `mx` (Mutex) | | | | x | x |
| `defer` | | | x | x | x |
| HTTP aliases (`hl`,`He`,`Ok`...) | | | | | x |
| JSON aliases (`Je`,`jd`) | | | | | x |
| fmt aliases (`pf`,`pl`,`sf`,`Ef`) | x | x | x | x | x |
| Other stdlib aliases | | x | x | x | x |
| `ft` fallthrough | | | | | |
| `make`/`range`/`delete` canonical | x | | x | x | x |
