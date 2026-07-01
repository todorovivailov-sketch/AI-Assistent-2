import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import {
  composeSystemPrompt,
  renderBusinessContext,
  renderKnowledgeSection,
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
export type DocumentRow = { id: string; name: string; kind: string; bytes: number | null; mimetype: string | null; status: string };

export type AgentComposerData = {
  vapiAssistantId: string;
  name: string;
  firstMessage: string;
  basePrompt: string;
  guardrails: string;
  services: ServiceRow[];
  hours: HoursRow[]; // 0–7 stored rows; the UI grid fills missing weekdays for editing
  areas: AreaRow[];
  documents: DocumentRow[];
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

  const [{ data: services }, { data: hours }, { data: areas }, { data: documents }] = await Promise.all([
    supabase.from("services").select("id, name, description, duration_minutes, price_min, price_max, currency, status").eq("organization_id", org.id).order("name"),
    supabase.from("business_hours").select("weekday, opens_at, closes_at, is_closed").eq("organization_id", org.id).order("weekday"),
    supabase.from("service_areas").select("id, city, region, status").eq("organization_id", org.id).order("city"),
    supabase.from("documents").select("id, name, kind, bytes, mimetype, status").eq("organization_id", org.id).eq("status", "active").order("created_at"),
  ]);

  const basePrompt = row.base_prompt ?? DEFAULT_BASE_PROMPT;
  const guardrails = row.guardrails ?? "";
  const businessContext = renderBusinessContext({
    orgName: org.name,
    services: (services ?? []).map((s) => ({ name: s.name, description: s.description, status: s.status })),
    hours: hours ?? [],
    areas: (areas ?? []).map((a) => ({ city: a.city, region: a.region, status: a.status })),
  });
  const knowledge = renderKnowledgeSection({ documents: (documents ?? []).map((d) => ({ kind: d.kind, status: d.status })) });

  return {
    vapiAssistantId: row.vapi_assistant_id,
    name: row.name ?? "",
    firstMessage: row.first_message ?? "",
    basePrompt,
    guardrails,
    services: services ?? [],
    hours: hours ?? [],
    areas: areas ?? [],
    documents: documents ?? [],
    composedPreview: composeSystemPrompt({ base: basePrompt, businessContext, knowledge, guardrails }),
  };
}
