import { Bot, CalendarCheck, PhoneCall, Settings2 } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { StatusBadge } from "@/components/status-badge";
import { getAssistantOverviewData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const assistant = await getAssistantOverviewData();

  return (
    <>
      <PageHeader eyebrow="AI конфигурация" title="Асистент" />
      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Статус"
          value={assistant.assistantConnected ? "Online" : "Off"}
          detail={assistant.assistantName}
          icon={Bot}
          tone={assistant.assistantConnected ? "teal" : "red"}
        />
        <MetricCard
          label="Календар"
          value={assistant.calendarConnected ? "OK" : "Off"}
          detail={assistant.calendarProvider}
          icon={CalendarCheck}
          tone={assistant.calendarConnected ? "teal" : "amber"}
        />
        <MetricCard
          label="Tool calls 24ч"
          value={String(assistant.toolCalls24h)}
          detail="календарни проверки и записи"
          icon={Settings2}
          tone="blue"
        />
        <MetricCard
          label="Voice"
          value={assistant.voiceProvider}
          detail={assistant.model}
          icon={PhoneCall}
          tone="zinc"
        />
      </section>
      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <SectionPanel title="Conversation flow" eyebrow="Настройка">
          <div className="space-y-3 p-4 text-sm text-[var(--ink-soft)]">
            <div>1. Заявка</div>
            <div>2. Ден</div>
            <div>3. Точен час</div>
            <div>4. Проверка в календар</div>
            <div>5. Име, телефон, локация</div>
            <div>6. Запис и финално потвърждение</div>
          </div>
        </SectionPanel>
        <SectionPanel title="Quality review" eyebrow="Контрол">
          <div className="divide-y divide-[var(--line)]">
            <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
              <span>Неясни имена и заявки</span>
              <StatusBadge value="needs_confirmation" />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
              <span>Tool errors</span>
              <StatusBadge value={assistant.toolErrors24h > 0 ? "attention" : "healthy"} />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
              <span>Webhook events 24ч</span>
              <span className="font-mono text-[var(--ink-soft)]">{assistant.webhookEvents24h}</span>
            </div>
          </div>
        </SectionPanel>
      </section>
    </>
  );
}
