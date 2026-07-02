"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { updateConfirmationSettings } from "./actions";

const ERRORS: Record<string, string> = {
  no_org: "Няма активна организация.",
  not_admin: "Нужни са права на администратор.",
};

export function ConfirmationForm({
  enabled,
  template,
  placeholder,
}: {
  enabled: boolean;
  template: string;
  placeholder: string;
}) {
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
      const result = await updateConfirmationSettings(formData);
      if (!result.ok) setError(ERRORS[result.error] ?? result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="syn-card min-w-0 p-5 flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold">SMS потвърждение за записан час</div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {"Щом асистентът запише час, пращаме на клиента SMS с датата и часа."}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4" />
        <span className="font-medium">Включи автоматичното SMS</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">
          {"Текст на SMS (плейсхолдъри: {date} {time} {service} {business} {phone})"}
        </span>
        <textarea
          name="template"
          defaultValue={template}
          rows={3}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm leading-relaxed outline-none focus:border-[var(--accent-strong)]"
        />
        <span className="text-xs text-[var(--ink-muted)]">
          Празно поле = текст по подразбиране. Кирилица: ~70 знака = 1 SMS.
        </span>
      </label>
      <div className="flex items-center justify-end gap-3">
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
        {saved && !error ? (
          <span className="text-sm font-medium text-[var(--accent-strong)]">Записано ✓</span>
        ) : null}
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60"
        >
          {isPending ? "Записва…" : "Запази"}
        </button>
      </div>
    </form>
  );
}
