// Java Token Heatmap Analysis
// Counts cl100k_base tokens for Java syntax constructs and compares to Go equivalents

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { get_encoding } = require("@dqbd/tiktoken");
const enc = get_encoding("cl100k_base");

function count(code) {
  return enc.encode(code).length;
}

function analyze(label, javaCode, goCode, aetCode) {
  const jt = count(javaCode);
  const gt = goCode ? count(goCode) : null;
  const at = aetCode ? count(aetCode) : null;
  return { label, javaCode: javaCode.trim(), jt, gt, at };
}

console.log("=== JAVA TOKEN HEATMAP ANALYSIS (cl100k_base) ===\n");

// Category 1: Class/Method Boilerplate
console.log("## 1. Class/Method Boilerplate (HIGHEST WASTE)\n");
const boilerplate = [
  analyze("Main class + main method (empty)",
    `public class Main {\n    public static void main(String[] args) {\n    }\n}`,
    `package main\n\nfunc main() {\n}`,
    `!v1;main(){}`),
  analyze("Main with println",
    `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`,
    `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, World!")\n}`,
    `!v1;main(){pl("Hello, World!")}`),
  analyze("Public method declaration",
    `public String getName() {\n    return this.name;\n}`,
    `func (u *User) GetName() string {\n\treturn u.name\n}`,
    `User.GetName()->string{^u.name}`),
  analyze("Static method",
    `public static int add(int a, int b) {\n    return a + b;\n}`,
    `func add(a int, b int) int {\n\treturn a + b\n}`,
    `add(a:int,b:int)->int{a+b}`),
  analyze("Access modifiers per method",
    `public void process() {}`,
    `func Process() {}`,
    null),
  analyze("Constructor",
    `public User(String name, int age) {\n    this.name = name;\n    this.age = age;\n}`,
    null, null),
];
for (const r of boilerplate) {
  console.log(`  ${r.label}: Java=${r.jt} tokens${r.gt !== null ? `, Go=${r.gt}` : ''}${r.at !== null ? `, AET=${r.at}` : ''}`);
}

// Category 2: Getter/Setter (Java-specific waste)
console.log("\n## 2. Getter/Setter Boilerplate (Java-specific)\n");
const getterSetter = [
  analyze("Single getter",
    `public String getName() {\n    return this.name;\n}`,
    null, null),
  analyze("Single setter",
    `public void setName(String name) {\n    this.name = name;\n}`,
    null, null),
  analyze("Getter+setter pair (1 field)",
    `public String getName() { return this.name; }\npublic void setName(String name) { this.name = name; }`,
    null, null),
  analyze("POJO with 3 fields (complete)",
    `public class User {\n    private String name;\n    private int age;\n    private String email;\n\n    public User(String name, int age, String email) {\n        this.name = name;\n        this.age = age;\n        this.email = email;\n    }\n\n    public String getName() { return this.name; }\n    public void setName(String name) { this.name = name; }\n    public int getAge() { return this.age; }\n    public void setAge(int age) { this.age = age; }\n    public String getEmail() { return this.email; }\n    public void setEmail(String email) { this.email = email; }\n}`,
    `type User struct {\n\tName  string\n\tAge   int\n\tEmail string\n}`,
    `@User{Name:string;Age:int;Email:string}`),
];
for (const r of getterSetter) {
  console.log(`  ${r.label}: Java=${r.jt} tokens${r.gt !== null ? `, Go=${r.gt}` : ''}${r.at !== null ? `, AET=${r.at}` : ''}`);
}

// Category 3: Import Statements
console.log("\n## 3. Import Statements\n");
const imports = [
  analyze("Single import",
    `import java.util.ArrayList;`,
    `import "fmt"`,
    null),
  analyze("Typical imports (5 imports)",
    `import java.util.ArrayList;\nimport java.util.HashMap;\nimport java.util.List;\nimport java.util.Map;\nimport java.io.IOException;`,
    `import (\n\t"fmt"\n\t"os"\n\t"strings"\n\t"encoding/json"\n\t"net/http"\n)`,
    null),
  analyze("Heavy imports (10 imports)",
    `import java.util.ArrayList;\nimport java.util.HashMap;\nimport java.util.List;\nimport java.util.Map;\nimport java.util.stream.Collectors;\nimport java.io.IOException;\nimport java.io.File;\nimport java.nio.file.Files;\nimport java.nio.file.Path;\nimport java.net.http.HttpClient;`,
    null, null),
];
for (const r of imports) {
  console.log(`  ${r.label}: Java=${r.jt} tokens${r.gt !== null ? `, Go=${r.gt}` : ''}`);
}

// Category 4: Try-Catch (vs Go error handling)
console.log("\n## 4. Try-Catch / Exception Handling\n");
const tryCatch = [
  analyze("Simple try-catch",
    `try {\n    String content = Files.readString(Path.of("file.txt"));\n} catch (IOException e) {\n    e.printStackTrace();\n}`,
    `content, err := os.ReadFile("file.txt")\nif err != nil {\n\tlog.Fatal(err)\n}`,
    `content:=rf("file.txt")?`),
  analyze("Try-catch with finally",
    `try {\n    process();\n} catch (Exception e) {\n    handleError(e);\n} finally {\n    cleanup();\n}`,
    null, null),
  analyze("Multi-catch",
    `try {\n    process();\n} catch (IOException e) {\n    handleIO(e);\n} catch (NumberFormatException e) {\n    handleFormat(e);\n}`,
    null, null),
  analyze("Try-with-resources",
    `try (BufferedReader reader = new BufferedReader(new FileReader("file.txt"))) {\n    String line = reader.readLine();\n}`,
    null, null),
  analyze("Checked exception method signature",
    `public void readFile(String path) throws IOException {`,
    null, null),
];
for (const r of tryCatch) {
  console.log(`  ${r.label}: Java=${r.jt} tokens${r.gt !== null ? `, Go=${r.gt}` : ''}${r.at !== null ? `, AET=${r.at}` : ''}`);
}

// Category 5: Type Declarations (Generics)
console.log("\n## 5. Verbose Type Declarations\n");
const types = [
  analyze("Map<String, List<Integer>>",
    `Map<String, List<Integer>> data = new HashMap<>();`,
    `data := make(map[string][]int)`,
    `data:=make(map[string][]int)`),
  analyze("List<String>",
    `List<String> names = new ArrayList<>();`,
    `names := []string{}`,
    `names:=[]string{}`),
  analyze("Map<String, Map<String, Integer>>",
    `Map<String, Map<String, Integer>> nested = new HashMap<>();`,
    null, null),
  analyze("Generic method",
    `public <T extends Comparable<T>> T max(T a, T b) {`,
    null, null),
  analyze("Wildcard generic",
    `List<? extends Number> numbers`,
    null, null),
  analyze("Diamond operator in assignment",
    `HashMap<String, ArrayList<Integer>> map = new HashMap<>();`,
    null, null),
];
for (const r of types) {
  console.log(`  ${r.label}: Java=${r.jt} tokens${r.gt !== null ? `, Go=${r.gt}` : ''}${r.at !== null ? `, AET=${r.at}` : ''}`);
}

// Category 6: Standard Library Verbosity
console.log("\n## 6. Standard Library Function Calls\n");
const stdlib = [
  analyze("System.out.println", `System.out.println("hello");`, `fmt.Println("hello")`, `pl("hello")`),
  analyze("System.out.printf", `System.out.printf("x=%d%n", x);`, `fmt.Printf("x=%d\\n", x)`, `pf("x=%d\\n",x)`),
  analyze("String.format", `String.format("Hello %s", name);`, `fmt.Sprintf("Hello %s", name)`, `sf("Hello %s",name)`),
  analyze("Integer.parseInt", `Integer.parseInt(str);`, `strconv.Atoi(str)`, `Ai(str)`),
  analyze("String.valueOf(int)", `String.valueOf(num);`, `strconv.Itoa(num)`, `ia(num)`),
  analyze("Collections.sort", `Collections.sort(list);`, `sort.Slice(list, func(i,j int) bool { return list[i] < list[j] })`, null),
  analyze("Arrays.asList", `Arrays.asList(1, 2, 3);`, `[]int{1, 2, 3}`, `[]int{1,2,3}`),
  analyze("Files.readString", `Files.readString(Path.of("f.txt"));`, `os.ReadFile("f.txt")`, `rf("f.txt")`),
  analyze("Files.writeString", `Files.writeString(Path.of("f.txt"), content);`, `os.WriteFile("f.txt", []byte(content), 0644)`, `wf("f.txt",[]byte(content),0644)`),
  analyze("new StringBuilder()", `new StringBuilder()`, null, null),
];
for (const r of stdlib) {
  console.log(`  ${r.label}: Java=${r.jt} tokens${r.gt !== null ? `, Go=${r.gt}` : ''}${r.at !== null ? `, AET=${r.at}` : ''}`);
}

// Category 7: Control Flow
console.log("\n## 7. Control Flow\n");
const control = [
  analyze("For loop",
    `for (int i = 0; i < n; i++) {`,
    `for i := 0; i < n; i++ {`,
    `for i:=0;i<n;i++{`),
  analyze("Enhanced for (foreach)",
    `for (String item : items) {`,
    `for _, item := range items {`,
    `for _,item:=range items{`),
  analyze("While loop",
    `while (condition) {`,
    `for condition {`,
    `for condition{`),
  analyze("If-else",
    `if (x > 0) {\n    return x;\n} else {\n    return -x;\n}`,
    `if x > 0 {\n\treturn x\n} else {\n\treturn -x\n}`,
    `if x>0{^x}else{^-x}`),
  analyze("Switch",
    `switch (day) {\n    case "MON": return 1;\n    case "TUE": return 2;\n    default: return 0;\n}`,
    `switch day {\ncase "MON":\n\treturn 1\ncase "TUE":\n\treturn 2\ndefault:\n\treturn 0\n}`,
    `switch day{case "MON":^1;case "TUE":^2;default:^0}`),
];
for (const r of control) {
  console.log(`  ${r.label}: Java=${r.jt} tokens${r.gt !== null ? `, Go=${r.gt}` : ''}${r.at !== null ? `, AET=${r.at}` : ''}`);
}

// Category 8: Complete Programs Comparison
console.log("\n## 8. Complete Program Comparison\n");

const javaHello = `public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`;

const goHello = `package main

import "fmt"

func main() {
\tfmt.Println("Hello, World!")
}`;

const aetHello = `!v1;main(){pl("Hello, World!")}`;

console.log(`  Hello World: Java=${count(javaHello)}, Go=${count(goHello)}, AET=${count(aetHello)}`);

const javaFib = `public class Fibonacci {
    public static int fib(int n) {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        for (int i = 0; i < 10; i++) {
            System.out.println(fib(i));
        }
    }
}`;

const goFib = `package main

import "fmt"

func fib(n int) int {
\tif n <= 1 {
\t\treturn n
\t}
\treturn fib(n-1) + fib(n-2)
}

func main() {
\tfor i := 0; i < 10; i++ {
\t\tfmt.Println(fib(i))
\t}
}`;

const aetFib = `!v1;fib(n:int)->int{if n<=1{^n};^fib(n-1)+fib(n-2)};main(){for i:=0;i<10;i++{pl(fib(i))}}`;

console.log(`  Fibonacci: Java=${count(javaFib)}, Go=${count(goFib)}, AET=${count(aetFib)}`);

// Java-specific: POJO class with methods
const javaPojo = `import java.util.Objects;

public class User {
    private String name;
    private int age;
    private String email;

    public User(String name, int age, String email) {
        this.name = name;
        this.age = age;
        this.email = email;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    @Override
    public String toString() {
        return String.format("User{name='%s', age=%d, email='%s'}", name, age, email);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        User user = (User) o;
        return age == user.age && Objects.equals(name, user.name) && Objects.equals(email, user.email);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, age, email);
    }
}`;

const goPojo = `type User struct {
\tName  string \`json:"name"\`
\tAge   int    \`json:"age"\`
\tEmail string \`json:"email"\`
}

func (u User) String() string {
\treturn fmt.Sprintf("User{name='%s', age=%d, email='%s'}", u.Name, u.Age, u.Email)
}`;

const aetPojo = `!v1;@User{Name:string;Age:int;Email:string};User.String()->string{^sf("User{name='%s', age=%d, email='%s'}",u.Name,u.Age,u.Email)}`;

console.log(`  POJO/Struct: Java=${count(javaPojo)}, Go=${count(goPojo)}, AET=${count(aetPojo)}`);

// File I/O comparison
const javaFileIO = `import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class FileIO {
    public static String readFile(String path) throws IOException {
        return Files.readString(Path.of(path));
    }

    public static void writeFile(String path, String content) throws IOException {
        Files.writeString(Path.of(path), content);
    }

    public static void main(String[] args) {
        try {
            String content = readFile("input.txt");
            writeFile("output.txt", content.toUpperCase());
            System.out.println("Done!");
        } catch (IOException e) {
            System.err.println("Error: " + e.getMessage());
        }
    }
}`;

const goFileIO = `package main

import (
\t"fmt"
\t"os"
\t"strings"
)

func main() {
\tcontent, err := os.ReadFile("input.txt")
\tif err != nil {
\t\tfmt.Fprintln(os.Stderr, "Error:", err)
\t\treturn
\t}
\terr = os.WriteFile("output.txt", []byte(strings.ToUpper(string(content))), 0644)
\tif err != nil {
\t\tfmt.Fprintln(os.Stderr, "Error:", err)
\t\treturn
\t}
\tfmt.Println("Done!")
}`;

const aetFileIO = `!v1;main(){content:=rf("input.txt")?;wf("output.txt",[]byte(strings.ToUpper(string(content))),0644)?;pl("Done!")}`;

console.log(`  File I/O: Java=${count(javaFileIO)}, Go=${count(goFileIO)}, AET=${count(aetFileIO)}`);

// HTTP server comparison
const javaHttp = `import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;

public class Server {
    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);
        server.createContext("/hello", exchange -> {
            String response = "Hello, World!";
            exchange.sendResponseHeaders(200, response.getBytes().length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response.getBytes());
            }
        });
        server.start();
        System.out.println("Server started on :8080");
    }
}`;

const goHttp = `package main

import (
\t"fmt"
\t"net/http"
)

func main() {
\thttp.HandleFunc("/hello", func(w http.ResponseWriter, r *http.Request) {
\t\tfmt.Fprint(w, "Hello, World!")
\t})
\tfmt.Println("Server started on :8080")
\thttp.ListenAndServe(":8080", nil)
}`;

const aetHttp = `!v1;main(){hf("/hello",{w,r|fw(w,"Hello, World!")});pl("Server started on :8080");hl(":8080",nil)}`;

console.log(`  HTTP Server: Java=${count(javaHttp)}, Go=${count(goHttp)}, AET=${count(aetHttp)}`);

// Summary: token overhead per construct
console.log("\n## 9. Per-Construct Token Costs (Java boilerplate overhead)\n");
const constructs = [
  ["public class X {}", count("public class Main {"), "per class definition"],
  ["public static void main(String[] args)", count("public static void main(String[] args) {"), "main method signature"],
  ["public", count("public"), "per access modifier"],
  ["private", count("private"), "per access modifier"],
  ["static", count("static"), "per static modifier"],
  ["void", count("void"), "per void return"],
  ["System.out.println(x)", count("System.out.println(x)"), "per print call"],
  ["System.out.printf(x)", count("System.out.printf(x)"), "per printf call"],
  ["throws IOException", count("throws IOException"), "per checked exception"],
  ["try { } catch (Exception e) { }", count("try { } catch (Exception e) { }"), "per try-catch block"],
  ["new ArrayList<>()", count("new ArrayList<>()"), "per collection creation"],
  ["new HashMap<>()", count("new HashMap<>()"), "per map creation"],
  ["import java.util.ArrayList;", count("import java.util.ArrayList;"), "per import"],
  ["Integer.parseInt(x)", count("Integer.parseInt(x)"), "per parseInt call"],
  ["String.valueOf(x)", count("String.valueOf(x)"), "per valueOf call"],
  [".getBytes()", count(".getBytes()"), "per getBytes call"],
  ["@Override", count("@Override"), "per override annotation"],
  ["this.x = x;", count("this.name = name;"), "per field assignment in constructor"],
  ["instanceof", count("x instanceof String"), "per instanceof check"],
];
for (const [expr, tokens, freq] of constructs) {
  console.log(`  ${String(tokens).padStart(2)} tokens: ${expr} (${freq})`);
}

console.log("\n## 10. SUMMARY: Java vs Go vs AET Token Counts\n");
console.log("| Program | Java | Go | AET | Java→AET Saving | Go→AET Saving |");
console.log("|---------|------|----|-----|-----------------|---------------|");

const programs = [
  ["Hello World", count(javaHello), count(goHello), count(aetHello)],
  ["Fibonacci", count(javaFib), count(goFib), count(aetFib)],
  ["POJO/Struct", count(javaPojo), count(goPojo), count(aetPojo)],
  ["File I/O", count(javaFileIO), count(goFileIO), count(aetFileIO)],
  ["HTTP Server", count(javaHttp), count(goHttp), count(aetHttp)],
];

let totalJava = 0, totalGo = 0, totalAet = 0;
for (const [name, java, go, aet] of programs) {
  totalJava += java;
  totalGo += go;
  totalAet += aet;
  const jSave = ((1 - aet / java) * 100).toFixed(1);
  const gSave = ((1 - aet / go) * 100).toFixed(1);
  console.log(`| ${name} | ${java} | ${go} | ${aet} | ${jSave}% | ${gSave}% |`);
}
const totalJSave = ((1 - totalAet / totalJava) * 100).toFixed(1);
const totalGSave = ((1 - totalAet / totalGo) * 100).toFixed(1);
console.log(`| **TOTAL** | **${totalJava}** | **${totalGo}** | **${totalAet}** | **${totalJSave}%** | **${totalGSave}%** |`);

enc.free();
