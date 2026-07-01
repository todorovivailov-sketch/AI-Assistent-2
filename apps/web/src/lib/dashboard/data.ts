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
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type JsonRecord = Record<string, Json | undefined>;
type CallsRow = Pick<
  Database["public"]["Tables"]["calls"]["Row"],
  | "id"
  | "caller_number"
  | "disposition"
  | "status"
  | "started_at"
  | "created_at"
  | "duration_seconds"
  | "summary"
  | "structured_data"
  | "recording_url"
  | "transcript"
>;
type AppointmentsRow = Pick<
  Database["public"]["Tables"]["appointments"]["Row"],
  | "id"
  | "call_id"
  | "vapi_call_id"
  | "title"
  | "starts_at"
  | "ends_at"
  | "status"
  | "customer_name"
  | "customer_phone"
  | "service_type"
  | "location"
  | "notes"
  | "google_calendar_event_id"
  | "created_at"
  | "updated_at"
>;
type LeadsRow = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  | "id"
  | "name"
  | "phone"
  | "email"
  | "city"
  | "service_type"
  | "urgency"
  | "status"
  | "source"
  | "notes"
  | "ai_summary"
  | "preferred_time_text"
  | "created_at"
>;

type DashboardOrganization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
};

type CustomerStatusKey = "active" | "requested" | "needs_confirmation" | "new";

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
  recordingUrl: string | null;
  transcriptText: string | null;
};

export type DashboardAppointmentRecord = DashboardAppointmentInput & {
  id: string;
  callId: string | null;
  call_id: string | null;
  vapiCallId: string | null;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  serviceType: string | null;
  location: string | null;
  notes: string | null;
  hasGoogleEvent: boolean;
};

export type DashboardAppointmentListItem = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  customerName: string;
  customerPhone: string | null;
  serviceType: string;
  location: string | null;
  notes: string | null;
  hasGoogleEvent: boolean;
  transcriptText: string | null;
  recordingUrl: string | null;
};

export type DashboardLeadListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  serviceType: string | null;
  urgency: string | null;
  status: string;
  source: string;
  notes: string | null;
  aiSummary: string | null;
  preferredTimeText: string | null;
  createdAt: string;
};

export type DashboardInboxListItem = DashboardInboxItem & {
  customerLabel: string;
  phone: string;
  appointmentTime: string | null;
  sourceHref: string;
};

export type DashboardCustomerListItem = DashboardCustomer & {
  statusKey: CustomerStatusKey;
  statusLabel: string;
  nextAppointmentAt: string | null;
  nextAppointmentStatus: string | null;
};

export type DashboardAssistantStatus = {
  organizationId: string | null;
  organizationName: string;
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
  inboxItems: DashboardInboxListItem[];
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
    booked: number;
    qualifiedInteractions: number;
    qualified: number;
    calendarRelevantRequests: number;
    calendarChecked: number;
    averageDurationSeconds: number;
    totalDurationSeconds: number;
    bookingRate: number;
  };
  outcomes: Record<string, number>;
  services: Record<string, number>;
};

const DASHBOARD_LOOKBACK_DAYS = 14;
const APPOINTMENT_LOOKAHEAD_DAYS = 30;
const DASHBOARD_CALL_SELECT =
  "id, caller_number, disposition, status, started_at, created_at, duration_seconds, summary, structured_data, recording_url, transcript";
const DASHBOARD_APPOINTMENT_SELECT =
  "id, call_id, vapi_call_id, title, starts_at, ends_at, status, customer_name, customer_phone, service_type, location, notes, google_calendar_event_id, created_at, updated_at";
const DASHBOARD_LEAD_SELECT =
  "id, name, phone, email, city, service_type, urgency, status, source, notes, ai_summary, preferred_time_text, created_at";
const MISSING_NAME_LABEL = "Без име";
const MISSING_PHONE_LABEL = "Няма телефон";
const MISSING_SERVICE_LABEL = "Обща заявка";
const MISSING_SUMMARY_LABEL = "Няма резюме.";

export async function getCommandCenterData(): Promise<CommandCenterData> {
  const organization = await getDashboardOrganization();
  if (!organization) return getEmptyCommandCenterData();

  const since = daysFromNow(-DASHBOARD_LOOKBACK_DAYS);
  const now = new Date();
  const [calls, operationalAppointments, reportingAppointments, assistantStatus, calls24h] = await Promise.all([
    getDashboardCalls(organization.id, 80, { since }),
    getOperationalAppointments(organization.id, 100),
    getReportingAppointments(organization.id, 200, since, now),
    getAssistantStatus(organization),
    getCallsCountSince(organization.id, daysFromNow(-1)),
  ]);

  const inboxItems = toInboxListItems(
    deriveInboxItems({ calls, appointments: operationalAppointments }),
    operationalAppointments
  );
  const funnel = calculateBookingFunnel({ calls, appointments: reportingAppointments });
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
      appointmentsToday: operationalAppointments.filter(isAppointmentToday).length,
      attentionItems: inboxItems.length,
      bookingRate: getBookingRate(funnel),
    },
    inboxItems: inboxItems.slice(0, 5),
    nextAppointments: getNextAppointments(operationalAppointments, 5),
    funnel,
    health,
    assistantStatus,
  };
}

export async function getInboxData(): Promise<DashboardInboxListItem[]> {
  const organization = await getDashboardOrganization();
  if (!organization) return [];

  const [calls, appointments] = await Promise.all([
    getDashboardCalls(organization.id, 100, { since: daysFromNow(-DASHBOARD_LOOKBACK_DAYS) }),
    getOperationalAppointments(organization.id, 100),
  ]);

  return toInboxListItems(deriveInboxItems({ calls, appointments }), appointments);
}

export async function getCustomersData(): Promise<DashboardCustomerListItem[]> {
  const organization = await getDashboardOrganization();
  if (!organization) return [];

  const [calls, appointments] = await Promise.all([
    getDashboardCalls(organization.id, 200, { since: daysFromNow(-DASHBOARD_LOOKBACK_DAYS) }),
    getOperationalAppointments(organization.id, 200),
  ]);

  return deriveCustomers({ calls, appointments }).map(toCustomerListItem);
}

export async function getConversationsData(limit = 50): Promise<DashboardConversation[]> {
  const organization = await getDashboardOrganization();
  if (!organization) return [];

  return getDashboardCalls(organization.id, limit, { since: daysFromNow(-DASHBOARD_LOOKBACK_DAYS) });
}

export async function getConversationById(callId: string): Promise<DashboardConversation | null> {
  const id = normalizeUuid(callId);
  if (!id) return null;

  const organization = await getDashboardOrganization();
  if (!organization) return null;

  return getDashboardCallById(organization.id, id);
}

export async function getCalendarPageAppointments(
  start: Date,
  end: Date
): Promise<DashboardAppointmentListItem[]> {
  const organization = await getDashboardOrganization();
  if (!organization) return [];

  const appointments = await getDashboardAppointments(organization.id, 100, {
    mode: "operational",
    start,
    end,
    includeUnscheduledSince: daysFromNow(-DASHBOARD_LOOKBACK_DAYS),
  });

  return appointments.map(toAppointmentListItem);
}

export async function getCalendarAppointmentById(
  appointmentId: string
): Promise<DashboardAppointmentListItem | null> {
  const id = normalizeUuid(appointmentId);
  if (!id) return null;

  const organization = await getDashboardOrganization();
  if (!organization) return null;

  const appointment = await getDashboardAppointmentById(organization.id, id);
  if (!appointment) return null;

  const item = toAppointmentListItem(appointment);
  if (!appointment.vapiCallId) return item;

  // Pull the real transcript + recording from the call that booked this appointment.
  const supabase = await createClient();
  const { data: call } = await supabase
    .from("calls")
    .select("transcript, recording_url")
    .eq("organization_id", organization.id)
    .eq("vapi_call_id", appointment.vapiCallId)
    .maybeSingle();

  return {
    ...item,
    transcriptText: call?.transcript ?? null,
    recordingUrl: call?.recording_url ?? null,
  };
}

export async function getLeadsData(limit = 200): Promise<DashboardLeadListItem[]> {
  const organization = await getDashboardOrganization();
  if (!organization) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(DASHBOARD_LEAD_SELECT)
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));

  if (error) {
    logSupabaseError("Dashboard leads query failed", error);
    return [];
  }

  return (data ?? []).map(toLeadListItem);
}

export async function getReportsData(): Promise<ReportsData> {
  const organization = await getDashboardOrganization();
  if (!organization) return getEmptyReportsData();

  const since = daysFromNow(-DASHBOARD_LOOKBACK_DAYS);
  const now = new Date();
  const [calls, appointments] = await Promise.all([
    getDashboardCalls(organization.id, 500, { since, until: now }),
    getReportingAppointments(organization.id, 500, since, now),
  ]);
  const funnel = calculateBookingFunnel({ calls, appointments });
  const totalDurationSeconds = calls.reduce((sum, call) => sum + (call.durationSeconds ?? 0), 0);

  return {
    funnel,
    totals: {
      calls: funnel.calls,
      bookings: funnel.bookings,
      booked: funnel.bookings,
      qualifiedInteractions: funnel.qualifiedInteractions,
      qualified: funnel.qualifiedInteractions,
      calendarRelevantRequests: funnel.calendarRelevantRequests,
      calendarChecked: funnel.calendarRelevantRequests,
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
  const organization = await getDashboardOrganization();
  return organization ? getAssistantStatus(organization) : getEmptyAssistantStatus(null);
}

async function getDashboardOrganization(): Promise<DashboardOrganization | null> {
  // Resolve the org from the signed-in session; RLS then scopes every query below.
  return getActiveOrganization();
}

async function getDashboardCalls(
  organizationId: string,
  limit: number,
  options: { since?: Date; until?: Date } = {}
): Promise<DashboardConversation[]> {
  const supabase = await createClient();
  let query = supabase
    .from("calls")
    .select(DASHBOARD_CALL_SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));

  if (options.since) query = query.gte("created_at", options.since.toISOString());
  if (options.until) query = query.lt("created_at", options.until.toISOString());

  const { data, error } = await query;

  if (error) {
    logSupabaseError("Dashboard calls query failed", error);
    return [];
  }

  return (data ?? []).map(toDashboardConversation);
}

async function getDashboardCallById(
  organizationId: string,
  callId: string
): Promise<DashboardConversation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calls")
    .select(DASHBOARD_CALL_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", callId)
    .maybeSingle();

  if (error) {
    logSupabaseError("Dashboard call detail query failed", error);
    return null;
  }

  return data ? toDashboardConversation(data) : null;
}

async function getOperationalAppointments(
  organizationId: string,
  limit: number
): Promise<DashboardAppointmentRecord[]> {
  const start = daysFromNow(-DASHBOARD_LOOKBACK_DAYS);
  const end = daysFromNow(APPOINTMENT_LOOKAHEAD_DAYS);

  return getDashboardAppointments(organizationId, limit, {
    mode: "operational",
    start,
    end,
    includeUnscheduledSince: start,
  });
}

async function getReportingAppointments(
  organizationId: string,
  limit: number,
  since: Date,
  until: Date
): Promise<DashboardAppointmentRecord[]> {
  return getDashboardAppointments(organizationId, limit, {
    mode: "created",
    start: since,
    end: until,
  });
}

async function getDashboardAppointments(
  organizationId: string,
  limit: number,
  options: {
    mode: "operational" | "created";
    start: Date;
    end: Date;
    includeUnscheduledSince?: Date;
  }
): Promise<DashboardAppointmentRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(DASHBOARD_APPOINTMENT_SELECT)
    .eq("organization_id", organizationId)
    .limit(clampLimit(limit));

  if (options.mode === "created") {
    query = query
      .gte("created_at", options.start.toISOString())
      .lt("created_at", options.end.toISOString())
      .order("created_at", { ascending: false });
  } else {
    const start = options.start.toISOString();
    const end = options.end.toISOString();
    const unscheduledSince = (options.includeUnscheduledSince ?? options.start).toISOString();
    query = query
      .or(`and(starts_at.gte.${start},starts_at.lt.${end}),and(starts_at.is.null,created_at.gte.${unscheduledSince})`)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    logSupabaseError("Dashboard appointments query failed", error);
    return [];
  }

  return (data ?? []).map(toDashboardAppointment);
}

async function getDashboardAppointmentById(
  organizationId: string,
  appointmentId: string
): Promise<DashboardAppointmentRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(DASHBOARD_APPOINTMENT_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    logSupabaseError("Dashboard appointment detail query failed", error);
    return null;
  }

  return data ? toDashboardAppointment(data) : null;
}

async function getCallsCountSince(organizationId: string, since: Date): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", since.toISOString());

  if (error) {
    logSupabaseError("Dashboard calls count failed", error);
    return 0;
  }

  return count ?? 0;
}

async function getAssistantStatus(organization: DashboardOrganization): Promise<DashboardAssistantStatus> {
  const supabase = await createClient();
  const since24h = daysFromNow(-1).toISOString();
  const [assistantResult, calendarResult, latestWebhookResult, webhookCountResult, toolCallsResult, toolErrorsResult] =
    await Promise.all([
      supabase
        .from("assistants")
        .select("id, name, status, model, voice_provider")
        .eq("organization_id", organization.id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("calendar_settings")
        .select("provider, calendar_id, booking_enabled")
        .eq("organization_id", organization.id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("webhook_events")
        .select("provider, event_type, received_at")
        .eq("organization_id", organization.id)
        .gte("received_at", since24h)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .gte("received_at", since24h),
      supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .gte("received_at", since24h)
        .ilike("event_type", "%tool%"),
      supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .gte("received_at", since24h)
        .or("event_type.ilike.%error%,event_type.ilike.%fail%"),
    ]);

  if (assistantResult.error) logSupabaseError("Assistant status query failed", assistantResult.error);
  if (calendarResult.error) logSupabaseError("Calendar settings query failed", calendarResult.error);
  if (latestWebhookResult.error) logSupabaseError("Latest webhook query failed", latestWebhookResult.error);
  if (webhookCountResult.error) logSupabaseError("Webhook count query failed", webhookCountResult.error);
  if (toolCallsResult.error) logSupabaseError("Tool calls count query failed", toolCallsResult.error);
  if (toolErrorsResult.error) logSupabaseError("Tool errors count query failed", toolErrorsResult.error);

  const assistant = assistantResult.error ? null : assistantResult.data;
  const calendar = calendarResult.error ? null : calendarResult.data;
  const latestWebhook = latestWebhookResult.error ? null : latestWebhookResult.data;

  return {
    organizationId: organization.id,
    organizationName: organization.name,
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
    webhookHealthy: !webhookCountResult.error && !latestWebhookResult.error,
    webhookEvents24h: webhookCountResult.count ?? 0,
    webhookProvider: latestWebhook?.provider ?? null,
    lastWebhookReceivedAt: latestWebhook?.received_at ?? null,
    toolCalls24h: toolCallsResult.count ?? 0,
    toolErrors24h: toolErrorsResult.count ?? 0,
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
    recordingUrl: call.recording_url ?? null,
    transcriptText: call.transcript ?? null,
  };
}

function toDashboardAppointment(appointment: AppointmentsRow): DashboardAppointmentRecord {
  const customerName = nullIfFallback(appointment.customer_name, MISSING_NAME_LABEL);
  const customerPhone = nullIfFallback(appointment.customer_phone, MISSING_PHONE_LABEL);
  const serviceType = nullIfFallback(appointment.service_type ?? appointment.title, MISSING_SERVICE_LABEL);
  const location = nullIfFallback(appointment.location, "Няма адрес");

  return {
    id: appointment.id,
    callId: appointment.call_id,
    call_id: appointment.call_id,
    vapiCallId: appointment.vapi_call_id,
    title: appointment.title,
    startsAt: appointment.starts_at,
    starts_at: appointment.starts_at,
    endsAt: appointment.ends_at,
    ends_at: appointment.ends_at,
    createdAt: appointment.created_at,
    created_at: appointment.created_at,
    updatedAt: appointment.updated_at,
    updated_at: appointment.updated_at,
    status: appointment.status,
    customerName,
    customer_name: customerName,
    customerPhone,
    customer_phone: customerPhone,
    serviceType,
    service_type: serviceType,
    location,
    notes: appointment.notes || null,
    hasGoogleEvent: Boolean(appointment.google_calendar_event_id),
  };
}

function toInboxListItems(
  items: DashboardInboxItem[],
  appointments: DashboardAppointmentRecord[]
): DashboardInboxListItem[] {
  const appointmentsById = new Map(appointments.map((appointment) => [appointment.id, appointment]));

  return items.map((item) => {
    const appointment = item.source === "appointment" ? appointmentsById.get(item.sourceId) : null;
    const customerLabel = item.customerName ?? item.customerPhone ?? MISSING_NAME_LABEL;
    const phone = item.customerPhone ?? MISSING_PHONE_LABEL;

    return {
      ...item,
      customerLabel,
      phone,
      appointmentTime: appointment?.startsAt ?? null,
      sourceHref: item.source === "call" ? `/conversations?call=${item.sourceId}` : `/appointments?appointment=${item.sourceId}`,
    };
  });
}

function toCustomerListItem(customer: DashboardCustomer): DashboardCustomerListItem {
  return {
    ...customer,
    statusKey: getCustomerStatusKey(customer),
    statusLabel: customer.status,
    nextAppointmentAt: customer.nextAppointment?.startsAt ?? null,
    nextAppointmentStatus: customer.nextAppointment?.status ?? null,
  };
}

function toAppointmentListItem(appointment: DashboardAppointmentRecord): DashboardAppointmentListItem {
  return {
    id: appointment.id,
    title: appointment.title,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    customerName: appointment.customerName ?? MISSING_NAME_LABEL,
    customerPhone: appointment.customerPhone,
    serviceType: appointment.serviceType ?? appointment.title ?? MISSING_SERVICE_LABEL,
    location: appointment.location,
    notes: appointment.notes,
    hasGoogleEvent: appointment.hasGoogleEvent,
    transcriptText: null,
    recordingUrl: null,
  };
}

function toLeadListItem(lead: LeadsRow): DashboardLeadListItem {
  return {
    id: lead.id,
    name: readDisplayString(lead.name) ?? MISSING_NAME_LABEL,
    phone: readDisplayString(lead.phone),
    email: readDisplayString(lead.email),
    city: readDisplayString(lead.city),
    serviceType: readDisplayString(lead.service_type),
    urgency: readDisplayString(lead.urgency),
    status: readDisplayString(lead.status) ?? "new",
    source: readDisplayString(lead.source) ?? "phone",
    notes: readDisplayString(lead.notes),
    aiSummary: readDisplayString(lead.ai_summary),
    preferredTimeText: readDisplayString(lead.preferred_time_text),
    createdAt: lead.created_at,
  };
}

function getNextAppointments(appointments: DashboardAppointmentRecord[], limit: number): DashboardAppointmentListItem[] {
  const now = Date.now();

  return appointments
    .filter((appointment) => appointment.startsAt && dateTime(appointment.startsAt) >= now && !isCancelledStatus(appointment.status))
    .sort((left, right) => dateTime(left.startsAt) - dateTime(right.startsAt))
    .slice(0, limit)
    .map(toAppointmentListItem);
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

function getCustomerStatusKey(customer: DashboardCustomer): CustomerStatusKey {
  const status = customer.status.toLowerCase();
  if (customer.nextAppointment) return "active";
  if (status.includes("потвърж")) return "requested";
  if (status.includes("внимание") || customer.tags.some((tag) => tag.toLowerCase().includes("потвърж"))) {
    return "needs_confirmation";
  }
  return "new";
}

function getEmptyCommandCenterData(): CommandCenterData {
  const assistantStatus = getEmptyAssistantStatus(null);
  const funnel = getEmptyFunnel();

  return {
    metrics: {
      calls24h: 0,
      appointmentsToday: 0,
      attentionItems: 0,
      bookingRate: 0,
    },
    inboxItems: [],
    nextAppointments: [],
    funnel,
    health: getAssistantHealth({
      assistantConnected: false,
      calendarConnected: false,
      webhookHealthy: false,
    }),
    assistantStatus,
  };
}

function getEmptyReportsData(): ReportsData {
  const funnel = getEmptyFunnel();

  return {
    funnel,
    totals: {
      calls: 0,
      bookings: 0,
      booked: 0,
      qualifiedInteractions: 0,
      qualified: 0,
      calendarRelevantRequests: 0,
      calendarChecked: 0,
      averageDurationSeconds: 0,
      totalDurationSeconds: 0,
      bookingRate: 0,
    },
    outcomes: {},
    services: {},
  };
}

function getEmptyFunnel(): DashboardBookingFunnel {
  return {
    calls: 0,
    qualifiedInteractions: 0,
    calendarRelevantRequests: 0,
    bookings: 0,
  };
}

function getEmptyAssistantStatus(organization: DashboardOrganization | null): DashboardAssistantStatus {
  return {
    organizationId: organization?.id ?? null,
    organizationName: organization?.name ?? "Няма организация",
    assistantId: null,
    assistantName: "AI асистент",
    assistantConnected: false,
    assistantStatus: "missing",
    model: "неизвестен",
    voiceProvider: "неизвестен",
    calendarConnected: false,
    calendarProvider: "няма календар",
    calendarId: null,
    bookingEnabled: false,
    webhookHealthy: false,
    webhookEvents24h: 0,
    webhookProvider: null,
    lastWebhookReceivedAt: null,
    toolCalls24h: 0,
    toolErrors24h: 0,
  };
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

function normalizeUuid(value: string | null | undefined): string | null {
  const text = readDisplayString(value);
  return text && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
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
