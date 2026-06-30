// Pure, framework-free validation + FormData->row mapping for leads.
// No DB, no Next imports -> unit-testable via the transpile/data-URL pattern.
// The server action injects organization_id from the session (never trust the client).

export const LEAD_STATUSES = ["new", "qualified", "booked", "quoted", "won", "lost", "spam"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function parseLeadStatus(value: unknown): LeadStatus | null {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value)
    ? (value as LeadStatus)
    : null;
}

type FormLike = { get(name: string): unknown };

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export type LeadInsertValues = {
  organization_id: string;
  status: LeadStatus;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  service_type: string | null;
  source: string;
  notes: string | null;
};

export function buildLeadInsertFromForm(
  form: FormLike,
  organizationId: string
): { error?: string; values: LeadInsertValues | null } {
  const name = text(form.get("name"));
  const phone = text(form.get("phone"));
  if (!name && !phone) return { error: "name_or_phone_required", values: null };

  return {
    error: undefined,
    values: {
      organization_id: organizationId,
      status: parseLeadStatus(form.get("status")) ?? "new",
      name,
      phone,
      email: text(form.get("email")),
      city: text(form.get("city")),
      service_type: text(form.get("service_type")),
      source: "manual",
      notes: text(form.get("notes")),
    },
  };
}
