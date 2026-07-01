# Phase 5 — Analytics & ROI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Reports page into an ROI view — booked / pipeline / after-hours revenue, a date-range control, and a bookings CSV — computed from data we already have (no migration).

**Architecture:** Three small **pure** modules (`revenue.ts`, `reports-range.ts`, `csv.ts`) hold all the logic and are unit-tested with the existing `ts.transpileModule` + data-URL harness. `getReportsData(range)` in `lib/dashboard/data.ts` wires them to Supabase (RLS session client), a route handler streams the CSV, and `reports/page.tsx` reads the range from URL search params so the page stays a server component.

**Tech Stack:** Next.js 16 (customized — read `apps/web/node_modules/next/dist/docs/` before touching page/route code), React Server Components, Supabase RLS, TypeScript. Tests are plain `.mjs` run with `node`.

**Spec:** `docs/superpowers/specs/2026-07-01-phase-5-analytics-roi-design.md`

**Conventions (verified against the codebase):**
- Pure-fn test harness: copy the `loadModule` helper from `apps/web/scripts/test-prompt-composer.mjs:8-18` (transpile TS → strip imports → import as data URL).
- Run tests **from `apps/web`**: `node ./scripts/test-<name>.mjs`.
- "Booked appointment" = `isBooking` in `apps/web/src/lib/dashboard/derived.ts:392` (`BOOKING_STATUSES` and not `CANCELLED_STATUSES`). Revenue must value exactly these.
- Sofia weekday convention: `0=Sunday … 6=Saturday` (`getSofiaWeekday`, `apps/web/src/lib/vapi/calendar-tools.ts:607`). `business_hours.weekday` uses the same.
- Appointment → call link: `appointments.vapi_call_id` → `calls.vapi_call_id` → `calls.started_at`. `DashboardAppointmentRecord.vapiCallId` already exists (`data.ts:99`).
- Org resolution: `getActiveOrganization` from `@/lib/auth/organization`; RLS client: `createClient` from `@/lib/supabase/server` (used as `await createClient()`).
- Reports call handler style: `export const runtime = "nodejs"` + `export async function GET(request: Request)` returning `NextResponse` (`apps/web/src/app/api/vapi/end-of-call/route.ts:17-33`).

---

## Task 1: Revenue engine (pure) + tests

**Files:**
- Create: `apps/web/src/lib/dashboard/revenue.ts`
- Create (test): `apps/web/scripts/test-revenue.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-revenue.mjs`:

```js
// Unit tests for the pure revenue engine (no DB, no network).
// Run (from apps/web): node ./scripts/test-revenue.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts
    .transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
    })
    .outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

const { calculateRevenue, servicePrice, isOutsideWorkingHours, emptyRevenue } = await loadModule([
  "src", "lib", "dashboard", "revenue.ts",
]);

// --- servicePrice: midpoint / single / unpriced ---
assert.equal(servicePrice({ name: "a", priceMin: 100, priceMax: 200, currency: "BGN" }), 150, "midpoint");
assert.equal(servicePrice({ name: "a", priceMin: 80, priceMax: null, currency: "BGN" }), 80, "min only");
assert.equal(servicePrice({ name: "a", priceMin: null, priceMax: 60, currency: "BGN" }), 60, "max only");
assert.equal(servicePrice({ name: "a", priceMin: null, priceMax: null, currency: "BGN" }), null, "unpriced");

const services = [
  { name: "Монтаж", priceMin: 100, priceMax: 200, currency: "BGN" }, // 150
  { name: "Профилактика", priceMin: 60, priceMax: null, currency: "BGN" }, // 60
  { name: "Без цена", priceMin: null, priceMax: null, currency: "BGN" },
];
const hours = [
  // Mon–Fri 09:00–17:00 open, weekend closed
  { weekday: 1, opensAt: "09:00:00", closesAt: "17:00:00", isClosed: false },
  { weekday: 2, opensAt: "09:00:00", closesAt: "17:00:00", isClosed: false },
  { weekday: 6, opensAt: null, closesAt: null, isClosed: true },
];

// --- isOutsideWorkingHours ---
// 2026-06-30 is a Tuesday. 10:00 Sofia = 07:00Z (summer, +3). Inside window.
assert.equal(isOutsideWorkingHours("2026-06-30T07:00:00.000Z", hours), false, "inside Tue 10:00");
// 20:00 Sofia = 17:00Z. After close.
assert.equal(isOutsideWorkingHours("2026-06-30T17:00:00.000Z", hours), true, "after close Tue 20:00");
// Saturday closed: 2026-07-04 is Sat, any time outside.
assert.equal(isOutsideWorkingHours("2026-07-04T09:00:00.000Z", hours), true, "closed Saturday");
// null start => not outside (excluded by caller)
assert.equal(isOutsideWorkingHours(null, hours), false, "null start");

// --- calculateRevenue: booked value, priced/unpriced, after-hours, pipeline ---
const summary = calculateRevenue({
  bookings: [
    { serviceType: "Монтаж", callStartedAt: "2026-06-30T07:00:00.000Z" }, // 150, in-hours
    { serviceType: "  профилактика  ", callStartedAt: "2026-06-30T17:00:00.000Z" }, // 60, after-hours (case/space-insensitive)
    { serviceType: "Непозната услуга", callStartedAt: null }, // unpriced
  ],
  leadsCount: 10,
  services,
  businessHours: hours,
});
assert.equal(summary.currency, "BGN", "dominant currency");
assert.equal(summary.bookedValue, 210, "booked = 150 + 60");
assert.equal(summary.bookedCount, 3, "3 bookings");
assert.equal(summary.pricedBookings, 2, "2 priced");
assert.equal(summary.unpricedBookings, 1, "1 unpriced");
assert.equal(summary.afterHoursValue, 60, "after-hours = 60");
assert.equal(summary.avgBookingValue, 105, "avg = 210/2");
assert.equal(summary.pipelineValue, 1050, "pipeline = 10 * 105");
assert.equal(summary.afterHoursCountable, true, "hours configured");

// --- no prices at all -> null avg/pipeline, unpriced counted ---
const noPrices = calculateRevenue({
  bookings: [{ serviceType: "Монтаж", callStartedAt: null }],
  leadsCount: 5,
  services: [{ name: "Монтаж", priceMin: null, priceMax: null, currency: "BGN" }],
  businessHours: hours,
});
assert.equal(noPrices.bookedValue, 0, "no priced value");
assert.equal(noPrices.avgBookingValue, null, "no avg");
assert.equal(noPrices.pipelineValue, null, "no pipeline");
assert.equal(noPrices.unpricedBookings, 1, "counted unpriced");

// --- no business hours -> after-hours not countable ---
const noHours = calculateRevenue({
  bookings: [{ serviceType: "Монтаж", callStartedAt: "2026-06-30T17:00:00.000Z" }],
  leadsCount: 0,
  services,
  businessHours: [],
});
assert.equal(noHours.afterHoursCountable, false, "no hours => not countable");
assert.equal(noHours.afterHoursValue, null, "no after-hours value");
assert.equal(noHours.bookedValue, 150, "booked still valued");

// --- avg fallback to catalog when zero priced bookings ---
const catalogAvg = calculateRevenue({
  bookings: [],
  leadsCount: 4,
  services, // midpoints 150, 60 -> catalog avg 105
  businessHours: hours,
});
assert.equal(catalogAvg.avgBookingValue, 105, "catalog avg 105");
assert.equal(catalogAvg.pipelineValue, 420, "pipeline 4 * 105");

// --- emptyRevenue shape ---
const empty = emptyRevenue();
assert.equal(empty.bookedValue, 0, "empty booked 0");
assert.equal(empty.pipelineValue, null, "empty pipeline null");
assert.equal(empty.afterHoursCountable, false, "empty not countable");

console.log("revenue: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `node ./scripts/test-revenue.mjs`
Expected: FAIL with `Missing module: …revenue.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/dashboard/revenue.ts`:

```ts
// Pure revenue math for the Reports page. No DB, no network — unit-tested via scripts/test-revenue.mjs.

export type RevenueServiceInput = {
  name: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
};

export type RevenueBookingInput = {
  serviceType: string | null;
  callStartedAt: string | null; // ISO instant of the call that booked this appointment
};

export type RevenueBusinessHour = {
  weekday: number; // 0=Sunday … 6=Saturday
  opensAt: string | null; // "HH:MM[:SS]"
  closesAt: string | null;
  isClosed: boolean;
};

export type RevenueInput = {
  bookings: RevenueBookingInput[]; // already filtered to isBooking()===true, within range
  leadsCount: number;
  services: RevenueServiceInput[];
  businessHours: RevenueBusinessHour[];
};

export type RevenueSummary = {
  currency: string | null;
  bookedValue: number;
  pipelineValue: number | null;
  afterHoursValue: number | null;
  avgBookingValue: number | null;
  bookedCount: number;
  pricedBookings: number;
  unpricedBookings: number;
  afterHoursCountable: boolean;
};

export type PriceIndex = { currency: string | null; priceByName: Map<string, number> };

export function servicePrice(service: RevenueServiceInput): number | null {
  const min = typeof service.priceMin === "number" && service.priceMin > 0 ? service.priceMin : null;
  const max = typeof service.priceMax === "number" && service.priceMax > 0 ? service.priceMax : null;
  if (min !== null && max !== null) return (min + max) / 2;
  return min ?? max ?? null;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("bg");
}

export function dominantCurrency(services: RevenueServiceInput[]): string | null {
  const counts = new Map<string, number>();
  for (const service of services) {
    if (servicePrice(service) === null) continue;
    const currency = (service.currency ?? "").trim();
    if (!currency) continue;
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = currency;
    }
  }
  return best;
}

// Price lookup by service name, restricted to the dominant currency (off-currency services excluded).
export function buildPriceIndex(services: RevenueServiceInput[]): PriceIndex {
  const currency = dominantCurrency(services);
  const priceByName = new Map<string, number>();
  for (const service of services) {
    const price = servicePrice(service);
    if (price === null) continue;
    if (currency && (service.currency ?? "").trim() !== currency) continue;
    const key = normalizeName(service.name);
    if (key) priceByName.set(key, price);
  }
  return { currency, priceByName };
}

export function priceForServiceType(serviceType: string | null, index: PriceIndex): number | null {
  const key = normalizeName(serviceType);
  if (!key) return null;
  return index.priceByName.get(key) ?? null;
}

// Sofia-local weekday + minutes-since-midnight for an ISO instant (mirrors calendar-tools conventions).
export function sofiaMoment(startedAtISO: string): { weekday: number; minutes: number } | null {
  const date = new Date(startedAtISO);
  if (!Number.isFinite(date.getTime())) return null;
  const weekdayName = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Sofia", weekday: "short" }).format(date);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[weekdayName];
  if (weekday === undefined) return null;
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!match) return null;
  return { weekday, minutes: Number(match[1]) * 60 + Number(match[2]) };
}

function toMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isOutsideWorkingHours(startedAtISO: string | null, hours: RevenueBusinessHour[]): boolean {
  if (!startedAtISO) return false;
  const moment = sofiaMoment(startedAtISO);
  if (!moment) return false;
  const day = hours.find((hour) => hour.weekday === moment.weekday);
  if (!day) return true;
  if (day.isClosed) return true;
  const opens = toMinutes(day.opensAt);
  const closes = toMinutes(day.closesAt);
  if (opens === null || closes === null) return true;
  return moment.minutes < opens || moment.minutes >= closes;
}

export function calculateRevenue(input: RevenueInput): RevenueSummary {
  const services = input.services ?? [];
  const bookings = input.bookings ?? [];
  const businessHours = input.businessHours ?? [];
  const index = buildPriceIndex(services);
  const hoursConfigured = businessHours.length > 0;

  let bookedValue = 0;
  let pricedBookings = 0;
  let afterHoursValue = 0;

  for (const booking of bookings) {
    const value = priceForServiceType(booking.serviceType, index);
    if (value === null) continue;
    bookedValue += value;
    pricedBookings += 1;
    if (hoursConfigured && isOutsideWorkingHours(booking.callStartedAt, businessHours)) {
      afterHoursValue += value;
    }
  }

  const bookedCount = bookings.length;
  const unpricedBookings = bookedCount - pricedBookings;

  let avgBookingValue: number | null = null;
  if (pricedBookings > 0) {
    avgBookingValue = bookedValue / pricedBookings;
  } else {
    const catalog = [...index.priceByName.values()];
    if (catalog.length > 0) {
      avgBookingValue = catalog.reduce((sum, price) => sum + price, 0) / catalog.length;
    }
  }

  return {
    currency: index.currency,
    bookedValue: Math.round(bookedValue),
    pipelineValue: avgBookingValue === null ? null : Math.round(input.leadsCount * avgBookingValue),
    afterHoursValue: hoursConfigured ? Math.round(afterHoursValue) : null,
    avgBookingValue: avgBookingValue === null ? null : Math.round(avgBookingValue),
    bookedCount,
    pricedBookings,
    unpricedBookings,
    afterHoursCountable: hoursConfigured,
  };
}

export function emptyRevenue(): RevenueSummary {
  return {
    currency: null,
    bookedValue: 0,
    pipelineValue: null,
    afterHoursValue: null,
    avgBookingValue: null,
    bookedCount: 0,
    pricedBookings: 0,
    unpricedBookings: 0,
    afterHoursCountable: false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `node ./scripts/test-revenue.mjs`
Expected: PASS → `revenue: all tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard/revenue.ts apps/web/scripts/test-revenue.mjs
git commit -m "feat(reports): pure revenue engine (booked/pipeline/after-hours) + tests"
```

---

## Task 2: Date-range parser (pure) + tests

**Files:**
- Create: `apps/web/src/lib/dashboard/reports-range.ts`
- Create (test): `apps/web/scripts/test-reports-range.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-reports-range.mjs`:

```js
// Unit tests for the pure reports range parser. Run (from apps/web): node ./scripts/test-reports-range.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts
    .transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
    })
    .outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

const { parseReportsRange } = await loadModule(["src", "lib", "dashboard", "reports-range.ts"]);

const now = new Date("2026-07-15T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// default -> 30d
let r = parseReportsRange({}, now);
assert.equal(r.preset, "30d", "default preset");
assert.equal(r.to.getTime(), now.getTime(), "default to = now");
assert.equal(r.from.getTime(), now.getTime() - 30 * DAY, "default from = now-30d");

// 7d
r = parseReportsRange({ range: "7d" }, now);
assert.equal(r.preset, "7d", "7d preset");
assert.equal(r.from.getTime(), now.getTime() - 7 * DAY, "7d from");

// month -> first of month (UTC) .. now
r = parseReportsRange({ range: "month" }, now);
assert.equal(r.preset, "month", "month preset");
assert.equal(r.from.toISOString(), "2026-07-01T00:00:00.000Z", "month start");

// custom valid
r = parseReportsRange({ from: "2026-06-01", to: "2026-06-10" }, now);
assert.equal(r.preset, "custom", "custom preset");
assert.equal(r.from.toISOString(), "2026-06-01T00:00:00.000Z", "custom from");
assert.ok(r.to.toISOString().startsWith("2026-06-10T23:59"), "custom to end-of-day");

// custom reversed -> fallback 30d
r = parseReportsRange({ from: "2026-06-10", to: "2026-06-01" }, now);
assert.equal(r.preset, "30d", "reversed falls back");

// custom garbage -> fallback 30d
r = parseReportsRange({ from: "nope", to: "2026-06-01" }, now);
assert.equal(r.preset, "30d", "garbage falls back");

console.log("reports-range: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./scripts/test-reports-range.mjs`
Expected: FAIL with `Missing module: …reports-range.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/dashboard/reports-range.ts`:

```ts
// Pure date-range parsing for the Reports page. Deterministic given `now` (injected in tests).

export type ReportsPreset = "7d" | "30d" | "month" | "custom";
export type ReportsRange = { from: Date; to: Date; preset: ReportsPreset };
export type ReportsRangeParams = { range?: string; from?: string; to?: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function parseReportsRange(params: ReportsRangeParams, now: Date = new Date()): ReportsRange {
  const from = parseDateOnly(params.from);
  const to = parseDateOnly(params.to);
  if (from && to && from.getTime() <= to.getTime()) {
    const end = new Date(to.getTime() + DAY_MS - 1); // include the whole "to" day
    return { from, to: end, preset: "custom" };
  }

  switch (params.range) {
    case "7d":
      return { from: daysBefore(now, 7), to: now, preset: "7d" };
    case "month":
      return { from: startOfMonthUTC(now), to: now, preset: "month" };
    case "30d":
    default:
      return { from: daysBefore(now, 30), to: now, preset: "30d" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ./scripts/test-reports-range.mjs`
Expected: PASS → `reports-range: all tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard/reports-range.ts apps/web/scripts/test-reports-range.mjs
git commit -m "feat(reports): pure date-range parser (presets + custom) + tests"
```

---

## Task 3: CSV serializer (pure) + tests

**Files:**
- Create: `apps/web/src/lib/dashboard/csv.ts`
- Create (test): `apps/web/scripts/test-csv.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/test-csv.mjs`:

```js
// Unit tests for the pure CSV serializer. Run (from apps/web): node ./scripts/test-csv.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts
    .transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
    })
    .outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

const { toCsv } = await loadModule(["src", "lib", "dashboard", "csv.ts"]);

const csv = toCsv(
  ["Име", "Услуга", "Стойност"],
  [
    ["Иван", "Монтаж", 150],
    ['Ана, "Бизнес"', "Ред1\nРед2", ""],
    ["Петър", null, 60],
  ]
);

assert.ok(csv.startsWith("﻿"), "starts with UTF-8 BOM");
const lines = csv.slice(1).split("\r\n");
assert.equal(lines[0], "Име,Услуга,Стойност", "header row");
assert.equal(lines[1], "Иван,Монтаж,150", "simple row");
assert.equal(lines[2], '"Ана, ""Бизнес""","Ред1\nРед2",', "escaped comma/quotes/newline + empty cell");
assert.equal(lines[3], "Петър,,60", "null becomes empty cell");

console.log("csv: all tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./scripts/test-csv.mjs`
Expected: FAIL with `Missing module: …csv.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/dashboard/csv.ts`:

```ts
// Minimal CSV serialization with an Excel-friendly UTF-8 BOM. Pure — tested in scripts/test-csv.mjs.

const BOM = "﻿";

type Cell = string | number | null | undefined;

function escapeCell(value: Cell): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return BOM + lines.join("\r\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ./scripts/test-csv.mjs`
Expected: PASS → `csv: all tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard/csv.ts apps/web/scripts/test-csv.mjs
git commit -m "feat(reports): pure CSV serializer with UTF-8 BOM + tests"
```

---

## Task 4: Wire the data layer (`getReportsData(range)` + export rows)

**Files:**
- Modify: `apps/web/src/lib/dashboard/derived.ts:392` (export `isBooking`)
- Modify: `apps/web/src/lib/dashboard/data.ts` (imports, `ReportsData`, `getReportsData`, `getEmptyReportsData`, new helpers + `getReportsExportRows`)

- [ ] **Step 1: Export `isBooking` from `derived.ts`**

In `apps/web/src/lib/dashboard/derived.ts:392`, change:

```ts
function isBooking(appointment: DashboardAppointmentInput): boolean {
```
to:
```ts
export function isBooking(appointment: DashboardAppointmentInput): boolean {
```

- [ ] **Step 2: Add imports + `ReportsExportRow` type in `data.ts`**

At the top of `apps/web/src/lib/dashboard/data.ts`, add `isBooking` to the existing `@/lib/dashboard/derived` import group, and add a new import for the revenue engine:

```ts
import {
  buildPriceIndex,
  calculateRevenue,
  emptyRevenue,
  priceForServiceType,
  type RevenueBusinessHour,
  type RevenueServiceInput,
  type RevenueSummary,
} from "@/lib/dashboard/revenue";
```

Add the export-row type next to `ReportsData` (after the `ReportsData` type, ~line 211):

```ts
export type ReportsExportRow = {
  customerName: string;
  customerPhone: string;
  serviceType: string;
  startsAt: string | null;
  status: string;
  estimatedValue: number | null;
  currency: string | null;
};
```

- [ ] **Step 3: Add `revenue` to `ReportsData` + `getEmptyReportsData`**

In the `ReportsData` type (`data.ts:195`), add one field:

```ts
export type ReportsData = {
  funnel: DashboardBookingFunnel;
  totals: { /* unchanged */ };
  outcomes: Record<string, number>;
  services: Record<string, number>;
  revenue: RevenueSummary;
};
```

In `getEmptyReportsData` (`data.ts:851`), add `revenue: emptyRevenue()` to the returned object (alongside `outcomes: {}, services: {}`).

- [ ] **Step 4: Add revenue helpers (fetch services/hours/leads-count/call-start-times)**

Add these private helpers in `data.ts` (near the other `getDashboard*` fetchers). They use the RLS session client, so they are org-scoped:

```ts
async function getRevenueServices(organizationId: string): Promise<RevenueServiceInput[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("name, price_min, price_max, currency")
    .eq("organization_id", organizationId);
  if (error) {
    logSupabaseError("Reports services query failed", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    name: row.name ?? "",
    priceMin: row.price_min,
    priceMax: row.price_max,
    currency: row.currency ?? "",
  }));
}

async function getRevenueBusinessHours(organizationId: string): Promise<RevenueBusinessHour[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("weekday, opens_at, closes_at, is_closed")
    .eq("organization_id", organizationId);
  if (error) {
    logSupabaseError("Reports business hours query failed", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    weekday: row.weekday,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    isClosed: Boolean(row.is_closed),
  }));
}

async function getLeadsCountInRange(organizationId: string, from: Date, to: Date): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());
  if (error) {
    logSupabaseError("Reports leads count query failed", error);
    return 0;
  }
  return count ?? 0;
}

async function getCallStartTimesByVapiId(
  organizationId: string,
  vapiCallIds: string[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(vapiCallIds.filter((value): value is string => Boolean(value))));
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calls")
    .select("vapi_call_id, started_at")
    .eq("organization_id", organizationId)
    .in("vapi_call_id", ids);
  if (error) {
    logSupabaseError("Reports call start-times query failed", error);
    return map;
  }
  for (const row of data ?? []) {
    if (row.vapi_call_id && row.started_at) map.set(row.vapi_call_id, row.started_at);
  }
  return map;
}
```

- [ ] **Step 5: Rewrite `getReportsData` to take a range + compute revenue**

Replace `getReportsData` (`data.ts:377`) with:

```ts
export async function getReportsData(
  range: { from: Date; to: Date } = { from: daysFromNow(-30), to: new Date() }
): Promise<ReportsData> {
  const organization = await getDashboardOrganization();
  if (!organization) return getEmptyReportsData();

  const { from, to } = range;
  const [calls, appointments, services, businessHours, leadsCount] = await Promise.all([
    getDashboardCalls(organization.id, 500, { since: from, until: to }),
    getReportingAppointments(organization.id, 500, from, to),
    getRevenueServices(organization.id),
    getRevenueBusinessHours(organization.id),
    getLeadsCountInRange(organization.id, from, to),
  ]);

  const funnel = calculateBookingFunnel({ calls, appointments });
  const totalDurationSeconds = calls.reduce((sum, call) => sum + (call.durationSeconds ?? 0), 0);

  const bookedAppointments = appointments.filter(isBooking);
  const startTimes = await getCallStartTimesByVapiId(
    organization.id,
    bookedAppointments.map((appointment) => appointment.vapiCallId ?? "")
  );
  const revenue = calculateRevenue({
    bookings: bookedAppointments.map((appointment) => ({
      serviceType: appointment.serviceType,
      callStartedAt: appointment.vapiCallId ? startTimes.get(appointment.vapiCallId) ?? null : null,
    })),
    leadsCount,
    services,
    businessHours,
  });

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
    revenue,
  };
}
```

- [ ] **Step 6: Add `getReportsExportRows`**

Add after `getReportsData`:

```ts
export async function getReportsExportRows(range: { from: Date; to: Date }): Promise<ReportsExportRow[]> {
  const organization = await getDashboardOrganization();
  if (!organization) return [];

  const [appointments, services] = await Promise.all([
    getReportingAppointments(organization.id, 500, range.from, range.to),
    getRevenueServices(organization.id),
  ]);
  const index = buildPriceIndex(services);

  return appointments.filter(isBooking).map((appointment) => ({
    customerName: appointment.customerName ?? "",
    customerPhone: appointment.customerPhone ?? "",
    serviceType: appointment.serviceType ?? "",
    startsAt: appointment.startsAt,
    status: appointment.status,
    estimatedValue: priceForServiceType(appointment.serviceType, index),
    currency: index.currency,
  }));
}
```

- [ ] **Step 7: Verify the build compiles**

Run (from `apps/web`): `npm run build`
Expected: build succeeds. `getReportsData()` still callable with no args (default 30d range) so `reports/page.tsx` compiles before Task 6. If `logSupabaseError`, `average`, `countBy`, `daysFromNow`, `getBookingRate`, `getDashboardCalls`, `getReportingAppointments`, `getDashboardOrganization` are not in scope, they already exist in this file — do not redefine.

- [ ] **Step 8: Re-run the pure tests (no regression)**

Run: `node ./scripts/test-revenue.mjs && node ./scripts/test-reports-range.mjs && node ./scripts/test-csv.mjs`
Expected: all three print "all tests passed".

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/dashboard/derived.ts apps/web/src/lib/dashboard/data.ts
git commit -m "feat(reports): range-driven getReportsData with revenue + export rows"
```

---

## Task 5: CSV export route handler

**Files:**
- Create: `apps/web/src/app/api/reports/export/route.ts`

- [ ] **Step 1: Read the Next.js route-handler docs**

Before writing, skim `apps/web/node_modules/next/dist/docs/` for the current route-handler contract (this is a customized Next.js 16). Confirm `export async function GET(request: Request)` + returning a `NextResponse`/`Response` with custom headers is the supported shape (mirror `apps/web/src/app/api/vapi/end-of-call/route.ts:17-45`).

- [ ] **Step 2: Write the route**

Create `apps/web/src/app/api/reports/export/route.ts`:

```ts
import { NextResponse } from "next/server";

import { toCsv } from "@/lib/dashboard/csv";
import { getReportsExportRows } from "@/lib/dashboard/data";
import { parseReportsRange } from "@/lib/dashboard/reports-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const range = parseReportsRange({
    range: params.get("range") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const rows = await getReportsExportRows({ from: range.from, to: range.to });
  const header = ["Име", "Телефон", "Услуга", "Дата/час", "Статус", "Стойност", "Валута"];
  const body = rows.map((row) => [
    row.customerName,
    row.customerPhone,
    row.serviceType,
    row.startsAt ?? "",
    row.status,
    row.estimatedValue ?? "",
    row.currency ?? "",
  ]);
  const csv = toCsv(header, body);

  const fromLabel = range.from.toISOString().slice(0, 10);
  const toLabel = range.to.toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${fromLabel}-${toLabel}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
```

(`getReportsExportRows` resolves the org from the session and reads via RLS, so the route is org-scoped without extra auth wiring — the browser sends the session cookie.)

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: success; the new route appears in the build output under `/api/reports/export`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/reports/export/route.ts
git commit -m "feat(reports): CSV export route handler for the bookings list"
```

---

## Task 6: Reports page UI — range control + revenue cards + export

**Files:**
- Create: `apps/web/src/app/(dashboard)/reports/range-control.tsx`
- Modify: `apps/web/src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Read the Next.js `searchParams` docs**

Skim `apps/web/node_modules/next/dist/docs/` for how a server page receives `searchParams` in this Next.js 16 (it is an async prop). Confirm the `searchParams: Promise<{ [key: string]: string | string[] | undefined }>` shape and that `await searchParams` is required before use.

- [ ] **Step 2: Create the range control (server component)**

Create `apps/web/src/app/(dashboard)/reports/range-control.tsx`:

```tsx
import Link from "next/link";

import type { ReportsPreset } from "@/lib/dashboard/reports-range";

const PRESETS: Array<{ key: Exclude<ReportsPreset, "custom">; label: string }> = [
  { key: "7d", label: "7 дни" },
  { key: "30d", label: "30 дни" },
  { key: "month", label: "Този месец" },
];

export function RangeControl({
  preset,
  from,
  to,
  exportHref,
}: {
  preset: ReportsPreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  exportHref: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((item) => {
          const active = preset === item.key;
          return (
            <Link
              key={item.key}
              href={`/reports?range=${item.key}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 font-semibold text-[var(--accent)]"
                  : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <form method="get" action="/reports" className="flex items-center gap-2">
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-1.5 text-sm" />
          <span className="text-[var(--ink-soft)]">–</span>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-1.5 text-sm" />
          <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)]">
            Приложи
          </button>
        </form>
      </div>
      <a
        href={exportHref}
        className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--accent)]"
      >
        Изтегли CSV
      </a>
    </div>
  );
}
```

*(If `--accent` is not the accent CSS var used elsewhere, match the token used by the existing active/primary elements in this app — check `MetricCard`/nav for the correct `var(--…)`.)*

- [ ] **Step 3: Rewrite the Reports page to be range-driven**

Replace `apps/web/src/app/(dashboard)/reports/page.tsx` with (adjust `searchParams` typing to whatever Step 1 confirmed):

```tsx
import { BarChart3, CalendarCheck, Coins, MoonStar, PhoneCall, TrendingUp, Wallet } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { getReportsData } from "@/lib/dashboard/data";
import { parseReportsRange } from "@/lib/dashboard/reports-range";

import { RangeControl } from "./range-control";

export const dynamic = "force-dynamic";

const funnelLabels: Record<string, string> = {
  calls: "Разговори",
  qualifiedInteractions: "Квалифицирани",
  calendarRelevantRequests: "Искат час",
  bookings: "Записи",
};

function money(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("bg-BG")} ${currency ?? ""}`.trim();
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const pick = (key: string) => (Array.isArray(sp[key]) ? sp[key]?.[0] : sp[key]) as string | undefined;
  const range = parseReportsRange({ range: pick("range"), from: pick("from"), to: pick("to") });

  const fromLabel = range.from.toISOString().slice(0, 10);
  const toLabel = range.to.toISOString().slice(0, 10);
  const exportHref = `/api/reports/export?range=${range.preset}&from=${fromLabel}&to=${toLabel}`;

  const reports = await getReportsData({ from: range.from, to: range.to });
  const { revenue } = reports;

  return (
    <>
      <PageHeader eyebrow="Управленски изглед" title="Отчети" />

      <RangeControl preset={range.preset} from={fromLabel} to={toLabel} exportHref={exportHref} />

      <section className="grid min-w-0 gap-3 md:grid-cols-3">
        <MetricCard
          label="Записани приходи"
          value={money(revenue.bookedValue, revenue.currency)}
          detail={`${revenue.bookedCount} записа за периода`}
          icon={Wallet}
          tone="teal"
        />
        <MetricCard
          label="Пайплайн (потенциал)"
          value={money(revenue.pipelineValue, revenue.currency)}
          detail="всички уловени лийдове"
          icon={TrendingUp}
          tone="blue"
        />
        <MetricCard
          label="Спасени извън работно време"
          value={revenue.afterHoursCountable ? money(revenue.afterHoursValue, revenue.currency) : "—"}
          detail={revenue.afterHoursCountable ? "записи от обаждания извън работно време" : "задай работно време"}
          icon={MoonStar}
          tone="amber"
        />
      </section>

      {revenue.unpricedBookings > 0 ? (
        <p className="text-xs text-[var(--ink-soft)]">
          {revenue.unpricedBookings} записа без цена на услугата — добави цени в „Асистент → Услуги" за пълна картина.
        </p>
      ) : null}

      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Разговори" value={String(reports.totals.calls)} detail="за периода" icon={PhoneCall} tone="teal" />
        <MetricCard label="Записи" value={String(reports.totals.bookings)} detail="заявени и потвърдени" icon={CalendarCheck} tone="blue" />
        <MetricCard label="Квалифицирани" value={String(reports.totals.qualified)} detail="с ясна заявка" icon={BarChart3} tone="amber" />
        <MetricCard label="Ср. стойност/запис" value={money(revenue.avgBookingValue, revenue.currency)} detail="оценка" icon={Coins} tone="zinc" />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionPanel title="Booking funnel" eyebrow="Conversion">
          <div className="grid grid-cols-2 gap-2 p-4 text-sm sm:grid-cols-4">
            {Object.entries(reports.funnel).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <div className="font-mono text-2xl font-semibold">{value}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]">{funnelLabels[key] ?? key}</div>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="Services" eyebrow="Request mix">
          <div className="divide-y divide-[var(--line)]">
            {Object.entries(reports.services).map(([service, count]) => (
              <div key={service} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="truncate text-[var(--ink-soft)]">{service}</span>
                <span className="font-mono font-semibold">{count}</span>
              </div>
            ))}
            {Object.keys(reports.services).length === 0 ? (
              <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма достатъчно данни.</div>
            ) : null}
          </div>
        </SectionPanel>
      </section>
    </>
  );
}
```

Verify the `lucide-react` icons used (`Wallet`, `TrendingUp`, `MoonStar`, `Coins`) exist in the installed version; if any is missing, swap for a present one.

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: success. Load `/reports` mentally against the code: no `searchParams` misuse, `MetricCard`/`SectionPanel` props match their definitions.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/reports/range-control.tsx" "apps/web/src/app/(dashboard)/reports/page.tsx"
git commit -m "feat(reports): ROI cards + date-range control + CSV export button"
```

---

## Task 7: End-to-end verify + deploy

**Files:**
- Create (temp, untracked): `apps/web/scripts/check-reports-revenue.mjs`

- [ ] **Step 1: Confirm `getReportsData` has no other callers**

Run: `grep -rn "getReportsData(" apps/web/src` (or use the Grep tool).
Expected: only `reports/page.tsx` (now passing a range) and the definition. If any other caller exists, it still compiles (default range), but note it.

- [ ] **Step 2: Run all pure tests together**

Run (from `apps/web`):
```bash
node ./scripts/test-revenue.mjs && node ./scripts/test-reports-range.mjs && node ./scripts/test-csv.mjs
```
Expected: three "all tests passed" lines.

- [ ] **Step 3: Read-only revenue check against the demo org**

Create `apps/web/scripts/check-reports-revenue.mjs` — a **read-only** script (no writes) that loads env like `_backfill-appt-calls.mjs`, fetches the demo org's booked appointments + services + business hours for the last 30 days, and prints `bookedValue`, `pipelineValue`, `afterHoursValue`, `bookedCount`, `unpricedBookings`, and the export-row count. Mirror the env-loading and Supabase-client setup from `apps/web/scripts/_backfill-appt-calls.mjs`. Reuse the transpiled `revenue.ts` via the same `loadModule` helper so the check exercises the real math.

Run: `node ./scripts/check-reports-revenue.mjs`
Expected: sane numbers (e.g., the 3 known appointments valued against their services; after-hours ≤ booked; unpriced count matches services without prices). This is a sanity check, not an assertion suite.

- [ ] **Step 4: Full build**

Run (from `apps/web`): `npm run build`
Expected: green.

- [ ] **Step 5: Commit any check-script/notes, then deploy**

Do **not** commit the temp check script (leave untracked or delete). Push the feature commits:

```bash
git push origin main
```

- [ ] **Step 6: Verify the deploy is live**

Poll the health endpoint until `commit` matches `git rev-parse --short HEAD` (background curl loop, as in prior phases):
`GET https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call` → check `commit`.
Then open `/reports` in the browser, switch presets, and click "Изтегли CSV" to confirm the download opens with correct Cyrillic in Excel.

- [ ] **Step 7: Clean up**

Delete the temp `apps/web/scripts/check-reports-revenue.mjs` if you created it untracked.

---

## Self-review notes (for the implementer)

- **Single source of truth for pricing:** both `getReportsData` (via `calculateRevenue`) and `getReportsExportRows` value bookings through `buildPriceIndex` + `priceForServiceType`, so the CSV and the cards never disagree.
- **Booked definition:** revenue values exactly `appointments.filter(isBooking)` — the same predicate the funnel's `bookings` count uses. No divergent "booked" logic.
- **Honest empties:** no prices → `bookedValue 0`, pipeline "—", nudge shown; no business hours → after-hours "—" + hint; both are explicit, not crashes.
- **Server-only stays server-only:** `revenue.ts` / `reports-range.ts` / `csv.ts` are pure (no `@/lib/supabase`, no `next/*`) so the `.mjs` harness can transpile-and-import them.
- **Per-commit builds:** `getReportsData`'s range param defaults to 30d, so Task 4 compiles before the page is updated in Task 6.
- **Next.js 16 caveat:** Tasks 5 & 6 begin by reading `node_modules/next/dist/docs/` — do not assume classic Next.js route/searchParams APIs.
