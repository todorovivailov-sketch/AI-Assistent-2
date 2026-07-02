import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { sendOwnerAgendaEmail } from "@/lib/notifications/owner-email";
import {
  agendaDedupeKey,
  buildOwnerAgendaEmail,
  buildReminderSms,
  selectDueAppointments,
  smsDedupeKey,
  sofiaDayWindow,
  type ReminderAppointment,
  type SofiaDayWindow,
} from "@/lib/notifications/reminders";
import { sendSms } from "@/lib/notifications/sms";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrgRow = { id: string; name: string; owner_phone: string | null; billing_email: string | null };
type ServiceClient = ReturnType<typeof getSupabaseServiceClient>;

export async function GET(request: Request) {
  return runReminders(request);
}

export async function POST(request: Request) {
  return runReminders(request);
}

async function runReminders(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const orgSlug = url.searchParams.get("organization");
  const supabase = getSupabaseServiceClient();

  const window = sofiaDayWindow(new Date(), 1); // tomorrow, Europe/Sofia

  let orgQuery = supabase
    .from("organizations")
    .select("id,name,owner_phone,billing_email")
    .eq("status", "active");
  if (orgSlug) orgQuery = orgQuery.eq("slug", orgSlug);

  const { data: orgs, error: orgError } = await orgQuery;
  if (orgError) {
    return NextResponse.json({ ok: false, error: "org query failed" }, { status: 500 });
  }

  const organizations = [];
  for (const org of (orgs ?? []) as OrgRow[]) {
    organizations.push(await processOrg(supabase, org, window, dryRun));
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    date: window.isoDate,
    window: { from: window.startUtc.toISOString(), to: window.endUtc.toISOString() },
    organizations,
  });
}

async function processOrg(supabase: ServiceClient, org: OrgRow, window: SofiaDayWindow, dryRun: boolean) {
  const { data: apptRows } = await supabase
    .from("appointments")
    .select("id,status,starts_at,customer_phone,customer_name,service_type,location")
    .eq("organization_id", org.id)
    .gte("starts_at", window.startUtc.toISOString())
    .lt("starts_at", window.endUtc.toISOString());

  const due = selectDueAppointments((apptRows ?? []) as ReminderAppointment[], window);

  // --- Customer SMS ---
  let smsSent = 0;
  let smsFailed = 0;
  const smsPreview: Array<{ to: string; text: string }> = [];
  for (const appt of due) {
    const to = appt.customer_phone as string;
    const text = buildReminderSms(appt, { name: org.name, owner_phone: org.owner_phone });
    if (dryRun) {
      smsPreview.push({ to, text });
      continue;
    }
    const key = smsDedupeKey(appt.id);
    const claimed = await claim(supabase, {
      organization_id: org.id,
      channel: "sms",
      kind: "appointment_reminder",
      appointment_id: appt.id,
      dedupe_key: key,
      destination: to,
    });
    if (!claimed) continue; // already sent on a prior run
    const r = await sendSms({ to, text });
    if (r.sent) {
      smsSent += 1;
    } else {
      smsFailed += 1;
      await markFailed(supabase, org.id, key, r.error ?? "unknown");
    }
  }

  // --- Owner agenda email (one per org per day; skipped when no appointments) ---
  const agendaEmail = buildOwnerAgendaEmail(due, { name: org.name }, window.dateLabel);
  const to = org.billing_email ?? process.env.OWNER_NOTIFICATION_EMAIL ?? null;
  let agenda: "sent" | "skipped" | "failed" = "skipped";
  if (due.length > 0 && to && !dryRun) {
    const key = agendaDedupeKey(window.isoDate);
    const claimed = await claim(supabase, {
      organization_id: org.id,
      channel: "email",
      kind: "owner_daily_agenda",
      appointment_id: null,
      dedupe_key: key,
      destination: to,
    });
    if (claimed) {
      const r = await sendOwnerAgendaEmail({ to, ...agendaEmail });
      if (r.sent) {
        agenda = "sent";
      } else {
        agenda = "failed";
        await markFailed(supabase, org.id, key, "resend failed");
      }
    }
  }

  return {
    organizationId: org.id,
    name: org.name,
    smsPlanned: due.length,
    smsSent,
    smsFailed,
    agenda,
    ...(dryRun
      ? { smsPreview, agendaPreview: due.length && to ? { to, subject: agendaEmail.subject, text: agendaEmail.text } : null }
      : {}),
  };
}

async function claim(
  supabase: ServiceClient,
  row: {
    organization_id: string;
    channel: string;
    kind: string;
    appointment_id: string | null;
    dedupe_key: string;
    destination: string;
  }
): Promise<boolean> {
  const { data } = await supabase
    .from("notification_log")
    .upsert(
      { ...row, status: "sent", sent_at: new Date().toISOString() },
      { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true }
    )
    .select("id");
  return Boolean(data && data.length > 0);
}

async function markFailed(
  supabase: ServiceClient,
  organizationId: string,
  dedupeKey: string,
  error: string
): Promise<void> {
  await supabase
    .from("notification_log")
    .update({ status: "failed", error, sent_at: null })
    .eq("organization_id", organizationId)
    .eq("dedupe_key", dedupeKey);
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  const supplied = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : request.headers.get("x-cron-secret");
  if (!supplied) return false;
  return constantTimeEqual(supplied, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
