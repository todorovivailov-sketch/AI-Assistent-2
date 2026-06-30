import { Bot, CalendarCheck, CheckCircle2, PhoneCall, Settings2 } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";
import { StatusBadge } from "@/components/status-badge";
import { getAssistantEditorData } from "@/lib/agent/assistant";
import { getAssistantOverviewData } from "@/lib/dashboard/data";

import { AssistantEditor } from "./assistant-editor";

export const dynamic = "force-dynamic";

const flowSteps = [
  "Разпознава заявката без да изрежда услуги.",
  "Пита за предпочитан ден и час.",
  "Проверява календара преди обещание към клиента.",
  "При свободен слот записва име, телефон и нужните детайли.",
  "Потвърждава часа и пита дали може да съдейства с още нещо.",
  "Завършва разговора кратко и учтиво.",
];

export default async function AssistantPage() {
  const assistant = await getAssistantOverviewData();
  const editor = await getAssistantEditorData();

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
          detail="проверки и записвания"
          icon={Settings2}
          tone="blue"
        />
        <MetricCard label="Voice" value={assistant.voiceProvider} detail={assistant.model} icon={PhoneCall} tone="zinc" />
      </section>

      <AssistantEditor data={editor} />

      <section className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionPanel title="Conversation flow" eyebrow="Оперативен сценарий">
          <div className="divide-y divide-[var(--line)]">
            {flowSteps.map((step, index) => (
              <div key={step} className="flex gap-3 px-4 py-4 text-sm">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-soft)] font-mono text-xs font-semibold text-[var(--accent-strong)]">
                  {index + 1}
                </span>
                <span className="leading-relaxed text-[var(--ink-soft)]">{step}</span>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="Quality review" eyebrow="Контрол">
          <div className="divide-y divide-[var(--line)]">
            <ReviewRow label="Неясни имена и заявки" status="needs_confirmation" />
            <ReviewRow label="Tool errors" status={assistant.toolErrors24h > 0 ? "attention" : "healthy"} />
            <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
              <span className="text-[var(--ink-soft)]">Webhook events 24ч</span>
              <span className="font-mono font-semibold">{assistant.webhookEvents24h}</span>
            </div>
            <div className="flex items-start gap-3 px-4 py-4 text-sm text-[var(--ink-soft)]">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" />
              <span>Фокусът е бързо разбиране, кратки уточняващи въпроси и проверка в календара преди потвърждение.</span>
            </div>
          </div>
        </SectionPanel>
      </section>
    </>
  );
}

function ReviewRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
      <span className="text-[var(--ink-soft)]">{label}</span>
      <StatusBadge value={status} />
    </div>
  );
}
