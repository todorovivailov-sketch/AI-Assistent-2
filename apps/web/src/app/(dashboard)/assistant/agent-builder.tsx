"use client";

import { useState } from "react";

import type { AgentComposerData } from "@/lib/agent/composer-data";

import { BehaviorTab } from "./tabs/behavior-tab";
import { ServicesTab } from "./tabs/services-tab";
import { HoursTab } from "./tabs/hours-tab";
import { AreasTab } from "./tabs/areas-tab";
import { PublishTab } from "./tabs/publish-tab";

export const inputClass =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--accent-strong)]";

export function errorLabel(code: string): string {
  switch (code) {
    case "name_required": return "Въведи име на асистента.";
    case "base_prompt_required": return "Базовият промпт (поведение) не може да е празен.";
    case "service_name_required": return "Услугата трябва да има име.";
    case "duration_out_of_range": return "Времетраенето трябва да е между 5 и 1440 минути.";
    case "price_range_invalid": return "Минималната цена не може да е над максималната.";
    case "price_negative": return "Цената не може да е отрицателна.";
    case "hours_invalid_range": return "За отворен ден въведи начало и край, като началото е преди края.";
    case "city_required": return "Въведи град.";
    case "not_admin": return "Нямаш права (само owner/admin).";
    case "no_assistant": return "Няма свързан Vapi асистент.";
    case "vapi_sync_failed": return "Неуспешен синк към Vapi — нищо не е публикувано. Опитай пак.";
    case "no_org": return "Няма активна организация.";
    default: return "Неуспешно записване.";
  }
}

const TABS = [
  { key: "behavior", label: "Поведение" },
  { key: "services", label: "Услуги" },
  { key: "hours", label: "Работно време" },
  { key: "areas", label: "Райони" },
  { key: "publish", label: "Преглед & публикуване" },
] as const;

export function AgentBuilder({ data }: { data: AgentComposerData | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("behavior");
  if (!data) {
    return <div className="syn-card p-5 text-sm text-[var(--ink-soft)]">Няма свързан асистент за тази организация.</div>;
  }
  return (
    <div className="syn-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "behavior" ? <BehaviorTab data={data} /> : null}
      {tab === "services" ? <ServicesTab services={data.services} /> : null}
      {tab === "hours" ? <HoursTab hours={data.hours} /> : null}
      {tab === "areas" ? <AreasTab areas={data.areas} /> : null}
      {tab === "publish" ? <PublishTab preview={data.composedPreview} /> : null}
    </div>
  );
}
