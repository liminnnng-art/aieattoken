import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("cl100k_base");
const tests = ["func main() {", "if err != nil { return err }", "fmt.Println", "return"];
for (const t of tests) {
  const tokens = enc.encode(t);
  console.log(`"${t}" => ${tokens.length} tokens: [${tokens.join(", ")}]`);
}
enc.free();
console.log("Tokenizer OK");
