// Measure actual token savings for each AET syntax design decision
import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("cl100k_base");
const t = (s) => enc.encode(s).length;

const decisions = [];
function record(feature, goBefore, aetAfter) {
  const goTokens = t(goBefore);
  const aetTokens = t(aetAfter);
  const saving = ((1 - aetTokens / goTokens) * 100).toFixed(1);
  decisions.push({ feature, goBefore: goBefore.replace(/\n/g, "\\n").replace(/\t/g, "\\t"), aetAfter, goTokens, aetTokens, saving: `${saving}%` });
}

// P0: Error handling
record("Error check + return",
  `result, err := doSomething()\nif err != nil {\n\treturn nil, err\n}`,
  `result:=doSomething()?`);

record("Error check + wrap",
  `result, err := doSomething()\nif err != nil {\n\treturn nil, fmt.Errorf("failed: %w", err)\n}`,
  `result:=doSomething()?!"failed"`);

record("Error check chain (3x)",
  `a, err := step1()\nif err != nil {\n\treturn err\n}\nb, err := step2(a)\nif err != nil {\n\treturn err\n}\nc, err := step3(b)\nif err != nil {\n\treturn err\n}`,
  `a:=step1()?;b:=step2(a)?;c:=step3(b)?`);

// P1: Function boilerplate
record("Simple function",
  `func add(a int, b int) int {\n\treturn a + b\n}`,
  `add(a:int,b:int)->int{a+b}`);

record("Method declaration",
  `func (s *Server) HandleRequest(w http.ResponseWriter, r *http.Request) {\n\tw.WriteHeader(http.StatusOK)\n}`,
  `Server.HandleRequest(w,r){w.WriteHeader(HsOK)}`);

record("Multi-return function",
  `func divide(a, b float64) (float64, error) {\n\tif b == 0 {\n\t\treturn 0, fmt.Errorf("division by zero")\n\t}\n\treturn a / b, nil\n}`,
  `divide(a,b:float64)->(float64,error){if b==0{^0,Ef("division by zero")};^a/b,nil}`);

// P2: Type declarations
record("Struct declaration",
  `type User struct {\n\tName    string\n\tEmail   string\n\tAge     int\n\tActive  bool\n}`,
  `@User{Name:string;Email:string;Age:int;Active:bool}`);

record("Struct with JSON tags",
  `type User struct {\n\tName    string \`json:"name"\`\n\tEmail   string \`json:"email"\`\n\tAge     int    \`json:"age"\`\n}`,
  `@User{Name:string;Email:string;Age:int}`);

record("Interface declaration",
  `type Reader interface {\n\tRead(p []byte) (n int, err error)\n}`,
  `@Reader[Read(p:[]byte)->(int,error)]`);

// P3: Import/package
record("Package + multi-import",
  `package main\n\nimport (\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"os"\n\t"strings"\n)`,
  `!v1`);

record("Package + single import",
  `package main\n\nimport "fmt"`,
  `!v1`);

// P4: Control flow
record("C-style for loop",
  `for i := 0; i < len(items); i++ {\n\tfmt.Println(items[i])\n}`,
  `for i:=0;i<len(items);i++{Pn(items[i])}`);

record("Range loop",
  `for i, v := range items {\n\tfmt.Printf("%d: %v\\n", i, v)\n}`,
  `for i,v:=range items{Pf("%d: %v\\n",i,v)}`);

record("Filter+map pattern",
  `result := make([]string, 0)\nfor _, item := range items {\n\tif item.Active {\n\t\tresult = append(result, item.Name)\n\t}\n}`,
  `result:=items|filter(.Active)|map(.Name)`);

record("If-else chain",
  `if x > 10 {\n\treturn "big"\n} else if x > 5 {\n\treturn "medium"\n} else {\n\treturn "small"\n}`,
  `if x>10{"big"}else if x>5{"medium"}else{"small"}`);

record("Switch statement",
  `switch status {\ncase "active":\n\thandleActive()\ncase "inactive":\n\thandleInactive()\ndefault:\n\thandleUnknown()\n}`,
  `switch status{case "active":handleActive();case "inactive":handleInactive();default:handleUnknown()}`);

// P5: Stdlib aliases
record("fmt.Println call",
  `fmt.Println("hello world")`,
  `Pn("hello world")`);

record("fmt.Sprintf call",
  `msg := fmt.Sprintf("Hello, %s! Count: %d", name, count)`,
  `msg:=Sf("Hello, %s! Count: %d",name,count)`);

record("fmt.Errorf call",
  `return fmt.Errorf("failed to process %s: %w", name, err)`,
  `^Ef("failed to process %s: %w",name,err)`);

record("json.Marshal + error",
  `data, err := json.Marshal(user)\nif err != nil {\n\treturn err\n}`,
  `data:=Jm(user)?`);

record("json.Unmarshal + error",
  `var user User\nif err := json.Unmarshal(data, &user); err != nil {\n\treturn err\n}`,
  `user:=Ju[User](data)?`);

record("os.Open + defer close + error",
  `file, err := os.Open("data.txt")\nif err != nil {\n\treturn err\n}\ndefer file.Close()`,
  `file:=Fo("data.txt")?;defer file.Close()`);

record("http.HandleFunc",
  `http.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {\n\tw.Header().Set("Content-Type", "application/json")\n\tjson.NewEncoder(w).Encode(users)\n})`,
  `Hf("/api/users",{w,r|w.Header().Set("Content-Type","application/json");Je(w).Encode(users)})`);

// P6: Concurrency
record("WaitGroup pattern",
  `var wg sync.WaitGroup\nfor _, item := range items {\n\twg.Add(1)\n\tgo func(it string) {\n\t\tdefer wg.Done()\n\t\tprocess(it)\n\t}(item)\n}\nwg.Wait()`,
  `wg:=WG();for _,item:=range items{wg.Add(1);go{defer wg.Done();process(item)}};wg.Wait()`);

record("Mutex pattern",
  `var mu sync.Mutex\nmu.Lock()\ndefer mu.Unlock()\ncounter++`,
  `mu:=Mx();mu.Lock();defer mu.Unlock();counter++`);

// Full program comparison
record("Complete fibonacci program",
  `package main\n\nimport "fmt"\n\nfunc fibonacci(n int) int {\n\tif n <= 1 {\n\t\treturn n\n\t}\n\treturn fibonacci(n-1) + fibonacci(n-2)\n}\n\nfunc main() {\n\tfor i := 0; i < 10; i++ {\n\t\tfmt.Printf("%d ", fibonacci(i))\n\t}\n\tfmt.Println()\n}`,
  `!v1;fibonacci(n:int)->int{if n<=1{^n};^fibonacci(n-1)+fibonacci(n-2)};main(){for i:=0;i<10;i++{Pf("%d ",fibonacci(i))};Pn()}`);

record("Complete FizzBuzz program",
  `package main\n\nimport "fmt"\n\nfunc main() {\n\tfor i := 1; i <= 100; i++ {\n\t\tswitch {\n\t\tcase i%15 == 0:\n\t\t\tfmt.Println("FizzBuzz")\n\t\tcase i%3 == 0:\n\t\t\tfmt.Println("Fizz")\n\t\tcase i%5 == 0:\n\t\t\tfmt.Println("Buzz")\n\t\tdefault:\n\t\t\tfmt.Println(i)\n\t\t}\n\t}\n}`,
  `!v1;main(){for i:=1;i<=100;i++{switch{case i%15==0:Pn("FizzBuzz");case i%3==0:Pn("Fizz");case i%5==0:Pn("Buzz");default:Pn(i)}}}`);

// Print results
console.log("| Feature | Go Tokens | AET Tokens | Saving |");
console.log("|---------|-----------|------------|--------|");
for (const d of decisions) {
  console.log(`| ${d.feature} | ${d.goTokens} | ${d.aetTokens} | ${d.saving} |`);
}

console.log("\n\nDetailed token analysis:");
for (const d of decisions) {
  console.log(`\n### ${d.feature}`);
  console.log(`Go (${d.goTokens} tokens): ${d.goBefore}`);
  console.log(`AET (${d.aetTokens} tokens): ${d.aetAfter}`);
  console.log(`Saving: ${d.saving}`);
}

// Summary by priority
const p0 = decisions.filter(d => d.feature.startsWith("Error"));
const goTotal = decisions.reduce((s, d) => s + d.goTokens, 0);
const aetTotal = decisions.reduce((s, d) => s + d.aetTokens, 0);
console.log(`\n\nOverall: Go ${goTotal} tokens → AET ${aetTotal} tokens = ${((1 - aetTotal/goTotal)*100).toFixed(1)}% savings`);

enc.free();
