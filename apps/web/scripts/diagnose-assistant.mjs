// Diagnostic: shows each assistants DB row (which Vapi assistant the org points to, whether
// system_prompt/first_message are populated) and GETs the LIVE Vapi assistant to compare.
// Read-only. Run (from project root): node apps/web/scripts/diagnose-assistant.mjs

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
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
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const vapiKey = env.VAPI_PRIVATE_KEY || env.VAPI_API_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase url / service key");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const short = (s, n = 70) => (s ? JSON.stringify(s.split(/\r?\n/)[0].slice(0, n)) : "(none)");

async function main() {
  const { data: orgs } = await sb.from("organizations").select("id, name, slug");
  const orgName = new Map((orgs ?? []).map((o) => [o.id, `${o.name} (${o.slug})`]));

  const { data: rows, error } = await sb
    .from("assistants")
    .select("organization_id, vapi_assistant_id, name, first_message, system_prompt, status");
  if (error) {
    console.error(`assistants query failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`assistants rows in DB: ${rows?.length ?? 0}\n`);
  for (const r of rows ?? []) {
    console.log(`ORG: ${orgName.get(r.organization_id) ?? r.organization_id}`);
    console.log(`  DB: vapi_assistant_id=${r.vapi_assistant_id} name="${r.name}" status=${r.status}`);
    console.log(`  DB first_message: ${short(r.first_message)}`);
    console.log(`  DB system_prompt: ${r.system_prompt ? r.system_prompt.length + "c" : "(null)"}`);

    if (vapiKey && r.vapi_assistant_id) {
      try {
        const res = await fetch(`https://api.vapi.ai/assistant/${r.vapi_assistant_id}`, {
          headers: { Authorization: `Bearer ${vapiKey}` },
        });
        if (!res.ok) {
          console.log(`  LIVE Vapi GET -> ${res.status}`);
        } else {
          const a = await res.json();
          const sys = (a.model?.messages ?? []).find((m) => m.role === "system");
          console.log(`  LIVE: name="${a.name}" firstMessage=${short(a.firstMessage)}`);
          console.log(
            `  LIVE system_prompt: ${sys?.content ? sys.content.length + "c, first line: " + short(sys.content) : "(none)"}`
          );
        }
      } catch (e) {
        console.log(`  LIVE Vapi GET error: ${String(e).slice(0, 80)}`);
      }
    } else {
      console.log(`  (no VAPI key locally or no vapi_assistant_id)`);
    }
    console.log("");
  }
}

await main();
setTimeout(() => process.exit(process.exitCode ?? 0), 150);
