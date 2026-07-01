"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { AgentComposerData } from "@/lib/agent/composer-data";

import { updateAgentBehavior } from "../actions";
import { errorLabel, inputClass } from "../agent-builder";

export function BehaviorTab({ data }: { data: AgentComposerData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateAgentBehavior(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else { setSaved(true); router.refresh(); }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Име на асистента</span>
        <input name="name" defaultValue={data.name} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Поздрав (първо съобщение)</span>
        <input name="first_message" defaultValue={data.firstMessage} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Базов промпт (поведение)</span>
        <textarea name="base_prompt" defaultValue={data.basePrompt} rows={16}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-[var(--accent-strong)]" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Твърди правила (guardrails)</span>
        <textarea name="guardrails" defaultValue={data.guardrails} rows={6}
          placeholder="напр. Не давай медицински съвети. Винаги предлагай запис."
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-[var(--accent-strong)]" />
      </label>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--ink-muted)]">Записва като чернова. Пусни на живо от таб „Преглед & публикуване".</p>
        <div className="flex items-center gap-3">
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
          {saved && !error ? <span className="text-sm font-medium text-[var(--accent-strong)]">Записано ✓</span> : null}
          <button type="submit" disabled={isPending}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
            {isPending ? "Записва…" : "Запази"}
          </button>
        </div>
      </div>
    </form>
  );
}
