// Verifies the CRM *write* path: sign in as a user (anon key) and run the same
// inserts/updates the dashboard server actions do, proving the RLS "members can
// insert/update leads & appointments" policies work end-to-end. Cleans up the
// test rows with the service-role client (there is intentionally no member DELETE
// policy). Prints PASS/FAIL. No secrets are printed.
//
// Usage (from project root):
//   node apps/web/scripts/verify-crm-writes.mjs <email> <password>

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
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("usage: node apps/web/scripts/verify-crm-writes.mjs <email> <password>");
  process.exit(1);
}
if (!url || !anon || !serviceKey) {
  console.error("Missing SUPABASE url / anon / service-role key in .env.local");
  process.exit(1);
}

const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

let leadId = null;
let appointmentId = null;

async function main() {
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr || !auth?.user) {
    console.error(`AUTH FAIL: ${authErr?.message ?? "no user"}`);
    process.exitCode = 1;
    return;
  }
  console.log(`auth ok: ${email}`);

  const { data: membership, error: mErr } = await sb
    .from("organization_members")
    .select("organization_id")
    .limit(1)
    .maybeSingle();
  if (mErr || !membership) {
    console.error(`no org membership visible: ${mErr?.message ?? "none"}`);
    process.exitCode = 1;
    return;
  }
  const orgId = membership.organization_id;
  console.log(`org resolved: ${orgId}`);

  // 1. Insert a lead (RLS: members can insert leads).
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .insert({ organization_id: orgId, name: "RLS Write Test", phone: "+359000000000", source: "manual", status: "new" })
    .select("id")
    .single();
  if (leadErr || !lead) {
    console.error(`LEAD INSERT FAIL: ${leadErr?.message ?? "no row"}`);
    process.exitCode = 1;
    return;
  }
  leadId = lead.id;
  console.log("lead insert ok");

  // 2. Update lead status + notes (RLS: members can update leads).
  const { error: leadUpdErr } = await sb
    .from("leads")
    .update({ status: "qualified", notes: "verified by script" })
    .eq("id", leadId);
  if (leadUpdErr) {
    console.error(`LEAD UPDATE FAIL: ${leadUpdErr.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("lead update ok");

  // 3. Insert an appointment (RLS: members can insert appointments).
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 90_000_000).toISOString();
  const { data: appt, error: apptErr } = await sb
    .from("appointments")
    .insert({ organization_id: orgId, title: "RLS Write Test", status: "confirmed", starts_at: startsAt, ends_at: endsAt })
    .select("id")
    .single();
  if (apptErr || !appt) {
    console.error(`APPOINTMENT INSERT FAIL: ${apptErr?.message ?? "no row"}`);
    process.exitCode = 1;
    return;
  }
  appointmentId = appt.id;
  console.log("appointment insert ok");

  // 4. Update appointment time/status (RLS: members can update appointments).
  // Move BOTH starts_at and ends_at together so the ends_at > starts_at check holds
  // (a reschedule always rewrites both — never just one).
  const { error: apptUpdErr } = await sb
    .from("appointments")
    .update({
      starts_at: new Date(Date.now() + 172_800_000).toISOString(),
      ends_at: new Date(Date.now() + 176_400_000).toISOString(),
      status: "rescheduled",
    })
    .eq("id", appointmentId);
  if (apptUpdErr) {
    console.error(`APPOINTMENT UPDATE FAIL: ${apptUpdErr.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("appointment update ok");

  console.log("\nRESULT: PASS — RLS insert + update work for leads and appointments.");
}

async function cleanup() {
  if (leadId) await admin.from("leads").delete().eq("id", leadId);
  if (appointmentId) await admin.from("appointments").delete().eq("id", appointmentId);
}

await main();
await cleanup();
// Let undici sockets finish closing before forcing exit (avoids a libuv assert on Windows).
setTimeout(() => process.exit(process.exitCode ?? 0), 150);
