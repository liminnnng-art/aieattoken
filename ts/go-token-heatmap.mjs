// Analyze Go syntax structures and their token contribution
// Goal: Find which 20% of structures eat 80% of tokens

import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("cl100k_base");

function countTokens(code) {
  return enc.encode(code).length;
}

// Representative Go code patterns and their token costs
const goPatterns = {
  // --- Error Handling ---
  "error_check_basic": {
    code: `if err != nil {\n\treturn err\n}`,
    category: "Error Handling",
    description: "Basic error check + return"
  },
  "error_check_wrap": {
    code: `if err != nil {\n\treturn fmt.Errorf("failed to process: %w", err)\n}`,
    category: "Error Handling",
    description: "Error check + wrap with context"
  },
  "error_check_multi": {
    code: `result, err := doSomething()\nif err != nil {\n\treturn nil, err\n}`,
    category: "Error Handling",
    description: "Call + error check + multi-return"
  },

  // --- Function Declaration ---
  "func_simple": {
    code: `func add(a int, b int) int {\n\treturn a + b\n}`,
    category: "Function Declaration",
    description: "Simple function with types"
  },
  "func_multi_return": {
    code: `func divide(a, b float64) (float64, error) {\n\tif b == 0 {\n\t\treturn 0, fmt.Errorf("division by zero")\n\t}\n\treturn a / b, nil\n}`,
    category: "Function Declaration",
    description: "Function with multiple returns"
  },
  "func_method": {
    code: `func (s *Server) HandleRequest(w http.ResponseWriter, r *http.Request) {\n\tw.WriteHeader(http.StatusOK)\n}`,
    category: "Function Declaration",
    description: "Method on struct"
  },

  // --- Type Declarations ---
  "struct_basic": {
    code: `type User struct {\n\tName    string\n\tEmail   string\n\tAge     int\n\tActive  bool\n}`,
    category: "Type Declaration",
    description: "Basic struct"
  },
  "struct_with_tags": {
    code: `type User struct {\n\tName    string \`json:"name"\`\n\tEmail   string \`json:"email"\`\n\tAge     int    \`json:"age"\`\n}`,
    category: "Type Declaration",
    description: "Struct with JSON tags"
  },
  "interface_basic": {
    code: `type Reader interface {\n\tRead(p []byte) (n int, err error)\n}`,
    category: "Type Declaration",
    description: "Basic interface"
  },

  // --- Import / Package ---
  "import_single": {
    code: `package main\n\nimport "fmt"`,
    category: "Import/Package",
    description: "Single import"
  },
  "import_multi": {
    code: `package main\n\nimport (\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"os"\n\t"strings"\n)`,
    category: "Import/Package",
    description: "Multiple imports"
  },

  // --- Control Flow ---
  "for_basic": {
    code: `for i := 0; i < len(items); i++ {\n\tfmt.Println(items[i])\n}`,
    category: "Control Flow",
    description: "C-style for loop"
  },
  "for_range": {
    code: `for i, v := range items {\n\tfmt.Printf("%d: %v\\n", i, v)\n}`,
    category: "Control Flow",
    description: "Range loop"
  },
  "for_range_map": {
    code: `for key, value := range myMap {\n\tfmt.Printf("%s: %v\\n", key, value)\n}`,
    category: "Control Flow",
    description: "Map range loop"
  },
  "switch_basic": {
    code: `switch status {\ncase "active":\n\thandleActive()\ncase "inactive":\n\thandleInactive()\ndefault:\n\thandleUnknown()\n}`,
    category: "Control Flow",
    description: "Switch statement"
  },
  "if_else": {
    code: `if x > 10 {\n\treturn "big"\n} else if x > 5 {\n\treturn "medium"\n} else {\n\treturn "small"\n}`,
    category: "Control Flow",
    description: "If-else chain"
  },
  "select_chan": {
    code: `select {\ncase msg := <-ch1:\n\tfmt.Println(msg)\ncase <-done:\n\treturn\ncase <-time.After(time.Second):\n\tfmt.Println("timeout")\n}`,
    category: "Control Flow",
    description: "Select on channels"
  },

  // --- Variable Declaration ---
  "var_short": {
    code: `x := 42`,
    category: "Variable Declaration",
    description: "Short variable declaration"
  },
  "var_explicit": {
    code: `var x int = 42`,
    category: "Variable Declaration",
    description: "Explicit var declaration"
  },
  "var_multi": {
    code: `var (\n\tname   string = "test"\n\tcount  int    = 0\n\tactive bool   = true\n)`,
    category: "Variable Declaration",
    description: "Multiple var declarations"
  },

  // --- Concurrency ---
  "goroutine_basic": {
    code: `go func() {\n\tresult <- process(item)\n}()`,
    category: "Concurrency",
    description: "Basic goroutine"
  },
  "channel_make": {
    code: `ch := make(chan string, 10)`,
    category: "Concurrency",
    description: "Channel creation"
  },
  "waitgroup": {
    code: `var wg sync.WaitGroup\nfor _, item := range items {\n\twg.Add(1)\n\tgo func(it string) {\n\t\tdefer wg.Done()\n\t\tprocess(it)\n\t}(item)\n}\nwg.Wait()`,
    category: "Concurrency",
    description: "WaitGroup pattern"
  },
  "mutex": {
    code: `var mu sync.Mutex\nmu.Lock()\ndefer mu.Unlock()\ncounter++`,
    category: "Concurrency",
    description: "Mutex pattern"
  },

  // --- Defer / Panic / Recover ---
  "defer_close": {
    code: `file, err := os.Open("data.txt")\nif err != nil {\n\treturn err\n}\ndefer file.Close()`,
    category: "Defer/Panic/Recover",
    description: "Defer file close"
  },

  // --- Slice/Map Operations ---
  "slice_append": {
    code: `result := make([]string, 0)\nfor _, item := range items {\n\tif item.Active {\n\t\tresult = append(result, item.Name)\n\t}\n}`,
    category: "Collection Operations",
    description: "Filter + map pattern (manual)"
  },
  "map_create": {
    code: `m := make(map[string]int)\nm["key1"] = 1\nm["key2"] = 2`,
    category: "Collection Operations",
    description: "Map creation and population"
  },
  "map_check": {
    code: `if val, ok := m["key"]; ok {\n\tfmt.Println(val)\n}`,
    category: "Collection Operations",
    description: "Map existence check"
  },

  // --- String Operations ---
  "string_format": {
    code: `msg := fmt.Sprintf("Hello, %s! You have %d items.", name, count)`,
    category: "String Operations",
    description: "String formatting"
  },
  "string_join": {
    code: `result := strings.Join(parts, ", ")`,
    category: "String Operations",
    description: "String join"
  },

  // --- JSON ---
  "json_marshal": {
    code: `data, err := json.Marshal(user)\nif err != nil {\n\treturn err\n}`,
    category: "JSON",
    description: "JSON marshal with error"
  },
  "json_unmarshal": {
    code: `var user User\nif err := json.Unmarshal(data, &user); err != nil {\n\treturn err\n}`,
    category: "JSON",
    description: "JSON unmarshal with error"
  },

  // --- HTTP ---
  "http_handler": {
    code: `http.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {\n\tw.Header().Set("Content-Type", "application/json")\n\tjson.NewEncoder(w).Encode(users)\n})`,
    category: "HTTP",
    description: "HTTP handler"
  },
  "http_server": {
    code: `log.Fatal(http.ListenAndServe(":8080", nil))`,
    category: "HTTP",
    description: "HTTP server start"
  },

  // --- Testing ---
  "test_func": {
    code: `func TestAdd(t *testing.T) {\n\tresult := add(2, 3)\n\tif result != 5 {\n\t\tt.Errorf("add(2, 3) = %d, want 5", result)\n\t}\n}`,
    category: "Testing",
    description: "Basic test function"
  },
};

// A complete Go program to show overall composition
const completeProgram = `package main

import (
\t"encoding/json"
\t"fmt"
\t"net/http"
\t"sync"
)

type User struct {
\tName  string \`json:"name"\`
\tEmail string \`json:"email"\`
\tAge   int    \`json:"age"\`
}

type UserStore struct {
\tmu    sync.RWMutex
\tusers map[string]User
}

func NewUserStore() *UserStore {
\treturn &UserStore{
\t\tusers: make(map[string]User),
\t}
}

func (s *UserStore) Get(name string) (User, error) {
\ts.mu.RLock()
\tdefer s.mu.RUnlock()
\tuser, ok := s.users[name]
\tif !ok {
\t\treturn User{}, fmt.Errorf("user not found: %s", name)
\t}
\treturn user, nil
}

func (s *UserStore) Set(user User) {
\ts.mu.Lock()
\tdefer s.mu.Unlock()
\ts.users[user.Name] = user
}

func (s *UserStore) HandleGet(w http.ResponseWriter, r *http.Request) {
\tname := r.URL.Query().Get("name")
\tif name == "" {
\t\thttp.Error(w, "name parameter required", http.StatusBadRequest)
\t\treturn
\t}
\tuser, err := s.Get(name)
\tif err != nil {
\t\thttp.Error(w, err.Error(), http.StatusNotFound)
\t\treturn
\t}
\tw.Header().Set("Content-Type", "application/json")
\tif err := json.NewEncoder(w).Encode(user); err != nil {
\t\thttp.Error(w, err.Error(), http.StatusInternalServerError)
\t}
}

func main() {
\tstore := NewUserStore()
\tstore.Set(User{Name: "Alice", Email: "alice@example.com", Age: 30})
\thttp.HandleFunc("/user", store.HandleGet)
\tfmt.Println("Server starting on :8080")
\tif err := http.ListenAndServe(":8080", nil); err != nil {
\t\tfmt.Printf("Server error: %v\\n", err)
\t}
}`;

// Analyze each pattern
console.log("=== Go Syntax Token Heatmap Analysis ===\n");

const results = [];
for (const [id, pattern] of Object.entries(goPatterns)) {
  const tokens = countTokens(pattern.code);
  const lines = pattern.code.split("\n").length;
  const tokensPerLine = (tokens / lines).toFixed(1);
  results.push({ id, ...pattern, tokens, lines, tokensPerLine: parseFloat(tokensPerLine) });
}

// Sort by tokens (descending)
results.sort((a, b) => b.tokens - a.tokens);

// Group by category
const categories = {};
for (const r of results) {
  if (!categories[r.category]) categories[r.category] = [];
  categories[r.category].push(r);
}

// Calculate category totals
const catTotals = Object.entries(categories).map(([cat, items]) => ({
  category: cat,
  totalTokens: items.reduce((s, i) => s + i.tokens, 0),
  avgTokensPerLine: (items.reduce((s, i) => s + i.tokensPerLine, 0) / items.length).toFixed(1),
  patterns: items.length
})).sort((a, b) => b.totalTokens - a.totalTokens);

// Analyze the complete program
const totalProgramTokens = countTokens(completeProgram);
const programLines = completeProgram.split("\n");

// Break down the complete program by section
const sections = [
  { name: "package declaration", code: "package main" },
  { name: "import block", code: `import (\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"sync"\n)` },
  { name: "struct definitions", code: `type User struct {\n\tName  string \`json:"name"\`\n\tEmail string \`json:"email"\`\n\tAge   int    \`json:"age"\`\n}\n\ntype UserStore struct {\n\tmu    sync.RWMutex\n\tusers map[string]User\n}` },
  { name: "constructor", code: `func NewUserStore() *UserStore {\n\treturn &UserStore{\n\t\tusers: make(map[string]User),\n\t}\n}` },
  { name: "Get method (with error handling)", code: `func (s *UserStore) Get(name string) (User, error) {\n\ts.mu.RLock()\n\tdefer s.mu.RUnlock()\n\tuser, ok := s.users[name]\n\tif !ok {\n\t\treturn User{}, fmt.Errorf("user not found: %s", name)\n\t}\n\treturn user, nil\n}` },
  { name: "Set method", code: `func (s *UserStore) Set(user User) {\n\ts.mu.Lock()\n\tdefer s.mu.Unlock()\n\ts.users[user.Name] = user\n}` },
  { name: "HTTP handler (with error handling)", code: `func (s *UserStore) HandleGet(w http.ResponseWriter, r *http.Request) {\n\tname := r.URL.Query().Get("name")\n\tif name == "" {\n\t\thttp.Error(w, "name parameter required", http.StatusBadRequest)\n\t\treturn\n\t}\n\tuser, err := s.Get(name)\n\tif err != nil {\n\t\thttp.Error(w, err.Error(), http.StatusNotFound)\n\t\treturn\n\t}\n\tw.Header().Set("Content-Type", "application/json")\n\tif err := json.NewEncoder(w).Encode(user); err != nil {\n\t\thttp.Error(w, err.Error(), http.StatusInternalServerError)\n\t}\n}` },
  { name: "main function", code: `func main() {\n\tstore := NewUserStore()\n\tstore.Set(User{Name: "Alice", Email: "alice@example.com", Age: 30})\n\thttp.HandleFunc("/user", store.HandleGet)\n\tfmt.Println("Server starting on :8080")\n\tif err := http.ListenAndServe(":8080", nil); err != nil {\n\t\tfmt.Printf("Server error: %v\\n", err)\n\t}\n}` }
];

const sectionResults = sections.map(s => ({
  name: s.name,
  tokens: countTokens(s.code),
  lines: s.code.split("\n").length,
  percentage: ((countTokens(s.code) / totalProgramTokens) * 100).toFixed(1)
}));

// Analyze specific boilerplate/overhead tokens
const boilerplateAnalysis = {
  "func keyword": countTokens("func"),
  "return keyword": countTokens("return"),
  "if err != nil": countTokens("if err != nil"),
  "{ return err }": countTokens("{ return err }"),
  "if err != nil { return err }": countTokens("if err != nil { return err }"),
  "package main": countTokens("package main"),
  "type ... struct": countTokens("type"),
  "interface keyword": countTokens("interface"),
  ":= (short assign)": countTokens(":="),
  "err != nil": countTokens("err != nil"),
  "fmt.Errorf(": countTokens('fmt.Errorf('),
  "http.ResponseWriter": countTokens("http.ResponseWriter"),
  "http.Request": countTokens("http.Request"),
  "json.Marshal": countTokens("json.Marshal"),
  "json.Unmarshal": countTokens("json.Unmarshal"),
  "sync.WaitGroup": countTokens("sync.WaitGroup"),
  "context.Context": countTokens("context.Context"),
  "error (type)": countTokens("error"),
  "string (type)": countTokens("string"),
  "int (type)": countTokens("int"),
  "bool (type)": countTokens("bool"),
  "[]byte": countTokens("[]byte"),
  "map[string]": countTokens("map[string]"),
};

// Count error handling overhead in the complete program
const errorLines = completeProgram.split("\n").filter(l =>
  l.includes("err") || l.includes("Error") || l.includes("error")
);
const errorTokens = errorLines.reduce((s, l) => s + countTokens(l), 0);

// Output JSON for report generation
const output = {
  patterns: results,
  categories: catTotals,
  completeProgram: {
    totalTokens: totalProgramTokens,
    totalLines: programLines.length,
    tokensPerLine: (totalProgramTokens / programLines.length).toFixed(1),
    sections: sectionResults
  },
  boilerplate: boilerplateAnalysis,
  errorHandling: {
    errorRelatedLines: errorLines.length,
    totalLines: programLines.length,
    errorTokens: errorTokens,
    totalTokens: totalProgramTokens,
    errorPercentage: ((errorTokens / totalProgramTokens) * 100).toFixed(1)
  }
};

console.log(JSON.stringify(output, null, 2));

enc.free();
