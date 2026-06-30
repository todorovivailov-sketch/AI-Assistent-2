// Zero-risk verification of buildSyncedModel against the LIVE Vapi assistant.
// GETs the assistant, runs the REAL buildSyncedModel with the assistant's OWN system prompt (what a
// no-op save would send), and asserts the reconstructed model preserves provider/model/toolIds and the
// system message. Does NOT patch anything — purely a safety check before the first real save.
// Run (from project root): node apps/web/scripts/verify-vapi-sync.mjs

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const root = process.cwd();
const env = {
  ...loadEnv(path.join(root, "apps", "web", ".env.local")),
  ...loadEnv(path.join(root, ".env.local")),
};
const key = env.VAPI_PRIVATE_KEY || env.VAPI_API_KEY;
const assistantId = env.VAPI_ASSISTANT_ID || "3a342308-b8fb-4194-a629-08fd978fdeea";
if (!key) {
  console.error("No VAPI_PRIVATE_KEY / VAPI_API_KEY in .env.local");
  process.exit(1);
}

const src = path.join(root, "apps", "web", "src", "lib", "vapi", "assistant-client.ts");
const code = ts
  .transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
  })
  .outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
const { buildSyncedModel } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

async function main() {
  const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`GET /assistant/${assistantId} -> ${res.status}`);
    process.exitCode = 1;
    return;
  }
  const a = await res.json();
  const model = a.model ?? {};
  const sys = (model.messages ?? []).find((m) => m.role === "system");
  const systemContent = sys?.content ?? "";
  console.log(
    `live: ${a.name} | ${model.provider}/${model.model} | toolIds=${(model.toolIds || []).length} | sys=${systemContent.length}c | voice=${a.voice?.provider}/${a.voice?.voiceId ?? "-"}`
  );

  // Reconstruct with the SAME system prompt — exactly what a no-op save would push.
  const synced = buildSyncedModel(model, systemContent);

  assert.equal(synced.provider, model.provider, "provider preserved");
  assert.equal(synced.model, model.model, "model preserved");
  assert.deepEqual(synced.toolIds, model.toolIds, "toolIds (booking tools) preserved");
  const newSys = synced.messages.find((m) => m.role === "system");
  assert.equal(newSys?.content, systemContent, "system prompt preserved");

  console.log(
    `reconstructed: ${synced.provider}/${synced.model} | toolIds=${(synced.toolIds || []).length} (voice/transcriber/analysisPlan are top-level, not sent in PATCH -> Vapi preserves them)`
  );
  console.log("\nRESULT: PASS — buildSyncedModel preserves the live model. Sync is safe (no patch performed).");
}

await main();
// Let undici sockets finish closing before forcing exit (avoids a libuv assert on Windows).
setTimeout(() => process.exit(process.exitCode ?? 0), 150);
