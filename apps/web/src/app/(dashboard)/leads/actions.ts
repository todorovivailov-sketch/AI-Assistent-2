"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import { buildLeadInsertFromForm, parseLeadStatus } from "@/lib/crm/lead-form";
import { createClient } from "@/lib/supabase/server";

// All mutations go through the RLS session client. The DB's "members can update/insert leads"
// policies scope every row to the caller's org, so a forged id from another org matches zero
// rows — no extra org check needed (and never trust a client-supplied organization_id).
export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateLeadStatus(leadId: string, status: string): Promise<ActionResult> {
  const valid = parseLeadStatus(status);
  if (!valid) return { ok: false, error: "invalid_status" };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ status: valid }).eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/leads");
  return { ok: true };
}

export async function updateLeadNotes(leadId: string, notes: string): Promise<ActionResult> {
  const trimmed = notes.trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ notes: trimmed === "" ? null : trimmed })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/leads");
  return { ok: true };
}

export async function createLead(formData: FormData): Promise<ActionResult> {
  const organization = await getActiveOrganization();
  if (!organization) return { ok: false, error: "no_org" };

  const { error: formError, values } = buildLeadInsertFromForm(formData, organization.id);
  if (formError || !values) return { ok: false, error: formError ?? "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert(values);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/leads");
  return { ok: true };
}
