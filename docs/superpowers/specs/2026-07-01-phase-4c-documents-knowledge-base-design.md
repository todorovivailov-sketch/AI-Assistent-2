# Phase 4c — Documents → Vapi Knowledge Base (Design)

**Date:** 2026-07-01
**Status:** Approved design → ready for implementation plan
**Builds on:** Phase 4b (business facts + compose-around-base prompt composer), `lib/vapi/assistant-client.ts` sync, the tabbed Agent Builder at `/assistant`.

---

## 1. Goal

Let a business owner upload documents (price list, FAQ, catalog, policies) in the dashboard. On **Publish**, those documents are synced to the assistant's Vapi **Knowledge Base** (via a Query Tool) so the agent can answer callers from them. Prices are gated by the *presence of a price-list document*: if one is uploaded the agent may quote prices from it; otherwise the agent deflects to a human offer/consultation.

The customer never touches the Vapi dashboard — the app's Publish button performs the full Vapi API work (as in Phase 4b).

## 2. Background: how Vapi Knowledge Bases work (verified against live docs, 2026-07-01)

Vapi's current mechanism is the **Query Tool**, not the legacy `model.knowledgeBaseId`. Three steps:

1. **Upload a file** — `POST https://api.vapi.ai/file`, `multipart/form-data`, form field name `file`. Response includes `id` (the file id), `name` (≤ 40 chars), `status`, `bytes`, `mimetype`. Supported formats: `.txt .pdf .docx .doc .csv .md .tsv .yaml .json .xml .log`. Recommended < 300 KB/file for fast retrieval. Retrieval provider: **Google (Gemini)**.

2. **Create a query tool** referencing the file ids:
   ```json
   POST https://api.vapi.ai/tool
   {
     "type": "query",
     "function": { "name": "business_docs" },
     "knowledgeBases": [
       {
         "provider": "google",
         "name": "business-kb",
         "description": "Contains this business's services, pricing, and FAQ.",
         "fileIds": ["<file-id-1>", "<file-id-2>"]
       }
     ]
   }
   ```
   Returns a tool object with its own `id`.

3. **Attach the tool to the assistant** by adding its id to `model.toolIds`, and **instruct the assistant in its system prompt to use the tool by name** ("...use the `business_docs` tool to look up..."). The knowledge-base description alone is not enough — the prompt must name the tool.

**Compatibility with our sync:** `buildSyncedModel` already preserves `toolIds` ([apps/web/src/lib/vapi/assistant-client.ts](../../../apps/web/src/lib/vapi/assistant-client.ts)), so once the query tool is attached it survives future Publishes. This phase extends the sync so Publish can *add* the query tool id (when documents exist) and *remove* it (when none exist) without disturbing the existing booking tools.

## 3. Scope

**In scope**
- A "Документи" (Documents) tab in the Agent Builder: upload, list, delete.
- Document records in Supabase with metadata + the Vapi `file id`. **Bytes live in Vapi; we store metadata only** (no Supabase Storage).
- One query tool per organization, reconciled on Publish to point at exactly the org's active documents.
- Price behaviour derived from the presence of a `price_list`-kind document (no manual toggle).
- Extending the composer and the Vapi sync client accordingly.

**Out of scope (future phases)**
- Editing a document's content in-app (delete + re-upload instead).
- Per-document visibility/permissions, folders, versioning.
- OCR / parsing previews, showing extracted text.
- Choosing a non-Google retrieval provider.
- Automatic cleanup/garbage-collection of orphaned Vapi files beyond the best-effort reconcile described below.

## 4. Data model

**New migration `005_documents_and_query_tool.sql`:**

- New table `public.documents`:
  - `id uuid primary key default gen_random_uuid()`
  - `organization_id uuid not null references organizations(id) on delete cascade`
  - `name text not null` (display name; also used as the Vapi file name, so ≤ 40 chars)
  - `kind text not null default 'general'` — one of `'general' | 'price_list'`
  - `vapi_file_id text` (nullable until the Vapi upload succeeds)
  - `bytes bigint`
  - `mimetype text`
  - `status text not null default 'active'` — `'active' | 'archived'`
  - `created_at timestamptz not null default now()`
- Add column to `public.assistants`: `vapi_query_tool_id text` (nullable; set on first Publish that has ≥ 1 document).
- **RLS** on `documents`, mirroring the fact tables: "members can read" + "admins can manage" (owner/admin), using the existing `is_org_admin()` helper.

**Types:** add `documents` Row/Insert and the new `assistants.vapi_query_tool_id` field to `apps/web/src/types/database.ts`.

## 5. Vapi integration layer

Add `apps/web/src/lib/vapi/knowledge-base-client.ts` (server-only, reuses the `VAPI_PRIVATE_KEY`/`VAPI_API_KEY` + base URL pattern from `assistant-client.ts`):

- `uploadVapiFile(file: File, name: string): Promise<{ id: string; bytes?: number; mimetype?: string }>` — POST multipart to `/file`.
- `deleteVapiFile(id: string): Promise<void>` — `DELETE /file/{id}` (best-effort; ignore 404).
- `buildQueryToolBody(fileIds: string[], orgName: string)` — **pure**, returns the `POST /tool` body (`type:"query"`, `function.name:"business_docs"`, one `knowledgeBases[0]` with `provider:"google"`, `fileIds`). Unit-tested.
- `createQueryTool(fileIds, orgName): Promise<{ id: string }>` — `POST /tool`.
- `updateQueryToolFiles(toolId, fileIds, orgName): Promise<void>` — `PATCH /tool/{toolId}` with the updated `knowledgeBases[0].fileIds`.

**Sync client change (`assistant-client.ts`):** extend `buildSyncedModel` to accept options for tool-id management, e.g. `buildSyncedModel(currentModel, systemPrompt, { addToolIds?: string[]; removeToolIds?: string[] })`, unioning `addToolIds` into and subtracting `removeToolIds` from the preserved `toolIds` (deduped). `syncAssistantToVapi` gains matching optional `addToolIds`/`removeToolIds`. Backward compatible — existing 4b calls pass nothing and behave exactly as today. This keeps booking tools untouched while letting Publish add/remove only the query tool id.

## 6. Composer changes (`lib/agent/prompt-composer.ts`)

The composed `system_prompt` gains one more generated block after "## Бизнес контекст", driven by the org's documents:

- **Has ≥ 1 active document** → append a "## Документи (знание)" instruction that *names the tool*: e.g. *«Имаш инструмент `business_docs` с документите на бизнеса. Когато клиент пита за услуга, условия или подробности от тях, извикай инструмента и отговори точно според документите.»*
- **Price rule (derived):**
  - If ≥ 1 active `price_list` document → *«Ако клиентът пита за цена, използвай `business_docs` и кажи цената от ценовата листа.»*
  - Else → *«Не казвай точни цени по телефона. Кажи, че колегите ще изготвят оферта или ще уточните цената на консултацията/срещата.»*
- **No documents at all** → no "## Документи" block; the price rule falls back to the deflection line above (so behaviour is well-defined even before anything is uploaded).

`renderBusinessContext` / `composeSystemPrompt` (or a small new `renderKnowledgeSection`) take the documents list as input and stay **pure + unit-tested**. The price line is a pure function of "does an active `price_list` doc exist".

## 7. Server actions (`app/(dashboard)/assistant/actions.ts`)

All admin-gated via the existing `requireAdmin()` and org-scoped, returning the existing `ActionResult`:

- `uploadDocument(formData)` — parse `name` (≤ 40 chars, required), `kind` (`general` | `price_list`), and the `File`; validate type + size; `uploadVapiFile(...)`; insert a `documents` row with the returned `vapi_file_id`. Vapi-first: if the upload fails, no DB row is written. `revalidatePath('/assistant')`.
- `deleteDocument(id)` — delete the `documents` row (double-gated on `id` + `organization_id`). The live assistant is corrected on the next Publish (below). Best-effort `deleteVapiFile` is deferred to Publish reconcile to avoid dangling references in the live tool.
- **Extend `publishAssistant()`** — after composing, reconcile the knowledge base:
  1. Load active documents (`status='active'`) → `desiredFileIds`.
  2. If `desiredFileIds` is non-empty: if `assistants.vapi_query_tool_id` is null → `createQueryTool` and persist the id; else → `updateQueryToolFiles`. Then Publish syncs the assistant with `addToolIds:[queryToolId]`.
  3. If `desiredFileIds` is empty: Publish syncs with `removeToolIds:[queryToolId]` (if one exists); the composed prompt has no KB block.
  4. Best-effort: delete Vapi files that are no longer referenced (files previously in the tool but not in `desiredFileIds`). Failures here are logged, not fatal.
  - Vapi-first ordering preserved: if any required Vapi call fails, return `vapi_sync_failed` and persist nothing new (the `vapi_query_tool_id`, if just created, is still safe to persist since the tool exists).

## 8. UI — Documents tab (`app/(dashboard)/assistant/tabs/documents-tab.tsx`)

Follows the existing tab pattern (`agent-builder.tsx` + `tabs/*`, `inputClass`/`errorLabel`):

- **Upload form:** a `name` text input (helper: ≤ 40 знака), a `kind` `<select>` (Обща информация / Ценова листа), a `<input type="file">` with an `accept` filter, and a submit button. Uses the `uploadDocument` action.
- **List:** current active documents with name, kind badge (Ценова листа / Инфо), size, and a Delete button (`deleteDocument`).
- **Hint:** a small note that changes go live after "Публикувай на живо" (consistent with 4b), and that uploading a price list enables spoken prices.
- Wire the new tab into `agent-builder.tsx` and feed it the documents list from the page's composer-data reader (`lib/agent/composer-data.ts` extended to also select `documents`).

## 9. Error handling & validation

- **Type:** accept `.pdf .docx .doc .txt .csv .md` (subset of Vapi's list that fits SMB use). Reject others with a clear BG label.
- **Size:** client + server cap (default 5 MB, warn/note < 300 KB for best performance). The exact Vapi hard limit is confirmed during planning and the cap set at or below it.
- **Name:** ≤ 40 chars (Vapi constraint on file name); trim/validate in the parser.
- **Vapi-first everywhere:** an upload that fails at Vapi writes no DB row; a Publish whose Vapi calls fail returns `vapi_sync_failed` and changes nothing user-visible.
- **Known limitation (accepted for base):** `kind` controls the *prompt instruction*, not what is physically in the KB. If an owner marks a price-containing catalog as `general`, the agent could still surface a price via the tool. Acceptable for the base product; revisit with real customers.

## 10. Testing

- **Pure functions** (mjs tests via `ts.transpileModule` + data-URL dynamic import, as in 4b):
  - `buildQueryToolBody` — correct shape, provider `google`, fileIds passed through, function name stable.
  - Composer knowledge/price rule — has-docs vs no-docs; has-price_list vs not; empty sections omitted; no price leak when deflecting.
  - `buildSyncedModel` add/remove tool ids — adds the query tool id without dropping booking ids; removes only the target; dedupes; no-op when options omitted (4b behaviour intact).
- **Manual E2E** (a `check-*.mjs` script like 4b): upload a small price list → Publish → verify the live assistant has the query tool in `toolIds`, the prompt names `business_docs`, and the price rule is the "quote" variant; delete it → Publish → verify the tool is gone and the rule reverts to deflection.

## 11. Success criteria

1. Owner uploads a price list in the app, clicks Publish, calls the assistant, asks the price of a service that is in the document → the agent answers with the price from the document.
2. Owner deletes the price list and Publishes → the agent stops quoting prices and offers a human offer/consultation instead.
3. A general FAQ/policy document uploaded and Published → the agent answers relevant questions from it.
4. Existing booking tools + voice + transcriber are preserved across all Publishes (no regression from 4b).

## 12. Open items to resolve in the implementation plan

- Confirm `PATCH /tool/{id}` supports updating `knowledgeBases[].fileIds`; if not, fall back to delete-and-recreate (and update `vapi_query_tool_id` + `toolIds` accordingly).
- Confirm Vapi's hard file-size limit and set the app cap at/below it.
- Confirm the exact multipart approach for forwarding a Next.js server-action `File` to Vapi's `/file` endpoint (construct `FormData` with the file blob).

---

*One query tool per business, reconciled to exactly the current documents on Publish; prices gated by the presence of a `price_list` document; bytes in Vapi, metadata in Supabase; the app's Publish button does the full Vapi work.*
