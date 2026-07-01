// One-off operation (two linked mutations, both explicitly authorized by the operator):
//   B) Apply the GENERIC Bulgarian receptionist system prompt to the LIVE Vapi assistant,
//      replacing the HVAC-specific prompt. Preserves provider/model/toolIds/tools/temperature
//      and the (already Publish-fixed) analysisPlan — swaps ONLY the system message + firstMessage.
//   A) Backfill the DB `assistants` row (system_prompt, first_message, name) FROM the now-updated
//      live assistant, so the dashboard editor stops showing an empty prompt.
//
// The generic prompt text is read from docs/03-setup/generic-booking-receptionist-prompt-bg.md
// (single source of truth — no hand-copied Cyrillic) with ONE correctness fix: the stale hardcoded
// date ("29 юни 2026") is swapped for Vapi's dynamic Liquid `now` variable so relative dates
// ("утре"/"в петък") are always computed correctly.
//
// Usage (from project root):
//   node apps/web/scripts/vapi/apply-generic-and-backfill.mjs         -> inspect (dry-run, no changes)
//   node apps/web/scripts/vapi/apply-generic-and-backfill.mjs apply   -> apply B then A

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "3a342308-b8fb-4194-a629-08fd978fdeea";
const MODE = process.argv[2] === "apply" ? "apply" : "inspect";
const DOC = path.join(ROOT, "docs", "03-setup", "generic-booking-receptionist-prompt-bg.md");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = { ...loadEnv(path.join(ROOT, "apps", "web", ".env.local")), ...loadEnv(path.join(ROOT, ".env.local")) };
const vapiKey = env.VAPI_PRIVATE_KEY || env.VAPI_API_KEY;
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

if (!vapiKey) { console.error("Missing VAPI key in .env.local"); process.exit(1); }
if (!url || !serviceKey) { console.error("Missing Supabase url / service key"); process.exit(1); }

// --- Build the generic prompt from the doc (single source of truth) -------------------------
function extractGenericPrompt() {
  const md = fs.readFileSync(DOC, "utf8");
  const start = md.indexOf("## Main System Prompt");
  const fenceOpen = md.indexOf("```text", start);
  const bodyStart = md.indexOf("\n", fenceOpen) + 1;
  const fenceClose = md.indexOf("```", bodyStart);
  let prompt = md.slice(bodyStart, fenceClose).trim();

  // Correctness fix: replace the stale hardcoded date with Vapi's dynamic Liquid `now`.
  const before = prompt;
  prompt = prompt.replace(
    /- Днешната дата е[\s\S]*?като 2025 г\.\)\./,
    '- Днешната дата и час (Europe/Sofia): {{ "now" | date: "%Y-%m-%d %H:%M", "Europe/Sofia" }}. Изчислявай всички относителни дати спрямо тази дата и час. Никога не използвай минали години.'
  );
  const dateFixed = prompt !== before;

  // Greeting = the quoted text after "Първо кажи:".
  const g = /Първо кажи:\s*"([^"]+)"/.exec(prompt);
  const greeting = g ? g[1] : "";

  return { prompt, greeting, dateFixed };
}

async function vapi(method, p, body) {
  const res = await fetch(`https://api.vapi.ai${p}`, {
    method,
    headers: { Authorization: `Bearer ${vapiKey}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// Same merge rule as lib/vapi/assistant-client buildSyncedModel: preserve everything, swap ONLY the system message.
function buildSyncedModel(currentModel, systemPrompt) {
  const messages = Array.isArray(currentModel?.messages) ? currentModel.messages.map((m) => ({ ...m })) : [];
  const i = messages.findIndex((m) => m.role === "system");
  if (i >= 0) messages[i] = { ...messages[i], content: systemPrompt };
  else messages.unshift({ role: "system", content: systemPrompt });
  const m = currentModel ?? {};
  return {
    provider: m.provider, model: m.model, messages,
    ...(m.toolIds ? { toolIds: m.toolIds } : {}),
    ...(Array.isArray(m.tools) && m.tools.length ? { tools: m.tools } : {}),
    ...(m.temperature != null ? { temperature: m.temperature } : {}),
    ...(m.maxTokens != null ? { maxTokens: m.maxTokens } : {}),
    ...(m.knowledgeBaseId ? { knowledgeBaseId: m.knowledgeBaseId } : {}),
  };
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const firstLine = (s, n = 80) => (s ? JSON.stringify(String(s).split(/\r?\n/)[0].slice(0, n)) : "(none)");

async function main() {
  const { prompt, greeting, dateFixed } = extractGenericPrompt();
  console.log(`Generic prompt: ${prompt.length}c, date-fixed=${dateFixed}`);
  console.log(`Greeting: ${firstLine(greeting)}`);
  if (!prompt || prompt.length < 500) { console.error("Extracted prompt looks wrong (too short) — aborting."); process.exit(1); }
  if (!greeting) { console.error("Could not extract greeting — aborting."); process.exit(1); }

  // Current live assistant
  const got = await vapi("GET", `/assistant/${ASSISTANT_ID}`);
  if (got.status !== 200) { console.error(`Vapi GET -> ${got.status}: ${got.text.slice(0, 200)}`); process.exit(1); }
  const liveName = got.json.name;
  const liveSys = (got.json.model?.messages ?? []).find((m) => m.role === "system");
  console.log(`\nLIVE Vapi assistant "${liveName}" (${ASSISTANT_ID})`);
  console.log(`  current system_prompt: ${liveSys?.content ? liveSys.content.length + "c, " + firstLine(liveSys.content) : "(none)"}`);
  console.log(`  current firstMessage:  ${firstLine(got.json.firstMessage)}`);

  // Current DB row
  const { data: dbRow, error: dbErr } = await sb
    .from("assistants")
    .select("organization_id, name, first_message, system_prompt")
    .eq("vapi_assistant_id", ASSISTANT_ID)
    .maybeSingle();
  if (dbErr) { console.error(`DB read failed: ${dbErr.message}`); process.exit(1); }
  if (!dbRow) { console.error(`No assistants row with vapi_assistant_id=${ASSISTANT_ID}`); process.exit(1); }
  console.log(`\nDB assistants row (org ${dbRow.organization_id})`);
  console.log(`  system_prompt: ${dbRow.system_prompt ? dbRow.system_prompt.length + "c" : "(null)"}`);
  console.log(`  first_message: ${firstLine(dbRow.first_message)}`);
  console.log(`  name:          ${JSON.stringify(dbRow.name)}`);

  if (MODE === "inspect") {
    console.log(`\n(inspect only — no changes. Re-run with 'apply' to PATCH Vapi to the generic prompt + greeting, then backfill the DB row from live.)`);
    return;
  }

  // --- B) PATCH Vapi (system message + firstMessage only; analysisPlan/tools/voice preserved) ---
  const model = buildSyncedModel(got.json.model ?? {}, prompt);
  console.log(`\n[B] PATCH Vapi -> generic prompt (${prompt.length}c) + greeting ...`);
  const patch = await vapi("PATCH", `/assistant/${ASSISTANT_ID}`, { name: liveName, firstMessage: greeting, model });
  if (patch.status >= 300) { console.error(`Vapi PATCH failed: ${patch.status} ${patch.text.slice(0, 400)}`); process.exit(1); }
  console.log(`    Vapi PATCH ${patch.status} OK`);

  // Re-GET to backfill the DB FROM live (guarantees DB mirrors exactly what Vapi stored).
  const after = await vapi("GET", `/assistant/${ASSISTANT_ID}`);
  const afterSys = (after.json.model?.messages ?? []).find((m) => m.role === "system");
  const liveSystemPrompt = afterSys?.content ?? prompt;
  const liveFirst = typeof after.json.firstMessage === "string" ? after.json.firstMessage : greeting;
  const liveNm = after.json.name ?? liveName;

  // --- A) Backfill DB row from live ---
  console.log(`\n[A] Backfill DB assistants row from live ...`);
  const { error: upErr } = await sb
    .from("assistants")
    .update({ system_prompt: liveSystemPrompt, first_message: liveFirst, name: liveNm })
    .eq("vapi_assistant_id", ASSISTANT_ID);
  if (upErr) { console.error(`DB update failed: ${upErr.message}`); process.exit(1); }
  console.log(`    DB updated: system_prompt=${liveSystemPrompt.length}c, first_message set, name=${JSON.stringify(liveNm)}`);

  console.log(`\nDone. Vapi + DB are now consistent on the GENERIC prompt.`);
}

await main();
setTimeout(() => process.exit(process.exitCode ?? 0), 200);
