import { PageHeader } from "@/components/page-header";
import { getConversationById, getConversationsData, type DashboardConversation } from "@/lib/dashboard/data";
import { CallCenterWorkspace } from "./call-center-workspace";

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
      <CallCenterWorkspace conversations={displayedConversations} />
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

