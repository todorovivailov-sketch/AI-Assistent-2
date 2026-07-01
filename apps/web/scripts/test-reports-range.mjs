// Unit tests for the pure reports range parser. Run (from apps/web): node ./scripts/test-reports-range.mjs
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

const { parseReportsRange } = await loadModule(["src", "lib", "dashboard", "reports-range.ts"]);

const now = new Date("2026-07-15T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// default -> 30d
let r = parseReportsRange({}, now);
assert.equal(r.preset, "30d", "default preset");
assert.equal(r.to.getTime(), now.getTime(), "default to = now");
assert.equal(r.from.getTime(), now.getTime() - 30 * DAY, "default from = now-30d");

// 7d
r = parseReportsRange({ range: "7d" }, now);
assert.equal(r.preset, "7d", "7d preset");
assert.equal(r.from.getTime(), now.getTime() - 7 * DAY, "7d from");

// month -> first of month (UTC) .. now
r = parseReportsRange({ range: "month" }, now);
assert.equal(r.preset, "month", "month preset");
assert.equal(r.from.toISOString(), "2026-07-01T00:00:00.000Z", "month start");

// custom valid
r = parseReportsRange({ from: "2026-06-01", to: "2026-06-10" }, now);
assert.equal(r.preset, "custom", "custom preset");
assert.equal(r.from.toISOString(), "2026-06-01T00:00:00.000Z", "custom from");
assert.ok(r.to.toISOString().startsWith("2026-06-10T23:59"), "custom to end-of-day");

// custom reversed -> fallback 30d
r = parseReportsRange({ from: "2026-06-10", to: "2026-06-01" }, now);
assert.equal(r.preset, "30d", "reversed falls back");

// custom garbage -> fallback 30d
r = parseReportsRange({ from: "nope", to: "2026-06-01" }, now);
assert.equal(r.preset, "30d", "garbage falls back");

console.log("reports-range: all tests passed");
