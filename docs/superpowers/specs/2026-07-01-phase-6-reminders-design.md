# Phase 6 — Appointment Reminders (SMS + Owner Agenda) Design

**Date:** 2026-07-01
**Status:** Approved (brainstorming) — ready for implementation plan
**Builds on:** `lib/notifications/owner-email.ts` (Resend, already live), the Vercel Cron pattern in `api/calendar/google/sync/route.ts`, migrations 001–006.

## Goal

Automatically remind **customers** of tomorrow's appointments by **SMS** (to cut no-shows) and send the **owner** a **daily agenda email** of tomorrow's appointments — multi-tenant, running on the **free Vercel Hobby plan**, with **idempotent** delivery (never double-send).

## Decisions locked during brainstorming

1. **Recipients:** SMS → the customer; email → the owner. (Appointments store `customer_phone` but no customer email; the owner's email already exists.)
2. **Timing:** a **single daily evening cron (~18:00 Europe/Sofia)**. In that one run it sends **both**: the customer SMS for tomorrow **and** the owner's "tomorrow's agenda" email.
3. **Plan fit:** one cron entry (Hobby allows 2 daily crons; the Google sync uses the first). Fixed UTC schedule → **±1h DST drift accepted** for an evening send. The *set of appointments* selected does not depend on the exact fire time (it's a Sofia-calendar-day window), only the clock time the SMS lands.
4. **Providers:** SMS via **Zadarma** behind a provider-agnostic module; email via **Resend** (already wired).
5. **Idempotency:** one `notification_log` table, unique on `(organization_id, dedupe_key)`.

## Architecture & data flow

```
Vercel Cron (0 16 * * *)  ──►  GET /api/cron/reminders   (auth: CRON_SECRET)
                                     │  service-role Supabase client
                                     │  compute "tomorrow" window in Europe/Sofia
                                     ▼
                       for each organization:
                         ├─ fetch tomorrow's appointments (status requested|confirmed)
                         ├─ CUSTOMER SMS: per appt with a phone →
                         │     claim notification_log row (insert … on conflict do nothing)
                         │     if claimed → sendSms(Zadarma) → update status sent|failed
                         └─ OWNER AGENDA: if list non-empty →
                               claim agenda row for (org, tomorrow-date)
                               if claimed → sendOwnerAgendaEmail(Resend) → update status
```

`?dryRun=1` computes the full plan and **returns the exact messages without sending and without writing any log rows** — used to verify on production before spending a single SMS.

## Components (files)

**New**
- `supabase/migrations/007_notification_log.sql` — table + indexes + RLS.
- `apps/web/src/lib/notifications/sms.ts` — `sendSms({to,text})`, Zadarma driver, `isSmsConfigured()`.
- `apps/web/src/lib/notifications/reminders.ts` — **pure** helpers (below).
- `apps/web/src/app/api/cron/reminders/route.ts` — the cron endpoint.
- `apps/web/scripts/test-reminders.mjs` — unit tests for the pure helpers.

**Modified**
- `apps/web/src/lib/notifications/owner-email.ts` — add `buildOwnerAgendaEmail` (pure) + `sendOwnerAgendaEmail`.
- `apps/web/src/types/database.ts` — add `notification_log` row/insert types.
- `apps/web/vercel.json` — add the reminders cron entry.

## Data model — migration `007_notification_log.sql`

```sql
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
```

- **Writes are service-role only** (the cron). No `insert/update` policy for `authenticated` → the dashboard can read the log but cannot write it. Service role bypasses RLS.
- **`dedupe_key`** values:
  - customer SMS: `sms:appt:<appointment_id>` (one per appointment, ever).
  - owner agenda: `email:agenda:<YYYY-MM-DD>` (one per org per Sofia day).
- **Idempotency = claim-then-send.** Insert the guard row first with `on conflict (organization_id, dedupe_key) do nothing returning id`. No row returned → already handled → skip. Row returned → we own it → send → on failure `update … set status='failed', error=…`.
- **v1 limitation (documented, accepted):** a failed send is logged and **not retried** (the reminder window is same-evening; the next cron is a day later, too late to be useful). Failures surface in `notification_log`.

## Pure helpers — `lib/notifications/reminders.ts`

All take plain data and a `now: Date`, so they're deterministic and unit-tested with no network/DB.

- `sofiaDayWindow(now, offsetDays)` → `{ startUtc: Date, endUtc: Date, dateLabel: string /* DD.MM */, isoDate: string /* YYYY-MM-DD */ }`. Returns the UTC instants bounding the Sofia **calendar day** `offsetDays` from `now`. **DST-correct** via `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' })` to read Sofia Y-M-D and the zone offset for that date. For reminders `offsetDays = 1` (tomorrow).
- `selectDueAppointments(rows, window)` → the subset with `status ∈ {requested, confirmed}`, a non-empty `customer_phone`, and `starts_at ∈ [window.startUtc, window.endUtc)`. Pure filter over rows already fetched by the route.
- `formatSofiaTime(startsAtIso)` → `HH:MM` in Europe/Sofia.
- `buildReminderSms(appt, org)` → BG string, terse (target ≤ ~140 Cyrillic chars ≈ ≤ 2 SMS segments):
  `Напомняне: утре ${DD.MM} ${HH:MM} имате час${service ? ` за ${service}` : ""} при ${orgName}. Промяна: ${ownerPhone}` (ownerPhone = `organizations.owner_phone`; omit the "Промяна" clause if null).
- `buildOwnerAgendaEmail(appts, org, dateLabel)` → `{ subject, text, html }`:
  - subject: `Утрешна програма (${dateLabel}) — ${appts.length} ${appts.length === 1 ? "час" : "часа"}`
  - body: one line per appt, sorted by time: `${HH:MM} — ${customer_name ?? "Клиент"} (${customer_phone ?? "—"}) · ${service_type ?? "—"}${location ? ` · ${location}` : ""}`.
- `smsDedupeKey(appointmentId)` → `sms:appt:<id>`; `agendaDedupeKey(isoDate)` → `email:agenda:<isoDate>`.

**Empty day:** if `selectDueAppointments` is empty, no SMS; if the org's tomorrow list is empty, **no agenda email** (no noise).

## SMS provider — `lib/notifications/sms.ts`

Mirrors `owner-email.ts`: graceful no-op when unconfigured, isolated driver.

- `isSmsConfigured()` → all of `ZADARMA_API_KEY`, `ZADARMA_API_SECRET`, `ZADARMA_SMS_SENDER` present.
- `sendSms({ to, text })` → `{ sent: boolean; skipped?: boolean; error?: string }`. If not configured → `{ sent:false, skipped:true }`.
- **Zadarma driver** (proven this session against `/v1/info/balance/`): signed `POST /v1/sms/send/` with form params `number` (normalized international, digits only), `message` (text), `caller_id` (`ZADARMA_SMS_SENDER`). Signature: `sign = base64( hmacSha1Hex( method + sortedParamString + md5(sortedParamString), secret ) )`, header `Authorization: {ZADARMA_API_KEY}:{sign}`. Response `{ status: 'success' | 'error', message? }`.
- **Phone normalization** `normalizeMsisdn(phone)` → strip spaces/`()-`; `+359…`/`00359…` → `359…`; local `0XXXXXXXXX` → `359XXXXXXXXX` (BG default). The plan first checks for an existing normalizer in `lib/vapi/payload.ts` and reuses it if present.

## Owner agenda email — `lib/notifications/owner-email.ts` (extended)

- `sendOwnerAgendaEmail({ to, subject, text, html })` → same Resend `fetch` as `sendOwnerLeadEmail`. Recipient resolved by the route as `organizations.billing_email ?? process.env.OWNER_NOTIFICATION_EMAIL`. Skips (returns `{sent:false}`) if no key or no recipient.

## Cron route — `app/api/cron/reminders/route.ts`

- `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`
- `GET` and `POST` both run the batch (Vercel Cron issues `GET`).
- **Auth** identical shape to the sync route: authorized if `Authorization: Bearer <CRON_SECRET>` matches; when `CRON_SECRET` is unset, allowed only outside production. **Reuses the existing `CRON_SECRET`** already used by the Google sync cron — no new secret.
- Query params: `?dryRun=1` (plan only, no send, no log writes), `?organization=<slug>` (limit to one org for testing).
- Returns JSON summary: per org `{ smsPlanned, smsSent, smsFailed, agenda: "sent"|"skipped"|"failed" }` + totals; in `dryRun` also the concrete SMS texts + agenda subject/body.

## vercel.json

Add alongside the existing sync cron (result: 2 crons — within Hobby's limit):

```json
{
  "crons": [
    { "path": "/api/calendar/google/sync", "schedule": "0 3 * * *" },
    { "path": "/api/cron/reminders", "schedule": "0 16 * * *" }
  ]
}
```

`0 16 * * *` = 16:00 UTC ≈ **18:00 Sofia (winter) / 19:00 Sofia (summer)** — an evening send year-round.

## Environment variables

**New (Vercel + `.env.local`):**
- `ZADARMA_API_KEY`, `ZADARMA_API_SECRET`, `ZADARMA_SMS_SENDER`

**Reused (already set):** `CRON_SECRET`, `RESEND_API_KEY`, `OWNER_NOTIFICATION_EMAIL`, `OWNER_NOTIFICATION_FROM`.

## Prerequisites (user, outside code)

1. **Rotate** the Zadarma API key/secret (they were shared via screenshot) → set the new values in Vercel env + `.env.local`.
2. **Set the SMS sender** → `ZADARMA_SMS_SENDER`. **Free path (default): use your Zadarma phone number** (e.g. `35924372749`) — no registration, no fee; works as long as that number supports outgoing SMS (verify in the Zadarma panel or with one test send). Optional branded path (later): an alphanumeric Sender ID with the company name costs €20 + a company certificate + up to ~15 business days approval — **not needed to launch**.
3. Apply migration `007` via the Supabase SQL editor.

## Security

- Zadarma secret is persisted **only after rotation**, to Vercel env + `.env.local` (git-ignored) — never committed, never printed.
- Cron is authorized by `CRON_SECRET`; it cannot be triggered anonymously in production.
- Service-role writes to `notification_log` bypass RLS by design; dashboard reads stay org-scoped by RLS.

## Testing

- **Pure unit tests** (`scripts/test-reminders.mjs`, via the `ts.transpileModule` harness): `sofiaDayWindow` across both DST sides, `selectDueAppointments` (status / phone / window filters), `buildReminderSms` (content + ≤ 2-segment length), `buildOwnerAgendaEmail` (subject/body, empty→skip), dedupe-key builders.
- **Production dry-run:** `GET /api/cron/reminders?dryRun=1&organization=<slug>` → confirm planned SMS texts + agenda without sending.
- **One live test SMS** to the user's own number (explicit authorization), watching the Zadarma balance.
- **Idempotency:** run the batch twice → second run sends 0 (all deduped).

## Out of scope (YAGNI — revisit later)

- Per-org reminder on/off toggle and custom send times (v1: env-presence = on/off, fixed evening time).
- Customer **email** reminders (no email captured on phone calls).
- A second SMS (e.g. 2h before), and WhatsApp/Telegram channels.
- Automatic retry of failed sends.
- Reschedule/cancel deep-links inside the SMS.

## Rollout

Apply migration 007 → set env (rotated Zadarma key + Sender ID) → `git push origin main` (deploy) → dry-run verify on prod → one live test SMS → live.
