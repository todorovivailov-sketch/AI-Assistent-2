import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getRecentLeads } from "@/lib/live-data";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await getRecentLeads(20);

  return (
    <>
      <PageHeader eyebrow="Pipeline" title="Лийдове" />
      <DataTable columns={["Име", "Телефон", "Услуга", "Град", "Спешност", "Статус"]}>
        {leads.map((lead) => (
          <DataRow key={lead.id} columns={6}>
            <div className="truncate font-medium">{lead.name}</div>
            <div className="truncate font-mono">{lead.phone}</div>
            <div className="truncate">{lead.service}</div>
            <div className="truncate text-[var(--ink-soft)]">{lead.city}</div>
            <StatusBadge value={lead.urgency} />
            <StatusBadge value={lead.status} />
          </DataRow>
        ))}
        {leads.length === 0 ? (
          <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Още няма записани лийдове.</div>
        ) : null}
      </DataTable>
    </>
  );
}
