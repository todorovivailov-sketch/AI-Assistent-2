import { Activity, ArrowUpRight, CalendarPlus, PhoneCall, PhoneForwarded, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getDashboardMetrics, getRecentCalls, getRecentLeads } from "@/lib/live-data";

export const dynamic = "force-dynamic";

const toneClasses: Record<string, string> = {
  teal: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  amber: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  red: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const activity = [
  {
    title: "Vapi webhook",
    detail: "Работи и записва разговори в Supabase.",
    icon: Activity,
  },
  {
    title: "Zadarma",
    detail: "+35924372749 -> +35924372749@sip.vapi.ai",
    icon: PhoneCall,
  },
  {
    title: "Pipeline",
    detail: "Обаждане -> заявка -> час -> поръчка",
    icon: TrendingUp,
  },
];

export default async function OverviewPage() {
  const [metrics, calls, leads] = await Promise.all([
    getDashboardMetrics(),
    getRecentCalls(5),
    getRecentLeads(5),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Оперативен пулт"
        title="Днес"
        actions={
          <>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)]"
              title="Call test number"
            >
              <PhoneForwarded size={16} aria-hidden="true" />
              Test
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-medium text-white"
              title="New appointment"
            >
              <CalendarPlus size={16} aria-hidden="true" />
              New
            </button>
          </>
        }
      />

      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <div key={metric.label} className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-[var(--ink-soft)]">{metric.label}</div>
                  <div className="mt-2 text-3xl font-semibold">{metric.value}</div>
                </div>
                <span className={`flex size-9 items-center justify-center rounded-md ${toneClasses[metric.tone]}`}>
                  <Icon size={18} aria-hidden="true" />
                </span>
              </div>
              <div className="mt-3 font-mono text-xs text-[var(--ink-soft)]">{metric.delta}</div>
            </div>
          );
        })}
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Последни обаждания</h2>
            <a href="/calls" className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-300">
              Всички
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {calls.map((call) => (
              <div key={call.id} className="grid gap-3 px-4 py-4 md:grid-cols-[80px_1fr_110px]">
                <div className="font-mono text-sm text-[var(--ink-soft)]">{call.time}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{call.type}</span>
                    <StatusBadge value={call.status} />
                  </div>
                  <div className="mt-1 truncate text-sm text-[var(--ink-soft)]">{call.summary}</div>
                  <div className="mt-2 font-mono text-xs text-[var(--ink-soft)]">
                    {call.caller} / {call.city}
                  </div>
                </div>
                <div className="font-mono text-sm text-[var(--ink-soft)] md:text-right">{call.duration}</div>
              </div>
            ))}
            {calls.length === 0 ? (
              <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Още няма записани обаждания.</div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Състояние</h2>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {activity.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3 px-4 py-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--ink-soft)]">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="mt-1 text-sm text-[var(--ink-soft)]">{item.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Лийдове</h2>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {leads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{lead.name}</div>
                  <div className="mt-1 truncate text-sm text-[var(--ink-soft)]">
                    {lead.service} / {lead.city}
                  </div>
                </div>
                <StatusBadge value={lead.status} />
              </div>
            ))}
            {leads.length === 0 ? (
              <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Още няма записани лийдове.</div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Часове</h2>
          </div>
          <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">
            Следващата стъпка е Google Calendar интеграция, за да се записват часове тук автоматично.
          </div>
        </div>
      </section>
    </>
  );
}
