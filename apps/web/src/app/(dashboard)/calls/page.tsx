import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getRecentCalls } from "@/lib/live-data";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const calls = await getRecentCalls(20);

  return (
    <>
      <PageHeader eyebrow="Call center" title="Обаждания" />
      <DataTable columns={["Час", "Клиент", "Заявка", "Град", "Статус", "Време"]}>
        {calls.map((call) => (
          <DataRow key={call.id} columns={6}>
            <div className="font-mono text-[var(--ink-soft)]">{call.time}</div>
            <div className="truncate font-mono">{call.caller}</div>
            <div className="min-w-0">
              <div className="truncate font-medium">{call.type}</div>
              <div className="mt-1 truncate text-xs text-[var(--ink-soft)]">{call.summary}</div>
            </div>
            <div className="truncate text-[var(--ink-soft)]">{call.city}</div>
            <StatusBadge value={call.status} />
            <div className="font-mono text-[var(--ink-soft)]">{call.duration}</div>
          </DataRow>
        ))}
        {calls.length === 0 ? (
          <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Още няма записани обаждания.</div>
        ) : null}
      </DataTable>
    </>
  );
}
