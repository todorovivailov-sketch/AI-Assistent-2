type FormLike = { get(name: string): unknown };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export const AREA_STATUSES = ["active", "paused"] as const;
export type AreaStatus = (typeof AREA_STATUSES)[number];
const parseStatus = (v: unknown): AreaStatus =>
  typeof v === "string" && (AREA_STATUSES as readonly string[]).includes(v) ? (v as AreaStatus) : "active";

export type ServiceAreaValues = {
  organization_id: string;
  city: string;
  region: string | null;
  status: AreaStatus;
};

export function parseServiceAreaForm(form: FormLike, organizationId: string): { error?: string; values: ServiceAreaValues | null } {
  const city = text(form.get("city"));
  if (!city) return { error: "city_required", values: null };
  return {
    error: undefined,
    values: {
      organization_id: organizationId,
      city,
      region: text(form.get("region")),
      status: parseStatus(form.get("status")),
    },
  };
}
