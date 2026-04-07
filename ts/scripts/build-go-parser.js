#!/usr/bin/env node
// Postinstall: build the Go parser binary if Go is installed

import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const goParserDir = resolve(__dirname, "..", "go-parser");
const mainGo = resolve(goParserDir, "main.go");

if (!existsSync(mainGo)) {
  // Running from npm package — go-parser source included
  process.exit(0);
}

const ext = process.platform === "win32" ? ".exe" : "";
const binary = resolve(goParserDir, `goparser${ext}`);

if (existsSync(binary)) {
  process.exit(0); // Already built
}

try {
  execSync("go version", { stdio: "ignore" });
} catch {
  console.log("aieattoken: Go not found. 'aet convert' requires Go to be installed.");
  console.log("  Install Go from https://go.dev/dl/ then run: cd go-parser && go build -o goparser");
  process.exit(0); // Non-fatal
}

try {
  console.log("aieattoken: Building Go parser...");
  execSync(`go build -o "${binary}" .`, { cwd: goParserDir, stdio: "inherit" });
  console.log("aieattoken: Go parser built successfully.");
} catch {
  console.log("aieattoken: Failed to build Go parser. 'aet convert' may not work.");
}
