import { BarChart3, CalendarCheck, PhoneCall, Timer } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { getReportsData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

const funnelLabels: Record<string, string> = {
  calls: "Разговори",
  qualifiedInteractions: "Квалифицирани",
  calendarRelevantRequests: "Искат час",
  bookings: "Записи",
};

export default async function ReportsPage() {
  const reports = await getReportsData();

  return (
    <>
      <PageHeader eyebrow="Управителски изглед" title="Отчети" />
      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Разговори"
          value={String(reports.totals.calls)}
          detail="последни 14 дни"
          icon={PhoneCall}
          tone="teal"
        />
        <MetricCard
          label="Записи"
          value={String(reports.totals.bookings)}
          detail="заявени и потвърдени"
          icon={CalendarCheck}
          tone="blue"
        />
        <MetricCard
          label="Квалифицирани"
          value={String(reports.totals.qualified)}
          detail="с ясна заявка"
          icon={BarChart3}
          tone="amber"
        />
        <MetricCard
          label="Средна прод."
          value={`${reports.totals.averageDurationSeconds}s`}
          detail="разговор"
          icon={Timer}
          tone="zinc"
        />
      </section>
      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <SectionPanel title="Booking funnel" eyebrow="Conversion">
          <div className="grid grid-cols-2 gap-2 p-4 text-sm sm:grid-cols-4">
            {Object.entries(reports.funnel).map(([key, value]) => (
              <div key={key} className="rounded-md bg-[var(--surface-muted)] p-3">
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
                <span className="truncate">{service}</span>
                <span className="font-mono">{count}</span>
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
