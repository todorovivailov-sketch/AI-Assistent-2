import { DataRow, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getConversationById, getConversationsData, type DashboardConversation } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

type ConversationsPageProps = {
  searchParams?: Promise<{
    call?: string;
  }>;
};

export default async function ConversationsPage({ searchParams }: ConversationsPageProps) {
  const params = await searchParams;
  const selectedCallId = params?.call ?? null;
  const [conversations, focusedConversation] = await Promise.all([
    getConversationsData(50),
    selectedCallId ? getConversationById(selectedCallId) : Promise.resolve(null),
  ]);
  const displayedConversations = mergeFocusedConversation(conversations, focusedConversation);

  return (
    <>
      <PageHeader eyebrow="Архив и качество" title="Разговори" />
      <DataTable columns={["Час", "Клиент", "Резултат", "Резюме", "Време", "Статус"]}>
        {displayedConversations.map((conversation) => (
          <DataRow
            key={conversation.id}
            columns={6}
            className={conversation.id === selectedCallId ? "bg-teal-50/70 dark:bg-teal-950/30" : undefined}
          >
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
        {displayedConversations.length === 0 ? (
          <div className="px-4 py-8 text-sm text-[var(--ink-soft)]">Още няма разговори.</div>
        ) : null}
      </DataTable>
    </>
  );
}

function mergeFocusedConversation(
  conversations: DashboardConversation[],
  focusedConversation: DashboardConversation | null
) {
  if (!focusedConversation) return conversations;

  return [
    focusedConversation,
    ...conversations.filter((conversation) => conversation.id !== focusedConversation.id),
  ];
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
