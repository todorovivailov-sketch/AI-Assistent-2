// Minimal CSV serialization with an Excel-friendly UTF-8 BOM. Pure — tested in scripts/test-csv.mjs.

const BOM = "﻿";

type Cell = string | number | null | undefined;

function escapeCell(value: Cell): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return BOM + lines.join("\r\n");
}
