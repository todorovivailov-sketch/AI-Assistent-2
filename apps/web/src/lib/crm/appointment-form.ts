// Pure, framework-free validation + FormData->row mapping for appointments.
// No DB, no Next imports -> unit-testable via the transpile/data-URL pattern.

export const APPOINTMENT_STATUSES = [
  "requested",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export function parseAppointmentStatus(value: unknown): AppointmentStatus | null {
  return typeof value === "string" && (APPOINTMENT_STATUSES as readonly string[]).includes(value)
    ? (value as AppointmentStatus)
    : null;
}

type FormLike = { get(name: string): unknown };

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// Convert a wall-clock date+time in a given IANA zone to a UTC ISO string, DST-aware.
// The server runs in UTC (Vercel), so `new Date("...T09:00")` would store the wrong
// instant. We guess by treating the wall time as UTC, look up the zone's real offset
// at that instant, then correct. Accurate except inside the ~1h DST transition window
// (irrelevant for business-hours bookings).
export function zonedWallClockToUtcISO(
  date: string,
  time: string,
  timeZone = "Europe/Sofia"
): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guessUtcMs = Date.UTC(y, mo - 1, d, h, mi);
  if (!Number.isFinite(guessUtcMs)) return null;
  const offsetMs = timeZoneOffsetMs(timeZone, guessUtcMs);
  return new Date(guessUtcMs - offsetMs).toISOString();
}

function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtcMs = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return asUtcMs - utcMs;
}

export function parseAppointmentTimes(
  date: unknown,
  time: unknown,
  durationMinutes = 60,
  endTime?: unknown,
  timeZone = "Europe/Sofia"
): { error?: string; startsAt: string | null; endsAt: string | null } {
  const d = text(date);
  const t = text(time) ?? "09:00";
  if (!d || !DATE_RE.test(d)) return { error: "start_required", startsAt: null, endsAt: null };
  if (!TIME_RE.test(t)) return { error: "start_invalid", startsAt: null, endsAt: null };

  const startsAt = zonedWallClockToUtcISO(d, t, timeZone);
  if (!startsAt) return { error: "start_invalid", startsAt: null, endsAt: null };
  const startMs = new Date(startsAt).getTime();

  const et = text(endTime);
  let endsAt: string | null;
  if (et && TIME_RE.test(et)) {
    endsAt = zonedWallClockToUtcISO(d, et, timeZone);
  } else {
    endsAt = new Date(startMs + durationMinutes * 60_000).toISOString();
  }
  if (!endsAt) return { error: "end_invalid", startsAt, endsAt: null };
  if (new Date(endsAt).getTime() <= startMs) return { error: "end_before_start", startsAt, endsAt: null };

  return { startsAt, endsAt };
}

export type AppointmentValues = {
  organization_id: string;
  status: AppointmentStatus;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  service_type: string | null;
  location: string | null;
  notes: string | null;
};

export function buildAppointmentValuesFromForm(
  form: FormLike,
  organizationId: string,
  timeZone = "Europe/Sofia"
): { error?: string; values: AppointmentValues | null } {
  const title = text(form.get("title"));
  if (!title) return { error: "title_required", values: null };

  const times = parseAppointmentTimes(form.get("date"), form.get("time"), 60, form.get("end_time"), timeZone);
  if (times.error) return { error: times.error, values: null };

  return {
    error: undefined,
    values: {
      organization_id: organizationId,
      status: parseAppointmentStatus(form.get("status")) ?? "confirmed",
      title,
      starts_at: times.startsAt,
      ends_at: times.endsAt,
      customer_name: text(form.get("customer_name")),
      customer_phone: text(form.get("customer_phone")),
      service_type: text(form.get("service_type")),
      location: text(form.get("location")),
      notes: text(form.get("notes")),
    },
  };
}
