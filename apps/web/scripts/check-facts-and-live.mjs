// Read-only E2E check for Phase 4b: shows the org's facts in the DB and whether the LIVE Vapi
// assistant has been published with them. Run (from project root): node apps/web/scripts/check-facts-and-live.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const root = process.cwd();
const env = { ...loadEnv(path.join(root, "apps", "web", ".env.local")), ...loadEnv(path.join(root, ".env.local")) };
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const vapiKey = env.VAPI_PRIVATE_KEY || env.VAPI_API_KEY;

const { data: assistant } = await sb
  .from("assistants")
  .select("organization_id, vapi_assistant_id, name, base_prompt, guardrails, system_prompt")
  .limit(1)
  .maybeSingle();
const org = assistant.organization_id;

const { data: services } = await sb.from("services").select("name, status, duration_minutes, price_min, price_max").eq("organization_id", org);
const { data: hours } = await sb.from("business_hours").select("weekday").eq("organization_id", org);
const { data: areas } = await sb.from("service_areas").select("city, status").eq("organization_id", org);

console.log("=== DB (saved facts) ===");
console.log(`services (${services?.length ?? 0}):`);
for (const s of services ?? []) console.log(`  - "${s.name}" [${s.status}] ${s.duration_minutes}м price=${s.price_min ?? "-"}/${s.price_max ?? "-"}`);
console.log(`business_hours rows: ${hours?.length ?? 0} | service_areas: ${(areas ?? []).map((a) => a.city).join(", ") || "none"}`);
console.log(`assistants.system_prompt: ${assistant.system_prompt?.length ?? 0}c (DB copy of last published)`);

console.log("\n=== LIVE Vapi assistant ===");
const res = await fetch(`https://api.vapi.ai/assistant/${assistant.vapi_assistant_id}`, { headers: { Authorization: `Bearer ${vapiKey}` } });
const a = await res.json();
const sys = (a.model?.messages ?? []).find((m) => m.role === "system");
const live = sys?.content ?? "";
const hasCtx = live.includes("## Бизнес контекст");
console.log(`system prompt: ${live.length}c`);
console.log(`has "## Бизнес контекст": ${hasCtx}`);
for (const s of services ?? []) console.log(`  live mentions "${s.name}": ${live.includes(s.name)}`);
const priceLeak = /\d+(\.\d+)?\s*(лв|BGN|EUR|€)/.test(live) || (services ?? []).some((s) => s.price_min != null && live.includes(String(s.price_min)));
console.log(`price leak in live prompt: ${priceLeak}`);
console.log(`toolIds: ${(a.model?.toolIds ?? []).length} | voice: ${a.voice?.provider}/${a.voice?.voiceId} | transcriber: ${a.transcriber?.provider}/${a.transcriber?.language ?? "?"}`);

console.log("\n=== VERDICT ===");
if (!services?.length) console.log("No services saved yet — did the add succeed?");
else if (hasCtx && services.every((s) => live.includes(s.name)))
  console.log("PUBLISHED ✓ — live prompt has business context with the service(s); tools/voice preserved:", (a.model?.toolIds ?? []).length === 2 && !priceLeak);
else console.log("SAVED but NOT PUBLISHED yet — the service is in the DB; click 'Публикувай на живо' to push it to Vapi.");
setTimeout(() => process.exit(0), 150);
