import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "src", "lib", "notifications", "owner-email.ts");
if (!existsSync(sourcePath)) throw new Error(`Missing module: ${sourcePath}`);
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { buildOwnerLeadEmail } = await import(moduleUrl);

const normal = buildOwnerLeadEmail(
  { name: "Иван", phone: "+359888111222", service_type: "Монтаж", city: "София", urgency: "normal" },
  "ХВАК ООД"
);
assert.ok(normal.subject.includes("Иван") && normal.subject.includes("Монтаж"), "subject names client + service");
assert.ok(normal.text.includes("+359888111222"), "body includes phone");
assert.ok(normal.text.includes("ХВАК ООД"), "body names the organization");

const urgent = buildOwnerLeadEmail(
  { name: "Мария", phone: "+359888000000", service_type: "Ремонт", city: "Варна", urgency: "emergency" },
  null
);
assert.ok(/спешн/i.test(urgent.subject), "emergency urgency flags the subject as urgent");

console.log("owner email builder checks passed");
