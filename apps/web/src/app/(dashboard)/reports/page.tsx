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
          <div className="grid grid-cols-2 gap-2 p-4 text-sm sm:grid-cols-4">
            {Object.entries(reports.funnel).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <div className="font-mono text-2xl font-semibold">{value}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]">{funnelLabels[key] ?? key}</div>
              </div>
            ))}
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
              <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма достатъчно данни.</div>
            ) : null}
          </div>
        </SectionPanel>
      </section>
    </>
  );
}
