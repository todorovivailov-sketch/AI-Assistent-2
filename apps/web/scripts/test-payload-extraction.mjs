import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "src", "lib", "vapi", "payload.ts");
if (!existsSync(sourcePath)) throw new Error(`Missing module: ${sourcePath}`);
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { buildLeadInsert, inferDisposition } = await import(moduleUrl);

function callInsert(structured) {
  return {
    organization_id: "org-1",
    caller_number: "+359888111222",
    summary: "test",
    disposition: inferDisposition(structured),
    structured_data: structured,
  };
}

// --- Task 1: preferred_time must not be dropped ---
const lead = buildLeadInsert("call-1", callInsert({ name: "Иван", requested_time: "утре следобед" }));
assert.equal(lead.preferred_time_text, "утре следобед", "requested_time must map to preferred_time_text");

const lead2 = buildLeadInsert("call-2", callInsert({ name: "Мария", preferred_time: "петък 14:00" }));
assert.equal(lead2.preferred_time_text, "петък 14:00", "preferred_time must map to preferred_time_text");

// --- Task 2: booking disposition must be detected from all schema variants ---
assert.equal(inferDisposition({ appointment_confirmed: true, name: "Иван" }), "appointment",
  "appointment_confirmed=true must yield 'appointment'");
assert.equal(inferDisposition({ next_action: "booked", name: "Иван" }), "appointment",
  "next_action=booked must yield 'appointment'");
assert.equal(inferDisposition({ disposition: "appointment" }), "appointment",
  "disposition=appointment must yield 'appointment'");
assert.equal(inferDisposition({ name: "Иван", phone: "+359888111222" }), "lead",
  "lead data with no booking signal stays 'lead'");

console.log("payload extraction checks passed");
