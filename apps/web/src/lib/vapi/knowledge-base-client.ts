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
