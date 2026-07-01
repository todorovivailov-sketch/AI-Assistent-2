// Pure validator for the weekly-hours grid. The form submits parallel arrays indexed by row:
// weekday[], is_closed[] ("on" | ""), opens_at[], closes_at[]. Returns one row per submitted weekday.
type MultiFormLike = { get(name: string): unknown; getAll(name: string): unknown[] };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export type BusinessHourValues = {
  organization_id: string;
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

export function parseBusinessHoursForm(
  form: MultiFormLike,
  organizationId: string
): { error?: string; values: BusinessHourValues[] | null } {
  const weekdays = form.getAll("weekday");
  const closed = form.getAll("is_closed");
  const opens = form.getAll("opens_at");
  const closes = form.getAll("closes_at");
  const rows: BusinessHourValues[] = [];

  for (let i = 0; i < weekdays.length; i++) {
    const weekday = Number(text(weekdays[i]));
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "weekday_invalid", values: null };
    const isClosed = text(closed[i]) === "on";
    const opensAt = text(opens[i]);
    const closesAt = text(closes[i]);
    if (!isClosed) {
      if (!opensAt || !closesAt || opensAt >= closesAt) return { error: "hours_invalid_range", values: null };
    }
    rows.push({
      organization_id: organizationId,
      weekday,
      opens_at: isClosed ? null : opensAt,
      closes_at: isClosed ? null : closesAt,
      is_closed: isClosed,
    });
  }
  return { error: undefined, values: rows };
}
