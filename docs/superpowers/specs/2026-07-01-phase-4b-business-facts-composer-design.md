# Phase 4b — Business Facts + Prompt Composer (Design)

**Goal:** Let a business owner fill in structured business facts (services, working hours, service areas) plus a separate guardrails field in the dashboard, and have the assistant's Vapi system prompt **composed** from those facts and pushed live — all from our app, with no Vapi dashboard access required.

**Architecture:** Compose-around-a-base. A curated, editable **base prompt** (behavior) stays hand-authored. The composer generates a **"Бизнес контекст"** section from the structured facts and a **"Твърди правила"** section from a separate guardrails field, then assembles `base + business-context + guardrails → system_prompt`, which is synced to Vapi via the existing `syncAssistantToVapi` (proven, live). Facts persist to the DB immediately; the composed prompt goes live only on an explicit **"Публикувай"** click (which fully auto-syncs to Vapi).

**Tech stack:** Next.js 16 (App Router, Server Actions, RSC), Supabase (RLS session client), existing Vapi sync client, pure composer functions (unit-tested like `buildSyncedModel`).

---

## Locked decisions (from brainstorm 2026-07-01)

1. **Composer model = compose-around-base.** `system_prompt` becomes a *derived* value (base + facts + guardrails). The owner edits base/guardrails/facts, never the composed blob directly.
2. **Publish = explicit button in our app → full auto-sync to Vapi.** The end customer never touches the Vapi dashboard. "Explicit" only means "on a button click, not on every keystroke"; behind the button the Vapi API PATCH is 100% automatic. Verified today: API PATCH updates the live assistant with no manual Vapi "Publish".
3. **Prices: default OFF, and not even in the prompt.** `services.price_min/price_max` are stored for the owner's reference but are **omitted from the composed prompt entirely**, so the model can't leak them. The base/guardrails keep the "no prices by phone, offer an exact quote" rule.
4. **Document upload / Knowledge Base = Phase 4c (separate, next).** Uploading a price list there will unlock spoken prices; without documents, still no prices. Not in this spec. Vapi Knowledge Base (`knowledgeBaseId`, already preserved in `buildSyncedModel`) is the mechanism.

**Also out of scope for 4b:** model/voice selector UI (separate small slice), per-service price-quote toggle (folded into 4c).

---

## Data model

All three fact tables already exist (migration `001`) with org-scoped RLS: `members can read` + **`admins can manage`** (full CRUD). No policy changes needed.

- **`services`**: `name` (unique per org), `description`, `duration_minutes` (5–1440, default 60), `price_min`/`price_max` (numeric, optional, min≤max), `currency` (default EUR), `status` (active/paused/archived).
- **`business_hours`**: one row per `weekday` (0–6, unique per org), `opens_at`/`closes_at` (time), `is_closed`; CHECK enforces `is_closed OR opens<closes`.
- **`service_areas`**: `city` (unique per org), `region`, `status` (active/paused).

**New migration `004_assistant_prompt_composition.sql`** — add two nullable columns to `assistants`:

```sql
alter table public.assistants add column if not exists base_prompt text;
alter table public.assistants add column if not exists guardrails text;

-- Seed base_prompt from the current prompt so existing behavior is preserved.
update public.assistants set base_prompt = system_prompt where base_prompt is null;
```

After this, `system_prompt` is the **composed output** (synced to Vapi); `base_prompt` + `guardrails` are the composer inputs. `name`, `first_message`, `model`, `voice_provider`, `voice_id` are unchanged.

---

## Composer (pure functions — `apps/web/src/lib/agent/prompt-composer.ts`)

Two pure, unit-tested functions (mirroring `lib/vapi/assistant-client` `buildSyncedModel`):

```ts
type ServiceFact = { name: string; description?: string | null; status: string };
type HoursFact = { weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };
type AreaFact = { city: string; region?: string | null; status: string };

export function renderBusinessContext(input: {
  orgName?: string | null;
  services: ServiceFact[];
  hours: HoursFact[];
  areas: AreaFact[];
}): string;

export function composeSystemPrompt(input: {
  base: string;
  businessContext: string;
  guardrails?: string | null;
}): string;
```

**`renderBusinessContext`** produces a Bulgarian block. Only `active` services/areas are included; **prices are never rendered**. Empty subsections are omitted entirely.

```
## Бизнес контекст
Фирма: <orgName>
Услуги: <name1>, <name2>, <name3>
Работно време: Пон 09:00–18:00, Вт 09:00–18:00, ..., Съб почивен, Нед почивен
Обслужвани райони: София, Пловдив (Тракия)
```

- Services → comma-separated active names (description appended in parentheses only if present). No durations/prices spoken.
- Hours → per-weekday, Bulgarian day abbreviations, `HH:MM–HH:MM` or "почивен" when `is_closed`. Weekdays with no stored row are omitted from the line; if no hours exist at all, the whole "Работно време" line is omitted.
- Areas → active cities, `city (region)` when region present.

**`composeSystemPrompt`** assembles, omitting empty sections:

```
<base>

<businessContext>

## Твърди правила (спазвай ги с най-висок приоритет)
<guardrails>
```

Returns `base` alone when businessContext and guardrails are empty (⇒ no regression for orgs with no facts). Trims trailing whitespace; single blank line between sections.

**Default base prompt:** a constant `DEFAULT_BASE_PROMPT` (the current generic behavior prompt from `docs/03-setup/generic-booking-receptionist-prompt-bg.md`) used when `base_prompt` is null (brand-new assistants). Existing rows are seeded by the migration.

---

## Reads — `apps/web/src/lib/agent/composer-data.ts`

`getAgentComposerData()` (RLS session client, org-scoped) returns everything the editor needs:

```ts
type AgentComposerData = {
  vapiAssistantId: string;
  name: string; firstMessage: string;
  basePrompt: string;           // falls back to DEFAULT_BASE_PROMPT
  guardrails: string;
  services: ServiceRow[]; hours: HoursRow[]; areas: AreaRow[];  // hours: 0–7 stored rows; the UI grid fills missing weekdays for editing
  composedPreview: string;      // composeSystemPrompt(base, renderBusinessContext(facts), guardrails)
} | null;
```

`composedPreview` is computed server-side from the same pure functions used at publish — the preview is authoritative.

---

## Server actions — `apps/web/src/app/(dashboard)/assistant/actions.ts` (extend)

All reuse the existing pattern: `getActiveOrganization()` → RLS `createClient()` → **admin-gate** (`organization_members.role ∈ {owner, admin}`) → `revalidatePath("/assistant")` → `ActionResult = { ok:true } | { ok:false; error }`. Fact tables' RLS is admin-only, so the explicit gate matches and yields clean errors.

- **Behavior draft:** `updateAgentBehavior(formData)` — saves `name`, `first_message`, `base_prompt`, `guardrails` to the `assistants` row (**DB only, no Vapi**). Parser: `lib/agent/assistant-form.ts` extended (name required; base_prompt required; guardrails optional).
- **Services:** `createService` / `updateService` / `deleteService` — parser `lib/agent/service-form.ts` (name required; duration 5–1440; price_min/max optional & `min≤max`; currency default EUR; status).
- **Hours:** `saveBusinessHours(formData)` — upserts all 7 weekdays in one submit (`onConflict: organization_id,weekday`); parser `lib/agent/business-hours-form.ts` enforces `is_closed OR opens<closes`.
- **Areas:** `createServiceArea` / `deleteServiceArea` — parser `lib/agent/service-area-form.ts` (city required; region optional; status).
- **Publish:** `publishAssistant()` — admin-gate → read row + facts → `composed = composeSystemPrompt(base, renderBusinessContext(facts), guardrails)` → `syncAssistantToVapi(vapiId, { name, firstMessage, systemPrompt: composed })` (**Vapi-first**) → on success persist `system_prompt = composed`; on failure return `vapi_sync_failed` and persist nothing. This **supersedes** Phase 4a's `updateAssistant` (which synced name/greeting/prompt immediately) — now everything is DB-draft until Publish, consistent with the explicit-publish decision.

---

## UI — `apps/web/src/app/(dashboard)/assistant/` (extend the existing page)

Keep the metric cards. Replace the single `AssistantEditor` with a tabbed **Agent Builder** (client component, `useTransition` + `router.refresh()`, same style as `leads-board.tsx`). Tabs:

1. **Поведение** — name, greeting (`first_message`), **base prompt** (textarea, relabeled from the old system-prompt field), **guardrails** (textarea). Save → `updateAgentBehavior`.
2. **Услуги** — table with add/edit/delete (name, description, duration, price range, status). Price inputs present but a hint notes prices aren't spoken yet (unlocked in 4c).
3. **Работно време** — 7-row grid (Пон–Нед): per day a "затворено" toggle + opens/closes time inputs. Save all → `saveBusinessHours`.
4. **Райони** — list of city/region with add/remove.
5. **Преглед & публикуване** — read-only `composedPreview` + **„Публикувай"** button → `publishAssistant`. BG error labels map codes (`not_admin`, `no_assistant`, `vapi_sync_failed`, …), same as current editor.

Reuse existing components: `PageHeader`, `SectionPanel`, `StatusBadge`, `Modal` (from leads), form primitives.

**Stretch (optional):** an "unpublished changes" indicator on the Publish tab — compare `composedPreview` to the live Vapi system message (one GET). Nice-to-have; skip for v1 if it adds cost.

---

## Error handling

- Parser validations return specific codes → BG labels in the client (e.g. `service_name_required`, `duration_out_of_range`, `hours_invalid_range`, `city_required`).
- Publish: Vapi-first; on Vapi error nothing is persisted and the composed prompt the owner previewed never half-lands. The live assistant is never left broken (matches today's `updateAssistant`).
- Non-admin: RLS blocks writes and the explicit gate returns `not_admin` before any Vapi call.
- Empty facts: composer returns base-only → publish still valid (no regression).

---

## Testing

- **Unit (pure fns)** via the existing `ts.transpileModule` + data-URL pattern (`scripts/test-*.mjs`):
  - `renderBusinessContext`: services filter to active + no prices; hours render incl. closed days; areas with/without region; empty categories omitted.
  - `composeSystemPrompt`: section ordering; empty businessContext/guardrails omitted; base-only when no facts; no leading/trailing blank-line drift.
- **Form parsers:** required fields, duration/price bounds, `min≤max`, hours `open<close`/closed.
- **Manual E2E:** add services/hours/areas → preview updates → Publish → verify live via `GET /assistant/{id}` (system message contains "## Бизнес контекст"); confirm `toolIds`/voice/schema preserved (reuse `scratchpad/verify-tools` style check); optional test call.

---

## File structure

**Create:**
- `supabase/migrations/004_assistant_prompt_composition.sql`
- `apps/web/src/lib/agent/prompt-composer.ts` (+ `DEFAULT_BASE_PROMPT`)
- `apps/web/src/lib/agent/composer-data.ts` (`getAgentComposerData`)
- `apps/web/src/lib/agent/service-form.ts`, `business-hours-form.ts`, `service-area-form.ts`
- `apps/web/scripts/test-prompt-composer.mjs`

**Modify:**
- `apps/web/src/types/database.ts` (add `base_prompt`, `guardrails` to `assistants`; ensure `services`/`business_hours`/`service_areas` typed)
- `apps/web/src/lib/agent/assistant-form.ts` (base_prompt + guardrails)
- `apps/web/src/app/(dashboard)/assistant/actions.ts` (add fact + behavior + publish actions; retire/replace `updateAssistant`)
- `apps/web/src/app/(dashboard)/assistant/assistant-editor.tsx` → tabbed builder (or split into `agent-builder.tsx` + tab components)
- `apps/web/src/app/(dashboard)/assistant/page.tsx` (feed `getAgentComposerData`)

**Unchanged (reused):** `lib/vapi/assistant-client.ts` (`syncAssistantToVapi`, `buildSyncedModel`), auth/org helpers, dashboard components.
