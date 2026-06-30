# Phase 3 — CRM Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or
> subagent-driven-development). Steps use `- [ ]` checkboxes. Work directly on `main` (project policy,
> user-authorized). **Before writing any Next.js code, read the relevant guide in
> `apps/web/node_modules/next/dist/docs/`** — per `apps/web/AGENTS.md` this is a customized Next.js
> (server actions, `revalidatePath`, route handlers may differ from training data).

**Goal:** Make the dashboard *do work*, not just display it: surface the captured `leads` for the first
time with an editable pipeline (status + notes), let the operator reschedule/edit appointments and create
leads & appointments by hand — all via the authenticated, RLS-scoped session client.

**Key finding (drives the whole phase):** The `leads` table is written by the Vapi webhook on every call
but is **invisible in the UI** — `/leads` is a redirect stub to `/customers`, and `/customers` renders
*derived contacts* (aggregated from calls+appointments by phone) that have **no persistent row** to hang a
status or note on. So "lead pipeline status changes + notes" requires building a real leads view backed by
the `leads` table. **No schema migration is needed:** `leads` and `appointments` already have `status`,
`notes`, and member `insert`/`update` RLS policies + grants
(`supabase/migrations/001_initial_ai_receptionist_schema.sql:455-475, 518`).

**Architecture:**
- **Reads** extend the existing data layer (`lib/dashboard/data.ts`, RLS `createClient()`): add
  `getLeadsData()`.
- **Writes** are **Server Actions** using the RLS session client (members can insert/update leads &
  appointments) — *not* new service-role API routes. This matches Phase 2's security model: the DB
  enforces org-scoping; the action never trusts a client-supplied `organization_id`.
- **Pure logic** (status whitelists, FormData→row mapping, time validation) is extracted into
  `lib/crm/*` and unit-tested with the established `ts.transpileModule` data-URL pattern.
- **Google Calendar:** reschedule writes back to GCal when the appointment has a
  `google_calendar_event_id` (new `updateGoogleCalendarEvent` helper; safe no-op when GCal is
  unconfigured). Prevents the GCal→DB sync from reverting dashboard edits.

**Tech Stack:** Next.js 16 (App Router, Server Components, **Server Actions**, `revalidatePath`),
`@supabase/ssr` session client, existing Supabase Postgres + RLS, existing `lib/google/calendar.ts`.

---

## Decisions (defaults — flag if you disagree)

- **D1 — Leads get their own view.** New `/leads` page (replaces the redirect stub) + nav item
  **"Запитвания"**, backed by the `leads` table. `/customers` (derived contacts) stays as-is. *Alt: merge
  the two later if the overlap feels redundant.*
- **D2 — Mutations via Server Actions + RLS**, not service-role routes. More secure, consistent with
  Phase 2.
- **D3 — Reschedule/edit = `UPDATE appointments`.** The existing hard-delete cancel route
  (`/api/appointments/[id]/cancel`) is **left untouched** this phase. *Follow-up: soft-cancel
  (`status='cancelled'`) + GCal delete.*
- **D4 — GCal write-back on reschedule** when `google_calendar_event_id` is present (needed so the
  GCal→DB sync doesn't revert edits). No-ops when GCal is off.
- **D5 — Staff assignment DEFERRED (YAGNI).** No `assigned_to` column exists; the org has exactly one
  member (the solo owner), so assignment delivers zero value until there's a 2nd user. Add it (migration
  + member picker) when a multi-user client is onboarded.

---

## File Structure

- Modify: `apps/web/src/lib/dashboard/data.ts` — add `DashboardLeadListItem` type + `getLeadsData()` (RLS read).
- Create: `apps/web/src/lib/crm/lead-form.ts` — pure: `LEAD_STATUSES`, `parseLeadStatus()`, `buildLeadInsertFromForm()`.
- Create: `apps/web/src/lib/crm/appointment-form.ts` — pure: `APPOINTMENT_STATUSES`, `parseAppointmentTimes()`, `buildAppointmentValuesFromForm()`.
- Create: `apps/web/src/app/(dashboard)/leads/actions.ts` — `updateLeadStatus`, `updateLeadNotes`, `createLead` (Server Actions).
- Modify: `apps/web/src/app/(dashboard)/leads/page.tsx` — replace redirect with the real leads page (Server Component).
- Create: `apps/web/src/app/(dashboard)/leads/leads-board.tsx` — client island: status `<select>`, notes editor, "New lead" dialog.
- Create: `apps/web/src/app/(dashboard)/appointments/actions.ts` — `updateAppointment`, `createAppointment` (Server Actions).
- Modify: `apps/web/src/lib/google/calendar.ts` — add `updateGoogleCalendarEvent()`.
- Modify: `apps/web/src/components/appointment-drawer.tsx` — replace the `handleRescheduleAlert()` stub with a real edit form.
- Modify: `apps/web/src/components/app-shell.tsx` — add `/leads` nav item + `routeMeta`.
- Modify: `apps/web/src/components/status-badge.tsx` — add lead-status labels/tones (`qualified`, `booked`, `quoted`, `won`, `lost`).
- Test: `apps/web/scripts/test-lead-form.mjs`, `apps/web/scripts/test-appointment-form.mjs` — pure-logic unit tests.
- Test: `apps/web/scripts/verify-crm-writes.mjs` — end-to-end RLS insert/update check (sign in as user; service-role cleanup).

---

### Task 1: Leads read — data layer

**Files:**
- Modify: `apps/web/src/lib/dashboard/data.ts`

The file already exposes the RLS `createClient()`, `getDashboardOrganization()`, and dashboard list types.
Mirror the existing `DashboardAppointmentListItem` + query patterns.

- [ ] **Step 1: Add the list type** (near the other `Dashboard*ListItem` types):

```ts
export type DashboardLeadListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  serviceType: string | null;
  urgency: string | null;
  status: string;
  source: string;
  notes: string | null;
  aiSummary: string | null;
  preferredTimeText: string | null;
  createdAt: string;
};
```

- [ ] **Step 2: Add `getLeadsData()`** (mirror `getCalendarPageAppointments` — resolve org via
  `getDashboardOrganization()`, query with the RLS client, map rows). Order newest first; cap at 200.

```ts
const LEAD_COLUMNS =
  "id, name, phone, email, city, service_type, urgency, status, source, notes, ai_summary, preferred_time_text, created_at";

export async function getLeadsData(limit = 200): Promise<DashboardLeadListItem[]> {
  const organization = await getDashboardOrganization();
  if (!organization) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getLeadsData error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? "Без име",
    phone: row.phone ?? null,
    email: row.email ?? null,
    city: row.city ?? null,
    serviceType: row.service_type ?? null,
    urgency: row.urgency ?? null,
    status: row.status ?? "new",
    source: row.source ?? "phone",
    notes: row.notes ?? null,
    aiSummary: row.ai_summary ?? null,
    preferredTimeText: row.preferred_time_text ?? null,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 3: Verify build** — `cd apps/web && npx tsc --noEmit` (or the project's typecheck). Expected: no new errors.
- [ ] **Step 4: Commit** — `feat(crm): read leads via RLS session client`.

---

### Task 2: Pure CRM form/validation logic (TDD)

**Files:**
- Create: `apps/web/src/lib/crm/lead-form.ts`
- Create: `apps/web/src/lib/crm/appointment-form.ts`
- Test: `apps/web/scripts/test-lead-form.mjs`, `apps/web/scripts/test-appointment-form.mjs`

These are framework-free so they unit-test cleanly with the transpile pattern (strip `import` lines).

- [ ] **Step 1: Write `test-lead-form.mjs`** (transpile + data-URL import, stripping imports — same as
  `test-active-organization.mjs`). Assert:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const src = path.join(process.cwd(), "src", "lib", "crm", "lead-form.ts");
if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
const code = ts
  .transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
  })
  .outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const { parseLeadStatus, buildLeadInsertFromForm, LEAD_STATUSES } = await import(url);

assert.ok(LEAD_STATUSES.includes("won") && LEAD_STATUSES.includes("lost"), "pipeline statuses present");
assert.equal(parseLeadStatus("qualified"), "qualified", "valid status passes");
assert.equal(parseLeadStatus("garbage"), null, "invalid status rejected");

const fd = new Map([["name", "  Иван  "], ["phone", "+359888123456"], ["service_type", "Климатик"]]);
const ok = buildLeadInsertFromForm({ get: (k) => fd.get(k) ?? null }, "org-1");
assert.equal(ok.error, undefined, "valid form has no error");
assert.equal(ok.values.organization_id, "org-1", "org id injected server-side");
assert.equal(ok.values.name, "Иван", "name trimmed");
assert.equal(ok.values.status, "new", "default status new");

const bad = buildLeadInsertFromForm({ get: () => null }, "org-1");
assert.equal(bad.error, "name_or_phone_required", "must have a name or phone");
console.log("lead-form checks passed");
```

- [ ] **Step 2: Run — expect FAIL** (module missing): `cd apps/web && node ./scripts/test-lead-form.mjs`.

- [ ] **Step 3: Implement `lib/crm/lead-form.ts`:**

```ts
export const LEAD_STATUSES = ["new", "qualified", "booked", "quoted", "won", "lost", "spam"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function parseLeadStatus(value: unknown): LeadStatus | null {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value)
    ? (value as LeadStatus)
    : null;
}

type FormLike = { get(name: string): unknown };
const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function buildLeadInsertFromForm(form: FormLike, organizationId: string) {
  const name = text(form.get("name"));
  const phone = text(form.get("phone"));
  if (!name && !phone) return { error: "name_or_phone_required" as const, values: null };
  return {
    error: undefined,
    values: {
      organization_id: organizationId,
      status: parseLeadStatus(form.get("status")) ?? "new",
      name,
      phone,
      email: text(form.get("email")),
      city: text(form.get("city")),
      service_type: text(form.get("service_type")),
      source: "manual",
      notes: text(form.get("notes")),
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Write `test-appointment-form.mjs`** asserting:
  - `parseAppointmentTimes("2026-07-01", "09:00", 60)` → `{ startsAt, endsAt }` ISO strings 1h apart, no error.
  - missing date → `{ error: "start_required" }`.
  - end derived from `durationMinutes` when no explicit end.
  - `buildAppointmentValuesFromForm` trims `title`, requires a title, injects `organization_id`, defaults `status:"confirmed"` for manual create.

- [ ] **Step 6: Run — expect FAIL.**

- [ ] **Step 7: Implement `lib/crm/appointment-form.ts`:**

```ts
export const APPOINTMENT_STATUSES = [
  "requested", "confirmed", "completed", "cancelled", "no_show", "rescheduled",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export function parseAppointmentStatus(value: unknown): AppointmentStatus | null {
  return typeof value === "string" && (APPOINTMENT_STATUSES as readonly string[]).includes(value)
    ? (value as AppointmentStatus)
    : null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// date "YYYY-MM-DD" + time "HH:MM" interpreted in the org timezone offset is handled by the caller via
// a fixed +03:00 (Europe/Sofia) suffix is NOT safe for DST — instead store the wall-clock as a local
// Date and let the DB column (timestamptz) keep the instant. We build ISO with explicit offset minutes.
export function parseAppointmentTimes(
  date: unknown,
  time: unknown,
  durationMinutes = 60,
  endTime?: unknown
): { error?: string; startsAt: string | null; endsAt: string | null } {
  const d = text(date);
  const t = text(time) ?? "09:00";
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: "start_required", startsAt: null, endsAt: null };
  const start = new Date(`${d}T${t}:00`);
  if (!Number.isFinite(start.getTime())) return { error: "start_invalid", startsAt: null, endsAt: null };
  let end: Date;
  const et = text(endTime);
  if (et) {
    end = new Date(`${d}T${et}:00`);
  } else {
    end = new Date(start.getTime() + durationMinutes * 60_000);
  }
  if (!Number.isFinite(end.getTime()) || end <= start)
    return { error: "end_before_start", startsAt: start.toISOString(), endsAt: null };
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

type FormLike = { get(name: string): unknown };
export function buildAppointmentValuesFromForm(form: FormLike, organizationId: string) {
  const title = text(form.get("title"));
  if (!title) return { error: "title_required" as const, values: null };
  const times = parseAppointmentTimes(
    form.get("date"), form.get("time"), 60, form.get("end_time")
  );
  if (times.error) return { error: times.error, values: null };
  return {
    error: undefined,
    values: {
      organization_id: organizationId,
      status: parseAppointmentStatus(form.get("status")) ?? "confirmed",
      title,
      starts_at: times.startsAt,
      ends_at: times.endsAt,
      customer_name: text(form.get("customer_name")),
      customer_phone: text(form.get("customer_phone")),
      service_type: text(form.get("service_type")),
      location: text(form.get("location")),
      notes: text(form.get("notes")),
    },
  };
}
```

> **Note on timezone:** `new Date("YYYY-MM-DDTHH:MM:00")` parses in the **server's** local zone. On Vercel
> the server is UTC, so the stored instant would be off by the Sofia offset. At implementation, confirm
> against `node_modules/next/dist/docs` / runtime and pin the offset (Europe/Sofia is UTC+2/+3 with DST).
> Simplest robust approach: build the ISO string with an explicit offset computed for that date, or store
> the wall-clock components and a `timezone` field (the column already defaults to `Europe/Sofia`). Decide
> and lock during Task 5/7; the unit test asserts *ordering/duration*, not absolute UTC, to stay DST-safe.

- [ ] **Step 8: Run — expect PASS. Commit** — `test(crm): pure lead & appointment form validators`.

---

### Task 3: Lead Server Actions

**Files:**
- Create: `apps/web/src/app/(dashboard)/leads/actions.ts`

> Read `node_modules/next/dist/docs` for the server-actions + `revalidatePath` API in this Next build first.

- [ ] **Step 1: Implement the actions** (RLS client; never trust client org id — resolve from session):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import { parseLeadStatus, buildLeadInsertFromForm } from "@/lib/crm/lead-form";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateLeadStatus(leadId: string, status: string): Promise<ActionResult> {
  const valid = parseLeadStatus(status);
  if (!valid) return { ok: false, error: "invalid_status" };
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ status: valid }).eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leads");
  return { ok: true };
}

export async function updateLeadNotes(leadId: string, notes: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ notes: notes.trim() === "" ? null : notes.trim() })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leads");
  return { ok: true };
}

export async function createLead(formData: FormData): Promise<ActionResult> {
  const org = await getActiveOrganization();
  if (!org) return { ok: false, error: "no_org" };
  const { error: formError, values } = buildLeadInsertFromForm(formData, org.id);
  if (formError || !values) return { ok: false, error: formError ?? "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert(values);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leads");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck** — `cd apps/web && npx tsc --noEmit`. Expected: clean.
- [ ] **Step 3: Commit** — `feat(crm): lead status/notes/create server actions`.

---

### Task 4: Leads page + nav + status badge

**Files:**
- Modify: `apps/web/src/app/(dashboard)/leads/page.tsx` (replace redirect)
- Create: `apps/web/src/app/(dashboard)/leads/leads-board.tsx` (client island)
- Modify: `apps/web/src/components/app-shell.tsx` (nav + routeMeta)
- Modify: `apps/web/src/components/status-badge.tsx` (lead statuses)

- [ ] **Step 1: Status badge** — add Bulgarian labels + tones for `qualified` ("Квалифициран"),
  `booked` ("Записан"), `quoted` ("Оферта"), `won` ("Спечелен", green), `lost` ("Загубен", red). Match the
  existing mapping shape in `status-badge.tsx` (read it first; don't duplicate keys it already has, e.g.
  `new`, `spam`).

- [ ] **Step 2: `page.tsx` (Server Component)** — replace the redirect with:

```tsx
import { PageHeader } from "@/components/page-header";
import { getLeadsData } from "@/lib/dashboard/data";
import { LeadsBoard } from "./leads-board";

export default async function LeadsPage() {
  const leads = await getLeadsData();
  return (
    <>
      <PageHeader eyebrow="CRM" title="Запитвания" sub={`${leads.length} записа`} />
      <LeadsBoard leads={leads} />
    </>
  );
}
```
(Confirm `PageHeader`'s real prop names by reading it; the Explore map shows `eyebrow/title/actions`.)

- [ ] **Step 3: `leads-board.tsx` (`"use client"`)** — table of leads (reuse `DataTable`/`DataRow` +
  `StatusBadge`). Per row: a status `<select>` (options = `LEAD_STATUSES`, Bulgarian labels) that calls
  `updateLeadStatus(id, value)` on change with `useTransition`; a notes cell (inline textarea or a small
  popover) that calls `updateLeadNotes` on blur. A toolbar "Ново запитване" button opens a dialog (reuse
  the project's glass dialog styling) with a `<form action={createLead}>` of fields name/phone/email/city/
  service_type/notes/status. Use `useTransition` + a tiny toast/inline error from `ActionResult`.
  After a successful action, `revalidatePath` refreshes the server data.

- [ ] **Step 4: Nav** — in `app-shell.tsx` add `{ href: "/leads", label: "Запитвания", icon: <pick a
  lucide icon, e.g. ClipboardList> }` to `navItems` (place after "Клиенти"), and add a `routeMeta["/leads"]`
  entry (`{ eyebrow: "CRM", title: "Запитвания", sub: "входящи запитвания и pipeline" }`). Import the icon.

- [ ] **Step 5: Verify** — `cd apps/web && npm run build` (or `npx next build`). Expected: build succeeds,
  `/leads` is a real route. Click-through manually after deploy (or via `next dev`).
- [ ] **Step 6: Commit** — `feat(crm): leads pipeline page with inline status & notes`.

---

### Task 5: Google Calendar update helper

**Files:**
- Modify: `apps/web/src/lib/google/calendar.ts`

- [ ] **Step 1: Add `updateGoogleCalendarEvent`** mirroring `createGoogleCalendarEvent` (same config gate
  → safe no-op when GCal off; PATCH to `/events/{eventId}`):

```ts
export type UpdateGoogleCalendarEventInput = {
  calendarId: string | null;
  eventId: string;
  summary?: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
};

export async function updateGoogleCalendarEvent(input: UpdateGoogleCalendarEventInput) {
  const config = getGoogleCalendarConfig(input.calendarId);
  if (!config) return null; // GCal not configured -> no-op
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(input.eventId)}`
  );
  url.searchParams.set("sendUpdates", "none");
  const data = await googleCalendarFetch<JsonRecord>(config, url, {
    method: "PATCH",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      start: { dateTime: input.startsAt.toISOString(), timeZone: input.timeZone },
      end: { dateTime: input.endsAt.toISOString(), timeZone: input.timeZone },
    }),
  });
  return { id: readString(data.id) ?? input.eventId };
}
```

- [ ] **Step 2: Typecheck.** Commit — `feat(calendar): updateGoogleCalendarEvent helper (safe no-op when off)`.

---

### Task 6: Appointment Server Actions (update/reschedule + manual create)

**Files:**
- Create: `apps/web/src/app/(dashboard)/appointments/actions.ts`

- [ ] **Step 1: Implement** (RLS client; GCal write-back on reschedule when an event id exists):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import { updateGoogleCalendarEvent } from "@/lib/google/calendar";
import {
  buildAppointmentValuesFromForm,
  parseAppointmentStatus,
  parseAppointmentTimes,
} from "@/lib/crm/appointment-form";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateAppointment(appointmentId: string, formData: FormData): Promise<ActionResult> {
  const times = parseAppointmentTimes(formData.get("date"), formData.get("time"), 60, formData.get("end_time"));
  if (times.error) return { ok: false, error: times.error };
  const status = parseAppointmentStatus(formData.get("status")) ?? "rescheduled";
  const supabase = await createClient();

  // Read current row first (RLS-scoped) to learn the GCal event id + timezone.
  const { data: current } = await supabase
    .from("appointments")
    .select("google_calendar_event_id, timezone, title, location")
    .eq("id", appointmentId)
    .maybeSingle();

  const title = (formData.get("title") as string)?.trim() || current?.title || "Час";
  const { error } = await supabase
    .from("appointments")
    .update({
      title,
      starts_at: times.startsAt,
      ends_at: times.endsAt,
      status,
      location: ((formData.get("location") as string) ?? "").trim() || current?.location || null,
      notes: ((formData.get("notes") as string) ?? "").trim() || null,
    })
    .eq("id", appointmentId);
  if (error) return { ok: false, error: error.message };

  // Best-effort GCal write-back (no-op when GCal is unconfigured or no event id).
  if (current?.google_calendar_event_id && times.startsAt && times.endsAt) {
    try {
      await updateGoogleCalendarEvent({
        calendarId: null,
        eventId: current.google_calendar_event_id,
        summary: title,
        startsAt: new Date(times.startsAt),
        endsAt: new Date(times.endsAt),
        timeZone: current.timezone ?? "Europe/Sofia",
      });
    } catch (e) {
      console.error("GCal update failed (non-fatal):", e);
    }
  }
  revalidatePath("/appointments");
  return { ok: true };
}

export async function createAppointment(formData: FormData): Promise<ActionResult> {
  const org = await getActiveOrganization();
  if (!org) return { ok: false, error: "no_org" };
  const { error: formError, values } = buildAppointmentValuesFromForm(formData, org.id);
  if (formError || !values) return { ok: false, error: formError ?? "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").insert(values);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/appointments");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck.** Commit — `feat(crm): appointment update/reschedule + create server actions`.

---

### Task 7: Reschedule/edit UI + manual appointment create UI

**Files:**
- Modify: `apps/web/src/components/appointment-drawer.tsx` (replace `handleRescheduleAlert`)
- Modify: `apps/web/src/app/(dashboard)/appointments/page.tsx` (wire a "New appointment" dialog/button)

- [ ] **Step 1: Drawer edit form** — read `appointment-drawer.tsx`. Replace the `handleRescheduleAlert()`
  stub (~line 135) with a toggle that reveals an inline edit form (date/time/end_time/title/location/
  status/notes pre-filled from the appointment) that calls `updateAppointment(id, formData)` via
  `useTransition`. On success, close the form and `router.refresh()`. Keep the existing cancel/delete
  button unchanged (D3).

- [ ] **Step 2: New-appointment dialog** — add a client dialog (reuse glass dialog styling) with a
  `<form action={createAppointment}>`; trigger it from the existing header **"Нов час"** button or a button
  on the appointments page. (If the header button in `app-shell.tsx` is reused, pass an opener; simplest is
  a dedicated button on `appointments/page.tsx` to avoid threading state through the shell.)

- [ ] **Step 3: Verify** — `cd apps/web && npm run build`. Manually exercise after deploy: reschedule an
  existing appt, create a new one.
- [ ] **Step 4: Commit** — `feat(crm): reschedule/edit + manual create UI`.

---

### Task 8: End-to-end RLS write verification

**Files:**
- Create: `apps/web/scripts/verify-crm-writes.mjs`

Phase 2 only verified RLS **reads**. This proves the **write** path (member insert/update) works against
the live DB, then cleans up with the service-role client (no DELETE policy exists for members — by design).

- [ ] **Step 1: Implement** — sign in as the user (anon key, like `verify-rls-access.mjs`):
  1. `insert` a test lead `{ name: "RLS Test", phone: "+359000000000", source: "manual" }` (org id resolved
     by RLS default? No — `organization_id` is `not null` and has no default; the script must read the
     user's org via `organization_members` first, then insert with that id). Assert no error + a row id.
  2. `update` that lead's `status` to `qualified` and `notes`. Assert no error.
  3. `insert` a test appointment `{ title: "RLS Test", status: "confirmed", organization_id }`. Assert ok.
  4. `update` its `starts_at`. Assert ok.
  5. **Cleanup:** with the **service-role** client, `delete` both test rows by id.
  6. Print `RESULT: PASS` only if steps 1–4 all succeeded.
  Reuse the env-loading + clean-exit (`setTimeout(process.exit, 150)`) pattern from the existing scripts.

- [ ] **Step 2: Run** — `node apps/web/scripts/verify-crm-writes.mjs todorov.ivailo.v@gmail.com '<password>'`.
  Expected: `RESULT: PASS`.
- [ ] **Step 3: Commit** — `chore(crm): end-to-end RLS write verification script`.

---

## Done criteria
- `/leads` shows the captured leads; status + notes are editable and persist (verified via reload).
- A lead and an appointment can be created by hand from the dashboard.
- An appointment can be rescheduled/edited; if it has a GCal event and GCal is configured, the event moves too.
- `verify-crm-writes.mjs` → PASS. `npm run build` green. Each task committed. Deployed to prod (push to `main`).

## Deferred (tracked, not this phase)
- Staff assignment (needs `assigned_to` migration + member picker; YAGNI at 1 user).
- Soft-cancel + GCal delete for the cancel route (currently hard-delete, GCal-stale).
- Lead↔appointment linking on manual create; lead→appointment "convert" action.
- Kanban drag-and-drop (list + status select is the v1).
