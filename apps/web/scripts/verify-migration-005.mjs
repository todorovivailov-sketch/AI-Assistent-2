// Read-only: confirms migration 005 landed — documents table + assistants.vapi_query_tool_id exist.
// Run (from project root): node apps/web/scripts/verify-migration-005.mjs
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

const docs = await sb.from("documents").select("id").limit(1);
const asst = await sb.from("assistants").select("vapi_query_tool_id").limit(1);
if (docs.error) console.log(`documents table MISSING or error: ${docs.error.message}`);
else console.log("documents table OK");
if (asst.error) console.log(`assistants.vapi_query_tool_id MISSING or error: ${asst.error.message}`);
else console.log("assistants.vapi_query_tool_id OK");
setTimeout(() => process.exit(docs.error || asst.error ? 1 : 0), 150);
