// Pure validator for a service. Prices are optional and stored for the owner's reference (NOT spoken).
type FormLike = { get(name: string): unknown };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => {
  const s = text(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export const SERVICE_STATUSES = ["active", "paused", "archived"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
const parseStatus = (v: unknown): ServiceStatus =>
  typeof v === "string" && (SERVICE_STATUSES as readonly string[]).includes(v) ? (v as ServiceStatus) : "active";

export type ServiceValues = {
  organization_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  status: ServiceStatus;
};

export function parseServiceForm(form: FormLike, organizationId: string): { error?: string; values: ServiceValues | null } {
  const name = text(form.get("name"));
  if (!name) return { error: "service_name_required", values: null };

  const duration = num(form.get("duration_minutes")) ?? 60;
  if (duration < 5 || duration > 1440) return { error: "duration_out_of_range", values: null };

  const priceMin = num(form.get("price_min"));
  const priceMax = num(form.get("price_max"));
  if ((priceMin !== null && priceMin < 0) || (priceMax !== null && priceMax < 0))
    return { error: "price_negative", values: null };
  if (priceMin !== null && priceMax !== null && priceMin > priceMax)
    return { error: "price_range_invalid", values: null };

  return {
    error: undefined,
    values: {
      organization_id: organizationId,
      name,
      description: text(form.get("description")),
      duration_minutes: duration,
      price_min: priceMin,
      price_max: priceMax,
      currency: text(form.get("currency")) ?? "EUR",
      status: parseStatus(form.get("status")),
    },
  };
}
