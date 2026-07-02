# Post-Call Appointment Confirmation SMS ("C1") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Vapi call books an appointment, send the caller one confirmation SMS (date/time/service/business/change-contact) at end-of-call — opt-in per org, idempotent, reusing the Phase 6/7 SMS machinery.

**Architecture:** A dependency-free pure module composes the SMS text from pre-formatted parts; a small I/O helper on the existing `end-of-call` webhook finds the appointment(s) this call booked (matched by `vapi_call_id`), claims a `notification_log` row (dedupe), and sends via the existing Zadarma `sendSms`. A Settings form toggles it per org and edits the template.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (service-role client in the webhook, RLS client in the Settings action), Zadarma SMS, TypeScript. Tests via the repo's `scripts/test-*.mjs` transpile + data-URL harness.

**Spec:** `docs/superpowers/specs/2026-07-02-phase-7-post-call-confirmation-design.md`

---

## File Structure

- **Create** `supabase/migrations/010_appointment_confirmation.sql` — 2 org columns + widen `notification_log_kind_check`.
- **Modify** `apps/web/src/types/database.ts` — add the 2 columns to organizations Row/Insert.
- **Create** `apps/web/src/lib/notifications/appointment-confirmation.ts` — pure, no imports: `DEFAULT_CONFIRMATION_TEMPLATE`, `buildConfirmationSms(vars, template)`, `confirmDedupeKey(id)`.
- **Create** `apps/web/scripts/test-confirmation.mjs` — unit tests for the pure module.
- **Modify** `apps/web/src/app/api/vapi/end-of-call/route.ts` — add `maybeSendAppointmentConfirmation` + wire it into POST.
- **Modify** `apps/web/src/app/(dashboard)/settings/actions.ts` — add `updateConfirmationSettings`.
- **Create** `apps/web/src/app/(dashboard)/settings/confirmation-form.tsx` — client form (mirrors `missed-call-form.tsx`).
- **Modify** `apps/web/src/app/(dashboard)/settings/page.tsx` — load the 2 columns, render `<ConfirmationForm />`.

**Key decision — `vapi_call_id` matching:** appointments are booked mid-call by `calendar-tools.ts` which stores `vapi_call_id = getExternalEventId(message)` = `"tool-calls:<callId>"`; `calls.vapi_call_id` (and migration 006's intent) is the raw `<callId>`. To be robust to both encodings, the helper matches `vapi_call_id IN [rawId, "tool-calls:" + rawId]`.

**Key decision — pure module has NO imports:** the test harness strips `import` lines, so a module that imported `reminders.ts` would break at runtime. Therefore `buildConfirmationSms` receives already-formatted `date`/`time` strings; the webhook helper computes them via `formatSofiaTime`/`sofiaDateLabel` at the call site (DRY preserved, no duplication of the date logic).

---

### Task 1: Migration 010 + database types

**Files:**
- Create: `supabase/migrations/010_appointment_confirmation.sql`
- Modify: `apps/web/src/types/database.ts`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/010_appointment_confirmation.sql`:

```sql
begin;

-- 1) allow the new notification kind (008 set a 3-value check; recreate to add the 4th)
alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('appointment_reminder', 'owner_daily_agenda', 'missed_call_recovery', 'appointment_confirmation'));

-- 2) per-business control (default OFF; opt-in)
alter table public.organizations
  add column if not exists appointment_confirmation_sms_enabled boolean not null default false,
  add column if not exists appointment_confirmation_sms_template text;

commit;
```

- [ ] **Step 2: Add the columns to database types (Row)**

In `apps/web/src/types/database.ts`, in the organizations table **Row**, replace:

```ts
          missed_call_sms_enabled: boolean;
          missed_call_sms_template: string | null;
          recording_retention_days: number;
```

with:

```ts
          missed_call_sms_enabled: boolean;
          missed_call_sms_template: string | null;
          appointment_confirmation_sms_enabled: boolean;
          appointment_confirmation_sms_template: string | null;
          recording_retention_days: number;
```

- [ ] **Step 3: Add the columns to database types (Insert)**

In the same file, in the organizations **Insert**, replace:

```ts
          missed_call_sms_enabled?: boolean;
          missed_call_sms_template?: string | null;
          recording_retention_days?: number;
```

with:

```ts
          missed_call_sms_enabled?: boolean;
          missed_call_sms_template?: string | null;
          appointment_confirmation_sms_enabled?: boolean;
          appointment_confirmation_sms_template?: string | null;
          recording_retention_days?: number;
```

- [ ] **Step 4: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no new errors (the migration file is not compiled; types compile clean).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/010_appointment_confirmation.sql apps/web/src/types/database.ts
git commit -m "feat(phase-7): migration 010 + types for appointment-confirmation SMS"
```

---

### Task 2: Pure confirmation module (TDD)

**Files:**
- Create: `apps/web/src/lib/notifications/appointment-confirmation.ts`
- Test: `apps/web/scripts/test-confirmation.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-confirmation.mjs`:

```js
// Unit tests for pure appointment-confirmation helpers. Run (from apps/web): node ./scripts/test-confirmation.mjs
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

const { DEFAULT_CONFIRMATION_TEMPLATE, buildConfirmationSms, confirmDedupeKey } = await loadModule([
  "src",
  "lib",
  "notifications",
  "appointment-confirmation.ts",
]);

const full = {
  service: "Ремонт",
  date: "03.07",
  time: "14:00",
  business: "Демо ЕООД",
  phone: "+359888123456",
};

// --- full substitution against default template ---
const s1 = buildConfirmationSms(full, null);
assert.ok(s1.includes("Ремонт") && s1.includes("03.07") && s1.includes("14:00"), "date/time/service present");
assert.ok(s1.includes("Демо ЕООД") && s1.includes("+359888123456"), "business + phone present");
assert.ok(!s1.includes("{"), "no leftover placeholder");

// --- custom template ---
assert.equal(
  buildConfirmationSms(full, "Час: {date} {time} - {service} ({business})"),
  "Час: 03.07 14:00 - Ремонт (Демо ЕООД)",
  "custom template substituted"
);

// --- missing service: "за {service}" clause collapses, no leftover ---
const s2 = buildConfirmationSms({ ...full, service: null }, null);
assert.ok(!s2.includes("{service}") && !s2.includes("за  "), "no empty service artifact");
assert.ok(s2.includes("час на 03.07"), "reads 'час на <date>' when no service");

// --- missing phone: "За промяна" clause dropped ---
const s3 = buildConfirmationSms({ ...full, phone: null }, null);
assert.ok(!s3.includes("{phone}") && !s3.includes("За промяна"), "change clause dropped when no phone");
assert.ok(s3.includes("Благодарим"), "rest of message intact");

// --- blank template falls back to default ---
assert.equal(buildConfirmationSms(full, "   "), buildConfirmationSms(full, null), "blank template = default");
assert.ok(DEFAULT_CONFIRMATION_TEMPLATE.includes("{service}"), "default template has placeholders");

// --- confirmDedupeKey ---
assert.equal(confirmDedupeKey("abc-123"), "confirm:appt:abc-123", "dedupe key format");

console.log("confirmation: all tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `node ./scripts/test-confirmation.mjs`
Expected: FAIL — `Missing module: .../appointment-confirmation.ts`.

- [ ] **Step 3: Write the module**

Create `apps/web/src/lib/notifications/appointment-confirmation.ts`:

```ts
// Pure, dependency-free (the test harness strips imports). The caller passes
// already-formatted `date` (DD.MM) and `time` (HH:MM) — computed via
// reminders.ts at the call site so this module stays self-contained.

export const DEFAULT_CONFIRMATION_TEMPLATE =
  "Здравейте! Записахме Ви час за {service} на {date} в {time} ч. при {business}. За промяна: {phone}. Благодарим!";

export type ConfirmationVars = {
  service: string | null;
  date: string;
  time: string;
  business: string;
  phone: string | null;
};

export function confirmDedupeKey(appointmentId: string): string {
  return `confirm:appt:${appointmentId}`;
}

export function buildConfirmationSms(vars: ConfirmationVars, template: string | null): string {
  const base = (template && template.trim()) || DEFAULT_CONFIRMATION_TEMPLATE;
  const service = vars.service?.trim() || "";
  const phone = vars.phone?.trim() || "";

  let text = base;

  // service: drop the "за {service}" clause entirely when there is no service
  if (service) {
    text = text.replace(/\{service\}/g, service);
  } else {
    text = text.replace(/за\s*\{service\}\s*/g, "").replace(/\{service\}/g, "");
  }

  // phone: drop the "За промяна: {phone}." clause entirely when there is no phone
  if (phone) {
    text = text.replace(/\{phone\}/g, phone);
  } else {
    text = text.replace(/За промяна:\s*\{phone\}\.?\s*/g, "").replace(/\{phone\}/g, "");
  }

  text = text
    .replace(/\{date\}/g, vars.date)
    .replace(/\{time\}/g, vars.time)
    .replace(/\{business\}/g, vars.business);

  return text.replace(/\s{2,}/g, " ").trim();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `node ./scripts/test-confirmation.mjs`
Expected: PASS — `confirmation: all tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/notifications/appointment-confirmation.ts apps/web/scripts/test-confirmation.mjs
git commit -m "feat(phase-7): pure appointment-confirmation SMS composer + tests"
```

---

### Task 3: Webhook helper + wiring

**Files:**
- Modify: `apps/web/src/app/api/vapi/end-of-call/route.ts`

- [ ] **Step 1: Add imports**

At the top of `end-of-call/route.ts`, replace this line:

```ts
import { sofiaDayWindow } from "@/lib/notifications/reminders";
```

with:

```ts
import { sofiaDayWindow, formatSofiaTime, sofiaDateLabel } from "@/lib/notifications/reminders";
import { buildConfirmationSms, confirmDedupeKey } from "@/lib/notifications/appointment-confirmation";
```

- [ ] **Step 2: Wire the call into the POST handler**

In `end-of-call/route.ts`, find the missed-call recovery block:

```ts
  try {
    await maybeSendMissedCallRecovery(supabase, resolution.organizationId, callInsert);
  } catch (error) {
    console.error("Missed-call recovery failed", error);
  }

  return NextResponse.json({ ok: true, stored: "call", callId: call.id });
```

Replace it with (adds the confirmation call before the return):

```ts
  try {
    await maybeSendMissedCallRecovery(supabase, resolution.organizationId, callInsert);
  } catch (error) {
    console.error("Missed-call recovery failed", error);
  }

  try {
    await maybeSendAppointmentConfirmation(supabase, resolution.organizationId, callInsert);
  } catch (error) {
    console.error("Appointment confirmation failed", error);
  }

  return NextResponse.json({ ok: true, stored: "call", callId: call.id });
```

- [ ] **Step 3: Add the helper function**

In `end-of-call/route.ts`, immediately after the closing brace of `maybeSendMissedCallRecovery`, add:

```ts
async function maybeSendAppointmentConfirmation(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  organizationId: string,
  callInsert: NonNullable<ReturnType<typeof buildCallInsert>>
): Promise<void> {
  const { data: org } = await supabase
    .from("organizations")
    .select("name, owner_phone, appointment_confirmation_sms_enabled, appointment_confirmation_sms_template")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org || !org.appointment_confirmation_sms_enabled) return;

  const rawId = callInsert.vapi_call_id;
  if (!rawId) return;

  // Appointments are booked mid-call by calendar-tools with vapi_call_id from
  // getExternalEventId() -> "tool-calls:<id>"; calls.vapi_call_id is the raw <id>.
  // Match both encodings so we find whatever this call booked.
  const { data: appts } = await supabase
    .from("appointments")
    .select("id, starts_at, service_type, customer_phone")
    .eq("organization_id", organizationId)
    .in("vapi_call_id", [rawId, `tool-calls:${rawId}`])
    .in("status", ["requested", "confirmed"])
    .gt("starts_at", new Date().toISOString());
  if (!appts || appts.length === 0) return;

  for (const appt of appts) {
    if (!appt.starts_at) continue;
    const to = (appt.customer_phone && appt.customer_phone.trim()) || callInsert.caller_number;
    if (!to) continue;

    const dedupeKey = confirmDedupeKey(appt.id);

    // Claim-then-send: insert wins the race; a duplicate returns no rows -> skip.
    const { data: claimed } = await supabase
      .from("notification_log")
      .upsert(
        {
          organization_id: organizationId,
          channel: "sms",
          kind: "appointment_confirmation",
          appointment_id: appt.id,
          dedupe_key: dedupeKey,
          destination: to,
          status: "sent",
          sent_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true }
      )
      .select("id");
    if (!claimed || claimed.length === 0) continue; // already confirmed

    const text = buildConfirmationSms(
      {
        service: appt.service_type,
        date: sofiaDateLabel(appt.starts_at),
        time: formatSofiaTime(appt.starts_at),
        business: org.name,
        phone: org.owner_phone,
      },
      org.appointment_confirmation_sms_template
    );
    const result = await sendSms({ to, text });
    if (!result.sent) {
      await supabase
        .from("notification_log")
        .update({ status: "failed", error: result.error ?? "unknown", sent_at: null })
        .eq("organization_id", organizationId)
        .eq("dedupe_key", dedupeKey);
    }
  }
}
```

- [ ] **Step 4: Typecheck + build**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: clean.
Run (from `apps/web`): `npm run build`
Expected: succeeds (tolerates the 2 pre-existing `react/no-unescaped-entities` lint errors in `behavior-tab.tsx` and `reports/page.tsx` — not ours).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/vapi/end-of-call/route.ts
git commit -m "feat(phase-7): send appointment-confirmation SMS on end-of-call"
```

---

### Task 4: Settings toggle + editable template

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/actions.ts`
- Create: `apps/web/src/app/(dashboard)/settings/confirmation-form.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add the server action**

In `apps/web/src/app/(dashboard)/settings/actions.ts`, append after `updateMissedCallSettings` (keep `updateRetentionDays` intact):

```ts
export async function updateConfirmationSettings(formData: FormData): Promise<ActionResult> {
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

  const enabled = formData.get("enabled") === "on";
  const rawTemplate = (formData.get("template") as string | null)?.trim() ?? "";
  const template = rawTemplate === "" ? null : rawTemplate;

  const { error } = await supabase
    .from("organizations")
    .update({
      appointment_confirmation_sms_enabled: enabled,
      appointment_confirmation_sms_template: template,
    })
    .eq("id", org.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
```

- [ ] **Step 2: Create the client form**

Create `apps/web/src/app/(dashboard)/settings/confirmation-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { updateConfirmationSettings } from "./actions";

const ERRORS: Record<string, string> = {
  no_org: "Няма активна организация.",
  not_admin: "Нужни са права на администратор.",
};

export function ConfirmationForm({
  enabled,
  template,
  placeholder,
}: {
  enabled: boolean;
  template: string;
  placeholder: string;
}) {
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
      const result = await updateConfirmationSettings(formData);
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
        <div className="text-sm font-semibold">SMS потвърждение за записан час</div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {"Щом асистентът запише час, пращаме на клиента SMS с датата и часа."}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4" />
        <span className="font-medium">Включи автоматичното SMS</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">
          {"Текст на SMS (плейсхолдъри: {date} {time} {service} {business} {phone})"}
        </span>
        <textarea
          name="template"
          defaultValue={template}
          rows={3}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm leading-relaxed outline-none focus:border-[var(--accent-strong)]"
        />
        <span className="text-xs text-[var(--ink-muted)]">
          Празно поле = текст по подразбиране. Кирилица: ~70 знака = 1 SMS.
        </span>
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

- [ ] **Step 3: Wire it into the Settings page**

In `apps/web/src/app/(dashboard)/settings/page.tsx`:

(a) Replace the imports block:

```ts
import { DEFAULT_MISSED_CALL_TEMPLATE } from "@/lib/notifications/missed-call";

import { MissedCallForm } from "./missed-call-form";
import { RetentionForm } from "./retention-form";
```

with:

```ts
import { DEFAULT_MISSED_CALL_TEMPLATE } from "@/lib/notifications/missed-call";
import { DEFAULT_CONFIRMATION_TEMPLATE } from "@/lib/notifications/appointment-confirmation";

import { MissedCallForm } from "./missed-call-form";
import { ConfirmationForm } from "./confirmation-form";
import { RetentionForm } from "./retention-form";
```

(b) Replace the data-loading block:

```ts
  const org = await getActiveOrganization();
  let missedEnabled = false;
  let missedTemplate = "";
  let retentionDays = 90;
  if (org) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("missed_call_sms_enabled, missed_call_sms_template, recording_retention_days")
      .eq("id", org.id)
      .maybeSingle();
    missedEnabled = data?.missed_call_sms_enabled ?? false;
    missedTemplate = data?.missed_call_sms_template ?? "";
    retentionDays = data?.recording_retention_days ?? 90;
  }
```

with:

```ts
  const org = await getActiveOrganization();
  let missedEnabled = false;
  let missedTemplate = "";
  let confirmEnabled = false;
  let confirmTemplate = "";
  let retentionDays = 90;
  if (org) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select(
        "missed_call_sms_enabled, missed_call_sms_template, appointment_confirmation_sms_enabled, appointment_confirmation_sms_template, recording_retention_days"
      )
      .eq("id", org.id)
      .maybeSingle();
    missedEnabled = data?.missed_call_sms_enabled ?? false;
    missedTemplate = data?.missed_call_sms_template ?? "";
    confirmEnabled = data?.appointment_confirmation_sms_enabled ?? false;
    confirmTemplate = data?.appointment_confirmation_sms_template ?? "";
    retentionDays = data?.recording_retention_days ?? 90;
  }
```

(c) Replace the forms section:

```tsx
      <section className="mt-6 grid min-w-0 gap-3 lg:grid-cols-2">
        <MissedCallForm
          enabled={missedEnabled}
          template={missedTemplate}
          placeholder={DEFAULT_MISSED_CALL_TEMPLATE}
        />
        <RetentionForm days={retentionDays} />
      </section>
```

with:

```tsx
      <section className="mt-6 grid min-w-0 gap-3 lg:grid-cols-2">
        <MissedCallForm
          enabled={missedEnabled}
          template={missedTemplate}
          placeholder={DEFAULT_MISSED_CALL_TEMPLATE}
        />
        <ConfirmationForm
          enabled={confirmEnabled}
          template={confirmTemplate}
          placeholder={DEFAULT_CONFIRMATION_TEMPLATE}
        />
        <RetentionForm days={retentionDays} />
      </section>
```

- [ ] **Step 4: Typecheck + build**

Run (from `apps/web`): `npx tsc --noEmit` → clean.
Run (from `apps/web`): `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/settings/actions.ts apps/web/src/app/\(dashboard\)/settings/confirmation-form.tsx apps/web/src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat(phase-7): Settings toggle + editable template for confirmation SMS"
```

---

### Task 5: Apply migration, deploy, E2E verify

**Files:** none (ops task).

- [ ] **Step 1: Re-run the full local gate**

Run (from `apps/web`):
```bash
node ./scripts/test-confirmation.mjs
npx tsc --noEmit
npm run build
```
Expected: tests pass, tsc clean, build OK.

- [ ] **Step 2: STOP — user applies migration 010**

Ask the user to run `supabase/migrations/010_appointment_confirmation.sql` in the Supabase Dashboard SQL Editor. Wait for confirmation ("готово"). Deploy going through ≠ migration applied.

- [ ] **Step 3: Deploy**

```bash
git push origin main
```
Vercel Git integration builds + deploys.

- [ ] **Step 4: Verify deploy health**

Confirm the new commit is live via `GET /api/vapi/end-of-call` (returns `{ commit, ok }`). Do this with the user's consent (external prod fetch) or ask the user to open the URL.

- [ ] **Step 5: Live E2E (user-driven)**

1. In the app → Настройки → new "SMS потвърждение за записан час" → enable → Запази.
2. Make a test call that books an appointment (assistant runs `book_appointment`).
3. Confirm the caller receives exactly one confirmation SMS with correct date/time/service/business.
4. Confirm no duplicate arrives (webhook retry safe).
5. Toggle off → a subsequent booking call sends no SMS.

- [ ] **Step 6: Update memory**

Update `phase-7-missed-call-recovery.md` (or add a `phase-7-confirmation` note) + `world-class-roadmap.md` (mark slice 2 shipped) + `MEMORY.md` index. Link `[[phase-9-billing]]` (next).

---

## Self-Review

**1. Spec coverage:**
- §3 trigger/flow → Task 3 (helper + wiring). ✓
- §4 migration 010 → Task 1. ✓
- §5 pure module (buildConfirmationSms/confirmDedupeKey/DEFAULT) → Task 2. ✓
- §6 I/O helper (claim-then-send) → Task 3. ✓
- §7 Settings UI → Task 4. ✓
- §8 phone target + fallback → Task 3 (`customer_phone ?? caller_number`). ✓
- §9 idempotency (distinct dedupe namespace) → Task 2 (`confirm:appt:`) + Task 3. ✓
- §10 testing + success criteria → Task 2 + Task 5. ✓
- §11 out-of-scope respected (no reschedule, no manual-appointment confirmations, no BG-mobile gate, no plan-gating). ✓

**2. Placeholder scan:** none — every step has exact code/commands.

**3. Type consistency:** `buildConfirmationSms(vars, template)` and `ConfirmationVars` are used identically in Task 2 (definition + test) and Task 3 (call site). `confirmDedupeKey` returns `confirm:appt:<id>` in both. `formatSofiaTime`/`sofiaDateLabel` exist in `reminders.ts` and are imported in Task 3. `sendSms({to,text})` matches `lib/notifications/sms.ts`. notification_log columns (`channel, kind, appointment_id, dedupe_key, destination, status, sent_at, error`) match `maybeSendMissedCallRecovery`. Org columns match Task 1 types.
