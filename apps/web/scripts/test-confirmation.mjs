// Unit tests for pure appointment-confirmation helpers. Run (from apps/web): node ./scripts/test-confirmation.mjs
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

const { DEFAULT_CONFIRMATION_TEMPLATE, buildConfirmationSms, confirmDedupeKey } = await loadModule([
  "src",
  "lib",
  "notifications",
  "appointment-confirmation.ts",
]);

const full = {
  service: "Ремонт",
  date: "03.07",
  time: "14:00",
  business: "Демо ЕООД",
  phone: "+359888123456",
};

// --- full substitution against default template ---
const s1 = buildConfirmationSms(full, null);
assert.ok(s1.includes("Ремонт") && s1.includes("03.07") && s1.includes("14:00"), "date/time/service present");
assert.ok(s1.includes("Демо ЕООД") && s1.includes("+359888123456"), "business + phone present");
assert.ok(!s1.includes("{"), "no leftover placeholder");

// --- custom template ---
assert.equal(
  buildConfirmationSms(full, "Час: {date} {time} - {service} ({business})"),
  "Час: 03.07 14:00 - Ремонт (Демо ЕООД)",
  "custom template substituted"
);

// --- missing service: "за {service}" clause collapses, no leftover ---
const s2 = buildConfirmationSms({ ...full, service: null }, null);
assert.ok(!s2.includes("{service}") && !s2.includes("за  "), "no empty service artifact");
assert.ok(s2.includes("час на 03.07"), "reads 'час на <date>' when no service");

// --- missing phone: "За промяна" clause dropped ---
const s3 = buildConfirmationSms({ ...full, phone: null }, null);
assert.ok(!s3.includes("{phone}") && !s3.includes("За промяна"), "change clause dropped when no phone");
assert.ok(s3.includes("Благодарим"), "rest of message intact");

// --- blank template falls back to default ---
assert.equal(buildConfirmationSms(full, "   "), buildConfirmationSms(full, null), "blank template = default");
assert.ok(DEFAULT_CONFIRMATION_TEMPLATE.includes("{service}"), "default template has placeholders");

// --- confirmDedupeKey ---
assert.equal(confirmDedupeKey("abc-123"), "confirm:appt:abc-123", "dedupe key format");

console.log("confirmation: all tests passed");
