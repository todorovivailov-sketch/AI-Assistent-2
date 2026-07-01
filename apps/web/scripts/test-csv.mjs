// Unit tests for the pure CSV serializer. Run (from apps/web): node ./scripts/test-csv.mjs
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

const { toCsv } = await loadModule(["src", "lib", "dashboard", "csv.ts"]);

const csv = toCsv(
  ["Име", "Услуга", "Стойност"],
  [
    ["Иван", "Монтаж", 150],
    ['Ана, "Бизнес"', "Ред1\nРед2", ""],
    ["Петър", null, 60],
  ]
);

assert.ok(csv.startsWith("﻿"), "starts with UTF-8 BOM");
const lines = csv.slice(1).split("\r\n");
assert.equal(lines[0], "Име,Услуга,Стойност", "header row");
assert.equal(lines[1], "Иван,Монтаж,150", "simple row");
assert.equal(lines[2], '"Ана, ""Бизнес""","Ред1\nРед2",', "escaped comma/quotes/newline + empty cell");
assert.equal(lines[3], "Петър,,60", "null becomes empty cell");

console.log("csv: all tests passed");
