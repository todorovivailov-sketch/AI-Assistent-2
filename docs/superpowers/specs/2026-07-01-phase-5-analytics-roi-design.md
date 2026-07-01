# Phase 5 — Analytics & ROI (Design)

**Date:** 2026-07-01
**Status:** Approved design → ready for implementation plan
**Builds on:** the existing `reports/page.tsx` + `getReportsData` (funnel, totals, services mix), the booking-funnel derivation in `lib/dashboard/derived.ts` (`calculateBookingFunnel`, `isBooking`), the working-hours logic in `lib/vapi/calendar-tools.ts` (`getSofiaWeekday`, working windows), and the services/business-hours read pattern in `lib/agent/composer-data.ts`.

---

## 1. Goal

Turn the Reports screen into the **ROI story that sells the product**: show the business owner, for a chosen period, how much money the assistant brought in, the booking conversion funnel, and let them export the booking list as CSV. No new data is collected — everything is computed from calls, appointments, leads, services (prices), and business hours already in the database.

The headline is **revenue, shown as three honest lenses** (owner asked for all three), not one inflated number:

| Metric | Question it answers | Definition |
|---|---|---|
| **Записани приходи** (Booked revenue) | committed money | Σ price of the period's booked appointments |
| **Пайплайн** (Pipeline potential) | total captured opportunity | leads captured × average booking value |
| **Спасени извън работно време** (After-hours rescued) | the "night shift" | Σ price of booked appointments whose call happened outside business hours |

## 2. Scope

**In scope**
- A revenue section on the Reports page (three metric cards) driven by a new pure `calculateRevenue`.
- A **date-range control** (presets 7 / 30 days · this month · custom) replacing the hard-coded 14-day lookback, driven by URL search params so the page stays a server component.
- **CSV export** of the period's booking list via a route handler.
- `getReportsData` gains a `range` parameter and a `revenue` block; a new `getReportsExportRows(range)` feeds the CSV route.

**Out of scope (future, easy to add later)**
- Time-series / trend charts.
- A separate leads CSV (only the bookings CSV ships now).
- Mixed-currency polish (a business is assumed to price in one currency; see §5).
- Per-user saved reports, scheduled email reports, PDF export.
- Changing the funnel definition (reused verbatim from Phase-3/CRM derivations).

**No migration** — all inputs (appointments, leads, services with `price_min`/`price_max`/`currency`, `business_hours`, and the `appointments.vapi_call_id → calls.started_at` link added in the drawer work) already exist.

## 3. Revenue engine — `lib/dashboard/revenue.ts` (pure, unit-tested)

A single pure function valuing a set of bookings/leads by catalog price. Pure so it is testable via the established `ts.transpileModule` + data-URL mjs pattern (as in 4b/4c).

```ts
export type RevenueServiceInput = {
  name: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
};

export type RevenueBookingInput = {
  serviceType: string | null;   // appointment.service_type (free text)
  callStartedAt: string | null; // ISO; resolved via appointment.vapi_call_id → calls.started_at
};

export type RevenueBusinessHour = {
  weekday: number;              // 0=Sunday … 6=Saturday (getSofiaWeekday convention)
  opensAt: string | null;       // "HH:MM[:SS]"
  closesAt: string | null;
  isClosed: boolean;
};

export type RevenueInput = {
  bookings: RevenueBookingInput[]; // already filtered to isBooking()==true, within range
  leadsCount: number;              // leads created within range
  services: RevenueServiceInput[];
  businessHours: RevenueBusinessHour[];
};

export type RevenueSummary = {
  currency: string | null;      // dominant service currency; null if no priced service
  bookedValue: number;          // Σ valued bookings
  pipelineValue: number | null; // leadsCount × avgBookingValue; null if avg unknown
  afterHoursValue: number | null; // Σ valued after-hours bookings; null if hours not configured
  avgBookingValue: number | null;
  bookedCount: number;          // bookings.length
  pricedBookings: number;       // bookings matched to a priced service
  unpricedBookings: number;     // bookings with no price → contribute 0 (drives the "add prices" nudge)
  afterHoursCountable: boolean; // false when businessHours is empty (metric shows "—")
};

export function calculateRevenue(input: RevenueInput): RevenueSummary;
```

**Pricing rule (approved):**
- A service's unit price = **midpoint** of `priceMin`/`priceMax` when both are set; the single value when only one is set; otherwise the service is *unpriced*.
- A booking is valued by matching its `serviceType` to a service **by name** (trimmed, case-insensitive, locale-lowercased for Cyrillic). No match or unpriced service → value 0 and counted in `unpricedBookings`.
- `currency` = the currency of the most common priced service (single-currency assumption). Mixed currencies: value only the dominant-currency services; the rest count as unpriced (documented limitation, not a crash).

**Average booking value:** mean value of the *priced* bookings in the period; if there are none, fall back to the mean of the catalog's priced-service midpoints; if the catalog has no prices, `avgBookingValue = null`.

**Pipeline:** `pipelineValue = leadsCount × avgBookingValue`, or `null` when `avgBookingValue` is null.

**After-hours:** a booking is "after hours" when its `callStartedAt` (interpreted in Europe/Sofia) falls outside that weekday's business-hours window, or the day is `isClosed`. Reuse the Sofia-weekday + `HH:MM` parsing conventions from `calendar-tools.ts` via a small pure helper `isOutsideWorkingHours(startedAtISO, businessHours)` in `revenue.ts`. Bookings with no `callStartedAt` (unlinked older appointments) are **excluded** from after-hours (conservative). When `businessHours` is empty, `afterHoursCountable = false` and `afterHoursValue = null` (UI shows "—" with a hint to set hours).

## 4. Date range — `lib/dashboard/reports-range.ts` (pure) + URL search params

- `parseReportsRange(params: { range?: string; from?: string; to?: string }): { from: Date; to: Date; preset: ReportsPreset }` — pure, unit-tested.
  - Presets: `'7d' | '30d' | 'month' | 'custom'`. Default **`'30d'`** when nothing is provided (broader than today's 14d, better for a revenue view).
  - `'month'` = first day of the current month → now.
  - `'custom'` = validated `from`/`to` (`YYYY-MM-DD`); invalid or reversed input falls back to `'30d'`.
  - Time uses the app's existing `daysFromNow`/date helpers; `to` defaults to now.
- The Reports page reads its range from the URL (search params), calls `getReportsData(range)`, and stays a **server component** (`dynamic = "force-dynamic"`, no client data fetching). *(The exact Next.js 16 search-params API is verified against `apps/web/node_modules/next/dist/docs/` during planning — this is a customized Next.js.)*

## 5. Data layer changes — `lib/dashboard/data.ts`

- **`getReportsData(range: { from: Date; to: Date })`** — signature changes from no-arg to range-driven.
  - Fetch calls (with `started_at` **and** `vapi_call_id`) and reporting appointments within `[from, to]`, plus the org's `services` (name, price_min, price_max, currency) and `business_hours` (weekday, opens_at, closes_at, is_closed) — reusing the read pattern already in `composer-data.ts`.
  - Build a `Map<vapi_call_id, started_at>` from the fetched calls; join each booked appointment (`isBooking`) to its call's `started_at` to produce `RevenueBookingInput[]`.
  - `leadsCount` = leads with `created_at` in `[from, to]` (scoped by org via RLS).
  - Add `revenue: RevenueSummary` (from `calculateRevenue`) to `ReportsData`. Existing `funnel`/`totals`/`services`/`outcomes` stay, now computed over the chosen range.
  - **Note:** `DASHBOARD_CALL_SELECT` (or a reports-specific select) must include `vapi_call_id` so appointments can be joined to their call's `started_at`.
- **`getReportsExportRows(range): Promise<ReportsExportRow[]>`** — new. For each booked appointment in range: `{ customerName, customerPhone, serviceType, startsAt, status, estimatedValue, currency }`, valued by the same `calculateRevenue` pricing (extract the per-booking valuation into a shared pure helper so the CSV and the summary never disagree).

## 6. CSV export route — `app/api/reports/export/route.ts`

- `GET /api/reports/export?range=&from=&to=` — org-scoped via the session (`getActiveOrganization` + RLS `createClient`, same as the pages).
- Parses the range with `parseReportsRange`, calls `getReportsExportRows`, and returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="report-<from>-<to>.csv"`.
- **BG-friendly CSV:** UTF-8 **BOM** prefix (so Excel opens Cyrillic correctly), header row in Bulgarian (Име, Телефон, Услуга, Дата/час, Статус, Стойност, Валута), values quote-escaped. A tiny pure `toCsv(rows)` helper, unit-tested for escaping (commas, quotes, newlines).

## 7. UI — `reports/page.tsx` (+ small `reports/range-control.tsx`)

Reuses `PageHeader`, `MetricCard`, `SectionPanel`.

- **Range control** (`range-control.tsx`): preset links (`?range=7d|30d|month`) styled as a segmented control + a small GET `<form>` with two `type="date"` inputs for a custom range. Mostly server-friendly; the only interactivity is navigation, so a client island is optional (preset links + a native form submit suffice).
- **Revenue section** — three `MetricCard`s:
  - „Записани приходи" — `bookedValue` + currency; detail = „N записа за периода".
  - „Пайплайн (потенциал)" — `pipelineValue` or „—"; detail = „N лийда × средно".
  - „Спасени извън работно време" — `afterHoursValue` or „—"; detail names the concept.
  - A subtle nudge line when `unpricedBookings > 0` („Добави цени на услугите за пълна картина") and when `!afterHoursCountable` („Задай работно време, за да броим нощните обаждания").
- **Export button** — an `<a href="/api/reports/export?…">` carrying the current range („Изтегли CSV").
- The existing funnel + services-mix panels stay, now reflecting the selected range.

## 8. Error handling & edge cases

- **No org / empty period:** return a well-defined empty `ReportsData` (zeros, `revenue` all-null/0) — page renders "no data" states, never crashes (mirror the existing `getEmptyReportsData`).
- **No service prices:** `bookedValue = 0`, `avgBookingValue = null`, pipeline „—", every booking counted as `unpricedBookings` → the nudge appears. Honest, not misleading.
- **No business hours:** `afterHoursCountable = false`, metric „—" + hint. Other metrics unaffected.
- **Unlinked old appointments:** excluded only from the after-hours lens; still counted in booked revenue and the funnel.
- **Custom range invalid/reversed:** silently falls back to the 30-day preset (pure `parseReportsRange`).
- **Currency mismatch:** dominant currency wins; off-currency services treated as unpriced (documented).

## 9. Testing

- **Pure unit tests** (mjs via `ts.transpileModule`, as in 4b/4c):
  - `calculateRevenue`: booked value with midpoint pricing; only-min / only-max services; unpriced service → 0 + counted; name matching case/whitespace/Cyrillic-insensitive; avg-booking fallbacks (no bookings → catalog avg → null); pipeline = leads × avg (and null when avg null); after-hours inclusion vs exclusion; `afterHoursCountable=false` when hours empty; dominant-currency selection.
  - `isOutsideWorkingHours`: inside window = false; before open / after close / closed day = true; missing `startedAt` handled by the caller (excluded).
  - `parseReportsRange`: each preset; `month` boundary; invalid/reversed custom → 30d; default → 30d.
  - `toCsv`: escaping of commas, quotes, newlines; BOM present; header order stable.
- **Manual E2E** (a `check-*.mjs` read-only script, as in prior phases): for the demo org over a 30-day range, print `bookedValue`, `pipelineValue`, `afterHoursValue`, `bookedCount`, `unpricedBookings`, and the export row count; sanity-check against the known 3 appointments / their services.

## 10. Success criteria

1. Owner opens Reports, picks "30 дни", and sees a booked-revenue number computed from real catalog prices for the period's bookings.
2. Switching the range (7 дни / този месец / custom) recomputes every metric, the funnel, and the services mix for that window.
3. Pipeline and after-hours cards show sensible values, or an honest „—" + nudge when prices / business hours are missing.
4. "Изтегли CSV" downloads a UTF-8 (BOM) file that opens in Excel with correct Cyrillic, containing the period's bookings with their estimated value.
5. No regression: the existing funnel, totals, and services-mix panels still render and now respect the selected range.

## 11. Open items to resolve in the implementation plan

- Confirm the Next.js 16 (customized) server-component **search-params** API against `apps/web/node_modules/next/dist/docs/` before wiring the range into the page.
- Confirm the exact fields/select needed so booked appointments can be joined to `calls.started_at` (add `vapi_call_id` to the reports call select vs. a dedicated lightweight fetch).
- Confirm the `leads` created-in-range query shape (RLS, `created_at` filter) matches the other reports queries.

---

*One revenue engine, three honest lenses (booked / pipeline / after-hours), a range-driven server page, and a BOM-prefixed CSV of the bookings — all from data we already have, no migration.*
