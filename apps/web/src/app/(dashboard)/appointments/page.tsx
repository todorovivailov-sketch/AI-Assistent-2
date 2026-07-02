import { Clock, Lock, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import AppointmentDrawer from "@/components/appointment-drawer";
import { CalendarToolbar } from "@/components/calendar-toolbar";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  getCalendarAppointmentById,
  getCalendarPageAppointments,
  type DashboardAppointmentListItem,
} from "@/lib/dashboard/data";

import { NewAppointmentButton } from "./new-appointment-button";

export const dynamic = "force-dynamic";

const calendarStartHour = 8;
const calendarEndHour = 19;
const calendarTotalMinutes = (calendarEndHour - calendarStartHour) * 60;
const hours = Array.from({ length: calendarEndHour - calendarStartHour + 1 }, (_, index) => calendarStartHour + index);

type AppointmentsPageProps = {
  searchParams?: Promise<{
    week?: string;
    appointment?: string;
  }>;
};

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps) {
  const params = await searchParams;
  const selectedAppointmentId = params?.appointment ?? null;
  const focusedAppointment = selectedAppointmentId ? await getCalendarAppointmentById(selectedAppointmentId) : null;
  const weekBase = parseWeekParam(params?.week) ?? (focusedAppointment?.startsAt ? new Date(focusedAppointment.startsAt) : new Date());
  const weekStart = getWeekStart(weekBase);
  const weekEnd = addDays(weekStart, 7);
  const appointments = mergeFocusedAppointment(
    await getCalendarPageAppointments(weekStart, weekEnd),
    focusedAppointment
  );
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
            <NewAppointmentButton />
            <CalendarToolbar previousWeek={previousWeek} nextWeek={nextWeek} />
          </>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="syn-card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{formatWeekRange(weekStart, weekEnd)}</h2>
              <div className="mt-1 font-mono text-xs text-[var(--ink-muted)]">08:00 - 19:00 / Europe/Sofia</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--ink-soft)]">
              <span className="inline-flex size-2 rounded-full bg-blue-500" />
              Заявени
              <span className="ml-2 inline-flex size-2 rounded-full bg-[var(--accent-strong)]" />
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
                    isToday(day) ? "text-[var(--accent-strong)]" : ""
                  }`}
                >
                  <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                    {formatWeekday(day)}
                  </div>
                  <div className="mt-1 text-lg font-semibold">{formatDayNumber(day)}</div>
                </div>
              ))}

              <div className="relative border-r border-[var(--line)]" style={{ height: 660 }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 -translate-y-2 px-3 text-right font-mono text-xs text-[var(--ink-muted)]"
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
                  selectedAppointmentId={selectedAppointmentId}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="syn-card min-w-0 overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Предстоящи часове</h2>
            <div className="mt-1 font-mono text-xs text-[var(--ink-muted)]">{scheduled.length} за седмицата</div>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {scheduled.map((appointment) => (
              <AppointmentListItem
                key={appointment.id}
                appointment={appointment}
                selected={appointment.id === selectedAppointmentId}
              />
            ))}
            {scheduled.length === 0 ? (
              <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма записани часове за тази седмица.</div>
            ) : null}
          </div>

          {unscheduled.length > 0 ? (
            <>
              <div className="border-y border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3">
                <h2 className="text-sm font-semibold">Без точен час</h2>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {unscheduled.map((appointment) => (
                  <AppointmentListItem
                    key={appointment.id}
                    appointment={appointment}
                    selected={appointment.id === selectedAppointmentId}
                  />
                ))}
              </div>
            </>
          ) : null}
        </aside>
      </section>

      {focusedAppointment ? <AppointmentDrawer key={focusedAppointment.id} appointment={focusedAppointment} /> : null}
    </>
  );
}

function DayColumn({
  day,
  appointments,
  selectedAppointmentId,
}: {
  day: Date;
  appointments: DashboardAppointmentListItem[];
  selectedAppointmentId: string | null;
}) {
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
        <AppointmentBlock
          key={appointment.id}
          appointment={appointment}
          selected={appointment.id === selectedAppointmentId}
        />
      ))}

      {isToday(day) ? <div className="absolute inset-y-0 left-0 w-0.5 bg-[var(--accent-strong)]" /> : null}
    </div>
  );
}

function AppointmentBlock({
  appointment,
  selected,
}: {
  appointment: DashboardAppointmentListItem;
  selected: boolean;
}) {
  const position = getAppointmentPosition(appointment);
  const isBlocked = [appointment.title, appointment.serviceType].some((value) =>
    ["block", "блокиран", "обедна", "почивка"].some((term) => value?.toLowerCase().includes(term))
  );

  return (
    <Link
      href={`/appointments?appointment=${appointment.id}`}
      className={`absolute left-2 right-2 block overflow-hidden rounded-lg border px-2 py-2 text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isBlocked
          ? "border-red-200 bg-red-50/80 text-red-950 bg-stripes dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100"
          : appointment.status === "confirmed"
            ? "border-green-200 bg-green-50 text-green-950 dark:border-green-900/50 dark:text-green-100"
            : "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-100"
      } ${selected ? "ring-2 ring-[var(--accent-strong)] ring-offset-2 ring-offset-[var(--surface)]" : ""}`}
      style={{
        top: position.top,
        minHeight: 46,
        height: position.height,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-mono">
          {formatAppointmentTime(appointment)}
          {isBlocked ? <Lock size={10} className="text-red-500" aria-hidden="true" /> : null}
        </span>
        {appointment.hasGoogleEvent ? <span className="font-mono text-[10px] opacity-70">GCal</span> : null}
      </div>
      <div className="mt-1 truncate font-semibold">{appointment.customerName}</div>
      <div className="mt-0.5 truncate opacity-80">{appointment.serviceType}</div>
    </Link>
  );
}

function AppointmentListItem({
  appointment,
  selected = false,
}: {
  appointment: DashboardAppointmentListItem;
  selected?: boolean;
}) {
  return (
    <Link
      href={`/appointments?appointment=${appointment.id}`}
      className={`block px-4 py-4 transition hover:bg-[var(--surface-muted)] ${
        selected ? "bg-[var(--surface-soft)] font-medium" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{appointment.customerName}</div>
          <div className="mt-1 truncate text-sm text-[var(--ink-soft)]">{appointment.serviceType}</div>
        </div>
        <StatusBadge value={appointment.status} />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-[var(--ink-soft)]">
        <IconLine icon={<Clock size={14} aria-hidden="true" />}>
          {appointment.startsAt ? formatDateTime(appointment.startsAt) : "Няма точен час"}
        </IconLine>
        <IconLine icon={<Phone size={14} aria-hidden="true" />}>
          <span className="font-mono">{appointment.customerPhone ?? "Няма телефон"}</span>
        </IconLine>
        <IconLine icon={<MapPin size={14} aria-hidden="true" />}>
          <span className="truncate">{appointment.location ?? "Няма адрес"}</span>
        </IconLine>
      </div>
    </Link>
  );
}

function IconLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

function getAppointmentPosition(appointment: DashboardAppointmentListItem) {
  const start = appointment.startsAt ? new Date(appointment.startsAt) : null;
  const end = appointment.endsAt ? new Date(appointment.endsAt) : null;

  if (!start) return { top: "0%", height: "48px" };

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

function formatAppointmentTime(appointment: DashboardAppointmentListItem) {
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

function mergeFocusedAppointment(
  appointments: DashboardAppointmentListItem[],
  focusedAppointment: DashboardAppointmentListItem | null
) {
  if (!focusedAppointment) return appointments;

  return [focusedAppointment, ...appointments.filter((appointment) => appointment.id !== focusedAppointment.id)].sort(
    (left, right) => {
      if (!left.startsAt && !right.startsAt) return left.customerName.localeCompare(right.customerName, "bg-BG");
      if (!left.startsAt) return 1;
      if (!right.startsAt) return -1;
      return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
    }
  );
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
