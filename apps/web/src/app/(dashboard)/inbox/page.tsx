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
            <Link href={item.sourceHref} className="text-sm font-semibold text-[var(--accent-strong)]">
              Отвори
            </Link>
          </DataRow>
        ))}
        {items.length === 0 ? (
          <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Няма отворени задачи.</div>
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
