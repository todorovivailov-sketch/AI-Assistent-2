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
const { parseServiceForm } = await loadModule(["src", "lib", "agent", "service-form.ts"]);
const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });

const ok = parseServiceForm(form({ name: "  Монтаж  ", description: " ", duration_minutes: "90", price_min: "50", price_max: "120", currency: "BGN", status: "active" }), "org-1");
assert.equal(ok.error, undefined, "valid");
assert.equal(ok.values.organization_id, "org-1", "org injected");
assert.equal(ok.values.name, "Монтаж", "name trimmed");
assert.equal(ok.values.description, null, "blank description -> null");
assert.equal(ok.values.duration_minutes, 90, "duration parsed");
assert.equal(ok.values.price_min, 50, "price_min parsed");
assert.equal(ok.values.price_max, 120, "price_max parsed");
assert.equal(ok.values.currency, "BGN", "currency kept");
assert.equal(ok.values.status, "active", "status kept");

assert.equal(parseServiceForm(form({}), "o").error, "service_name_required", "name required");
assert.equal(parseServiceForm(form({ name: "X", duration_minutes: "3" }), "o").error, "duration_out_of_range", "min duration");
assert.equal(parseServiceForm(form({ name: "X", duration_minutes: "5000" }), "o").error, "duration_out_of_range", "max duration");
assert.equal(parseServiceForm(form({ name: "X", price_min: "200", price_max: "100" }), "o").error, "price_range_invalid", "min>max");
const defaults = parseServiceForm(form({ name: "X" }), "o");
assert.equal(defaults.values.duration_minutes, 60, "default duration");
assert.equal(defaults.values.currency, "EUR", "default currency");
assert.equal(defaults.values.status, "active", "default status");
assert.equal(defaults.values.price_min, null, "no price -> null");
console.log("service-form checks passed");
