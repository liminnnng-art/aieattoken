// Generate stdlib-aliases.json with single-token validation
import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("cl100k_base");
const t = (s) => enc.encode(s).length;

// Design aliases: each alias MUST be 1 cl100k_base token
// Strategy: use short identifiers from the single-token list
const candidates = [
  // fmt package
  { alias: "Pn", go: "fmt.Println", pkg: "fmt" },
  { alias: "Pf", go: "fmt.Printf", pkg: "fmt" },
  { alias: "Sf", go: "fmt.Sprintf", pkg: "fmt" },
  { alias: "Ef", go: "fmt.Errorf", pkg: "fmt" },
  { alias: "Fp", go: "fmt.Fprintf", pkg: "fmt" },
  { alias: "Sn", go: "fmt.Scan", pkg: "fmt" },

  // errors package
  { alias: "En", go: "errors.New", pkg: "errors" },
  { alias: "Ei", go: "errors.Is", pkg: "errors" },
  { alias: "Ea", go: "errors.As", pkg: "errors" },

  // context package
  { alias: "Cb", go: "context.Background", pkg: "context" },
  { alias: "Cc", go: "context.WithCancel", pkg: "context" },
  { alias: "Ct", go: "context.WithTimeout", pkg: "context" },
  { alias: "Cd", go: "context.TODO", pkg: "context" },

  // strings package
  { alias: "Sc", go: "strings.Contains", pkg: "strings" },
  { alias: "Ss", go: "strings.Split", pkg: "strings" },
  { alias: "St", go: "strings.TrimSpace", pkg: "strings" },
  { alias: "Sp", go: "strings.HasPrefix", pkg: "strings" },
  { alias: "Sx", go: "strings.HasSuffix", pkg: "strings" },
  { alias: "Sr", go: "strings.Replace", pkg: "strings" },
  { alias: "Sj", go: "strings.Join", pkg: "strings" },
  { alias: "Sl", go: "strings.ToLower", pkg: "strings" },

  // strconv package
  { alias: "Ia", go: "strconv.Itoa", pkg: "strconv" },
  { alias: "Ai", go: "strconv.Atoi", pkg: "strconv" },

  // encoding/json package
  { alias: "Jm", go: "json.Marshal", pkg: "encoding/json" },
  { alias: "Ju", go: "json.Unmarshal", pkg: "encoding/json" },
  { alias: "Jd", go: "json.NewDecoder", pkg: "encoding/json" },
  { alias: "Je", go: "json.NewEncoder", pkg: "encoding/json" },

  // net/http package
  { alias: "Hl", go: "http.ListenAndServe", pkg: "net/http" },
  { alias: "Hf", go: "http.HandleFunc", pkg: "net/http" },
  { alias: "Hr", go: "http.NewRequest", pkg: "net/http" },
  { alias: "Hg", go: "http.Get", pkg: "net/http" },
  { alias: "He", go: "http.Error", pkg: "net/http" },

  // http status codes
  { alias: "HsOK", go: "http.StatusOK", pkg: "net/http" },
  { alias: "HsBR", go: "http.StatusBadRequest", pkg: "net/http" },
  { alias: "HsNF", go: "http.StatusNotFound", pkg: "net/http" },
  { alias: "HsIS", go: "http.StatusInternalServerError", pkg: "net/http" },

  // os package
  { alias: "Fo", go: "os.Open", pkg: "os" },
  { alias: "Fc", go: "os.Create", pkg: "os" },
  { alias: "Ge", go: "os.Getenv", pkg: "os" },
  { alias: "Rf", go: "os.ReadFile", pkg: "os" },
  { alias: "Wf", go: "os.WriteFile", pkg: "os" },

  // io package
  { alias: "Ra", go: "io.ReadAll", pkg: "io" },
  { alias: "Ic", go: "io.Copy", pkg: "io" },

  // time package
  { alias: "Tn", go: "time.Now", pkg: "time" },
  { alias: "Ts", go: "time.Since", pkg: "time" },
  { alias: "Tk", go: "time.Sleep", pkg: "time" },
  { alias: "Tp", go: "time.Parse", pkg: "time" },

  // sync package
  { alias: "WG", go: "sync.WaitGroup", pkg: "sync" },
  { alias: "Mx", go: "sync.Mutex", pkg: "sync" },
  { alias: "Rm", go: "sync.RWMutex", pkg: "sync" },

  // sort package
  { alias: "So", go: "sort.Slice", pkg: "sort" },

  // log package
  { alias: "Lp", go: "log.Println", pkg: "log" },
  { alias: "Lf", go: "log.Fatal", pkg: "log" },

  // filepath package
  { alias: "Fj", go: "filepath.Join", pkg: "path/filepath" },
];

// Validate and build the aliases object
const aliases = {};
const failed = [];
for (const c of candidates) {
  const tokens = t(c.alias);
  if (tokens === 1) {
    aliases[c.alias] = { go: c.go, pkg: c.pkg, tokenId: enc.encode(c.alias)[0] };
  } else {
    failed.push({ ...c, tokens });
  }
}

console.log(`Validated: ${Object.keys(aliases).length} aliases (all single-token)`);
if (failed.length > 0) {
  console.log(`Failed (multi-token):`);
  for (const f of failed) {
    console.log(`  ${f.alias} → ${f.tokens} tokens`);
  }
}

// Write the JSON file
const output = { _version: "0.1", _description: "Go stdlib alias mapping for Aieattoken. Every alias is a single cl100k_base token.", aliases };
const fs = await import("fs");
fs.writeFileSync("../stdlib-aliases.json", JSON.stringify(output, null, 2));
console.log("Written to stdlib-aliases.json");

enc.free();
