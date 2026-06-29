import { CalendarPlus, ChevronLeft, ChevronRight, Clock, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getCalendarAppointments, type CalendarAppointment } from "@/lib/live-data";

export const dynamic = "force-dynamic";

const calendarStartHour = 8;
const calendarEndHour = 19;
const calendarTotalMinutes = (calendarEndHour - calendarStartHour) * 60;
const hours = Array.from({ length: calendarEndHour - calendarStartHour + 1 }, (_, index) => calendarStartHour + index);

type AppointmentsPageProps = {
  searchParams?: Promise<{
    week?: string;
  }>;
};

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps) {
  const params = await searchParams;
  const weekStart = getWeekStart(parseWeekParam(params?.week) ?? new Date());
  const weekEnd = addDays(weekStart, 7);
  const appointments = await getCalendarAppointments(weekStart, weekEnd);
  const scheduled = appointments.filter((appointment) => appointment.startsAt);
  const unscheduled = appointments.filter((appointment) => !appointment.startsAt);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const previousWeek = formatDateParam(addDays(weekStart, -7));
  const nextWeek = formatDateParam(addDays(weekStart, 7));

  return (
    <>
      <PageHeader
        eyebrow="Часове и заетост"
        title="Календар"
        actions={
          <>
            <Link
              href={`/appointments?week=${previousWeek}`}
              className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:text-[var(--foreground)]"
              title="Предишна седмица"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </Link>
            <Link
              href="/appointments"
              className="inline-flex h-9 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)]"
            >
              Днес
            </Link>
            <Link
              href={`/appointments?week=${nextWeek}`}
              className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:text-[var(--foreground)]"
              title="Следваща седмица"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-medium text-white"
              title="Нов час"
            >
              <CalendarPlus size={16} aria-hidden="true" />
              Нов час
            </button>
          </>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{formatWeekRange(weekStart, weekEnd)}</h2>
              <div className="mt-1 font-mono text-xs text-[var(--ink-soft)]">08:00 - 19:00 / Europe/Sofia</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--ink-soft)]">
              <span className="inline-flex size-2 rounded-full bg-blue-500" />
              Заявени
              <span className="ml-2 inline-flex size-2 rounded-full bg-teal-600" />
              Потвърдени
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-[72px_repeat(7,minmax(120px,1fr))]">
              <div className="border-b border-r border-[var(--line)] bg-[var(--surface-muted)]" />
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`border-b border-r border-[var(--line)] bg-[var(--surface-muted)] px-3 py-3 ${
                    isToday(day) ? "text-teal-700 dark:text-teal-300" : ""
                  }`}
                >
                  <div className="text-xs font-medium uppercase text-[var(--ink-soft)]">{formatWeekday(day)}</div>
                  <div className="mt-1 text-lg font-semibold">{formatDayNumber(day)}</div>
                </div>
              ))}

              <div className="relative border-r border-[var(--line)]" style={{ height: 660 }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 -translate-y-2 px-3 text-right font-mono text-xs text-[var(--ink-soft)]"
                    style={{ top: `${((hour - calendarStartHour) * 60 * 100) / calendarTotalMinutes}%` }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {weekDays.map((day) => (
                <DayColumn
                  key={day.toISOString()}
                  day={day}
                  appointments={scheduled.filter((appointment) => isSameSofiaDate(appointment.startsAt, day))}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Предстоящи часове</h2>
            <div className="mt-1 font-mono text-xs text-[var(--ink-soft)]">{scheduled.length} за седмицата</div>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {scheduled.map((appointment) => (
              <AppointmentListItem key={appointment.id} appointment={appointment} />
            ))}
            {scheduled.length === 0 ? (
              <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма записани часове за тази седмица.</div>
            ) : null}
          </div>

          {unscheduled.length > 0 ? (
            <>
              <div className="border-y border-[var(--line)] px-4 py-3">
                <h2 className="text-sm font-semibold">Без точен час</h2>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {unscheduled.map((appointment) => (
                  <AppointmentListItem key={appointment.id} appointment={appointment} />
                ))}
              </div>
            </>
          ) : null}
        </aside>
      </section>
    </>
  );
}

function DayColumn({ day, appointments }: { day: Date; appointments: CalendarAppointment[] }) {
  return (
    <div className="relative border-r border-[var(--line)]" style={{ height: 660 }}>
      {hours.slice(0, -1).map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-[var(--line)]"
          style={{ top: `${((hour - calendarStartHour) * 60 * 100) / calendarTotalMinutes}%` }}
        />
      ))}

      {appointments.map((appointment) => (
        <AppointmentBlock key={appointment.id} appointment={appointment} />
      ))}

      {isToday(day) ? <div className="absolute inset-y-0 left-0 w-0.5 bg-teal-600" /> : null}
    </div>
  );
}

function AppointmentBlock({ appointment }: { appointment: CalendarAppointment }) {
  const position = getAppointmentPosition(appointment);

  return (
    <div
      className={`absolute left-2 right-2 overflow-hidden rounded-md border px-2 py-2 text-xs shadow-sm ${
        appointment.status === "confirmed"
          ? "border-teal-300 bg-teal-50 text-teal-950 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-100"
          : "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
      }`}
      style={{
        top: position.top,
        minHeight: 46,
        height: position.height,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">{formatAppointmentTime(appointment)}</span>
        {appointment.hasGoogleEvent ? <span className="font-mono text-[10px] opacity-70">GCal</span> : null}
      </div>
      <div className="mt-1 truncate font-semibold">{appointment.customerName}</div>
      <div className="mt-0.5 truncate opacity-80">{appointment.serviceType}</div>
    </div>
  );
}

function AppointmentListItem({ appointment }: { appointment: CalendarAppointment }) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{appointment.customerName}</div>
          <div className="mt-1 truncate text-sm text-[var(--ink-soft)]">{appointment.serviceType}</div>
        </div>
        <StatusBadge value={appointment.status} />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-[var(--ink-soft)]">
        <div className="flex items-center gap-2">
          <Clock size={14} aria-hidden="true" />
          <span>{appointment.startsAt ? formatDateTime(appointment.startsAt) : "Няма точен час"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone size={14} aria-hidden="true" />
          <span className="font-mono">{appointment.customerPhone}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={14} aria-hidden="true" />
          <span className="truncate">{appointment.location}</span>
        </div>
      </div>
    </div>
  );
}

function getAppointmentPosition(appointment: CalendarAppointment) {
  const start = appointment.startsAt ? new Date(appointment.startsAt) : null;
  const end = appointment.endsAt ? new Date(appointment.endsAt) : null;

  if (!start) {
    return { top: "0%", height: "48px" };
  }

  const sofiaParts = getSofiaDateParts(start);
  const startMinutes = sofiaParts.hour * 60 + sofiaParts.minute;
  const endMinutes = end ? getSofiaDateParts(end).hour * 60 + getSofiaDateParts(end).minute : startMinutes + 60;
  const offset = Math.max(0, startMinutes - calendarStartHour * 60);
  const duration = Math.max(30, endMinutes - startMinutes);

  return {
    top: `${(offset * 100) / calendarTotalMinutes}%`,
    height: `${(duration * 100) / calendarTotalMinutes}%`,
  };
}

function getWeekStart(value: Date) {
  const date = new Date(value);
  const sofia = getSofiaDateParts(date);
  const localDate = new Date(Date.UTC(sofia.year, sofia.month - 1, sofia.day));
  const day = localDate.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  localDate.setUTCDate(localDate.getUTCDate() + diff);
  localDate.setUTCHours(0, 0, 0, 0);
  return localDate;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function parseWeekParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateParam(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatWeekRange(start: Date, end: Date) {
  const lastDay = addDays(end, -1);
  return `${formatShortDate(start)} - ${formatShortDate(lastDay)}`;
}

function formatWeekday(value: Date) {
  return new Intl.DateTimeFormat("bg-BG", { weekday: "short", timeZone: "UTC" }).format(value);
}

function formatDayNumber(value: Date) {
  return new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "short", timeZone: "UTC" }).format(value);
}

function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "short", timeZone: "UTC" }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAppointmentTime(appointment: CalendarAppointment) {
  if (!appointment.startsAt) return "--:--";
  const start = formatTime(appointment.startsAt);
  const end = appointment.endsAt ? formatTime(appointment.endsAt) : null;
  return end ? `${start}-${end}` : start;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isToday(value: Date) {
  const now = new Date();
  const today = getSofiaDateParts(now);
  const candidate = getSofiaDateParts(value);
  return today.year === candidate.year && today.month === candidate.month && today.day === candidate.day;
}

function isSameSofiaDate(value: string | null, day: Date) {
  if (!value) return false;
  const left = getSofiaDateParts(new Date(value));
  const right = getSofiaDateParts(day);
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function getSofiaDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour ?? 0),
    minute: Number(map.minute ?? 0),
  };
}
