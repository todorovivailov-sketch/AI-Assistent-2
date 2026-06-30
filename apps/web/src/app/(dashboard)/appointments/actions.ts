"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganization } from "@/lib/auth/organization";
import {
  buildAppointmentValuesFromForm,
  parseAppointmentStatus,
  parseAppointmentTimes,
} from "@/lib/crm/appointment-form";
import { updateGoogleCalendarEvent } from "@/lib/google/calendar";
import { createClient } from "@/lib/supabase/server";

// Mutations use the RLS session client (members can insert/update appointments).
export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateAppointment(appointmentId: string, formData: FormData): Promise<ActionResult> {
  // A reschedule always rewrites BOTH starts_at and ends_at together (the DB enforces
  // ends_at > starts_at), so we recompute both from the form every time.
  const times = parseAppointmentTimes(formData.get("date"), formData.get("time"), 60, formData.get("end_time"));
  if (times.error) return { ok: false, error: times.error };

  const title = String(formData.get("title") ?? "").trim();
  const status = parseAppointmentStatus(formData.get("status")) ?? "rescheduled";
  const location = String(formData.get("location") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const supabase = await createClient();

  // Read the current row (RLS-scoped) for the GCal event id, timezone, and fallback title.
  const { data: current } = await supabase
    .from("appointments")
    .select("google_calendar_event_id, timezone, title")
    .eq("id", appointmentId)
    .maybeSingle();

  const finalTitle = title || current?.title || "Час";

  const { error } = await supabase
    .from("appointments")
    .update({
      title: finalTitle,
      starts_at: times.startsAt,
      ends_at: times.endsAt,
      status,
      location: location || null,
      notes: notes || null,
    })
    .eq("id", appointmentId);
  if (error) return { ok: false, error: error.message };

  // Best-effort Google Calendar write-back. No-ops when GCal is off or no event exists.
  if (current?.google_calendar_event_id && times.startsAt && times.endsAt) {
    try {
      await updateGoogleCalendarEvent({
        calendarId: null,
        eventId: current.google_calendar_event_id,
        summary: finalTitle,
        location: location || null,
        startsAt: new Date(times.startsAt),
        endsAt: new Date(times.endsAt),
        timeZone: current.timezone ?? "Europe/Sofia",
      });
    } catch (gcalError) {
      console.error("GCal update failed (non-fatal):", gcalError);
    }
  }

  revalidatePath("/appointments");
  return { ok: true };
}

export async function createAppointment(formData: FormData): Promise<ActionResult> {
  const organization = await getActiveOrganization();
  if (!organization) return { ok: false, error: "no_org" };

  const { error: formError, values } = buildAppointmentValuesFromForm(formData, organization.id);
  if (formError || !values) return { ok: false, error: formError ?? "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.from("appointments").insert(values);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return { ok: true };
}
