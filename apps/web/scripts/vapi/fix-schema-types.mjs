// Fixes the Vapi structured-data schema so it passes the Publish validator: Vapi requires each property
// `type` to be a single string (e.g. "string"), but the schema has `["string","null"]` (JSON-Schema
// nullable form). This normalizes any array `type` to its first non-"null" member and PATCHes ONLY
// analysisPlan (the system prompt / model / voice / tools are untouched).
//
// Usage (from project root):
//   node apps/web/scripts/vapi/fix-schema-types.mjs          -> inspect only (no changes)
//   node apps/web/scripts/vapi/fix-schema-types.mjs fix      -> apply the fix

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "3a342308-b8fb-4194-a629-08fd978fdeea";
const MODE = process.argv[2] === "fix" ? "fix" : "inspect";

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = { ...loadEnv(path.join(ROOT, "apps", "web", ".env.local")), ...loadEnv(path.join(ROOT, ".env.local")) };
const key = env.VAPI_PRIVATE_KEY || env.VAPI_API_KEY;
if (!key) {
  console.error("No VAPI_PRIVATE_KEY / VAPI_API_KEY in .env.local");
  process.exit(1);
}

// Recursively convert any array `type` (e.g. ["string","null"]) to a single non-null type string.
function normalizeSchema(node) {
  if (Array.isArray(node)) return node.map(normalizeSchema);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "type" && Array.isArray(v)) {
        out[k] = v.find((t) => t !== "null") ?? "string";
      } else {
        out[k] = normalizeSchema(v);
      }
    }
    return out;
  }
  return node;
}

async function api(method, p, body) {
  const res = await fetch(`https://api.vapi.ai${p}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

function reportTypes(schema) {
  const props = schema?.properties ?? {};
  const arrays = [];
  for (const [name, def] of Object.entries(props)) {
    const t = def?.type;
    if (Array.isArray(t)) arrays.push(`${name}=${JSON.stringify(t)}`);
  }
  console.log(`  properties: ${Object.keys(props).length}`);
  console.log(`  array-typed (rejected by Publish): ${arrays.length}${arrays.length ? " -> " + arrays.join(", ") : ""}`);
  return arrays.length;
}

const got = await api("GET", `/assistant/${ASSISTANT_ID}`);
if (got.status !== 200) {
  console.error(`GET -> ${got.status}: ${got.text.slice(0, 200)}`);
  process.exit(1);
}
const ap = got.json.analysisPlan ?? {};
const schema = ap.structuredDataPlan?.schema;
console.log(`=== ${got.json.name} (${ASSISTANT_ID}) ===`);
const before = reportTypes(schema);

if (MODE === "inspect") {
  console.log(`\n(inspect only — no changes. Re-run with 'fix' to normalize ${before} array types.)`);
  process.exit(0);
}

if (before === 0) {
  console.log("\nNothing to fix — no array types present.");
  process.exit(0);
}

const fixedAnalysisPlan = {
  ...ap,
  structuredDataPlan: { ...ap.structuredDataPlan, schema: normalizeSchema(schema) },
};

console.log(`\nApplying schema-type fix (analysisPlan only) ...`);
const patch = await api("PATCH", `/assistant/${ASSISTANT_ID}`, { analysisPlan: fixedAnalysisPlan });
console.log(`PATCH status: ${patch.status}`);
if (patch.status >= 300) {
  console.error(`PATCH failed: ${patch.text.slice(0, 500)}`);
  process.exit(1);
}

const after = await api("GET", `/assistant/${ASSISTANT_ID}`);
console.log(`\nAfter:`);
const remaining = reportTypes(after.json.analysisPlan?.structuredDataPlan?.schema);
console.log(remaining === 0 ? "\nDone — publish should pass now." : "\nStill some array types — review in Vapi.");
