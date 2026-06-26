import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { listGoogleCalendarEvents } from "@/lib/google/calendar";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type SyncSummary = {
  organizationId: string;
  calendarId: string;
  imported: number;
  updated: number;
  skipped: number;
};

export async function GET(request: Request) {
  return syncGoogleCalendar(request);
}

export async function POST(request: Request) {
  return syncGoogleCalendar(request);
}

async function syncGoogleCalendar(request: Request) {
  if (!isAuthorizedSyncRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  const url = new URL(request.url);
  const organizationSlug = url.searchParams.get("organization");
  const from = parseDateParam(url.searchParams.get("from")) ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const to = parseDateParam(url.searchParams.get("to")) ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  let organizationId: string | null = null;

  if (organizationSlug) {
    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", organizationSlug)
      .maybeSingle();

    if (organizationError || !organization) {
      return NextResponse.json({ ok: false, error: "Organization not found" }, { status: 404 });
    }

    organizationId = organization.id;
  }

  let settingsQuery = supabase
    .from("calendar_settings")
    .select("organization_id, calendar_id, timezone")
    .not("calendar_id", "is", null);

  if (organizationId) {
    settingsQuery = settingsQuery.eq("organization_id", organizationId);
  }

  const { data: calendarSettings, error: settingsError } = await settingsQuery;

  if (settingsError) {
    return NextResponse.json({ ok: false, error: "Calendar settings query failed" }, { status: 500 });
  }

  const summaries: SyncSummary[] = [];

  for (const settings of calendarSettings ?? []) {
    if (!settings.calendar_id) {
      continue;
    }

    summaries.push(
      await syncOrganizationCalendar({
        organizationId: settings.organization_id,
        calendarId: settings.calendar_id,
        timezone: settings.timezone,
        from,
        to,
      })
    );
  }

  return NextResponse.json({
    ok: true,
    from: from.toISOString(),
    to: to.toISOString(),
    calendars: summaries,
  });
}

async function syncOrganizationCalendar(input: {
  organizationId: string;
  calendarId: string;
  timezone: string;
  from: Date;
  to: Date;
}): Promise<SyncSummary> {
  const supabase = getSupabaseServiceClient();
  const events = await listGoogleCalendarEvents({
    calendarId: input.calendarId,
    timeMin: input.from,
    timeMax: input.to,
    timeZone: input.timezone,
  });
  const summary: SyncSummary = {
    organizationId: input.organizationId,
    calendarId: input.calendarId,
    imported: 0,
    updated: 0,
    skipped: 0,
  };

  for (const event of events) {
    const appointmentId = event.privateProperties.aiReceptionistAppointmentId;
    const payload = {
      organization_id: input.organizationId,
      status: "confirmed",
      title: event.summary ?? "Google Calendar event",
      starts_at: event.startsAt.toISOString(),
      ends_at: event.endsAt.toISOString(),
      timezone: input.timezone,
      location: event.location,
      notes: event.description,
      google_calendar_event_id: event.id,
    };

    const existing = appointmentId
      ? await findAppointmentById(input.organizationId, appointmentId)
      : await findAppointmentByGoogleEventId(input.organizationId, event.id);
    const existingByGoogleEventId = existing ?? (await findAppointmentByGoogleEventId(input.organizationId, event.id));

    if (existingByGoogleEventId) {
      const { error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", existingByGoogleEventId.id);

      if (error) {
        console.error("Google appointment update failed", { eventId: event.id, error });
        summary.skipped += 1;
      } else {
        summary.updated += 1;
      }

      continue;
    }

    const { error } = await supabase.from("appointments").insert(payload);

    if (error) {
      console.error("Google appointment import failed", { eventId: event.id, error });
      summary.skipped += 1;
    } else {
      summary.imported += 1;
    }
  }

  return summary;
}

async function findAppointmentById(organizationId: string, appointmentId: string) {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("appointments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", appointmentId)
    .maybeSingle();

  return data;
}

async function findAppointmentByGoogleEventId(organizationId: string, googleCalendarEventId: string) {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("appointments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("google_calendar_event_id", googleCalendarEventId)
    .maybeSingle();

  return data;
}

function isAuthorizedSyncRequest(request: Request): boolean {
  const expectedSecret = process.env.CALENDAR_SYNC_SECRET;

  if (!expectedSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-calendar-sync-secret");
  const suppliedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : headerSecret;

  if (!suppliedSecret) {
    return false;
  }

  return constantTimeEqual(suppliedSecret, expectedSecret);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function parseDateParam(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
