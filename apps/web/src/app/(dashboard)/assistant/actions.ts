"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import { parseAssistantForm } from "@/lib/agent/assistant-form";
import { createClient } from "@/lib/supabase/server";
import { syncAssistantToVapi } from "@/lib/vapi/assistant-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Server Actions are reachable via direct POST, so this is admin-gated explicitly (the Vapi push is not
// RLS-bounded — it uses the service key). Sync order is Vapi-FIRST, then DB, so the row only ever stores
// a successfully-pushed state.
export async function updateAssistant(formData: FormData): Promise<ActionResult> {
  const parsed = parseAssistantForm(formData);
  if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "invalid" };

  const org = await getActiveOrganization();
  if (!org) return { ok: false, error: "no_org" };

  const supabase = await createClient();

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) {
    return { ok: false, error: "not_admin" };
  }

  const { data: row } = await supabase
    .from("assistants")
    .select("id, vapi_assistant_id")
    .eq("organization_id", org.id)
    .limit(1)
    .maybeSingle();
  if (!row?.vapi_assistant_id) return { ok: false, error: "no_assistant" };

  try {
    await syncAssistantToVapi(row.vapi_assistant_id, parsed.values);
  } catch (error) {
    console.error("Vapi sync failed:", error);
    return { ok: false, error: "vapi_sync_failed" };
  }

  const { error } = await supabase
    .from("assistants")
    .update({
      name: parsed.values.name,
      first_message: parsed.values.firstMessage,
      system_prompt: parsed.values.systemPrompt,
    })
    .eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/assistant");
  return { ok: true };
}
