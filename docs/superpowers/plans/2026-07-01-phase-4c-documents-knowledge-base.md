# Phase 4c — Documents → Vapi Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business owner upload documents (price list / FAQ / catalog) in the dashboard and, on Publish, sync them to the assistant's Vapi Knowledge Base (via a Query Tool) so the agent answers callers from them — with prices gated by the presence of a `price_list` document.

**Architecture:** Bytes live in Vapi (`POST /file`); we store metadata in a new `documents` table. One `query` tool per org points at all active file ids; Publish reconciles the tool, adds/removes its id in the assistant's `toolIds`, and recomposes the system prompt (KB instruction + price rule). All pure logic (`buildQueryToolBody`, `renderKnowledgeSection`, `buildSyncedModel` tool-id merge, `parseDocumentForm`) is unit-tested; I/O and UI follow the exact Phase 4b patterns.

**Tech Stack:** Next.js 16 (App Router, Server Actions, RSC), Supabase (RLS), Vapi REST API, TypeScript. Tests are `apps/web/scripts/test-*.mjs` run with `node` (TS transpiled via `typescript` + data-URL import).

**Spec:** `docs/superpowers/specs/2026-07-01-phase-4c-documents-knowledge-base-design.md`

**Verified Vapi facts (do not re-research):**
- Upload: `POST https://api.vapi.ai/file`, `multipart/form-data`, form field `file`. Response `{ id, name (≤40), status, bytes, mimetype, ... }`. Do NOT set `Content-Type` manually — let `fetch` set the multipart boundary.
- Query tool: `POST /tool` `{ type:"query", function:{name}, knowledgeBases:[{ provider:"google", name, description, fileIds:[...] }] }` → returns `{ id }`.
- Update query tool: `PATCH /tool/{id}` with `{ knowledgeBases:[...] }` (supported — verified against the API schema).
- Attach: assistant `model.toolIds` must include the query tool id; the system prompt must name the tool.
- Tool `function.name`: `a-z A-Z 0-9 _ -`, max length 40. We use `business_docs`.

**Conventions to respect:**
- `apps/web/AGENTS.md`: this is a customized Next.js — read `apps/web/node_modules/next/dist/docs/` before writing framework-level code (esp. Server Actions body-size limit + File handling in Task 7/8).
- RLS helpers: `public.is_org_member(organization_id)` (read) and `public.is_org_admin(organization_id)` (manage). Fact tables use "members can read" + "admins can manage".
- Migrations are applied manually via the Supabase Dashboard SQL Editor (no direct Postgres connection). DDL is authored in Task 1, **applied in Task 9** before the live E2E.
- Prices are OFF by default: the composer always emits a price rule; only a `price_list` document flips it to "quote allowed".
- Weekday convention (unchanged): `0 = Неделя`.

---

## File Structure

**Create:**
- `supabase/migrations/005_documents_and_query_tool.sql` — `documents` table + RLS + `assistants.vapi_query_tool_id`.
- `apps/web/src/lib/vapi/knowledge-base-client.ts` — pure `buildQueryToolBody` + Vapi I/O (`uploadVapiFile`, `createQueryTool`, `updateQueryToolFiles`).
- `apps/web/src/lib/agent/document-form.ts` — pure `parseDocumentForm` validator.
- `apps/web/src/app/(dashboard)/assistant/tabs/documents-tab.tsx` — Documents tab UI.
- `apps/web/scripts/test-knowledge-base-client.mjs`, `apps/web/scripts/test-document-form.mjs` — unit tests.
- `apps/web/scripts/verify-migration-005.mjs`, `apps/web/scripts/check-documents-live.mjs` — verification scripts.

**Modify:**
- `apps/web/src/types/database.ts` — `documents` table type + `assistants.vapi_query_tool_id`.
- `apps/web/src/lib/vapi/assistant-client.ts` — `buildSyncedModel`/`syncAssistantToVapi` add/remove tool ids.
- `apps/web/scripts/test-assistant-sync.mjs` — add/remove tool-id cases.
- `apps/web/src/lib/agent/prompt-composer.ts` — `renderKnowledgeSection` + `composeSystemPrompt` `knowledge` param.
- `apps/web/scripts/test-prompt-composer.mjs` — knowledge/price cases.
- `apps/web/src/lib/agent/composer-data.ts` — `DocumentRow` + select documents + knowledge in preview.
- `apps/web/src/app/(dashboard)/assistant/actions.ts` — `uploadDocument`, `deleteDocument`, extended `publishAssistant`.
- `apps/web/src/app/(dashboard)/assistant/agent-builder.tsx` — Documents tab wiring + error labels.
- `apps/web/next.config.*` — Server Action body-size limit (Task 7).

---

## Task 1: Migration 005 + database types

**Files:**
- Create: `supabase/migrations/005_documents_and_query_tool.sql`
- Modify: `apps/web/src/types/database.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/005_documents_and_query_tool.sql`:

```sql
-- Phase 4c: documents (Vapi Knowledge Base metadata) + the org's query-tool id on assistants.
-- Bytes live in Vapi; this table stores only metadata + the Vapi file id.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'general',        -- 'general' | 'price_list'
  vapi_file_id text,
  bytes bigint,
  mimetype text,
  status text not null default 'active',        -- 'active' | 'archived'
  created_at timestamptz not null default now()
);

create index if not exists documents_org_idx on public.documents(organization_id);

alter table public.documents enable row level security;

drop policy if exists "members can read documents" on public.documents;
create policy "members can read documents"
on public.documents for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "admins can manage documents" on public.documents;
create policy "admins can manage documents"
on public.documents for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

alter table public.assistants add column if not exists vapi_query_tool_id text;
```

- [ ] **Step 2: Add the `documents` table type**

In `apps/web/src/types/database.ts`, add a new entry inside `Tables` (place it after the `service_areas` block, before `calls`):

```ts
      documents: PublicTable<
        {
          id: string;
          organization_id: string;
          name: string;
          kind: string;
          vapi_file_id: string | null;
          bytes: number | null;
          mimetype: string | null;
          status: string;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          name: string;
          kind?: string;
          vapi_file_id?: string | null;
          bytes?: number | null;
          mimetype?: string | null;
          status?: string;
          created_at?: string;
        }
      >;
```

- [ ] **Step 3: Add `vapi_query_tool_id` to the `assistants` type**

In the same file, in the `assistants` `PublicTable`, add `vapi_query_tool_id: string | null;` to the Row (after `guardrails: string | null;`) and `vapi_query_tool_id?: string | null;` to the Insert (after `guardrails?: string | null;`).

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/005_documents_and_query_tool.sql apps/web/src/types/database.ts
git commit -m "feat(phase-4c): migration 005 (documents + query tool id) + db types"
```

> Note: The migration is **applied** in Task 9 via the Supabase Dashboard SQL Editor. Unit tests (Tasks 2–5) and type-checks do not require the table to exist.

---

## Task 2: Vapi Knowledge Base client (`buildQueryToolBody` TDD + I/O)

**Files:**
- Create: `apps/web/src/lib/vapi/knowledge-base-client.ts`
- Test: `apps/web/scripts/test-knowledge-base-client.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-knowledge-base-client.mjs`:

```js
// Unit tests for the pure Vapi knowledge-base helper. Run (from apps/web): node ./scripts/test-knowledge-base-client.mjs
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
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const { buildQueryToolBody, KB_TOOL_NAME } = await loadModule(["src", "lib", "vapi", "knowledge-base-client.ts"]);

const body = buildQueryToolBody(["f1", "f2"], "Демо ЕООД");
assert.equal(body.type, "query", "type query");
assert.equal(body.function.name, "business_docs", "stable tool name");
assert.ok(KB_TOOL_NAME === "business_docs" && /^[a-zA-Z0-9_-]{1,40}$/.test(KB_TOOL_NAME), "tool name valid + <=40 chars");
assert.equal(body.knowledgeBases.length, 1, "single knowledge base");
assert.equal(body.knowledgeBases[0].provider, "google", "provider google");
assert.deepEqual(body.knowledgeBases[0].fileIds, ["f1", "f2"], "fileIds passed through");
assert.ok(body.knowledgeBases[0].description.includes("Демо ЕООД"), "org name in description");

const body2 = buildQueryToolBody([], null);
assert.deepEqual(body2.knowledgeBases[0].fileIds, [], "empty fileIds ok, no org name");

const srcIds = ["x"];
const b3 = buildQueryToolBody(srcIds);
b3.knowledgeBases[0].fileIds.push("y");
assert.deepEqual(srcIds, ["x"], "input array not mutated");

console.log("knowledge-base-client checks passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node ./scripts/test-knowledge-base-client.mjs`
Expected: FAIL with "Missing module: ...knowledge-base-client.ts".

- [ ] **Step 3: Implement the client**

Create `apps/web/src/lib/vapi/knowledge-base-client.ts`:

```ts
// Vapi Knowledge Base sync (query tool). Server-only (reads VAPI_PRIVATE_KEY / VAPI_API_KEY).
// buildQueryToolBody is pure + unit-tested. Files are uploaded to Vapi (POST /file); a single "query" tool
// per org points at all active file ids; the assistant references the tool by name in its system prompt.

const VAPI_BASE = "https://api.vapi.ai";
export const KB_TOOL_NAME = "business_docs";

function vapiKey(): string {
  const key = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY;
  if (!key) throw new Error("VAPI key missing");
  return key;
}

export type QueryToolBody = {
  type: "query";
  function: { name: string };
  knowledgeBases: { provider: "google"; name: string; description: string; fileIds: string[] }[];
};

export function buildQueryToolBody(fileIds: string[], orgName?: string | null): QueryToolBody {
  const who = orgName && orgName.trim() ? ` на ${orgName.trim()}` : "";
  return {
    type: "query",
    function: { name: KB_TOOL_NAME },
    knowledgeBases: [
      {
        provider: "google",
        name: "business-kb",
        description: `Документи${who}: услуги, условия, цени и често задавани въпроси.`,
        fileIds: [...fileIds],
      },
    ],
  };
}

export async function uploadVapiFile(
  file: File,
  name: string
): Promise<{ id: string; bytes: number | null; mimetype: string | null }> {
  const form = new FormData();
  form.append("file", file, name);
  const res = await fetch(`${VAPI_BASE}/file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${vapiKey()}` }, // no Content-Type: fetch sets the multipart boundary
    body: form,
  });
  const t = await res.text();
  if (res.status >= 300) throw new Error(`Vapi POST /file -> ${res.status}: ${t.slice(0, 300)}`);
  const data = JSON.parse(t) as { id: string; bytes?: number; mimetype?: string };
  return { id: data.id, bytes: data.bytes ?? null, mimetype: data.mimetype ?? null };
}

async function vapiJson<T>(method: string, pathname: string, body: unknown): Promise<T> {
  const res = await fetch(`${VAPI_BASE}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${vapiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await res.text();
  if (res.status >= 300) throw new Error(`Vapi ${method} ${pathname} -> ${res.status}: ${t.slice(0, 300)}`);
  try {
    return JSON.parse(t) as T;
  } catch {
    return {} as T;
  }
}

export async function createQueryTool(fileIds: string[], orgName?: string | null): Promise<{ id: string }> {
  const data = await vapiJson<{ id: string }>("POST", "/tool", buildQueryToolBody(fileIds, orgName));
  return { id: data.id };
}

export async function updateQueryToolFiles(toolId: string, fileIds: string[], orgName?: string | null): Promise<void> {
  // PATCH /tool/{id} supports updating a query tool's knowledgeBases (verified against the API schema).
  await vapiJson("PATCH", `/tool/${encodeURIComponent(toolId)}`, {
    knowledgeBases: buildQueryToolBody(fileIds, orgName).knowledgeBases,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node ./scripts/test-knowledge-base-client.mjs`
Expected: PASS — prints `knowledge-base-client checks passed`.

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/vapi/knowledge-base-client.ts apps/web/scripts/test-knowledge-base-client.mjs
git commit -m "feat(phase-4c): Vapi knowledge-base client (query tool body + file upload)"
```

---

## Task 3: `buildSyncedModel` add/remove tool ids (TDD)

**Files:**
- Modify: `apps/web/src/lib/vapi/assistant-client.ts`
- Test: `apps/web/scripts/test-assistant-sync.mjs`

- [ ] **Step 1: Add failing tests**

In `apps/web/scripts/test-assistant-sync.mjs`, insert these assertions immediately before the final `console.log("assistant-sync checks passed");` line:

```js
// --- toolIds add/remove (Phase 4c query-tool management) ---
const withAdd = buildSyncedModel({ provider: "p", model: "m", toolIds: ["a", "b"], messages: [] }, "S", { addToolIds: ["q"] });
assert.deepEqual(withAdd.toolIds, ["a", "b", "q"], "addToolIds appends the query tool id");
const dedup = buildSyncedModel({ provider: "p", model: "m", toolIds: ["a", "q"], messages: [] }, "S", { addToolIds: ["q"] });
assert.deepEqual(dedup.toolIds, ["a", "q"], "addToolIds dedupes");
const removed = buildSyncedModel({ provider: "p", model: "m", toolIds: ["a", "q"], messages: [] }, "S", { removeToolIds: ["q"] });
assert.deepEqual(removed.toolIds, ["a"], "removeToolIds drops the query tool id, keeps booking tools");
const removeLast = buildSyncedModel({ provider: "p", model: "m", toolIds: ["q"], messages: [] }, "S", { removeToolIds: ["q"] });
assert.ok(!("toolIds" in removeLast), "toolIds omitted when the last id is removed");
const removeWins = buildSyncedModel({ provider: "p", model: "m", toolIds: ["a"], messages: [] }, "S", { addToolIds: ["q"], removeToolIds: ["q"] });
assert.deepEqual(removeWins.toolIds, ["a"], "removeToolIds takes precedence over addToolIds");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node ./scripts/test-assistant-sync.mjs`
Expected: FAIL — the current `buildSyncedModel` ignores the 3rd arg, so `withAdd.toolIds` is `["a","b"]` (no `q`) and the first new assertion throws.

- [ ] **Step 3: Update `buildSyncedModel`**

In `apps/web/src/lib/vapi/assistant-client.ts`, replace the `buildSyncedModel` function (lines 21–40) with:

```ts
export function buildSyncedModel(
  currentModel: VapiModel,
  systemPrompt: string,
  opts: { addToolIds?: string[]; removeToolIds?: string[] } = {}
) {
  const messages: VapiMessage[] = Array.isArray(currentModel?.messages)
    ? currentModel.messages.map((m) => ({ ...m }))
    : [];
  const i = messages.findIndex((m) => m.role === "system");
  if (i >= 0) messages[i] = { ...messages[i], content: systemPrompt };
  else messages.unshift({ role: "system", content: systemPrompt });

  const m = currentModel ?? {};
  const currentToolIds = Array.isArray(m.toolIds) ? (m.toolIds as string[]) : [];
  const remove = new Set(opts.removeToolIds ?? []);
  const merged: string[] = [];
  for (const id of [...currentToolIds, ...(opts.addToolIds ?? [])]) {
    if (typeof id === "string" && !remove.has(id) && !merged.includes(id)) merged.push(id);
  }

  return {
    provider: m.provider,
    model: m.model,
    messages,
    ...(merged.length ? { toolIds: merged } : {}),
    ...(Array.isArray(m.tools) && m.tools.length ? { tools: m.tools } : {}),
    ...(m.temperature != null ? { temperature: m.temperature } : {}),
    ...(m.maxTokens != null ? { maxTokens: m.maxTokens } : {}),
    ...(m.knowledgeBaseId ? { knowledgeBaseId: m.knowledgeBaseId } : {}),
  };
}
```

- [ ] **Step 4: Thread the options through `syncAssistantToVapi`**

In the same file, replace the `syncAssistantToVapi` function (lines 69–80) with:

```ts
export async function syncAssistantToVapi(
  id: string,
  input: {
    name: string;
    firstMessage: string;
    systemPrompt: string;
    addToolIds?: string[];
    removeToolIds?: string[];
  }
): Promise<void> {
  const current = await getVapiAssistant(id);
  const model = buildSyncedModel(current?.model ?? {}, input.systemPrompt, {
    addToolIds: input.addToolIds,
    removeToolIds: input.removeToolIds,
  });
  await vapiFetch("PATCH", `/assistant/${encodeURIComponent(id)}`, {
    name: input.name,
    firstMessage: input.firstMessage,
    model,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && node ./scripts/test-assistant-sync.mjs`
Expected: PASS — prints `assistant-sync checks passed` (all old assertions still pass — the no-opts path is unchanged).

- [ ] **Step 6: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/vapi/assistant-client.ts apps/web/scripts/test-assistant-sync.mjs
git commit -m "feat(phase-4c): buildSyncedModel add/remove toolIds for query-tool management"
```

---

## Task 4: Composer knowledge + price section (TDD)

**Files:**
- Modify: `apps/web/src/lib/agent/prompt-composer.ts`
- Test: `apps/web/scripts/test-prompt-composer.mjs`

- [ ] **Step 1: Add failing tests**

In `apps/web/scripts/test-prompt-composer.mjs`:

(a) Change the destructure on line 20 to include the new export:

```js
const { renderBusinessContext, composeSystemPrompt, renderKnowledgeSection } = await loadModule(["src", "lib", "agent", "prompt-composer.ts"]);
```

(b) Insert these assertions immediately before the final `console.log("prompt-composer checks passed");` line:

```js
// --- renderKnowledgeSection: prices OFF by default; a price_list document unlocks quoting ---
const k0 = renderKnowledgeSection({ documents: [] });
assert.ok(k0.includes("## Цени"), "no docs -> price header");
assert.ok(!k0.includes("business_docs"), "no tool instruction without docs");
assert.ok(/оферта|консултаци/.test(k0), "no docs -> deflect prices");

const k1 = renderKnowledgeSection({ documents: [{ kind: "general", status: "active" }] });
assert.ok(k1.includes("## Документи и цени"), "docs -> docs header");
assert.ok(k1.includes("business_docs"), "docs -> tool instruction present");
assert.ok(/оферта|консултаци/.test(k1), "general doc only -> still deflect prices");

const k2 = renderKnowledgeSection({ documents: [{ kind: "price_list", status: "active" }, { kind: "general", status: "active" }] });
assert.ok(k2.includes("business_docs"), "price list -> tool instruction");
assert.ok(/цена/i.test(k2) && !/Не казвай точни цени/.test(k2), "price list -> quoting allowed, no deflection");

const k3 = renderKnowledgeSection({ documents: [{ kind: "price_list", status: "archived" }] });
assert.ok(/Не казвай точни цени/.test(k3), "archived price list -> still deflect");
assert.ok(!k3.includes("business_docs"), "archived doc -> no tool instruction");

// composeSystemPrompt places knowledge between context and guardrails
const composedK = composeSystemPrompt({ base: "BASE", businessContext: "## Бизнес контекст\nУслуги: A", knowledge: "## Цени\nX", guardrails: "G" });
assert.ok(composedK.indexOf("## Цени") > composedK.indexOf("## Бизнес контекст"), "knowledge after context");
assert.ok(composedK.indexOf("Твърди правила") > composedK.indexOf("## Цени"), "guardrails after knowledge");
assert.equal(composeSystemPrompt({ base: "ONLY", businessContext: "", guardrails: "" }), "ONLY", "no knowledge arg -> base only (4b behaviour intact)");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node ./scripts/test-prompt-composer.mjs`
Expected: FAIL — `renderKnowledgeSection is not a function`.

- [ ] **Step 3: Implement `renderKnowledgeSection` + extend `composeSystemPrompt`**

In `apps/web/src/lib/agent/prompt-composer.ts`:

(a) Add after the `AreaFact` type (after line 7):

```ts
type DocFact = { kind: string; status: string };
const KB_TOOL_NAME = "business_docs";
```

(b) Add this function after `renderBusinessContext` (after line 53):

```ts
// Documents + price rule. Prices are OFF by default (always emit a rule); only an active `price_list`
// document flips it to "quote allowed". When documents exist, name the query tool so the agent uses it.
export function renderKnowledgeSection(input: { documents: DocFact[] }): string {
  const docs = (input.documents ?? []).filter((d) => d.status === "active");
  const hasDocs = docs.length > 0;
  const hasPriceList = docs.some((d) => d.kind === "price_list");

  const lines: string[] = [];
  if (hasDocs) {
    lines.push(
      `Имаш инструмент \`${KB_TOOL_NAME}\` с документите на бизнеса. Когато клиентът пита за услуга, ` +
        `условия, детайли или друга информация от тях, извикай инструмента и отговори точно според документите.`
    );
  }
  if (hasPriceList) {
    lines.push(`Ако клиентът пита за цена, използвай \`${KB_TOOL_NAME}\`, за да намериш цената в ценовата листа, и я кажи.`);
  } else {
    lines.push(`Не казвай точни цени по телефона. Кажи, че колегите ще изготвят оферта или ще уточните цената на консултацията/срещата.`);
  }
  const header = hasDocs ? "## Документи и цени" : "## Цени";
  return `${header}\n${lines.join("\n")}`;
}
```

(c) Replace `composeSystemPrompt` (lines 55–62) with:

```ts
export function composeSystemPrompt(input: {
  base: string;
  businessContext: string;
  knowledge?: string | null;
  guardrails?: string | null;
}): string {
  const base = (input.base ?? "").trim() || DEFAULT_BASE_PROMPT;
  const sections = [base];
  if (input.businessContext && input.businessContext.trim()) sections.push(input.businessContext.trim());
  const knowledge = (input.knowledge ?? "").trim();
  if (knowledge) sections.push(knowledge);
  const guard = (input.guardrails ?? "").trim();
  if (guard) sections.push(`## Твърди правила (спазвай ги с най-висок приоритет)\n${guard}`);
  return sections.join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node ./scripts/test-prompt-composer.mjs`
Expected: PASS — prints `prompt-composer checks passed`.

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/agent/prompt-composer.ts apps/web/scripts/test-prompt-composer.mjs
git commit -m "feat(phase-4c): composer knowledge section + default-off price rule"
```

---

## Task 5: Document form parser (TDD)

**Files:**
- Create: `apps/web/src/lib/agent/document-form.ts`
- Test: `apps/web/scripts/test-document-form.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-document-form.mjs`:

```js
// Unit tests for the pure document upload validator. Run (from apps/web): node ./scripts/test-document-form.mjs
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
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const { parseDocumentForm, MAX_DOCUMENT_BYTES } = await loadModule(["src", "lib", "agent", "document-form.ts"]);
const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });
const file = (over) => ({ size: 1000, name: "price.pdf", type: "application/pdf", ...over });

const ok = parseDocumentForm(form({ file: file(), kind: "price_list", name: "  Ценова листа  " }));
assert.equal(ok.error, undefined, "valid");
assert.equal(ok.values.name, "Ценова листа", "name trimmed");
assert.equal(ok.values.kind, "price_list", "kind kept");
assert.equal(ok.file.name, "price.pdf", "file passed through");

assert.equal(parseDocumentForm(form({})).error, "document_file_required", "file required");
assert.equal(parseDocumentForm(form({ file: file({ size: 0 }) })).error, "document_file_required", "empty file rejected");
assert.equal(parseDocumentForm(form({ file: file({ size: MAX_DOCUMENT_BYTES + 1 }) })).error, "document_too_large", "too large");
assert.equal(parseDocumentForm(form({ file: file({ name: "virus.exe" }) })).error, "document_type_unsupported", "bad type");
assert.equal(parseDocumentForm(form({ file: file({ name: "a".repeat(45) + ".pdf" }) })).error, "document_name_too_long", "long filename as name");

const dflt = parseDocumentForm(form({ file: file({ name: "faq.txt" }) }));
assert.equal(dflt.values.name, "faq.txt", "name defaults to filename");
assert.equal(dflt.values.kind, "general", "kind defaults to general");
assert.equal(parseDocumentForm(form({ file: file(), kind: "bogus" })).values.kind, "general", "invalid kind -> general");

console.log("document-form checks passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node ./scripts/test-document-form.mjs`
Expected: FAIL with "Missing module: ...document-form.ts".

- [ ] **Step 3: Implement the parser**

Create `apps/web/src/lib/agent/document-form.ts`:

```ts
// Pure validator for a document upload. Depends only on {size, name, type} of the file, so it is unit-testable
// without a real File. The server action passes the real File (which satisfies FileLike) and uploads it to Vapi.
type FormLike = { get(name: string): unknown };
type FileLike = { size: number; name: string; type?: string };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export const DOCUMENT_KINDS = ["general", "price_list"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const ALLOWED_DOC_EXTENSIONS = ["pdf", "docx", "doc", "txt", "csv", "md"] as const;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 MB
const NAME_MAX = 40; // Vapi file-name limit

const parseKind = (v: unknown): DocumentKind =>
  typeof v === "string" && (DOCUMENT_KINDS as readonly string[]).includes(v) ? (v as DocumentKind) : "general";

const extOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
};

export type DocumentValues = { name: string; kind: DocumentKind };

export function parseDocumentForm(
  form: FormLike
): { error?: string; values: DocumentValues | null; file: FileLike | null } {
  const file = form.get("file") as FileLike | null;
  if (!file || typeof file.size !== "number" || typeof file.name !== "string" || file.size === 0)
    return { error: "document_file_required", values: null, file: null };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "document_too_large", values: null, file: null };
  if (!(ALLOWED_DOC_EXTENSIONS as readonly string[]).includes(extOf(file.name)))
    return { error: "document_type_unsupported", values: null, file: null };

  const name = text(form.get("name")) ?? file.name;
  if (name.length > NAME_MAX) return { error: "document_name_too_long", values: null, file: null };

  return { error: undefined, values: { name, kind: parseKind(form.get("kind")) }, file };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node ./scripts/test-document-form.mjs`
Expected: PASS — prints `document-form checks passed`.

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/agent/document-form.ts apps/web/scripts/test-document-form.mjs
git commit -m "feat(phase-4c): document upload form parser (type/size/name validation)"
```

---

## Task 6: Composer-data reader — documents + knowledge preview

**Files:**
- Modify: `apps/web/src/lib/agent/composer-data.ts`

- [ ] **Step 1: Add the `DocumentRow` type**

In `apps/web/src/lib/agent/composer-data.ts`, add after the `AreaRow` type (after line 20):

```ts
export type DocumentRow = { id: string; name: string; kind: string; bytes: number | null; mimetype: string | null; status: string };
```

- [ ] **Step 2: Import `renderKnowledgeSection`**

Change the import block (lines 3–7) to:

```ts
import {
  composeSystemPrompt,
  renderBusinessContext,
  renderKnowledgeSection,
  DEFAULT_BASE_PROMPT,
} from "@/lib/agent/prompt-composer";
```

- [ ] **Step 3: Add `documents` to the returned type**

Add `documents: DocumentRow[];` to the `AgentComposerData` type (after the `areas: AreaRow[];` line).

- [ ] **Step 4: Fetch documents and compose with knowledge**

Replace the `Promise.all` block (lines 48–52) with a version that also loads active documents:

```ts
  const [{ data: services }, { data: hours }, { data: areas }, { data: documents }] = await Promise.all([
    supabase.from("services").select("id, name, description, duration_minutes, price_min, price_max, currency, status").eq("organization_id", org.id).order("name"),
    supabase.from("business_hours").select("weekday, opens_at, closes_at, is_closed").eq("organization_id", org.id).order("weekday"),
    supabase.from("service_areas").select("id, city, region, status").eq("organization_id", org.id).order("city"),
    supabase.from("documents").select("id, name, kind, bytes, mimetype, status").eq("organization_id", org.id).eq("status", "active").order("created_at"),
  ]);
```

Then, after the `businessContext` assignment (after line 61), add:

```ts
  const knowledge = renderKnowledgeSection({ documents: (documents ?? []).map((d) => ({ kind: d.kind, status: d.status })) });
```

And in the returned object, (a) change the `composedPreview` line to include knowledge, and (b) add `documents`:

```ts
    documents: documents ?? [],
    composedPreview: composeSystemPrompt({ base: basePrompt, businessContext, knowledge, guardrails }),
```

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/agent/composer-data.ts
git commit -m "feat(phase-4c): composer-data loads documents + knowledge in preview"
```

---

## Task 7: Server actions — upload, delete, publish reconcile

**Files:**
- Modify: `apps/web/src/app/(dashboard)/assistant/actions.ts`
- Modify: `apps/web/next.config.*` (Server Action body-size limit)

- [ ] **Step 1: Raise the Server Action body-size limit**

Server Actions cap request bodies (default ~1 MB), which would reject a 5 MB upload. Read `apps/web/node_modules/next/dist/docs/` for the exact config key in this customized Next, then set it in `apps/web/next.config.*` (file is `next.config.ts` or `next.config.mjs`). The standard shape:

```ts
// inside the Next config object
experimental: {
  serverActions: {
    bodySizeLimit: "6mb",
  },
},
```

If the config already has an `experimental` block, merge into it (do not replace it). Verify the exact key against the local Next docs before committing.

- [ ] **Step 2: Add imports**

In `apps/web/src/app/(dashboard)/assistant/actions.ts`, update the imports at the top:

(a) Change the prompt-composer import (line 10) to add `renderKnowledgeSection`:

```ts
import { composeSystemPrompt, renderBusinessContext, renderKnowledgeSection, DEFAULT_BASE_PROMPT } from "@/lib/agent/prompt-composer";
```

(b) Add these two imports after the existing `parseServiceAreaForm` import (after line 9):

```ts
import { parseDocumentForm } from "@/lib/agent/document-form";
import { uploadVapiFile, createQueryTool, updateQueryToolFiles } from "@/lib/vapi/knowledge-base-client";
```

- [ ] **Step 3: Add `uploadDocument` and `deleteDocument`**

Insert after the `deleteServiceArea` function (after line 111), before the `publishAssistant` block:

```ts
// ---- Documents (Vapi Knowledge Base) ----
export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const parsed = parseDocumentForm(formData);
  if (parsed.error || !parsed.values || !parsed.file) return { ok: false, error: parsed.error ?? "invalid" };

  let uploaded;
  try {
    uploaded = await uploadVapiFile(parsed.file as File, parsed.values.name);
  } catch (error) {
    console.error("Vapi file upload failed:", error);
    return { ok: false, error: "vapi_upload_failed" };
  }

  const { error } = await gate.supabase.from("documents").insert({
    organization_id: gate.org.id,
    name: parsed.values.name,
    kind: parsed.values.kind,
    vapi_file_id: uploaded.id,
    bytes: uploaded.bytes,
    mimetype: uploaded.mimetype,
    status: "active",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  // Removes the DB row (double-gated on id + org). The live query tool is corrected on the next Publish.
  const { error } = await gate.supabase.from("documents").delete().eq("id", id).eq("organization_id", gate.org.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}
```

- [ ] **Step 4: Extend `publishAssistant` to reconcile the knowledge base**

Replace the entire `publishAssistant` function (lines 114–158) with:

```ts
// ---- Publish: compose from current facts + documents, reconcile the query tool, push to Vapi (first), then persist ----
export async function publishAssistant(): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { org, supabase } = gate;

  const { data: row } = await supabase
    .from("assistants")
    .select("id, vapi_assistant_id, name, first_message, base_prompt, guardrails, vapi_query_tool_id")
    .eq("organization_id", org.id)
    .limit(1)
    .maybeSingle();
  if (!row?.vapi_assistant_id) return { ok: false, error: "no_assistant" };

  const [{ data: services }, { data: hours }, { data: areas }, { data: documents }] = await Promise.all([
    supabase.from("services").select("name, description, status").eq("organization_id", org.id),
    supabase.from("business_hours").select("weekday, opens_at, closes_at, is_closed").eq("organization_id", org.id),
    supabase.from("service_areas").select("city, region, status").eq("organization_id", org.id),
    supabase.from("documents").select("vapi_file_id, kind, status").eq("organization_id", org.id).eq("status", "active"),
  ]);

  const base = row.base_prompt ?? DEFAULT_BASE_PROMPT;
  const guardrails = row.guardrails ?? "";
  const businessContext = renderBusinessContext({
    orgName: org.name,
    services: services ?? [],
    hours: hours ?? [],
    areas: areas ?? [],
  });
  const knowledge = renderKnowledgeSection({
    documents: (documents ?? []).map((d) => ({ kind: d.kind, status: d.status })),
  });
  const composed = composeSystemPrompt({ base, businessContext, knowledge, guardrails });

  const desiredFileIds = (documents ?? []).map((d) => d.vapi_file_id).filter((x): x is string => Boolean(x));
  let queryToolId = row.vapi_query_tool_id ?? null;

  try {
    if (desiredFileIds.length > 0) {
      if (queryToolId) await updateQueryToolFiles(queryToolId, desiredFileIds, org.name);
      else queryToolId = (await createQueryTool(desiredFileIds, org.name)).id;
      await syncAssistantToVapi(row.vapi_assistant_id, {
        name: row.name,
        firstMessage: row.first_message ?? "",
        systemPrompt: composed,
        addToolIds: [queryToolId],
      });
    } else {
      await syncAssistantToVapi(row.vapi_assistant_id, {
        name: row.name,
        firstMessage: row.first_message ?? "",
        systemPrompt: composed,
        ...(queryToolId ? { removeToolIds: [queryToolId] } : {}),
      });
      queryToolId = null; // detached; a fresh tool is created when documents return
    }
  } catch (error) {
    console.error("Vapi publish failed:", error);
    return { ok: false, error: "vapi_sync_failed" };
  }

  const { error } = await supabase
    .from("assistants")
    .update({ system_prompt: composed, vapi_query_tool_id: queryToolId })
    .eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assistant");
  return { ok: true };
}
```

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/assistant/actions.ts" apps/web/next.config.*
git commit -m "feat(phase-4c): document upload/delete actions + publish reconciles the query tool"
```

---

## Task 8: Documents tab UI + wiring

**Files:**
- Create: `apps/web/src/app/(dashboard)/assistant/tabs/documents-tab.tsx`
- Modify: `apps/web/src/app/(dashboard)/assistant/agent-builder.tsx`

- [ ] **Step 1: Create the Documents tab**

Create `apps/web/src/app/(dashboard)/assistant/tabs/documents-tab.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { DocumentRow } from "@/lib/agent/composer-data";

import { uploadDocument, deleteDocument } from "../actions";
import { errorLabel, inputClass } from "../agent-builder";

const KIND_LABEL: Record<string, string> = { price_list: "Ценова листа", general: "Информация" };
const fmtSize = (b: number | null) =>
  b == null ? "" : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export function DocumentsTab({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formEl = event.currentTarget;
    setError(null);
    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else {
        formEl.reset();
        router.refresh();
      }
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteDocument(id);
      if (!result.ok) setError(errorLabel(result.error));
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--ink-muted)]">
        Качи документи (ЧЗВ, каталог, правила). Ако качиш <strong>ценова листа</strong>, асистентът ще може да казва цени от нея.
        Промените влизат в сила след „Публикувай на живо".
      </p>
      <div className="divide-y divide-[var(--line)]">
        {documents.length === 0 ? <p className="py-3 text-sm text-[var(--ink-soft)]">Няма качени документи.</p> : null}
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div>
              <span className="font-medium">{d.name}</span>
              <span className="ml-2 rounded bg-[var(--surface-soft)] px-1.5 py-0.5 text-xs text-[var(--ink-muted)]">
                {KIND_LABEL[d.kind] ?? d.kind}
              </span>
              <span className="ml-2 font-mono text-xs text-[var(--ink-muted)]">{fmtSize(d.bytes)}</span>
            </div>
            <button onClick={() => remove(d.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-60">
              Изтрий
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="grid gap-2 border-t border-[var(--line)] pt-3">
        <input name="name" placeholder="Име (по избор, до 40 знака)" maxLength={40} className={inputClass} />
        <select name="kind" defaultValue="general" className={inputClass}>
          <option value="general">Информация (ЧЗВ, каталог, правила)</option>
          <option value="price_list">Ценова листа (отключва цени)</option>
        </select>
        <input name="file" type="file" accept=".pdf,.docx,.doc,.txt,.csv,.md" required className="text-sm" />
        <div className="flex items-center justify-between gap-3">
          {error ? <span className="text-sm text-red-600">{error}</span> : <span />}
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60"
          >
            {isPending ? "…" : "Качи документ"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add error labels**

In `apps/web/src/app/(dashboard)/assistant/agent-builder.tsx`, add these cases to `errorLabel` (before the `default:` case, after line 30):

```ts
    case "document_file_required": return "Избери файл за качване.";
    case "document_too_large": return "Файлът е твърде голям (макс. 5MB).";
    case "document_type_unsupported": return "Неподдържан формат. Приемат се PDF, DOCX, DOC, TXT, CSV, MD.";
    case "document_name_too_long": return "Името е твърде дълго (макс. 40 знака).";
    case "vapi_upload_failed": return "Неуспешно качване към Vapi. Опитай пак.";
```

- [ ] **Step 3: Import and register the tab**

In the same file:

(a) Add the import after the `AreasTab` import (after line 10):

```ts
import { DocumentsTab } from "./tabs/documents-tab";
```

(b) Add a tab entry to the `TABS` array — insert it after the `areas` entry and before `publish`:

```ts
  { key: "documents", label: "Документи" },
```

(c) Render it — add after the `areas` render line (after line 65):

```tsx
      {tab === "documents" ? <DocumentsTab documents={data.documents} /> : null}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Lint the two touched files**

Run: `cd apps/web && npx eslint "src/app/(dashboard)/assistant/tabs/documents-tab.tsx" "src/app/(dashboard)/assistant/agent-builder.tsx"`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/assistant/tabs/documents-tab.tsx" "apps/web/src/app/(dashboard)/assistant/agent-builder.tsx"
git commit -m "feat(phase-4c): Documents tab UI + wiring in the Agent Builder"
```

---

## Task 9: Apply migration, E2E verify, deploy

**Files:**
- Create: `apps/web/scripts/verify-migration-005.mjs`
- Create: `apps/web/scripts/check-documents-live.mjs`

- [ ] **Step 1: Write the migration-verify script**

Create `apps/web/scripts/verify-migration-005.mjs`:

```js
// Read-only: confirms migration 005 landed — documents table + assistants.vapi_query_tool_id exist.
// Run (from project root): node apps/web/scripts/verify-migration-005.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const root = process.cwd();
const env = { ...loadEnv(path.join(root, "apps", "web", ".env.local")), ...loadEnv(path.join(root, ".env.local")) };
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const docs = await sb.from("documents").select("id").limit(1);
const asst = await sb.from("assistants").select("vapi_query_tool_id").limit(1);
if (docs.error) console.log(`documents table MISSING or error: ${docs.error.message}`);
else console.log("documents table OK");
if (asst.error) console.log(`assistants.vapi_query_tool_id MISSING or error: ${asst.error.message}`);
else console.log("assistants.vapi_query_tool_id OK");
setTimeout(() => process.exit(docs.error || asst.error ? 1 : 0), 150);
```

- [ ] **Step 2: Apply the migration**

Ask the user to paste `supabase/migrations/005_documents_and_query_tool.sql` into the Supabase Dashboard SQL Editor and run it (no direct Postgres connection is available to the agent). Then verify:

Run: `node apps/web/scripts/verify-migration-005.mjs`
Expected: prints `documents table OK` and `assistants.vapi_query_tool_id OK`.

- [ ] **Step 3: Write the live E2E check script**

Create `apps/web/scripts/check-documents-live.mjs`:

```js
// Read-only E2E check for Phase 4c: DB documents + whether the LIVE Vapi assistant has the query tool wired.
// Run (from project root): node apps/web/scripts/check-documents-live.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const root = process.cwd();
const env = { ...loadEnv(path.join(root, "apps", "web", ".env.local")), ...loadEnv(path.join(root, ".env.local")) };
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const vapiKey = env.VAPI_PRIVATE_KEY || env.VAPI_API_KEY;

const { data: assistant } = await sb
  .from("assistants")
  .select("organization_id, vapi_assistant_id, vapi_query_tool_id, system_prompt")
  .limit(1)
  .maybeSingle();
const org = assistant.organization_id;
const { data: docs } = await sb.from("documents").select("name, kind, status, vapi_file_id").eq("organization_id", org);

console.log("=== DB (documents) ===");
for (const d of docs ?? []) console.log(`  - "${d.name}" [${d.kind}/${d.status}] file=${d.vapi_file_id ?? "-"}`);
console.log(`assistants.vapi_query_tool_id: ${assistant.vapi_query_tool_id ?? "(none)"}`);

console.log("\n=== LIVE Vapi assistant ===");
const res = await fetch(`https://api.vapi.ai/assistant/${assistant.vapi_assistant_id}`, { headers: { Authorization: `Bearer ${vapiKey}` } });
const a = await res.json();
const toolIds = a.model?.toolIds ?? [];
const sys = (a.model?.messages ?? []).find((m) => m.role === "system");
const live = sys?.content ?? "";
console.log(`toolIds (${toolIds.length}): ${toolIds.join(", ")}`);
console.log(`query tool attached: ${assistant.vapi_query_tool_id ? toolIds.includes(assistant.vapi_query_tool_id) : "n/a (no tool id stored)"}`);
console.log(`prompt names business_docs: ${live.includes("business_docs")}`);
console.log(`prompt has price rule: ${/Цени|цена/i.test(live)}`);
setTimeout(() => process.exit(0), 150);
```

- [ ] **Step 4: Run the full local test suite**

Run: `cd apps/web && node ./scripts/test-knowledge-base-client.mjs && node ./scripts/test-assistant-sync.mjs && node ./scripts/test-prompt-composer.mjs && node ./scripts/test-document-form.mjs`
Expected: four `... checks passed` lines.

- [ ] **Step 5: Commit the scripts, push, and verify deploy**

```bash
git add apps/web/scripts/verify-migration-005.mjs apps/web/scripts/check-documents-live.mjs
git commit -m "chore(phase-4c): migration + live-KB verification scripts"
git push origin main
```

Then confirm the deploy by polling the health endpoint until `commit` matches the pushed full SHA:
`GET https://<prod-url>/api/vapi/end-of-call` → `{ commit, vapiConfigured, supabaseConfigured, authMode }` (use the prod HTTP fetch trick from Phase 4b).

- [ ] **Step 6: Manual live E2E (owner-authorized)**

In the deployed app: upload a small price-list document (kind = Ценова листа), click **Публикувай на живо**, then run:

Run: `node apps/web/scripts/check-documents-live.mjs`
Expected: the stored `vapi_query_tool_id` is present in the live `toolIds`, `prompt names business_docs: true`, `prompt has price rule: true`. Then delete the document, Publish again, and confirm the tool id drops from `toolIds` and the prompt reverts to the deflection rule.

> **Production Vapi mutations require explicit per-action user authorization** — the Publish button and the price-list upload are performed by the owner, not the agent.

---

## Notes for the executor

- **Known limitation (accepted for base):** `kind` controls the *prompt instruction*, not what is physically in the KB. A price-containing catalog marked `general` could still surface a price via the tool. Fine for v1.
- **Orphaned Vapi files:** deleting a document leaves its Vapi file in Vapi storage (unreferenced after the next Publish). Harmless for the base product; automatic cleanup is future work.
- **No `deleteVapiFile`:** intentionally omitted (YAGNI) — deleting the live file before the next Publish reconcile could leave the query tool referencing a missing file.
- Do not touch booking tools, voice, or transcriber — `buildSyncedModel` preserves them; the add/remove options only manage the query tool id.
```
