// Unit tests for the pure Vapi knowledge-base helper. Run (from apps/web): node ./scripts/test-knowledge-base-client.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts
    .transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
    })
    .outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const { buildQueryToolBody, KB_TOOL_NAME } = await loadModule(["src", "lib", "vapi", "knowledge-base-client.ts"]);

const body = buildQueryToolBody(["f1", "f2"], "Демо ЕООД");
assert.equal(body.type, "query", "type query");
assert.equal(body.function.name, "business_docs", "stable tool name");
assert.ok(KB_TOOL_NAME === "business_docs" && /^[a-zA-Z0-9_-]{1,40}$/.test(KB_TOOL_NAME), "tool name valid + <=40 chars");
assert.equal(body.knowledgeBases.length, 1, "single knowledge base");
assert.equal(body.knowledgeBases[0].provider, "google", "provider google");
assert.deepEqual(body.knowledgeBases[0].fileIds, ["f1", "f2"], "fileIds passed through");
assert.ok(body.knowledgeBases[0].description.includes("Демо ЕООД"), "org name in description");

const body2 = buildQueryToolBody([], null);
assert.deepEqual(body2.knowledgeBases[0].fileIds, [], "empty fileIds ok, no org name");

const srcIds = ["x"];
const b3 = buildQueryToolBody(srcIds);
b3.knowledgeBases[0].fileIds.push("y");
assert.deepEqual(srcIds, ["x"], "input array not mutated");

console.log("knowledge-base-client checks passed");
