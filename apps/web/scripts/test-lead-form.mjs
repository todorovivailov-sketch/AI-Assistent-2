// Unit tests for the pure lead form/validation logic (no framework, no DB).
// Transpiles the TS module and imports it via a data URL (import lines stripped,
// since value imports can't resolve outside the bundler). Same pattern as
// test-active-organization.mjs.
// Run (from project root): node apps/web/scripts/test-lead-form.mjs
//   or (from apps/web):     node ./scripts/test-lead-form.mjs

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

const { parseLeadStatus, buildLeadInsertFromForm, LEAD_STATUSES } = await loadModule([
  "src",
  "lib",
  "crm",
  "lead-form.ts",
]);

const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });

assert.ok(LEAD_STATUSES.includes("won") && LEAD_STATUSES.includes("lost"), "pipeline statuses present");
assert.equal(parseLeadStatus("qualified"), "qualified", "valid status passes");
assert.equal(parseLeadStatus("garbage"), null, "invalid status rejected");
assert.equal(parseLeadStatus(123), null, "non-string rejected");

const ok = buildLeadInsertFromForm(
  form({ name: "  Иван  ", phone: "+359888123456", service_type: "Климатик" }),
  "org-1"
);
assert.equal(ok.error, undefined, "valid form has no error");
assert.equal(ok.values.organization_id, "org-1", "org id injected server-side");
assert.equal(ok.values.name, "Иван", "name trimmed");
assert.equal(ok.values.phone, "+359888123456", "phone kept");
assert.equal(ok.values.service_type, "Климатик", "service kept");
assert.equal(ok.values.source, "manual", "manual source");
assert.equal(ok.values.status, "new", "default status new");

const withStatus = buildLeadInsertFromForm(form({ phone: "0888", status: "qualified" }), "org-1");
assert.equal(withStatus.values.status, "qualified", "explicit valid status respected");

const bad = buildLeadInsertFromForm(form({}), "org-1");
assert.equal(bad.error, "name_or_phone_required", "must have a name or phone");
assert.equal(bad.values, null, "no values on error");

console.log("lead-form checks passed");
