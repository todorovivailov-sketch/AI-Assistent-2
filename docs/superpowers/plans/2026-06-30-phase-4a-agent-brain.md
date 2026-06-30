# Phase 4a — Agent Brain (editable assistant + Vapi sync) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`. Work on
> `main` (project policy). **Read `node_modules/next/dist/docs/` before Next.js code** (customized Next 16).

**Goal:** Let an admin edit the assistant's **name, greeting (firstMessage), and system prompt** in the
dashboard and **push it live to the Vapi assistant** — replacing the manual `apply-prompt.mjs` ops step.

**Key findings (from mapping the live integration):**
- Vapi push = `PATCH https://api.vapi.ai/assistant/{id}` with `Bearer VAPI_PRIVATE_KEY`. Reference:
  `apps/web/scripts/vapi/apply-prompt.mjs`.
- **`PATCH model` REPLACES the whole model object.** The live assistant (`3a342308…`, `openai/gpt-5.4`)
  has **`toolIds` (2 booking tools)** and a voice. So we must **GET first, rebuild `model` preserving
  provider/model/toolIds/tools/temperature**, and swap only the `system` message — or we break booking.
- `assistants.system_prompt` / `first_message` columns exist but are **never written** today (vestigial).
  `name` is set. RLS: `admins can update assistants` already exists.
- `/assistant` page is a read-only async server component (`getAssistantOverviewData`); no forms/actions.

**Decisions (defaults — flag if you disagree):**
- **D1** — Editable: `name`, `first_message` (greeting), `system_prompt`. **Guardrails live inside the
  system prompt** (no separate column in v1). Model/voice/transcriber/tools are **preserved, not editable**.
- **D2** — Sync order: **Vapi first, then DB**, so the DB row reflects only successfully-pushed state.
  **Admin-gated** (owner/admin) before any Vapi call.
- **D3** — The editor **seeds from the live Vapi assistant when the DB prompt is empty** (first edit), so
  the user never starts from a blank prompt and can't accidentally wipe the live one. `name`/`system_prompt`
  are **required** by the validator (can't be blanked).
- **D4** — Source of truth shifts markdown-doc → **DB row + Vapi**. `apply-prompt.mjs` stays as a legacy
  ops tool.

**Tech Stack:** Next.js 16 (Server Actions, `revalidatePath`), `@supabase/ssr` RLS client, Vapi REST API,
existing `assistants` table + RLS.

---

## File Structure
- Create: `apps/web/src/lib/vapi/assistant-client.ts` — `getVapiAssistant`, `buildSyncedModel` (pure), `syncAssistantToVapi`.
- Create: `apps/web/src/lib/agent/assistant-form.ts` — `parseAssistantForm` (pure validator).
- Create: `apps/web/src/lib/agent/assistant.ts` — `getAssistantEditorData()` (DB read + Vapi seed when empty).
- Create: `apps/web/src/app/(dashboard)/assistant/actions.ts` — `updateAssistant` server action.
- Create: `apps/web/src/app/(dashboard)/assistant/assistant-editor.tsx` — client form.
- Modify: `apps/web/src/app/(dashboard)/assistant/page.tsx` — render the editor with seeded data.
- Test: `apps/web/scripts/test-assistant-sync.mjs` — `buildSyncedModel` + `parseAssistantForm`.

---

### Task 1: Pure logic (TDD) — model-merge + form validation

**Files:** Create `lib/vapi/assistant-client.ts` (partial: the pure `buildSyncedModel`), `lib/agent/assistant-form.ts`; Test `scripts/test-assistant-sync.mjs`.

- [ ] **Step 1: Failing test** (`test-assistant-sync.mjs`, transpile/data-URL pattern, strip imports). Assert:
  - `buildSyncedModel({ provider:"openai", model:"gpt-5.4", toolIds:["a","b"], messages:[{role:"system",content:"OLD"}] }, "NEW")` →
    keeps `provider`, `model`, `toolIds:["a","b"]`; the system message content === `"NEW"`.
  - When no system message exists, it is **prepended** (`messages[0].role==="system"`, content `"NEW"`).
  - Preserves `tools` array and `temperature` when present; omits them when absent.
  - `parseAssistantForm`: name+prompt required (`{ get }` form mock). Missing name → `name_required`;
    missing prompt → `prompt_required`; valid → trimmed values, firstMessage may be empty string.
- [ ] **Step 2: Run — expect FAIL.** `cd apps/web && node ./scripts/test-assistant-sync.mjs`.
- [ ] **Step 3: Implement `buildSyncedModel`** (exported from `lib/vapi/assistant-client.ts`):

```ts
type VapiModel = Record<string, unknown> & { messages?: Array<{ role: string; content: string }> };

export function buildSyncedModel(currentModel: VapiModel, systemPrompt: string) {
  const messages = Array.isArray(currentModel?.messages)
    ? currentModel.messages.map((m) => ({ ...m }))
    : [];
  const i = messages.findIndex((m) => m.role === "system");
  if (i >= 0) messages[i] = { ...messages[i], content: systemPrompt };
  else messages.unshift({ role: "system", content: systemPrompt });

  const m = currentModel ?? {};
  return {
    provider: m.provider,
    model: m.model,
    messages,
    ...(m.toolIds ? { toolIds: m.toolIds } : {}),
    ...(Array.isArray(m.tools) && m.tools.length ? { tools: m.tools } : {}),
    ...(m.temperature != null ? { temperature: m.temperature } : {}),
    ...(m.maxTokens != null ? { maxTokens: m.maxTokens } : {}),
    ...(m.knowledgeBaseId ? { knowledgeBaseId: m.knowledgeBaseId } : {}),
  };
}
```

- [ ] **Step 4: Implement `parseAssistantForm`** (`lib/agent/assistant-form.ts`):

```ts
type FormLike = { get(name: string): unknown };
const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function parseAssistantForm(form: FormLike): {
  error?: string;
  values: { name: string; firstMessage: string; systemPrompt: string } | null;
} {
  const name = text(form.get("name"));
  const systemPrompt = text(form.get("system_prompt"));
  if (!name) return { error: "name_required", values: null };
  if (!systemPrompt) return { error: "prompt_required", values: null };
  return { error: undefined, values: { name, firstMessage: text(form.get("first_message")) ?? "", systemPrompt } };
}
```

- [ ] **Step 5: Run — expect PASS. Commit** `test(agent): buildSyncedModel + assistant form validator`.

---

### Task 2: Vapi client (GET + sync)

**Files:** finish `lib/vapi/assistant-client.ts`.

- [ ] **Step 1: Add the fetch helpers + sync** (server-only; `VAPI_PRIVATE_KEY` preferred):

```ts
const VAPI_BASE = "https://api.vapi.ai";
function vapiKey() { return process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY || null; }

async function vapiFetch<T>(method: string, p: string, body?: unknown): Promise<T> {
  const key = vapiKey();
  if (!key) throw new Error("VAPI key missing");
  const res = await fetch(`${VAPI_BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  if (res.status >= 300) throw new Error(`Vapi ${method} ${p} -> ${res.status}: ${t.slice(0, 300)}`);
  try { return JSON.parse(t) as T; } catch { return {} as T; }
}

export async function getVapiAssistant(id: string): Promise<Record<string, any>> {
  return vapiFetch("GET", `/assistant/${encodeURIComponent(id)}`);
}

export async function syncAssistantToVapi(
  id: string,
  input: { name: string; firstMessage: string; systemPrompt: string }
) {
  const current = await getVapiAssistant(id);
  const model = buildSyncedModel((current?.model ?? {}) as VapiModel, input.systemPrompt);
  await vapiFetch("PATCH", `/assistant/${encodeURIComponent(id)}`, {
    name: input.name,
    firstMessage: input.firstMessage,
    model,
  });
}
```

- [ ] **Step 2: Typecheck. Commit** `feat(agent): Vapi assistant GET + sync client`.

---

### Task 3: Data layer — editor data with Vapi seed

**Files:** Create `lib/agent/assistant.ts`.

- [ ] **Step 1: Implement `getAssistantEditorData()`** — read the org's `assistants` row (RLS); if
  `system_prompt` empty, seed name/firstMessage/systemPrompt from the live Vapi assistant:

```ts
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import { getVapiAssistant } from "@/lib/vapi/assistant-client";

export type AssistantEditorData = {
  vapiAssistantId: string | null;
  name: string;
  firstMessage: string;
  systemPrompt: string;
  model: string | null;
  voiceProvider: string | null;
  status: string;
  seededFromVapi: boolean;
};

export async function getAssistantEditorData(): Promise<AssistantEditorData | null> {
  const org = await getActiveOrganization();
  if (!org) return null;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("assistants")
    .select("vapi_assistant_id, name, first_message, system_prompt, model, voice_provider, status")
    .eq("organization_id", org.id)
    .limit(1)
    .maybeSingle();
  if (!row) return null;

  let name = row.name ?? "";
  let firstMessage = row.first_message ?? "";
  let systemPrompt = row.system_prompt ?? "";
  let seededFromVapi = false;

  if (!systemPrompt && row.vapi_assistant_id) {
    try {
      const live = await getVapiAssistant(row.vapi_assistant_id);
      const sys = (live?.model?.messages ?? []).find((m: any) => m.role === "system");
      if (sys?.content) { systemPrompt = sys.content; seededFromVapi = true; }
      if (!firstMessage && typeof live?.firstMessage === "string") firstMessage = live.firstMessage;
      if (!name && typeof live?.name === "string") name = live.name;
    } catch (e) { console.error("Vapi seed failed:", e); }
  }
  return {
    vapiAssistantId: row.vapi_assistant_id,
    name, firstMessage, systemPrompt,
    model: row.model, voiceProvider: row.voice_provider, status: row.status, seededFromVapi,
  };
}
```

- [ ] **Step 2: Typecheck. Commit** `feat(agent): assistant editor data (DB + Vapi seed)`.

---

### Task 4: Server action — updateAssistant (admin → Vapi → DB)

**Files:** Create `app/(dashboard)/assistant/actions.ts`. (Read `node_modules/next/dist/docs` server-actions first.)

- [ ] **Step 1: Implement** (admin-gated; Vapi-first so DB only stores pushed state):

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getActiveOrganization } from "@/lib/auth/organization";
import { parseAssistantForm } from "@/lib/agent/assistant-form";
import { createClient } from "@/lib/supabase/server";
import { syncAssistantToVapi } from "@/lib/vapi/assistant-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateAssistant(formData: FormData): Promise<ActionResult> {
  const parsed = parseAssistantForm(formData);
  if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "invalid" };

  const org = await getActiveOrganization();
  if (!org) return { ok: false, error: "no_org" };
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("organization_members").select("role").eq("organization_id", org.id).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) return { ok: false, error: "not_admin" };

  const { data: row } = await supabase
    .from("assistants").select("id, vapi_assistant_id").eq("organization_id", org.id).limit(1).maybeSingle();
  if (!row?.vapi_assistant_id) return { ok: false, error: "no_assistant" };

  try {
    await syncAssistantToVapi(row.vapi_assistant_id, parsed.values);
  } catch (e) {
    console.error("Vapi sync failed:", e);
    return { ok: false, error: "vapi_sync_failed" };
  }

  const { error } = await supabase.from("assistants").update({
    name: parsed.values.name,
    first_message: parsed.values.firstMessage,
    system_prompt: parsed.values.systemPrompt,
  }).eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/assistant");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck. Commit** `feat(agent): updateAssistant action (admin-gated, Vapi-then-DB)`.

---

### Task 5: UI — AssistantEditor + integrate into /assistant

**Files:** Create `app/(dashboard)/assistant/assistant-editor.tsx`; Modify `app/(dashboard)/assistant/page.tsx`.

- [ ] **Step 1: `assistant-editor.tsx` (`"use client"`)** — form with `name`, `first_message`,
  `system_prompt` (large textarea, `font-mono`), read-only model/voice chips. `useTransition`; on submit
  build FormData, call `updateAssistant`, show success/error (map codes to BG), `router.refresh()` on ok.
  A clear note: **„Запазването праща промпта на живо към Vapi асистента."** Show `seededFromVapi` hint.
- [ ] **Step 2: `page.tsx`** — call `getAssistantEditorData()`; render `<AssistantEditor data={...} />`
  above (or alongside) the existing overview. If `data` is null, show a notice. Keep the overview.
- [ ] **Step 3: `npm run build` + lint.** Commit `feat(agent): assistant editor UI synced to Vapi`.

---

### Task 6: Live verification + deploy
- [ ] Build green, lint clean. Push to `main`; confirm deploy via the health-endpoint SHA.
- [ ] **User live test:** open `/assistant`, change the greeting (small, reversible), save → confirm in the
  Vapi dashboard that the assistant updated and **booking tools/voice are intact**. (I'll re-run
  `apply-prompt.mjs` inspect after to confirm `toolIds` still = 2.)

## Done criteria
- Editing name/greeting/prompt in `/assistant` updates both the DB row and the live Vapi assistant.
- `toolIds` (booking) and voice are preserved after a sync (verified via inspect).
- Non-admins cannot trigger a sync. Blank name/prompt is rejected. Build green, deployed.

## Deferred → Phase 4b
- Business facts (services / business hours / service areas) CRUD + a **prompt composer** that assembles
  the system prompt from structured business data (instead of raw-prompt editing).
- Separate guardrails field; model/voice selection; knowledge base.
