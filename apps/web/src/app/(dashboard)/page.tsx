import { AlertTriangle, CalendarCheck, CheckCircle2, PhoneCall } from "lucide-react";
import Link from "next/link";

import { DashboardTimeline } from "@/components/dashboard-timeline";
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

      <section className="grid min-w-0 gap-4 grid-cols-1 md:grid-cols-3">
        {/* Card 1: Обаждания (col-span-2) */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-teal-500/30 md:col-span-2 col-span-1 bg-gradient-to-br from-teal-500/5 via-[var(--surface)] to-[var(--surface)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Обаждания
              </p>
              <h3 className="mt-2 text-4xl font-bold font-mono tracking-tight bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent dark:from-teal-400 dark:to-teal-200">
                {data.metrics.calls24h}
              </h3>
            </div>
            <span className="flex size-10 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <PhoneCall size={20} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 text-xs font-medium text-[var(--ink-soft)]">
            последните 24 часа
          </p>
        </div>

        {/* Card 2: Часове днес (col-span-1) */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-blue-500/30 col-span-1 bg-gradient-to-br from-blue-500/5 via-[var(--surface)] to-[var(--surface)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Часове днес
              </p>
              <h3 className="mt-2 text-4xl font-bold font-mono tracking-tight bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent dark:from-blue-400 dark:to-blue-200">
                {data.metrics.appointmentsToday}
              </h3>
            </div>
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CalendarCheck size={20} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 text-xs font-medium text-[var(--ink-soft)]">
            потвърдени и заявени
          </p>
        </div>

        {/* Card 3: За преглед (col-span-1) */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-amber-500/30 col-span-1 bg-gradient-to-br from-amber-500/5 via-[var(--surface)] to-[var(--surface)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                За преглед
              </p>
              <h3 className="mt-2 text-4xl font-bold font-mono tracking-tight bg-gradient-to-r from-amber-600 to-amber-400 bg-clip-text text-transparent dark:from-amber-400 dark:to-amber-200">
                {data.metrics.attentionItems}
              </h3>
            </div>
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={20} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 text-xs font-medium text-[var(--ink-soft)]">
            задачи от разговори и часове
          </p>
        </div>

        {/* Card 4: Booking rate (col-span-2) */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-emerald-500/30 md:col-span-2 col-span-1 bg-gradient-to-br from-emerald-500/5 via-[var(--surface)] to-[var(--surface)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Booking rate
              </p>
              <h3 className="mt-2 text-4xl font-bold font-mono tracking-tight bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent dark:from-emerald-400 dark:to-emerald-200">
                {data.metrics.bookingRate}%
              </h3>
            </div>
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={20} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 text-xs font-medium text-[var(--ink-soft)]">
            записи спрямо разговори
          </p>
        </div>
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
          <div className="px-4 py-4">
            <DashboardTimeline appointments={data.nextAppointments} />
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
