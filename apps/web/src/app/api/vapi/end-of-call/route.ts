import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  buildCallInsert,
  buildLeadInsert,
  getAssistantCandidate,
  getExternalEventId,
  getPhoneNumberCandidates,
  getVapiMessage,
  type OrganizationResolution,
} from "@/lib/vapi/payload";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "vapi-end-of-call",
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
    ),
    authMode: getWebhookAuthMode(),
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
    }
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
