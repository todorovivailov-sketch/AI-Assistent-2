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

// Reads the org's assistant row (RLS). The system_prompt/first_message columns are populated lazily
// (first save), so when empty we seed the editor from the LIVE Vapi assistant — the user never starts
// from a blank prompt and can't accidentally wipe the live one.
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
      const sys = live.model?.messages?.find((m) => m.role === "system");
      if (sys?.content) {
        systemPrompt = sys.content;
        seededFromVapi = true;
      }
      if (!firstMessage && typeof live.firstMessage === "string") firstMessage = live.firstMessage;
      if (!name && typeof live.name === "string") name = live.name;
    } catch (error) {
      console.error("Vapi seed failed:", error);
    }
  }

  return {
    vapiAssistantId: row.vapi_assistant_id,
    name,
    firstMessage,
    systemPrompt,
    model: row.model,
    voiceProvider: row.voice_provider,
    status: row.status,
    seededFromVapi,
  };
}
