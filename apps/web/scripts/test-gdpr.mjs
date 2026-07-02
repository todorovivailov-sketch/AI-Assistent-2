// Unit tests for pure GDPR helpers. Run (from apps/web): node ./scripts/test-gdpr.mjs
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
  normalizePhone,
  phoneMatchSuffix,
  callAnonymizePatch,
  leadScrubPatch,
  appointmentScrubPatch,
  orderScrubPatch,
} = await loadModule(["src", "lib", "gdpr", "subject.ts"]);
const { vapiDeleteCallPath } = await loadModule(["src", "lib", "vapi", "call-client.ts"]);

// --- normalizePhone ---
assert.equal(normalizePhone("+359888123456"), "+359888123456", "already E.164");
assert.equal(normalizePhone("0888123456"), "+359888123456", "BG national 0-prefix");
assert.equal(normalizePhone("00359888123456"), "+359888123456", "00 prefix");
assert.equal(normalizePhone("359888123456"), "+359888123456", "bare country code");
assert.equal(normalizePhone("+359 888 123 456"), "+359888123456", "spaces stripped");
assert.equal(normalizePhone("088-812-3456"), "+359888123456", "dashes stripped");
assert.equal(normalizePhone(""), null, "empty -> null");
assert.equal(normalizePhone(null), null, "null -> null");
assert.equal(normalizePhone("888123456"), null, "ambiguous 9-digit -> null (conservative)");

// --- phoneMatchSuffix ---
assert.equal(phoneMatchSuffix("+359888123456"), "88123456", "last 8 digits");

// --- callAnonymizePatch ---
const cp = callAnonymizePatch("2026-07-02T10:00:00.000Z");
assert.equal(cp.caller_number, null);
assert.equal(cp.transcript, null);
assert.equal(cp.recording_url, null);
assert.equal(cp.summary, null);
assert.deepEqual(cp.structured_data, {});
assert.deepEqual(cp.raw_payload, {});
assert.equal(cp.anonymized_at, "2026-07-02T10:00:00.000Z");
assert.ok(!("duration_seconds" in cp), "keeps stats untouched (not in patch)");
assert.ok(!("disposition" in cp), "keeps disposition untouched (not in patch)");

// --- leadScrubPatch ---
const lp = leadScrubPatch();
for (const k of ["name", "phone", "email", "address", "preferred_time_text", "ai_summary", "notes"]) {
  assert.equal(lp[k], null, `lead ${k} cleared`);
}
assert.ok(!("city" in lp), "lead city kept");
assert.ok(!("service_type" in lp), "lead service_type kept");

// --- appointmentScrubPatch ---
const ap = appointmentScrubPatch();
for (const k of ["customer_name", "customer_phone", "location", "notes"]) {
  assert.equal(ap[k], null, `appt ${k} cleared`);
}
assert.equal(ap.title, "Анонимизиран запис", "appt title genericized (NOT NULL column)");

// --- orderScrubPatch ---
const op = orderScrubPatch();
assert.equal(op.description, null);
assert.equal(op.notes, null);

// --- vapiDeleteCallPath ---
assert.equal(vapiDeleteCallPath("abc123"), "/call/abc123", "delete path");
assert.equal(vapiDeleteCallPath("a b"), "/call/a%20b", "encodes id");

console.log("gdpr: all tests passed");
