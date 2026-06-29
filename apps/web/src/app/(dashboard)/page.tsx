import { AlertTriangle, CalendarCheck, CheckCircle2, PhoneCall } from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { StatusBadge } from "@/components/status-badge";
import { getCommandCenterData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

const funnelLabels: Record<string, string> = {
  calls: "разговори",
  qualifiedInteractions: "квалифицирани",
  calendarRelevantRequests: "за час",
  bookings: "записи",
};

export default async function CommandCenterPage() {
  const data = await getCommandCenterData();

  return (
    <>
      <PageHeader
        eyebrow="Работно табло"
        title="Днес"
        actions={
          <Link
            href="/appointments"
            className="inline-flex h-9 items-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white"
          >
            Нов час
          </Link>
        }
      />

      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Обаждания"
          value={String(data.metrics.calls24h)}
          detail="последните 24 часа"
          icon={PhoneCall}
          tone="teal"
        />
        <MetricCard
          label="Часове днес"
          value={String(data.metrics.appointmentsToday)}
          detail="потвърдени и заявени"
          icon={CalendarCheck}
          tone="blue"
        />
        <MetricCard
          label="За преглед"
          value={String(data.metrics.attentionItems)}
          detail="задачи от разговори и часове"
          icon={AlertTriangle}
          tone="amber"
        />
        <MetricCard
          label="Booking rate"
          value={`${data.metrics.bookingRate}%`}
          detail="записи спрямо разговори"
          icon={CheckCircle2}
          tone="teal"
        />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionPanel
          title="Задачи за действие"
          eyebrow="Inbox preview"
          action={
            <Link href="/inbox" className="text-sm font-medium text-teal-700 dark:text-teal-300">
              Всички
            </Link>
          }
        >
          <div className="divide-y divide-[var(--line)]">
            {data.inboxItems.map((item) => (
              <Link
                key={item.id}
                href={item.sourceHref}
                className="grid gap-2 px-4 py-4 text-sm hover:bg-[var(--surface-muted)] md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <StatusBadge value={item.type} />
                  </div>
                  <div className="mt-1 truncate text-[var(--ink-soft)]">{item.detail}</div>
                  <div className="mt-2 font-mono text-xs text-[var(--ink-soft)]">{item.phone}</div>
                </div>
                <StatusBadge value={item.priority === "high" ? "urgent" : item.priority} />
              </Link>
            ))}
            {data.inboxItems.length === 0 ? (
              <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма задачи за преглед.</div>
            ) : null}
          </div>
        </SectionPanel>

        <SectionPanel
          title="Следващи часове"
          eyebrow="Calendar"
          action={
            <Link href="/appointments" className="text-sm font-medium text-teal-700 dark:text-teal-300">
              Календар
            </Link>
          }
        >
          <div className="divide-y divide-[var(--line)]">
            {data.nextAppointments.map((appointment) => (
              <Link
                key={appointment.id}
                href={`/appointments?appointment=${appointment.id}`}
                className="block px-4 py-4 text-sm hover:bg-[var(--surface-muted)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{appointment.customerName}</div>
                    <div className="mt-1 truncate text-[var(--ink-soft)]">{appointment.serviceType}</div>
                    <div className="mt-2 font-mono text-xs text-[var(--ink-soft)]">
                      {appointment.startsAt ? formatDateTime(appointment.startsAt) : "Няма час"}
                    </div>
                  </div>
                  <StatusBadge value={appointment.status} />
                </div>
              </Link>
            ))}
            {data.nextAppointments.length === 0 ? (
              <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма предстоящи часове.</div>
            ) : null}
          </div>
        </SectionPanel>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <SectionPanel title="Booking funnel" eyebrow="Reports preview">
          <div className="grid grid-cols-2 gap-2 p-4 text-sm sm:grid-cols-4">
            {Object.entries(data.funnel).map(([key, value]) => (
              <div key={key} className="rounded-md bg-[var(--surface-muted)] p-3">
                <div className="font-mono text-2xl font-semibold">{value}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]">{funnelLabels[key] ?? key}</div>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="AI health" eyebrow="Assistant">
          <div className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={data.health.status} />
              <span className="text-sm font-medium">{data.health.label}</span>
            </div>
            <div className="mt-2 text-sm text-[var(--ink-soft)]">{data.health.detail}</div>
            <div className="mt-3 font-mono text-xs text-[var(--ink-soft)]">
              {data.assistantStatus.model} / {data.assistantStatus.voiceProvider}
            </div>
          </div>
        </SectionPanel>
      </section>
    </>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
