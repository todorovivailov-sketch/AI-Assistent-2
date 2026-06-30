// Seeds an owner auth user + organization_members row for an organization.
// Usage (from project root):
//   node apps/web/scripts/seed-owner-user.mjs <email> <password> [org-slug]
//
// Uses the Supabase SERVICE ROLE key (admin API). Reads env from .env.local
// (root) or apps/web/.env.local. The script reads secrets but never prints them.
// Idempotent: if the user already exists, its password is reset to the value given.

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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const email = process.argv[2];
const password = process.argv[3];
const slug = process.argv[4] || "demo-hvac-company";

if (!email || !password) {
  console.error("usage: node apps/web/scripts/seed-owner-user.mjs <email> <password> [org-slug]");
  process.exit(1);
}
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY in .env.local"
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  let userId;
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created?.user?.id) {
    userId = created.user.id;
    console.log(`created auth user ${email}`);
  } else if (cErr && /already|registered|exists/i.test(cErr.message)) {
    const { data: list, error: lErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (lErr) {
      console.error(`listUsers failed: ${lErr.message}`);
      process.exitCode = 1;
      return;
    }
    userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (userId) {
      const { error: uErr } = await sb.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (uErr) {
        console.error(`password reset failed: ${uErr.message}`);
        process.exitCode = 1;
        return;
      }
      console.log(`auth user ${email} already existed — password updated to the provided value`);
    }
  } else {
    console.error(`createUser failed: ${cErr?.message ?? "unknown error"}`);
    process.exitCode = 1;
    return;
  }

  if (!userId) {
    console.error("could not resolve user id");
    process.exitCode = 1;
    return;
  }

  const { data: org, error: oErr } = await sb
    .from("organizations")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (oErr) {
    console.error(`organization lookup failed: ${oErr.message}`);
    process.exitCode = 1;
    return;
  }
  if (!org) {
    console.error(`organization not found for slug: ${slug}`);
    process.exitCode = 1;
    return;
  }

  const { error: mErr } = await sb
    .from("organization_members")
    .upsert(
      { organization_id: org.id, user_id: userId, role: "owner" },
      { onConflict: "organization_id,user_id" }
    );

  if (mErr) {
    console.error(`membership upsert failed: ${mErr.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`seeded owner ${email} -> ${org.name} (${org.id})`);
}

await main();
// Let undici sockets finish closing before forcing exit (avoids a libuv assert on Windows).
setTimeout(() => process.exit(process.exitCode ?? 0), 150);
