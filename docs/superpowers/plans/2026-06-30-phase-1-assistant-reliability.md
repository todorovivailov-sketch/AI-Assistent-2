# Phase 1 — Assistant Reliability & Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the existing call→lead→appointment loop trustworthy — no silently dropped fields, correct
booking disposition, dynamic dates, and an owner alert on every new lead.

**Architecture:** Harden the pure extraction functions in `payload.ts` to accept both the live (v1) and
new (v2) structured-data schemas, add a small Resend-backed owner-email module, wire it into the
end-of-call route, and apply the v2 Vapi prompt (config). Tests follow the repo's existing pattern:
transpile the TS module in-memory and assert against pure functions (`scripts/test-*.mjs`).

**Tech Stack:** Next.js 16 (route handler), TypeScript, Supabase service client, Resend HTTP API, Node
`assert` test scripts via the `typescript` transpiler.

---

## File Structure

- Modify: `apps/web/src/lib/vapi/payload.ts` — export `inferDisposition`; widen `preferred_time` and
  disposition reading.
- Create: `apps/web/src/lib/notifications/owner-email.ts` — `buildOwnerLeadEmail` (pure) + `sendOwnerLeadEmail`.
- Modify: `apps/web/src/app/api/vapi/end-of-call/route.ts:107-119` — fire owner email after a new lead insert.
- Create: `apps/web/scripts/test-payload-extraction.mjs` — unit tests for the two extraction fixes.
- Create: `apps/web/scripts/test-owner-email.mjs` — unit tests for the email builder.
- Modify: `apps/web/package.json` — add `test:payload` and `test:notify` scripts.
- Config (no code): apply `docs/03-setup/receptionist-prompt-v2-bg.md` to the Vapi assistant + add the
  recording-consent greeting line.

---

### Task 1: Stop dropping `preferred_time` (schema-tolerant extraction)

**Files:**
- Modify: `apps/web/src/lib/vapi/payload.ts:172-176`
- Test: `apps/web/scripts/test-payload-extraction.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-payload-extraction.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "src", "lib", "vapi", "payload.ts");
if (!existsSync(sourcePath)) throw new Error(`Missing module: ${sourcePath}`);
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { buildLeadInsert, inferDisposition } = await import(moduleUrl);

function callInsert(structured) {
  return {
    organization_id: "org-1",
    caller_number: "+359888111222",
    summary: "test",
    disposition: inferDisposition(structured),
    structured_data: structured,
  };
}

// v1 schema used `requested_time`; it must NOT be dropped.
const lead = buildLeadInsert("call-1", callInsert({ name: "Иван", requested_time: "утре следобед" }));
assert.equal(lead.preferred_time_text, "утре следобед", "requested_time must map to preferred_time_text");

// v2 schema uses `preferred_time`; still works.
const lead2 = buildLeadInsert("call-2", callInsert({ name: "Мария", preferred_time: "петък 14:00" }));
assert.equal(lead2.preferred_time_text, "петък 14:00", "preferred_time must map to preferred_time_text");

console.log("payload extraction: preferred_time checks passed");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && node ./scripts/test-payload-extraction.mjs`
Expected: FAIL — `inferDisposition` is not exported yet (import is `undefined`) and/or `requested_time` assertion fails.

- [ ] **Step 3: Widen the `preferred_time_text` read**

In `apps/web/src/lib/vapi/payload.ts`, replace lines 172-176:

```ts
    preferred_time_text:
      readString(data.preferredTime) ??
      readString(data.preferred_time) ??
      readString(data.preferredSlot) ??
      readString(data.requested_time) ??
      readString(data.requestedTime) ??
      null,
```

- [ ] **Step 4: Export `inferDisposition`** (needed by the test and Task 2)

In `apps/web/src/lib/vapi/payload.ts:423`, change `function inferDisposition(` to `export function inferDisposition(`.

- [ ] **Step 5: Run the test to verify the preferred_time assertions pass**

Run: `cd apps/web && node ./scripts/test-payload-extraction.mjs`
Expected: PASS for the preferred_time lines (disposition still old behavior — Task 2 next).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/vapi/payload.ts apps/web/scripts/test-payload-extraction.mjs
git commit -m "fix: stop dropping requested_time during lead extraction"
```

---

### Task 2: Correct booking disposition (so booked calls aren't mislabeled as plain leads)

**Files:**
- Modify: `apps/web/src/lib/vapi/payload.ts:423-439`
- Test: `apps/web/scripts/test-payload-extraction.mjs`

- [ ] **Step 1: Add failing assertions** to `scripts/test-payload-extraction.mjs` (append before the final `console.log`):

```js
// v1 schema signalled booking via appointment_confirmed / next_action, which the code ignored.
assert.equal(inferDisposition({ appointment_confirmed: true, name: "Иван" }), "appointment",
  "appointment_confirmed=true must yield 'appointment'");
assert.equal(inferDisposition({ next_action: "booked", name: "Иван" }), "appointment",
  "next_action=booked must yield 'appointment'");
// v2 schema signals via disposition directly.
assert.equal(inferDisposition({ disposition: "appointment" }), "appointment",
  "disposition=appointment must yield 'appointment'");
// Plain lead data still resolves to 'lead'.
assert.equal(inferDisposition({ name: "Иван", phone: "+359888111222" }), "lead",
  "lead data with no booking signal stays 'lead'");
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && node ./scripts/test-payload-extraction.mjs`
Expected: FAIL on the `appointment_confirmed` / `next_action` assertions.

- [ ] **Step 3: Teach `inferDisposition` the v1 booking signals**

In `apps/web/src/lib/vapi/payload.ts`, replace the body start of `inferDisposition` (currently lines 424-429):

```ts
  const status = `${readString(data.disposition) ?? ""} ${readString(data.outcome) ?? ""}`.toLowerCase();
  const nextAction = (readString(data.next_action) ?? readString(data.nextAction) ?? "").toLowerCase();
  const appointmentConfirmed = data.appointment_confirmed === true || data.appointmentConfirmed === true;

  if (appointmentConfirmed || status.includes("appointment") || status.includes("book") || nextAction.includes("book") || nextAction.includes("appointment")) {
    return "appointment";
  }
  if (status.includes("spam")) return "spam";
  if (status.includes("support")) return "support";
  if (status.includes("wrong")) return "wrong_number";
```

- [ ] **Step 4: Run to verify all pass**

Run: `cd apps/web && node ./scripts/test-payload-extraction.mjs`
Expected: PASS — `payload extraction: preferred_time checks passed` plus no assertion errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vapi/payload.ts apps/web/scripts/test-payload-extraction.mjs
git commit -m "fix: detect booked calls from appointment_confirmed/next_action so disposition is correct"
```

---

### Task 3: Owner email on every new lead (Resend)

**Files:**
- Create: `apps/web/src/lib/notifications/owner-email.ts`
- Test: `apps/web/scripts/test-owner-email.mjs`
- Modify: `apps/web/src/app/api/vapi/end-of-call/route.ts` (import + after line 117)

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-owner-email.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "src", "lib", "notifications", "owner-email.ts");
if (!existsSync(sourcePath)) throw new Error(`Missing module: ${sourcePath}`);
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { buildOwnerLeadEmail } = await import(moduleUrl);

const normal = buildOwnerLeadEmail({ name: "Иван", phone: "+359888111222", service_type: "Монтаж", city: "София", urgency: "normal" }, "ХВАК ООД");
assert.ok(normal.subject.includes("Иван") && normal.subject.includes("Монтаж"), "subject names client + service");
assert.ok(normal.text.includes("+359888111222"), "body includes phone");

const urgent = buildOwnerLeadEmail({ name: "Мария", phone: "+359888000000", service_type: "Ремонт", city: "Варна", urgency: "emergency" }, null);
assert.ok(/спешн/i.test(urgent.subject), "emergency urgency flags the subject as urgent");

console.log("owner email builder checks passed");
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && node ./scripts/test-owner-email.mjs`
Expected: FAIL — module file does not exist.

- [ ] **Step 3: Create the module**

Create `apps/web/src/lib/notifications/owner-email.ts`:

```ts
import type { Database } from "@/types/database";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export function buildOwnerLeadEmail(lead: LeadInsert, orgName: string | null) {
  const name = lead.name ?? "Без име";
  const phone = lead.phone ?? "—";
  const service = lead.service_type ?? "—";
  const city = lead.city ?? "—";
  const isUrgent = lead.urgency === "emergency" || lead.urgency === "high";
  const subject = `${isUrgent ? "🔴 Спешна заявка" : "Нова заявка"} — ${name} (${service})`;
  const lines = [
    `Нова заявка от телефонния асистент${orgName ? ` за ${orgName}` : ""}.`,
    `Клиент: ${name}`,
    `Телефон: ${phone}`,
    `Услуга: ${service}`,
    `Локация: ${city}`,
    lead.preferred_time_text ? `Предпочитано време: ${lead.preferred_time_text}` : null,
    lead.ai_summary ? `Резюме: ${lead.ai_summary}` : null,
  ].filter(Boolean) as string[];
  return { subject, text: lines.join("\n"), html: `<div>${lines.map((l) => `<p>${l}</p>`).join("")}</div>` };
}

export async function sendOwnerLeadEmail(input: {
  to: string | null;
  lead: LeadInsert;
  orgName: string | null;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = input.to ?? process.env.OWNER_NOTIFICATION_EMAIL ?? null;
  if (!apiKey || !to) {
    console.warn("Owner email skipped: missing RESEND_API_KEY or recipient");
    return { sent: false };
  }
  const { subject, text, html } = buildOwnerLeadEmail(input.lead, input.orgName);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.OWNER_NOTIFICATION_FROM ?? "AI Receptionist <onboarding@resend.dev>",
        to,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Owner email failed", res.status, await res.text());
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    console.error("Owner email threw", error);
    return { sent: false };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && node ./scripts/test-owner-email.mjs`
Expected: PASS — `owner email builder checks passed`.

- [ ] **Step 5: Wire it into the route**

In `apps/web/src/app/api/vapi/end-of-call/route.ts`, add to the imports (after line 14):

```ts
import { sendOwnerLeadEmail } from "@/lib/notifications/owner-email";
```

Replace the new-lead block (lines 116-118):

```ts
    if (!existingLead) {
      await supabase.from("leads").insert(leadInsert);
      void sendOwnerLeadEmail({ to: null, lead: leadInsert, orgName: null });
    }
```

- [ ] **Step 6: Verify the build still compiles**

Run: `cd apps/web && npm run build`
Expected: `✓ Compiled successfully` and TypeScript passes.

- [ ] **Step 7: Add npm test scripts**

In `apps/web/package.json` `scripts`, add:

```json
    "test:payload": "node ./scripts/test-payload-extraction.mjs",
    "test:notify": "node ./scripts/test-owner-email.mjs",
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/notifications/owner-email.ts apps/web/scripts/test-owner-email.mjs apps/web/src/app/api/vapi/end-of-call/route.ts apps/web/package.json
git commit -m "feat: email the owner on every new lead from a call"
```

---

### Task 4: Apply the v2 Vapi prompt + recording-consent greeting (config, not code)

> This task is performed in the Vapi dashboard (or via API if `VAPI_API_KEY` is added). No repo build.

- [ ] **Step 1: Add the EU recording-consent line** to the greeting in
  `docs/03-setup/receptionist-prompt-v2-bg.md` (Поздрав section):

```text
„Здравейте, добре дошли! Казвам се Алекс. Разговорът може да бъде записан с цел качество. С какво мога да ви помогна днес?"
```

- [ ] **Step 2: Paste the v2 system prompt** (section 1 of the doc) into the Vapi assistant
  `LeadSaver Booking Receptionist BG` (assistant_id `3a342308-b8fb-4194-a629-08fd978fdeea`) → Model → System Prompt.

- [ ] **Step 3: Replace the structured-data prompt + schema** (section 3.2/3.3 of the doc) in
  Vapi → Call Analysis → Structured Data.

- [ ] **Step 4: Set `request-start` messages** on the `check_availability` and `book_appointment` tools
  ("Един момент, проверявам календара." / "Записвам часа, секунда.") per section 4 of the doc.

- [ ] **Step 5: Lock the transcriber language to Bulgarian** (no auto-detect) in Vapi → Transcriber.

- [ ] **Step 6: Place one live test call** and confirm in the dashboard: the call appears, the lead has a
  `preferred_time`, and a booked call shows disposition = appointment (lead status "booked").

---

## Self-Review

- **Spec coverage:** preferred_time drop (Task 1) ✓, disposition mislabel (Task 2) ✓, owner alert (Task 3) ✓,
  v2 prompt + dynamic date + consent (Task 4) ✓.
- **Placeholders:** none — all steps contain runnable code/commands.
- **Type consistency:** `inferDisposition` exported once (Task 1 Step 4) and reused in tests; `buildOwnerLeadEmail`
  signature `(lead, orgName)` is identical in the module and both call sites.
- **Note:** Tasks 1–3 are fully testable by me locally (Supabase not required for the pure functions).
  Task 4 needs Vapi access (paste or `VAPI_API_KEY`). Task 3 *sending* (not the builder) needs
  `RESEND_API_KEY` + `OWNER_NOTIFICATION_EMAIL` in the runtime env (Vercel prod).
