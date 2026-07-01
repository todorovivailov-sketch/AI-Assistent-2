import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
  }).outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { parseBusinessHoursForm } = await loadModule(["src", "lib", "agent", "business-hours-form.ts"]);
const multi = (map) => ({ get: (k) => (k in map ? map[k] : null), getAll: (k) => (k in map ? [].concat(map[k]) : []) });

const ok = parseBusinessHoursForm(
  multi({
    weekday: ["1", "2", "6"],
    is_closed: ["", "", "on"],
    opens_at: ["09:00", "10:00", ""],
    closes_at: ["18:00", "19:00", ""],
  }),
  "org-1"
);
assert.equal(ok.error, undefined, "valid week");
assert.equal(ok.values.length, 3, "3 rows");
assert.equal(ok.values[0].organization_id, "org-1", "org injected");
assert.equal(ok.values[0].weekday, 1, "weekday parsed");
assert.equal(ok.values[0].is_closed, false, "open day");
assert.equal(ok.values[0].opens_at, "09:00", "opens kept");
assert.equal(ok.values[2].is_closed, true, "closed day");
assert.equal(ok.values[2].opens_at, null, "closed -> null times");

const bad = parseBusinessHoursForm(multi({ weekday: ["1"], is_closed: [""], opens_at: ["18:00"], closes_at: ["09:00"] }), "o");
assert.equal(bad.error, "hours_invalid_range", "open must be before close");
const missing = parseBusinessHoursForm(multi({ weekday: ["1"], is_closed: [""], opens_at: [""], closes_at: [""] }), "o");
assert.equal(missing.error, "hours_invalid_range", "open day needs both times");
console.log("business-hours-form checks passed");
