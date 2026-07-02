# Phase 7 (slice 1) — Missed-Call Recovery SMS Design

**Date:** 2026-07-02
**Status:** Approved (brainstorming) — ready for implementation plan
**Builds on:** `lib/notifications/sms.ts` (Zadarma driver, Phase 6), `notification_log` (Phase 6 idempotency), the Vapi webhook `api/vapi/end-of-call/route.ts`, `lib/vapi/payload.ts`, migrations 001–007.

## Goal

When an inbound call ends **without a successful outcome** — a technical failure / no-engagement, **or** a very short hang-up with no captured intent — automatically send **one recovery SMS** to the caller ("we missed you, call back"). Real-time, triggered by the existing Vapi webhook, multi-tenant, **opt-in per business**, idempotent (never double-send), reusing the Phase 6 SMS + `notification_log` machinery.

This is **slice 1 of Phase 7 (Omnichannel)**. It is the narrow, literal "missed-call text-back".

## Decisions locked during brainstorming

1. **Scope = missed/dropped recovery only** (not post-call confirmations, not two-way SMS, not web chat).
2. **Miss classification = broad**: technical-failure `endedReason` **OR** short call (< 15s), and **no captured intent**. Successful calls (real content captured) are always excluded.
3. **Control = per-business toggle + editable template**, surfaced in the existing Settings page. **Default OFF** (a paid, customer-facing SMS must be opt-in).
4. **Trigger = the existing Vapi webhook** (`end-of-call-report`). No new cron — empirically confirmed the webhook fires for failed calls too (see below).
5. **Timing = immediate** on the webhook (awaited before the 200 so it reliably sends on Vercel serverless). No delay/queue.
6. **Provider = Zadarma** via the existing `sendSms()`; the account default sender ("Teamsale") as in Phase 6.

## Empirical grounding (production `webhook_events` + `calls`, read-only)

Verified against real data before designing:

- **The webhook receives `end-of-call-report` for failed calls too**, with a diagnostic `endedReason`. Observed: `customer-ended-call` (8), `silence-timed-out` (1), `call.in-progress.error-assistant-did-not-receive-customer-audio` (1). → a real-time webhook trigger is sufficient; **no cron-scan needed**.
- **`endedReason` is not stored today.** It lives at `payload.message.endedReason`. We will extract + store it on `calls.ended_reason` (classification + audit).
- **`calls.status` is hard-coded to `"completed"`** for every `end-of-call-report` (route.ts). It is **not** a miss signal. We classify by `ended_reason` + `duration_seconds` + captured-intent instead.
- **`caller_number` was null for 7 of 8 calls** — those are web/test calls with no PSTN caller ID. Recovery can only fire when a real number exists; numberless calls are **skipped silently** (expected).

### Critical code caveat that shapes the classifier

`buildCallInsert` in `payload.ts` calls `inferStructuredData(...)` which **injects `phone = callerNumber`** into the structured data. `inferDisposition` then counts the presence of `phone` as lead data, so **any call with a real caller number gets `disposition = 'lead'` (or `'appointment'`), never `'unknown'`.** Therefore `disposition === 'unknown'` **cannot** be used as the "no captured lead" gate — it would exclude exactly the calls we can act on. The success gate is instead **real intent** (name / service / city / appointment), computed **excluding the auto-injected phone**.

## Architecture & data flow

```
Vapi end-of-call-report ──► POST /api/vapi/end-of-call   (existing auth)
                                 │  service-role Supabase client
                                 │  resolve organization (existing)
                                 ▼
   upsert call  (now also stores ended_reason)
   lead logic   (existing — unchanged)
                                 │
                                 ▼
   fetch org settings (name, missed_call_sms_enabled, missed_call_sms_template)
   compute capturedIntent from structured_data (name/service/city/appointment, NOT phone)
   classifyMissedCall({ callerNumber, endedReason, durationSeconds, disposition, capturedIntent })
                                 │
              isMiss && org.missed_call_sms_enabled ?
                                 │ yes
                                 ▼
   claim notification_log row (kind='missed_call_recovery',
        dedupe_key = `miss:<e164>:<sofia-date>`, insert … on conflict do nothing)
   if claimed → await sendSms(Zadarma, buildMissedCallSms(template,{business})) → update status sent|failed
                                 │
                                 ▼
                              return 200
```

Any failure in the recovery step (SMS error, missing config) is logged and swallowed — the webhook still returns 200 so Vapi is never disrupted.

## Components (files)

**New**
- `supabase/migrations/008_missed_call_recovery.sql` — new `notification_log.kind` value; `organizations` toggle + template columns; `calls.ended_reason`.
- `apps/web/src/lib/notifications/missed-call.ts` — **pure** classifier + template + helpers (below).
- `apps/web/scripts/test-missed-call.mjs` — unit tests for the pure helpers.

**Modified**
- `apps/web/src/lib/vapi/payload.ts` — extract `ended_reason` into `buildCallInsert` (only change here).
- `apps/web/src/app/api/vapi/end-of-call/route.ts` — after the lead block: compute `capturedIntent` inline from `callInsert.structured_data`, run classification, claim-then-send.
- `apps/web/src/types/database.ts` — add `calls.ended_reason` and `organizations.missed_call_sms_enabled` / `missed_call_sms_template`.
- Settings page + its server action (`app/(dashboard)/settings/…`) — toggle + template field, saved via the existing RLS-guarded settings action.

## Data model — migration `008_missed_call_recovery.sql`

```sql
begin;

-- 1) allow the new notification kind (007 created an inline column check named
--    notification_log_kind_check; drop + recreate to add the value)
alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('appointment_reminder', 'owner_daily_agenda', 'missed_call_recovery'));

-- 2) per-business control (default OFF; opt-in)
alter table public.organizations
  add column if not exists missed_call_sms_enabled boolean not null default false,
  add column if not exists missed_call_sms_template text;

-- 3) store Vapi endedReason for classification + audit
alter table public.calls
  add column if not exists ended_reason text;

commit;
```

Applied manually by the user in the Supabase SQL editor (project convention). No RLS change needed — `organizations`/`calls` policies already exist; the new columns inherit them.

## Pure module — `lib/notifications/missed-call.ts`

```ts
export const SHORT_CALL_SECONDS = 15;

export const DEFAULT_MISSED_CALL_TEMPLATE =
  "Пропуснахме обаждането Ви до {business}. Обадете се пак, когато Ви е удобно — насреща сме!";

// Vapi endedReason strings are long/dotted (e.g. "call.in-progress.error-...").
// Match by substring, and treat ANY reason containing "error" as a miss.
const MISS_REASON_TOKENS = [
  "silence-timed-out",
  "did-not-answer",
  "no-answer",
  "customer-busy",
  "voicemail",
  "did-not-receive-customer-audio",
];

export function isMissEndedReason(reason: string | null): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  if (r.includes("error")) return true;
  return MISS_REASON_TOKENS.some((t) => r.includes(t));
}

// BG mobile numbers are 08X nationally → +3598XXXXXXXX (9 digits after +359,
// first is 8). Landlines are +3592…/+35932… etc. Foreign numbers are skipped
// (cost-safety for a BG service business).
export function isLikelyBgMobile(e164: string | null): boolean {
  return !!e164 && /^\+3598\d{8}$/.test(e164);
}

export type MissedCallInput = {
  callerNumber: string | null;
  endedReason: string | null;
  durationSeconds: number | null;
  disposition: string | null;   // calls.disposition (post phone-injection)
  capturedIntent: boolean;       // real content (name/service/city/appointment), NOT phone
};

export function classifyMissedCall(i: MissedCallInput): { isMiss: boolean; reason: string } {
  if (!isLikelyBgMobile(i.callerNumber)) return { isMiss: false, reason: "no_mobile" };
  if (i.disposition === "spam" || i.disposition === "wrong_number")
    return { isMiss: false, reason: `disposition_${i.disposition}` };
  if (i.capturedIntent) return { isMiss: false, reason: "captured_intent" };
  if (isMissEndedReason(i.endedReason)) return { isMiss: true, reason: "ended_reason" };
  if (typeof i.durationSeconds === "number" && i.durationSeconds < SHORT_CALL_SECONDS)
    return { isMiss: true, reason: "short_call" };
  return { isMiss: false, reason: "engaged_no_capture" };
}

export function buildMissedCallSms(template: string | null, vars: { business: string }): string {
  const base = (template && template.trim()) || DEFAULT_MISSED_CALL_TEMPLATE;
  return base.replace(/\{business\}/g, vars.business);
}

export function missDedupeKey(e164: string, sofiaDate: string): string {
  return `miss:${e164}:${sofiaDate}`;
}
```

`sofiaDate` (YYYY-MM-DD in Europe/Sofia) is produced by the existing Sofia date helper in `reminders.ts` (reuse/export it rather than re-deriving).

### `capturedIntent` (computed in the route from `callInsert.structured_data`)

```ts
const sd = (callInsert.structured_data ?? {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const capturedIntent = Boolean(
  str(sd.name) || str(sd.service) || str(sd.serviceType) || str(sd.service_type) ||
  str(sd.city) || str(sd.town) ||
  sd.appointment_confirmed === true || sd.appointmentConfirmed === true
);
```

## Message

Default template (editable per org), `{business}` → organization name:

> „Пропуснахме обаждането Ви до **{business}**. Обадете се пак, когато Ви е удобно — насреща сме!"

Cyrillic SMS = 70 chars/segment → ~1–2 segments (~€0.15–0.30). No reply is invited (two-way SMS is a later slice).

## Idempotency & guards

- `notification_log`, `kind='missed_call_recovery'`, **dedupe_key = `miss:<e164>:<sofia-date>`** → **at most one recovery SMS per caller per day per org** (covers both webhook re-delivery and a caller who drops repeatedly). Claim-then-send via `insert … on conflict do nothing` returning the id (empty → already sent → skip), exactly as Phase 6.
- Skipped silently: no caller number, non-BG-mobile number, `!isSmsConfigured()`, org toggle off, `capturedIntent`, spam/wrong_number disposition.
- Zadarma failure → `notification_log.status='failed'` with `error`; webhook still returns 200.

## Error handling

| Situation | Behaviour |
|---|---|
| Org not resolved | existing 202 skip (unchanged) |
| SMS env missing | `sendSms` returns `{skipped:true}`; no log row |
| Zadarma send fails | log `status='failed'`; 200 |
| Duplicate (already sent today) | claim returns empty; skip; 200 |
| No number / landline / foreign | classifier `isMiss=false`; skip |

## Testing

**Unit (TDD, pure — `scripts/test-missed-call.mjs`, same transpile+data-URL harness as Phase 6):**
- `isMissEndedReason`: matches `silence-timed-out`, dotted `…error-assistant-did-not-receive-customer-audio`, `customer-did-not-answer`; false for `customer-ended-call`, null.
- `isLikelyBgMobile`: true for `+359888123456`; false for `+35924372749` (landline), `+49…` (foreign), null.
- `classifyMissedCall`: miss on failure reason; miss on short call (<15s, no intent); **not** miss when `capturedIntent`; not miss on `customer-ended-call` + 40s; not miss without a mobile; not miss on spam/wrong_number.
- `buildMissedCallSms`: substitutes `{business}`; falls back to default on empty template.
- `missDedupeKey`: stable format.

**E2E (manual, on prod):** enable the toggle for the demo org → call the number and hang up immediately (<15s) from a real phone → receive the recovery SMS; a second immediate drop the same day sends nothing (dedupe); `notification_log` shows one `missed_call_recovery` row.

## Security

- Reuses the Phase 6 Zadarma credentials — **no new secrets**. (Standing TODO from Phase 6: rotate `ZADARMA_API_SECRET`, shared via screenshot.)
- No secret values printed; migration applied by the user.
- Recovery SMS is **opt-in per org** (default OFF) so no business sends customer SMS or incurs cost unknowingly.

## Explicitly NOT in this slice (future Phase 7 slices, own specs)

Post-call confirmation SMS for **successful** calls · two-way inbound SMS agent · web chat widget · a send delay / redial-supersede window · per-org rate caps beyond the once-per-caller-per-day dedupe · analytics on recovery→callback conversion.
