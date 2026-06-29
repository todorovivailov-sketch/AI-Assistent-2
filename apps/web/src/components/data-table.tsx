import type { ReactNode } from "react";

export function DataTable({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="min-w-[720px]">
        <div
          className="grid border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-xs font-semibold uppercase text-[var(--ink-soft)]"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((column) => (
            <div key={column}>{column}</div>
          ))}
        </div>
        <div className="divide-y divide-[var(--line)]">{children}</div>
      </div>
    </div>
  );
}

export function DataRow({
  columns,
  children,
  className,
}: {
  columns: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid items-center gap-3 px-4 py-3 text-sm ${className ?? ""}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
