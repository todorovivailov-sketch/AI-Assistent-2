import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { orders } from "@/lib/demo-data";

export default function OrdersPage() {
  return (
    <>
      <PageHeader eyebrow="Revenue" title="Поръчки" />
      <DataTable columns={["Поръчка", "Клиент", "Сума", "Статус"]}>
        {orders.map((order) => (
          <DataRow key={`${order.title}-${order.customer}`} columns={4}>
            <div className="truncate font-medium">{order.title}</div>
            <div className="truncate text-[var(--ink-soft)]">{order.customer}</div>
            <div className="font-mono">{order.amount}</div>
            <StatusBadge value={order.status} />
          </DataRow>
        ))}
      </DataTable>
    </>
  );
}
