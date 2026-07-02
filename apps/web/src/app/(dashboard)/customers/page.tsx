import { Users } from "lucide-react";

import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getCustomersData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await getCustomersData();

  return (
    <>
      <PageHeader eyebrow="Клиентска база" title="Клиенти" />
      <DataTable columns={["Клиент", "Телефон", "Последен контакт", "Следващ час", "Часове", "Статус"]}>
        {customers.map((customer) => (
          <DataRow key={customer.id} columns={6}>
            <div className="min-w-0">
              <div className="truncate font-medium">{customer.name}</div>
              <div className="mt-1 truncate text-xs text-[var(--ink-soft)]">
                {customer.tags.slice(0, 2).join(" / ") || "Няма тагове"}
              </div>
            </div>
            <div className="truncate font-mono">{customer.phone}</div>
            <div className="truncate text-[var(--ink-soft)]">{customer.lastInteractionLabel}</div>
            <div className="font-mono text-[var(--ink-soft)]">
              {customer.nextAppointmentAt ? formatDateTime(customer.nextAppointmentAt) : "-"}
            </div>
            <div className="font-mono text-[var(--ink-soft)]">{customer.totalAppointments}</div>
            <StatusBadge value={customer.statusKey} />
          </DataRow>
        ))}
        {customers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--accent-strong)]">
              <Users size={20} aria-hidden="true" />
            </span>
            <div className="text-sm font-medium">Още няма клиенти</div>
            <div className="text-xs text-[var(--ink-muted)]">Появяват се автоматично след първото обаждане.</div>
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
