"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { publishAssistant } from "../actions";
import { errorLabel } from "../agent-builder";

export function PublishTab({ preview }: { preview: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  function publish() {
    setError(null);
    setPublished(false);
    startTransition(async () => {
      const result = await publishAssistant();
      if (!result.ok) setError(errorLabel(result.error));
      else { setPublished(true); router.refresh(); }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--ink-muted)]">Това е точният системен промпт, който ще отиде <strong>на живо</strong> във Vapi. Гласът и инструментите за записване се запазват непокътнати.</p>
      <pre className="max-h-[420px] overflow-auto rounded-lg border border-[var(--line)] bg-[var(--background)] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">{preview}</pre>
      <div className="flex items-center justify-between gap-3">
        {error ? <span className="text-sm text-red-600">{error}</span> : published ? <span className="text-sm font-medium text-[var(--accent-strong)]">Публикувано на живо ✓</span> : <span />}
        <button onClick={publish} disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60">
          {isPending ? "Публикува…" : "Публикувай на живо"}
        </button>
      </div>
    </div>
  );
}
