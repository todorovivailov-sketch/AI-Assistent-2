import type { ReactNode } from "react";
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
            className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_4px_14px_-4px_rgba(74,222,128,.6)] transition hover:brightness-95"
          >
            Нов час
          </Link>
        }
      />

      <section className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMetric
          label="Обаждания"
          value={String(data.metrics.calls24h)}
          detail="последните 24 часа"
          icon={<PhoneCall size={17} aria-hidden="true" />}
          bars={[45, 62, 38, 78, 55, 88, 100]}
        />
        <DashboardMetric
          label="Часове днес"
          value={String(data.metrics.appointmentsToday)}
          detail="потвърдени и заявени"
          icon={<CalendarCheck size={17} aria-hidden="true" />}
          bars={[34, 48, 41, 66, 58, 72, 64]}
        />
        <DashboardMetric
          label="За преглед"
          value={String(data.metrics.attentionItems)}
          detail="задачи от разговори и часове"
          icon={<AlertTriangle size={17} aria-hidden="true" />}
          bars={[16, 24, 42, 36, 28, 40, 30]}
          tone="warning"
        />
        <DashboardMetric
          label="Booking rate"
          value={`${data.metrics.bookingRate}%`}
          detail="записи спрямо разговори"
          icon={<CheckCircle2 size={17} aria-hidden="true" />}
          bars={[30, 44, 52, 60, 68, 74, Math.max(16, data.metrics.bookingRate)]}
        />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionPanel
          title="Задачи за действие"
          eyebrow="Inbox preview"
          action={
            <Link href="/inbox" className="text-sm font-semibold text-[var(--accent-strong)]">
              Всички
            </Link>
          }
        >
          <div className="divide-y divide-[var(--line)]">
            {data.inboxItems.map((item) => (
              <Link
                key={item.id}
                href={item.sourceHref}
                className="grid gap-2 px-4 py-4 text-sm transition hover:bg-[var(--surface-muted)] md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <StatusBadge value={item.type} />
                  </div>
                  <div className="mt-1 truncate text-[var(--ink-soft)]">{item.detail}</div>
                  <div className="mt-2 font-mono text-xs text-[var(--ink-muted)]">{item.phone}</div>
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
            <Link href="/appointments" className="text-sm font-semibold text-[var(--accent-strong)]">
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
              <div key={key} className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
                <div className="mt-1 text-xs text-[var(--ink-muted)]">{funnelLabels[key] ?? key}</div>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="AI health" eyebrow="Assistant">
          <div className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`relative flex size-2.5 rounded-full ${
                  data.health.status === "healthy"
                    ? "bg-[var(--accent-strong)]"
                    : data.health.status === "warning"
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
              >
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-40" />
              </span>
              <span className="text-sm font-semibold">{data.health.label}</span>
            </div>
            <div className="mt-2 text-sm text-[var(--ink-soft)]">{data.health.detail}</div>
            <div className="mt-3 font-mono text-xs text-[var(--ink-muted)]">
              {data.assistantStatus.model} / {data.assistantStatus.voiceProvider}
            </div>
          </div>
        </SectionPanel>
      </section>
    </>
  );
}

function DashboardMetric({
  label,
  value,
  detail,
  icon,
  bars,
  tone = "green",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  bars: number[];
  tone?: "green" | "warning";
}) {
  const iconClasses =
    tone === "warning"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      : "bg-[var(--surface-soft)] text-[var(--accent-strong)]";

  return (
    <div className="syn-card syn-card-lift min-w-0 p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="syn-label">{label}</span>
        <span className={`flex size-8 items-center justify-center rounded-lg ${iconClasses}`}>{icon}</span>
      </div>
      <div className="mt-4 font-mono text-4xl font-semibold leading-none tracking-normal tabular-nums">{value}</div>
      <div className="mt-4 flex h-6 items-end gap-1">
        {bars.map((height, index) => (
          <span
            key={`${label}-${index}`}
            className={`flex-1 rounded-sm ${
              index === bars.length - 1 ? "bg-[var(--accent)]" : "bg-green-100 dark:bg-green-950/60"
            }`}
            style={{ height: `${Math.min(Math.max(height, 10), 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-muted)]">{detail}</div>
    </div>
  );
}
