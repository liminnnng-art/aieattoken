// Find single-token aliases for all 50 stdlib functions
import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("cl100k_base");
const isSingle = (s) => enc.encode(s).length === 1;

// Test a wide range of short identifiers
const candidates = [];
// All 2-letter combos (upper+lower, lower+lower)
for (let a = 65; a <= 122; a++) {
  if (a > 90 && a < 97) continue;
  for (let b = 97; b <= 122; b++) {
    const s = String.fromCharCode(a) + String.fromCharCode(b);
    if (isSingle(s)) candidates.push(s);
  }
}
// All 3-letter lowercase combos that are single tokens
const common3 = ["fmt","err","ctx","req","res","log","str","buf","ptr","ref","ret","end","not","and","any","all","new","del","try","get","set","has","len","cap","max","min","add","sub","mul","div","mod","xor","nil","var","val","let","def","pub","use","mut","run","put"];
for (const s of common3) {
  if (isSingle(s) && !candidates.includes(s)) candidates.push(s);
}

console.log(`Found ${candidates.length} single-token 2-3 letter identifiers`);
console.log("2-letter uppercase+lower:", candidates.filter(s => s[0] >= 'A' && s[0] <= 'Z').join(", "));
console.log("2-letter lowercase:", candidates.filter(s => s.length === 2 && s[0] >= 'a' && s[0] <= 'z').join(", "));

// Now assign aliases for the needed functions
const needed = [
  // fmt
  { go: "fmt.Println", pkg: "fmt" },
  { go: "fmt.Printf", pkg: "fmt" },
  { go: "fmt.Sprintf", pkg: "fmt" },
  { go: "fmt.Errorf", pkg: "fmt" },
  { go: "fmt.Fprintf", pkg: "fmt" },
  { go: "fmt.Scan", pkg: "fmt" },
  // errors
  { go: "errors.New", pkg: "errors" },
  { go: "errors.Is", pkg: "errors" },
  { go: "errors.As", pkg: "errors" },
  // context
  { go: "context.Background", pkg: "context" },
  { go: "context.WithCancel", pkg: "context" },
  { go: "context.WithTimeout", pkg: "context" },
  { go: "context.TODO", pkg: "context" },
  // strings
  { go: "strings.Contains", pkg: "strings" },
  { go: "strings.Split", pkg: "strings" },
  { go: "strings.TrimSpace", pkg: "strings" },
  { go: "strings.HasPrefix", pkg: "strings" },
  { go: "strings.HasSuffix", pkg: "strings" },
  { go: "strings.Replace", pkg: "strings" },
  { go: "strings.Join", pkg: "strings" },
  { go: "strings.ToLower", pkg: "strings" },
  // strconv
  { go: "strconv.Itoa", pkg: "strconv" },
  { go: "strconv.Atoi", pkg: "strconv" },
  // json
  { go: "json.Marshal", pkg: "encoding/json" },
  { go: "json.Unmarshal", pkg: "encoding/json" },
  { go: "json.NewDecoder", pkg: "encoding/json" },
  { go: "json.NewEncoder", pkg: "encoding/json" },
  // http
  { go: "http.ListenAndServe", pkg: "net/http" },
  { go: "http.HandleFunc", pkg: "net/http" },
  { go: "http.NewRequest", pkg: "net/http" },
  { go: "http.Get", pkg: "net/http" },
  { go: "http.Error", pkg: "net/http" },
  // http status
  { go: "http.StatusOK", pkg: "net/http", isConst: true },
  { go: "http.StatusBadRequest", pkg: "net/http", isConst: true },
  { go: "http.StatusNotFound", pkg: "net/http", isConst: true },
  { go: "http.StatusInternalServerError", pkg: "net/http", isConst: true },
  // os
  { go: "os.Open", pkg: "os" },
  { go: "os.Create", pkg: "os" },
  { go: "os.Getenv", pkg: "os" },
  { go: "os.ReadFile", pkg: "os" },
  { go: "os.WriteFile", pkg: "os" },
  // io
  { go: "io.ReadAll", pkg: "io" },
  { go: "io.Copy", pkg: "io" },
  // time
  { go: "time.Now", pkg: "time" },
  { go: "time.Since", pkg: "time" },
  { go: "time.Sleep", pkg: "time" },
  { go: "time.Parse", pkg: "time" },
  // sync
  { go: "sync.WaitGroup", pkg: "sync" },
  { go: "sync.Mutex", pkg: "sync" },
  { go: "sync.RWMutex", pkg: "sync" },
  // sort
  { go: "sort.Slice", pkg: "sort" },
  // log
  { go: "log.Println", pkg: "log" },
  { go: "log.Fatal", pkg: "log" },
  // filepath
  { go: "filepath.Join", pkg: "path/filepath" },
];

// Assign aliases - prefer meaningful mnemonics
const used = new Set();
const aliasMap = {};

function tryAlias(go, preferred) {
  for (const a of preferred) {
    if (!used.has(a) && isSingle(a)) {
      used.add(a);
      return a;
    }
  }
  return null;
}

for (const n of needed) {
  const parts = n.go.split(".");
  const fn = parts[1];
  const pkg = parts[0];

  // Try various mnemonics
  const attempts = [
    fn.toLowerCase().slice(0, 3), // first 3 chars lowercase
    fn.toLowerCase().slice(0, 2), // first 2 chars lowercase
    pkg[0] + fn[0].toLowerCase(), // pkg initial + fn initial
    pkg.slice(0, 2) + fn[0].toLowerCase(), // pkg 2 chars + fn initial
    fn.toLowerCase(), // full lowercase name
    fn, // original name (some like 'Get' are single token)
  ];

  const alias = tryAlias(n.go, attempts);
  if (alias) {
    aliasMap[alias] = { go: n.go, pkg: n.pkg };
    if (n.isConst) aliasMap[alias].isConst = true;
  } else {
    console.log(`No single-token alias found for: ${n.go}`);
    console.log(`  Tried: ${attempts.filter(a => !used.has(a)).join(", ")}`);
  }
}

console.log(`\nAssigned ${Object.keys(aliasMap).length} / ${needed.length} aliases`);
console.log("\nAlias mapping:");
for (const [alias, info] of Object.entries(aliasMap)) {
  console.log(`  ${alias} → ${info.go} (${enc.encode(alias).length} token${enc.encode(alias).length > 1 ? "s" : ""})`);
}

// Write output
const output = { _version: "0.1", _description: "Go stdlib alias mapping. Every alias is a single cl100k_base token.", aliases: aliasMap };
const fs = await import("fs");
fs.writeFileSync("../stdlib-aliases.json", JSON.stringify(output, null, 2));
console.log("\nWritten to stdlib-aliases.json");
enc.free();
