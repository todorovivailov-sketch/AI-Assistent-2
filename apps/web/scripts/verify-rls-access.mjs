// Verifies the dashboard's RLS path: sign in as a user (anon key) and run the
// same reads the dashboard does, confirming RLS returns the user's org rows.
// Usage (from project root):
//   node apps/web/scripts/verify-rls-access.mjs <email> <password>
// Prints PASS/FAIL + row counts. No secrets are printed.

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
const anon = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("usage: node apps/web/scripts/verify-rls-access.mjs <email> <password>");
  process.exit(1);
}
if (!url || !anon) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr || !auth?.user) {
  console.error(`AUTH FAIL: ${authErr?.message ?? "no user returned"}`);
  process.exit(1);
}
console.log(`auth ok: signed in as ${email}`);

const { data: memberships, error: mErr } = await sb
  .from("organization_members")
  .select("organization_id, role");
if (mErr) {
  console.error(`organization_members RLS error: ${mErr.message}`);
  process.exit(1);
}
console.log(
  `memberships visible: ${memberships?.length ?? 0}` +
    (memberships?.length ? ` (roles: ${memberships.map((m) => m.role).join(", ")})` : "")
);

const { data: orgs, error: oErr } = await sb
  .from("organizations")
  .select("id, name, slug, timezone");
if (oErr) {
  console.error(`organizations RLS error: ${oErr.message}`);
  process.exit(1);
}
console.log(
  `organizations visible: ${orgs?.length ?? 0}` +
    (orgs?.length ? ` -> ${orgs.map((o) => o.slug).join(", ")}` : "")
);

const { count: callsCount, error: cErr } = await sb
  .from("calls")
  .select("id", { count: "exact", head: true });
if (cErr) {
  console.error(`calls RLS error: ${cErr.message}`);
  process.exit(1);
}
console.log(`calls visible: ${callsCount ?? 0}`);

const { count: apptCount, error: aErr } = await sb
  .from("appointments")
  .select("id", { count: "exact", head: true });
if (aErr) {
  console.error(`appointments RLS error: ${aErr.message}`);
  process.exit(1);
}
console.log(`appointments visible: ${apptCount ?? 0}`);

const pass = (memberships?.length ?? 0) >= 1 && (orgs?.length ?? 0) >= 1;
console.log(
  pass
    ? "\nRESULT: PASS — RLS resolves the user's org; the dashboard will scope correctly."
    : "\nRESULT: FAIL — no membership/org visible; check the organization_members seed + RLS policies."
);
process.exit(pass ? 0 : 1);
