import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { createGoogleCalendarEvent, listGoogleCalendarEvents } from "@/lib/google/calendar";
import type { OrganizationResolution, VapiMessage } from "@/lib/vapi/payload";

type JsonRecord = Record<string, unknown>;

type ToolCall = {
  id: string;
  name: string;
  parameters: JsonRecord;
};

type CalendarSettings = {
  provider: string;
  calendarId: string | null;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  timezone: string;
};

type TimeParts = {
  hour: number;
  minute: number;
};

type WorkingWindow = {
  opensAt: TimeParts;
  closesAt: TimeParts;
};

type AppointmentWindow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
};

const defaultCalendarSettings: CalendarSettings = {
  provider: "manual",
  calendarId: null,
  slotMinutes: 60,
  bufferMinutes: 15,
  minNoticeMinutes: 120,
  timezone: "Europe/Sofia",
};

export async function handleVapiToolCalls(
  message: VapiMessage,
  resolution: OrganizationResolution | null
) {
  const toolCalls = getToolCalls(message);

  if (toolCalls.length === 0) {
    return {
      results: [
        {
          toolCallId: "unknown",
          result: "Не получих валидна заявка към календарния инструмент.",
        },
      ],
    };
  }

  const results = await Promise.all(
    toolCalls.map(async (toolCall) => ({
      toolCallId: toolCall.id,
      result: await executeCalendarTool(toolCall, resolution),
    }))
  );

  return { results };
}

async function executeCalendarTool(toolCall: ToolCall, resolution: OrganizationResolution | null) {
  try {
    if (toolCall.name === "check_availability") {
      return await checkAvailability(toolCall.parameters, resolution);
    }

    if (toolCall.name === "book_appointment") {
      return await bookAppointment(toolCall.parameters, resolution);
    }

    return `Непознат календарен инструмент: ${toolCall.name}.`;
  } catch (error) {
    console.error("Calendar tool failed", { toolName: toolCall.name, error });
    return "В момента не успях да проверя календара. Кажете на клиента, че екипът ще върне обаждане за потвърждение.";
  }
}

async function checkAvailability(parameters: JsonRecord, resolution: OrganizationResolution | null) {
  const organizationId = await getOrganizationId(resolution);
  const settings = await getCalendarSettings(organizationId);
  const dateText = readString(parameters.date) ?? readString(parameters.day);
  const durationMinutes =
    readNumber(parameters.durationMinutes) ?? readNumber(parameters.duration_minutes) ?? settings.slotMinutes;

  if (!dateText) {
    return "Попитай клиента за конкретна дата, за да проверя свободните часове.";
  }

  const date = parseDateOnly(dateText);

  if (!date) {
    return "Не разбрах датата. Попитай клиента за дата във формат ден и месец.";
  }

  const slots = await findAvailableSlots(organizationId, date, durationMinutes, settings);

  if (slots.length === 0) {
    return `Няма свободни часове за ${formatSofiaDate(date)}. Предложи на клиента друг ден.`;
  }

  const spokenSlots = slots.slice(0, 5).map((slot) => formatSofiaTime(slot.start));

  return `Свободни часове за ${formatSofiaDate(date)}: ${spokenSlots.join(", ")}. Предложи един от тези часове.`;
}

async function bookAppointment(parameters: JsonRecord, resolution: OrganizationResolution | null) {
  const organizationId = await getOrganizationId(resolution);
  const settings = await getCalendarSettings(organizationId);
  const durationMinutes =
    readNumber(parameters.durationMinutes) ?? readNumber(parameters.duration_minutes) ?? settings.slotMinutes;
  const startsAt = parseAppointmentStart(parameters);

  if (!startsAt) {
    return "Не получих точна дата и час за записване. Попитай клиента за конкретен ден и час.";
  }

  const available = await isSlotAvailable(organizationId, startsAt, durationMinutes, settings);

  if (!available) {
    return `Часът ${formatSofiaDateTime(startsAt)} вече не е свободен. Провери свободните часове отново и предложи друг слот.`;
  }

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const customerName = readString(parameters.customerName) ?? readString(parameters.customer_name) ?? readString(parameters.name);
  const customerPhone =
    normalizePhone(readString(parameters.customerPhone)) ??
    normalizePhone(readString(parameters.customer_phone)) ??
    normalizePhone(readString(parameters.phone));
  const serviceType =
    readString(parameters.serviceType) ?? readString(parameters.service_type) ?? readString(parameters.service) ?? "Оглед";
  const location = readString(parameters.location) ?? readString(parameters.address);
  const notes = readString(parameters.notes) ?? readString(parameters.description);
  const title = `${serviceType}${customerName ? ` - ${customerName}` : ""}`;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      status: "confirmed",
      title,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      timezone: settings.timezone,
      location: location ?? null,
      customer_name: customerName ?? null,
      customer_phone: customerPhone ?? null,
      service_type: serviceType,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Appointment insert failed", error);
    return "Не успях да запиша часа в календара. Кажи на клиента, че екипът ще потвърди по телефона.";
  }

  let googleCalendarEventId: string | null = null;

  try {
    const googleEvent = await createGoogleCalendarEvent({
      calendarId: settings.calendarId,
      organizationId,
      appointmentId: data.id,
      summary: title,
      description: buildGoogleEventDescription({
        customerName,
        customerPhone,
        serviceType,
        notes,
      }),
      location: location ?? null,
      startsAt,
      endsAt,
      timeZone: settings.timezone,
    });

    if (googleEvent) {
      googleCalendarEventId = googleEvent.id;
      const { error: googleEventUpdateError } = await supabase
        .from("appointments")
        .update({ google_calendar_event_id: googleEvent.id })
        .eq("id", data.id);

      if (googleEventUpdateError) {
        console.error("Google Calendar event id update failed", googleEventUpdateError);
      }
    }
  } catch (googleError) {
    console.error("Google Calendar event create failed", googleError);
  }

  const syncText = googleCalendarEventId ? " Часът е синхронизиран и с Google Calendar." : "";

  return `Записах час за ${formatSofiaDateTime(startsAt)}. Номер на записа: ${data.id}.${syncText} Потвърди на клиента, че заявката е записана.`;
}

async function findAvailableSlots(
  organizationId: string,
  date: Date,
  durationMinutes: number,
  settings: CalendarSettings
) {
  const workingWindows = await getWorkingWindows(organizationId, date);
  const dayStart = fromSofiaLocalDateTime(date, 0, 0);
  const dayEnd = fromSofiaLocalDateTime(date, 23, 59);
  const existing = await getAppointmentsForWindow(organizationId, dayStart, dayEnd, durationMinutes, settings);
  const nowWithNotice = new Date(Date.now() + settings.minNoticeMinutes * 60 * 1000);
  const slots: Array<{ start: Date; end: Date }> = [];

  for (const window of workingWindows) {
    let cursor = fromSofiaLocalDateTime(date, window.opensAt.hour, window.opensAt.minute);
    const close = fromSofiaLocalDateTime(date, window.closesAt.hour, window.closesAt.minute);

    while (cursor.getTime() + durationMinutes * 60 * 1000 <= close.getTime()) {
      const end = new Date(cursor.getTime() + durationMinutes * 60 * 1000);

      if (cursor >= nowWithNotice && !hasConflict(existing, cursor, end, settings.bufferMinutes)) {
        slots.push({ start: cursor, end });
      }

      cursor = new Date(cursor.getTime() + settings.slotMinutes * 60 * 1000);
    }
  }

  return slots;
}

async function isSlotAvailable(
  organizationId: string,
  startsAt: Date,
  durationMinutes: number,
  settings: CalendarSettings
) {
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const dateParts = getSofiaDateParts(startsAt);
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  const slots = await findAvailableSlots(organizationId, date, durationMinutes, settings);

  return slots.some((slot) => slot.start.getTime() === startsAt.getTime() && slot.end.getTime() === endsAt.getTime());
}

async function getOrganizationId(resolution: OrganizationResolution | null) {
  if (resolution?.organizationId) {
    return resolution.organizationId;
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "demo-hvac-company")
    .single();

  if (error || !data) {
    throw new Error("Could not resolve organization for calendar tool.");
  }

  return data.id;
}

async function getCalendarSettings(organizationId: string): Promise<CalendarSettings> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("calendar_settings")
    .select("provider, calendar_id, slot_minutes, buffer_minutes, min_notice_minutes, timezone")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return {
    provider: data?.provider ?? defaultCalendarSettings.provider,
    calendarId: data?.calendar_id ?? defaultCalendarSettings.calendarId,
    slotMinutes: data?.slot_minutes ?? defaultCalendarSettings.slotMinutes,
    bufferMinutes: data?.buffer_minutes ?? defaultCalendarSettings.bufferMinutes,
    minNoticeMinutes: data?.min_notice_minutes ?? defaultCalendarSettings.minNoticeMinutes,
    timezone: data?.timezone ?? defaultCalendarSettings.timezone,
  };
}

async function getWorkingWindows(organizationId: string, date: Date): Promise<WorkingWindow[]> {
  const weekday = getSofiaWeekday(date);
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("business_hours")
    .select("opens_at, closes_at, is_closed")
    .eq("organization_id", organizationId)
    .eq("weekday", weekday)
    .maybeSingle();

  if (data?.is_closed) {
    return [];
  }

  if (data?.opens_at && data.closes_at) {
    const opensAt = parseTime(data.opens_at);
    const closesAt = parseTime(data.closes_at);

    if (!opensAt || !closesAt) {
      return [];
    }

    return [
      {
        opensAt,
        closesAt,
      },
    ];
  }

  if (weekday === 0 || weekday === 6) {
    return [];
  }

  return [
    {
      opensAt: { hour: 9, minute: 0 },
      closesAt: { hour: 17, minute: 0 },
    },
  ];
}

async function getAppointmentsForWindow(
  organizationId: string,
  startsAt: Date,
  endsAt: Date,
  fallbackDurationMinutes: number,
  settings: CalendarSettings
): Promise<AppointmentWindow[]> {
  const [appAppointments, googleAppointments] = await Promise.all([
    getSupabaseAppointmentsForWindow(organizationId, startsAt, endsAt, fallbackDurationMinutes),
    getGoogleAppointmentsForWindow(settings, startsAt, endsAt),
  ]);

  return [...appAppointments, ...googleAppointments];
}

async function getSupabaseAppointmentsForWindow(
  organizationId: string,
  startsAt: Date,
  endsAt: Date,
  fallbackDurationMinutes: number
): Promise<AppointmentWindow[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, starts_at, ends_at")
    .eq("organization_id", organizationId)
    .in("status", ["requested", "confirmed"])
    .gte("starts_at", startsAt.toISOString())
    .lt("starts_at", endsAt.toISOString());

  if (error || !data) {
    console.error("Could not load appointment conflicts", error);
    return [];
  }

  return data
    .filter((appointment) => appointment.starts_at)
    .map((appointment) => {
      const start = new Date(appointment.starts_at as string);
      const end = appointment.ends_at
        ? new Date(appointment.ends_at)
        : new Date(start.getTime() + fallbackDurationMinutes * 60 * 1000);

      return {
        id: appointment.id,
        startsAt: start,
        endsAt: end,
      };
    });
}

async function getGoogleAppointmentsForWindow(
  settings: CalendarSettings,
  startsAt: Date,
  endsAt: Date
): Promise<AppointmentWindow[]> {
  try {
    const googleEvents = await listGoogleCalendarEvents({
      calendarId: settings.calendarId,
      timeMin: startsAt,
      timeMax: endsAt,
      timeZone: settings.timezone,
    });

    return googleEvents.map((event) => ({
      id: `google:${event.id}`,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    }));
  } catch (error) {
    console.error("Could not load Google Calendar conflicts", error);
    return [];
  }
}

function buildGoogleEventDescription(input: {
  customerName: string | null;
  customerPhone: string | null;
  serviceType: string;
  notes: string | null;
}) {
  return [
    "Записано от AI Receptionist.",
    input.customerName ? `Клиент: ${input.customerName}` : null,
    input.customerPhone ? `Телефон: ${input.customerPhone}` : null,
    input.serviceType ? `Услуга: ${input.serviceType}` : null,
    input.notes ? `Бележки: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function hasConflict(existing: AppointmentWindow[], start: Date, end: Date, bufferMinutes: number) {
  const bufferedStart = new Date(start.getTime() - bufferMinutes * 60 * 1000);
  const bufferedEnd = new Date(end.getTime() + bufferMinutes * 60 * 1000);

  return existing.some(
    (appointment) => appointment.startsAt < bufferedEnd && appointment.endsAt > bufferedStart
  );
}

function getToolCalls(message: VapiMessage): ToolCall[] {
  const payloadMessage = asRecord(message.payload.message);
  const list = Array.isArray(payloadMessage.toolCallList) ? payloadMessage.toolCallList : [];

  return list
    .map((item) => asRecord(item))
    .map((item) => ({
      id: readString(item.id) ?? "unknown",
      name: readString(item.name) ?? "unknown",
      parameters: asRecord(item.parameters),
    }));
}

function parseAppointmentStart(parameters: JsonRecord): Date | null {
  const startsAt = readString(parameters.startsAt) ?? readString(parameters.starts_at) ?? readString(parameters.datetime);

  if (startsAt) {
    const parsed = new Date(startsAt);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  const date = parseDateOnly(readString(parameters.date));
  const time = parseTime(readString(parameters.time) ?? "");

  if (!date || !time) {
    return null;
  }

  return fromSofiaLocalDateTime(date, time.hour, time.minute);
}

function parseDateOnly(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function fromSofiaLocalDateTime(date: Date, hour: number, minute: number) {
  const parts = getUtcDateParts(date);
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute));
  const sofia = getSofiaDateParts(guess);
  const desiredPseudoUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute);
  const actualPseudoUtc = Date.UTC(sofia.year, sofia.month - 1, sofia.day, sofia.hour, sofia.minute);
  const offset = actualPseudoUtc - desiredPseudoUtc;

  return new Date(guess.getTime() - offset);
}

function getUtcDateParts(value: Date) {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function getSofiaDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour ?? 0),
    minute: Number(map.minute ?? 0),
  };
}

function getSofiaWeekday(value: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Sofia",
    weekday: "short",
  }).format(value);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[weekday] ?? 1;
}

function formatSofiaDate(value: Date) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(value);
}

function formatSofiaTime(value: Date) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatSofiaDateTime(value: Date) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function normalizePhone(value: string | null) {
  if (!value) return null;
  const compact = value.replace(/[^\d+]/g, "");

  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.startsWith("359")) return `+${compact}`;
  if (compact.startsWith("0")) return `+359${compact.slice(1)}`;

  return value;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
