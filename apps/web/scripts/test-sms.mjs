// Unit tests for the Zadarma SMS encoder/normalizer. Run (from apps/web): node ./scripts/test-sms.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const { buildParamsString, normalizeMsisdn } = await loadModule(["src", "lib", "notifications", "sms.ts"]);

// Golden vector: must be byte-identical to PHP http_build_query(ksort, RFC1738).
const paramsString = buildParamsString({
  number: "359888123456",
  message: "Напомняне: утре 02.07, час! (тест) при Демо* ~end",
  caller_id: "35924372749",
  format: "json",
});
assert.equal(
  createHash("md5").update(paramsString).digest("hex"),
  "bdce0d52c5a62663c53b11761c213ed4",
  "params string byte-identical to PHP"
);

// Phone normalization → international, digits only.
assert.equal(normalizeMsisdn("+359 88 812 3456"), "359888123456", "strip + and spaces");
assert.equal(normalizeMsisdn("0888123456"), "359888123456", "BG local 0 → 359");
assert.equal(normalizeMsisdn("00359888123456"), "359888123456", "00 prefix → international");
assert.equal(normalizeMsisdn("359888123456"), "359888123456", "already international");

console.log("sms: all tests passed");
