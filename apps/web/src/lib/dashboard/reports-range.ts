// Pure date-range parsing for the Reports page. Deterministic given `now` (injected in tests).

export type ReportsPreset = "7d" | "30d" | "month" | "custom";
export type ReportsRange = { from: Date; to: Date; preset: ReportsPreset };
export type ReportsRangeParams = { range?: string; from?: string; to?: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function parseReportsRange(params: ReportsRangeParams, now: Date = new Date()): ReportsRange {
  const from = parseDateOnly(params.from);
  const to = parseDateOnly(params.to);
  if (from && to && from.getTime() <= to.getTime()) {
    const end = new Date(to.getTime() + DAY_MS - 1); // include the whole "to" day
    return { from, to: end, preset: "custom" };
  }

  switch (params.range) {
    case "7d":
      return { from: daysBefore(now, 7), to: now, preset: "7d" };
    case "month":
      return { from: startOfMonthUTC(now), to: now, preset: "month" };
    case "30d":
    default:
      return { from: daysBefore(now, 30), to: now, preset: "30d" };
  }
}
