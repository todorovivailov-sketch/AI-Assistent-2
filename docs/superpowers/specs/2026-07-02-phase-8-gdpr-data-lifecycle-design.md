# Phase 8 — GDPR Data Lifecycle (Retention + Erasure + Export) — Design

**Date:** 2026-07-02
**Status:** Approved (design) — ready for implementation plan
**Phase:** 8, slice 1 (technical core). Legal document templates (DPA/Privacy Policy) are a separate fast-follow.

---

## 1. Problem & Goal

The system stores personal data of the businesses' end-callers (the *data subjects*): call
records, full transcripts, call recordings (on Vapi), captured leads (name/phone/email/city/
address), appointments, and SMS/notification logs. **Today none of it ever expires and there is
no way to honor a data-subject request.** To be legally sellable to Bulgarian/EU service
businesses, the product needs the technical controls that back a Data Processing Agreement:
storage limitation (retention) and the ability to answer access + erasure requests.

**Goal:** ship the technical core — tiered retention with automatic anonymization, plus an easy
per-caller **Export + Erase** panel — reaching into Vapi so "deleted" means deleted everywhere.

**Guiding constraint (from the owner):** *both* comply *and* stay good for the business — the
business must never lose its working customer base to the clock; only the raw, high-risk data
expires.

---

## 2. Scope

**In scope (this slice):**
- Tiered retention model + per-org configurable retention period.
- Daily cron pass that anonymizes expired calls and purges expired raw logs (incl. Vapi recording delete).
- "Лични данни / GDPR" panel: look up a caller by phone → **Export** (JSON) + **Erase**.
- Vapi call/recording deletion via API.
- Audit log of GDPR actions.

**Out of scope (fast-follows, own specs):**
- DPA + Privacy Policy templates (content + legal review, not code).
- Broad audit log of all data access / agent actions.
- PII redaction *inside* retained transcripts (NLP).
- Consent capture — already shipped in Phase 1 (recording-consent line in the voice agent).

---

## 3. Core model — tiered retention (the key idea)

Retention is **not one global timer**. Data is split by purpose and risk:

- **Tier A — raw, sensitive, low business value:** call recording, full transcript,
  `raw_payload`, and the raw event/notification logs. Purpose is call verification/QA. Nobody
  runs a business on an 8-month-old recording. → **auto-expires** after
  `recording_retention_days` (default 90), via **anonymization** (not row deletion) so the
  Reports/ROI aggregates survive. Recording is also deleted at Vapi.
- **Tier B — CRM the business actually uses:** `leads` and `appointments` (name, phone,
  service). Legitimate, ongoing business purpose. → **never expires on a timer.** Removed only by
  a manual delete or an erasure request.

**Erasure** ("right to be forgotten") is a targeted response to *one* caller's request — it
scrubs that person everywhere, immediately. It is rare and manual; it does not wipe the CRM.

**Anonymization = compliance-grade deletion:** once a row's direct identifiers are irreversibly
cleared, it is no longer "personal data", so keeping the de-identified remainder (duration,
disposition, revenue, appointment slot) is GDPR-fine and keeps analytics intact.

---

## 4. Data model changes — migration `009_gdpr_data_lifecycle.sql`

```sql
begin;

-- Tier A anonymization marker on calls
alter table public.calls
  add column anonymized_at timestamptz;

-- Per-org Tier A retention window
alter table public.organizations
  add column recording_retention_days integer not null default 90
    check (recording_retention_days between 1 and 3650);

-- Compliance audit trail
create table public.gdpr_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('export', 'erasure', 'retention_anonymize')),
  subject_phone text,                         -- normalized E.164; null for bulk retention runs
  performed_by uuid references auth.users(id) on delete set null,  -- null = system/cron
  affected jsonb not null default '{}'::jsonb, -- {calls:n, leads:n, appointments:n, notifications:n, webhook_events:n}
  vapi_deleted integer not null default 0,
  vapi_errors integer not null default 0,
  created_at timestamptz not null default now()
);

create index gdpr_actions_org_created_at_idx
  on public.gdpr_actions (organization_id, created_at desc);

alter table public.gdpr_actions enable row level security;

create policy "members can read gdpr actions"
on public.gdpr_actions for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins can insert gdpr actions"
on public.gdpr_actions for insert to authenticated
with check (public.is_org_admin(organization_id));

grant select, insert on public.gdpr_actions to authenticated;

commit;
```

Notes:
- The cron writes `gdpr_actions` via the **service-role** client (bypasses RLS); the panel writes
  via the RLS client under the "admins can insert" policy.
- `database.ts` types updated: `calls.anonymized_at`, `organizations.recording_retention_days`,
  and the new `gdpr_actions` table.

---

## 5. PII field map

**Tier A anonymize — `calls`** (retention *and* erasure use the same call patch):
- **Cleared:** `caller_number` → null, `transcript` → null, `recording_url` → null,
  `summary` → null, `structured_data` → `'{}'`, `raw_payload` → `'{}'`; set `anonymized_at = now()`.
- **Kept (stats):** `duration_seconds`, `disposition`, `status`, `ended_reason`, `cost_*`,
  `started_at`, `ended_at`, `direction`, all FK ids.
- **Vapi:** `DELETE /call/{vapi_call_id}` before/around the DB update.

**Erasure scrub — `leads`** (rows where `phone` = subject):
- **Cleared:** `name`, `phone`, `email`, `address`, `preferred_time_text`, `ai_summary`, `notes` → null.
- **Kept:** `status`, `city`, `service_type`, `urgency`, `source`, timestamps (not direct identifiers).

**Erasure scrub — `appointments`** (rows where `customer_phone` = subject):
- **Cleared:** `customer_name`, `customer_phone`, `location`, `notes` → null; `title` (NOT NULL)
  → `'Анонимизиран запис'`.
- **Kept:** `status`, `starts_at`, `ends_at`, `service_type`, `timezone`.

**Erasure — `notification_log`** (rows where `destination` = subject): **delete rows** (pure
send-logs; `destination` and `dedupe_key` are NOT NULL and `dedupe_key` embeds the phone, so
deletion is cleaner than scrubbing).

**Erasure — `orders`** (linked via the subject's leads): clear `description`, `notes` → null;
keep amounts. (Effectively empty today; included for safety.)

**Retention-only bulk purge (all subjects, older than `recording_retention_days`):**
- `webhook_events` → **delete rows** (raw Vapi/Zadarma payloads).
- `notification_log` → **delete rows**.
- `owner_notifications` → **delete rows** (send-logs to the owner; payload may embed caller info).

---

## 6. GDPR core module — `apps/web/src/lib/gdpr/`

`subject.ts` — **pure, unit-tested**:
- `normalizePhone(raw): string | null` — collapse `0XXXXXXXXX`, `00359…`, `+359…`, spaces/dashes
  to E.164 `+3598XXXXXXXX` (reuse the Phase 7 BG-mobile shape; accept general E.164 too).
- `phoneMatchSuffix(e164): string` — trailing 8–9 digits, for a cheap SQL prefilter.
- `callAnonymizePatch()` / `leadScrubPatch()` / `appointmentScrubPatch()` / `orderScrubPatch()` —
  return the exact column→value update objects from §5. No I/O; trivially testable.

`engine.ts` — **I/O** (accepts a Supabase client so cron passes service-role, actions pass RLS):
- `gatherSubject(supabase, orgId, phone): Promise<SubjectExport>` — select matching rows across
  calls/leads/appointments/notification_log; filter by normalized-equal in JS; assemble a plain
  JSON object. (Only non-anonymized rows carry content.)
- `scrubSubject(supabase, orgId, phone): Promise<{affected, vapiDeleted, vapiErrors}>` — run the
  §5 erasure across tables + `DELETE` each affected call at Vapi; write a `gdpr_actions` row.
- `anonymizeExpiredCalls(supabase, org): Promise<{affected, vapiDeleted, vapiErrors}>` — select
  calls with `anonymized_at is null` and `coalesce(ended_at, started_at, created_at) < now() -
  retention_days`; `DELETE` each at Vapi; apply the call patch; then bulk-delete expired
  `webhook_events` / `notification_log` / `owner_notifications`; write a `gdpr_actions` row.
  Idempotent via `anonymized_at`.

Phone matching: normalize the input; SQL prefilter by suffix; confirm normalized-equal in JS
(stored phones are not guaranteed normalized).

---

## 7. Retention pass (cron)

- **Reuse the existing daily cron** (Phase 6, `0 16 * * *`) — Vercel Hobby limits cron count, so
  append a retention step rather than adding a second schedule.
- For each active organization: call `anonymizeExpiredCalls(serviceClient, org)`.
- Protected by the existing cron secret check (same as Phase 6). Wrapped in try/catch per org so
  one org's failure never aborts the run. Logs a `retention_anonymize` audit row per org.

---

## 8. Data-subject panel — "Лични данни / GDPR"

- **Page:** `apps/web/src/app/(dashboard)/privacy/page.tsx` (+ nav entry). Owner/admin only.
- **Client form** `privacy/subject-panel.tsx`: phone input → **Провери** → renders a summary of
  what is held (counts + a light preview) → two buttons:
  - **[Изтегли данните]** → hits `GET /api/privacy/export?phone=…` (route handler, `runtime =
    "nodejs"`, RLS client, org-scoped) → downloads `subject-<phone>.json` (access/portability),
    and writes an `export` audit row. Mirrors the Phase 5 CSV export pattern.
  - **[Изтрий клиента]** → server action `eraseSubject(phone)` → `scrubSubject` + audit → confirm.
- **Actions** `privacy/actions.ts`: `lookupSubject(phone)` (read preview via `gatherSubject`),
  `eraseSubject(phone)` (mutation). Both: `getActiveOrganization()` → owner/admin role gate
  (same shape as `updateMissedCallSettings`) → run against the RLS client.
- Erase requires an explicit in-form confirm (typed phone must match) to prevent accidents.

---

## 9. Vapi deletion

- Add `deleteVapiCall(vapiCallId): Promise<boolean>` to the Vapi client lib:
  `DELETE https://api.vapi.ai/call/{id}` with `Authorization: Bearer ${VAPI_PRIVATE_KEY}`.
- **Best-effort:** on non-2xx, count it in `vapi_errors` and continue — never block the DB scrub
  (a DB-only scrub still removes our copy; the Vapi copy is on its own retention and we retry
  nothing).
- **Caveat to verify live:** some users report `DELETE /call` not immediately clearing Call Logs.
  The E2E task confirms the recording is actually gone after a real delete.

---

## 10. Audit log

Every export / erasure / retention run inserts a `gdpr_actions` row (§4). This is the evidence
that a request was honored and that retention runs. Surfaced read-only at the bottom of the
privacy panel (most-recent-first) so the owner can show "we deleted X on date Y".

---

## 11. Settings

Add one field to the existing Settings page: **„Пазене на записи и транскрипти (дни)"** →
`organizations.recording_retention_days`. Wired through a server action mirroring
`updateMissedCallSettings` (owner/admin gate, RLS update). Empty/invalid → keep current; bounded
1–3650 by the DB check.

---

## 12. Authz & security

- Panel + actions: owner/admin only, org-scoped (RLS + explicit role gate).
- Export route handler: authenticated RLS client; returns only the active org's data.
- Cron: service-role client, gated by the existing cron secret.
- No new secrets/env (uses existing `VAPI_PRIVATE_KEY` and the cron secret).

---

## 13. Testing

- **Pure unit tests** — `apps/web/scripts/test-gdpr.mjs` (transpile + data-URL harness, same as
  Phase 6/7): `normalizePhone` across formats; each `*Patch()` clears exactly the §5 fields and
  keeps the rest.
- **Build gates:** `tsc` + `next build` green (tolerating the 2 pre-existing unrelated lint
  errors noted in the Phase 7 memory).
- **Live E2E (owner step):** (a) place a test call → set that org's retention to a tiny window →
  run the cron endpoint → confirm the call row is anonymized *and* the Vapi recording is gone,
  ROI stats unchanged; (b) in the panel, Export a phone → inspect JSON; Erase it → confirm gone
  from leads/appointments/calls + a `gdpr_actions` row exists.

---

## 14. Resolved decisions

1. Tier A retention default = **90 days**, per-org configurable.
2. Erasure = **anonymize** (de-identify, keep aggregates) rather than hard row deletion.
3. Export format = **JSON** file (PDF later if needed).
4. Retention runs on the **existing daily cron** (no new schedule).

---

## 15. Known limitations (documented, acceptable for slice 1)

- **Per-subject erasure does not reach into `webhook_events` / `owner_notifications` JSON
  payloads** (can't reliably target a phone inside raw JSON). These are instead purged in bulk by
  the retention timer, so residual exposure is bounded to `< recording_retention_days`.
- Vapi `DELETE /call` behavior is verified live (see §9 caveat).
- Phone matching relies on normalization; unusual stored formats that don't normalize will be
  missed by lookup/erasure (the retention timer still eventually anonymizes the call).

---

## 16. Deploy

Standard: migration `009` applied manually by the owner via Supabase SQL Editor; code deploys via
push to `main` (Vercel Git integration). Health check unchanged.

---

## Sources
- Vapi — Delete Call: https://docs.vapi.ai/api-reference/calls/delete
- Vapi — Data retention policy (community): https://vapi.ai/community/m/1374041372260175993
