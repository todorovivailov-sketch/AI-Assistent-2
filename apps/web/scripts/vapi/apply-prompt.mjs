// Applies the v2 Bulgarian receptionist prompt + structured-data schema to the Vapi assistant.
// Usage (from project root):
//   node apps/web/scripts/vapi/apply-prompt.mjs           -> inspect only (no changes)
//   node apps/web/scripts/vapi/apply-prompt.mjs apply     -> apply system prompt + analysis plan
//
// Reads VAPI_PRIVATE_KEY / VAPI_API_KEY from .env.local (root) or apps/web/.env.local.
// Source of truth for the prompt text: docs/03-setup/receptionist-prompt-v2-bg.md

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DOC = path.join(ROOT, "docs", "03-setup", "receptionist-prompt-v2-bg.md");
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "3a342308-b8fb-4194-a629-08fd978fdeea";
const MODE = process.argv[2] === "apply" ? "apply" : "inspect";

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadEnv(path.join(ROOT, "apps", "web", ".env.local")), ...loadEnv(path.join(ROOT, ".env.local")) };
const candidateKeys = [
  ["VAPI_PRIVATE_KEY", env.VAPI_PRIVATE_KEY],
  ["VAPI_API_KEY", env.VAPI_API_KEY],
].filter(([, v]) => v);

if (candidateKeys.length === 0) {
  console.error("No VAPI_PRIVATE_KEY / VAPI_API_KEY found in .env.local");
  process.exit(1);
}

function blockAfter(md, headerSubstr, fence) {
  const idx = md.indexOf(headerSubstr);
  if (idx < 0) throw new Error(`Header not found: ${headerSubstr}`);
  const re = new RegExp("```" + fence + "\\r?\\n([\\s\\S]*?)```");
  const m = re.exec(md.slice(idx));
  if (!m) throw new Error(`No \`\`\`${fence} block after: ${headerSubstr}`);
  return m[1].replace(/\s+$/, "");
}

function extractPrompts() {
  const md = fs.readFileSync(DOC, "utf8");
  const system = blockAfter(md, "Главен системен промпт", "text");
  const summary = blockAfter(md, "Summary prompt", "text");
  const structured = blockAfter(md, "Structured-data prompt", "text");
  const schema = JSON.parse(blockAfter(md, "Structured-data schema", "json"));
  return { system, summary, structured, schema };
}

async function api(method, urlPath, key, body) {
  const res = await fetch(`https://api.vapi.ai${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function resolveKey() {
  for (const [name, key] of candidateKeys) {
    const r = await api("GET", "/assistant?limit=1", key);
    if (r.status === 200) return { name, key };
  }
  return null;
}

function firstLine(s) {
  return (s || "").split(/\r?\n/)[0].slice(0, 70);
}

const auth = await resolveKey();
if (!auth) {
  console.error("Auth failed for all candidate keys (got non-200 on GET /assistant). Check the key value/type.");
  process.exit(1);
}
console.log(`Auth OK using ${auth.name}`);

const list = await api("GET", "/assistant?limit=50", auth.key);
if (list.status === 200 && Array.isArray(list.json)) {
  console.log(`\nAssistants (${list.json.length}):`);
  for (const a of list.json) console.log(`  ${a.id}  ${a.name ?? "(no name)"}`);
}

const got = await api("GET", `/assistant/${ASSISTANT_ID}`, auth.key);
if (got.status !== 200) {
  console.error(`\nGET /assistant/${ASSISTANT_ID} -> ${got.status}: ${got.text.slice(0, 200)}`);
  process.exit(1);
}
const a = got.json;
const model = a.model ?? {};
const messages = Array.isArray(model.messages) ? model.messages : [];
const ap = a.analysisPlan ?? {};
console.log(`\n=== TARGET: ${a.name} (${a.id}) ===`);
console.log(`model: ${model.provider}/${model.model}  temp=${model.temperature ?? "-"}`);
console.log(`model.messages: ${messages.map((m) => `${m.role}(${(m.content || "").length}c)`).join(", ") || "none"}`);
const sysMsg = messages.find((m) => m.role === "system");
console.log(`system first line: ${sysMsg ? firstLine(sysMsg.content) : "(none)"}`);
console.log(`tools: ${(model.tools || []).length}  toolIds: ${(model.toolIds || []).length}`);
console.log(`voice: ${a.voice?.provider}/${a.voice?.voiceId ?? a.voice?.model ?? "-"}`);
console.log(`transcriber: ${a.transcriber?.provider}/${a.transcriber?.model ?? a.transcriber?.language ?? "-"}`);
console.log(`analysisPlan keys: ${Object.keys(ap).join(", ") || "none"}`);
console.log(`  summaryPlan.messages: ${(ap.summaryPlan?.messages || []).length}`);
console.log(`  structuredDataPlan: enabled=${ap.structuredDataPlan?.enabled} hasSchema=${Boolean(ap.structuredDataPlan?.schema)} messages=${(ap.structuredDataPlan?.messages || []).length}`);
console.log(`server.url: ${a.server?.url ?? a.serverUrl ?? "-"}`);

if (MODE === "inspect") {
  const p = extractPrompts();
  console.log(`\n=== DOC EXTRACTION (dry run) ===`);
  console.log(`system prompt: ${p.system.length}c, first line: ${firstLine(p.system)}`);
  console.log(`summary prompt: ${p.summary.length}c`);
  console.log(`structured prompt: ${p.structured.length}c`);
  console.log(`schema props: ${Object.keys(p.schema.properties || {}).join(", ")}`);
  console.log(`\n(inspect only — no changes. Re-run with 'apply' to update.)`);
  process.exit(0);
}

// ---- APPLY ----
const p = extractPrompts();
const newMessages = (() => {
  const msgs = messages.map((m) => ({ ...m }));
  const i = msgs.findIndex((m) => m.role === "system");
  if (i >= 0) msgs[i].content = p.system;
  else msgs.unshift({ role: "system", content: p.system });
  return msgs;
})();

const newModel = {
  provider: model.provider,
  model: model.model,
  messages: newMessages,
  ...(model.toolIds ? { toolIds: model.toolIds } : {}),
  ...(Array.isArray(model.tools) && model.tools.length ? { tools: model.tools } : {}),
  ...(model.temperature != null ? { temperature: model.temperature } : {}),
  ...(model.maxTokens != null ? { maxTokens: model.maxTokens } : {}),
  ...(model.knowledgeBaseId ? { knowledgeBaseId: model.knowledgeBaseId } : {}),
};
const newAnalysisPlan = {
  ...ap,
  summaryPlan: { ...(ap.summaryPlan || {}), messages: [{ role: "system", content: p.summary }] },
  structuredDataPlan: {
    ...(ap.structuredDataPlan || {}),
    enabled: true,
    schema: p.schema,
    messages: [{ role: "system", content: p.structured }],
  },
};

console.log(`\nApplying to ${a.name} ...`);
const patch = await api("PATCH", `/assistant/${ASSISTANT_ID}`, auth.key, {
  model: newModel,
  analysisPlan: newAnalysisPlan,
});
console.log(`PATCH status: ${patch.status}`);
if (patch.status >= 300) {
  console.error(`PATCH failed: ${patch.text.slice(0, 500)}`);
  process.exit(1);
}

const after = await api("GET", `/assistant/${ASSISTANT_ID}`, auth.key);
const afterSys = (after.json.model?.messages || []).find((m) => m.role === "system");
const ok = afterSys && afterSys.content === p.system;
console.log(`\nVerification: system prompt applied = ${ok}`);
console.log(`  live first line: ${firstLine(afterSys?.content)}`);
console.log(`  structuredDataPlan schema props: ${Object.keys(after.json.analysisPlan?.structuredDataPlan?.schema?.properties || {}).join(", ")}`);
console.log(ok ? "\n✅ Done." : "\n⚠️ Applied but verification mismatch — review in Vapi.");
