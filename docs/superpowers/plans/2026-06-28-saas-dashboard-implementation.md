# SaaS Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard into the approved AI Receptionist SaaS structure: Работно табло, Задачи, Календар, Клиенти, Разговори, Асистент, Отчети, Настройки.

**Architecture:** Keep the existing Next.js App Router and Supabase service-client pattern. Add a focused data derivation layer for dashboard view models so pages do not duplicate business logic. Implement pages incrementally with Bulgarian UI labels and route names in English.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Supabase JS, Lucide icons, existing Vercel deployment.

---

## Scope

This plan implements the generic SaaS MVP UI structure. It does not add authentication, billing, multi-user roles, payments, or a full CRM pipeline.

## File Structure

Create:

- `apps/web/src/lib/dashboard/derived.ts`  
  Pure functions that derive inbox items, customer summaries, funnel metrics, and assistant health labels from plain records.

- `apps/web/scripts/test-dashboard-derived.mjs`  
  Node-based regression test for the pure dashboard derivation functions.

- `apps/web/src/lib/dashboard/data.ts`  
  Supabase-backed data loaders that return page-ready view models and reuse `derived.ts`.

- `apps/web/src/components/metric-card.tsx`  
  Compact metric card used by Command Center and Reports.

- `apps/web/src/components/section-panel.tsx`  
  Reusable panel wrapper for dense operational sections.

- `apps/web/src/app/(dashboard)/inbox/page.tsx`

- `apps/web/src/app/(dashboard)/customers/page.tsx`

- `apps/web/src/app/(dashboard)/conversations/page.tsx`

- `apps/web/src/app/(dashboard)/assistant/page.tsx`

- `apps/web/src/app/(dashboard)/reports/page.tsx`

Modify:

- `apps/web/package.json`  
  Add `test:dashboard` script.

- `apps/web/src/components/app-shell.tsx`  
  Replace navigation and Bulgarian visible labels.

- `apps/web/src/components/status-badge.tsx`  
  Add labels for new statuses: `needs_confirmation`, `human_requested`, `failed_booking`, `reschedule_requested`, `cancel_requested`, `price_follow_up`, `urgent`, `tool_error`, `attention`, `healthy`, `warning`.

- `apps/web/src/app/(dashboard)/page.tsx`  
  Replace Overview with Command Center.

- `apps/web/src/app/(dashboard)/appointments/page.tsx`  
  Keep calendar route for now, but align copy/actions with the new IA.

- `apps/web/src/app/(dashboard)/calls/page.tsx`  
  Convert to a redirect or compatibility wrapper to `/conversations`.

- `apps/web/src/app/(dashboard)/leads/page.tsx`  
  Convert to a redirect or compatibility wrapper to `/customers`.

- `apps/web/src/app/(dashboard)/orders/page.tsx`  
  Remove from primary nav. Keep route as a simple optional Jobs module notice for clients that need post-appointment work management.

- `PROJECT_STATUS.md`  
  Record UI IA implementation status.

---

### Task 1: Add Pure Dashboard Derivation Layer

**Files:**

- Create: `apps/web/src/lib/dashboard/derived.ts`
- Create: `apps/web/scripts/test-dashboard-derived.mjs`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Create the failing test script**

Create `apps/web/scripts/test-dashboard-derived.mjs`:

```js
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
  deriveInboxItems,
  deriveCustomers,
  calculateBookingFunnel,
  getAssistantHealth,
} = await import(moduleUrl);

const calls = [
  {
    id: "call-1",
    caller: "+359899111111",
    startedAt: "2026-06-28T08:00:00.000Z",
    durationSeconds: 95,
    outcome: "appointment",
    summary: "Клиентът поиска консултация.",
    structuredData: {
      name: "Ивайло",
      phone: "+359899111111",
      service_type: "консултация",
      appointment_confirmed: true,
      name_uncertain: false,
    },
  },
  {
    id: "call-2",
    caller: "+359888222222",
    startedAt: "2026-06-28T09:00:00.000Z",
    durationSeconds: 44,
    outcome: "lead",
    summary: "Клиентът поиска човек.",
    structuredData: {
      service_type: "посещение",
      next_action: "needs_human",
    },
  },
  {
    id: "call-3",
    caller: "+359877333333",
    startedAt: "2026-06-28T10:00:00.000Z",
    durationSeconds: 38,
    outcome: "unknown",
    summary: "Няма ясни данни.",
    structuredData: {},
  },
];

const appointments = [
  {
    id: "apt-1",
    startsAt: "2026-06-29T10:00:00.000Z",
    endsAt: "2026-06-29T11:00:00.000Z",
    status: "confirmed",
    customerName: "Ивайло",
    customerPhone: "+359899111111",
    serviceType: "консултация",
    location: "София",
    notes: "",
    hasGoogleEvent: true,
  },
  {
    id: "apt-2",
    startsAt: "2026-06-29T12:00:00.000Z",
    endsAt: "2026-06-29T13:00:00.000Z",
    status: "confirmed",
    customerName: "Без име",
    customerPhone: "+359888222222",
    serviceType: "посещение",
    location: "Няма адрес",
    notes: "Името е несигурно",
    hasGoogleEvent: false,
  },
];

const inboxItems = deriveInboxItems({ calls, appointments });

assert.equal(inboxItems.length, 3, "human request, unknown call, and uncertain appointment should create inbox items");
assert.equal(inboxItems[0].priority, "high", "human request should be high priority");
assert.equal(inboxItems.some((item) => item.type === "needs_confirmation"), true);
assert.equal(inboxItems.some((item) => item.type === "human_requested"), true);

const customers = deriveCustomers({ calls, appointments });

assert.equal(customers.length, 3, "customers should be derived by phone number");
assert.equal(customers[0].phone, "+359899111111");
assert.equal(customers[0].totalAppointments, 1);
assert.equal(customers[0].lastInteractionLabel.length > 0, true);

const funnel = calculateBookingFunnel({ calls, appointments });

assert.deepEqual(
  funnel,
  {
    calls: 3,
    qualified: 2,
    calendarChecked: 2,
    booked: 2,
  },
  "funnel should count calls, qualified interactions, calendar-relevant requests, and bookings"
);

assert.deepEqual(
  getAssistantHealth({
    assistantConnected: true,
    calendarConnected: true,
    toolErrors24h: 0,
    lowConfidenceItems: 0,
  }),
  {
    status: "healthy",
    label: "Всичко работи",
    detail: "Асистентът и календарът са свързани.",
  }
);

console.log("dashboard derivation checks passed");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
cd apps/web
node ./scripts/test-dashboard-derived.mjs
```

Expected: FAIL with `Missing dashboard derivation module`.

- [ ] **Step 3: Implement the pure derivation module**

Create `apps/web/src/lib/dashboard/derived.ts`:

```ts
export type DashboardStructuredData = Record<string, unknown>;

export type DashboardCallInput = {
  id: string;
  caller: string;
  startedAt: string | null;
  durationSeconds: number | null;
  outcome: string;
  summary: string;
  structuredData: DashboardStructuredData;
};

export type DashboardAppointmentInput = {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  location: string;
  notes: string;
  hasGoogleEvent: boolean;
};

export type InboxItemType =
  | "needs_confirmation"
  | "human_requested"
  | "failed_booking"
  | "reschedule_requested"
  | "cancel_requested"
  | "price_follow_up"
  | "urgent"
  | "tool_error";

export type InboxPriority = "high" | "normal" | "low";

export type InboxItem = {
  id: string;
  type: InboxItemType;
  priority: InboxPriority;
  title: string;
  detail: string;
  customerLabel: string;
  phone: string;
  appointmentTime: string | null;
  sourceHref: string;
};

export type CustomerSummary = {
  id: string;
  name: string;
  phone: string;
  lastInteractionLabel: string;
  nextAppointment: string | null;
  totalAppointments: number;
  tags: string[];
  status: string;
};

export type BookingFunnel = {
  calls: number;
  qualified: number;
  calendarChecked: number;
  booked: number;
};

export type AssistantHealthInput = {
  assistantConnected: boolean;
  calendarConnected: boolean;
  toolErrors24h: number;
  lowConfidenceItems: number;
};

export type AssistantHealth = {
  status: "healthy" | "warning" | "attention";
  label: string;
  detail: string;
};

export function deriveInboxItems(input: {
  calls: DashboardCallInput[];
  appointments: DashboardAppointmentInput[];
}): InboxItem[] {
  const items: InboxItem[] = [];

  for (const call of input.calls) {
    const nextAction = readString(call.structuredData.next_action);
    const nameUncertain = call.structuredData.name_uncertain === true;
    const service = readService(call.structuredData);

    if (nextAction === "needs_human") {
      items.push({
        id: `call-human-${call.id}`,
        type: "human_requested",
        priority: "high",
        title: "Клиентът поиска човек",
        detail: call.summary,
        customerLabel: readString(call.structuredData.name) ?? call.caller,
        phone: readString(call.structuredData.phone) ?? call.caller,
        appointmentTime: null,
        sourceHref: `/conversations?call=${call.id}`,
      });
    }

    if (nextAction === "price_follow_up") {
      items.push({
        id: `call-price-${call.id}`,
        type: "price_follow_up",
        priority: "normal",
        title: "Иска цена или оферта",
        detail: call.summary,
        customerLabel: readString(call.structuredData.name) ?? call.caller,
        phone: readString(call.structuredData.phone) ?? call.caller,
        appointmentTime: null,
        sourceHref: `/conversations?call=${call.id}`,
      });
    }

    if (nameUncertain || (call.outcome === "unknown" && !service)) {
      items.push({
        id: `call-unclear-${call.id}`,
        type: "needs_confirmation",
        priority: call.outcome === "unknown" ? "normal" : "low",
        title: "Данните са неясни",
        detail: call.summary,
        customerLabel: readString(call.structuredData.name) ?? call.caller,
        phone: readString(call.structuredData.phone) ?? call.caller,
        appointmentTime: null,
        sourceHref: `/conversations?call=${call.id}`,
      });
    }
  }

  for (const appointment of input.appointments) {
    const missingName = appointment.customerName === "Без име" || appointment.customerName.trim() === "";
    const missingLocation = appointment.location === "Няма адрес" || appointment.location.trim() === "";
    const uncertain = appointment.notes.toLowerCase().includes("несигур");

    if (missingName || uncertain || missingLocation) {
      items.push({
        id: `appointment-confirm-${appointment.id}`,
        type: "needs_confirmation",
        priority: missingName ? "high" : "normal",
        title: "Часът има нужда от потвърждение",
        detail: appointment.serviceType,
        customerLabel: appointment.customerName,
        phone: appointment.customerPhone,
        appointmentTime: appointment.startsAt,
        sourceHref: `/appointments?appointment=${appointment.id}`,
      });
    }
  }

  return items.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority));
}

export function deriveCustomers(input: {
  calls: DashboardCallInput[];
  appointments: DashboardAppointmentInput[];
}): CustomerSummary[] {
  const map = new Map<string, CustomerSummary>();

  for (const call of input.calls) {
    const phone = readString(call.structuredData.phone) ?? call.caller;
    const existing = ensureCustomer(map, phone, readString(call.structuredData.name) ?? phone);
    existing.lastInteractionLabel = formatDateLabel(call.startedAt);
    const service = readService(call.structuredData);
    if (service && !existing.tags.includes(service)) existing.tags.push(service);
  }

  for (const appointment of input.appointments) {
    const existing = ensureCustomer(map, appointment.customerPhone, appointment.customerName);
    existing.totalAppointments += 1;
    existing.nextAppointment = chooseEarlierDate(existing.nextAppointment, appointment.startsAt);
    if (appointment.serviceType && !existing.tags.includes(appointment.serviceType)) {
      existing.tags.push(appointment.serviceType);
    }
    if (appointment.status === "confirmed") existing.status = "active";
  }

  return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name, "bg"));
}

export function calculateBookingFunnel(input: {
  calls: DashboardCallInput[];
  appointments: DashboardAppointmentInput[];
}): BookingFunnel {
  const qualified = input.calls.filter((call) => readService(call.structuredData) || call.outcome !== "unknown").length;
  const calendarChecked = input.calls.filter(
    (call) =>
      call.outcome === "appointment" ||
      readString(call.structuredData.requested_date) ||
      readString(call.structuredData.requested_time)
  ).length;

  return {
    calls: input.calls.length,
    qualified,
    calendarChecked: Math.max(calendarChecked, input.appointments.length),
    booked: input.appointments.filter((appointment) => ["confirmed", "requested"].includes(appointment.status)).length,
  };
}

export function getAssistantHealth(input: AssistantHealthInput): AssistantHealth {
  if (!input.assistantConnected || !input.calendarConnected) {
    return {
      status: "attention",
      label: "Има проблем",
      detail: "Асистентът или календарът не са свързани.",
    };
  }

  if (input.toolErrors24h > 0 || input.lowConfidenceItems > 0) {
    return {
      status: "warning",
      label: "Има нужда от преглед",
      detail: `${input.toolErrors24h} tool грешки и ${input.lowConfidenceItems} неясни разговора за последните 24 часа.`,
    };
  }

  return {
    status: "healthy",
    label: "Всичко работи",
    detail: "Асистентът и календарът са свързани.",
  };
}

function ensureCustomer(map: Map<string, CustomerSummary>, phone: string, name: string) {
  const key = phone || name;
  const existing = map.get(key);

  if (existing) {
    if (existing.name === existing.phone && name !== phone) existing.name = name;
    return existing;
  }

  const customer: CustomerSummary = {
    id: key,
    name,
    phone,
    lastInteractionLabel: "Няма скорошен разговор",
    nextAppointment: null,
    totalAppointments: 0,
    tags: [],
    status: "new",
  };

  map.set(key, customer);
  return customer;
}

function readService(data: DashboardStructuredData) {
  return readString(data.service_type) ?? readString(data.serviceType) ?? readString(data.service);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function priorityRank(priority: InboxPriority) {
  if (priority === "high") return 0;
  if (priority === "normal") return 1;
  return 2;
}

function formatDateLabel(value: string | null) {
  if (!value) return "Няма дата";

  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function chooseEarlierDate(left: string | null, right: string | null) {
  if (!right) return left;
  if (!left) return right;
  return new Date(right).getTime() < new Date(left).getTime() ? right : left;
}
```

- [ ] **Step 4: Add npm test script**

Modify `apps/web/package.json` scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test:availability": "node ./scripts/test-availability-logic.mjs",
  "test:dashboard": "node ./scripts/test-dashboard-derived.mjs"
}
```

- [ ] **Step 5: Run the dashboard test**

Run:

```powershell
cd apps/web
npm run test:dashboard
```

Expected: PASS with `dashboard derivation checks passed`.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git add apps/web/package.json apps/web/scripts/test-dashboard-derived.mjs apps/web/src/lib/dashboard/derived.ts
git commit -m "Add dashboard data derivation helpers"
```

---

### Task 2: Add Supabase Dashboard Data Loaders

**Files:**

- Create: `apps/web/src/lib/dashboard/data.ts`
- Modify: `apps/web/src/lib/live-data.ts`

- [ ] **Step 1: Create dashboard data loader**

Create `apps/web/src/lib/dashboard/data.ts`:

```ts
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";
import {
  calculateBookingFunnel,
  deriveCustomers,
  deriveInboxItems,
  getAssistantHealth,
  type DashboardAppointmentInput,
  type DashboardCallInput,
} from "@/lib/dashboard/derived";
import { getCalendarAppointments } from "@/lib/live-data";

type JsonRecord = Record<string, Json | undefined>;

export async function getCommandCenterData() {
  const [calls, appointments, assistantStatus] = await Promise.all([
    getDashboardCalls(40),
    getUpcomingAppointments(20),
    getAssistantStatus(),
  ]);
  const inboxItems = deriveInboxItems({ calls, appointments });
  const funnel = calculateBookingFunnel({ calls, appointments });
  const health = getAssistantHealth({
    assistantConnected: assistantStatus.assistantConnected,
    calendarConnected: assistantStatus.calendarConnected,
    toolErrors24h: assistantStatus.toolErrors24h,
    lowConfidenceItems: inboxItems.filter((item) => item.type === "needs_confirmation").length,
  });

  return {
    metrics: {
      calls24h: calls.length,
      appointmentsToday: appointments.filter((appointment) => isToday(appointment.startsAt)).length,
      attentionItems: inboxItems.length,
      bookingRate: funnel.calls > 0 ? Math.round((funnel.booked / funnel.calls) * 100) : 0,
    },
    inboxItems: inboxItems.slice(0, 5),
    nextAppointments: appointments.slice(0, 5),
    funnel,
    health,
    assistantStatus,
  };
}

export async function getInboxData() {
  const [calls, appointments] = await Promise.all([getDashboardCalls(80), getUpcomingAppointments(80)]);
  return deriveInboxItems({ calls, appointments });
}

export async function getCustomersData() {
  const [calls, appointments] = await Promise.all([getDashboardCalls(100), getUpcomingAppointments(100)]);
  return deriveCustomers({ calls, appointments });
}

export async function getConversationsData(limit = 50) {
  return getDashboardCalls(limit);
}

export async function getReportsData() {
  const [calls, appointments] = await Promise.all([getDashboardCalls(200), getUpcomingAppointments(200)]);
  const funnel = calculateBookingFunnel({ calls, appointments });

  return {
    funnel,
    totals: {
      calls: calls.length,
      bookings: funnel.booked,
      qualified: funnel.qualified,
      averageDurationSeconds: average(calls.map((call) => call.durationSeconds ?? 0)),
    },
    outcomes: countBy(calls.map((call) => call.outcome)),
    services: countBy(appointments.map((appointment) => appointment.serviceType)),
  };
}

export async function getAssistantOverviewData() {
  return getAssistantStatus();
}

async function getDashboardCalls(limit: number): Promise<DashboardCallInput[]> {
  const supabase = getSupabaseServiceClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("calls")
    .select("id, caller_number, disposition, status, started_at, duration_seconds, summary, structured_data")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Could not load dashboard calls", error);
    return [];
  }

  return data.map((call) => ({
    id: call.id,
    caller: call.caller_number ?? "Няма номер",
    startedAt: call.started_at,
    durationSeconds: call.duration_seconds,
    outcome: call.disposition ?? call.status ?? "unknown",
    summary: call.summary ?? "Няма резюме.",
    structuredData: asRecord(call.structured_data),
  }));
}

async function getUpcomingAppointments(limit: number): Promise<DashboardAppointmentInput[]> {
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const appointments = await getCalendarAppointments(start, end);

  return appointments.slice(0, limit).map((appointment) => ({
    id: appointment.id,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    serviceType: appointment.serviceType,
    location: appointment.location,
    notes: appointment.notes,
    hasGoogleEvent: appointment.hasGoogleEvent,
  }));
}

async function getAssistantStatus() {
  const supabase = getSupabaseServiceClient();
  const [assistantResult, calendarResult, webhookResult] = await Promise.all([
    supabase.from("assistants").select("id, name, status, model, voice_provider").limit(1).maybeSingle(),
    supabase.from("calendar_settings").select("provider, calendar_id, booking_enabled").limit(1).maybeSingle(),
    supabase
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "tool-calls")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const assistant = assistantResult.data;
  const calendar = calendarResult.data;

  return {
    assistantName: assistant?.name ?? "AI Receptionist",
    assistantConnected: assistant?.status === "active",
    model: assistant?.model ?? "неизвестен",
    voiceProvider: assistant?.voice_provider ?? "неизвестен",
    calendarConnected: Boolean(calendar?.booking_enabled && calendar.calendar_id),
    calendarProvider: calendar?.provider ?? "manual",
    toolErrors24h: 0,
    toolCalls24h: webhookResult.count ?? 0,
  };
}

function asRecord(value: Json): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function isToday(value: string | null) {
  if (!value) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date(value)) === formatter.format(new Date());
}

function average(values: number[]) {
  const nonZero = values.filter((value) => value > 0);
  if (nonZero.length === 0) return 0;
  return Math.round(nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length);
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}
```

- [ ] **Step 2: Run TypeScript build**

Run:

```powershell
cd apps/web
npm run build
```

Expected: PASS. If Supabase generated types do not include one of the selected columns, inspect `apps/web/src/types/database.ts` and adjust the query to existing columns only.

- [ ] **Step 3: Commit Task 2**

Run:

```powershell
git add apps/web/src/lib/dashboard/data.ts apps/web/src/lib/live-data.ts
git commit -m "Add dashboard data loaders"
```

---

### Task 3: Restructure App Shell Navigation

**Files:**

- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/status-badge.tsx`

- [ ] **Step 1: Update status badge labels**

Add these entries to `toneMap` in `apps/web/src/components/status-badge.tsx`:

```ts
  needs_confirmation: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  human_requested: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  failed_booking: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  reschedule_requested: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  cancel_requested: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  price_follow_up: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  urgent: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  tool_error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  attention: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  healthy: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
```

Add these entries to `labelMap`:

```ts
  needs_confirmation: "за потвърждение",
  human_requested: "иска човек",
  failed_booking: "неуспешен запис",
  reschedule_requested: "промяна",
  cancel_requested: "отказ",
  price_follow_up: "цена",
  urgent: "спешно",
  tool_error: "грешка",
  attention: "внимание",
  healthy: "работи",
  warning: "преглед",
```

- [ ] **Step 2: Replace sidebar nav items**

In `apps/web/src/components/app-shell.tsx`, replace `navItems` with:

```ts
const navItems = [
  { href: "/", label: "Работно табло", icon: LayoutDashboard },
  { href: "/inbox", label: "Задачи", icon: Inbox },
  { href: "/appointments", label: "Календар", icon: CalendarDays },
  { href: "/customers", label: "Клиенти", icon: Users },
  { href: "/conversations", label: "Разговори", icon: PhoneCall },
  { href: "/assistant", label: "Асистент", icon: Bot },
  { href: "/reports", label: "Отчети", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Настройки", icon: Settings },
];
```

Update the Lucide import:

```ts
import {
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  Inbox,
  LayoutDashboard,
  PhoneCall,
  Settings,
  Users,
  Zap,
} from "lucide-react";
```

- [ ] **Step 3: Update shell brand copy**

In the sidebar brand block, replace:

```tsx
<div className="font-mono text-xs text-[var(--ink-soft)]">Sofia / HVAC</div>
```

with:

```tsx
<div className="font-mono text-xs text-[var(--ink-soft)]">Booking assistant</div>
```

In the status pill, replace `Vapi connected` with `AI свързан`.

- [ ] **Step 4: Update mobile nav count**

Keep mobile bottom nav to the first five items:

```tsx
{navItems.slice(0, 5).map((item) => {
```

This produces: Работно табло, Задачи, Календар, Клиенти, Разговори.

- [ ] **Step 5: Build check**

Run:

```powershell
cd apps/web
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```powershell
git add apps/web/src/components/app-shell.tsx apps/web/src/components/status-badge.tsx
git commit -m "Update SaaS navigation structure"
```

---

### Task 4: Implement Command Center

**Files:**

- Create: `apps/web/src/components/metric-card.tsx`
- Create: `apps/web/src/components/section-panel.tsx`
- Modify: `apps/web/src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create `MetricCard`**

Create `apps/web/src/components/metric-card.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";

const toneClasses: Record<string, string> = {
  teal: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  amber: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  red: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  zinc: "bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
};

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "zinc",
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-[var(--ink-soft)]">{label}</div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</div>
        </div>
        <span className={`flex size-9 items-center justify-center rounded-md ${toneClasses[tone]}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 text-xs text-[var(--ink-soft)]">{detail}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `SectionPanel`**

Create `apps/web/src/components/section-panel.tsx`:

```tsx
import type { ReactNode } from "react";

export function SectionPanel({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="min-w-0">
          {eyebrow ? <div className="font-mono text-xs uppercase text-[var(--ink-soft)]">{eyebrow}</div> : null}
          <h2 className="mt-0.5 text-sm font-semibold">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Replace Command Center page**

Replace `apps/web/src/app/(dashboard)/page.tsx` with a page that imports:

```tsx
import { AlertTriangle, CalendarCheck, CheckCircle2, PhoneCall } from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { StatusBadge } from "@/components/status-badge";
import { getCommandCenterData } from "@/lib/dashboard/data";
```

Use this component body:

```tsx
export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const data = await getCommandCenterData();

  return (
    <>
      <PageHeader
        eyebrow="Работно табло"
        title="Днес"
        actions={
          <Link
            href="/appointments"
            className="inline-flex h-9 items-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white"
          >
            Нов час
          </Link>
        }
      />

      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Обаждания" value={String(data.metrics.calls24h)} detail="последни 14 дни" icon={PhoneCall} tone="teal" />
        <MetricCard label="Часове днес" value={String(data.metrics.appointmentsToday)} detail="потвърдени и заявени" icon={CalendarCheck} tone="blue" />
        <MetricCard label="За преглед" value={String(data.metrics.attentionItems)} detail="задачи от разговори и часове" icon={AlertTriangle} tone="amber" />
        <MetricCard label="Booking rate" value={`${data.metrics.bookingRate}%`} detail="записи спрямо разговори" icon={CheckCircle2} tone="teal" />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionPanel title="Задачи за действие" eyebrow="Inbox preview" action={<Link href="/inbox" className="text-sm font-medium text-teal-700 dark:text-teal-300">Всички</Link>}>
          <div className="divide-y divide-[var(--line)]">
            {data.inboxItems.map((item) => (
              <Link key={item.id} href={item.sourceHref} className="grid gap-2 px-4 py-4 text-sm hover:bg-[var(--surface-muted)] md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <StatusBadge value={item.type} />
                  </div>
                  <div className="mt-1 truncate text-[var(--ink-soft)]">{item.detail}</div>
                  <div className="mt-2 font-mono text-xs text-[var(--ink-soft)]">{item.phone}</div>
                </div>
                <StatusBadge value={item.priority === "high" ? "urgent" : "normal"} />
              </Link>
            ))}
            {data.inboxItems.length === 0 ? <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма задачи за преглед.</div> : null}
          </div>
        </SectionPanel>

        <SectionPanel title="Следващи часове" eyebrow="Calendar" action={<Link href="/appointments" className="text-sm font-medium text-teal-700 dark:text-teal-300">Календар</Link>}>
          <div className="divide-y divide-[var(--line)]">
            {data.nextAppointments.map((appointment) => (
              <Link key={appointment.id} href={`/appointments?appointment=${appointment.id}`} className="block px-4 py-4 text-sm hover:bg-[var(--surface-muted)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{appointment.customerName}</div>
                    <div className="mt-1 truncate text-[var(--ink-soft)]">{appointment.serviceType}</div>
                    <div className="mt-2 font-mono text-xs text-[var(--ink-soft)]">{appointment.startsAt ? formatDateTime(appointment.startsAt) : "Няма час"}</div>
                  </div>
                  <StatusBadge value={appointment.status} />
                </div>
              </Link>
            ))}
            {data.nextAppointments.length === 0 ? <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма предстоящи часове.</div> : null}
          </div>
        </SectionPanel>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <SectionPanel title="Booking funnel" eyebrow="Reports preview">
          <div className="grid grid-cols-4 gap-2 p-4 text-sm">
            {Object.entries(data.funnel).map(([key, value]) => (
              <div key={key} className="rounded-md bg-[var(--surface-muted)] p-3">
                <div className="font-mono text-2xl font-semibold">{value}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]">{key}</div>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="AI health" eyebrow="Assistant">
          <div className="px-4 py-4">
            <div className="flex items-center gap-2">
              <StatusBadge value={data.health.status} />
              <span className="text-sm font-medium">{data.health.label}</span>
            </div>
            <div className="mt-2 text-sm text-[var(--ink-soft)]">{data.health.detail}</div>
          </div>
        </SectionPanel>
      </section>
    </>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
```

- [ ] **Step 4: Run build**

Run:

```powershell
cd apps/web
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add apps/web/src/components/metric-card.tsx apps/web/src/components/section-panel.tsx apps/web/src/app/\(dashboard\)/page.tsx
git commit -m "Build command center dashboard"
```

---

### Task 5: Implement Inbox Page

**Files:**

- Create: `apps/web/src/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Create Inbox page**

Create `apps/web/src/app/(dashboard)/inbox/page.tsx`:

```tsx
import Link from "next/link";

import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getInboxData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await getInboxData();

  return (
    <>
      <PageHeader eyebrow="Оперативна опашка" title="Задачи" />
      <DataTable columns={["Приоритет", "Тип", "Клиент", "Детайл", "Час", "Действие"]}>
        {items.map((item) => (
          <DataRow key={item.id} columns={6}>
            <StatusBadge value={item.priority === "high" ? "urgent" : item.priority} />
            <StatusBadge value={item.type} />
            <div className="min-w-0">
              <div className="truncate font-medium">{item.customerLabel}</div>
              <div className="mt-1 truncate font-mono text-xs text-[var(--ink-soft)]">{item.phone}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{item.title}</div>
              <div className="mt-1 truncate text-xs text-[var(--ink-soft)]">{item.detail}</div>
            </div>
            <div className="font-mono text-[var(--ink-soft)]">{item.appointmentTime ? formatDateTime(item.appointmentTime) : "-"}</div>
            <Link href={item.sourceHref} className="text-sm font-medium text-teal-700 dark:text-teal-300">Отвори</Link>
          </DataRow>
        ))}
        {items.length === 0 ? <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма отворени задачи.</div> : null}
      </DataTable>
    </>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
```

- [ ] **Step 2: Verify build**

Run:

```powershell
cd apps/web
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit Task 5**

Run:

```powershell
git add apps/web/src/app/\(dashboard\)/inbox/page.tsx
git commit -m "Add inbox task queue page"
```

---

### Task 6: Implement Customers and Conversations Pages

**Files:**

- Create: `apps/web/src/app/(dashboard)/customers/page.tsx`
- Create: `apps/web/src/app/(dashboard)/conversations/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/leads/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/calls/page.tsx`

- [ ] **Step 1: Create Customers page**

Create `apps/web/src/app/(dashboard)/customers/page.tsx`:

```tsx
import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getCustomersData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await getCustomersData();

  return (
    <>
      <PageHeader eyebrow="Клиентска база" title="Клиенти" />
      <DataTable columns={["Клиент", "Телефон", "Последен контакт", "Следващ час", "Часове", "Статус"]}>
        {customers.map((customer) => (
          <DataRow key={customer.id} columns={6}>
            <div className="min-w-0">
              <div className="truncate font-medium">{customer.name}</div>
              <div className="mt-1 truncate text-xs text-[var(--ink-soft)]">{customer.tags.slice(0, 2).join(" / ") || "Няма тагове"}</div>
            </div>
            <div className="truncate font-mono">{customer.phone}</div>
            <div className="truncate text-[var(--ink-soft)]">{customer.lastInteractionLabel}</div>
            <div className="font-mono text-[var(--ink-soft)]">{customer.nextAppointment ? formatDateTime(customer.nextAppointment) : "-"}</div>
            <div className="font-mono text-[var(--ink-soft)]">{customer.totalAppointments}</div>
            <StatusBadge value={customer.status} />
          </DataRow>
        ))}
        {customers.length === 0 ? <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Още няма клиенти.</div> : null}
      </DataTable>
    </>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
```

- [ ] **Step 2: Create Conversations page**

Create `apps/web/src/app/(dashboard)/conversations/page.tsx`:

```tsx
import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getConversationsData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const conversations = await getConversationsData(50);

  return (
    <>
      <PageHeader eyebrow="Архив и качество" title="Разговори" />
      <DataTable columns={["Час", "Клиент", "Резултат", "Резюме", "Време", "Статус"]}>
        {conversations.map((conversation) => (
          <DataRow key={conversation.id} columns={6}>
            <div className="font-mono text-[var(--ink-soft)]">{conversation.startedAt ? formatDateTime(conversation.startedAt) : "-"}</div>
            <div className="truncate font-mono">{conversation.caller}</div>
            <StatusBadge value={conversation.outcome} />
            <div className="truncate text-[var(--ink-soft)]">{conversation.summary}</div>
            <div className="font-mono text-[var(--ink-soft)]">{formatDuration(conversation.durationSeconds)}</div>
            <StatusBadge value={conversation.outcome === "unknown" ? "needs_confirmation" : "completed"} />
          </DataRow>
        ))}
        {conversations.length === 0 ? <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Още няма разговори.</div> : null}
      </DataTable>
    </>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
```

- [ ] **Step 3: Redirect old Calls page**

Replace `apps/web/src/app/(dashboard)/calls/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function CallsRedirectPage() {
  redirect("/conversations");
}
```

- [ ] **Step 4: Redirect old Leads page**

Replace `apps/web/src/app/(dashboard)/leads/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function LeadsRedirectPage() {
  redirect("/customers");
}
```

- [ ] **Step 5: Verify build**

Run:

```powershell
cd apps/web
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

Run:

```powershell
git add apps/web/src/app/\(dashboard\)/customers/page.tsx apps/web/src/app/\(dashboard\)/conversations/page.tsx apps/web/src/app/\(dashboard\)/calls/page.tsx apps/web/src/app/\(dashboard\)/leads/page.tsx
git commit -m "Add customers and conversations pages"
```

---

### Task 7: Implement Assistant and Reports Pages

**Files:**

- Create: `apps/web/src/app/(dashboard)/assistant/page.tsx`
- Create: `apps/web/src/app/(dashboard)/reports/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/orders/page.tsx`

- [ ] **Step 1: Create Assistant page**

Create `apps/web/src/app/(dashboard)/assistant/page.tsx`:

```tsx
import { Bot, CalendarCheck, PhoneCall, Settings2 } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { StatusBadge } from "@/components/status-badge";
import { getAssistantOverviewData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const assistant = await getAssistantOverviewData();

  return (
    <>
      <PageHeader eyebrow="AI конфигурация" title="Асистент" />
      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Статус" value={assistant.assistantConnected ? "Online" : "Off"} detail={assistant.assistantName} icon={Bot} tone={assistant.assistantConnected ? "teal" : "red"} />
        <MetricCard label="Календар" value={assistant.calendarConnected ? "OK" : "Off"} detail={assistant.calendarProvider} icon={CalendarCheck} tone={assistant.calendarConnected ? "teal" : "amber"} />
        <MetricCard label="Tool calls 24ч" value={String(assistant.toolCalls24h)} detail="календарни проверки и записи" icon={Settings2} tone="blue" />
        <MetricCard label="Voice" value={assistant.voiceProvider} detail={assistant.model} icon={PhoneCall} tone="zinc" />
      </section>
      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <SectionPanel title="Conversation flow" eyebrow="Настройка">
          <div className="space-y-3 p-4 text-sm text-[var(--ink-soft)]">
            <div>1. Заявка</div>
            <div>2. Ден</div>
            <div>3. Точен час</div>
            <div>4. Проверка в календар</div>
            <div>5. Име, телефон, локация</div>
            <div>6. Запис и финално потвърждение</div>
          </div>
        </SectionPanel>
        <SectionPanel title="Quality review" eyebrow="Контрол">
          <div className="divide-y divide-[var(--line)]">
            <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
              <span>Неразбрани имена</span>
              <StatusBadge value="needs_confirmation" />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
              <span>Tool errors</span>
              <StatusBadge value={assistant.toolErrors24h > 0 ? "attention" : "healthy"} />
            </div>
          </div>
        </SectionPanel>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Create Reports page**

Create `apps/web/src/app/(dashboard)/reports/page.tsx`:

```tsx
import { BarChart3, CalendarCheck, PhoneCall, Timer } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { getReportsData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await getReportsData();

  return (
    <>
      <PageHeader eyebrow="Управителски изглед" title="Отчети" />
      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Разговори" value={String(reports.totals.calls)} detail="последни 14 дни" icon={PhoneCall} tone="teal" />
        <MetricCard label="Записи" value={String(reports.totals.bookings)} detail="заявени и потвърдени" icon={CalendarCheck} tone="blue" />
        <MetricCard label="Квалифицирани" value={String(reports.totals.qualified)} detail="с ясна заявка" icon={BarChart3} tone="amber" />
        <MetricCard label="Средна прод." value={`${reports.totals.averageDurationSeconds}s`} detail="разговор" icon={Timer} tone="zinc" />
      </section>
      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <SectionPanel title="Booking funnel" eyebrow="Conversion">
          <div className="grid grid-cols-4 gap-2 p-4 text-sm">
            {Object.entries(reports.funnel).map(([key, value]) => (
              <div key={key} className="rounded-md bg-[var(--surface-muted)] p-3">
                <div className="font-mono text-2xl font-semibold">{value}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]">{key}</div>
              </div>
            ))}
          </div>
        </SectionPanel>
        <SectionPanel title="Services" eyebrow="Request mix">
          <div className="divide-y divide-[var(--line)]">
            {Object.entries(reports.services).map(([service, count]) => (
              <div key={service} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="truncate">{service}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
            {Object.keys(reports.services).length === 0 ? <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма достатъчно данни.</div> : null}
          </div>
        </SectionPanel>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Update Orders page as optional Jobs module**

Replace `apps/web/src/app/(dashboard)/orders/page.tsx` with:

```tsx
import { PageHeader } from "@/components/page-header";

export default function OrdersPage() {
  return (
    <>
      <PageHeader eyebrow="Optional module" title="Jobs" />
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-sm text-[var(--ink-soft)]">
        Jobs ще стане отделен модул за фирми, които управляват изпълнение след записания час. За generic MVP основният поток е разговор -> задача -> клиент -> час.
      </section>
    </>
  );
}
```

- [ ] **Step 4: Verify build**

Run:

```powershell
cd apps/web
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

Run:

```powershell
git add apps/web/src/app/\(dashboard\)/assistant/page.tsx apps/web/src/app/\(dashboard\)/reports/page.tsx apps/web/src/app/\(dashboard\)/orders/page.tsx
git commit -m "Add assistant and reports pages"
```

---

### Task 8: Polish Calendar Copy and Final Verification

**Files:**

- Modify: `apps/web/src/app/(dashboard)/appointments/page.tsx`
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Update Calendar page copy**

In `apps/web/src/app/(dashboard)/appointments/page.tsx`:

- Keep the route `/appointments`.
- Keep title `Календар`.
- Change eyebrow from `Calendar` to `Часове и заетост`.
- Change button label `Нов час` remains unchanged.
- Keep week grid and upcoming list.
- Do not add reports, customer history, or conversations into this page.

The `PageHeader` call should start like this:

```tsx
<PageHeader
  eyebrow="Часове и заетост"
  title="Календар"
```

- [ ] **Step 2: Update project status**

Append to `PROJECT_STATUS.md` under `## Done`:

```md
- SaaS dashboard IA implementation added:
  Работно табло, Задачи, Календар, Клиенти, Разговори, Асистент, Отчети, and Настройки.
  Old Calls and Leads routes now redirect to Conversations and Customers.
```

- [ ] **Step 3: Run full verification**

Run:

```powershell
cd apps/web
npm run test:availability
npm run test:dashboard
npm run lint
npm run build
```

Expected:

- `availability logic checks passed`
- `dashboard derivation checks passed`
- ESLint exits 0
- Next build exits 0

- [ ] **Step 4: Visual verification**

Start the dev server:

```powershell
cd apps/web
npm run dev
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/inbox`
- `http://localhost:3000/appointments`
- `http://localhost:3000/customers`
- `http://localhost:3000/conversations`
- `http://localhost:3000/assistant`
- `http://localhost:3000/reports`
- `http://localhost:3000/settings`

Check:

- Sidebar labels are Bulgarian.
- Mobile bottom nav has five items.
- No page has overlapping text at 375px width.
- Command Center shows action queue, next appointments, funnel, and AI health.
- Old `/calls` route redirects to `/conversations`.
- Old `/leads` route redirects to `/customers`.

- [ ] **Step 5: Commit Task 8**

Run:

```powershell
git add apps/web/src/app/\(dashboard\)/appointments/page.tsx PROJECT_STATUS.md
git commit -m "Polish calendar and document dashboard IA"
```

---

### Task 9: Deploy

**Files:**

- No source file changes expected.

- [ ] **Step 1: Confirm clean verification**

Run:

```powershell
git status --short
cd apps/web
npm run test:availability
npm run test:dashboard
npm run lint
npm run build
```

Expected: no unstaged changes before deploy except intentionally committed work; all commands pass.

- [ ] **Step 2: Deploy to Vercel production**

Run:

```powershell
cd apps/web
npx vercel --prod --yes
```

Expected: Vercel prints a production deployment URL and aliases it to `https://ai-assistent-2-delta.vercel.app`.

- [ ] **Step 3: Production smoke test**

Open:

- `https://ai-assistent-2-delta.vercel.app/`
- `https://ai-assistent-2-delta.vercel.app/inbox`
- `https://ai-assistent-2-delta.vercel.app/appointments`
- `https://ai-assistent-2-delta.vercel.app/customers`
- `https://ai-assistent-2-delta.vercel.app/conversations`
- `https://ai-assistent-2-delta.vercel.app/assistant`
- `https://ai-assistent-2-delta.vercel.app/reports`

Expected: all routes load without 500 errors and show Bulgarian UI labels.

- [ ] **Step 4: Push final commits**

Run:

```powershell
git push origin main
```

Expected: GitHub `main` contains the dashboard IA implementation.

---

## Self-Review Notes

Spec coverage:

- Navigation: covered by Task 3.
- Command Center: covered by Task 4.
- Inbox: covered by Task 5.
- Calendar refinements: covered by Task 8.
- Customers and Conversations: covered by Task 6.
- Assistant and Reports: covered by Task 7.
- Bulgarian visible labels: covered by Tasks 3-8.
- No duplicate pages: old Calls and Leads are redirects; Orders is removed from primary nav.
- Testing: pure dashboard test, availability test, lint, build, visual route verification.

Implementation risk:

- Derived Inbox and Customers use existing data and will be approximate until dedicated tables exist.
- Reports use simple numeric panels first, not chart libraries. This is intentional for MVP and avoids adding dependencies.
- The plan keeps current calendar behavior intact and only updates copy in the final task.
