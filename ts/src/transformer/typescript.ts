// Transformer: loads TypeScript alias map and provides helper access.
// Uses the same JSON format as stdlib-aliases-typescript.json.

import { readFileSync } from "fs";
import { resolve } from "path";
import { setEmitterAliases } from "../emitter/typescript.js";

interface TsAlias {
  ts: string;
  pkg: string;
  fromImport?: string;
  namespaceImport?: string;
}

let loadedAliases: Record<string, TsAlias> = {};

export function loadTypescriptAliases(path?: string): void {
  try {
    const p = path || resolve(process.cwd(), "stdlib-aliases-typescript.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    const aliases = data.aliases || {};
    loadedAliases = {};
    for (const [alias, info] of Object.entries(aliases) as [string, any][]) {
      if (alias.startsWith("_")) continue;
      if (info && typeof info === "object" && info.ts) {
        loadedAliases[alias] = info as TsAlias;
      }
    }
    setEmitterAliases(loadedAliases);
  } catch {
    /* optional */
  }
}

export function getTypescriptAliases(): Record<string, TsAlias> {
  return loadedAliases;
}
