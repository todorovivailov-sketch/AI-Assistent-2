// Pure, dependency-free (the test harness strips imports). The caller passes
// already-formatted `date` (DD.MM) and `time` (HH:MM) — computed via
// reminders.ts at the call site so this module stays self-contained.

export const DEFAULT_CONFIRMATION_TEMPLATE =
  "Здравейте! Записахме Ви час за {service} на {date} в {time} ч. при {business}. За промяна: {phone}. Благодарим!";

export type ConfirmationVars = {
  service: string | null;
  date: string;
  time: string;
  business: string;
  phone: string | null;
};

export function confirmDedupeKey(appointmentId: string): string {
  return `confirm:appt:${appointmentId}`;
}

export function buildConfirmationSms(vars: ConfirmationVars, template: string | null): string {
  const base = (template && template.trim()) || DEFAULT_CONFIRMATION_TEMPLATE;
  const service = vars.service?.trim() || "";
  const phone = vars.phone?.trim() || "";

  let text = base;

  // service: drop the "за {service}" clause entirely when there is no service
  if (service) {
    text = text.replace(/\{service\}/g, service);
  } else {
    text = text.replace(/за\s*\{service\}\s*/g, "").replace(/\{service\}/g, "");
  }

  // phone: drop the "За промяна: {phone}." clause entirely when there is no phone
  if (phone) {
    text = text.replace(/\{phone\}/g, phone);
  } else {
    text = text.replace(/За промяна:\s*\{phone\}\.?\s*/g, "").replace(/\{phone\}/g, "");
  }

  text = text
    .replace(/\{date\}/g, vars.date)
    .replace(/\{time\}/g, vars.time)
    .replace(/\{business\}/g, vars.business);

  return text.replace(/\s{2,}/g, " ").trim();
}
