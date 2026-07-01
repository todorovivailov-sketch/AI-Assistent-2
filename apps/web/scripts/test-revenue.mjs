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
