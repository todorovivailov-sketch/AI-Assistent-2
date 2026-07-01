"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { HoursRow } from "@/lib/agent/composer-data";

import { saveBusinessHours } from "../actions";
import { errorLabel } from "../agent-builder";

const DAYS = [
  { weekday: 1, label: "Понеделник" }, { weekday: 2, label: "Вторник" }, { weekday: 3, label: "Сряда" },
  { weekday: 4, label: "Четвъртък" }, { weekday: 5, label: "Петък" }, { weekday: 6, label: "Събота" },
  { weekday: 0, label: "Неделя" },
];

export function HoursTab({ hours }: { hours: HoursRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const byDay = new Map(hours.map((h) => [h.weekday, h]));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBusinessHours(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else { setSaved(true); router.refresh(); }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {DAYS.map((d) => {
        const row = byDay.get(d.weekday);
        return (
          <div key={d.weekday} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 text-sm">
            <span className="font-medium text-[var(--ink-soft)]">{d.label}</span>
            <input type="hidden" name="weekday" value={d.weekday} />
            <select name="is_closed" defaultValue={row?.is_closed ? "on" : ""}
              className="h-9 rounded-lg border border-[var(--line)] bg-[var(--background)] px-2 text-xs">
              <option value="">отворено</option>
              <option value="on">почивен</option>
            </select>
            <input type="time" name="opens_at" defaultValue={row?.opens_at?.slice(0, 5) ?? "09:00"}
              className="h-9 rounded-lg border border-[var(--line)] bg-[var(--background)] px-2" />
            <input type="time" name="closes_at" defaultValue={row?.closes_at?.slice(0, 5) ?? "18:00"}
              className="h-9 rounded-lg border border-[var(--line)] bg-[var(--background)] px-2" />
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
        {error ? <span className="text-sm text-red-600">{error}</span> : saved ? <span className="text-sm font-medium text-[var(--accent-strong)]">Записано ✓</span> : <span />}
        <button type="submit" disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
          {isPending ? "Записва…" : "Запази работно време"}
        </button>
      </div>
    </form>
  );
}
