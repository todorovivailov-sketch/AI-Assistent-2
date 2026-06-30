# Phase 2 — Auth & Multi-Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Replace the single shared dashboard password + hardcoded org slug with real Supabase Auth,
so each user signs in and sees only their own organization's data (DB-enforced via the existing RLS).

**Key finding:** The database is already multi-tenant — `organization_members`, `is_org_member()` /
`is_org_admin()`, RLS enabled on every table, and read/write policies all exist
(`supabase/migrations/001_initial_ai_receptionist_schema.sql`). **No schema migration needed.** This phase
is entirely application-layer: login, session, org-from-session, and switching the dashboard to the
RLS-respecting client.

**Decision (default, flag if you disagree):** Auth = **email + password, admin-created** (we create each
client's user via a seed/onboarding script and hand them credentials). Reliable, no email/SMTP dependency
for the first clients. Magic-link can be added later — the code is structured so it's an easy swap.

**Architecture:**
- `apps/web/src/lib/supabase/server.ts` (session client, RLS) becomes the dashboard's data client.
- `proxy.ts` checks the Supabase session instead of a static token.
- A new `getActiveOrganization()` resolves the org from `auth.uid()` via `organization_members`.
- `data.ts` switches every query from the service client to the session client (RLS auto-scopes).
- The webhook & calendar tools keep the **service** client (server-to-server, resolve org by phone number) — unchanged.

**Tech Stack:** Next.js 16 (App Router, server components, route handlers, `proxy.ts` middleware),
`@supabase/ssr`, Supabase Auth (password), existing Supabase Postgres + RLS.

---

## File Structure

- Create: `apps/web/src/app/login/page.tsx` — login form (client component).
- Create: `apps/web/src/app/login/actions.ts` — `signIn` / `signOut` server actions.
- Create: `apps/web/src/lib/auth/organization.ts` — `getActiveOrganization()` (session → membership → org).
- Modify: `apps/web/src/proxy.ts` — session guard + redirect to `/login`.
- Modify: `apps/web/src/lib/dashboard/data.ts` — use session client; replace `getDashboardOrganization()` with `getActiveOrganization()`.
- Modify: `apps/web/src/components/app-shell.tsx` — show signed-in user + sign-out (small).
- Create: `apps/web/scripts/seed-owner-user.mjs` — create the owner auth user + `organization_members` row.
- Test: `apps/web/scripts/test-active-organization.mjs` — unit test the membership→org selection logic.

---

### Task 1: Org-resolution helper (pure logic + session lookup)

**Files:**
- Create: `apps/web/src/lib/auth/organization.ts`
- Test: `apps/web/scripts/test-active-organization.mjs`

- [ ] **Step 1: Write the failing test for the selection rule**

`pickActiveMembership` chooses the org when a user belongs to one (or the `owner`/`admin` first). Create
`apps/web/scripts/test-active-organization.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const src = path.join(process.cwd(), "src", "lib", "auth", "organization.ts");
if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
const out = ts.transpileModule(readFileSync(src, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
});
const url = `data:text/javascript;base64,${Buffer.from(out.outputText).toString("base64")}`;
const { pickActiveMembership } = await import(url);

assert.equal(pickActiveMembership([]), null, "no memberships -> null");
assert.deepEqual(
  pickActiveMembership([{ organization_id: "a", role: "viewer" }]),
  { organization_id: "a", role: "viewer" },
  "single membership is selected"
);
assert.equal(
  pickActiveMembership([
    { organization_id: "a", role: "viewer" },
    { organization_id: "b", role: "owner" },
  ]).organization_id,
  "b",
  "owner/admin is preferred when multiple memberships exist"
);
console.log("active organization selection checks passed");
```

- [ ] **Step 2: Run it — expect FAIL** (module missing).

Run: `cd apps/web && node ./scripts/test-active-organization.mjs`

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/auth/organization.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export type Membership = { organization_id: string; role: string };
export type ActiveOrganization = { id: string; name: string; slug: string; timezone: string };

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, operator: 2, viewer: 3 };

export function pickActiveMembership(memberships: Membership[]): Membership | null {
  if (!memberships?.length) return null;
  return [...memberships].sort(
    (a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9)
  )[0];
}

export async function getActiveOrganization(): Promise<ActiveOrganization | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role");
  const active = pickActiveMembership((memberships as Membership[]) ?? []);
  if (!active) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, timezone")
    .eq("id", active.organization_id)
    .maybeSingle();
  return org ?? null;
}
```

- [ ] **Step 4: Run the test — expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(auth): add session-based active-organization resolver"`

---

### Task 2: Login page + sign-in/out server actions

**Files:**
- Create: `apps/web/src/app/login/actions.ts`
- Create: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Server actions**

Create `apps/web/src/app/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Невалиден имейл или парола." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Login page**

Create `apps/web/src/app/login/page.tsx` (client form using `useActionState`; matches existing dashboard styling — reuse Tailwind classes from `app-shell.tsx`):

```tsx
"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-xl border p-6">
        <h1 className="text-lg font-semibold">Вход</h1>
        <input name="email" type="email" required placeholder="Имейл"
          className="w-full rounded-md border px-3 py-2" />
        <input name="password" type="password" required placeholder="Парола"
          className="w-full rounded-md border px-3 py-2" />
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" disabled={pending}
          className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50">
          {pending ? "Влизане…" : "Влез"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Build** — `cd apps/web && npm run build` → expect compile success.
- [ ] **Step 4: Commit** — `git commit -m "feat(auth): add email/password login page and actions"`

> NOTE (Next.js 16): before writing these files, read `node_modules/next/dist/docs/` for the current
> server-actions / `useActionState` guidance (per `apps/web/AGENTS.md` — APIs may differ from training data).

---

### Task 3: Replace the token guard in `proxy.ts` with a session check

**Files:** Modify `apps/web/src/proxy.ts`

- [ ] **Step 1: Swap the guard**

Replace the body of `proxy()` so it allows `/login`, refreshes the Supabase session via `@supabase/ssr`
`createServerClient` (cookie adapter for `NextRequest`/`NextResponse`), and redirects to `/login` when
`auth.getUser()` returns no user. Add `/login` to (or exclude it from) the matcher as needed. Keep the
`config.matcher` list otherwise intact.

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}
```

- [ ] **Step 2: Build** → expect success. **Step 3: Commit** — `git commit -m "feat(auth): gate dashboard with Supabase session"`

---

### Task 4: Point the dashboard data layer at the session (RLS) client

**Files:** Modify `apps/web/src/lib/dashboard/data.ts`

- [ ] **Step 1:** Replace `import { getSupabaseServiceClient } from "@/lib/supabase/service"` with
  `import { createClient } from "@/lib/supabase/server"`, and in each query function replace
  `const supabase = getSupabaseServiceClient();` with `const supabase = await createClient();`.
- [ ] **Step 2:** Replace `getDashboardOrganization()` with a call to `getActiveOrganization()` from
  `@/lib/auth/organization` (delete the slug/env fallback and `DEFAULT_ORGANIZATION_SLUG`). RLS now scopes
  rows to the user's org automatically; the explicit `.eq("organization_id", org.id)` filters stay (correct + harmless).
- [ ] **Step 3: Build** → expect success.
- [ ] **Step 4: Manual verify** (after Task 5 seed): sign in → dashboard shows the demo org's real data; signing out → `/login`.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): dashboard reads via RLS session client scoped to the signed-in org"`

---

### Task 5: Seed the owner user + membership

**Files:** Create `apps/web/scripts/seed-owner-user.mjs`

- [ ] **Step 1:** Script uses the **service role** (admin) to: create (or fetch) an auth user by email,
  resolve the `demo-hvac-company` organization id, and upsert an `organization_members` row with role `owner`.

```js
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnv(f) {
  const o = {};
  if (!fs.existsSync(f)) return o;
  for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l);
    if (m) o[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return o;
}
const env = { ...loadEnv(path.join(process.cwd(), "apps/web/.env.local")), ...loadEnv(path.join(process.cwd(), ".env.local")) };
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const email = process.argv[2], password = process.argv[3];
if (!email || !password) { console.error("usage: node apps/web/scripts/seed-owner-user.mjs <email> <password>"); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: created, error: cErr } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
let userId = created?.user?.id;
if (cErr && /already/i.test(cErr.message)) {
  const { data: list } = await sb.auth.admin.listUsers();
  userId = list.users.find((u) => u.email === email)?.id;
}
if (!userId) { console.error("could not create/find user", cErr?.message); process.exit(1); }
const { data: org } = await sb.from("organizations").select("id").eq("slug", "demo-hvac-company").single();
const { error: mErr } = await sb.from("organization_members").upsert(
  { organization_id: org.id, user_id: userId, role: "owner" }, { onConflict: "organization_id,user_id" }
);
console.log(mErr ? `membership error: ${mErr.message}` : `seeded owner ${email} -> org ${org.id}`);
```

- [ ] **Step 2: Run** — `node apps/web/scripts/seed-owner-user.mjs todorov.ivailo.v@gmail.com '<chosen-password>'`
- [ ] **Step 3: Commit** the script (no secrets) — `git commit -m "chore(auth): add owner-user seed script"`

---

### Task 6: Sign-out control in the shell

**Files:** Modify `apps/web/src/components/app-shell.tsx`

- [ ] Add a small sign-out button wired to the `signOut` server action (import from `@/app/login/actions`),
  showing the signed-in email. Keep styling consistent with the existing shell. Build → commit.

---

## Self-Review

- **Spec coverage:** login (T2), session guard (T3), org-from-session (T1), RLS-scoped reads (T4), seed (T5), sign-out (T6).
- **No migration needed** — RLS/tables/policies pre-exist; verified in `001_initial_...sql`.
- **Risk / checkpoint:** Task 4 is the behavior-changing one (service→session client). After it, manually verify the dashboard still renders with the seeded login before deploying. Webhook/tools untouched (still service-role).
- **Decision to confirm:** email+password (default) vs magic-link. Everything else is settled.
- **Type consistency:** `getActiveOrganization()` returns `{id,name,slug,timezone}` — same shape `data.ts` already expects from `getDashboardOrganization()`, so call sites need no change beyond the swap.
