"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { eraseSubject, lookupSubject, type LookupResult } from "./actions";

const ERRORS: Record<string, string> = {
  no_org: "Няма активна организация.",
  not_admin: "Нужни са права на администратор.",
  bad_phone: "Невалиден или непознат телефон.",
};

export function SubjectPanel() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<Extract<LookupResult, { ok: true }> | null>(null);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function check() {
    setError(null);
    setMsg(null);
    setFound(null);
    startTransition(async () => {
      const r = await lookupSubject(phone);
      if (!r.ok) setError(ERRORS[r.error] ?? r.error);
      else setFound(r);
    });
  }

  function erase() {
    if (!found) return;
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const r = await eraseSubject(found.phone);
      if (!r.ok) setError(ERRORS[r.error] ?? r.error);
      else {
        const n = Object.values(r.affected).reduce((a, b) => a + b, 0);
        setMsg(`Изтрито за ${r.phone}: ${n} записа (Vapi: ${r.vapiDeleted} изтрити, ${r.vapiErrors} грешки).`);
        setFound(null);
        setConfirm("");
        setPhone("");
        router.refresh();
      }
    });
  }

  const canErase = found && confirm.trim() === found.phone;

  return (
    <div className="syn-card min-w-0 p-5 flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold">Търсене по телефон</div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {"Въведи телефон, за да видиш какви лични данни пазим за този човек, да ги изтеглиш или изтриеш."}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink-soft)]">Телефон</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+359888123456"
            className="w-56 rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-strong)]"
          />
        </label>
        <button
          type="button"
          onClick={check}
          disabled={isPending || !phone.trim()}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--surface-soft)] px-5 text-sm font-semibold transition hover:brightness-95 disabled:opacity-60"
        >
          {isPending ? "Проверява…" : "Провери"}
        </button>
      </div>

      {found ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] p-4">
          <div className="text-sm">
            За <span className="font-mono">{found.phone}</span>: обаждания {found.counts.calls} · лийдове{" "}
            {found.counts.leads} · записи {found.counts.appointments} · известия {found.counts.notifications}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <a
              href={`/api/privacy/export?phone=${encodeURIComponent(found.phone)}`}
              className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95"
            >
              Изтегли данните (JSON)
            </a>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--ink-soft)]">
                За изтриване напиши телефона отново
              </span>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={found.phone}
                className="w-56 rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </label>
            <button
              type="button"
              onClick={erase}
              disabled={isPending || !canErase}
              className="inline-flex h-10 items-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {isPending ? "Изтрива…" : "Изтрий клиента"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <span className="text-sm text-red-600">{error}</span> : null}
      {msg ? <span className="text-sm font-medium text-[var(--accent-strong)]">{msg}</span> : null}
    </div>
  );
}
