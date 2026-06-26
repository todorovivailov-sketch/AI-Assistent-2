import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { appointments } from "@/lib/demo-data";

export default function AppointmentsPage() {
  return (
    <>
      <PageHeader eyebrow="Calendar" title="Часове" />
      <DataTable columns={["Време", "Клиент", "Услуга", "Адрес", "Статус"]}>
        {appointments.map((appointment) => (
          <DataRow key={`${appointment.time}-${appointment.customer}`} columns={5}>
            <div className="font-mono text-[var(--ink-soft)]">{appointment.time}</div>
            <div className="truncate font-medium">{appointment.customer}</div>
            <div className="truncate">{appointment.service}</div>
            <div className="truncate text-[var(--ink-soft)]">{appointment.address}</div>
            <StatusBadge value={appointment.status} />
          </DataRow>
        ))}
      </DataTable>
    </>
  );
}
