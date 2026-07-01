import Link from "next/link";

import type { ReportsPreset } from "@/lib/dashboard/reports-range";

const PRESETS: Array<{ key: Exclude<ReportsPreset, "custom">; label: string }> = [
  { key: "7d", label: "7 дни" },
  { key: "30d", label: "30 дни" },
  { key: "month", label: "Този месец" },
];

export function RangeControl({
  preset,
  from,
  to,
  exportHref,
}: {
  preset: ReportsPreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  exportHref: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((item) => {
          const active = preset === item.key;
          return (
            <Link
              key={item.key}
              href={`/reports?range=${item.key}`}
              className={
                active
                  ? "rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-ink)]"
                  : "rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-soft)] transition hover:border-[var(--accent-strong)]"
              }
            >
              {item.label}
            </Link>
          );
        })}
        <form method="get" action="/reports" className="flex items-center gap-2">
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-9 rounded-lg border border-[var(--line)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--accent-strong)]"
          />
          <span className="text-[var(--ink-soft)]">–</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-9 rounded-lg border border-[var(--line)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--accent-strong)]"
          />
          <button
            type="submit"
            className="h-9 rounded-lg border border-[var(--line)] px-3 text-sm transition hover:border-[var(--accent-strong)]"
          >
            Приложи
          </button>
        </form>
      </div>
      <a
        href={exportHref}
        className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95"
      >
        Изтегли CSV
      </a>
    </div>
  );
}
