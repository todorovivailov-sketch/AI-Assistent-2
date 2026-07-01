"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { ServiceRow } from "@/lib/agent/composer-data";

import { createService, deleteService } from "../actions";
import { errorLabel, inputClass } from "../agent-builder";

export function ServicesTab({ services }: { services: ServiceRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formEl = event.currentTarget;
    setError(null);
    startTransition(async () => {
      const result = await createService(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else { formEl.reset(); router.refresh(); }
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteService(id);
      if (!result.ok) setError(errorLabel(result.error));
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--ink-muted)]">Цените се пазят за твоя справка и <strong>не се казват по телефона</strong> (отключва се с документи в следваща фаза).</p>
      <div className="divide-y divide-[var(--line)]">
        {services.length === 0 ? <p className="py-3 text-sm text-[var(--ink-soft)]">Няма добавени услуги.</p> : null}
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div>
              <span className="font-medium">{s.name}</span>
              {s.description ? <span className="text-[var(--ink-muted)]"> — {s.description}</span> : null}
              <span className="ml-2 font-mono text-xs text-[var(--ink-muted)]">{s.duration_minutes} мин · {s.status}</span>
            </div>
            <button onClick={() => remove(s.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-60">Изтрий</button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-3">
        <input name="name" placeholder="Име на услуга" className={inputClass} />
        <input name="description" placeholder="Кратко описание (по избор)" className={inputClass} />
        <input name="duration_minutes" type="number" min={5} max={1440} defaultValue={60} placeholder="Времетраене (мин)" className={inputClass} />
        <div className="grid grid-cols-3 gap-2">
          <input name="price_min" type="number" min={0} step="0.01" placeholder="Цена от" className={inputClass} />
          <input name="price_max" type="number" min={0} step="0.01" placeholder="до" className={inputClass} />
          <input name="currency" defaultValue="EUR" className={inputClass} />
        </div>
        <input type="hidden" name="status" value="active" />
        <div className="col-span-2 flex items-center justify-between gap-3">
          {error ? <span className="text-sm text-red-600">{error}</span> : <span />}
          <button type="submit" disabled={isPending}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
            {isPending ? "…" : "Добави услуга"}
          </button>
        </div>
      </form>
    </div>
  );
}
