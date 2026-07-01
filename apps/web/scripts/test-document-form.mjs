// Unit tests for the pure document upload validator. Run (from apps/web): node ./scripts/test-document-form.mjs
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
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const { parseDocumentForm, MAX_DOCUMENT_BYTES } = await loadModule(["src", "lib", "agent", "document-form.ts"]);
const form = (map) => ({ get: (k) => (k in map ? map[k] : null) });
const file = (over) => ({ size: 1000, name: "price.pdf", type: "application/pdf", ...over });

const ok = parseDocumentForm(form({ file: file(), kind: "price_list", name: "  Ценова листа  " }));
assert.equal(ok.error, undefined, "valid");
assert.equal(ok.values.name, "Ценова листа", "name trimmed");
assert.equal(ok.values.kind, "price_list", "kind kept");
assert.equal(ok.file.name, "price.pdf", "file passed through");

assert.equal(parseDocumentForm(form({})).error, "document_file_required", "file required");
assert.equal(parseDocumentForm(form({ file: file({ size: 0 }) })).error, "document_file_required", "empty file rejected");
assert.equal(parseDocumentForm(form({ file: file({ size: MAX_DOCUMENT_BYTES + 1 }) })).error, "document_too_large", "too large");
assert.equal(parseDocumentForm(form({ file: file({ name: "virus.exe" }) })).error, "document_type_unsupported", "bad type");
assert.equal(parseDocumentForm(form({ file: file({ name: "a".repeat(45) + ".pdf" }) })).error, "document_name_too_long", "long filename as name");

const dflt = parseDocumentForm(form({ file: file({ name: "faq.txt" }) }));
assert.equal(dflt.values.name, "faq.txt", "name defaults to filename");
assert.equal(dflt.values.kind, "general", "kind defaults to general");
assert.equal(parseDocumentForm(form({ file: file(), kind: "bogus" })).values.kind, "general", "invalid kind -> general");

console.log("document-form checks passed");
