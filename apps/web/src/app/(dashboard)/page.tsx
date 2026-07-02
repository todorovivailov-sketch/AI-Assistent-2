import type { ReactNode } from "react";
import { AlertTriangle, CalendarCheck, CheckCircle2, ChevronRight, PhoneCall } from "lucide-react";
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
  const funnelStages = Object.entries(data.funnel);
  const funnelTop = Math.max(1, ...funnelStages.map(([, value]) => Number(value) || 0));

  return (
    <>
      <PageHeader
        eyebrow="Работно табло"
        title="Днес"
        actions={
          <Link
            href="/appointments"
            className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-ink)] shadow-[var(--shadow-accent)] transition hover:brightness-95"
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
                className="group grid gap-2 px-4 py-4 text-sm transition hover:bg-[var(--surface-muted)] md:grid-cols-[1fr_auto] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <StatusBadge value={item.type} />
                  </div>
                  <div className="mt-1 truncate text-[var(--ink-soft)]">{item.detail}</div>
                  <div className="mt-2 font-mono text-xs text-[var(--ink-muted)]">{item.phone}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={item.priority === "high" ? "urgent" : item.priority} />
                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                    className="hidden shrink-0 text-[var(--ink-muted)] transition-transform group-hover:translate-x-0.5 md:block"
                  />
                </div>
              </Link>
            ))}
            {data.inboxItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--accent-strong)]">
                  <CheckCircle2 size={18} aria-hidden="true" />
                </span>
                <div className="text-sm font-medium">Няма задачи за преглед</div>
                <div className="text-xs text-[var(--ink-muted)]">Всичко е обработено.</div>
              </div>
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
          <div className="space-y-3.5 p-4">
            {funnelStages.map(([key, value], index) => {
              const count = Number(value) || 0;
              const pct = Math.round((count / funnelTop) * 100);
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{funnelLabels[key] ?? key}</span>
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {count}
                      {index > 0 ? (
                        <span className="ml-1.5 text-xs font-normal text-[var(--ink-muted)]">{pct}%</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
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
              index === bars.length - 1 ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))]"
            }`}
            style={{ height: `${Math.min(Math.max(height, 10), 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-muted)]">{detail}</div>
    </div>
  );
}
