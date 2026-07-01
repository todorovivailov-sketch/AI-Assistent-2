# Phase 4b — Business Facts + Prompt Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner manage structured business facts (services, working hours, service areas) + a separate guardrails field in the dashboard, and publish a **composed** system prompt live to Vapi with one button — no Vapi dashboard access needed.

**Architecture:** Compose-around-a-base. `assistants.system_prompt` becomes a *derived* value = `base_prompt` + generated "Бизнес контекст" (from facts) + "Твърди правила" (guardrails). Facts persist immediately (RLS, admin-only). The composed prompt goes live only on an explicit "Публикувай" action, which uses the proven `syncAssistantToVapi` (Vapi-first, then persist).

**Tech Stack:** Next.js 16 (App Router, Server Actions, RSC), Supabase (RLS session client), existing Vapi sync client, pure composer/parser functions unit-tested via `ts.transpileModule` + data-URL import (no bundler).

**Spec:** `docs/superpowers/specs/2026-07-01-phase-4b-business-facts-composer-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/004_assistant_prompt_composition.sql` — add `base_prompt`, `guardrails` to `assistants`; seed base from `system_prompt`.
- `apps/web/src/lib/agent/prompt-composer.ts` — pure `renderBusinessContext`, `composeSystemPrompt`, `DEFAULT_BASE_PROMPT`.
- `apps/web/src/lib/agent/service-form.ts` — pure `parseServiceForm`.
- `apps/web/src/lib/agent/business-hours-form.ts` — pure `parseBusinessHoursForm`.
- `apps/web/src/lib/agent/service-area-form.ts` — pure `parseServiceAreaForm`.
- `apps/web/src/lib/agent/composer-data.ts` — `getAgentComposerData` (RLS read + preview).
- `apps/web/scripts/test-prompt-composer.mjs`, `test-service-form.mjs`, `test-business-hours-form.mjs`, `test-service-area-form.mjs` — unit tests.
- `apps/web/src/app/(dashboard)/assistant/agent-builder.tsx` — tabbed client component.
- `apps/web/src/app/(dashboard)/assistant/tabs/` — `behavior-tab.tsx`, `services-tab.tsx`, `hours-tab.tsx`, `areas-tab.tsx`, `publish-tab.tsx`.

**Modify:**
- `apps/web/src/types/database.ts` — add `base_prompt`/`guardrails` to `assistants`; add `services` + `service_areas` table types.
- `apps/web/src/lib/agent/assistant-form.ts` — replace `parseAssistantForm` with `parseAgentBehaviorForm` (base_prompt + guardrails).
- `apps/web/scripts/test-assistant-sync.mjs` — update parser test section to `parseAgentBehaviorForm`.
- `apps/web/src/app/(dashboard)/assistant/actions.ts` — replace `updateAssistant` with `updateAgentBehavior` (DB-only) + fact CRUD actions + `publishAssistant` (Vapi-first).
- `apps/web/src/app/(dashboard)/assistant/page.tsx` — feed `getAgentComposerData` into `<AgentBuilder/>`.

**Delete:**
- `apps/web/src/app/(dashboard)/assistant/assistant-editor.tsx` — superseded by `agent-builder.tsx`.
- `apps/web/src/lib/agent/assistant.ts` (`getAssistantEditorData`) — superseded by `getAgentComposerData` (verify no other importers first).

---

## Task 1: Migration + database types

**Files:**
- Create: `supabase/migrations/004_assistant_prompt_composition.sql`
- Modify: `apps/web/src/types/database.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/004_assistant_prompt_composition.sql`:

```sql
-- Phase 4b: system_prompt becomes a COMPOSED value (base + business context + guardrails).
-- Store the two composer inputs separately; seed base_prompt from the current prompt so the
-- live behavior is preserved (no regression) on first publish.
alter table public.assistants add column if not exists base_prompt text;
alter table public.assistants add column if not exists guardrails text;

update public.assistants set base_prompt = system_prompt
where base_prompt is null and system_prompt is not null;
```

- [ ] **Step 2: Apply the migration to the database**

There is no Supabase CLI link in this repo. Apply the SQL one of two ways:
- Supabase Dashboard → SQL Editor → paste the file contents → Run; **or**
- if a Postgres connection string is in `.env.local` (e.g. `SUPABASE_DB_URL`): `psql "$SUPABASE_DB_URL" -f supabase/migrations/004_assistant_prompt_composition.sql`

- [ ] **Step 3: Verify the columns exist and base_prompt is seeded**

Run (from project root) — reuses the `.env.local` service key like `apps/web/scripts/diagnose-assistant.mjs`:

```bash
node -e "import('@supabase/supabase-js').then(async ({createClient})=>{const fs=require('fs');const env=Object.fromEntries(fs.readFileSync('apps/web/.env.local','utf8').split(/\r?\n/).map(l=>/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l)).filter(Boolean).map(m=>[m[1],m[2].replace(/^['\"]|['\"]$/g,'')]));const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY);const {data,error}=await sb.from('assistants').select('name, base_prompt, guardrails, system_prompt');console.log(error?error.message:data.map(r=>({name:r.name, base:r.base_prompt?.length||0, guard:r.guardrails?.length||0, sys:r.system_prompt?.length||0})));})"
```

Expected: each row prints `base` > 0 (seeded) and `guard` 0; no error.

- [ ] **Step 4: Add types to `database.ts`**

In `apps/web/src/types/database.ts`, add two fields to the `assistants` **Row** (after `system_prompt: string | null;`, line ~60) and **Insert** (after `system_prompt?: string | null;`, line ~75):

Row additions:
```ts
          system_prompt: string | null;
          base_prompt: string | null;
          guardrails: string | null;
```
Insert additions:
```ts
          system_prompt?: string | null;
          base_prompt?: string | null;
          guardrails?: string | null;
```

- [ ] **Step 5: Add `services` and `service_areas` table types**

In the same file, immediately after the `business_hours: PublicTable<...>` block (ends ~line 158), insert:

```ts
      services: PublicTable<
        {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price_min: number | null;
          price_max: number | null;
          currency: string;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          duration_minutes?: number;
          price_min?: number | null;
          price_max?: number | null;
          currency?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      service_areas: PublicTable<
        {
          id: string;
          organization_id: string;
          city: string;
          region: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          city: string;
          region?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors from `database.ts`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/004_assistant_prompt_composition.sql apps/web/src/types/database.ts
git commit -m "feat(4b): migration + types for base_prompt/guardrails + services/service_areas"
```

---

## Task 2: Composer pure functions (TDD)

**Files:**
- Create: `apps/web/src/lib/agent/prompt-composer.ts`
- Test: `apps/web/scripts/test-prompt-composer.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-prompt-composer.mjs`:

```js
// Unit tests for the pure prompt composer (no DB, no network). Transpile TS + import via data URL,
// same harness as test-lead-form.mjs. Run (from apps/web): node ./scripts/test-prompt-composer.mjs
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

const { renderBusinessContext, composeSystemPrompt } = await loadModule(["src", "lib", "agent", "prompt-composer.ts"]);

// renderBusinessContext: active-only, NO prices, empty sections omitted
const ctx = renderBusinessContext({
  orgName: "Демо ЕООД",
  services: [
    { name: "Монтаж", description: "на климатик", status: "active" },
    { name: "Профилактика", description: null, status: "active" },
    { name: "Стар", description: null, status: "archived" },
  ],
  hours: [
    { weekday: 1, opens_at: "09:00:00", closes_at: "18:00:00", is_closed: false },
    { weekday: 6, opens_at: null, closes_at: null, is_closed: true },
  ],
  areas: [
    { city: "София", region: "Люлин", status: "active" },
    { city: "Скрит", region: null, status: "paused" },
  ],
});
assert.ok(ctx.includes("## Бизнес контекст"), "has header");
assert.ok(ctx.includes("Демо ЕООД"), "org name");
assert.ok(ctx.includes("Монтаж") && ctx.includes("Профилактика"), "active services listed");
assert.ok(!ctx.includes("Стар"), "archived service omitted");
assert.ok(!/\d+(\.\d+)?\s*(лв|EUR|BGN|€)/.test(ctx), "no prices rendered");
assert.ok(ctx.includes("Вторник") && ctx.includes("09:00") && ctx.includes("18:00"), "hours rendered (weekday 1 = Вторник)");
assert.ok(ctx.includes("почивен"), "closed day rendered");
assert.ok(ctx.includes("София") && ctx.includes("Люлин"), "active area with region");
assert.ok(!ctx.includes("Скрит"), "paused area omitted");

// empty facts -> empty string (no dangling header)
assert.equal(renderBusinessContext({ orgName: "X", services: [], hours: [], areas: [] }), "", "empty facts -> empty context");

// composeSystemPrompt: ordering, omit empty, base-only fallback
const composed = composeSystemPrompt({ base: "BASE", businessContext: "## Бизнес контекст\nУслуги: A", guardrails: "Не псувай." });
assert.ok(composed.startsWith("BASE"), "base first");
assert.ok(composed.indexOf("## Бизнес контекст") > composed.indexOf("BASE"), "context after base");
assert.ok(composed.indexOf("Твърди правила") > composed.indexOf("## Бизнес контекст"), "guardrails last");
assert.ok(composed.includes("Не псувай."), "guardrails body included");

assert.equal(composeSystemPrompt({ base: "ONLY", businessContext: "", guardrails: "" }), "ONLY", "base-only when nothing else");
assert.ok(!composeSystemPrompt({ base: "B", businessContext: "", guardrails: "G" }).includes("Бизнес контекст"), "no empty context section");

console.log("prompt-composer checks passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && node ./scripts/test-prompt-composer.mjs`
Expected: FAIL with `Missing module: .../prompt-composer.ts`.

- [ ] **Step 3: Implement the composer**

Create `apps/web/src/lib/agent/prompt-composer.ts`:

```ts
// Pure prompt composition (no DB, no Next imports -> unit-testable via transpile/data-URL).
// system_prompt = base_prompt + generated "Бизнес контекст" (from facts) + "Твърди правила" (guardrails).
// Prices are intentionally NEVER rendered (Phase 4c/Knowledge Base unlocks spoken prices).

type ServiceFact = { name: string; description?: string | null; status: string };
type HoursFact = { weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };
type AreaFact = { city: string; region?: string | null; status: string };

// Fallback only for assistants with no stored base_prompt (existing rows are seeded by migration 004).
export const DEFAULT_BASE_PROMPT =
  "Ти си изключително любезен телефонен рецепционист за фирма за услуги. Говориш кратко и вежливо на " +
  "български и записваш часове и заявки точно. Не казвай цени по телефона — предложи да изпратите оферта.";

const WEEKDAYS_BG = ["Неделя", "Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота"];
const hhmm = (t: string | null): string => (t ? t.slice(0, 5) : "");

export function renderBusinessContext(input: {
  orgName?: string | null;
  services: ServiceFact[];
  hours: HoursFact[];
  areas: AreaFact[];
}): string {
  const lines: string[] = [];

  const services = (input.services ?? []).filter((s) => s.status === "active");
  if (services.length) {
    const names = services.map((s) => (s.description ? `${s.name} (${s.description})` : s.name));
    lines.push(`Услуги: ${names.join(", ")}`);
  }

  const hours = (input.hours ?? [])
    .filter((h) => h.weekday >= 0 && h.weekday <= 6)
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)); // Пон..Нед
  if (hours.length) {
    const parts = hours.map((h) =>
      h.is_closed || !h.opens_at || !h.closes_at
        ? `${WEEKDAYS_BG[h.weekday]} почивен`
        : `${WEEKDAYS_BG[h.weekday]} ${hhmm(h.opens_at)}–${hhmm(h.closes_at)}`
    );
    lines.push(`Работно време: ${parts.join(", ")}`);
  }

  const areas = (input.areas ?? []).filter((a) => a.status === "active");
  if (areas.length) {
    const names = areas.map((a) => (a.region ? `${a.city} (${a.region})` : a.city));
    lines.push(`Обслужвани райони: ${names.join(", ")}`);
  }

  if (!lines.length) return "";
  const header = input.orgName ? `## Бизнес контекст\nФирма: ${input.orgName}` : "## Бизнес контекст";
  return `${header}\n${lines.join("\n")}`;
}

export function composeSystemPrompt(input: { base: string; businessContext: string; guardrails?: string | null }): string {
  const base = (input.base ?? "").trim() || DEFAULT_BASE_PROMPT;
  const sections = [base];
  if (input.businessContext && input.businessContext.trim()) sections.push(input.businessContext.trim());
  const guard = (input.guardrails ?? "").trim();
  if (guard) sections.push(`## Твърди правила (спазвай ги с най-висок приоритет)\n${guard}`);
  return sections.join("\n\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && node ./scripts/test-prompt-composer.mjs`
Expected: `prompt-composer checks passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/agent/prompt-composer.ts apps/web/scripts/test-prompt-composer.mjs
git commit -m "feat(4b): pure prompt composer (renderBusinessContext + composeSystemPrompt) + tests"
```

---

## Task 3: Fact form parsers (TDD)

**Files:**
- Create: `apps/web/src/lib/agent/service-form.ts`, `business-hours-form.ts`, `service-area-form.ts`
- Test: `apps/web/scripts/test-service-form.mjs`, `test-business-hours-form.mjs`, `test-service-area-form.mjs`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/scripts/test-service-form.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
  }).outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { parseServiceForm } = await loadModule(["src", "lib", "agent", "service-form.ts"]);
const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });

const ok = parseServiceForm(form({ name: "  Монтаж  ", description: " ", duration_minutes: "90", price_min: "50", price_max: "120", currency: "BGN", status: "active" }), "org-1");
assert.equal(ok.error, undefined, "valid");
assert.equal(ok.values.organization_id, "org-1", "org injected");
assert.equal(ok.values.name, "Монтаж", "name trimmed");
assert.equal(ok.values.description, null, "blank description -> null");
assert.equal(ok.values.duration_minutes, 90, "duration parsed");
assert.equal(ok.values.price_min, 50, "price_min parsed");
assert.equal(ok.values.price_max, 120, "price_max parsed");
assert.equal(ok.values.currency, "BGN", "currency kept");
assert.equal(ok.values.status, "active", "status kept");

assert.equal(parseServiceForm(form({}), "o").error, "service_name_required", "name required");
assert.equal(parseServiceForm(form({ name: "X", duration_minutes: "3" }), "o").error, "duration_out_of_range", "min duration");
assert.equal(parseServiceForm(form({ name: "X", duration_minutes: "5000" }), "o").error, "duration_out_of_range", "max duration");
assert.equal(parseServiceForm(form({ name: "X", price_min: "200", price_max: "100" }), "o").error, "price_range_invalid", "min>max");
const defaults = parseServiceForm(form({ name: "X" }), "o");
assert.equal(defaults.values.duration_minutes, 60, "default duration");
assert.equal(defaults.values.currency, "EUR", "default currency");
assert.equal(defaults.values.status, "active", "default status");
assert.equal(defaults.values.price_min, null, "no price -> null");
console.log("service-form checks passed");
```

Create `apps/web/scripts/test-business-hours-form.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
  }).outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { parseBusinessHoursForm } = await loadModule(["src", "lib", "agent", "business-hours-form.ts"]);
// FormData-like with getAll for repeated fields
const multi = (map) => ({ get: (k) => (k in map ? map[k] : null), getAll: (k) => (k in map ? [].concat(map[k]) : []) });

const ok = parseBusinessHoursForm(
  multi({
    weekday: ["1", "2", "6"],
    is_closed: ["", "", "on"],
    opens_at: ["09:00", "10:00", ""],
    closes_at: ["18:00", "19:00", ""],
  }),
  "org-1"
);
assert.equal(ok.error, undefined, "valid week");
assert.equal(ok.values.length, 3, "3 rows");
assert.equal(ok.values[0].organization_id, "org-1", "org injected");
assert.equal(ok.values[0].weekday, 1, "weekday parsed");
assert.equal(ok.values[0].is_closed, false, "open day");
assert.equal(ok.values[0].opens_at, "09:00", "opens kept");
assert.equal(ok.values[2].is_closed, true, "closed day");
assert.equal(ok.values[2].opens_at, null, "closed -> null times");

const bad = parseBusinessHoursForm(multi({ weekday: ["1"], is_closed: [""], opens_at: ["18:00"], closes_at: ["09:00"] }), "o");
assert.equal(bad.error, "hours_invalid_range", "open must be before close");
const missing = parseBusinessHoursForm(multi({ weekday: ["1"], is_closed: [""], opens_at: [""], closes_at: [""] }), "o");
assert.equal(missing.error, "hours_invalid_range", "open day needs both times");
console.log("business-hours-form checks passed");
```

Create `apps/web/scripts/test-service-area-form.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
  }).outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { parseServiceAreaForm } = await loadModule(["src", "lib", "agent", "service-area-form.ts"]);
const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });
const ok = parseServiceAreaForm(form({ city: "  Пловдив  ", region: "Тракия", status: "active" }), "org-1");
assert.equal(ok.error, undefined, "valid");
assert.equal(ok.values.organization_id, "org-1", "org injected");
assert.equal(ok.values.city, "Пловдив", "city trimmed");
assert.equal(ok.values.region, "Тракия", "region kept");
assert.equal(parseServiceAreaForm(form({}), "o").error, "city_required", "city required");
assert.equal(parseServiceAreaForm(form({ city: "X" }), "o").values.region, null, "no region -> null");
assert.equal(parseServiceAreaForm(form({ city: "X" }), "o").values.status, "active", "default status");
console.log("service-area-form checks passed");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && node ./scripts/test-service-form.mjs`
Expected: FAIL with `Missing module: .../service-form.ts`. (Same for the other two.)

- [ ] **Step 3: Implement `service-form.ts`**

Create `apps/web/src/lib/agent/service-form.ts`:

```ts
// Pure validator for a service. Prices are optional and stored for the owner's reference (NOT spoken).
type FormLike = { get(name: string): unknown };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => {
  const s = text(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export const SERVICE_STATUSES = ["active", "paused", "archived"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
const parseStatus = (v: unknown): ServiceStatus =>
  typeof v === "string" && (SERVICE_STATUSES as readonly string[]).includes(v) ? (v as ServiceStatus) : "active";

export type ServiceValues = {
  organization_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  status: ServiceStatus;
};

export function parseServiceForm(form: FormLike, organizationId: string): { error?: string; values: ServiceValues | null } {
  const name = text(form.get("name"));
  if (!name) return { error: "service_name_required", values: null };

  const duration = num(form.get("duration_minutes")) ?? 60;
  if (duration < 5 || duration > 1440) return { error: "duration_out_of_range", values: null };

  const priceMin = num(form.get("price_min"));
  const priceMax = num(form.get("price_max"));
  if ((priceMin !== null && priceMin < 0) || (priceMax !== null && priceMax < 0))
    return { error: "price_negative", values: null };
  if (priceMin !== null && priceMax !== null && priceMin > priceMax)
    return { error: "price_range_invalid", values: null };

  return {
    error: undefined,
    values: {
      organization_id: organizationId,
      name,
      description: text(form.get("description")),
      duration_minutes: duration,
      price_min: priceMin,
      price_max: priceMax,
      currency: text(form.get("currency")) ?? "EUR",
      status: parseStatus(form.get("status")),
    },
  };
}
```

- [ ] **Step 4: Implement `business-hours-form.ts`**

Create `apps/web/src/lib/agent/business-hours-form.ts`:

```ts
// Pure validator for the weekly-hours grid. The form submits parallel arrays indexed by row:
// weekday[], is_closed[] ("on" | ""), opens_at[], closes_at[]. Returns one row per submitted weekday.
type MultiFormLike = { get(name: string): unknown; getAll(name: string): unknown[] };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export type BusinessHourValues = {
  organization_id: string;
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

export function parseBusinessHoursForm(
  form: MultiFormLike,
  organizationId: string
): { error?: string; values: BusinessHourValues[] | null } {
  const weekdays = form.getAll("weekday");
  const closed = form.getAll("is_closed");
  const opens = form.getAll("opens_at");
  const closes = form.getAll("closes_at");
  const rows: BusinessHourValues[] = [];

  for (let i = 0; i < weekdays.length; i++) {
    const weekday = Number(text(weekdays[i]));
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "weekday_invalid", values: null };
    const isClosed = text(closed[i]) === "on";
    const opensAt = text(opens[i]);
    const closesAt = text(closes[i]);
    if (!isClosed) {
      if (!opensAt || !closesAt || opensAt >= closesAt) return { error: "hours_invalid_range", values: null };
    }
    rows.push({
      organization_id: organizationId,
      weekday,
      opens_at: isClosed ? null : opensAt,
      closes_at: isClosed ? null : closesAt,
      is_closed: isClosed,
    });
  }
  return { error: undefined, values: rows };
}
```

- [ ] **Step 5: Implement `service-area-form.ts`**

Create `apps/web/src/lib/agent/service-area-form.ts`:

```ts
type FormLike = { get(name: string): unknown };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export const AREA_STATUSES = ["active", "paused"] as const;
export type AreaStatus = (typeof AREA_STATUSES)[number];
const parseStatus = (v: unknown): AreaStatus =>
  typeof v === "string" && (AREA_STATUSES as readonly string[]).includes(v) ? (v as AreaStatus) : "active";

export type ServiceAreaValues = {
  organization_id: string;
  city: string;
  region: string | null;
  status: AreaStatus;
};

export function parseServiceAreaForm(form: FormLike, organizationId: string): { error?: string; values: ServiceAreaValues | null } {
  const city = text(form.get("city"));
  if (!city) return { error: "city_required", values: null };
  return {
    error: undefined,
    values: {
      organization_id: organizationId,
      city,
      region: text(form.get("region")),
      status: parseStatus(form.get("status")),
    },
  };
}
```

- [ ] **Step 6: Run all three tests to verify they pass**

Run: `cd apps/web && node ./scripts/test-service-form.mjs && node ./scripts/test-business-hours-form.mjs && node ./scripts/test-service-area-form.mjs`
Expected: three "... checks passed" lines.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/agent/service-form.ts apps/web/src/lib/agent/business-hours-form.ts apps/web/src/lib/agent/service-area-form.ts apps/web/scripts/test-service-form.mjs apps/web/scripts/test-business-hours-form.mjs apps/web/scripts/test-service-area-form.mjs
git commit -m "feat(4b): pure fact form parsers (services/hours/areas) + tests"
```

---

## Task 4: Behavior parser + composer data reader

**Files:**
- Modify: `apps/web/src/lib/agent/assistant-form.ts`
- Modify: `apps/web/scripts/test-assistant-sync.mjs`
- Create: `apps/web/src/lib/agent/composer-data.ts`

- [ ] **Step 1: Update the parser test (failing)**

In `apps/web/scripts/test-assistant-sync.mjs`, replace the import on line 24 and the `parseAssistantForm` section (lines 57–66) with:

```js
const { parseAgentBehaviorForm } = await loadModule(["src", "lib", "agent", "assistant-form.ts"]);
```
and (replacing the old `--- parseAssistantForm ---` block):
```js
// --- parseAgentBehaviorForm ---
const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });
assert.equal(parseAgentBehaviorForm(form({ base_prompt: "p" })).error, "name_required", "name required");
assert.equal(parseAgentBehaviorForm(form({ name: "n" })).error, "base_prompt_required", "base required (no blanking)");
const okb = parseAgentBehaviorForm(form({ name: "  Бот  ", base_prompt: "  База  ", first_message: " Здравей ", guardrails: " Правило " }));
assert.equal(okb.error, undefined, "valid form");
assert.equal(okb.values.name, "Бот", "name trimmed");
assert.equal(okb.values.basePrompt, "База", "base trimmed");
assert.equal(okb.values.firstMessage, "Здравей", "greeting trimmed");
assert.equal(okb.values.guardrails, "Правило", "guardrails trimmed");
assert.equal(parseAgentBehaviorForm(form({ name: "n", base_prompt: "p" })).values.guardrails, "", "guardrails may be empty");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && node ./scripts/test-assistant-sync.mjs`
Expected: FAIL (`parseAgentBehaviorForm` is not exported yet).

- [ ] **Step 3: Rewrite `assistant-form.ts`**

Replace the entire contents of `apps/web/src/lib/agent/assistant-form.ts`:

```ts
// Pure validator for the agent "Behavior" tab. name + base_prompt are REQUIRED (never blank the agent's
// core behavior). first_message (greeting) and guardrails are optional. The composed system_prompt is
// built elsewhere (prompt-composer) at publish time.

type FormLike = { get(name: string): unknown };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function parseAgentBehaviorForm(form: FormLike): {
  error?: string;
  values: { name: string; firstMessage: string; basePrompt: string; guardrails: string } | null;
} {
  const name = text(form.get("name"));
  const basePrompt = text(form.get("base_prompt"));
  if (!name) return { error: "name_required", values: null };
  if (!basePrompt) return { error: "base_prompt_required", values: null };
  return {
    error: undefined,
    values: {
      name,
      firstMessage: text(form.get("first_message")) ?? "",
      basePrompt,
      guardrails: text(form.get("guardrails")) ?? "",
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && node ./scripts/test-assistant-sync.mjs`
Expected: `assistant-sync checks passed`.

- [ ] **Step 5: Implement `composer-data.ts`**

Create `apps/web/src/lib/agent/composer-data.ts`:

```ts
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import {
  composeSystemPrompt,
  renderBusinessContext,
  DEFAULT_BASE_PROMPT,
} from "@/lib/agent/prompt-composer";

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  status: string;
};
export type HoursRow = { weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };
export type AreaRow = { id: string; city: string; region: string | null; status: string };

export type AgentComposerData = {
  vapiAssistantId: string;
  name: string;
  firstMessage: string;
  basePrompt: string;
  guardrails: string;
  services: ServiceRow[];
  hours: HoursRow[]; // 0–7 stored rows; the UI grid fills missing weekdays for editing
  areas: AreaRow[];
  composedPreview: string;
};

// RLS session client -> everything is org-scoped automatically.
export async function getAgentComposerData(): Promise<AgentComposerData | null> {
  const org = await getActiveOrganization();
  if (!org) return null;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("assistants")
    .select("vapi_assistant_id, name, first_message, base_prompt, guardrails")
    .eq("organization_id", org.id)
    .limit(1)
    .maybeSingle();
  if (!row?.vapi_assistant_id) return null;

  const [{ data: services }, { data: hours }, { data: areas }] = await Promise.all([
    supabase.from("services").select("id, name, description, duration_minutes, price_min, price_max, currency, status").eq("organization_id", org.id).order("name"),
    supabase.from("business_hours").select("weekday, opens_at, closes_at, is_closed").eq("organization_id", org.id).order("weekday"),
    supabase.from("service_areas").select("id, city, region, status").eq("organization_id", org.id).order("city"),
  ]);

  const basePrompt = row.base_prompt ?? DEFAULT_BASE_PROMPT;
  const guardrails = row.guardrails ?? "";
  const businessContext = renderBusinessContext({
    orgName: org.name,
    services: (services ?? []).map((s) => ({ name: s.name, description: s.description, status: s.status })),
    hours: hours ?? [],
    areas: (areas ?? []).map((a) => ({ city: a.city, region: a.region, status: a.status })),
  });

  return {
    vapiAssistantId: row.vapi_assistant_id,
    name: row.name ?? "",
    firstMessage: row.first_message ?? "",
    basePrompt,
    guardrails,
    services: services ?? [],
    hours: hours ?? [],
    areas: areas ?? [],
    composedPreview: composeSystemPrompt({ base: basePrompt, businessContext, guardrails }),
  };
}
```

> Note: `getActiveOrganization()` returns `{ id, name, slug, timezone }` (confirmed in `lib/auth/organization.ts`), so `org.name` is available for the business-context header.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/agent/assistant-form.ts apps/web/scripts/test-assistant-sync.mjs apps/web/src/lib/agent/composer-data.ts
git commit -m "feat(4b): behavior parser + composer data reader (server-side preview)"
```

---

## Task 5: Server actions (fact CRUD + behavior + publish)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/assistant/actions.ts`

- [ ] **Step 1: Rewrite `actions.ts`**

Replace the entire contents of `apps/web/src/app/(dashboard)/assistant/actions.ts`. This keeps the existing admin-gate + `ActionResult` pattern, adds fact CRUD + behavior save (DB-only) + `publishAssistant` (Vapi-first, then persist composed prompt):

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import { parseAgentBehaviorForm } from "@/lib/agent/assistant-form";
import { parseServiceForm } from "@/lib/agent/service-form";
import { parseBusinessHoursForm } from "@/lib/agent/business-hours-form";
import { parseServiceAreaForm } from "@/lib/agent/service-area-form";
import { composeSystemPrompt, renderBusinessContext, DEFAULT_BASE_PROMPT } from "@/lib/agent/prompt-composer";
import { createClient } from "@/lib/supabase/server";
import { syncAssistantToVapi } from "@/lib/vapi/assistant-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Shared: resolve org + assert the caller is owner/admin (fact tables + assistants are admin-manage in RLS;
// the explicit gate turns a silent RLS failure into a clean error). Returns the RLS client + org.
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

// ---- Behavior (DB-only draft; goes live on Publish) ----
export async function updateAgentBehavior(formData: FormData): Promise<ActionResult> {
  const parsed = parseAgentBehaviorForm(formData);
  if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "invalid" };
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const { error } = await gate.supabase
    .from("assistants")
    .update({
      name: parsed.values.name,
      first_message: parsed.values.firstMessage,
      base_prompt: parsed.values.basePrompt,
      guardrails: parsed.values.guardrails,
    })
    .eq("organization_id", gate.org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}

// ---- Services ----
export async function createService(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const parsed = parseServiceForm(formData, gate.org.id);
  if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "invalid" };
  const { error } = await gate.supabase.from("services").insert(parsed.values);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}

export async function deleteService(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { error } = await gate.supabase.from("services").delete().eq("id", id).eq("organization_id", gate.org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}

// ---- Working hours (upsert the whole week in one submit) ----
export async function saveBusinessHours(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const parsed = parseBusinessHoursForm(formData, gate.org.id);
  if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "invalid" };
  const { error } = await gate.supabase
    .from("business_hours")
    .upsert(parsed.values, { onConflict: "organization_id,weekday" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}

// ---- Service areas ----
export async function createServiceArea(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const parsed = parseServiceAreaForm(formData, gate.org.id);
  if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "invalid" };
  const { error } = await gate.supabase.from("service_areas").insert(parsed.values);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}

export async function deleteServiceArea(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { error } = await gate.supabase.from("service_areas").delete().eq("id", id).eq("organization_id", gate.org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}

// ---- Publish: compose from current facts, push to Vapi (first), then persist the composed prompt ----
export async function publishAssistant(): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { org, supabase } = gate;

  const { data: row } = await supabase
    .from("assistants")
    .select("id, vapi_assistant_id, name, first_message, base_prompt, guardrails")
    .eq("organization_id", org.id)
    .limit(1)
    .maybeSingle();
  if (!row?.vapi_assistant_id) return { ok: false, error: "no_assistant" };

  const [{ data: services }, { data: hours }, { data: areas }] = await Promise.all([
    supabase.from("services").select("name, description, status").eq("organization_id", org.id),
    supabase.from("business_hours").select("weekday, opens_at, closes_at, is_closed").eq("organization_id", org.id),
    supabase.from("service_areas").select("city, region, status").eq("organization_id", org.id),
  ]);

  const base = row.base_prompt ?? DEFAULT_BASE_PROMPT;
  const guardrails = row.guardrails ?? "";
  const businessContext = renderBusinessContext({
    orgName: org.name,
    services: services ?? [],
    hours: hours ?? [],
    areas: areas ?? [],
  });
  const composed = composeSystemPrompt({ base, businessContext, guardrails });

  try {
    await syncAssistantToVapi(row.vapi_assistant_id, {
      name: row.name,
      firstMessage: row.first_message ?? "",
      systemPrompt: composed,
    });
  } catch (error) {
    console.error("Vapi publish failed:", error);
    return { ok: false, error: "vapi_sync_failed" };
  }

  const { error } = await supabase.from("assistants").update({ system_prompt: composed }).eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(dashboard)/assistant/actions.ts
git commit -m "feat(4b): server actions — fact CRUD, behavior save, publish (Vapi-first)"
```

---

## Task 6: Tabbed Agent Builder UI

**Files:**
- Create: `apps/web/src/app/(dashboard)/assistant/agent-builder.tsx` and `tabs/{behavior,services,hours,areas,publish}-tab.tsx`
- Modify: `apps/web/src/app/(dashboard)/assistant/page.tsx`
- Delete: `apps/web/src/app/(dashboard)/assistant/assistant-editor.tsx`

- [ ] **Step 1: Shared error labels + tab container**

Create `apps/web/src/app/(dashboard)/assistant/agent-builder.tsx`:

```tsx
"use client";

import { useState } from "react";

import type { AgentComposerData } from "@/lib/agent/composer-data";

import { BehaviorTab } from "./tabs/behavior-tab";
import { ServicesTab } from "./tabs/services-tab";
import { HoursTab } from "./tabs/hours-tab";
import { AreasTab } from "./tabs/areas-tab";
import { PublishTab } from "./tabs/publish-tab";

export const inputClass =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--accent-strong)]";

export function errorLabel(code: string): string {
  switch (code) {
    case "name_required": return "Въведи име на асистента.";
    case "base_prompt_required": return "Базовият промпт (поведение) не може да е празен.";
    case "service_name_required": return "Услугата трябва да има име.";
    case "duration_out_of_range": return "Времетраенето трябва да е между 5 и 1440 минути.";
    case "price_range_invalid": return "Минималната цена не може да е над максималната.";
    case "price_negative": return "Цената не може да е отрицателна.";
    case "hours_invalid_range": return "За отворен ден въведи начало и край, като началото е преди края.";
    case "city_required": return "Въведи град.";
    case "not_admin": return "Нямаш права (само owner/admin).";
    case "no_assistant": return "Няма свързан Vapi асистент.";
    case "vapi_sync_failed": return "Неуспешен синк към Vapi — нищо не е публикувано. Опитай пак.";
    case "no_org": return "Няма активна организация.";
    default: return "Неуспешно записване.";
  }
}

const TABS = [
  { key: "behavior", label: "Поведение" },
  { key: "services", label: "Услуги" },
  { key: "hours", label: "Работно време" },
  { key: "areas", label: "Райони" },
  { key: "publish", label: "Преглед & публикуване" },
] as const;

export function AgentBuilder({ data }: { data: AgentComposerData | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("behavior");
  if (!data) {
    return <div className="syn-card p-5 text-sm text-[var(--ink-soft)]">Няма свързан асистент за тази организация.</div>;
  }
  return (
    <div className="syn-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "behavior" ? <BehaviorTab data={data} /> : null}
      {tab === "services" ? <ServicesTab services={data.services} /> : null}
      {tab === "hours" ? <HoursTab hours={data.hours} /> : null}
      {tab === "areas" ? <AreasTab areas={data.areas} /> : null}
      {tab === "publish" ? <PublishTab preview={data.composedPreview} /> : null}
    </div>
  );
}
```

- [ ] **Step 2: Behavior tab**

Create `apps/web/src/app/(dashboard)/assistant/tabs/behavior-tab.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { AgentComposerData } from "@/lib/agent/composer-data";

import { updateAgentBehavior } from "../actions";
import { errorLabel, inputClass } from "../agent-builder";

export function BehaviorTab({ data }: { data: AgentComposerData }) {
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
      const result = await updateAgentBehavior(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else { setSaved(true); router.refresh(); }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Име на асистента</span>
        <input name="name" defaultValue={data.name} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Поздрав (първо съобщение)</span>
        <input name="first_message" defaultValue={data.firstMessage} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Базов промпт (поведение)</span>
        <textarea name="base_prompt" defaultValue={data.basePrompt} rows={16}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-[var(--accent-strong)]" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Твърди правила (guardrails)</span>
        <textarea name="guardrails" defaultValue={data.guardrails} rows={6}
          placeholder="напр. Не давай медицински съвети. Винаги предлагай запис."
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-[var(--accent-strong)]" />
      </label>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--ink-muted)]">Записва като чернова. Пусни на живо от таб „Преглед & публикуване".</p>
        <div className="flex items-center gap-3">
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
          {saved && !error ? <span className="text-sm font-medium text-[var(--accent-strong)]">Записано ✓</span> : null}
          <button type="submit" disabled={isPending}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
            {isPending ? "Записва…" : "Запази"}
          </button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Services tab**

Create `apps/web/src/app/(dashboard)/assistant/tabs/services-tab.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { ServiceRow } from "@/lib/agent/composer-data";

import { createService, deleteService } from "../actions";
import { errorLabel, inputClass } from "../agent-builder";

export function ServicesTab({ services }: { services: ServiceRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formEl = event.currentTarget;
    setError(null);
    startTransition(async () => {
      const result = await createService(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else { formEl.reset(); router.refresh(); }
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteService(id);
      if (!result.ok) setError(errorLabel(result.error));
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--ink-muted)]">Цените се пазят за твоя справка и <strong>не се казват по телефона</strong> (отключва се с документи в следваща фаза).</p>
      <div className="divide-y divide-[var(--line)]">
        {services.length === 0 ? <p className="py-3 text-sm text-[var(--ink-soft)]">Няма добавени услуги.</p> : null}
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div>
              <span className="font-medium">{s.name}</span>
              {s.description ? <span className="text-[var(--ink-muted)]"> — {s.description}</span> : null}
              <span className="ml-2 font-mono text-xs text-[var(--ink-muted)]">{s.duration_minutes} мин · {s.status}</span>
            </div>
            <button onClick={() => remove(s.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-60">Изтрий</button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-3">
        <input name="name" placeholder="Име на услуга" className={inputClass} />
        <input name="description" placeholder="Кратко описание (по избор)" className={inputClass} />
        <input name="duration_minutes" type="number" min={5} max={1440} defaultValue={60} placeholder="Времетраене (мин)" className={inputClass} />
        <div className="grid grid-cols-3 gap-2">
          <input name="price_min" type="number" min={0} step="0.01" placeholder="Цена от" className={inputClass} />
          <input name="price_max" type="number" min={0} step="0.01" placeholder="до" className={inputClass} />
          <input name="currency" defaultValue="EUR" className={inputClass} />
        </div>
        <input type="hidden" name="status" value="active" />
        <div className="col-span-2 flex items-center justify-between gap-3">
          {error ? <span className="text-sm text-red-600">{error}</span> : <span />}
          <button type="submit" disabled={isPending}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
            {isPending ? "…" : "Добави услуга"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Hours tab**

Create `apps/web/src/app/(dashboard)/assistant/tabs/hours-tab.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { HoursRow } from "@/lib/agent/composer-data";

import { saveBusinessHours } from "../actions";
import { errorLabel } from "../agent-builder";

const DAYS = [
  { weekday: 1, label: "Понеделник" }, { weekday: 2, label: "Вторник" }, { weekday: 3, label: "Сряда" },
  { weekday: 4, label: "Четвъртък" }, { weekday: 5, label: "Петък" }, { weekday: 6, label: "Събота" },
  { weekday: 0, label: "Неделя" },
];

export function HoursTab({ hours }: { hours: HoursRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const byDay = new Map(hours.map((h) => [h.weekday, h]));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBusinessHours(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else { setSaved(true); router.refresh(); }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {DAYS.map((d) => {
        const row = byDay.get(d.weekday);
        return (
          <div key={d.weekday} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 text-sm">
            <span className="font-medium text-[var(--ink-soft)]">{d.label}</span>
            <input type="hidden" name="weekday" value={d.weekday} />
            <select name="is_closed" defaultValue={row?.is_closed ? "on" : ""}
              className="h-9 rounded-lg border border-[var(--line)] bg-[var(--background)] px-2 text-xs">
              <option value="">отворено</option>
              <option value="on">почивен</option>
            </select>
            <input type="time" name="opens_at" defaultValue={row?.opens_at?.slice(0, 5) ?? "09:00"}
              className="h-9 rounded-lg border border-[var(--line)] bg-[var(--background)] px-2" />
            <input type="time" name="closes_at" defaultValue={row?.closes_at?.slice(0, 5) ?? "18:00"}
              className="h-9 rounded-lg border border-[var(--line)] bg-[var(--background)] px-2" />
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
        {error ? <span className="text-sm text-red-600">{error}</span> : saved ? <span className="text-sm font-medium text-[var(--accent-strong)]">Записано ✓</span> : <span />}
        <button type="submit" disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
          {isPending ? "Записва…" : "Запази работно време"}
        </button>
      </div>
    </form>
  );
}
```

> Note: use a `<select>` (not a checkbox) for open/closed — **unchecked checkboxes are omitted from `FormData`**, which would misalign the parallel `weekday[]/is_closed[]/opens_at[]/closes_at[]` arrays the parser reads. A `<select>` always submits, keeping rows aligned. The parser ignores the time inputs when `is_closed === "on"`; open days validate `opens_at < closes_at`.

- [ ] **Step 5: Areas tab**

Create `apps/web/src/app/(dashboard)/assistant/tabs/areas-tab.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { AreaRow } from "@/lib/agent/composer-data";

import { createServiceArea, deleteServiceArea } from "../actions";
import { errorLabel, inputClass } from "../agent-builder";

export function AreasTab({ areas }: { areas: AreaRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formEl = event.currentTarget;
    setError(null);
    startTransition(async () => {
      const result = await createServiceArea(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else { formEl.reset(); router.refresh(); }
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteServiceArea(id);
      if (!result.ok) setError(errorLabel(result.error));
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {areas.length === 0 ? <p className="text-sm text-[var(--ink-soft)]">Няма добавени райони.</p> : null}
        {areas.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm">
            {a.city}{a.region ? ` (${a.region})` : ""}
            <button onClick={() => remove(a.id)} disabled={isPending} className="text-red-600 hover:underline disabled:opacity-60">×</button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-[var(--line)] pt-3">
        <input name="city" placeholder="Град" className={inputClass} />
        <input name="region" placeholder="Регион/квартал (по избор)" className={inputClass} />
        <input type="hidden" name="status" value="active" />
        <button type="submit" disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
          {isPending ? "…" : "Добави"}
        </button>
        {error ? <span className="col-span-3 text-sm text-red-600">{error}</span> : null}
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Publish tab**

Create `apps/web/src/app/(dashboard)/assistant/tabs/publish-tab.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { publishAssistant } from "../actions";
import { errorLabel } from "../agent-builder";

export function PublishTab({ preview }: { preview: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  function publish() {
    setError(null);
    setPublished(false);
    startTransition(async () => {
      const result = await publishAssistant();
      if (!result.ok) setError(errorLabel(result.error));
      else { setPublished(true); router.refresh(); }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--ink-muted)]">Това е точният системен промпт, който ще отиде <strong>на живо</strong> във Vapi. Гласът и инструментите за записване се запазват непокътнати.</p>
      <pre className="max-h-[420px] overflow-auto rounded-lg border border-[var(--line)] bg-[var(--background)] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">{preview}</pre>
      <div className="flex items-center justify-between gap-3">
        {error ? <span className="text-sm text-red-600">{error}</span> : published ? <span className="text-sm font-medium text-[var(--accent-strong)]">Публикувано на живо ✓</span> : <span />}
        <button onClick={publish} disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
          {isPending ? "Публикува…" : "Публикувай на живо"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire the page + delete the old editor**

In `apps/web/src/app/(dashboard)/assistant/page.tsx`: replace the `getAssistantEditorData` import + `<AssistantEditor>` usage with the new builder.

Change line 7 import from `getAssistantEditorData` (in `@/lib/agent/assistant`) to:
```tsx
import { getAgentComposerData } from "@/lib/agent/composer-data";
```
Change line 10 import to:
```tsx
import { AgentBuilder } from "./agent-builder";
```
Change lines 24–25 + 56:
```tsx
  const assistant = await getAssistantOverviewData();
  const editor = await getAgentComposerData();
```
```tsx
      <AgentBuilder data={editor} />
```

Then delete the old editor and reader (after confirming no other importers):
```bash
grep -rn "assistant-editor\|getAssistantEditorData\|AssistantEditorData" apps/web/src   # expect: none outside the deleted files
git rm apps/web/src/app/(dashboard)/assistant/assistant-editor.tsx apps/web/src/lib/agent/assistant.ts
```

- [ ] **Step 8: Typecheck + build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/(dashboard)/assistant apps/web/src/lib/agent
git commit -m "feat(4b): tabbed Agent Builder UI (behavior/services/hours/areas/publish)"
```

---

## Task 7: Manual E2E verification + deploy

**Files:** none (verification + deploy)

- [ ] **Step 1: Run the full unit suite**

Run: `cd apps/web && node ./scripts/test-prompt-composer.mjs && node ./scripts/test-service-form.mjs && node ./scripts/test-business-hours-form.mjs && node ./scripts/test-service-area-form.mjs && node ./scripts/test-assistant-sync.mjs`
Expected: all "checks passed".

- [ ] **Step 2: Local smoke (dev server)**

Run: `cd apps/web && npm run dev`. Log in, open `/assistant`. In each tab: add a service, set hours, add an area, edit base/guardrails, then open "Преглед & публикуване" — the preview must contain `## Бизнес контекст` with the service/area you added and NO prices.

- [ ] **Step 3: Publish + verify live in Vapi**

Click "Публикувай на живо". Then verify the live assistant got the composed prompt AND that tools/voice survived (reuse the check from `scratchpad/verify-tools`-style GET):

```bash
node -e "import('node:fs').then(async fs=>{const env=Object.fromEntries(fs.readFileSync('apps/web/.env.local','utf8').split(/\r?\n/).map(l=>/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l)).filter(Boolean).map(m=>[m[1],m[2].replace(/^['\"]|['\"]$/g,'')]));const key=env.VAPI_PRIVATE_KEY||env.VAPI_API_KEY;const r=await fetch('https://api.vapi.ai/assistant/3a342308-b8fb-4194-a629-08fd978fdeea',{headers:{Authorization:'Bearer '+key}});const a=await r.json();const sys=(a.model?.messages||[]).find(m=>m.role==='system');console.log('has business context:', sys?.content?.includes('Бизнес контекст'));console.log('toolIds:', (a.model?.toolIds||[]).length, 'voice:', a.voice?.voiceId);})"
```

Expected: `has business context: true`, `toolIds: 2`, voice unchanged.

- [ ] **Step 4: Commit any fixups, then deploy**

```bash
git push origin main
```
Then poll prod health until the pushed SHA lands (`GET https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call` → `commit` matches `git rev-parse HEAD`), as in `memory/deploy-and-infra`.

- [ ] **Step 5: (Optional) Test call**

Place a test call; confirm the assistant reflects the business facts (mentions a service/area when relevant) and never quotes a price.

---

## Notes for the implementer

- **Next.js is customized** (`apps/web/AGENTS.md`) — read `apps/web/node_modules/next/dist/docs/` before touching framework APIs. Server Actions + `revalidatePath` are used exactly as in the existing `leads/actions.ts` and the old `assistant/actions.ts`.
- **RLS is the security boundary.** All fact CRUD uses the session client (`@/lib/supabase/server` `createClient()`), which scopes every query to the caller's org; the explicit admin gate only produces clean errors (RLS is admin-manage for these tables).
- **Never touch `analysisPlan`/`model.toolIds` on publish** — `syncAssistantToVapi` sends only `{ name, firstMessage, model }` and `buildSyncedModel` preserves tools/voice/temperature. Do not add fields.
- **Prices stay out of the prompt** (Phase 4c/Knowledge Base unlocks them). `renderBusinessContext` must never emit a price — the composer test asserts this.
- **Cyrillic care:** when editing `.ts`/`.tsx` with Cyrillic string literals, copy exact bytes; a Latin look-alike (е/e, а/a) is a real bug.
- **Service edit is deferred (v1 = add + delete):** to change a service, delete it and re-add. No `updateService` action in v1 — an edit modal + `updateService` is a fast follow if needed.
