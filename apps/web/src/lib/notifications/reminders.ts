const SOFIA_TZ = "Europe/Sofia";

export type ReminderAppointment = {
  id: string;
  status: string;
  starts_at: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  service_type: string | null;
  location: string | null;
};

export type ReminderOrg = { name: string; owner_phone: string | null };

export type SofiaDayWindow = {
  startUtc: Date;
  endUtc: Date;
  dateLabel: string; // DD.MM
  isoDate: string; // YYYY-MM-DD
};

const REMINDER_STATUSES = new Set(["requested", "confirmed"]);

function sofiaOffsetMinutes(instant: Date): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: SOFIA_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtcWall = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtcWall - instant.getTime()) / 60000);
}

function sofiaYmd(instant: Date): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: SOFIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: g("year"), m: g("month"), d: g("day") };
}

function sofiaMidnightUtc(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offsetMin = sofiaOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMin * 60000);
}

export function sofiaDayWindow(now: Date, offsetDays: number): SofiaDayWindow {
  const today = sofiaYmd(now);
  const base = new Date(Date.UTC(today.y, today.m - 1, today.d));
  const target = new Date(base.getTime() + offsetDays * 86400000);
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;
  const td = target.getUTCDate();
  const next = new Date(target.getTime() + 86400000);
  const startUtc = sofiaMidnightUtc(ty, tm, td);
  const endUtc = sofiaMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startUtc,
    endUtc,
    dateLabel: `${pad(td)}.${pad(tm)}`,
    isoDate: `${ty}-${pad(tm)}-${pad(td)}`,
  };
}

export function formatSofiaTime(startsAt: string | Date): string {
  const d = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export function sofiaDateLabel(startsAt: string | Date): string {
  const d = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA_TZ,
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("day")}.${g("month")}`;
}

export function selectDueAppointments(
  rows: ReminderAppointment[],
  window: { startUtc: Date; endUtc: Date }
): ReminderAppointment[] {
  return rows.filter((r) => {
    if (!REMINDER_STATUSES.has(r.status)) return false;
    if (!r.customer_phone || !r.customer_phone.trim()) return false;
    if (!r.starts_at) return false;
    const t = new Date(r.starts_at).getTime();
    return Number.isFinite(t) && t >= window.startUtc.getTime() && t < window.endUtc.getTime();
  });
}

export function buildReminderSms(appt: ReminderAppointment, org: ReminderOrg): string {
  const time = formatSofiaTime(appt.starts_at as string);
  const date = sofiaDateLabel(appt.starts_at as string);
  const service = appt.service_type?.trim();
  const servicePart = service ? ` за ${service}` : "";
  const changePart = org.owner_phone?.trim() ? ` Промяна: ${org.owner_phone.trim()}` : "";
  return `Напомняне: утре ${date} ${time} имате час${servicePart} при ${org.name}.${changePart}`;
}

export function buildOwnerAgendaEmail(
  appts: ReminderAppointment[],
  org: { name: string | null },
  dateLabel: string
): { subject: string; text: string; html: string } {
  const count = appts.length;
  const noun = count === 1 ? "час" : "часа";
  const subject = `Утрешна програма (${dateLabel}) — ${count} ${noun}`;
  const sorted = [...appts].sort(
    (a, b) => new Date(a.starts_at as string).getTime() - new Date(b.starts_at as string).getTime()
  );
  const lines = sorted.map((a) => {
    const time = formatSofiaTime(a.starts_at as string);
    const name = a.customer_name?.trim() || "Клиент";
    const phone = a.customer_phone?.trim() || "—";
    const service = a.service_type?.trim() || "—";
    const loc = a.location?.trim() ? ` · ${a.location.trim()}` : "";
    return `${time} — ${name} (${phone}) · ${service}${loc}`;
  });
  const header = `Утрешна програма${org.name ? ` за ${org.name}` : ""} (${dateLabel}):`;
  const text = [header, "", ...lines].join("\n");
  const html = `<div><p>${header}</p>${lines.map((l) => `<p>${l}</p>`).join("")}</div>`;
  return { subject, text, html };
}

export function smsDedupeKey(appointmentId: string): string {
  return `sms:appt:${appointmentId}`;
}

export function agendaDedupeKey(isoDate: string): string {
  return `email:agenda:${isoDate}`;
}
