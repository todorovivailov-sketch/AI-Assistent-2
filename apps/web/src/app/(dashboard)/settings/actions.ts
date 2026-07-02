"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateMissedCallSettings(formData: FormData): Promise<ActionResult> {
  const org = await getActiveOrganization();
  if (!org) return { ok: false, error: "no_org" };
  const supabase = await createClient();

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) return { ok: false, error: "not_admin" };

  const enabled = formData.get("enabled") === "on";
  const rawTemplate = (formData.get("template") as string | null)?.trim() ?? "";
  const template = rawTemplate === "" ? null : rawTemplate;

  const { error } = await supabase
    .from("organizations")
    .update({ missed_call_sms_enabled: enabled, missed_call_sms_template: template })
    .eq("id", org.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateRetentionDays(formData: FormData): Promise<ActionResult> {
  const org = await getActiveOrganization();
  if (!org) return { ok: false, error: "no_org" };
  const supabase = await createClient();

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) return { ok: false, error: "not_admin" };

  const days = Number((formData.get("days") as string | null)?.trim());
  if (!Number.isFinite(days) || days < 1 || days > 3650) return { ok: false, error: "bad_days" };

  const { error } = await supabase
    .from("organizations")
    .update({ recording_retention_days: Math.round(days) })
    .eq("id", org.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
