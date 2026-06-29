import type { ReactNode } from "react";

export function SectionPanel({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="min-w-0">
          {eyebrow ? <div className="font-mono text-xs uppercase text-[var(--ink-soft)]">{eyebrow}</div> : null}
          <h2 className="mt-0.5 truncate text-sm font-semibold">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
