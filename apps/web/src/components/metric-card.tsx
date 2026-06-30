import type { LucideIcon } from "lucide-react";

const toneClasses = {
  teal: "bg-[var(--surface-soft)] text-[var(--accent-strong)]",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  zinc: "bg-[var(--surface-muted)] text-[var(--ink-soft)]",
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
    <div className="syn-card syn-card-lift min-w-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="syn-label truncate">{label}</div>
          <div className="mt-3 font-mono text-3xl font-semibold leading-none tracking-normal tabular-nums">{value}</div>
        </div>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${toneClasses[tone]}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 truncate text-xs text-[var(--ink-muted)]">{detail}</div>
    </div>
  );
}
