import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { deleteVapiCall } from "@/lib/vapi/call-client";
import {
  appointmentScrubPatch,
  callAnonymizePatch,
  leadScrubPatch,
  normalizePhone,
  orderScrubPatch,
  phoneMatchSuffix,
} from "./subject";

type Client = SupabaseClient<Database>;

export type SubjectExport = {
  phone: string;
  calls: unknown[];
  leads: unknown[];
  appointments: unknown[];
  notifications: unknown[];
};

export type ScrubResult = {
  ok: boolean;
  phone: string | null;
  affected: Record<string, number>;
  vapiDeleted: number;
  vapiErrors: number;
};

/** Collect everything we hold on a caller (for access/export + panel preview). */
export async function gatherSubject(
  supabase: Client,
  orgId: string,
  rawPhone: string
): Promise<SubjectExport | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const like = `%${phoneMatchSuffix(phone)}`;
  const eq = (v: string | null) => normalizePhone(v) === phone;

  const [callsRes, leadsRes, apptsRes, notifRes] = await Promise.all([
    supabase
      .from("calls")
      .select(
        "id,caller_number,direction,status,disposition,started_at,ended_at,duration_seconds,summary,transcript,anonymized_at,created_at"
      )
      .eq("organization_id", orgId)
      .ilike("caller_number", like),
    supabase
      .from("leads")
      .select("id,name,phone,email,city,address,service_type,status,ai_summary,notes,created_at")
      .eq("organization_id", orgId)
      .ilike("phone", like),
    supabase
      .from("appointments")
      .select(
        "id,customer_name,customer_phone,title,status,starts_at,ends_at,service_type,location,notes,created_at"
      )
      .eq("organization_id", orgId)
      .ilike("customer_phone", like),
    supabase
      .from("notification_log")
      .select("id,channel,kind,destination,status,created_at")
      .eq("organization_id", orgId)
      .ilike("destination", like),
  ]);

  return {
    phone,
    calls: (callsRes.data ?? []).filter((r) => eq(r.caller_number)),
    leads: (leadsRes.data ?? []).filter((r) => eq(r.phone)),
    appointments: (apptsRes.data ?? []).filter((r) => eq(r.customer_phone)),
    notifications: (notifRes.data ?? []).filter((r) => eq(r.destination)),
  };
}

/** Erasure: scrub a caller everywhere + delete their calls at Vapi + audit row. */
export async function scrubSubject(
  supabase: Client,
  orgId: string,
  rawPhone: string,
  performedBy: string | null
): Promise<ScrubResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, phone: null, affected: {}, vapiDeleted: 0, vapiErrors: 0 };
  const like = `%${phoneMatchSuffix(phone)}`;
  const eq = (v: string | null) => normalizePhone(v) === phone;
  const nowIso = new Date().toISOString();
  const affected: Record<string, number> = {};
  let vapiDeleted = 0;
  let vapiErrors = 0;

  // calls -> delete at Vapi, then anonymize
  const { data: callRows } = await supabase
    .from("calls")
    .select("id,vapi_call_id,caller_number")
    .eq("organization_id", orgId)
    .ilike("caller_number", like);
  const calls = (callRows ?? []).filter((r) => eq(r.caller_number));
  for (const c of calls) {
    if (c.vapi_call_id) {
      if (await deleteVapiCall(c.vapi_call_id)) vapiDeleted += 1;
      else vapiErrors += 1;
    }
  }
  if (calls.length) {
    await supabase
      .from("calls")
      .update(callAnonymizePatch(nowIso))
      .in(
        "id",
        calls.map((c) => c.id)
      );
  }
  affected.calls = calls.length;

  // leads (+ linked orders)
  const { data: leadRows } = await supabase
    .from("leads")
    .select("id,phone")
    .eq("organization_id", orgId)
    .ilike("phone", like);
  const leads = (leadRows ?? []).filter((r) => eq(r.phone));
  if (leads.length) {
    const leadIds = leads.map((l) => l.id);
    await supabase.from("leads").update(leadScrubPatch()).in("id", leadIds);
    await supabase.from("orders").update(orderScrubPatch()).in("lead_id", leadIds);
  }
  affected.leads = leads.length;

  // appointments
  const { data: apptRows } = await supabase
    .from("appointments")
    .select("id,customer_phone")
    .eq("organization_id", orgId)
    .ilike("customer_phone", like);
  const appts = (apptRows ?? []).filter((r) => eq(r.customer_phone));
  if (appts.length) {
    await supabase
      .from("appointments")
      .update(appointmentScrubPatch())
      .in(
        "id",
        appts.map((a) => a.id)
      );
  }
  affected.appointments = appts.length;

  // notification_log -> delete
  const { data: notifRows } = await supabase
    .from("notification_log")
    .select("id,destination")
    .eq("organization_id", orgId)
    .ilike("destination", like);
  const notifs = (notifRows ?? []).filter((r) => eq(r.destination));
  if (notifs.length) {
    await supabase
      .from("notification_log")
      .delete()
      .in(
        "id",
        notifs.map((n) => n.id)
      );
  }
  affected.notifications = notifs.length;

  await supabase.from("gdpr_actions").insert({
    organization_id: orgId,
    action: "erasure",
    subject_phone: phone,
    performed_by: performedBy,
    affected,
    vapi_deleted: vapiDeleted,
    vapi_errors: vapiErrors,
  });

  return { ok: true, phone, affected, vapiDeleted, vapiErrors };
}

/** Retention (Tier A): anonymize expired calls + purge expired raw logs. Idempotent via anonymized_at. */
export async function anonymizeExpiredCalls(
  supabase: Client,
  org: { id: string; recording_retention_days: number }
): Promise<{ affected: Record<string, number>; vapiDeleted: number; vapiErrors: number }> {
  const cutoffIso = new Date(Date.now() - org.recording_retention_days * 86400000).toISOString();
  const nowIso = new Date().toISOString();
  const affected: Record<string, number> = {};
  let vapiDeleted = 0;
  let vapiErrors = 0;

  const { data: callRows } = await supabase
    .from("calls")
    .select("id,vapi_call_id")
    .eq("organization_id", org.id)
    .is("anonymized_at", null)
    .lt("created_at", cutoffIso);
  const calls = callRows ?? [];
  for (const c of calls) {
    if (c.vapi_call_id) {
      if (await deleteVapiCall(c.vapi_call_id)) vapiDeleted += 1;
      else vapiErrors += 1;
    }
  }
  if (calls.length) {
    await supabase
      .from("calls")
      .update(callAnonymizePatch(nowIso))
      .in(
        "id",
        calls.map((c) => c.id)
      );
  }
  affected.calls = calls.length;

  const we = await supabase
    .from("webhook_events")
    .delete()
    .eq("organization_id", org.id)
    .lt("received_at", cutoffIso)
    .select("id");
  affected.webhook_events = we.data?.length ?? 0;

  const nl = await supabase
    .from("notification_log")
    .delete()
    .eq("organization_id", org.id)
    .lt("created_at", cutoffIso)
    .select("id");
  affected.notification_log = nl.data?.length ?? 0;

  const on = await supabase
    .from("owner_notifications")
    .delete()
    .eq("organization_id", org.id)
    .lt("created_at", cutoffIso)
    .select("id");
  affected.owner_notifications = on.data?.length ?? 0;

  const touched =
    calls.length + affected.webhook_events + affected.notification_log + affected.owner_notifications;
  if (touched > 0) {
    await supabase.from("gdpr_actions").insert({
      organization_id: org.id,
      action: "retention_anonymize",
      subject_phone: null,
      performed_by: null,
      affected,
      vapi_deleted: vapiDeleted,
      vapi_errors: vapiErrors,
    });
  }

  return { affected, vapiDeleted, vapiErrors };
}
