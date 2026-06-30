"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { AssistantEditorData } from "@/lib/agent/assistant";

import { updateAssistant } from "./actions";

const inputClass =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--accent-strong)]";

export function AssistantEditor({ data }: { data: AssistantEditorData | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!data) {
    return (
      <div className="syn-card p-5 text-sm text-[var(--ink-soft)]">
        Няма свързан асистент за тази организация.
      </div>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateAssistant(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="syn-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="syn-label">Agent Builder</div>
          <h2 className="mt-1 text-base font-semibold">Мозъкът на асистента</h2>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--ink-muted)]">
          {data.model ? (
            <span className="rounded-md border border-[var(--line)] px-2 py-1">{data.model}</span>
          ) : null}
          {data.voiceProvider ? (
            <span className="rounded-md border border-[var(--line)] px-2 py-1">voice: {data.voiceProvider}</span>
          ) : null}
        </div>
      </div>

      {data.seededFromVapi ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--ink-soft)]">
          Заредено от живия Vapi асистент. Първото запазване ще го запише и в базата.
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Име на асистента</span>
        <input name="name" defaultValue={data.name} className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Поздрав (първо съобщение)</span>
        <input
          name="first_message"
          defaultValue={data.firstMessage}
          className={inputClass}
          placeholder="напр. Здравейте, на телефона е асистентът на..."
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Системен промпт (включва guardrails)</span>
        <textarea
          name="system_prompt"
          defaultValue={data.systemPrompt}
          rows={18}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-[var(--accent-strong)]"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs text-[var(--ink-muted)]">
          ⚡ Запазването праща промпта <strong>на живо</strong> към Vapi асистента. Гласът и инструментите за
          записване на часове се запазват непокътнати.
        </p>
        <div className="flex items-center gap-3">
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
          {saved && !error ? (
            <span className="text-sm font-medium text-[var(--accent-strong)]">Запазено и синкнато ✓</span>
          ) : null}
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60"
          >
            {isPending ? "Синк…" : "Запази и синкни"}
          </button>
        </div>
      </div>
    </form>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case "name_required":
      return "Въведи име на асистента.";
    case "prompt_required":
      return "Системният промпт не може да е празен.";
    case "not_admin":
      return "Нямаш права (само owner/admin).";
    case "no_assistant":
      return "Няма свързан Vapi асистент.";
    case "vapi_sync_failed":
      return "Неуспешен синк към Vapi — промяната не е записана. Опитай пак.";
    case "no_org":
      return "Няма активна организация.";
    default:
      return "Неуспешно записване.";
  }
}
