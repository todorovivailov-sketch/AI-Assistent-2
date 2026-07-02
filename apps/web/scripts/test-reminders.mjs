// Unit tests for pure reminder helpers. Run (from apps/web): node ./scripts/test-reminders.mjs
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
  sofiaDayWindow,
  formatSofiaTime,
  sofiaDateLabel,
  selectDueAppointments,
  buildReminderSms,
  buildOwnerAgendaEmail,
  smsDedupeKey,
  agendaDedupeKey,
} = await loadModule(["src", "lib", "notifications", "reminders.ts"]);

// --- sofiaDayWindow: summer (UTC+3) ---
const wSummer = sofiaDayWindow(new Date("2026-07-01T10:00:00Z"), 1);
assert.equal(wSummer.isoDate, "2026-07-02", "summer tomorrow isoDate");
assert.equal(wSummer.dateLabel, "02.07", "summer dateLabel");
assert.equal(wSummer.startUtc.toISOString(), "2026-07-01T21:00:00.000Z", "summer Sofia midnight = 21:00Z prev day");
assert.equal(wSummer.endUtc.toISOString(), "2026-07-02T21:00:00.000Z", "summer end = next Sofia midnight");

// --- sofiaDayWindow: winter (UTC+2) ---
const wWinter = sofiaDayWindow(new Date("2026-01-15T10:00:00Z"), 1);
assert.equal(wWinter.isoDate, "2026-01-16", "winter tomorrow isoDate");
assert.equal(wWinter.startUtc.toISOString(), "2026-01-15T22:00:00.000Z", "winter Sofia midnight = 22:00Z prev day");
assert.equal(wWinter.endUtc.toISOString(), "2026-01-16T22:00:00.000Z", "winter end");

// --- formatSofiaTime / sofiaDateLabel ---
assert.equal(formatSofiaTime("2026-07-02T11:00:00Z"), "14:00", "Sofia summer +3 → 14:00");
assert.equal(sofiaDateLabel("2026-07-02T11:00:00Z"), "02.07", "Sofia date label");

// --- selectDueAppointments ---
const rows = [
  { id: "a", status: "confirmed", starts_at: "2026-07-02T11:00:00Z", customer_phone: "+359888111", customer_name: "Иван", service_type: "Ремонт", location: "София" },
  { id: "b", status: "cancelled", starts_at: "2026-07-02T12:00:00Z", customer_phone: "+359888222", customer_name: null, service_type: null, location: null },
  { id: "c", status: "requested", starts_at: "2026-07-02T13:00:00Z", customer_phone: null, customer_name: "Без тел", service_type: null, location: null },
  { id: "d", status: "confirmed", starts_at: "2026-07-05T09:00:00Z", customer_phone: "+359888444", customer_name: "Извън", service_type: null, location: null },
];
const due = selectDueAppointments(rows, wSummer);
assert.deepEqual(due.map((r) => r.id), ["a"], "only confirmed/requested + phone + in-window");

// --- buildReminderSms ---
const sms = buildReminderSms(rows[0], { name: "Демо ХВАК", owner_phone: "0888123456" });
assert.ok(sms.includes("утре 02.07 14:00"), "sms has date+time");
assert.ok(sms.includes("Ремонт"), "sms has service");
assert.ok(sms.includes("Промяна: 0888123456"), "sms has change phone");
assert.ok(sms.length <= 140, `sms within ~2 Cyrillic segments (got ${sms.length})`);

// --- buildOwnerAgendaEmail ---
const agenda = buildOwnerAgendaEmail(
  [rows[0], { id: "e", status: "confirmed", starts_at: "2026-07-02T09:30:00Z", customer_phone: "+359888555", customer_name: "Ана", service_type: "Оглед", location: null }],
  { name: "Демо ХВАК" },
  "02.07"
);
assert.equal(agenda.subject, "Утрешна програма (02.07) — 2 часа", "agenda subject");
assert.ok(agenda.text.indexOf("12:30") < agenda.text.indexOf("14:00"), "agenda sorted by time");
assert.ok(agenda.text.includes("Ана"), "agenda lists customer");

// --- dedupe keys ---
assert.equal(smsDedupeKey("appt-1"), "sms:appt:appt-1");
assert.equal(agendaDedupeKey("2026-07-02"), "email:agenda:2026-07-02");

console.log("reminders: all tests passed");
