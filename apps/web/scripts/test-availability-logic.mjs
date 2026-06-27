import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "src", "lib", "vapi", "availability-logic.ts");

if (!existsSync(sourcePath)) {
  throw new Error(`Missing availability logic module: ${sourcePath}`);
}

const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { getIntervalAvailability } = await import(moduleUrl);

function instant(value) {
  return new Date(value);
}

const workingWindows = [
  {
    startsAt: instant("2026-06-29T06:00:00.000Z"),
    endsAt: instant("2026-06-29T14:00:00.000Z"),
  },
];
const minNoticeAt = instant("2026-06-29T05:00:00.000Z");

assert.equal(
  getIntervalAvailability({
    startsAt: instant("2026-06-29T12:30:00.000Z"),
    endsAt: instant("2026-06-29T13:30:00.000Z"),
    workingWindows,
    existing: [],
    bufferMinutes: 0,
    minNoticeAt,
  }).available,
  true,
  "off-grid requested times should be checked directly, not rejected because they are not generated slots"
);

assert.deepEqual(
  getIntervalAvailability({
    startsAt: instant("2026-06-29T10:00:00.000Z"),
    endsAt: instant("2026-06-29T11:00:00.000Z"),
    workingWindows,
    existing: [
      {
        startsAt: instant("2026-06-29T09:00:00.000Z"),
        endsAt: instant("2026-06-29T10:00:00.000Z"),
      },
    ],
    bufferMinutes: 15,
    minNoticeAt,
  }),
  { available: false, reason: "conflict" },
  "buffer minutes should block immediately adjacent appointments"
);

assert.equal(
  getIntervalAvailability({
    startsAt: instant("2026-06-29T10:00:00.000Z"),
    endsAt: instant("2026-06-29T11:00:00.000Z"),
    workingWindows,
    existing: [
      {
        startsAt: instant("2026-06-29T09:00:00.000Z"),
        endsAt: instant("2026-06-29T10:00:00.000Z"),
      },
    ],
    bufferMinutes: 0,
    minNoticeAt,
  }).available,
  true,
  "without buffer, back-to-back appointments should be allowed"
);

assert.deepEqual(
  getIntervalAvailability({
    startsAt: instant("2026-06-29T14:00:00.000Z"),
    endsAt: instant("2026-06-29T15:00:00.000Z"),
    workingWindows,
    existing: [],
    bufferMinutes: 0,
    minNoticeAt,
  }),
  { available: false, reason: "outside_business_hours" },
  "appointments must fit inside the working window"
);

console.log("availability logic checks passed");
