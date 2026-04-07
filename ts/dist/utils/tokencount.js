// Token counting utility — isolated module to avoid ESM initialization issues
import { createRequire } from "module";
const require = createRequire(import.meta.url);
let enc = null;
let loaded = false;
function ensureEncoder() {
    if (loaded)
        return;
    loaded = true;
    try {
        const { get_encoding } = require("@dqbd/tiktoken");
        enc = get_encoding("cl100k_base");
    }
    catch {
        enc = null;
    }
}
export function countTokens(code) {
    ensureEncoder();
    if (!enc)
        return Math.ceil(code.length / 4);
    return enc.encode(code).length;
}
