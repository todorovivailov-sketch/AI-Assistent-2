import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { handleVapiToolCalls } from "@/lib/vapi/calendar-tools";
import {
  buildCallInsert,
  buildLeadInsert,
  getAssistantCandidate,
  getExternalEventId,
  getPhoneNumberCandidates,
  getVapiMessage,
  type OrganizationResolution,
} from "@/lib/vapi/payload";
import { sendOwnerLeadEmail } from "@/lib/notifications/owner-email";
import { sendSms } from "@/lib/notifications/sms";
import { sofiaDayWindow } from "@/lib/notifications/reminders";
import { classifyMissedCall, buildMissedCallSms, missDedupeKey } from "@/lib/notifications/missed-call";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "vapi-end-of-call",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
    ),
    authMode: getWebhookAuthMode(),
    vapiConfigured: Boolean(process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    ownerEmailConfigured: Boolean(process.env.OWNER_NOTIFICATION_EMAIL),
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedVapiRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const message = getVapiMessage(payload);
  let supabase: ReturnType<typeof getSupabaseServiceClient>;

  try {
    supabase = getSupabaseServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase environment variables are missing",
        required: [
          "NEXT_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
          "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY",
        ],
      },
      { status: 503 }
    );
  }

  const resolution = await resolveOrganization(message);
  const externalEventId = getExternalEventId(message);

  const { error: webhookEventError } = await supabase.from("webhook_events").insert({
    organization_id: resolution?.organizationId ?? null,
    provider: "vapi",
    event_type: message.type,
    external_event_id: externalEventId,
    payload: payload as never,
  });

  if (webhookEventError && webhookEventError.code !== "23505") {
    console.error("Vapi webhook event insert failed", webhookEventError);
  }

  if (message.type === "tool-calls") {
    const toolResult = await handleVapiToolCalls(message, resolution);
    return NextResponse.json(toolResult);
  }

  if (message.type !== "end-of-call-report") {
    return NextResponse.json({ ok: true, stored: "event" });
  }

  if (!resolution) {
    return NextResponse.json({ ok: true, stored: "event", skipped: "organization_not_resolved" }, { status: 202 });
  }

  const callInsert = buildCallInsert(message, resolution);

  if (!callInsert) {
    return NextResponse.json({ ok: false, error: "Missing Vapi call id" }, { status: 422 });
  }

  const { data: call, error: callError } = await supabase
    .from("calls")
    .upsert(callInsert, { onConflict: "vapi_call_id" })
    .select("id")
    .single();

  if (callError) {
    return NextResponse.json({ ok: false, error: "Call insert failed" }, { status: 500 });
  }

  const leadInsert = buildLeadInsert(call.id, callInsert);

  if (leadInsert) {
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("call_id", call.id)
      .maybeSingle();

    if (!existingLead) {
      await supabase.from("leads").insert(leadInsert);
      void sendOwnerLeadEmail({ to: null, lead: leadInsert, orgName: null });
    }
  }

  try {
    await maybeSendMissedCallRecovery(supabase, resolution.organizationId, callInsert);
  } catch (error) {
    console.error("Missed-call recovery failed", error);
  }

  return NextResponse.json({ ok: true, stored: "call", callId: call.id });
}

async function resolveOrganization(message: ReturnType<typeof getVapiMessage>): Promise<OrganizationResolution | null> {
  const supabase = getSupabaseServiceClient();
  const { e164, vapiPhoneNumberId } = getPhoneNumberCandidates(message);

  if (vapiPhoneNumberId) {
    const { data } = await supabase
      .from("phone_numbers")
      .select("id, organization_id, assistant_id")
      .eq("vapi_phone_number_id", vapiPhoneNumberId)
      .maybeSingle();

    if (data) {
      return {
        organizationId: data.organization_id,
        phoneNumberId: data.id,
        assistantId: data.assistant_id,
      };
    }
  }

  if (e164) {
    const { data } = await supabase
      .from("phone_numbers")
      .select("id, organization_id, assistant_id")
      .eq("e164", e164)
      .maybeSingle();

    if (data) {
      return {
        organizationId: data.organization_id,
        phoneNumberId: data.id,
        assistantId: data.assistant_id,
      };
    }
  }

  const vapiAssistantId = getAssistantCandidate(message);

  if (vapiAssistantId) {
    const { data } = await supabase
      .from("assistants")
      .select("id, organization_id")
      .eq("vapi_assistant_id", vapiAssistantId)
      .maybeSingle();

    if (data) {
      return {
        organizationId: data.organization_id,
        phoneNumberId: null,
        assistantId: data.id,
      };
    }
  }

  return null;
}

function isAuthorizedVapiRequest(request: Request): boolean {
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  const allowsUnauthenticated =
    process.env.VAPI_WEBHOOK_ALLOW_UNAUTHENTICATED === "true";

  if (!expectedSecret) {
    return allowsUnauthenticated || process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization");
  const legacySecret = request.headers.get("x-vapi-secret");
  const suppliedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : legacySecret;

  if (!suppliedSecret) {
    return false;
  }

  return constantTimeEqual(suppliedSecret, expectedSecret);
}

function getWebhookAuthMode(): string {
  if (process.env.VAPI_WEBHOOK_SECRET) {
    return "bearer";
  }

  if (process.env.VAPI_WEBHOOK_ALLOW_UNAUTHENTICATED === "true") {
    return "unauthenticated-explicit";
  }

  return process.env.NODE_ENV === "production" ? "blocked-without-secret" : "development-no-auth";
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function maybeSendMissedCallRecovery(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  organizationId: string,
  callInsert: NonNullable<ReturnType<typeof buildCallInsert>>
): Promise<void> {
  const { data: org } = await supabase
    .from("organizations")
    .select("name, missed_call_sms_enabled, missed_call_sms_template")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org || !org.missed_call_sms_enabled) return;

  const sd = (callInsert.structured_data ?? {}) as unknown as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const capturedIntent = Boolean(
    s(sd.name) || s(sd.service) || s(sd.serviceType) || s(sd.service_type) ||
    s(sd.city) || s(sd.town) || sd.appointment_confirmed === true || sd.appointmentConfirmed === true
  );

  const verdict = classifyMissedCall({
    callerNumber: callInsert.caller_number ?? null,
    endedReason: callInsert.ended_reason ?? null,
    durationSeconds: callInsert.duration_seconds ?? null,
    disposition: callInsert.disposition ?? null,
    capturedIntent,
  });
  if (!verdict.isMiss) return;

  const to = callInsert.caller_number;
  if (!to) return; // narrow for TS; classifier already guaranteed a mobile

  const sofiaDate = sofiaDayWindow(new Date(), 0).isoDate; // today, Europe/Sofia
  const dedupeKey = missDedupeKey(to, sofiaDate);

  // Claim-then-send: insert wins the race; a duplicate returns no rows -> skip.
  const { data: claimed } = await supabase
    .from("notification_log")
    .upsert(
      {
        organization_id: organizationId,
        channel: "sms",
        kind: "missed_call_recovery",
        appointment_id: null,
        dedupe_key: dedupeKey,
        destination: to,
        status: "sent",
        sent_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true }
    )
    .select("id");
  if (!claimed || claimed.length === 0) return; // already sent to this caller today

  const text = buildMissedCallSms(org.missed_call_sms_template, { business: org.name });
  const result = await sendSms({ to, text });
  if (!result.sent) {
    await supabase
      .from("notification_log")
      .update({ status: "failed", error: result.error ?? "unknown", sent_at: null })
      .eq("organization_id", organizationId)
      .eq("dedupe_key", dedupeKey);
  }
}
