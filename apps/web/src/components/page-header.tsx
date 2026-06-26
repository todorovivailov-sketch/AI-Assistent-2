import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  actions,
}: {
  title: string;
  eyebrow: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="font-mono text-xs uppercase text-[var(--ink-soft)]">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-[var(--foreground)] md:text-3xl">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
