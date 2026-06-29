import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getConversationsData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const conversations = await getConversationsData(50);

  return (
    <>
      <PageHeader eyebrow="Архив и качество" title="Разговори" />
      <DataTable columns={["Час", "Клиент", "Резултат", "Резюме", "Време", "Статус"]}>
        {conversations.map((conversation) => (
          <DataRow key={conversation.id} columns={6}>
            <div className="font-mono text-[var(--ink-soft)]">
              {conversation.startedAt ? formatDateTime(conversation.startedAt) : "-"}
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{conversation.customerName ?? conversation.caller}</div>
              <div className="mt-1 truncate font-mono text-xs text-[var(--ink-soft)]">{conversation.caller}</div>
            </div>
            <StatusBadge value={conversation.outcome} />
            <div className="truncate text-[var(--ink-soft)]">{conversation.summaryPreview}</div>
            <div className="font-mono text-[var(--ink-soft)]">{formatDuration(conversation.durationSeconds)}</div>
            <StatusBadge value={conversation.outcome === "unknown" ? "needs_confirmation" : "completed"} />
          </DataRow>
        ))}
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Още няма разговори.</div>
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

function formatDuration(seconds: number | null) {
  if (!seconds) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
