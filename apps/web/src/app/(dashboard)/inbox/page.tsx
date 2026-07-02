import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getInboxData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await getInboxData();

  return (
    <>
      <PageHeader eyebrow="Оперативна опашка" title="Задачи" />
      <DataTable columns={["Приоритет", "Тип", "Клиент", "Детайл", "Час", "Действие"]}>
        {items.map((item) => (
          <DataRow key={item.id} columns={6}>
            <StatusBadge value={item.priority === "high" ? "urgent" : item.priority} />
            <StatusBadge value={item.type} />
            <div className="min-w-0">
              <div className="truncate font-medium">{item.customerLabel}</div>
              <div className="mt-1 truncate font-mono text-xs text-[var(--ink-soft)]">{item.phone}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{item.title}</div>
              <div className="mt-1 truncate text-xs text-[var(--ink-soft)]">{item.detail}</div>
            </div>
            <div className="font-mono text-[var(--ink-soft)]">
              {item.appointmentTime ? formatDateTime(item.appointmentTime) : "-"}
            </div>
            <Link
              href={item.sourceHref}
              className="group inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent-strong)] transition hover:brightness-90"
            >
              Отвори
              <ArrowRight
                size={13}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </DataRow>
        ))}
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--accent-strong)]">
              <CheckCircle2 size={20} aria-hidden="true" />
            </span>
            <div className="text-sm font-medium">Няма отворени задачи</div>
            <div className="text-xs text-[var(--ink-muted)]">Всичко е обработено.</div>
          </div>
        ) : null}
      </DataTable>
    </>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
