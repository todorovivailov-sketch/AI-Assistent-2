import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "src", "lib", "dashboard", "derived.ts");

if (!existsSync(sourcePath)) {
  throw new Error(`Missing dashboard derivation module: ${sourcePath}`);
}

const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const {
  calculateBookingFunnel,
  deriveCustomers,
  deriveInboxItems,
  getAssistantHealth,
} = await import(moduleUrl);

const calls = [
  {
    id: "call-human",
    callerNumber: "+359 88 123 4567",
    startedAt: "2026-06-28T08:15:00.000Z",
    disposition: "lead",
    summary: "Клиентът поиска разговор с човек.",
    structuredData: {
      customer_name: "Иван Петров",
      service_type: "Консултация",
      next_action: "needs_human",
      qualified: true,
    },
  },
  {
    id: "call-uncertain",
    callerNumber: "+359 88 123 4567",
    startedAt: "2026-06-28T09:05:00.000Z",
    disposition: "unknown",
    summary: "Асистентът не е сигурен какво поиска клиентът.",
    structuredData: {
      customer_name: "Иван Петров",
      service_type: "Консултация",
      confidence: "low",
      next_action: "needs_confirmation",
    },
  },
  {
    id: "call-calendar",
    callerNumber: "+359 89 222 3333",
    startedAt: "2026-06-28T10:30:00.000Z",
    disposition: "appointment",
    summary: "Клиентът поиска свободен час.",
    structuredData: {
      customer_name: "Мария Георгиева",
      service_type: "Оглед",
      preferred_time_text: "утре следобед",
      qualified: true,
    },
  },
];

const appointments = [
  {
    id: "appointment-confirmed",
    customerName: "Иван Петров",
    customerPhone: "+359881234567",
    serviceType: "Консултация",
    status: "confirmed",
    startsAt: "2026-06-30T07:00:00.000Z",
    endsAt: "2026-06-30T07:30:00.000Z",
    createdAt: "2026-06-28T09:30:00.000Z",
  },
  {
    id: "appointment-requested",
    customerName: "Иван Петров",
    customerPhone: "+359 88 123 4567",
    serviceType: "Последващ разговор",
    status: "requested",
    startsAt: "2026-07-02T08:00:00.000Z",
    endsAt: "2026-07-02T08:30:00.000Z",
    createdAt: "2026-06-28T09:35:00.000Z",
  },
  {
    id: "appointment-uncertain",
    customerName: "Мария Георгиева",
    customerPhone: "+359892223333",
    serviceType: "Оглед",
    status: "unknown",
    startsAt: null,
    endsAt: null,
    createdAt: "2026-06-28T11:00:00.000Z",
  },
];

const inboxItems = deriveInboxItems({ calls, appointments });

assert.deepEqual(
  inboxItems.find((item) => item.sourceId === "call-human"),
  {
    id: "call:call-human:human_requested",
    type: "human_requested",
    priority: "high",
    title: "Клиентът поиска човек",
    detail: "Клиентът поиска разговор с човек.",
    customerName: "Иван Петров",
    customerPhone: "+359 88 123 4567",
    createdAt: "2026-06-28T08:15:00.000Z",
    source: "call",
    sourceId: "call-human",
  },
  "calls with next_action needs_human should create high-priority human inbox items"
);

assert.equal(
  inboxItems.some((item) => item.sourceId === "call-uncertain" && item.type === "needs_confirmation"),
  true,
  "uncertain calls should create needs_confirmation inbox items"
);

assert.equal(
  inboxItems.some((item) => item.sourceId === "appointment-uncertain" && item.type === "needs_confirmation"),
  true,
  "unknown appointments should create needs_confirmation inbox items"
);

const customers = deriveCustomers({ calls, appointments });
const ivan = customers.find((customer) => customer.phone === "+359881234567");

assert.deepEqual(
  ivan,
  {
    id: "+359881234567",
    name: "Иван Петров",
    phone: "+359881234567",
    totalAppointments: 2,
    tags: ["Консултация", "Последващ разговор", "Иска човек", "Иска потвърждение"],
    status: "Има записан час",
    nextAppointment: {
      id: "appointment-confirmed",
      startsAt: "2026-06-30T07:00:00.000Z",
      status: "Потвърден",
      serviceType: "Консултация",
    },
    lastInteractionLabel: "Последно обаждане: 28.06.2026 г., 12:05",
  },
  "customers should be grouped by normalized phone with appointments, tags, status, next appointment, and last interaction"
);

assert.deepEqual(
  calculateBookingFunnel({ calls, appointments }),
  {
    calls: 3,
    qualifiedInteractions: 3,
    calendarRelevantRequests: 1,
    bookings: 2,
  },
  "funnel should count calls, qualified interactions, calendar-relevant requests, and bookings"
);

assert.deepEqual(
  getAssistantHealth({
    assistantConnected: true,
    calendarConnected: true,
    phoneNumberConnected: true,
    webhookHealthy: true,
  }),
  {
    status: "healthy",
    label: "Всичко работи",
    detail: "Асистентът и календарът са свързани.",
  },
  "healthy assistant should return the requested Bulgarian status strings"
);

console.log("dashboard derivation checks passed");
