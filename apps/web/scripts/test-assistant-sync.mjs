// Unit tests for the Vapi assistant sync pure logic (no network, no DB).
// buildSyncedModel MUST preserve provider/model/toolIds/tools (the booking tools + voice config live
// outside model.messages) and swap ONLY the system message — a wrong merge would break the live agent.
// Run (from apps/web): node ./scripts/test-assistant-sync.mjs

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
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

const { buildSyncedModel } = await loadModule(["src", "lib", "vapi", "assistant-client.ts"]);
const { parseAgentBehaviorForm } = await loadModule(["src", "lib", "agent", "assistant-form.ts"]);

// --- buildSyncedModel preserves model config + swaps the system message ---
const current = {
  provider: "openai",
  model: "gpt-5.4",
  toolIds: ["a", "b"],
  temperature: 0.4,
  messages: [
    { role: "system", content: "OLD" },
    { role: "user", content: "hi" },
  ],
};
const synced = buildSyncedModel(current, "NEW");
assert.equal(synced.provider, "openai", "provider preserved");
assert.equal(synced.model, "gpt-5.4", "model preserved");
assert.deepEqual(synced.toolIds, ["a", "b"], "toolIds (booking tools) preserved");
assert.equal(synced.temperature, 0.4, "temperature preserved");
const sys = synced.messages.find((m) => m.role === "system");
assert.equal(sys.content, "NEW", "system message swapped");
assert.ok(synced.messages.some((m) => m.role === "user" && m.content === "hi"), "other messages kept");
assert.equal(current.messages[0].content, "OLD", "input not mutated");

// prepend a system message when none exists
const synced2 = buildSyncedModel({ provider: "openai", model: "x", messages: [] }, "SYS");
assert.equal(synced2.messages[0].role, "system", "system prepended");
assert.equal(synced2.messages[0].content, "SYS");

// omit tools/temperature when absent (don't send empty/undefined fields)
const synced3 = buildSyncedModel({ provider: "p", model: "m", messages: [] }, "S");
assert.ok(!("temperature" in synced3), "temperature omitted when absent");
assert.ok(!("toolIds" in synced3), "toolIds omitted when absent");

// --- parseAgentBehaviorForm ---
const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });
assert.equal(parseAgentBehaviorForm(form({ base_prompt: "p" })).error, "name_required", "name required");
assert.equal(parseAgentBehaviorForm(form({ name: "n" })).error, "base_prompt_required", "base required (no blanking)");
const okb = parseAgentBehaviorForm(form({ name: "  Бот  ", base_prompt: "  База  ", first_message: " Здравей ", guardrails: " Правило " }));
assert.equal(okb.error, undefined, "valid form");
assert.equal(okb.values.name, "Бот", "name trimmed");
assert.equal(okb.values.basePrompt, "База", "base trimmed");
assert.equal(okb.values.firstMessage, "Здравей", "greeting trimmed");
assert.equal(okb.values.guardrails, "Правило", "guardrails trimmed");
assert.equal(parseAgentBehaviorForm(form({ name: "n", base_prompt: "p" })).values.guardrails, "", "guardrails may be empty");

console.log("assistant-sync checks passed");
