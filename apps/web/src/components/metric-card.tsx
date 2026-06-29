import type { LucideIcon } from "lucide-react";

const toneClasses = {
  teal: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  amber: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  red: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  zinc: "bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
};

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "zinc",
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-[var(--ink-soft)]">{label}</div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</div>
        </div>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${toneClasses[tone]}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 truncate text-xs text-[var(--ink-soft)]">{detail}</div>
    </div>
  );
}
