import { BarChart3, CalendarCheck, Coins, MoonStar, PhoneCall, TrendingUp, Wallet } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { getReportsData } from "@/lib/dashboard/data";
import { parseReportsRange } from "@/lib/dashboard/reports-range";

import { RangeControl } from "./range-control";

export const dynamic = "force-dynamic";

const funnelLabels: Record<string, string> = {
  calls: "Разговори",
  qualifiedInteractions: "Квалифицирани",
  calendarRelevantRequests: "Искат час",
  bookings: "Записи",
};

function money(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("bg-BG")} ${currency ?? ""}`.trim();
}

type ReportsPageProps = {
  searchParams?: Promise<{ range?: string; from?: string; to?: string }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const range = parseReportsRange({ range: params?.range, from: params?.from, to: params?.to });

  const fromLabel = range.from.toISOString().slice(0, 10);
  const toLabel = range.to.toISOString().slice(0, 10);
  const exportHref = `/api/reports/export?range=${range.preset}&from=${fromLabel}&to=${toLabel}`;

  const reports = await getReportsData({ from: range.from, to: range.to });
  const { revenue } = reports;
  const funnelStages = Object.entries(reports.funnel);
  const funnelTop = Math.max(1, ...funnelStages.map(([, value]) => Number(value) || 0));

  return (
    <>
      <PageHeader eyebrow="Управленски изглед" title="Отчети" />

      <RangeControl preset={range.preset} from={fromLabel} to={toLabel} exportHref={exportHref} />

      <section className="grid min-w-0 gap-3 md:grid-cols-3">
        <MetricCard
          label="Записани приходи"
          value={money(revenue.bookedValue, revenue.currency)}
          detail={`${revenue.bookedCount} записа за периода`}
          icon={Wallet}
          tone="teal"
        />
        <MetricCard
          label="Пайплайн (потенциал)"
          value={money(revenue.pipelineValue, revenue.currency)}
          detail="всички уловени лийдове"
          icon={TrendingUp}
          tone="blue"
        />
        <MetricCard
          label="Спасени извън работно време"
          value={revenue.afterHoursCountable ? money(revenue.afterHoursValue, revenue.currency) : "—"}
          detail={revenue.afterHoursCountable ? "записи от обаждания извън работно време" : "задай работно време"}
          icon={MoonStar}
          tone="amber"
        />
      </section>

      {revenue.unpricedBookings > 0 ? (
        <p className="text-xs text-[var(--ink-soft)]">
          {revenue.unpricedBookings} записа без цена на услугата — добави цени в „Асистент → Услуги" за пълна картина.
        </p>
      ) : null}

      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Разговори" value={String(reports.totals.calls)} detail="за периода" icon={PhoneCall} tone="teal" />
        <MetricCard label="Записи" value={String(reports.totals.bookings)} detail="заявени и потвърдени" icon={CalendarCheck} tone="blue" />
        <MetricCard label="Квалифицирани" value={String(reports.totals.qualified)} detail="с ясна заявка" icon={BarChart3} tone="amber" />
        <MetricCard
          label="Ср. стойност/запис"
          value={money(revenue.avgBookingValue, revenue.currency)}
          detail="оценка"
          icon={Coins}
          tone="zinc"
        />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionPanel title="Booking funnel" eyebrow="Conversion">
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

        <SectionPanel title="Services" eyebrow="Request mix">
          <div className="divide-y divide-[var(--line)]">
            {Object.entries(reports.services).map(([service, count]) => (
              <div key={service} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="truncate text-[var(--ink-soft)]">{service}</span>
                <span className="font-mono font-semibold">{count}</span>
              </div>
            ))}
            {Object.keys(reports.services).length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--accent-strong)]">
                  <BarChart3 size={20} aria-hidden="true" />
                </span>
                <div className="text-sm font-medium">Няма достатъчно данни</div>
                <div className="text-xs text-[var(--ink-muted)]">Данните се появяват с първите разговори.</div>
              </div>
            ) : null}
          </div>
        </SectionPanel>
      </section>
    </>
  );
}
