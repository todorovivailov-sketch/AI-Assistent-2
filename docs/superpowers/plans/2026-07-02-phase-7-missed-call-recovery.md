# Phase 7 (slice 1) — Missed-Call Recovery SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an inbound call ends without a successful outcome (failure `endedReason` **or** a <15s hang-up with no captured intent), send one opt-in recovery SMS to the caller in real time from the existing Vapi webhook.

**Architecture:** Reuse the Phase 6 machinery. A new **pure** module (`missed-call.ts`) decides whether a finished call is a "miss" and builds the message; the Vapi `end-of-call-report` webhook runs it after storing the call, then claims a `notification_log` row (dedupe = one SMS per caller per day) and sends via the existing `sendSms` (Zadarma). Per-business opt-in toggle + editable template live on the `organizations` row and are edited from a new interactive section on the Settings page.

**Tech Stack:** Next.js 16.2.9 (App Router, RSC + server actions), Supabase (RLS client for the UI; service-role client in the webhook), Zadarma SMS, TypeScript. Tests are pure-function unit tests run with `node ./scripts/test-*.mjs` (TypeScript transpiled in-process, imports stripped, imported as a data URL).

**Spec:** `docs/superpowers/specs/2026-07-02-phase-7-missed-call-recovery-design.md`

**Conventions from prior phases (do not deviate):**
- Work directly on `main` (authorized for this project). Deploy = `git push origin main` → Vercel.
- **Migrations are applied manually by the user** in the Supabase SQL editor. Do not attempt to run them.
- Never print secret env values. No new secrets are needed (reuses Zadarma).
- Commit after every task.

**Run all commands from `apps/web/`** unless stated otherwise.

---

## File map

**New**
- `supabase/migrations/008_missed_call_recovery.sql` — new `notification_log.kind` value; `organizations` toggle + template; `calls.ended_reason`.
- `apps/web/src/lib/notifications/missed-call.ts` — pure classifier + template + helpers.
- `apps/web/scripts/test-missed-call.mjs` — unit tests for the pure module.
- `apps/web/src/app/(dashboard)/settings/actions.ts` — `updateMissedCallSettings` server action.
- `apps/web/src/app/(dashboard)/settings/missed-call-form.tsx` — client form (toggle + template).

**Modified**
- `apps/web/src/types/database.ts` — `organizations` + `calls` types.
- `apps/web/src/lib/vapi/payload.ts` — extract `ended_reason` in `buildCallInsert`.
- `apps/web/scripts/test-payload-extraction.mjs` — add an `ended_reason` assertion.
- `apps/web/src/app/api/vapi/end-of-call/route.ts` — classify + claim-then-send after the lead block.
- `apps/web/src/app/(dashboard)/settings/page.tsx` — load org settings + render the form.

---

### Task 1: Migration 008 + database types

**Files:**
- Create: `supabase/migrations/008_missed_call_recovery.sql`
- Modify: `apps/web/src/types/database.ts` (organizations ~19-48, calls ~237-284)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/008_missed_call_recovery.sql`:

```sql
begin;

-- 1) allow the new notification kind (007 created an inline column check
--    named notification_log_kind_check; drop + recreate to add the value)
alter table public.notification_log drop constraint if exists notification_log_kind_check;
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

- [ ] **Step 2: Add the `organizations` columns to the DB types**

In `apps/web/src/types/database.ts`, in the `organizations` `PublicTable`, add to the **Row** object (after `notes: string | null;`):

```ts
          missed_call_sms_enabled: boolean;
          missed_call_sms_template: string | null;
```

and to the **Insert** object (after `notes?: string | null;`):

```ts
          missed_call_sms_enabled?: boolean;
          missed_call_sms_template?: string | null;
```

- [ ] **Step 3: Add the `calls.ended_reason` column to the DB types**

In the `calls` `PublicTable`, add to the **Row** object (immediately after `disposition: string | null;`):

```ts
          ended_reason: string | null;
```

and to the **Insert** object (immediately after `disposition?: string | null;`):

```ts
          ended_reason?: string | null;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the new fields are optional in Insert, so existing inserts still compile).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/008_missed_call_recovery.sql apps/web/src/types/database.ts
git commit -m "feat(phase-7): migration 008 + types (missed-call recovery columns)"
```

---

### Task 2: Pure missed-call module (TDD)

**Files:**
- Create: `apps/web/scripts/test-missed-call.mjs`
- Create: `apps/web/src/lib/notifications/missed-call.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-missed-call.mjs`:

```js
// Unit tests for pure missed-call helpers. Run (from apps/web): node ./scripts/test-missed-call.mjs
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
  isMissEndedReason,
  isLikelyBgMobile,
  classifyMissedCall,
  buildMissedCallSms,
  missDedupeKey,
  DEFAULT_MISSED_CALL_TEMPLATE,
} = await loadModule(["src", "lib", "notifications", "missed-call.ts"]);

// --- isMissEndedReason ---
assert.equal(isMissEndedReason("silence-timed-out"), true, "silence is a miss");
assert.equal(isMissEndedReason("call.in-progress.error-assistant-did-not-receive-customer-audio"), true, "dotted error is a miss");
assert.equal(isMissEndedReason("customer-did-not-answer"), true, "no answer is a miss");
assert.equal(isMissEndedReason("customer-ended-call"), false, "normal hangup is not a miss reason");
assert.equal(isMissEndedReason(null), false, "null is not a miss reason");

// --- isLikelyBgMobile ---
assert.equal(isLikelyBgMobile("+359888123456"), true, "BG mobile");
assert.equal(isLikelyBgMobile("+35924372749"), false, "BG landline (Sofia)");
assert.equal(isLikelyBgMobile("+491701234567"), false, "foreign number");
assert.equal(isLikelyBgMobile("0888123456"), false, "non-E164");
assert.equal(isLikelyBgMobile(null), false, "null");

// --- classifyMissedCall ---
const mobile = "+359888123456";
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "silence-timed-out", durationSeconds: 0, disposition: "lead", capturedIntent: false }).isMiss,
  true, "failure reason + no intent = miss (disposition 'lead' from injected phone must not block)"
);
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "customer-ended-call", durationSeconds: 8, disposition: "lead", capturedIntent: false }).isMiss,
  true, "short call + no intent = miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "silence-timed-out", durationSeconds: 2, disposition: "lead", capturedIntent: true }).isMiss,
  false, "captured intent = not a miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "customer-ended-call", durationSeconds: 40, disposition: "lead", capturedIntent: false }).isMiss,
  false, "long normal call, no capture = not a miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: null, endedReason: "silence-timed-out", durationSeconds: 0, disposition: "unknown", capturedIntent: false }).isMiss,
  false, "no number = not a miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: "+35924372749", endedReason: "silence-timed-out", durationSeconds: 0, disposition: "lead", capturedIntent: false }).isMiss,
  false, "landline = not a miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "silence-timed-out", durationSeconds: 0, disposition: "spam", capturedIntent: false }).isMiss,
  false, "spam disposition = not a miss"
);

// --- buildMissedCallSms ---
assert.equal(buildMissedCallSms("Здравей {business}!", { business: "Демо" }), "Здравей Демо!", "substitutes {business}");
assert.ok(buildMissedCallSms(null, { business: "Демо" }).includes("Демо"), "null template falls back to default with business");
assert.ok(!buildMissedCallSms(null, { business: "Демо" }).includes("{business}"), "no leftover placeholder");
assert.equal(buildMissedCallSms("   ", { business: "Демо" }), DEFAULT_MISSED_CALL_TEMPLATE.replace("{business}", "Демо"), "blank template falls back to default");

// --- missDedupeKey ---
assert.equal(missDedupeKey("+359888123456", "2026-07-02"), "miss:+359888123456:2026-07-02", "dedupe key format");

console.log("missed-call: all tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node ./scripts/test-missed-call.mjs`
Expected: FAIL — `Missing module: …/src/lib/notifications/missed-call.ts`.

- [ ] **Step 3: Implement the pure module**

Create `apps/web/src/lib/notifications/missed-call.ts`:

```ts
export const SHORT_CALL_SECONDS = 15;

export const DEFAULT_MISSED_CALL_TEMPLATE =
  "Пропуснахме обаждането Ви до {business}. Обадете се пак, когато Ви е удобно — насреща сме!";

// Vapi endedReason strings are long/dotted (e.g. "call.in-progress.error-...").
// Match by substring; treat ANY reason containing "error" as a miss.
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

// BG mobile numbers are 08X nationally -> +3598XXXXXXXX (9 digits after +359,
// first is 8). Landlines are +3592.../+35932... etc. Foreign numbers are
// skipped (cost-safety for a BG service business).
export function isLikelyBgMobile(e164: string | null): boolean {
  return !!e164 && /^\+3598\d{8}$/.test(e164);
}

export type MissedCallInput = {
  callerNumber: string | null;
  endedReason: string | null;
  durationSeconds: number | null;
  disposition: string | null; // calls.disposition (post phone-injection)
  capturedIntent: boolean; // real content (name/service/city/appointment), NOT phone
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `node ./scripts/test-missed-call.mjs`
Expected: `missed-call: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/notifications/missed-call.ts apps/web/scripts/test-missed-call.mjs
git commit -m "feat(phase-7): pure missed-call classifier + template (TDD)"
```

---

### Task 3: Extract `ended_reason` in the payload builder (TDD)

**Files:**
- Modify: `apps/web/src/lib/vapi/payload.ts` (`buildCallInsert`, ~line 118)
- Modify: `apps/web/scripts/test-payload-extraction.mjs`

- [ ] **Step 1: Add the failing assertion**

In `apps/web/scripts/test-payload-extraction.mjs`, change the import line (line 12) from:

```js
const { buildLeadInsert, inferDisposition } = await import(moduleUrl);
```

to:

```js
const { buildLeadInsert, inferDisposition, buildCallInsert, getVapiMessage } = await import(moduleUrl);
```

Then add, just before the final `console.log(...)` line:

```js
// --- Phase 7: ended_reason is extracted from message.endedReason ---
const eocMessage = getVapiMessage({
  message: { type: "end-of-call-report", endedReason: "silence-timed-out", call: { id: "call-er-1" } },
});
const eocInsert = buildCallInsert(eocMessage, { organizationId: "org-1", phoneNumberId: null, assistantId: null });
assert.equal(eocInsert.ended_reason, "silence-timed-out", "ended_reason must be extracted from message.endedReason");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node ./scripts/test-payload-extraction.mjs`
Expected: FAIL — `ended_reason must be extracted…` (value is `undefined`).

- [ ] **Step 3: Implement the extraction**

In `apps/web/src/lib/vapi/payload.ts`, inside the object returned by `buildCallInsert`, add an `ended_reason` field immediately after the `disposition:` line:

```ts
    disposition: inferDisposition(structuredData),
    ended_reason:
      readString(webhookMessage.endedReason) ??
      readString(message.call.endedReason) ??
      null,
```

(`webhookMessage`, `message`, and `readString` are all already in scope in `buildCallInsert`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `node ./scripts/test-payload-extraction.mjs`
Expected: `payload extraction checks passed`

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add apps/web/src/lib/vapi/payload.ts apps/web/scripts/test-payload-extraction.mjs
git commit -m "feat(phase-7): store Vapi ended_reason on calls (TDD)"
```

---

### Task 4: Wire the webhook (classify + claim-then-send)

**Files:**
- Modify: `apps/web/src/app/api/vapi/end-of-call/route.ts`

- [ ] **Step 1: Add imports**

At the top of `route.ts`, with the other `@/lib/...` imports, add:

```ts
import { sendSms } from "@/lib/notifications/sms";
import { sofiaDayWindow } from "@/lib/notifications/reminders";
import { classifyMissedCall, buildMissedCallSms, missDedupeKey } from "@/lib/notifications/missed-call";
```

- [ ] **Step 2: Call the recovery step after the lead block**

In the `POST` handler, the lead block ends and then returns. Insert a guarded call to the new helper **before** the final success return. Change:

```ts
  return NextResponse.json({ ok: true, stored: "call", callId: call.id });
}
```

to:

```ts
  try {
    await maybeSendMissedCallRecovery(supabase, resolution.organizationId, callInsert);
  } catch (error) {
    console.error("Missed-call recovery failed", error);
  }

  return NextResponse.json({ ok: true, stored: "call", callId: call.id });
}
```

- [ ] **Step 3: Implement the helper**

Add this function at the bottom of `route.ts` (after the `POST` handler / near the other helpers). `CallInsert` is inferred from `buildCallInsert`'s return, so accept it as a parameter typed from that:

```ts
async function maybeSendMissedCallRecovery(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  organizationId: string,
  callInsert: NonNullable<ReturnType<typeof buildCallInsert>>
): Promise<void> {
  const { data: org } = await supabase
    .from("organizations")
    .select("name, missed_call_sms_enabled, missed_call_sms_template")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org || !org.missed_call_sms_enabled) return;

  const sd = (callInsert.structured_data ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const capturedIntent = Boolean(
    s(sd.name) || s(sd.service) || s(sd.serviceType) || s(sd.service_type) ||
    s(sd.city) || s(sd.town) || sd.appointment_confirmed === true || sd.appointmentConfirmed === true
  );

  const verdict = classifyMissedCall({
    callerNumber: callInsert.caller_number ?? null,
    endedReason: callInsert.ended_reason ?? null,
    durationSeconds: callInsert.duration_seconds ?? null,
    disposition: callInsert.disposition ?? null,
    capturedIntent,
  });
  if (!verdict.isMiss) return;

  const to = callInsert.caller_number;
  if (!to) return; // narrow for TS; classifier already guaranteed a mobile

  const sofiaDate = sofiaDayWindow(new Date(), 0).isoDate; // today, Europe/Sofia
  const dedupeKey = missDedupeKey(to, sofiaDate);

  // Claim-then-send: insert wins the race; a duplicate returns no rows -> skip.
  const { data: claimed } = await supabase
    .from("notification_log")
    .upsert(
      {
        organization_id: organizationId,
        channel: "sms",
        kind: "missed_call_recovery",
        appointment_id: null,
        dedupe_key: dedupeKey,
        destination: to,
        status: "sent",
        sent_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true }
    )
    .select("id");
  if (!claimed || claimed.length === 0) return; // already sent to this caller today

  const text = buildMissedCallSms(org.missed_call_sms_template, { business: org.name });
  const result = await sendSms({ to, text });
  if (!result.sent) {
    await supabase
      .from("notification_log")
      .update({ status: "failed", error: result.error ?? "unknown", sent_at: null })
      .eq("organization_id", organizationId)
      .eq("dedupe_key", dedupeKey);
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`buildCallInsert` is already imported in `route.ts`; `getSupabaseServiceClient` too.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/vapi/end-of-call/route.ts
git commit -m "feat(phase-7): missed-call recovery SMS on the Vapi webhook (opt-in, idempotent)"
```

---

### Task 5: Settings — opt-in toggle + editable template

**Files:**
- Create: `apps/web/src/app/(dashboard)/settings/actions.ts`
- Create: `apps/web/src/app/(dashboard)/settings/missed-call-form.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create the server action**

Create `apps/web/src/app/(dashboard)/settings/actions.ts` (mirrors the `requireAdmin` pattern in `assistant/actions.ts`):

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateMissedCallSettings(formData: FormData): Promise<ActionResult> {
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
    .update({ missed_call_sms_enabled: enabled, missed_call_sms_template: template })
    .eq("id", org.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
```

- [ ] **Step 2: Create the client form**

Create `apps/web/src/app/(dashboard)/settings/missed-call-form.tsx` (mirrors `behavior-tab.tsx` wiring):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { updateMissedCallSettings } from "./actions";

const ERRORS: Record<string, string> = {
  no_org: "Няма активна организация.",
  not_admin: "Нужни са права на администратор.",
};

export function MissedCallForm({
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
      const result = await updateMissedCallSettings(formData);
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
        <div className="text-sm font-semibold">SMS при пропуснато обаждане</div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Ако обаждане прекъсне без резултат, пращаме на клиента кратко SMS „обадете се пак".
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4" />
        <span className="font-medium">Включи автоматичното SMS</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">
          Текст на SMS (използвай {"{business}"} за името на бизнеса)
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

- [ ] **Step 3: Load settings in the page and render the form**

Edit `apps/web/src/app/(dashboard)/settings/page.tsx`. Add imports at the top:

```tsx
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MISSED_CALL_TEMPLATE } from "@/lib/notifications/missed-call";

import { MissedCallForm } from "./missed-call-form";
```

Make the component `async` and load the org's settings. Change:

```tsx
export default function SettingsPage() {
  return (
```

to:

```tsx
export default async function SettingsPage() {
  const org = await getActiveOrganization();
  let missedEnabled = false;
  let missedTemplate = "";
  if (org) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("missed_call_sms_enabled, missed_call_sms_template")
      .eq("id", org.id)
      .maybeSingle();
    missedEnabled = data?.missed_call_sms_enabled ?? false;
    missedTemplate = data?.missed_call_sms_template ?? "";
  }

  return (
```

Then, immediately **after** the closing `</section>` of the status-cards grid and **before** the closing `</>`, add:

```tsx
      <section className="mt-6 grid min-w-0 gap-3 lg:grid-cols-2">
        <MissedCallForm
          enabled={missedEnabled}
          template={missedTemplate}
          placeholder={DEFAULT_MISSED_CALL_TEMPLATE}
        />
      </section>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors in `settings/` or `missed-call.ts`.

- [ ] **Step 5: Production build (authoritative check)**

Run: `npm run build`
Expected: build succeeds (compiles the new server action, client form, and async page).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/settings/actions.ts" "apps/web/src/app/(dashboard)/settings/missed-call-form.tsx" "apps/web/src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(phase-7): settings toggle + editable template for missed-call SMS"
```

---

### Task 6: Apply migration, deploy, E2E verify

**Order matters:** apply the migration **before** deploying — the webhook and the settings page both read the new columns, and the `notification_log` insert needs the new `kind` value allowed.

- [ ] **Step 1: Run the full unit suite**

Run (from `apps/web`):
```bash
node ./scripts/test-missed-call.mjs && node ./scripts/test-payload-extraction.mjs && node ./scripts/test-reminders.mjs
```
Expected: `missed-call: all tests passed`, `payload extraction checks passed`, `reminders: all tests passed`.

- [ ] **Step 2: Ask the user to apply migration 008**

Give the user the contents of `supabase/migrations/008_missed_call_recovery.sql` to run in the Supabase SQL editor. **Wait for confirmation** before deploying.

- [ ] **Step 3: Deploy**

```bash
git push origin main
```

- [ ] **Step 4: Verify the deploy landed**

Poll the webhook health endpoint until `commit` matches `git rev-parse --short HEAD`:
`GET https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call` → JSON includes `{ "commit": "<sha>" }`.
(Use the context-mode `ctx_execute` JS `fetch` for prod HTTP, per project convention.)

- [ ] **Step 5: E2E — enable + trigger a real miss**

1. In the app → **Настройки**, tick **Включи автоматичното SMS**, optionally edit the text, **Запази**.
2. From a real phone, call the assistant number and **hang up within ~10 seconds** (before giving any details).
3. Expect a recovery SMS within a minute.
4. Immediately drop a second call the same day → **no** second SMS (dedupe).

- [ ] **Step 6: Confirm the log row (read-only)**

Query `notification_log` for `kind = 'missed_call_recovery'` (via `ctx_execute` + service-role key from `.env.local`, read-only, no PII printed beyond a count): expect exactly **one** row for today with `status = 'sent'`.

- [ ] **Step 7: Update memory + roadmap**

- Update `world-class-roadmap.md`: mark Phase 7 slice 1 shipped with the deploy SHA.
- Add/att a `phase-7-missed-call-recovery` memory note (what shipped, the endedReason/phone-injection gotchas, dedupe = per-caller-per-day).

---

## Self-review

**1. Spec coverage:**
- Real-time webhook trigger → Task 4. ✅
- Classification (miss reasons + <15s + captured-intent gate, mobile-only, spam/wrong excluded) → Task 2 (pure) + Task 4 (capturedIntent wiring). ✅
- `ended_reason` storage → Task 1 (column) + Task 3 (extraction). ✅
- Per-org opt-in toggle + editable template (default OFF), in Settings → Task 1 (columns) + Task 5 (action + form + page). ✅
- Idempotency `notification_log` kind + `miss:<e164>:<sofia-date>` dedupe → Task 1 (kind) + Task 4 (claim). ✅
- Reuse `sendSms` + Sofia date helper → Task 4. ✅
- Migration applied by user; deploy by push; E2E → Task 6. ✅

**2. Placeholder scan:** No TBD/TODO/"handle errors"; every code step has full code and exact commands. ✅

**3. Type consistency:** `classifyMissedCall`/`buildMissedCallSms`/`missDedupeKey`/`isMissEndedReason`/`isLikelyBgMobile`/`DEFAULT_MISSED_CALL_TEMPLATE` names match between Task 2's module, its test, and Task 4's webhook usage. `MissedCallInput` fields (`callerNumber`, `endedReason`, `durationSeconds`, `disposition`, `capturedIntent`) match the webhook call site. `ended_reason` column/field name matches across migration, types, payload extraction, and webhook read. `updateMissedCallSettings` + `MissedCallForm` names match between action, form, and page. ✅
