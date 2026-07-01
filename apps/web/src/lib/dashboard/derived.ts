import type { Database } from "@/types/database";

type DateLike = string | Date | null | undefined;
type UnknownRecord = Record<string, unknown>;

export type DashboardStructuredData = unknown;

export type DashboardCallInput = {
  id: string;
  callerNumber?: string | null;
  caller_number?: string | null;
  customerName?: string | null;
  customer_name?: string | null;
  startedAt?: DateLike;
  started_at?: DateLike;
  createdAt?: DateLike;
  created_at?: DateLike;
  status?: string | null;
  disposition?: string | null;
  summary?: string | null;
  structuredData?: DashboardStructuredData | null;
  structured_data?: DashboardStructuredData | null;
} & UnknownRecord;

export type DashboardAppointmentInput = {
  id: string;
  callId?: string | null;
  call_id?: string | null;
  customerName?: string | null;
  customer_name?: string | null;
  customerPhone?: string | null;
  customer_phone?: string | null;
  startsAt?: DateLike;
  starts_at?: DateLike;
  endsAt?: DateLike;
  ends_at?: DateLike;
  createdAt?: DateLike;
  created_at?: DateLike;
  updatedAt?: DateLike;
  updated_at?: DateLike;
  status?: string | null;
  title?: string | null;
  serviceType?: string | null;
  service_type?: string | null;
  notes?: string | null;
} & UnknownRecord;

export type DashboardDerivationInput = {
  calls: DashboardCallInput[];
  appointments: DashboardAppointmentInput[];
};

export type DashboardDerivationOptions = {
  now?: DateLike;
};

type AssertAssignable<T extends DashboardCallInput> = T;
export type SupabaseCallRowDashboardInputCompatibility = AssertAssignable<
  Database["public"]["Tables"]["calls"]["Row"]
>;

export type DashboardInboxItemType = "human_requested" | "needs_confirmation";
export type DashboardInboxItemPriority = "high" | "medium" | "low";

export type DashboardInboxItem = {
  id: string;
  type: DashboardInboxItemType;
  priority: DashboardInboxItemPriority;
  title: string;
  detail: string;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string | null;
  source: "call" | "appointment";
  sourceId: string;
};

export type DashboardCustomerNextAppointment = {
  id: string;
  startsAt: string;
  status: string;
  serviceType: string;
};

export type DashboardCustomer = {
  id: string;
  name: string;
  phone: string;
  totalAppointments: number;
  tags: string[];
  status: string;
  nextAppointment: DashboardCustomerNextAppointment | null;
  lastInteractionLabel: string;
};

export type DashboardBookingFunnel = {
  calls: number;
  qualifiedInteractions: number;
  calendarRelevantRequests: number;
  bookings: number;
};

export type BookingFunnel = DashboardBookingFunnel;

export type DashboardAssistantHealthInput = {
  assistantConnected?: boolean;
  calendarConnected?: boolean;
  phoneNumberConnected?: boolean;
  webhookHealthy?: boolean;
  pendingHumanRequests?: number;
  pendingConfirmations?: number;
  lastSyncError?: string | null;
};

export type AssistantHealthStatus = "healthy" | "warning" | "error";

export type DashboardAssistantHealth = {
  status: AssistantHealthStatus;
  label: string;
  detail: string;
};

export type AssistantHealth = DashboardAssistantHealth;

type CustomerAccumulator = {
  id: string;
  name: string | null;
  phone: string;
  serviceTags: string[];
  serviceTagSet: Set<string>;
  appointments: DashboardAppointmentInput[];
  callDates: string[];
  appointmentDates: string[];
  needsHuman: boolean;
  needsConfirmation: boolean;
};

const BOOKING_STATUSES = new Set(["booked", "confirmed", "requested", "scheduled", "completed"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "отказан", "отказана"]);
const UNCERTAIN_STATUSES = new Set(["unknown", "uncertain", "needs_confirmation", "pending_confirmation", "неясен"]);

export function deriveInboxItems(input: DashboardDerivationInput): DashboardInboxItem[] {
  const items: DashboardInboxItem[] = [];

  for (const call of input.calls) {
    const structuredData = getCallStructuredData(call);
    const nextAction = readLower(readFromRecord(structuredData, ["next_action", "nextAction"]));

    if (nextAction === "needs_human") {
      items.push({
        id: `call:${call.id}:human_requested`,
        type: "human_requested",
        priority: "high",
        title: "Клиентът поиска човек",
        detail: readString(call.summary) ?? "Клиентът поиска разговор с човек.",
        customerName: getCallCustomerName(call),
        customerPhone: getCallDisplayPhone(call),
        createdAt: getCallTimestamp(call),
        source: "call",
        sourceId: call.id,
      });
    }

    if (callNeedsConfirmation(call)) {
      items.push({
        id: `call:${call.id}:needs_confirmation`,
        type: "needs_confirmation",
        priority: "medium",
        title: "Нужно е потвърждение",
        detail: readString(call.summary) ?? "Асистентът не е сигурен какво поиска клиентът.",
        customerName: getCallCustomerName(call),
        customerPhone: getCallDisplayPhone(call),
        createdAt: getCallTimestamp(call),
        source: "call",
        sourceId: call.id,
      });
    }
  }

  for (const appointment of input.appointments) {
    if (!appointmentNeedsConfirmation(appointment)) continue;

    items.push({
      id: `appointment:${appointment.id}:needs_confirmation`,
      type: "needs_confirmation",
      priority: "medium",
      title: "Потвърдете часа",
      detail: readString(appointment.notes) ?? "Часът има неясни или непълни данни.",
      customerName: getAppointmentCustomerName(appointment),
      customerPhone: getAppointmentDisplayPhone(appointment),
      createdAt: getAppointmentTimestamp(appointment),
      source: "appointment",
      sourceId: appointment.id,
    });
  }

  return items.sort(compareInboxItems);
}

export function deriveCustomers(
  input: DashboardDerivationInput,
  options: DashboardDerivationOptions = {}
): DashboardCustomer[] {
  const customers = new Map<string, CustomerAccumulator>();
  const now = options.now ?? new Date();

  for (const call of input.calls) {
    const phone = normalizePhone(getCallDisplayPhone(call));
    if (!phone) continue;

    const customer = getOrCreateCustomer(customers, phone);
    customer.name = customer.name ?? getCallCustomerName(call);
    addServiceTag(customer, getCallServiceType(call));
    customer.needsHuman ||= callNeedsHuman(call);
    customer.needsConfirmation ||= callNeedsConfirmation(call);

    const timestamp = getCallTimestamp(call);
    if (timestamp) customer.callDates.push(timestamp);
  }

  for (const appointment of input.appointments) {
    const phone = normalizePhone(getAppointmentDisplayPhone(appointment));
    if (!phone) continue;

    const customer = getOrCreateCustomer(customers, phone);
    customer.name = customer.name ?? getAppointmentCustomerName(appointment);
    customer.appointments.push(appointment);
    addServiceTag(customer, getAppointmentServiceType(appointment));

    if (appointmentNeedsConfirmation(appointment)) {
      customer.needsConfirmation = true;
    }

    const timestamp = getAppointmentTimestamp(appointment);
    if (timestamp) customer.appointmentDates.push(timestamp);
  }

  return Array.from(customers.values())
    .map((customer) => {
      const nextAppointment = getNextAppointment(customer.appointments, now);
      const tags = [...customer.serviceTags];
      if (customer.needsHuman) tags.push("Иска човек");
      if (customer.needsConfirmation) tags.push("Иска потвърждение");

      return {
        id: customer.id,
        name: customer.name ?? "Без име",
        phone: customer.phone,
        totalAppointments: customer.appointments.length,
        tags,
        status: getCustomerStatus(customer, nextAppointment),
        nextAppointment,
        lastInteractionLabel: getLastInteractionLabel(customer, nextAppointment),
      };
    })
    .sort(compareCustomers);
}

export function calculateBookingFunnel(input: DashboardDerivationInput): DashboardBookingFunnel {
  return {
    calls: input.calls.length,
    qualifiedInteractions: input.calls.filter(isQualifiedInteraction).length,
    calendarRelevantRequests: input.calls.filter(isCalendarRelevantRequest).length,
    bookings: input.appointments.filter(isBooking).length,
  };
}

export function getAssistantHealth(input: DashboardAssistantHealthInput): DashboardAssistantHealth {
  if (input.assistantConnected === false || input.phoneNumberConnected === false) {
    return {
      status: "error",
      label: "Има проблем",
      detail: "Асистентът или телефонният номер не са свързани.",
    };
  }

  if (input.webhookHealthy === false) {
    return {
      status: "warning",
      label: "Проверете webhook",
      detail: "Последните събития от асистента не пристигат нормално.",
    };
  }

  if (input.calendarConnected === false || input.lastSyncError) {
    return {
      status: "warning",
      label: "Календарът има нужда от внимание",
      detail: input.lastSyncError ?? "Календарът не е свързан.",
    };
  }

  if ((input.pendingHumanRequests ?? 0) > 0 || (input.pendingConfirmations ?? 0) > 0) {
    return {
      status: "warning",
      label: "Има задачи за преглед",
      detail: "Някои разговори или часове чакат потвърждение.",
    };
  }

  return {
    status: "healthy",
    label: "Всичко работи",
    detail: "Асистентът и календарът са свързани.",
  };
}

function getOrCreateCustomer(customers: Map<string, CustomerAccumulator>, phone: string): CustomerAccumulator {
  const existing = customers.get(phone);
  if (existing) return existing;

  const customer: CustomerAccumulator = {
    id: phone,
    name: null,
    phone,
    serviceTags: [],
    serviceTagSet: new Set<string>(),
    appointments: [],
    callDates: [],
    appointmentDates: [],
    needsHuman: false,
    needsConfirmation: false,
  };
  customers.set(phone, customer);
  return customer;
}

function addServiceTag(customer: CustomerAccumulator, serviceType: string | null): void {
  if (!serviceType || customer.serviceTagSet.has(serviceType)) return;
  customer.serviceTagSet.add(serviceType);
  customer.serviceTags.push(serviceType);
}

function callNeedsHuman(call: DashboardCallInput): boolean {
  const structuredData = getCallStructuredData(call);
  return readLower(readFromRecord(structuredData, ["next_action", "nextAction"])) === "needs_human";
}

function callNeedsConfirmation(call: DashboardCallInput): boolean {
  const structuredData = getCallStructuredData(call);
  const status = readLower(call.status);
  const disposition = readLower(call.disposition);
  const nextAction = readLower(readFromRecord(structuredData, ["next_action", "nextAction"]));
  const confidence = readFromRecord(structuredData, ["confidence", "confidence_score", "confidenceScore"]);

  if (nextAction === "needs_confirmation") return true;
  if (UNCERTAIN_STATUSES.has(status) || UNCERTAIN_STATUSES.has(disposition)) return true;
  if (readBoolean(readFromRecord(structuredData, ["needs_confirmation", "needsConfirmation", "uncertain"]))) return true;

  const confidenceNumber = readNumber(confidence);
  if (confidenceNumber !== null && confidenceNumber < 0.6) return true;

  const confidenceText = readLower(confidence);
  return confidenceText === "low" || confidenceText === "uncertain";
}

function appointmentNeedsConfirmation(appointment: DashboardAppointmentInput): boolean {
  const status = readLower(appointment.status);
  return UNCERTAIN_STATUSES.has(status) || !getAppointmentDisplayPhone(appointment) || !getAppointmentCustomerName(appointment);
}

function isQualifiedInteraction(call: DashboardCallInput): boolean {
  const structuredData = getCallStructuredData(call);
  const disposition = readLower(call.disposition);

  if (readBoolean(readFromRecord(structuredData, ["qualified", "is_qualified", "isQualified"]))) return true;
  if (["lead", "qualified", "appointment", "booked", "support"].includes(disposition)) return true;

  return Boolean(getCallDisplayPhone(call) && (getCallCustomerName(call) || getCallServiceType(call) || readString(call.summary)));
}

function isCalendarRelevantRequest(call: DashboardCallInput): boolean {
  const structuredData = getCallStructuredData(call);
  const disposition = readLower(call.disposition);
  const nextAction = readLower(readFromRecord(structuredData, ["next_action", "nextAction"]));

  if (["appointment", "booked", "booking", "calendar"].includes(disposition)) return true;
  if (["book_appointment", "schedule", "schedule_appointment", "calendar", "needs_calendar"].includes(nextAction)) return true;

  return Boolean(
    readFromRecord(structuredData, [
      "preferred_time",
      "preferredTime",
      "preferred_time_text",
      "preferredTimeText",
      "requested_time",
      "requestedTime",
    ])
  );
}

export function isBooking(appointment: DashboardAppointmentInput): boolean {
  return BOOKING_STATUSES.has(readLower(appointment.status)) && !CANCELLED_STATUSES.has(readLower(appointment.status));
}

function getNextAppointment(
  appointments: DashboardAppointmentInput[],
  nowValue: DateLike
): DashboardCustomerNextAppointment | null {
  const now = toDate(nowValue);
  const candidates = appointments
    .filter((appointment) => !CANCELLED_STATUSES.has(readLower(appointment.status)))
    .map((appointment) => ({ appointment, startsAt: getAppointmentStart(appointment), date: toDate(getAppointmentStart(appointment)) }))
    .filter((candidate): candidate is { appointment: DashboardAppointmentInput; startsAt: string; date: Date } =>
      Boolean(candidate.startsAt && candidate.date && (!now || candidate.date.getTime() >= now.getTime()))
    )
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  const next = candidates[0];
  if (!next) return null;

  return {
    id: next.appointment.id,
    startsAt: next.startsAt,
    status: formatAppointmentStatus(next.appointment.status),
    serviceType: getAppointmentServiceType(next.appointment) ?? readString(next.appointment.title) ?? "Час",
  };
}

function getCustomerStatus(
  customer: CustomerAccumulator,
  nextAppointment: DashboardCustomerNextAppointment | null
): string {
  if (nextAppointment && nextAppointment.status === "Потвърден") return "Има записан час";
  if (customer.appointments.some((appointment) => readLower(appointment.status) === "requested")) return "Чака потвърждение";
  if (customer.needsHuman || customer.needsConfirmation) return "Нуждае се от внимание";
  if (nextAppointment) return "Има заявен час";
  return "Нов клиент";
}

function getLastInteractionLabel(
  customer: CustomerAccumulator,
  nextAppointment: DashboardCustomerNextAppointment | null
): string {
  const lastCall = latestDate(customer.callDates);
  const lastAppointment = latestDate(customer.appointmentDates);
  if (lastCall && dateTime(lastCall) >= dateTime(lastAppointment)) {
    return `Последно обаждане: ${formatDateTime(lastCall)}`;
  }

  if (lastAppointment) return `Последна промяна: ${formatDateTime(lastAppointment)}`;

  if (nextAppointment) return `Следващ час: ${formatDateTime(nextAppointment.startsAt)}`;
  return "Няма активност";
}

function compareInboxItems(left: DashboardInboxItem, right: DashboardInboxItem): number {
  const priorityOrder: Record<DashboardInboxItemPriority, number> = { high: 0, medium: 1, low: 2 };
  const priorityDifference = priorityOrder[left.priority] - priorityOrder[right.priority];
  if (priorityDifference !== 0) return priorityDifference;
  return dateTime(right.createdAt) - dateTime(left.createdAt);
}

function compareCustomers(left: DashboardCustomer, right: DashboardCustomer): number {
  const leftDate = dateTime(readCustomerSortableDate(left));
  const rightDate = dateTime(readCustomerSortableDate(right));
  if (leftDate !== rightDate) return rightDate - leftDate;
  return left.name.localeCompare(right.name, "bg-BG");
}

function readCustomerSortableDate(customer: DashboardCustomer): string | null {
  return customer.nextAppointment?.startsAt ?? null;
}

function getCallStructuredData(call: DashboardCallInput): UnknownRecord {
  const camelCaseData = asRecord(call.structuredData);
  if (Object.keys(camelCaseData).length > 0) return camelCaseData;
  return asRecord(call.structured_data);
}

function getCallCustomerName(call: DashboardCallInput): string | null {
  const structuredData = getCallStructuredData(call);
  return (
    readString(call.customerName) ??
    readString(call.customer_name) ??
    readString(readFromRecord(structuredData, ["customerName", "customer_name", "name"]))
  );
}

function getCallDisplayPhone(call: DashboardCallInput): string | null {
  const structuredData = getCallStructuredData(call);
  return (
    readString(call.callerNumber) ??
    readString(call.caller_number) ??
    readString(readFromRecord(structuredData, ["customerPhone", "customer_phone", "phone"]))
  );
}

function getCallServiceType(call: DashboardCallInput): string | null {
  const structuredData = getCallStructuredData(call);
  return readString(readFromRecord(structuredData, ["serviceType", "service_type", "service", "request_type", "requestType"]));
}

function getCallTimestamp(call: DashboardCallInput): string | null {
  return readDateLike(call.startedAt, call.started_at, call.createdAt, call.created_at);
}

function getAppointmentCustomerName(appointment: DashboardAppointmentInput): string | null {
  return readString(appointment.customerName) ?? readString(appointment.customer_name);
}

function getAppointmentDisplayPhone(appointment: DashboardAppointmentInput): string | null {
  return readString(appointment.customerPhone) ?? readString(appointment.customer_phone);
}

function getAppointmentServiceType(appointment: DashboardAppointmentInput): string | null {
  return readString(appointment.serviceType) ?? readString(appointment.service_type) ?? readString(appointment.title);
}

function getAppointmentTimestamp(appointment: DashboardAppointmentInput): string | null {
  return readDateLike(appointment.createdAt, appointment.created_at, appointment.updatedAt, appointment.updated_at, getAppointmentStart(appointment));
}

function getAppointmentStart(appointment: DashboardAppointmentInput): string | null {
  return readDateLike(appointment.startsAt, appointment.starts_at);
}

function formatAppointmentStatus(status: unknown): string {
  switch (readLower(status)) {
    case "booked":
    case "confirmed":
    case "scheduled":
      return "Потвърден";
    case "requested":
    case "pending":
    case "pending_confirmation":
      return "Чака потвърждение";
    case "completed":
      return "Завършен";
    case "cancelled":
    case "canceled":
      return "Отказан";
    case "unknown":
    case "uncertain":
      return "Неясен";
    default:
      return "Няма статус";
  }
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function readFromRecord(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readLower(value: unknown): string {
  return readString(value)?.toLowerCase() ?? "";
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = readLower(value);
  return text === "true" || text === "yes" || text === "1";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = readString(value);
  if (!text) return null;

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function readDateLike(...values: unknown[]): string | null {
  for (const value of values) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }

  return null;
}

function toDate(value: unknown): Date | null {
  const dateLike = readDateLike(value);
  if (!dateLike) return null;

  const date = new Date(dateLike);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTime(value: string | null): number {
  return toDate(value)?.getTime() ?? 0;
}

function latestDate(values: string[]): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!latest) return value;
    return dateTime(value) > dateTime(latest) ? value : latest;
  }, null);
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[\s().-]/g, "");
  if (normalized.startsWith("00")) return `+${normalized.slice(2)}`;
  return normalized;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
