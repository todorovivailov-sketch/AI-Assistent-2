import {
  calculateBookingFunnel,
  deriveCustomers,
  deriveInboxItems,
  getAssistantHealth,
  type DashboardAppointmentInput,
  type DashboardAssistantHealth,
  type DashboardBookingFunnel,
  type DashboardCallInput,
  type DashboardCustomer,
  type DashboardInboxItem,
} from "@/lib/dashboard/derived";
import { getCalendarAppointments, type CalendarAppointment } from "@/lib/live-data";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database, Json } from "@/types/database";

type JsonRecord = Record<string, Json | undefined>;
type CallsRow = Pick<
  Database["public"]["Tables"]["calls"]["Row"],
  "id" | "caller_number" | "disposition" | "status" | "started_at" | "created_at" | "duration_seconds" | "summary" | "structured_data"
>;

export type DashboardConversation = DashboardCallInput & {
  id: string;
  caller: string;
  callerNumber: string | null;
  startedAt: string | null;
  createdAt: string;
  durationSeconds: number | null;
  outcome: string;
  outcomeLabel: string;
  statusLabel: string;
  customerName: string | null;
  serviceType: string | null;
  summaryPreview: string;
  structuredData: JsonRecord;
  structured_data: Json;
};

export type DashboardAppointmentRecord = DashboardAppointmentInput & {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  serviceType: string | null;
  location: string | null;
  notes: string | null;
  hasGoogleEvent: boolean;
};

export type DashboardAppointmentListItem = Omit<DashboardAppointmentRecord, "customerName" | "serviceType"> & {
  customerName: string;
  serviceType: string;
};

export type DashboardAssistantStatus = {
  assistantId: string | null;
  assistantName: string;
  assistantConnected: boolean;
  assistantStatus: string;
  model: string;
  voiceProvider: string;
  calendarConnected: boolean;
  calendarProvider: string;
  calendarId: string | null;
  bookingEnabled: boolean;
  webhookHealthy: boolean;
  webhookEvents24h: number;
  webhookProvider: string | null;
  lastWebhookReceivedAt: string | null;
  toolCalls24h: number;
  toolErrors24h: number;
};

export type CommandCenterData = {
  metrics: {
    calls24h: number;
    appointmentsToday: number;
    attentionItems: number;
    bookingRate: number;
  };
  inboxItems: DashboardInboxItem[];
  nextAppointments: DashboardAppointmentListItem[];
  funnel: DashboardBookingFunnel;
  health: DashboardAssistantHealth;
  assistantStatus: DashboardAssistantStatus;
};

export type ReportsData = {
  funnel: DashboardBookingFunnel;
  totals: {
    calls: number;
    bookings: number;
    qualifiedInteractions: number;
    calendarRelevantRequests: number;
    averageDurationSeconds: number;
    totalDurationSeconds: number;
    bookingRate: number;
  };
  outcomes: Record<string, number>;
  services: Record<string, number>;
};

const DASHBOARD_LOOKBACK_DAYS = 14;
const APPOINTMENT_LOOKAHEAD_DAYS = 30;
const MISSING_NAME_LABEL = "Без име";
const MISSING_PHONE_LABEL = "Няма телефон";
const MISSING_SERVICE_LABEL = "Обща заявка";
const MISSING_SUMMARY_LABEL = "Няма резюме.";

export async function getCommandCenterData(): Promise<CommandCenterData> {
  const [calls, appointments, assistantStatus, calls24h] = await Promise.all([
    getDashboardCalls(80),
    getDashboardAppointments(80),
    getAssistantStatus(),
    getCallsCountSince(daysFromNow(-1)),
  ]);

  const inboxItems = deriveInboxItems({ calls, appointments });
  const funnel = calculateBookingFunnel({ calls, appointments });
  const health = getAssistantHealth({
    assistantConnected: assistantStatus.assistantConnected,
    calendarConnected: assistantStatus.calendarConnected,
    webhookHealthy: assistantStatus.webhookHealthy,
    pendingHumanRequests: inboxItems.filter((item) => item.type === "human_requested").length,
    pendingConfirmations: inboxItems.filter((item) => item.type === "needs_confirmation").length,
  });

  return {
    metrics: {
      calls24h,
      appointmentsToday: appointments.filter(isAppointmentToday).length,
      attentionItems: inboxItems.length,
      bookingRate: getBookingRate(funnel),
    },
    inboxItems: inboxItems.slice(0, 5),
    nextAppointments: getNextAppointments(appointments, 5),
    funnel,
    health,
    assistantStatus,
  };
}

export async function getInboxData(): Promise<DashboardInboxItem[]> {
  const [calls, appointments] = await Promise.all([getDashboardCalls(100), getDashboardAppointments(100)]);
  return deriveInboxItems({ calls, appointments });
}

export async function getCustomersData(): Promise<DashboardCustomer[]> {
  const [calls, appointments] = await Promise.all([getDashboardCalls(200), getDashboardAppointments(200)]);
  return deriveCustomers({ calls, appointments });
}

export async function getConversationsData(limit = 50): Promise<DashboardConversation[]> {
  return getDashboardCalls(limit);
}

export async function getReportsData(): Promise<ReportsData> {
  const [calls, appointments] = await Promise.all([getDashboardCalls(200), getDashboardAppointments(200)]);
  const funnel = calculateBookingFunnel({ calls, appointments });
  const totalDurationSeconds = calls.reduce((sum, call) => sum + (call.durationSeconds ?? 0), 0);

  return {
    funnel,
    totals: {
      calls: funnel.calls,
      bookings: funnel.bookings,
      qualifiedInteractions: funnel.qualifiedInteractions,
      calendarRelevantRequests: funnel.calendarRelevantRequests,
      averageDurationSeconds: average(calls.map((call) => call.durationSeconds)),
      totalDurationSeconds,
      bookingRate: getBookingRate(funnel),
    },
    outcomes: countBy(calls.map((call) => call.outcomeLabel)),
    services: countBy([
      ...appointments.map((appointment) => appointment.serviceType),
      ...calls.map((call) => call.serviceType),
    ]),
  };
}

export async function getAssistantOverviewData(): Promise<DashboardAssistantStatus> {
  return getAssistantStatus();
}

async function getDashboardCalls(limit: number): Promise<DashboardConversation[]> {
  const supabase = getSupabaseServiceClient();
  const since = daysFromNow(-DASHBOARD_LOOKBACK_DAYS).toISOString();
  const { data, error } = await supabase
    .from("calls")
    .select("id, caller_number, disposition, status, started_at, created_at, duration_seconds, summary, structured_data")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));

  if (error) {
    logSupabaseError("Dashboard calls query failed", error);
    return [];
  }

  return (data ?? []).map(toDashboardConversation);
}

async function getDashboardAppointments(limit: number): Promise<DashboardAppointmentRecord[]> {
  const start = daysFromNow(-DASHBOARD_LOOKBACK_DAYS);
  const end = daysFromNow(APPOINTMENT_LOOKAHEAD_DAYS);

  try {
    const appointments = await getCalendarAppointments(start, end);
    return appointments.slice(0, clampLimit(limit)).map(toDashboardAppointment);
  } catch (error) {
    logUnknownError("Dashboard appointments query failed", error);
    return [];
  }
}

async function getCallsCountSince(since: Date): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const { count, error } = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());

  if (error) {
    logSupabaseError("Dashboard calls count failed", error);
    return 0;
  }

  return count ?? 0;
}

async function getAssistantStatus(): Promise<DashboardAssistantStatus> {
  const supabase = getSupabaseServiceClient();
  const since24h = daysFromNow(-1).toISOString();
  const [assistantResult, calendarResult, webhookResult] = await Promise.all([
    supabase.from("assistants").select("id, name, status, model, voice_provider").limit(1).maybeSingle(),
    supabase.from("calendar_settings").select("provider, calendar_id, booking_enabled").limit(1).maybeSingle(),
    supabase
      .from("webhook_events")
      .select("provider, event_type, received_at", { count: "exact" })
      .gte("received_at", since24h)
      .order("received_at", { ascending: false })
      .limit(500),
  ]);

  if (assistantResult.error) logSupabaseError("Assistant status query failed", assistantResult.error);
  if (calendarResult.error) logSupabaseError("Calendar settings query failed", calendarResult.error);
  if (webhookResult.error) logSupabaseError("Webhook events query failed", webhookResult.error);

  const assistant = assistantResult.error ? null : assistantResult.data;
  const calendar = calendarResult.error ? null : calendarResult.data;
  const webhookEvents = webhookResult.error ? [] : webhookResult.data ?? [];
  const latestWebhook = webhookEvents[0] ?? null;

  return {
    assistantId: assistant?.id ?? null,
    assistantName: assistant?.name ?? "AI асистент",
    assistantConnected: assistant?.status === "active",
    assistantStatus: assistant?.status ?? "missing",
    model: assistant?.model ?? "неизвестен",
    voiceProvider: assistant?.voice_provider ?? "неизвестен",
    calendarConnected: Boolean(calendar?.booking_enabled && calendar.calendar_id),
    calendarProvider: calendar?.provider ?? "няма календар",
    calendarId: calendar?.calendar_id ?? null,
    bookingEnabled: calendar?.booking_enabled ?? false,
    webhookHealthy: !webhookResult.error,
    webhookEvents24h: webhookResult.error ? 0 : webhookResult.count ?? webhookEvents.length,
    webhookProvider: latestWebhook?.provider ?? null,
    lastWebhookReceivedAt: latestWebhook?.received_at ?? null,
    toolCalls24h: webhookEvents.filter((event) => includesLower(event.event_type, "tool")).length,
    toolErrors24h: webhookEvents.filter(isErrorWebhookEvent).length,
  };
}

function toDashboardConversation(call: CallsRow): DashboardConversation {
  const structuredData = asRecord(call.structured_data);
  const outcome = normalizeKey(call.disposition ?? call.status) ?? "unknown";
  const startedAt = call.started_at ?? call.created_at;
  const customerName = readStringFromRecord(structuredData, ["customerName", "customer_name", "name"]);
  const serviceType = readStringFromRecord(structuredData, ["serviceType", "service_type", "service", "request_type", "requestType"]);

  return {
    id: call.id,
    caller: call.caller_number ?? "Няма номер",
    callerNumber: call.caller_number,
    caller_number: call.caller_number,
    customerName,
    customer_name: customerName,
    serviceType,
    startedAt,
    started_at: call.started_at,
    createdAt: call.created_at,
    created_at: call.created_at,
    durationSeconds: call.duration_seconds,
    duration_seconds: call.duration_seconds,
    disposition: call.disposition,
    status: call.status,
    outcome,
    outcomeLabel: formatOutcomeLabel(outcome),
    statusLabel: formatStatusLabel(call.status),
    summary: call.summary,
    summaryPreview: call.summary ?? MISSING_SUMMARY_LABEL,
    structuredData,
    structured_data: call.structured_data,
  };
}

function toDashboardAppointment(appointment: CalendarAppointment): DashboardAppointmentRecord {
  const customerName = nullIfFallback(appointment.customerName, MISSING_NAME_LABEL);
  const customerPhone = nullIfFallback(appointment.customerPhone, MISSING_PHONE_LABEL);
  const serviceType = nullIfFallback(appointment.serviceType, MISSING_SERVICE_LABEL);
  const location = nullIfFallback(appointment.location, "Няма адрес");

  return {
    id: appointment.id,
    title: appointment.title,
    startsAt: appointment.startsAt,
    starts_at: appointment.startsAt,
    endsAt: appointment.endsAt,
    ends_at: appointment.endsAt,
    status: appointment.status,
    customerName,
    customer_name: customerName,
    customerPhone,
    customer_phone: customerPhone,
    serviceType,
    service_type: serviceType,
    location,
    notes: appointment.notes || null,
    hasGoogleEvent: appointment.hasGoogleEvent,
  };
}

function getNextAppointments(appointments: DashboardAppointmentRecord[], limit: number): DashboardAppointmentListItem[] {
  const now = Date.now();

  return appointments
    .filter((appointment) => appointment.startsAt && dateTime(appointment.startsAt) >= now && !isCancelledStatus(appointment.status))
    .sort((left, right) => dateTime(left.startsAt) - dateTime(right.startsAt))
    .slice(0, limit)
    .map((appointment) => ({
      ...appointment,
      customerName: appointment.customerName ?? MISSING_NAME_LABEL,
      serviceType: appointment.serviceType ?? appointment.title ?? MISSING_SERVICE_LABEL,
    }));
}

function isAppointmentToday(appointment: DashboardAppointmentRecord): boolean {
  return Boolean(appointment.startsAt && isToday(appointment.startsAt) && !isCancelledStatus(appointment.status));
}

function getBookingRate(funnel: DashboardBookingFunnel): number {
  return funnel.calls > 0 ? Math.round((funnel.bookings / funnel.calls) * 100) : 0;
}

function average(values: Array<number | null | undefined>): number {
  const validValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (validValues.length === 0) return 0;
  return Math.round(validValues.reduce((sum, value) => sum + value, 0) / validValues.length);
}

function countBy(values: Array<string | null | undefined>): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => {
    const key = readDisplayString(value) ?? "Неуточнено";
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

function asRecord(value: Json): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readStringFromRecord(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = readDisplayString(record[key]);
    if (value) return value;
  }
  return null;
}

function readDisplayString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function nullIfFallback(value: string | null, fallback: string): string | null {
  const text = readDisplayString(value);
  return text && text !== fallback ? text : null;
}

function normalizeKey(value: string | null): string | null {
  const text = readDisplayString(value);
  return text ? text.toLowerCase() : null;
}

function formatOutcomeLabel(value: string): string {
  switch (value) {
    case "appointment":
    case "booked":
    case "booking":
      return "Записан час";
    case "lead":
    case "qualified":
      return "Квалифициран разговор";
    case "support":
      return "Информационен разговор";
    case "wrong_number":
      return "Грешен номер";
    case "spam":
      return "Спам";
    case "failed_booking":
    case "failed":
      return "Неуспешен запис";
    case "completed":
      return "Завършен разговор";
    case "unknown":
      return "Неясен резултат";
    default:
      return value;
  }
}

function formatStatusLabel(value: string): string {
  switch (normalizeKey(value)) {
    case "active":
      return "Активен";
    case "completed":
      return "Завършен";
    case "failed":
      return "Неуспешен";
    case "queued":
      return "На опашка";
    case "unknown":
      return "Неясен";
    default:
      return value;
  }
}

function isCancelledStatus(status: string | null | undefined): boolean {
  const key = normalizeKey(status ?? null);
  return key === "cancelled" || key === "canceled" || key === "отказан" || key === "отказана";
}

function isErrorWebhookEvent(event: { event_type: string }): boolean {
  return includesLower(event.event_type, "error") || includesLower(event.event_type, "fail");
}

function includesLower(value: string, search: string): boolean {
  return value.toLowerCase().includes(search);
}

function isToday(value: string): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date(value)) === formatter.format(new Date());
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function dateTime(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

function logSupabaseError(message: string, error: { message?: string }): void {
  console.error(`${message}: ${error.message ?? "unknown error"}`);
}

function logUnknownError(message: string, error: unknown): void {
  console.error(`${message}: ${error instanceof Error ? error.message : "unknown error"}`);
}
