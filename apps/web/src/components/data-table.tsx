import type { ReactNode } from "react";

export function DataTable({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="syn-card min-w-0 overflow-x-auto">
      <div className="min-w-[720px]">
        <div
          className="grid border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]"
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
      className={`grid items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--surface-muted)] ${className ?? ""}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
