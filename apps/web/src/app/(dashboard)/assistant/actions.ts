"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import { parseAgentBehaviorForm } from "@/lib/agent/assistant-form";
import { parseServiceForm } from "@/lib/agent/service-form";
import { parseBusinessHoursForm } from "@/lib/agent/business-hours-form";
import { parseServiceAreaForm } from "@/lib/agent/service-area-form";
import { parseDocumentForm } from "@/lib/agent/document-form";
import { uploadVapiFile, createQueryTool, updateQueryToolFiles } from "@/lib/vapi/knowledge-base-client";
import { composeSystemPrompt, renderBusinessContext, renderKnowledgeSection, DEFAULT_BASE_PROMPT } from "@/lib/agent/prompt-composer";
import { createClient } from "@/lib/supabase/server";
import { syncAssistantToVapi } from "@/lib/vapi/assistant-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Shared: resolve org + assert the caller is owner/admin (fact tables + assistants are admin-manage in RLS;
// the explicit gate turns a silent RLS failure into a clean error). Returns the RLS client + org.
type AdminGate =
  | { error: string }
  | { org: NonNullable<Awaited<ReturnType<typeof getActiveOrganization>>>; supabase: Awaited<ReturnType<typeof createClient>> };

async function requireAdmin(): Promise<AdminGate> {
  const org = await getActiveOrganization();
  if (!org) return { error: "no_org" };
  const supabase = await createClient();
  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) return { error: "not_admin" };
  return { org, supabase };
}

// ---- Behavior (DB-only draft; goes live on Publish) ----
export async function updateAgentBehavior(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const parsed = parseAgentBehaviorForm(formData);
  if (parsed.error || !parsed.values) return { ok: false, error: parsed.error ?? "invalid" };

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
