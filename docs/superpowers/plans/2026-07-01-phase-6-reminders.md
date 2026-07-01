# Phase 6 — Appointment Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single evening Vercel cron sends each customer an SMS reminder for tomorrow's appointment (Zadarma) and emails the owner tomorrow's agenda (Resend), idempotently.

**Architecture:** One cron route `/api/cron/reminders` runs on a service-role Supabase client, computes the Europe/Sofia "tomorrow" window, and per organization: sends customer SMS + one owner agenda email. All content/selection logic lives in pure, unit-tested helpers (`reminders.ts`). Idempotency is a `notification_log` table with a unique `(organization_id, dedupe_key)` — claim-then-send. SMS delivery is a provider-agnostic module (`sms.ts`) with a Zadarma driver whose request signing is byte-verified against PHP.

**Tech Stack:** Next.js 16 (App Router route handler, `runtime=nodejs`), Supabase (service client), Zadarma SMS API (HMAC-SHA1 signed), Resend (email), Vercel Cron. Pure functions tested via the `ts.transpileModule` harness (`node ./scripts/test-*.mjs`).

**Spec:** `docs/superpowers/specs/2026-07-01-phase-6-reminders-design.md`

**Verified during design (do not re-derive):**
- Zadarma signing = `Authorization: {KEY}:{base64(hmac_sha1_hex(method + paramsString + md5(paramsString), SECRET))}`, where `paramsString = http_build_query(ksort(params), PHP_QUERY_RFC1738)` and `params` **includes `format=json`**. `method = "/v1/sms/send/"`.
- A JS `phpUrlencode` (encodeURIComponent → `%20`→`+` → also encode `! ~ * ' ( )`) produces a **byte-identical** params string to PHP. Golden vector: params `{caller_id:"35924372749", format:"json", message:"Напомняне: утре 02.07, час! (тест) при Демо* ~end", number:"359888123456"}` → `md5 = bdce0d52c5a62663c53b11761c213ed4`.
- `organizations.billing_email` already exists (recipient for the agenda). Appointments have `customer_phone` but no customer email.
- Test harness pattern: see any `apps/web/scripts/test-*.mjs` — `loadModule([...relPathParts])` transpiles TS, strips `import` lines, imports as a base64 data URL, returns named exports. Run from `apps/web`.

---

## File Structure

**New**
- `supabase/migrations/007_notification_log.sql` — idempotency/history table.
- `apps/web/src/lib/notifications/reminders.ts` — pure helpers (Sofia time windows, selection, message builders, dedupe keys).
- `apps/web/src/lib/notifications/sms.ts` — provider-agnostic SMS + Zadarma driver + signing.
- `apps/web/src/app/api/cron/reminders/route.ts` — the cron endpoint.
- `apps/web/scripts/test-reminders.mjs` — unit tests for `reminders.ts`.
- `apps/web/scripts/test-sms.mjs` — unit tests for `sms.ts` (golden signing vector + phone normalization).

**Modified**
- `apps/web/src/types/database.ts` — add `notification_log` table types.
- `apps/web/src/lib/notifications/owner-email.ts` — add `sendOwnerAgendaEmail`.
- `apps/web/vercel.json` — add the reminders cron entry.

---

## Task 1: Migration 007 + database types

**Files:**
- Create: `supabase/migrations/007_notification_log.sql`
- Modify: `apps/web/src/types/database.ts` (inside `public.Tables`, following the existing `PublicTable<...>` pattern — e.g. right after `owner_notifications`)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/007_notification_log.sql`:

```sql
-- Idempotency + history for outbound notifications (Phase 6 reminders).
-- Written only by the cron via the service role; readable by org members.
begin;

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  kind text not null check (kind in ('appointment_reminder', 'owner_daily_agenda')),
  appointment_id uuid references public.appointments(id) on delete set null,
  dedupe_key text not null,
  destination text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);

create index notification_log_org_created_at_idx
  on public.notification_log (organization_id, created_at desc);

alter table public.notification_log enable row level security;

create policy "members can read notification log"
  on public.notification_log for select to authenticated
  using (public.is_org_member(organization_id));

grant select on public.notification_log to authenticated;

commit;
```

- [ ] **Step 2: Add the database types**

In `apps/web/src/types/database.ts`, add this entry inside `public: { Tables: { ... } }` (mirror the surrounding tables):

```ts
      notification_log: PublicTable<
        {
          id: string;
          organization_id: string;
          channel: string;
          kind: string;
          appointment_id: string | null;
          dedupe_key: string;
          destination: string;
          status: string;
          error: string | null;
          sent_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          channel: string;
          kind: string;
          appointment_id?: string | null;
          dedupe_key: string;
          destination: string;
          status?: string;
          error?: string | null;
          sent_at?: string | null;
          created_at?: string;
        }
      >;
```

- [ ] **Step 3: Type-check**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no new errors (the migration is applied by the user later; types compile now).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_notification_log.sql apps/web/src/types/database.ts
git commit -m "feat(phase-6): notification_log migration + database types"
```

---

## Task 2: Pure reminder helpers (TDD)

**Files:**
- Create: `apps/web/src/lib/notifications/reminders.ts`
- Test: `apps/web/scripts/test-reminders.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-reminders.mjs`:

```js
// Unit tests for pure reminder helpers. Run (from apps/web): node ./scripts/test-reminders.mjs
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
  sofiaDayWindow,
  formatSofiaTime,
  sofiaDateLabel,
  selectDueAppointments,
  buildReminderSms,
  buildOwnerAgendaEmail,
  smsDedupeKey,
  agendaDedupeKey,
} = await loadModule(["src", "lib", "notifications", "reminders.ts"]);

// --- sofiaDayWindow: summer (UTC+3) ---
const wSummer = sofiaDayWindow(new Date("2026-07-01T10:00:00Z"), 1);
assert.equal(wSummer.isoDate, "2026-07-02", "summer tomorrow isoDate");
assert.equal(wSummer.dateLabel, "02.07", "summer dateLabel");
assert.equal(wSummer.startUtc.toISOString(), "2026-07-01T21:00:00.000Z", "summer Sofia midnight = 21:00Z prev day");
assert.equal(wSummer.endUtc.toISOString(), "2026-07-02T21:00:00.000Z", "summer end = next Sofia midnight");

// --- sofiaDayWindow: winter (UTC+2) ---
const wWinter = sofiaDayWindow(new Date("2026-01-15T10:00:00Z"), 1);
assert.equal(wWinter.isoDate, "2026-01-16", "winter tomorrow isoDate");
assert.equal(wWinter.startUtc.toISOString(), "2026-01-15T22:00:00.000Z", "winter Sofia midnight = 22:00Z prev day");
assert.equal(wWinter.endUtc.toISOString(), "2026-01-16T22:00:00.000Z", "winter end");

// --- formatSofiaTime / sofiaDateLabel ---
assert.equal(formatSofiaTime("2026-07-02T11:00:00Z"), "14:00", "Sofia summer +3 → 14:00");
assert.equal(sofiaDateLabel("2026-07-02T11:00:00Z"), "02.07", "Sofia date label");

// --- selectDueAppointments ---
const rows = [
  { id: "a", status: "confirmed", starts_at: "2026-07-02T11:00:00Z", customer_phone: "+359888111", customer_name: "Иван", service_type: "Ремонт", location: "София" },
  { id: "b", status: "cancelled", starts_at: "2026-07-02T12:00:00Z", customer_phone: "+359888222", customer_name: null, service_type: null, location: null },
  { id: "c", status: "requested", starts_at: "2026-07-02T13:00:00Z", customer_phone: null, customer_name: "Без тел", service_type: null, location: null },
  { id: "d", status: "confirmed", starts_at: "2026-07-05T09:00:00Z", customer_phone: "+359888444", customer_name: "Извън", service_type: null, location: null },
];
const due = selectDueAppointments(rows, wSummer);
assert.deepEqual(due.map((r) => r.id), ["a"], "only confirmed/requested + phone + in-window");

// --- buildReminderSms ---
const sms = buildReminderSms(rows[0], { name: "Демо ХВАК", owner_phone: "0888123456" });
assert.ok(sms.includes("утре 02.07 14:00"), "sms has date+time");
assert.ok(sms.includes("Ремонт"), "sms has service");
assert.ok(sms.includes("Промяна: 0888123456"), "sms has change phone");
assert.ok(sms.length <= 140, `sms within ~2 Cyrillic segments (got ${sms.length})`);

// --- buildOwnerAgendaEmail ---
const agenda = buildOwnerAgendaEmail(
  [rows[0], { id: "e", status: "confirmed", starts_at: "2026-07-02T09:30:00Z", customer_phone: "+359888555", customer_name: "Ана", service_type: "Оглед", location: null }],
  { name: "Демо ХВАК" },
  "02.07"
);
assert.equal(agenda.subject, "Утрешна програма (02.07) — 2 часа", "agenda subject");
assert.ok(agenda.text.indexOf("12:30") < agenda.text.indexOf("14:00"), "agenda sorted by time");
assert.ok(agenda.text.includes("Ана"), "agenda lists customer");

// --- dedupe keys ---
assert.equal(smsDedupeKey("appt-1"), "sms:appt:appt-1");
assert.equal(agendaDedupeKey("2026-07-02"), "email:agenda:2026-07-02");

console.log("reminders: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `node ./scripts/test-reminders.mjs`
Expected: FAIL — `Missing module: .../reminders.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/notifications/reminders.ts`:

```ts
const SOFIA_TZ = "Europe/Sofia";

export type ReminderAppointment = {
  id: string;
  status: string;
  starts_at: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  service_type: string | null;
  location: string | null;
};

export type ReminderOrg = { name: string; owner_phone: string | null };

export type SofiaDayWindow = {
  startUtc: Date;
  endUtc: Date;
  dateLabel: string; // DD.MM
  isoDate: string; // YYYY-MM-DD
};

const REMINDER_STATUSES = new Set(["requested", "confirmed"]);

function sofiaOffsetMinutes(instant: Date): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: SOFIA_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtcWall = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtcWall - instant.getTime()) / 60000);
}

function sofiaYmd(instant: Date): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: SOFIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: g("year"), m: g("month"), d: g("day") };
}

function sofiaMidnightUtc(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offsetMin = sofiaOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMin * 60000);
}

export function sofiaDayWindow(now: Date, offsetDays: number): SofiaDayWindow {
  const today = sofiaYmd(now);
  const base = new Date(Date.UTC(today.y, today.m - 1, today.d));
  const target = new Date(base.getTime() + offsetDays * 86400000);
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;
  const td = target.getUTCDate();
  const next = new Date(target.getTime() + 86400000);
  const startUtc = sofiaMidnightUtc(ty, tm, td);
  const endUtc = sofiaMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startUtc,
    endUtc,
    dateLabel: `${pad(td)}.${pad(tm)}`,
    isoDate: `${ty}-${pad(tm)}-${pad(td)}`,
  };
}

export function formatSofiaTime(startsAt: string | Date): string {
  const d = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export function sofiaDateLabel(startsAt: string | Date): string {
  const d = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA_TZ,
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("day")}.${g("month")}`;
}

export function selectDueAppointments(
  rows: ReminderAppointment[],
  window: { startUtc: Date; endUtc: Date }
): ReminderAppointment[] {
  return rows.filter((r) => {
    if (!REMINDER_STATUSES.has(r.status)) return false;
    if (!r.customer_phone || !r.customer_phone.trim()) return false;
    if (!r.starts_at) return false;
    const t = new Date(r.starts_at).getTime();
    return Number.isFinite(t) && t >= window.startUtc.getTime() && t < window.endUtc.getTime();
  });
}

export function buildReminderSms(appt: ReminderAppointment, org: ReminderOrg): string {
  const time = formatSofiaTime(appt.starts_at as string);
  const date = sofiaDateLabel(appt.starts_at as string);
  const service = appt.service_type?.trim();
  const servicePart = service ? ` за ${service}` : "";
  const changePart = org.owner_phone?.trim() ? ` Промяна: ${org.owner_phone.trim()}` : "";
  return `Напомняне: утре ${date} ${time} имате час${servicePart} при ${org.name}.${changePart}`;
}

export function buildOwnerAgendaEmail(
  appts: ReminderAppointment[],
  org: { name: string | null },
  dateLabel: string
): { subject: string; text: string; html: string } {
  const count = appts.length;
  const noun = count === 1 ? "час" : "часа";
  const subject = `Утрешна програма (${dateLabel}) — ${count} ${noun}`;
  const sorted = [...appts].sort(
    (a, b) => new Date(a.starts_at as string).getTime() - new Date(b.starts_at as string).getTime()
  );
  const lines = sorted.map((a) => {
    const time = formatSofiaTime(a.starts_at as string);
    const name = a.customer_name?.trim() || "Клиент";
    const phone = a.customer_phone?.trim() || "—";
    const service = a.service_type?.trim() || "—";
    const loc = a.location?.trim() ? ` · ${a.location.trim()}` : "";
    return `${time} — ${name} (${phone}) · ${service}${loc}`;
  });
  const header = `Утрешна програма${org.name ? ` за ${org.name}` : ""} (${dateLabel}):`;
  const text = [header, "", ...lines].join("\n");
  const html = `<div><p>${header}</p>${lines.map((l) => `<p>${l}</p>`).join("")}</div>`;
  return { subject, text, html };
}

export function smsDedupeKey(appointmentId: string): string {
  return `sms:appt:${appointmentId}`;
}

export function agendaDedupeKey(isoDate: string): string {
  return `email:agenda:${isoDate}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `node ./scripts/test-reminders.mjs`
Expected: PASS — `reminders: all tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/notifications/reminders.ts apps/web/scripts/test-reminders.mjs
git commit -m "feat(phase-6): pure reminder helpers (Sofia window, selection, messages) + tests"
```

---

## Task 3: SMS provider — Zadarma driver (TDD)

**Files:**
- Create: `apps/web/src/lib/notifications/sms.ts`
- Test: `apps/web/scripts/test-sms.mjs`

- [ ] **Step 1: Write the failing test** (golden signing vector + phone normalization)

Create `apps/web/scripts/test-sms.mjs`:

```js
// Unit tests for the Zadarma SMS encoder/normalizer. Run (from apps/web): node ./scripts/test-sms.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const { buildParamsString, normalizeMsisdn } = await loadModule(["src", "lib", "notifications", "sms.ts"]);

// Golden vector: must be byte-identical to PHP http_build_query(ksort, RFC1738).
const paramsString = buildParamsString({
  number: "359888123456",
  message: "Напомняне: утре 02.07, час! (тест) при Демо* ~end",
  caller_id: "35924372749",
  format: "json",
});
assert.equal(
  createHash("md5").update(paramsString).digest("hex"),
  "bdce0d52c5a62663c53b11761c213ed4",
  "params string byte-identical to PHP"
);

// Phone normalization → international, digits only.
assert.equal(normalizeMsisdn("+359 88 812 3456"), "359888123456", "strip + and spaces");
assert.equal(normalizeMsisdn("0888123456"), "359888123456", "BG local 0 → 359");
assert.equal(normalizeMsisdn("00359888123456"), "359888123456", "00 prefix → international");
assert.equal(normalizeMsisdn("359888123456"), "359888123456", "already international");

console.log("sms: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `node ./scripts/test-sms.mjs`
Expected: FAIL — `Missing module: .../sms.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/notifications/sms.ts`:

```ts
import { createHash, createHmac } from "crypto";

const ZADARMA_API = "https://api.zadarma.com";
const SMS_METHOD = "/v1/sms/send/";

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.ZADARMA_API_KEY && process.env.ZADARMA_API_SECRET && process.env.ZADARMA_SMS_SENDER
  );
}

// Byte-compatible with PHP urlencode() / http_build_query(..., PHP_QUERY_RFC1738).
export function phpUrlencode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!~*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// ksort + http_build_query, matching the Zadarma PHP client exactly.
export function buildParamsString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${phpUrlencode(k)}=${phpUrlencode(params[k])}`)
    .join("&");
}

export function zadarmaAuthHeader(
  methodPath: string,
  paramsString: string,
  key: string,
  secret: string
): string {
  const md5hex = createHash("md5").update(paramsString).digest("hex");
  const hmacHex = createHmac("sha1", secret).update(methodPath + paramsString + md5hex).digest("hex");
  const signature = Buffer.from(hmacHex).toString("base64");
  return `${key}:${signature}`;
}

export function normalizeMsisdn(phone: string): string {
  let n = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0")) n = "359" + n.slice(1);
  return n;
}

export async function sendSms(input: {
  to: string;
  text: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  if (!isSmsConfigured()) {
    console.warn("SMS skipped: Zadarma env not configured");
    return { sent: false, skipped: true };
  }
  const key = process.env.ZADARMA_API_KEY as string;
  const secret = process.env.ZADARMA_API_SECRET as string;
  const sender = process.env.ZADARMA_SMS_SENDER as string;

  const params: Record<string, string> = {
    number: normalizeMsisdn(input.to),
    message: input.text,
    caller_id: sender,
    format: "json",
  };
  const paramsString = buildParamsString(params);
  const authHeader = zadarmaAuthHeader(SMS_METHOD, paramsString, key, secret);

  try {
    const res = await fetch(`${ZADARMA_API}${SMS_METHOD}`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: paramsString,
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
    if (!res.ok || json.status !== "success") {
      const error = json.message || `HTTP ${res.status}`;
      console.error("Zadarma SMS failed", error);
      return { sent: false, error };
    }
    return { sent: true };
  } catch (error) {
    console.error("Zadarma SMS threw", error);
    return { sent: false, error: String(error) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `node ./scripts/test-sms.mjs`
Expected: PASS — `sms: all tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/notifications/sms.ts apps/web/scripts/test-sms.mjs
git commit -m "feat(phase-6): provider-agnostic SMS + Zadarma driver (PHP-verified signing)"
```

---

## Task 4: Owner agenda email sender

**Files:**
- Modify: `apps/web/src/lib/notifications/owner-email.ts` (append a new export; do not touch existing functions)

- [ ] **Step 1: Add the sender**

Append to `apps/web/src/lib/notifications/owner-email.ts` (mirrors the existing `sendOwnerLeadEmail`):

```ts
export async function sendOwnerAgendaEmail(input: {
  to: string | null;
  subject: string;
  text: string;
  html: string;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = input.to ?? process.env.OWNER_NOTIFICATION_EMAIL ?? null;

  if (!apiKey || !to) {
    console.warn("Owner agenda email skipped: missing RESEND_API_KEY or recipient");
    return { sent: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.OWNER_NOTIFICATION_FROM ?? "AI Receptionist <onboarding@resend.dev>",
        to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    if (!res.ok) {
      console.error("Owner agenda email failed", res.status, await res.text());
      return { sent: false };
    }

    return { sent: true };
  } catch (error) {
    console.error("Owner agenda email threw", error);
    return { sent: false };
  }
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/notifications/owner-email.ts
git commit -m "feat(phase-6): sendOwnerAgendaEmail (Resend)"
```

---

## Task 5: Cron route + vercel.json

**Files:**
- Create: `apps/web/src/app/api/cron/reminders/route.ts`
- Modify: `apps/web/vercel.json`

- [ ] **Step 1: Write the cron route**

Create `apps/web/src/app/api/cron/reminders/route.ts`:

```ts
import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { sendOwnerAgendaEmail } from "@/lib/notifications/owner-email";
import {
  agendaDedupeKey,
  buildOwnerAgendaEmail,
  buildReminderSms,
  selectDueAppointments,
  smsDedupeKey,
  sofiaDayWindow,
  type ReminderAppointment,
  type SofiaDayWindow,
} from "@/lib/notifications/reminders";
import { sendSms } from "@/lib/notifications/sms";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrgRow = { id: string; name: string; owner_phone: string | null; billing_email: string | null };
type ServiceClient = ReturnType<typeof getSupabaseServiceClient>;

export async function GET(request: Request) {
  return runReminders(request);
}

export async function POST(request: Request) {
  return runReminders(request);
}

async function runReminders(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const orgSlug = url.searchParams.get("organization");
  const supabase = getSupabaseServiceClient();

  const window = sofiaDayWindow(new Date(), 1); // tomorrow, Europe/Sofia

  let orgQuery = supabase
    .from("organizations")
    .select("id,name,owner_phone,billing_email")
    .eq("status", "active");
  if (orgSlug) orgQuery = orgQuery.eq("slug", orgSlug);

  const { data: orgs, error: orgError } = await orgQuery;
  if (orgError) {
    return NextResponse.json({ ok: false, error: "org query failed" }, { status: 500 });
  }

  const organizations = [];
  for (const org of (orgs ?? []) as OrgRow[]) {
    organizations.push(await processOrg(supabase, org, window, dryRun));
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    date: window.isoDate,
    window: { from: window.startUtc.toISOString(), to: window.endUtc.toISOString() },
    organizations,
  });
}

async function processOrg(supabase: ServiceClient, org: OrgRow, window: SofiaDayWindow, dryRun: boolean) {
  const { data: apptRows } = await supabase
    .from("appointments")
    .select("id,status,starts_at,customer_phone,customer_name,service_type,location")
    .eq("organization_id", org.id)
    .gte("starts_at", window.startUtc.toISOString())
    .lt("starts_at", window.endUtc.toISOString());

  const due = selectDueAppointments((apptRows ?? []) as ReminderAppointment[], window);

  // --- Customer SMS ---
  let smsSent = 0;
  let smsFailed = 0;
  const smsPreview: Array<{ to: string; text: string }> = [];
  for (const appt of due) {
    const to = appt.customer_phone as string;
    const text = buildReminderSms(appt, { name: org.name, owner_phone: org.owner_phone });
    if (dryRun) {
      smsPreview.push({ to, text });
      continue;
    }
    const key = smsDedupeKey(appt.id);
    const claimed = await claim(supabase, {
      organization_id: org.id,
      channel: "sms",
      kind: "appointment_reminder",
      appointment_id: appt.id,
      dedupe_key: key,
      destination: to,
    });
    if (!claimed) continue; // already sent on a prior run
    const r = await sendSms({ to, text });
    if (r.sent) {
      smsSent += 1;
    } else {
      smsFailed += 1;
      await markFailed(supabase, org.id, key, r.error ?? "unknown");
    }
  }

  // --- Owner agenda email (one per org per day; skipped when no appointments) ---
  const agendaEmail = buildOwnerAgendaEmail(due, { name: org.name }, window.dateLabel);
  const to = org.billing_email ?? process.env.OWNER_NOTIFICATION_EMAIL ?? null;
  let agenda: "sent" | "skipped" | "failed" = "skipped";
  if (due.length > 0 && to && !dryRun) {
    const key = agendaDedupeKey(window.isoDate);
    const claimed = await claim(supabase, {
      organization_id: org.id,
      channel: "email",
      kind: "owner_daily_agenda",
      appointment_id: null,
      dedupe_key: key,
      destination: to,
    });
    if (claimed) {
      const r = await sendOwnerAgendaEmail({ to, ...agendaEmail });
      if (r.sent) {
        agenda = "sent";
      } else {
        agenda = "failed";
        await markFailed(supabase, org.id, key, "resend failed");
      }
    }
  }

  return {
    organizationId: org.id,
    name: org.name,
    smsPlanned: due.length,
    smsSent,
    smsFailed,
    agenda,
    ...(dryRun
      ? { smsPreview, agendaPreview: due.length && to ? { to, subject: agendaEmail.subject, text: agendaEmail.text } : null }
      : {}),
  };
}

async function claim(
  supabase: ServiceClient,
  row: {
    organization_id: string;
    channel: string;
    kind: string;
    appointment_id: string | null;
    dedupe_key: string;
    destination: string;
  }
): Promise<boolean> {
  const { data } = await supabase
    .from("notification_log")
    .upsert(
      { ...row, status: "sent", sent_at: new Date().toISOString() },
      { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true }
    )
    .select("id");
  return Boolean(data && data.length > 0);
}

async function markFailed(
  supabase: ServiceClient,
  organizationId: string,
  dedupeKey: string,
  error: string
): Promise<void> {
  await supabase
    .from("notification_log")
    .update({ status: "failed", error, sent_at: null })
    .eq("organization_id", organizationId)
    .eq("dedupe_key", dedupeKey);
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  const supplied = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : request.headers.get("x-cron-secret");
  if (!supplied) return false;
  return constantTimeEqual(supplied, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
```

- [ ] **Step 2: Add the cron schedule**

Replace `apps/web/vercel.json` with:

```json
{
  "crons": [
    { "path": "/api/calendar/google/sync", "schedule": "0 3 * * *" },
    { "path": "/api/cron/reminders", "schedule": "0 16 * * *" }
  ]
}
```

- [ ] **Step 3: Type-check + full build guard**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no errors. (If `getSupabaseServiceClient`'s return type makes `ServiceClient` awkward, keep the `ServiceClient` alias as written — it mirrors the sync route's usage.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/cron/reminders/route.ts apps/web/vercel.json
git commit -m "feat(phase-6): reminders cron route (SMS + owner agenda, dryRun, idempotent)"
```

---

## Task 6: Apply migration, E2E verify, deploy

**Files:** none (operational)

- [ ] **Step 1: User applies migration 007**

Ask the user to run `supabase/migrations/007_notification_log.sql` in the Supabase SQL editor. Confirm `notification_log` exists.

- [ ] **Step 2: Deploy**

```bash
git push origin main
```

- [ ] **Step 3: Verify deploy landed**

Poll `GET https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call` until `commit` matches HEAD (use `ctx_execute` JS `fetch`, not Bash curl — the context-mode hook intercepts inline HTTP).

- [ ] **Step 4: Dry-run on production (no SMS spent)**

`GET https://ai-assistent-2-delta.vercel.app/api/cron/reminders?dryRun=1` with header `Authorization: Bearer <CRON_SECRET>` (via `ctx_execute` `fetch`). Confirm the JSON `organizations[].smsPreview` / `agendaPreview` show the expected messages for tomorrow's appointments. If tomorrow is empty, temporarily test against a seeded/near appointment or trust the empty result + unit tests.

- [ ] **Step 5: One live test SMS (explicit user OK, ~€0.05–0.15)**

With the user's authorization and their own phone as the recipient (seed a tomorrow appointment with the user's phone, or expose a guarded `?to=` test path only if the user requests it), trigger a real send and confirm delivery + a `notification_log` row with `status='sent'`.

- [ ] **Step 6: Idempotency check**

Trigger the batch a second time (non-dryRun) → confirm `smsSent = 0` (all deduped) and no duplicate SMS.

- [ ] **Step 7: Final commit (if any operational tweaks)**

```bash
git commit -am "chore(phase-6): reminders live + verified" || true
```

---

## Self-Review

**Spec coverage:** SMS→customer (T2/T3/T5) ✓; owner agenda→Resend (T2/T4/T5) ✓; single evening cron 18:00 Sofia (T5 `0 16 * * *`) ✓; idempotent `notification_log` (T1/T5 claim-then-send) ✓; provider-agnostic SMS (T3) ✓; dryRun (T5) ✓; Sofia/DST windows (T2) ✓; recipient `billing_email ?? OWNER_NOTIFICATION_EMAIL` (T5) ✓; prereqs = migration + Zadarma env + sender-as-number (T6 + spec) ✓.

**Placeholder scan:** none — every step has full code/SQL/commands.

**Type consistency:** `ReminderAppointment` fields identical across `reminders.ts`, the test, and the route's `.select`. `buildReminderSms(appt, {name, owner_phone})`, `buildOwnerAgendaEmail(appts, {name}, dateLabel)`, `sendSms → {sent,skipped,error}`, `sendOwnerAgendaEmail({to,subject,text,html})`, `claim(row)`/`markFailed` columns, and both dedupe-key helpers all line up with `notification_log`'s schema and the `SofiaDayWindow` shape.

## Out of scope (per spec — do not build)

Per-org on/off toggle & custom times; customer email; second SMS / WhatsApp; auto-retry of failed sends; reschedule/cancel links.
