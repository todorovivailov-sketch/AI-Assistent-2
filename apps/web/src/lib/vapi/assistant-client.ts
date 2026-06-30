// Vapi assistant sync. Server-only (reads VAPI_PRIVATE_KEY / VAPI_API_KEY).
//
// buildSyncedModel is pure and unit-tested. Vapi's `PATCH model` REPLACES the whole model object, and
// the assistant's booking tools (toolIds) + model config live OUTSIDE the system message — so we GET the
// current model, preserve provider/model/toolIds/tools/temperature, and swap ONLY the system message.
// A naive partial PATCH would wipe the booking tools and voice.

type VapiMessage = { role: string; content: string };
type VapiModel = {
  provider?: unknown;
  model?: unknown;
  messages?: VapiMessage[];
  toolIds?: unknown;
  tools?: unknown[];
  temperature?: unknown;
  maxTokens?: unknown;
  knowledgeBaseId?: unknown;
};
type VapiAssistant = { name?: string; firstMessage?: string; model?: VapiModel };

export function buildSyncedModel(currentModel: VapiModel, systemPrompt: string) {
  const messages: VapiMessage[] = Array.isArray(currentModel?.messages)
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

const VAPI_BASE = "https://api.vapi.ai";

function vapiKey(): string | null {
  return process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY || null;
}

async function vapiFetch<T>(method: string, pathname: string, body?: unknown): Promise<T> {
  const key = vapiKey();
  if (!key) throw new Error("VAPI key missing");
  const res = await fetch(`${VAPI_BASE}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  if (res.status >= 300) throw new Error(`Vapi ${method} ${pathname} -> ${res.status}: ${t.slice(0, 300)}`);
  try {
    return JSON.parse(t) as T;
  } catch {
    return {} as T;
  }
}

export async function getVapiAssistant(id: string): Promise<VapiAssistant> {
  return vapiFetch<VapiAssistant>("GET", `/assistant/${encodeURIComponent(id)}`);
}

export async function syncAssistantToVapi(
  id: string,
  input: { name: string; firstMessage: string; systemPrompt: string }
): Promise<void> {
  const current = await getVapiAssistant(id);
  const model = buildSyncedModel(current?.model ?? {}, input.systemPrompt);
  await vapiFetch("PATCH", `/assistant/${encodeURIComponent(id)}`, {
    name: input.name,
    firstMessage: input.firstMessage,
    model,
  });
}
