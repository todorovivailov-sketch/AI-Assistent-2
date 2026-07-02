"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { updateRetentionDays } from "./actions";

const ERRORS: Record<string, string> = {
  no_org: "Няма активна организация.",
  not_admin: "Нужни са права на администратор.",
  bad_days: "Въведи брой дни между 1 и 3650.",
};

export function RetentionForm({ days }: { days: number }) {
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
      const result = await updateRetentionDays(formData);
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
        <div className="text-sm font-semibold">Пазене на записи и транскрипти</div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {"След този брой дни записът, транскриптът и суровите данни на обажданията се анонимизират автоматично (статистиката за ROI остава). Клиентските контакти не се трият."}
        </p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink-soft)]">Дни</span>
        <input
          type="number"
          name="days"
          min={1}
          max={3650}
          defaultValue={days}
          className="w-40 rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-strong)]"
        />
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
