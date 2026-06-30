"use client";

import { Zap } from "lucide-react";
import { useActionState } from "react";

import { signIn } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4 text-[var(--foreground)]">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex size-[38px] items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_4px_14px_-3px_rgba(74,222,128,.55)]">
            <Zap size={19} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">AI Receptionist</div>
            <div className="truncate font-mono text-[11px] font-medium text-[var(--ink-muted)]">booking assistant</div>
          </div>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm"
        >
          <div className="space-y-1">
            <h1 className="text-[17px] font-semibold leading-none">Вход</h1>
            <p className="font-mono text-[11.5px] text-[var(--ink-muted)]">Достъп до таблото</p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-medium text-[var(--ink-soft)]">Имейл</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none transition focus:border-[var(--accent-strong)]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-medium text-[var(--ink-soft)]">Парола</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none transition focus:border-[var(--accent-strong)]"
            />
          </label>

          {state?.error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)] shadow-[0_4px_14px_-4px_rgba(74,222,128,.6)] transition hover:brightness-95 disabled:opacity-60"
          >
            {pending ? "Влизане…" : "Влез"}
          </button>
        </form>
      </div>
    </main>
  );
}
