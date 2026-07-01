// Read-only E2E check for Phase 4c: DB documents + whether the LIVE Vapi assistant has the query tool wired.
// Run (from project root): node apps/web/scripts/check-documents-live.mjs
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
  .select("organization_id, vapi_assistant_id, vapi_query_tool_id, system_prompt")
  .limit(1)
  .maybeSingle();
const org = assistant.organization_id;
const { data: docs } = await sb.from("documents").select("name, kind, status, vapi_file_id").eq("organization_id", org);

console.log("=== DB (documents) ===");
for (const d of docs ?? []) console.log(`  - "${d.name}" [${d.kind}/${d.status}] file=${d.vapi_file_id ?? "-"}`);
console.log(`assistants.vapi_query_tool_id: ${assistant.vapi_query_tool_id ?? "(none)"}`);

console.log("\n=== LIVE Vapi assistant ===");
const res = await fetch(`https://api.vapi.ai/assistant/${assistant.vapi_assistant_id}`, { headers: { Authorization: `Bearer ${vapiKey}` } });
const a = await res.json();
const toolIds = a.model?.toolIds ?? [];
const sys = (a.model?.messages ?? []).find((m) => m.role === "system");
const live = sys?.content ?? "";
console.log(`toolIds (${toolIds.length}): ${toolIds.join(", ")}`);
console.log(`query tool attached: ${assistant.vapi_query_tool_id ? toolIds.includes(assistant.vapi_query_tool_id) : "n/a (no tool id stored)"}`);
console.log(`prompt names business_docs: ${live.includes("business_docs")}`);
console.log(`prompt has price rule: ${/Цени|цена/i.test(live)}`);
setTimeout(() => process.exit(0), 150);
