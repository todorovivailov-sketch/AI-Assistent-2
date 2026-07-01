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
const { parseServiceAreaForm } = await loadModule(["src", "lib", "agent", "service-area-form.ts"]);
const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });
const ok = parseServiceAreaForm(form({ city: "  Пловдив  ", region: "Тракия", status: "active" }), "org-1");
assert.equal(ok.error, undefined, "valid");
assert.equal(ok.values.organization_id, "org-1", "org injected");
assert.equal(ok.values.city, "Пловдив", "city trimmed");
assert.equal(ok.values.region, "Тракия", "region kept");
assert.equal(parseServiceAreaForm(form({}), "o").error, "city_required", "city required");
assert.equal(parseServiceAreaForm(form({ city: "X" }), "o").values.region, null, "no region -> null");
assert.equal(parseServiceAreaForm(form({ city: "X" }), "o").values.status, "active", "default status");
console.log("service-area-form checks passed");
