"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { AreaRow } from "@/lib/agent/composer-data";

import { createServiceArea, deleteServiceArea } from "../actions";
import { errorLabel, inputClass } from "../agent-builder";

export function AreasTab({ areas }: { areas: AreaRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formEl = event.currentTarget;
    setError(null);
    startTransition(async () => {
      const result = await createServiceArea(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else { formEl.reset(); router.refresh(); }
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteServiceArea(id);
      if (!result.ok) setError(errorLabel(result.error));
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {areas.length === 0 ? (
          <div className="w-full rounded-lg border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--ink-muted)]">
            Няма добавени райони. Добави първия по-долу.
          </div>
        ) : null}
        {areas.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm">
            {a.city}{a.region ? ` (${a.region})` : ""}
            <button onClick={() => remove(a.id)} disabled={isPending} className="text-red-600 hover:underline disabled:opacity-60">×</button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-[var(--line)] pt-3">
        <input name="city" placeholder="Град" className={inputClass} />
        <input name="region" placeholder="Регион/квартал (по избор)" className={inputClass} />
        <input type="hidden" name="status" value="active" />
        <button type="submit" disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
          {isPending ? "…" : "Добави"}
        </button>
        {error ? <span className="col-span-3 text-sm text-red-600">{error}</span> : null}
      </form>
    </div>
  );
}
