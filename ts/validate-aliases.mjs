// Validate hand-crafted aliases
import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("cl100k_base");
const isSingle = (s) => enc.encode(s).length === 1;

const aliases = {
  // fmt package (6)
  "pl":  { go: "fmt.Println", pkg: "fmt" },
  "pf":  { go: "fmt.Printf", pkg: "fmt" },
  "sf":  { go: "fmt.Sprintf", pkg: "fmt" },
  "Ef":  { go: "fmt.Errorf", pkg: "fmt" },
  "fw":  { go: "fmt.Fprintf", pkg: "fmt" },
  "Sn":  { go: "fmt.Scan", pkg: "fmt" },

  // errors package (3)
  "En":  { go: "errors.New", pkg: "errors" },
  "ei":  { go: "errors.Is", pkg: "errors" },
  "ea":  { go: "errors.As", pkg: "errors" },

  // context package (4)
  "Cb":  { go: "context.Background", pkg: "context" },
  "Cc":  { go: "context.WithCancel", pkg: "context" },
  "ct":  { go: "context.WithTimeout", pkg: "context" },
  "Cd":  { go: "context.TODO", pkg: "context" },

  // strings package (8)
  "Sc":  { go: "strings.Contains", pkg: "strings" },
  "ss":  { go: "strings.Split", pkg: "strings" },
  "St":  { go: "strings.TrimSpace", pkg: "strings" },
  "Sp":  { go: "strings.HasPrefix", pkg: "strings" },
  "sx":  { go: "strings.HasSuffix", pkg: "strings" },
  "Sr":  { go: "strings.Replace", pkg: "strings" },
  "sj":  { go: "strings.Join", pkg: "strings" },
  "Sl":  { go: "strings.ToLower", pkg: "strings" },

  // strconv package (2)
  "Ai":  { go: "strconv.Atoi", pkg: "strconv" },
  "ia":  { go: "strconv.Itoa", pkg: "strconv" },

  // encoding/json package (4)
  "jm":  { go: "json.Marshal", pkg: "encoding/json" },
  "Ju":  { go: "json.Unmarshal", pkg: "encoding/json" },
  "jd":  { go: "json.NewDecoder", pkg: "encoding/json" },
  "Je":  { go: "json.NewEncoder", pkg: "encoding/json" },

  // net/http package (5)
  "hl":  { go: "http.ListenAndServe", pkg: "net/http" },
  "hf":  { go: "http.HandleFunc", pkg: "net/http" },
  "hr":  { go: "http.NewRequest", pkg: "net/http" },
  "hg":  { go: "http.Get", pkg: "net/http" },
  "He":  { go: "http.Error", pkg: "net/http" },

  // os package (5)
  "Fo":  { go: "os.Open", pkg: "os" },
  "Fc":  { go: "os.Create", pkg: "os" },
  "Ge":  { go: "os.Getenv", pkg: "os" },
  "rf":  { go: "os.ReadFile", pkg: "os" },
  "wf":  { go: "os.WriteFile", pkg: "os" },

  // io package (2)
  "Ra":  { go: "io.ReadAll", pkg: "io" },
  "ic":  { go: "io.Copy", pkg: "io" },

  // time package (4)
  "tn":  { go: "time.Now", pkg: "time" },
  "Ts":  { go: "time.Since", pkg: "time" },
  "Tk":  { go: "time.Sleep", pkg: "time" },
  "Tp":  { go: "time.Parse", pkg: "time" },

  // sync package (3)
  "wg":  { go: "sync.WaitGroup", pkg: "sync", isType: true },
  "mx":  { go: "sync.Mutex", pkg: "sync", isType: true },
  "rw":  { go: "sync.RWMutex", pkg: "sync", isType: true },

  // sort package (1)
  "So":  { go: "sort.Slice", pkg: "sort" },

  // log package (2)
  "lp":  { go: "log.Println", pkg: "log" },
  "Lf":  { go: "log.Fatal", pkg: "log" },

  // filepath package (1)
  "pj":  { go: "filepath.Join", pkg: "path/filepath" },
};

let ok = 0, fail = 0;
for (const [alias, info] of Object.entries(aliases)) {
  const tokens = enc.encode(alias).length;
  if (tokens === 1) {
    ok++;
  } else {
    fail++;
    console.log(`FAIL: "${alias}" → ${info.go} = ${tokens} tokens`);
  }
}
console.log(`\nResult: ${ok} OK, ${fail} FAIL out of ${ok + fail} total`);

if (fail === 0) {
  const output = {
    _version: "0.1",
    _tokenizer: "cl100k_base",
    _description: "Go stdlib alias mapping for Aieattoken. Every alias is a single cl100k_base token.",
    _count: ok,
    aliases
  };
  const fs = await import("fs");
  fs.writeFileSync("../stdlib-aliases.json", JSON.stringify(output, null, 2));
  console.log("All aliases validated! Written to stdlib-aliases.json");
}
enc.free();
