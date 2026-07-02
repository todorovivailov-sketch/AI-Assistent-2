"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import { gatherSubject, scrubSubject } from "@/lib/gdpr/engine";
import { createClient } from "@/lib/supabase/server";

export type LookupResult =
  | {
      ok: true;
      phone: string;
      counts: { calls: number; leads: number; appointments: number; notifications: number };
    }
  | { ok: false; error: string };

export type EraseResult =
  | { ok: true; phone: string; affected: Record<string, number>; vapiDeleted: number; vapiErrors: number }
  | { ok: false; error: string };

async function requireAdmin() {
  const org = await getActiveOrganization();
  if (!org) return { ok: false as const, error: "no_org" };
  const supabase = await createClient();
  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) return { ok: false as const, error: "not_admin" };
  return { ok: true as const, org, supabase };
}

export async function lookupSubject(phone: string): Promise<LookupResult> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const data = await gatherSubject(ctx.supabase, ctx.org.id, phone);
  if (!data) return { ok: false, error: "bad_phone" };
  return {
    ok: true,
    phone: data.phone,
    counts: {
      calls: data.calls.length,
      leads: data.leads.length,
      appointments: data.appointments.length,
      notifications: data.notifications.length,
    },
  };
}

export async function eraseSubject(phone: string): Promise<EraseResult> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  const res = await scrubSubject(ctx.supabase, ctx.org.id, phone, user?.id ?? null);
  if (!res.ok || !res.phone) return { ok: false, error: "bad_phone" };
  revalidatePath("/privacy");
  return {
    ok: true,
    phone: res.phone,
    affected: res.affected,
    vapiDeleted: res.vapiDeleted,
    vapiErrors: res.vapiErrors,
  };
}
