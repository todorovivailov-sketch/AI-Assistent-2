// Unit tests for the pure appointment form/validation logic (no framework, no DB).
// Asserts DST-correct wall-clock -> UTC conversion (Europe/Sofia: +3 summer, +2 winter),
// duration/end handling, status whitelist, and form -> row mapping.
// Run (from project root): node apps/web/scripts/test-appointment-form.mjs
//   or (from apps/web):     node ./scripts/test-appointment-form.mjs

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

const {
  parseAppointmentTimes,
  parseAppointmentStatus,
  buildAppointmentValuesFromForm,
  zonedWallClockToUtcISO,
  APPOINTMENT_STATUSES,
} = await loadModule(["src", "lib", "crm", "appointment-form.ts"]);

const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });

// DST-correct wall-clock -> UTC. Europe/Sofia is EEST (+3) in summer, EET (+2) in winter.
assert.equal(zonedWallClockToUtcISO("2026-07-01", "09:00"), "2026-07-01T06:00:00.000Z", "summer EEST +3");
assert.equal(zonedWallClockToUtcISO("2026-01-15", "09:00"), "2026-01-15T07:00:00.000Z", "winter EET +2");

// status whitelist
assert.ok(APPOINTMENT_STATUSES.includes("rescheduled"), "rescheduled present");
assert.equal(parseAppointmentStatus("confirmed"), "confirmed", "valid status");
assert.equal(parseAppointmentStatus("nope"), null, "invalid status");

// derive end from duration (default 60m)
const t1 = parseAppointmentTimes("2026-07-01", "09:00", 60);
assert.equal(t1.error, undefined, "no error");
assert.equal(t1.startsAt, "2026-07-01T06:00:00.000Z", "start utc");
assert.equal(t1.endsAt, "2026-07-01T07:00:00.000Z", "end = start + 60m");

// explicit end time wins over duration
const t2 = parseAppointmentTimes("2026-07-01", "09:00", 60, "10:30");
assert.equal(t2.endsAt, "2026-07-01T07:30:00.000Z", "explicit end honored");

// missing/invalid date
assert.equal(parseAppointmentTimes(null, "09:00").error, "start_required", "date required");

// end before start
assert.equal(
  parseAppointmentTimes("2026-07-01", "09:00", 60, "08:00").error,
  "end_before_start",
  "end must be after start"
);

// buildAppointmentValuesFromForm
const ok = buildAppointmentValuesFromForm(
  form({ title: "  Профилактика  ", date: "2026-07-01", time: "09:00", customer_name: "Иван" }),
  "org-1"
);
assert.equal(ok.error, undefined, "valid form");
assert.equal(ok.values.organization_id, "org-1", "org injected");
assert.equal(ok.values.title, "Профилактика", "title trimmed");
assert.equal(ok.values.status, "confirmed", "default confirmed");
assert.equal(ok.values.starts_at, "2026-07-01T06:00:00.000Z", "start set");
assert.equal(ok.values.customer_name, "Иван", "customer kept");

const noTitle = buildAppointmentValuesFromForm(form({ date: "2026-07-01", time: "09:00" }), "org-1");
assert.equal(noTitle.error, "title_required", "title required");

console.log("appointment-form checks passed");
