# Phase 7 Slice 2 — Post-Call Appointment Confirmation SMS ("C1") — Design

**Date:** 2026-07-02
**Status:** Approved
**Depends on:** Phase 6 (SMS driver + `notification_log`), Phase 7 slice 1 (per-org SMS toggle pattern)

## 1. Goal

When a Vapi call books an appointment, send the caller **one** SMS confirming the booking (date, time, service, business, change-contact) immediately after the call ends. Opt-in per organization, idempotent, reusing the existing Phase 6/7 SMS machinery.

## 2. Context — why this slice

- Phase 6 sends a reminder the **day before** the appointment. Phase 7 slice 1 sends a recovery SMS for **missed** calls. This slice fills the gap: an **instant confirmation** the moment a booking is made — reduces no-shows, looks professional, closes the loop while the caller still remembers.
- Appointments are created **mid-call** by the `book_appointment` tool (`lib/vapi/calendar-tools.ts:144`), which stores the row with `vapi_call_id`, `customer_phone` (already normalized to `+359…`), `starts_at`, and `service_type`. That `vapi_call_id` is the clean join key for "what did this call book".

## 3. Trigger & flow (chosen: end-of-call)

On the existing `end-of-call-report` webhook (`api/vapi/end-of-call/route.ts`), after the call row is stored and next to the missed-call recovery block, call `maybeSendAppointmentConfirmation(supabase, organizationId, vapiCallId, fallbackPhone)`:

1. Load the org row: `appointment_confirmation_sms_enabled`, `appointment_confirmation_sms_template`, `name`, `owner_phone`. If disabled → return.
2. Query `appointments` where `organization_id = <org>` AND `vapi_call_id = <this call>` AND `status IN ('requested','confirmed')` AND `starts_at` is in the future.
3. For each appointment: target phone = `customer_phone` ?? `fallbackPhone` (the call's caller number). Skip if neither is present.
4. **Claim-then-send** via `notification_log` — kind `appointment_confirmation`, dedupe_key `confirm:appt:<appointmentId>`. If the claim row already exists → skip (idempotent).
5. Compose the SMS via `buildConfirmationSms` and send via `sendSms`. On failure, mark the log row `status='failed'` (not retried).
6. The whole call is wrapped in try/catch in the route so it never breaks the webhook 200 (same as recovery).

**Rationale (end-of-call over alternatives):** single clean integration point; the call is over, so the SMS is a written record (the caller already heard the verbal confirmation); reuses the existing org resolution; naturally excludes non-booking calls.
Alternatives considered: (B) send at `book_appointment` mid-call — rejected, the caller is still on the line and the logic scatters into calendar-tools; (C) nightly cron — rejected, not instant, which defeats the purpose.

**Interaction with recovery:** a call that booked has captured intent, so it is never classified as a "miss" → confirmation and recovery are mutually exclusive per call.

## 4. Data model — migration 010

`supabase/migrations/010_appointment_confirmation.sql` (idempotent; applied manually by the user):

- `alter table organizations add column if not exists appointment_confirmation_sms_enabled boolean not null default false;`
- `alter table organizations add column if not exists appointment_confirmation_sms_template text;`
- Drop + recreate `notification_log_kind_check` to add `'appointment_confirmation'` to the existing allowed kinds (mirrors what migration 008 did for `'missed_call_recovery'`).

Types updated in `apps/web/src/types/database.ts` (organizations Row + Insert).

## 5. Pure module — `lib/notifications/appointment-confirmation.ts`

Testable, no I/O. Exports:

- `DEFAULT_CONFIRMATION_TEMPLATE` = `"Здравейте! Записахме Ви час за {service} на {date} в {time} ч. при {business}. За промяна: {phone}. Благодарим!"`
- `ConfirmationAppointment` type — `{ id, starts_at, service_type, customer_phone }`.
- `ConfirmationOrg` type — `{ name, owner_phone }`.
- `buildConfirmationSms(appt, org, template?): string` — fills `{date}` (DD.MM via `sofiaDateLabel`), `{time}` (HH:MM via `formatSofiaTime`), `{service}`, `{business}` (org.name), `{phone}` (org.owner_phone). Graceful: missing service → the "за {service}" clause collapses to "час"; missing owner_phone → the "За промяна: {phone}." sentence is dropped; empty/whitespace template → DEFAULT.
- `confirmDedupeKey(appointmentId): string` → `confirm:appt:<id>`.

Tested via `apps/web/scripts/test-confirmation.mjs` (transpile + data-URL import), asserting placeholder filling, missing-service and missing-phone variants, default fallback, and the dedupe key.

## 6. I/O helper — `maybeSendAppointmentConfirmation`

Mirrors `maybeSendMissedCallRecovery`. Signature: `(supabase, organizationId: string, vapiCallId: string | null, fallbackPhone: string | null): Promise<void>`. Implements steps 1–6 above. Uses the same claim-then-send as Phase 6/7 (insert the `notification_log` row with `ignoreDuplicates`; empty result = already sent = skip). Reuses `sendSms` and `isSmsConfigured` from `lib/notifications/sms.ts`.

## 7. Settings UI

Extend the Settings page (`(dashboard)/settings/`) with a confirmation section mirroring the missed-call form:

- Toggle bound to `appointment_confirmation_sms_enabled`.
- Textarea for `appointment_confirmation_sms_template` with a hint listing the placeholders `{date} {time} {service} {business} {phone}` (empty = default).
- New server action `updateConfirmationSettings(formData)` — owner/admin gated (RLS "admins can update organizations" from migration 001), `revalidatePath("/settings")`.

## 8. Phone target & cost

Target = `appointment.customer_phone` (normalized E.164 at book time) with fallback to the call's caller number. **Not** gated to BG-mobile (parity with the reminder — the customer explicitly gave/used this number when booking). No SMS if neither phone is present.

## 9. Error handling & idempotency

- `notification_log` claim-then-send → exactly one confirmation per appointment, resilient to Vapi webhook retries.
- Distinct dedupe namespace (`confirm:appt:` vs the reminder's `sms:appt:`) so a customer can receive both a confirmation (now) and a next-day reminder.
- All failures are logged, never retried, and never break the webhook (try/catch in the route).

## 10. Testing & success criteria

- **Unit:** `buildConfirmationSms` (all placeholders; missing service; missing phone; default template) + `confirmDedupeKey`.
- **Build gate:** `tsc` clean, `next build` succeeds.
- **Live E2E:** enable in Settings → make a booking call → one correct confirmation SMS arrives; no duplicate on webhook retry; no SMS when disabled; no SMS for a call that didn't book.

## 11. Out of scope (YAGNI)

- Reschedule/cancel via SMS reply or link (change = call the business, per the template).
- Confirmations for appointments created manually in the dashboard (only AI-booked-during-call are confirmed).
- BG-mobile-only cost gate.
- Per-plan SMS gating (arrives with Phase 9 billing).
