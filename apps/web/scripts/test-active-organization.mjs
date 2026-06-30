import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const src = path.join(process.cwd(), "src", "lib", "auth", "organization.ts");
if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
const out = ts.transpileModule(readFileSync(src, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
});
// Strip top-level value imports (e.g. the supabase server client): we only exercise the
// pure selection function here, and the "@/..." path alias is not resolvable outside the bundler.
const code = out.outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const { pickActiveMembership } = await import(url);

assert.equal(pickActiveMembership([]), null, "no memberships -> null");
assert.deepEqual(
  pickActiveMembership([{ organization_id: "a", role: "viewer" }]),
  { organization_id: "a", role: "viewer" },
  "single membership is selected"
);
assert.equal(
  pickActiveMembership([
    { organization_id: "a", role: "viewer" },
    { organization_id: "b", role: "owner" },
  ]).organization_id,
  "b",
  "owner/admin is preferred when multiple memberships exist"
);
assert.equal(
  pickActiveMembership([
    { organization_id: "a", role: "operator" },
    { organization_id: "b", role: "admin" },
    { organization_id: "c", role: "viewer" },
  ]).organization_id,
  "b",
  "admin outranks operator and viewer"
);
console.log("active organization selection checks passed");
