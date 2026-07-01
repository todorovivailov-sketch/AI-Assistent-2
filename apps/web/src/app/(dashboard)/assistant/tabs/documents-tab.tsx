"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { DocumentRow } from "@/lib/agent/composer-data";

import { uploadDocument, deleteDocument } from "../actions";
import { errorLabel, inputClass } from "../agent-builder";

const KIND_LABEL: Record<string, string> = { price_list: "Ценова листа", general: "Информация" };
const fmtSize = (b: number | null) =>
  b == null ? "" : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export function DocumentsTab({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formEl = event.currentTarget;
    setError(null);
    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else {
        formEl.reset();
        router.refresh();
      }
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteDocument(id);
      if (!result.ok) setError(errorLabel(result.error));
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--ink-muted)]">
        Качи документи (ЧЗВ, каталог, правила). Ако качиш <strong>ценова листа</strong>, асистентът ще може да казва цени от нея.
        Промените влизат в сила след &bdquo;Публикувай на живо&rdquo;.
      </p>
      <div className="divide-y divide-[var(--line)]">
        {documents.length === 0 ? <p className="py-3 text-sm text-[var(--ink-soft)]">Няма качени документи.</p> : null}
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div>
              <span className="font-medium">{d.name}</span>
              <span className="ml-2 rounded bg-[var(--surface-soft)] px-1.5 py-0.5 text-xs text-[var(--ink-muted)]">
                {KIND_LABEL[d.kind] ?? d.kind}
              </span>
              <span className="ml-2 font-mono text-xs text-[var(--ink-muted)]">{fmtSize(d.bytes)}</span>
            </div>
            <button onClick={() => remove(d.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-60">
              Изтрий
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="grid gap-2 border-t border-[var(--line)] pt-3">
        <input name="name" placeholder="Име (по избор, до 40 знака)" maxLength={40} className={inputClass} />
        <select name="kind" defaultValue="general" className={inputClass}>
          <option value="general">Информация (ЧЗВ, каталог, правила)</option>
          <option value="price_list">Ценова листа (отключва цени)</option>
        </select>
        <input name="file" type="file" accept=".pdf,.docx,.doc,.txt,.csv,.md" required className="text-sm" />
        <div className="flex items-center justify-between gap-3">
          {error ? <span className="text-sm text-red-600">{error}</span> : <span />}
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60"
          >
            {isPending ? "…" : "Качи документ"}
          </button>
        </div>
      </form>
    </div>
  );
}
