// Unit tests for pure missed-call helpers. Run (from apps/web): node ./scripts/test-missed-call.mjs
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
  isMissEndedReason,
  isLikelyBgMobile,
  classifyMissedCall,
  buildMissedCallSms,
  missDedupeKey,
  DEFAULT_MISSED_CALL_TEMPLATE,
} = await loadModule(["src", "lib", "notifications", "missed-call.ts"]);

// --- isMissEndedReason ---
assert.equal(isMissEndedReason("silence-timed-out"), true, "silence is a miss");
assert.equal(isMissEndedReason("call.in-progress.error-assistant-did-not-receive-customer-audio"), true, "dotted error is a miss");
assert.equal(isMissEndedReason("customer-did-not-answer"), true, "no answer is a miss");
assert.equal(isMissEndedReason("customer-ended-call"), false, "normal hangup is not a miss reason");
assert.equal(isMissEndedReason(null), false, "null is not a miss reason");

// --- isLikelyBgMobile ---
assert.equal(isLikelyBgMobile("+359888123456"), true, "BG mobile");
assert.equal(isLikelyBgMobile("+35924372749"), false, "BG landline (Sofia)");
assert.equal(isLikelyBgMobile("+491701234567"), false, "foreign number");
assert.equal(isLikelyBgMobile("0888123456"), false, "non-E164");
assert.equal(isLikelyBgMobile(null), false, "null");

// --- classifyMissedCall ---
const mobile = "+359888123456";
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "silence-timed-out", durationSeconds: 0, disposition: "lead", capturedIntent: false }).isMiss,
  true, "failure reason + no intent = miss (disposition 'lead' from injected phone must not block)"
);
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "customer-ended-call", durationSeconds: 8, disposition: "lead", capturedIntent: false }).isMiss,
  true, "short call + no intent = miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "silence-timed-out", durationSeconds: 2, disposition: "lead", capturedIntent: true }).isMiss,
  false, "captured intent = not a miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "customer-ended-call", durationSeconds: 40, disposition: "lead", capturedIntent: false }).isMiss,
  false, "long normal call, no capture = not a miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: null, endedReason: "silence-timed-out", durationSeconds: 0, disposition: "unknown", capturedIntent: false }).isMiss,
  false, "no number = not a miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: "+35924372749", endedReason: "silence-timed-out", durationSeconds: 0, disposition: "lead", capturedIntent: false }).isMiss,
  false, "landline = not a miss"
);
assert.equal(
  classifyMissedCall({ callerNumber: mobile, endedReason: "silence-timed-out", durationSeconds: 0, disposition: "spam", capturedIntent: false }).isMiss,
  false, "spam disposition = not a miss"
);

// --- buildMissedCallSms ---
assert.equal(buildMissedCallSms("Здравей {business}!", { business: "Демо" }), "Здравей Демо!", "substitutes {business}");
assert.ok(buildMissedCallSms(null, { business: "Демо" }).includes("Демо"), "null template falls back to default with business");
assert.ok(!buildMissedCallSms(null, { business: "Демо" }).includes("{business}"), "no leftover placeholder");
assert.equal(buildMissedCallSms("   ", { business: "Демо" }), DEFAULT_MISSED_CALL_TEMPLATE.replace("{business}", "Демо"), "blank template falls back to default");

// --- missDedupeKey ---
assert.equal(missDedupeKey("+359888123456", "2026-07-02"), "miss:+359888123456:2026-07-02", "dedupe key format");

console.log("missed-call: all tests passed");
