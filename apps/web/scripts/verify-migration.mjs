// Read-only: confirms migration 004 landed — base_prompt/guardrails columns exist on assistants
// and base_prompt is seeded. Run (from project root): node apps/web/scripts/verify-migration.mjs
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

const { data, error } = await sb.from("assistants").select("name, base_prompt, guardrails, system_prompt");
if (error) {
  console.log(`MIGRATION NOT APPLIED (or error): ${error.message}`);
  process.exitCode = 1;
} else {
  console.log("Migration OK — base_prompt/guardrails columns exist.");
  for (const r of data) {
    console.log(
      `  ${r.name}: base_prompt=${r.base_prompt ? r.base_prompt.length + "c" : "(null)"}, ` +
        `guardrails=${r.guardrails === null || r.guardrails === undefined ? "(null)" : r.guardrails.length + "c"}, ` +
        `system_prompt=${r.system_prompt ? r.system_prompt.length + "c" : "(null)"}`
    );
  }
}
setTimeout(() => process.exit(process.exitCode ?? 0), 150);
