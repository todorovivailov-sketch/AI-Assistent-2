# Phase 8 — GDPR Data Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship tiered data retention (auto-anonymize old calls incl. Vapi recording deletion) plus an owner-facing Export + Erase panel for data-subject requests, so the product is GDPR-sellable without the business losing its working CRM.

**Architecture:** One pure module (`lib/gdpr/subject.ts`, TDD) holds phone normalization + the PII scrub/anonymize patches. One I/O engine (`lib/gdpr/engine.ts`) uses those patches to `gatherSubject` / `scrubSubject` / `anonymizeExpiredCalls`, accepting an injected Supabase client so the same code runs from the cron (service-role) and the panel (RLS). A tiny Vapi call-client deletes recordings. Retention hangs off the existing Phase 6 daily cron; the panel is a new `/privacy` page + server actions + a JSON export route handler.

**Tech Stack:** Next.js 16 (customized fork — mirror existing in-repo route handlers/server actions, do NOT invent new conventions), Supabase (RLS + service-role), Vapi REST, TypeScript. Tests via the repo's `scripts/test-*.mjs` transpile+data-URL harness.

**Spec:** `docs/superpowers/specs/2026-07-02-phase-8-gdpr-data-lifecycle-design.md`

**Project conventions (must follow):**
- Work directly on `main` (authorized; deploy = push to `main`).
- Migration `009` is applied **manually by the user** via Supabase SQL Editor — stop for confirmation at Task 9.
- `next build` tolerates 2 pre-existing unrelated `react/no-unescaped-entities` lint errors (`behavior-tab.tsx`, `reports/page.tsx`). New JSX Cyrillic with quotes/apostrophes goes in a `{"…"}` expression to avoid that rule.
- Never print secret env values.

---

## File Structure

**Create:**
- `supabase/migrations/009_gdpr_data_lifecycle.sql` — schema (calls.anonymized_at, organizations.recording_retention_days, gdpr_actions).
- `apps/web/src/lib/gdpr/subject.ts` — pure: normalizePhone, phoneMatchSuffix, *Patch() functions.
- `apps/web/src/lib/gdpr/engine.ts` — I/O: gatherSubject, scrubSubject, anonymizeExpiredCalls.
- `apps/web/src/lib/vapi/call-client.ts` — deleteVapiCall + vapiDeleteCallPath.
- `apps/web/scripts/test-gdpr.mjs` — unit tests for the pure module + path builder.
- `apps/web/src/app/(dashboard)/settings/retention-form.tsx` — retention-days form (client).
- `apps/web/src/app/(dashboard)/privacy/page.tsx` — panel page (server).
- `apps/web/src/app/(dashboard)/privacy/subject-panel.tsx` — panel form (client).
- `apps/web/src/app/(dashboard)/privacy/actions.ts` — lookupSubject, eraseSubject.
- `apps/web/src/app/api/privacy/export/route.ts` — JSON export route handler.

**Modify:**
- `apps/web/src/types/database.ts` — add calls.anonymized_at, organizations.recording_retention_days, gdpr_actions table.
- `apps/web/src/app/api/cron/reminders/route.ts` — add retention pass per org.
- `apps/web/src/app/(dashboard)/settings/actions.ts` — add updateRetentionDays.
- `apps/web/src/app/(dashboard)/settings/page.tsx` — load + render retention form.
- Navigation (wherever dashboard nav links live) — add a „Лични данни" entry pointing to `/privacy`.

---

## Task 1: Migration 009 + database types

**Files:**
- Create: `supabase/migrations/009_gdpr_data_lifecycle.sql`
- Modify: `apps/web/src/types/database.ts`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/009_gdpr_data_lifecycle.sql`:

```sql
begin;

-- Tier A anonymization marker on calls
alter table public.calls
  add column if not exists anonymized_at timestamptz;

-- Per-org Tier A retention window (days)
alter table public.organizations
  add column if not exists recording_retention_days integer not null default 90
    check (recording_retention_days between 1 and 3650);

-- Compliance audit trail
create table if not exists public.gdpr_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('export', 'erasure', 'retention_anonymize')),
  subject_phone text,
  performed_by uuid references auth.users(id) on delete set null,
  affected jsonb not null default '{}'::jsonb,
  vapi_deleted integer not null default 0,
  vapi_errors integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gdpr_actions_org_created_at_idx
  on public.gdpr_actions (organization_id, created_at desc);

alter table public.gdpr_actions enable row level security;

drop policy if exists "members can read gdpr actions" on public.gdpr_actions;
create policy "members can read gdpr actions"
on public.gdpr_actions for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "admins can insert gdpr actions" on public.gdpr_actions;
create policy "admins can insert gdpr actions"
on public.gdpr_actions for insert to authenticated
with check (public.is_org_admin(organization_id));

grant select, insert on public.gdpr_actions to authenticated;

commit;
```

- [ ] **Step 2: Update database types — organizations**

In `apps/web/src/types/database.ts`, in the `organizations` PublicTable, add `recording_retention_days` to BOTH the Row and Insert object (place next to `missed_call_sms_template`):

Row: add `recording_retention_days: number;`
Insert: add `recording_retention_days?: number;`

- [ ] **Step 3: Update database types — calls**

In the `calls` PublicTable, add to Row `anonymized_at: string | null;` and to Insert `anonymized_at?: string | null;` (place next to `ended_reason`).

- [ ] **Step 4: Add the gdpr_actions table type**

In `apps/web/src/types/database.ts`, add a new table entry inside `Tables` (after `notification_log`):

```ts
      gdpr_actions: PublicTable<
        {
          id: string;
          organization_id: string;
          action: string;
          subject_phone: string | null;
          performed_by: string | null;
          affected: Json;
          vapi_deleted: number;
          vapi_errors: number;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          action: string;
          subject_phone?: string | null;
          performed_by?: string | null;
          affected?: Json;
          vapi_deleted?: number;
          vapi_errors?: number;
          created_at?: string;
        }
      >;
```

- [ ] **Step 5: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/009_gdpr_data_lifecycle.sql apps/web/src/types/database.ts
git commit -m "feat(phase-8): migration 009 (retention + gdpr_actions) + types"
```

---

## Task 2: Pure GDPR module (TDD)

**Files:**
- Create: `apps/web/src/lib/gdpr/subject.ts`
- Create: `apps/web/scripts/test-gdpr.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-gdpr.mjs`:

```js
// Unit tests for pure GDPR helpers. Run (from apps/web): node ./scripts/test-gdpr.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts
    .transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
    })
    .outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

const {
  normalizePhone,
  phoneMatchSuffix,
  callAnonymizePatch,
  leadScrubPatch,
  appointmentScrubPatch,
  orderScrubPatch,
} = await loadModule(["src", "lib", "gdpr", "subject.ts"]);
const { vapiDeleteCallPath } = await loadModule(["src", "lib", "vapi", "call-client.ts"]);

// --- normalizePhone ---
assert.equal(normalizePhone("+359888123456"), "+359888123456", "already E.164");
assert.equal(normalizePhone("0888123456"), "+359888123456", "BG national 0-prefix");
assert.equal(normalizePhone("00359888123456"), "+359888123456", "00 prefix");
assert.equal(normalizePhone("359888123456"), "+359888123456", "bare country code");
assert.equal(normalizePhone("+359 888 123 456"), "+359888123456", "spaces stripped");
assert.equal(normalizePhone("088-812-3456"), "+359888123456", "dashes stripped");
assert.equal(normalizePhone(""), null, "empty -> null");
assert.equal(normalizePhone(null), null, "null -> null");
assert.equal(normalizePhone("888123456"), null, "ambiguous 9-digit -> null (conservative)");

// --- phoneMatchSuffix ---
assert.equal(phoneMatchSuffix("+359888123456"), "88123456", "last 8 digits");

// --- callAnonymizePatch ---
const cp = callAnonymizePatch("2026-07-02T10:00:00.000Z");
assert.equal(cp.caller_number, null);
assert.equal(cp.transcript, null);
assert.equal(cp.recording_url, null);
assert.equal(cp.summary, null);
assert.deepEqual(cp.structured_data, {});
assert.deepEqual(cp.raw_payload, {});
assert.equal(cp.anonymized_at, "2026-07-02T10:00:00.000Z");
assert.ok(!("duration_seconds" in cp), "keeps stats untouched (not in patch)");
assert.ok(!("disposition" in cp), "keeps disposition untouched (not in patch)");

// --- leadScrubPatch ---
const lp = leadScrubPatch();
for (const k of ["name", "phone", "email", "address", "preferred_time_text", "ai_summary", "notes"]) {
  assert.equal(lp[k], null, `lead ${k} cleared`);
}
assert.ok(!("city" in lp), "lead city kept");
assert.ok(!("service_type" in lp), "lead service_type kept");

// --- appointmentScrubPatch ---
const ap = appointmentScrubPatch();
for (const k of ["customer_name", "customer_phone", "location", "notes"]) {
  assert.equal(ap[k], null, `appt ${k} cleared`);
}
assert.equal(ap.title, "Анонимизиран запис", "appt title genericized (NOT NULL column)");

// --- orderScrubPatch ---
const op = orderScrubPatch();
assert.equal(op.description, null);
assert.equal(op.notes, null);

// --- vapiDeleteCallPath ---
assert.equal(vapiDeleteCallPath("abc123"), "/call/abc123", "delete path");
assert.equal(vapiDeleteCallPath("a b"), "/call/a%20b", "encodes id");

console.log("gdpr: all tests passed");
```

- [ ] **Step 2: Run to confirm it fails**

Run (from `apps/web`): `node ./scripts/test-gdpr.mjs`
Expected: FAIL with `Missing module: …/src/lib/gdpr/subject.ts` (and call-client not yet present).

- [ ] **Step 3: Implement the pure module**

Create `apps/web/src/lib/gdpr/subject.ts`:

```ts
// Pure GDPR helpers: phone normalization + the exact column patches used to
// anonymize/scrub PII. No I/O — unit-tested via scripts/test-gdpr.mjs.

/** Normalize a raw phone to E.164 for BG, else null. Conservative: refuses ambiguous input. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hasPlus = String(raw).trim().startsWith("+");
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) {
    // already international; digits holds the country code onward
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 10) {
    digits = "359" + digits.slice(1); // BG national mobile 0XXXXXXXXX
  } else if (digits.startsWith("359")) {
    // bare country code without +
  } else {
    return null; // cannot confidently normalize
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}

/** Trailing 8 digits — cheap SQL `ilike '%<suffix>'` prefilter before a JS normalized-equal check. */
export function phoneMatchSuffix(e164: string): string {
  return e164.replace(/\D/g, "").slice(-8);
}

/** calls: clear raw/PII, keep aggregate stats. Used by retention AND erasure. */
export function callAnonymizePatch(anonymizedAtIso: string) {
  return {
    caller_number: null,
    transcript: null,
    recording_url: null,
    summary: null,
    structured_data: {},
    raw_payload: {},
    anonymized_at: anonymizedAtIso,
  };
}

/** leads: clear direct identifiers, keep non-identifying fields (city/service_type/status). */
export function leadScrubPatch() {
  return {
    name: null,
    phone: null,
    email: null,
    address: null,
    preferred_time_text: null,
    ai_summary: null,
    notes: null,
  };
}

/** appointments: clear identifiers; title is NOT NULL so genericize it. */
export function appointmentScrubPatch() {
  return {
    customer_name: null,
    customer_phone: null,
    location: null,
    notes: null,
    title: "Анонимизиран запис",
  };
}

/** orders: clear free-text that may carry PII. */
export function orderScrubPatch() {
  return { description: null, notes: null };
}
```

- [ ] **Step 4: Run tests (call-client still missing → still fails)**

Run (from `apps/web`): `node ./scripts/test-gdpr.mjs`
Expected: FAIL with `Missing module: …/src/lib/vapi/call-client.ts`. (subject.ts asserts now pass; the loader for call-client throws.) This is fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/gdpr/subject.ts apps/web/scripts/test-gdpr.mjs
git commit -m "feat(phase-8): pure gdpr subject module + tests"
```

---

## Task 3: Vapi call-client (deleteVapiCall)

**Files:**
- Create: `apps/web/src/lib/vapi/call-client.ts`

- [ ] **Step 1: Implement the client**

Create `apps/web/src/lib/vapi/call-client.ts`:

```ts
// Vapi call deletion. Server-only (reads VAPI_PRIVATE_KEY / VAPI_API_KEY).
// DELETE /call/{id} removes the call record incl. its recording on Vapi.
const VAPI_BASE = "https://api.vapi.ai";

function vapiKey(): string {
  const key = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY;
  if (!key) throw new Error("VAPI key missing");
  return key;
}

/** Pure path builder (unit-tested). */
export function vapiDeleteCallPath(vapiCallId: string): string {
  return `/call/${encodeURIComponent(vapiCallId)}`;
}

/** Best-effort delete. Returns true on 2xx, false on any error — never throws. */
export async function deleteVapiCall(vapiCallId: string): Promise<boolean> {
  if (!vapiCallId) return false;
  try {
    const res = await fetch(`${VAPI_BASE}${vapiDeleteCallPath(vapiCallId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${vapiKey()}` },
    });
    return res.status < 300;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Run the pure tests to green**

Run (from `apps/web`): `node ./scripts/test-gdpr.mjs`
Expected: PASS — prints `gdpr: all tests passed`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/vapi/call-client.ts
git commit -m "feat(phase-8): vapi call-client deleteVapiCall"
```

---

## Task 4: GDPR engine (I/O)

**Files:**
- Create: `apps/web/src/lib/gdpr/engine.ts`

- [ ] **Step 1: Implement the engine**

Create `apps/web/src/lib/gdpr/engine.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { deleteVapiCall } from "@/lib/vapi/call-client";
import {
  appointmentScrubPatch,
  callAnonymizePatch,
  leadScrubPatch,
  normalizePhone,
  orderScrubPatch,
  phoneMatchSuffix,
} from "./subject";

type Client = SupabaseClient<Database>;

export type SubjectExport = {
  phone: string;
  calls: unknown[];
  leads: unknown[];
  appointments: unknown[];
  notifications: unknown[];
};

export type ScrubResult = {
  ok: boolean;
  phone: string | null;
  affected: Record<string, number>;
  vapiDeleted: number;
  vapiErrors: number;
};

/** Collect everything we hold on a caller (for access/export + panel preview). */
export async function gatherSubject(
  supabase: Client,
  orgId: string,
  rawPhone: string
): Promise<SubjectExport | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const like = `%${phoneMatchSuffix(phone)}`;
  const eq = (v: string | null) => normalizePhone(v) === phone;

  const [callsRes, leadsRes, apptsRes, notifRes] = await Promise.all([
    supabase
      .from("calls")
      .select(
        "id,caller_number,direction,status,disposition,started_at,ended_at,duration_seconds,summary,transcript,anonymized_at,created_at"
      )
      .eq("organization_id", orgId)
      .ilike("caller_number", like),
    supabase
      .from("leads")
      .select("id,name,phone,email,city,address,service_type,status,ai_summary,notes,created_at")
      .eq("organization_id", orgId)
      .ilike("phone", like),
    supabase
      .from("appointments")
      .select(
        "id,customer_name,customer_phone,title,status,starts_at,ends_at,service_type,location,notes,created_at"
      )
      .eq("organization_id", orgId)
      .ilike("customer_phone", like),
    supabase
      .from("notification_log")
      .select("id,channel,kind,destination,status,created_at")
      .eq("organization_id", orgId)
      .ilike("destination", like),
  ]);

  return {
    phone,
    calls: (callsRes.data ?? []).filter((r) => eq(r.caller_number)),
    leads: (leadsRes.data ?? []).filter((r) => eq(r.phone)),
    appointments: (apptsRes.data ?? []).filter((r) => eq(r.customer_phone)),
    notifications: (notifRes.data ?? []).filter((r) => eq(r.destination)),
  };
}

/** Erasure: scrub a caller everywhere + delete their calls at Vapi + audit row. */
export async function scrubSubject(
  supabase: Client,
  orgId: string,
  rawPhone: string,
  performedBy: string | null
): Promise<ScrubResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, phone: null, affected: {}, vapiDeleted: 0, vapiErrors: 0 };
  const like = `%${phoneMatchSuffix(phone)}`;
  const eq = (v: string | null) => normalizePhone(v) === phone;
  const nowIso = new Date().toISOString();
  const affected: Record<string, number> = {};
  let vapiDeleted = 0;
  let vapiErrors = 0;

  // calls -> delete at Vapi, then anonymize
  const { data: callRows } = await supabase
    .from("calls")
    .select("id,vapi_call_id,caller_number")
    .eq("organization_id", orgId)
    .ilike("caller_number", like);
  const calls = (callRows ?? []).filter((r) => eq(r.caller_number));
  for (const c of calls) {
    if (c.vapi_call_id) {
      (await deleteVapiCall(c.vapi_call_id)) ? (vapiDeleted += 1) : (vapiErrors += 1);
    }
  }
  if (calls.length) {
    await supabase.from("calls").update(callAnonymizePatch(nowIso)).in("id", calls.map((c) => c.id));
  }
  affected.calls = calls.length;

  // leads (+ linked orders)
  const { data: leadRows } = await supabase
    .from("leads")
    .select("id,phone")
    .eq("organization_id", orgId)
    .ilike("phone", like);
  const leads = (leadRows ?? []).filter((r) => eq(r.phone));
  if (leads.length) {
    const leadIds = leads.map((l) => l.id);
    await supabase.from("leads").update(leadScrubPatch()).in("id", leadIds);
    await supabase.from("orders").update(orderScrubPatch()).in("lead_id", leadIds);
  }
  affected.leads = leads.length;

  // appointments
  const { data: apptRows } = await supabase
    .from("appointments")
    .select("id,customer_phone")
    .eq("organization_id", orgId)
    .ilike("customer_phone", like);
  const appts = (apptRows ?? []).filter((r) => eq(r.customer_phone));
  if (appts.length) {
    await supabase.from("appointments").update(appointmentScrubPatch()).in("id", appts.map((a) => a.id));
  }
  affected.appointments = appts.length;

  // notification_log -> delete
  const { data: notifRows } = await supabase
    .from("notification_log")
    .select("id,destination")
    .eq("organization_id", orgId)
    .ilike("destination", like);
  const notifs = (notifRows ?? []).filter((r) => eq(r.destination));
  if (notifs.length) {
    await supabase.from("notification_log").delete().in("id", notifs.map((n) => n.id));
  }
  affected.notifications = notifs.length;

  await supabase.from("gdpr_actions").insert({
    organization_id: orgId,
    action: "erasure",
    subject_phone: phone,
    performed_by: performedBy,
    affected,
    vapi_deleted: vapiDeleted,
    vapi_errors: vapiErrors,
  });

  return { ok: true, phone, affected, vapiDeleted, vapiErrors };
}

/** Retention (Tier A): anonymize expired calls + purge expired raw logs. Idempotent via anonymized_at. */
export async function anonymizeExpiredCalls(
  supabase: Client,
  org: { id: string; recording_retention_days: number }
): Promise<{ affected: Record<string, number>; vapiDeleted: number; vapiErrors: number }> {
  const cutoffIso = new Date(Date.now() - org.recording_retention_days * 86400000).toISOString();
  const nowIso = new Date().toISOString();
  const affected: Record<string, number> = {};
  let vapiDeleted = 0;
  let vapiErrors = 0;

  const { data: callRows } = await supabase
    .from("calls")
    .select("id,vapi_call_id")
    .eq("organization_id", org.id)
    .is("anonymized_at", null)
    .lt("created_at", cutoffIso);
  const calls = callRows ?? [];
  for (const c of calls) {
    if (c.vapi_call_id) {
      (await deleteVapiCall(c.vapi_call_id)) ? (vapiDeleted += 1) : (vapiErrors += 1);
    }
  }
  if (calls.length) {
    await supabase.from("calls").update(callAnonymizePatch(nowIso)).in("id", calls.map((c) => c.id));
  }
  affected.calls = calls.length;

  const we = await supabase
    .from("webhook_events")
    .delete()
    .eq("organization_id", org.id)
    .lt("received_at", cutoffIso)
    .select("id");
  affected.webhook_events = we.data?.length ?? 0;

  const nl = await supabase
    .from("notification_log")
    .delete()
    .eq("organization_id", org.id)
    .lt("created_at", cutoffIso)
    .select("id");
  affected.notification_log = nl.data?.length ?? 0;

  const on = await supabase
    .from("owner_notifications")
    .delete()
    .eq("organization_id", org.id)
    .lt("created_at", cutoffIso)
    .select("id");
  affected.owner_notifications = on.data?.length ?? 0;

  const touched =
    calls.length + affected.webhook_events + affected.notification_log + affected.owner_notifications;
  if (touched > 0) {
    await supabase.from("gdpr_actions").insert({
      organization_id: org.id,
      action: "retention_anonymize",
      subject_phone: null,
      performed_by: null,
      affected,
      vapi_deleted: vapiDeleted,
      vapi_errors: vapiErrors,
    });
  }

  return { affected, vapiDeleted, vapiErrors };
}
```

- [ ] **Step 2: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: PASS. If `.update(...)` complains about the patch shape, wrap the return of each `*Patch()` with `satisfies Database["public"]["Tables"]["<t>"]["Update"]` in `subject.ts` — do NOT change the runtime values.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/gdpr/engine.ts apps/web/src/lib/gdpr/subject.ts
git commit -m "feat(phase-8): gdpr engine (gather/scrub/anonymize)"
```

---

## Task 5: Retention pass on the daily cron

**Files:**
- Modify: `apps/web/src/app/api/cron/reminders/route.ts`

- [ ] **Step 1: Import the engine**

Add near the other imports:

```ts
import { anonymizeExpiredCalls } from "@/lib/gdpr/engine";
```

- [ ] **Step 2: Widen the org type + select**

Change the `OrgRow` type to include the retention column:

```ts
type OrgRow = {
  id: string;
  name: string;
  owner_phone: string | null;
  billing_email: string | null;
  recording_retention_days: number;
};
```

Change the org select string from `"id,name,owner_phone,billing_email"` to:

```ts
    .select("id,name,owner_phone,billing_email,recording_retention_days")
```

- [ ] **Step 3: Run retention inside processOrg**

In `processOrg`, immediately before the final `return {` statement, add:

```ts
  let retention: { affected: Record<string, number>; vapiDeleted: number; vapiErrors: number } | null = null;
  if (!dryRun) {
    try {
      retention = await anonymizeExpiredCalls(supabase, {
        id: org.id,
        recording_retention_days: org.recording_retention_days,
      });
    } catch {
      retention = null;
    }
  }
```

Then add `retention,` to the returned object (next to `agenda`).

- [ ] **Step 4: Typecheck + build**

Run (from `apps/web`): `npx tsc --noEmit && npx next build`
Expected: PASS (2 pre-existing unrelated lint errors tolerated).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/cron/reminders/route.ts
git commit -m "feat(phase-8): retention pass on the daily cron"
```

---

## Task 6: Settings — retention-days field

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/actions.ts`
- Create: `apps/web/src/app/(dashboard)/settings/retention-form.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add the server action**

In `apps/web/src/app/(dashboard)/settings/actions.ts`, append:

```ts
export async function updateRetentionDays(formData: FormData): Promise<ActionResult> {
  const org = await getActiveOrganization();
  if (!org) return { ok: false, error: "no_org" };
  const supabase = await createClient();

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) return { ok: false, error: "not_admin" };

  const days = Number((formData.get("days") as string | null)?.trim());
  if (!Number.isFinite(days) || days < 1 || days > 3650) return { ok: false, error: "bad_days" };

  const { error } = await supabase
    .from("organizations")
    .update({ recording_retention_days: Math.round(days) })
    .eq("id", org.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
```

- [ ] **Step 2: Create the client form**

Create `apps/web/src/app/(dashboard)/settings/retention-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { updateRetentionDays } from "./actions";

const ERRORS: Record<string, string> = {
  no_org: "Няма активна организация.",
  not_admin: "Нужни са права на администратор.",
  bad_days: "Въведи брой дни между 1 и 3650.",
};

export function RetentionForm({ days }: { days: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateRetentionDays(formData);
      if (!result.ok) setError(ERRORS[result.error] ?? result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="syn-card min-w-0 p-5 flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold">Пазене на записи и транскрипти</div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {"След този брой дни записът, транскриптът и суровите данни на обажданията се анонимизират автоматично (статистиката за ROI остава). Клиентските контакти не се трият."}
        </p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Дни</span>
        <input
          type="number"
          name="days"
          min={1}
          max={3650}
          defaultValue={days}
          className="w-40 rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-strong)]"
        />
      </label>
      <div className="flex items-center justify-end gap-3">
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
        {saved && !error ? (
          <span className="text-sm font-medium text-[var(--accent-strong)]">Записано ✓</span>
        ) : null}
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60"
        >
          {isPending ? "Записва…" : "Запази"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Wire it into the settings page**

In `apps/web/src/app/(dashboard)/settings/page.tsx`:

Add the import:
```tsx
import { RetentionForm } from "./retention-form";
```

Extend the org select to also read the retention column and default it:
```tsx
    const { data } = await supabase
      .from("organizations")
      .select("missed_call_sms_enabled, missed_call_sms_template, recording_retention_days")
      .eq("id", org.id)
      .maybeSingle();
    missedEnabled = data?.missed_call_sms_enabled ?? false;
    missedTemplate = data?.missed_call_sms_template ?? "";
    retentionDays = data?.recording_retention_days ?? 90;
```

Declare the variable next to the other defaults:
```tsx
  let retentionDays = 90;
```

Render `<RetentionForm>` inside the existing 2-col section (alongside `<MissedCallForm>`):
```tsx
        <RetentionForm days={retentionDays} />
```

- [ ] **Step 4: Typecheck + build**

Run (from `apps/web`): `npx tsc --noEmit && npx next build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/settings/actions.ts apps/web/src/app/\(dashboard\)/settings/retention-form.tsx apps/web/src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat(phase-8): settings retention-days control"
```

---

## Task 7: Privacy panel (page + form + actions)

**Files:**
- Create: `apps/web/src/app/(dashboard)/privacy/actions.ts`
- Create: `apps/web/src/app/(dashboard)/privacy/subject-panel.tsx`
- Create: `apps/web/src/app/(dashboard)/privacy/page.tsx`
- Modify: dashboard navigation (add „Лични данни" → `/privacy`)

- [ ] **Step 1: Server actions**

Create `apps/web/src/app/(dashboard)/privacy/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import { gatherSubject, scrubSubject } from "@/lib/gdpr/engine";
import { createClient } from "@/lib/supabase/server";

export type LookupResult =
  | { ok: true; phone: string; counts: { calls: number; leads: number; appointments: number; notifications: number } }
  | { ok: false; error: string };

export type EraseResult =
  | { ok: true; phone: string; affected: Record<string, number>; vapiDeleted: number; vapiErrors: number }
  | { ok: false; error: string };

async function requireAdmin() {
  const org = await getActiveOrganization();
  if (!org) return { error: "no_org" as const };
  const supabase = await createClient();
  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) return { error: "not_admin" as const };
  return { org, supabase };
}

export async function lookupSubject(phone: string): Promise<LookupResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const data = await gatherSubject(ctx.supabase, ctx.org.id, phone);
  if (!data) return { ok: false, error: "bad_phone" };
  return {
    ok: true,
    phone: data.phone,
    counts: {
      calls: data.calls.length,
      leads: data.leads.length,
      appointments: data.appointments.length,
      notifications: data.notifications.length,
    },
  };
}

export async function eraseSubject(phone: string): Promise<EraseResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  const res = await scrubSubject(ctx.supabase, ctx.org.id, phone, user?.id ?? null);
  if (!res.ok || !res.phone) return { ok: false, error: "bad_phone" };
  revalidatePath("/privacy");
  return { ok: true, phone: res.phone, affected: res.affected, vapiDeleted: res.vapiDeleted, vapiErrors: res.vapiErrors };
}
```

- [ ] **Step 2: Client panel**

Create `apps/web/src/app/(dashboard)/privacy/subject-panel.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { eraseSubject, lookupSubject, type LookupResult } from "./actions";

const ERRORS: Record<string, string> = {
  no_org: "Няма активна организация.",
  not_admin: "Нужни са права на администратор.",
  bad_phone: "Невалиден или непознат телефон.",
};

export function SubjectPanel() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<Extract<LookupResult, { ok: true }> | null>(null);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function check() {
    setError(null);
    setMsg(null);
    setFound(null);
    startTransition(async () => {
      const r = await lookupSubject(phone);
      if (!r.ok) setError(ERRORS[r.error] ?? r.error);
      else setFound(r);
    });
  }

  function erase() {
    if (!found) return;
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const r = await eraseSubject(found.phone);
      if (!r.ok) setError(ERRORS[r.error] ?? r.error);
      else {
        const n = Object.values(r.affected).reduce((a, b) => a + b, 0);
        setMsg(`Изтрито за ${r.phone}: ${n} записа (Vapi: ${r.vapiDeleted} изтрити, ${r.vapiErrors} грешки).`);
        setFound(null);
        setConfirm("");
        setPhone("");
        router.refresh();
      }
    });
  }

  const canErase = found && confirm.trim() === found.phone;

  return (
    <div className="syn-card min-w-0 p-5 flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold">Търсене по телефон</div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {"Въведи телефон, за да видиш какви лични данни пазим за този човек, да ги изтеглиш или изтриеш."}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink-soft)]">Телефон</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+359888123456"
            className="w-56 rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-strong)]"
          />
        </label>
        <button
          type="button"
          onClick={check}
          disabled={isPending || !phone.trim()}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--surface-soft)] px-5 text-sm font-semibold transition hover:brightness-95 disabled:opacity-60"
        >
          {isPending ? "Проверява…" : "Провери"}
        </button>
      </div>

      {found ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] p-4">
          <div className="text-sm">
            За <span className="font-mono">{found.phone}</span>: обаждания {found.counts.calls} · лийдове{" "}
            {found.counts.leads} · записи {found.counts.appointments} · известия {found.counts.notifications}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <a
              href={`/api/privacy/export?phone=${encodeURIComponent(found.phone)}`}
              className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95"
            >
              Изтегли данните (JSON)
            </a>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--ink-soft)]">
                За изтриване напиши телефона отново
              </span>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={found.phone}
                className="w-56 rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </label>
            <button
              type="button"
              onClick={erase}
              disabled={isPending || !canErase}
              className="inline-flex h-10 items-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {isPending ? "Изтрива…" : "Изтрий клиента"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <span className="text-sm text-red-600">{error}</span> : null}
      {msg ? <span className="text-sm font-medium text-[var(--accent-strong)]">{msg}</span> : null}
    </div>
  );
}
```

- [ ] **Step 3: Page (with recent audit log)**

Create `apps/web/src/app/(dashboard)/privacy/page.tsx`:

```tsx
import { PageHeader } from "@/components/page-header";
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";

import { SubjectPanel } from "./subject-panel";

export default async function PrivacyPage() {
  const org = await getActiveOrganization();
  let actions: Array<{
    id: string;
    action: string;
    subject_phone: string | null;
    affected: Record<string, number> | null;
    created_at: string;
  }> = [];
  if (org) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("gdpr_actions")
      .select("id,action,subject_phone,affected,created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20);
    actions = (data ?? []) as typeof actions;
  }

  const LABELS: Record<string, string> = {
    export: "Експорт",
    erasure: "Изтриване",
    retention_anonymize: "Авто-анонимизиране",
  };

  return (
    <>
      <PageHeader eyebrow="GDPR" title="Лични данни" />
      <section className="grid min-w-0 gap-3 lg:grid-cols-2">
        <SubjectPanel />
      </section>
      <section className="mt-6 syn-card min-w-0 p-5">
        <div className="text-sm font-semibold">Дневник на действията</div>
        {actions.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Няма записани действия.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {actions.map((a) => {
              const n = a.affected ? Object.values(a.affected).reduce((x, y) => x + Number(y || 0), 0) : 0;
              return (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] pb-2">
                  <span>
                    <span className="font-medium">{LABELS[a.action] ?? a.action}</span>
                    {a.subject_phone ? <span className="font-mono"> · {a.subject_phone}</span> : null}
                    <span className="text-[var(--ink-soft)]"> · {n} записа</span>
                  </span>
                  <span className="text-[var(--ink-muted)]">
                    {new Date(a.created_at).toLocaleString("bg-BG")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Add nav entry**

Find the dashboard navigation list (search: `grep -rn "Настройки" apps/web/src` to find where Settings is linked). Add an entry linking to `/privacy` labeled „Лични данни" matching the existing item shape (icon optional — reuse an existing lucide import such as `ShieldCheck`). Match the surrounding code exactly.

- [ ] **Step 5: Typecheck + build**

Run (from `apps/web`): `npx tsc --noEmit && npx next build`
Expected: PASS. Fix any `no-unescaped-entities` by moving Cyrillic-with-quotes into `{"…"}`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/privacy
git commit -m "feat(phase-8): privacy panel (lookup + export + erase + audit)"
```

---

## Task 8: Export route handler

**Files:**
- Create: `apps/web/src/app/api/privacy/export/route.ts`

- [ ] **Step 1: Read the existing CSV export route for the exact Response pattern**

Run: `grep -rn "Content-Disposition" apps/web/src/app/api` to find the Phase 5 export route; open it and match how this fork constructs a downloadable Response.

- [ ] **Step 2: Implement the route**

Create `apps/web/src/app/api/privacy/export/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getActiveOrganization } from "@/lib/auth/organization";
import { gatherSubject } from "@/lib/gdpr/engine";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const org = await getActiveOrganization();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 401 });

  const supabase = await createClient();
  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  const phone = new URL(request.url).searchParams.get("phone") ?? "";
  const data = await gatherSubject(supabase, org.id, phone);
  if (!data) return NextResponse.json({ error: "bad_phone" }, { status: 400 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("gdpr_actions").insert({
    organization_id: org.id,
    action: "export",
    subject_phone: data.phone,
    performed_by: user?.id ?? null,
    affected: {
      calls: data.calls.length,
      leads: data.leads.length,
      appointments: data.appointments.length,
      notifications: data.notifications.length,
    },
  });

  const filename = `subject-${data.phone.replace(/[^0-9]/g, "")}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 3: Typecheck + build**

Run (from `apps/web`): `npx tsc --noEmit && npx next build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/privacy/export/route.ts
git commit -m "feat(phase-8): data-subject JSON export route"
```

---

## Task 9: Apply migration, E2E verify, deploy

**Files:** none (ops task).

- [ ] **Step 1: Full local test + build gate**

Run (from `apps/web`):
```bash
node ./scripts/test-gdpr.mjs && npx tsc --noEmit && npx next build
```
Expected: gdpr tests pass; tsc clean; build succeeds (2 pre-existing unrelated lint errors tolerated).

- [ ] **Step 2: Hand the migration to the user**

STOP. Ask the user to apply `supabase/migrations/009_gdpr_data_lifecycle.sql` in the Supabase SQL Editor and confirm success. Do not proceed until confirmed (deploy going through ≠ migration applied).

- [ ] **Step 3: Deploy**

```bash
git push origin main
```
Then verify the deploy is live (health check on an existing endpoint / Vercel dashboard).

- [ ] **Step 4: Live E2E — retention**

With the user: temporarily set that org's „Пазене" to `1` day in Настройки (or run the cron with a tiny window against a test org), ensure at least one call row is older than the cutoff, then hit the cron endpoint with the `CRON_SECRET` (`GET /api/cron/reminders` with the Bearer header). Confirm: the old call row has `anonymized_at` set and PII columns cleared; ROI/Reports still show its stats; the Vapi recording is gone; a `retention_anonymize` row exists in `gdpr_actions`. Restore the retention value afterwards.

- [ ] **Step 5: Live E2E — export + erase**

In `/privacy`: enter a real test caller's phone → **Провери** shows non-zero counts → **Изтегли данните** downloads a JSON with that person's records → type the phone to confirm → **Изтрий клиента**. Confirm the leads/appointments/calls for that phone are scrubbed, an `erasure` row exists in `gdpr_actions`, and a re-lookup shows zeros.

- [ ] **Step 6: Update memory**

Add `phase-8-gdpr.md` to auto-memory (type: project) capturing: tiered model, migration 009, the `lib/gdpr` module, retention on the reminders cron, the `/privacy` panel, known limitations (§15 of the spec), Vapi `DELETE /call` caveat + result, deploy SHA. Add the index line to `MEMORY.md`. Update `world-class-roadmap.md` (Phase 8 slice 1 shipped) and add a `[[phase-8-gdpr]]` link.

---

## Self-Review (completed against the spec)

- **Spec coverage:** tiered retention (§3 → T1/T4/T5), PII map (§5 → T2/T4), core module (§6 → T2/T3/T4), retention cron (§7 → T5), panel + export/erase (§8 → T7/T8), Vapi delete (§9 → T3), audit log (§10 → T1/T4/T7/T8), settings field (§11 → T6), authz (§12 → T6/T7/T8), testing (§13 → T2/T9). ✅
- **Placeholder scan:** no TBD/TODO; all code blocks complete. Nav edit (T7-S4) and CSV-pattern cross-check (T8-S1) are explicit "find X and match it" steps, not placeholders. ✅
- **Type consistency:** `callAnonymizePatch(iso)` signature identical in T2 (def), T4 (calls), T2 test. `anonymizeExpiredCalls(supabase, {id, recording_retention_days})` identical in T4 (def) and T5 (call). `gatherSubject`/`scrubSubject` signatures match across T4/T7/T8. `ActionResult` reused from existing `settings/actions.ts`. ✅
- **Known deferrals (spec §15):** per-subject erasure does not target `webhook_events`/`owner_notifications` JSON — covered by the retention timer; documented, acceptable for slice 1.
