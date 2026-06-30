"use client";

import { CalendarPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { createAppointment } from "./actions";

const inputClass =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--accent-strong)]";
const textareaClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-strong)]";

export function NewAppointmentButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createAppointment(formData);
      if (!result.ok) setError(errorLabel(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_4px_14px_-4px_rgba(74,222,128,.6)] transition hover:brightness-95"
      >
        <CalendarPlus size={15} strokeWidth={2.5} aria-hidden="true" />
        Нов час
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Нов час</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Затвори"
                className="shrink-0 text-[var(--ink-soft)] transition hover:text-[var(--foreground)]"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <Field label="Заглавие">
                <input name="title" className={inputClass} placeholder="напр. Профилактика климатик" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Дата">
                  <input type="date" name="date" className={inputClass} />
                </Field>
                <Field label="Начало">
                  <input type="time" name="time" className={inputClass} defaultValue="09:00" />
                </Field>
              </div>
              <Field label="Клиент">
                <input name="customer_name" className={inputClass} />
              </Field>
              <Field label="Телефон">
                <input name="customer_phone" className={inputClass} placeholder="+359 88 ..." />
              </Field>
              <Field label="Адрес">
                <input name="location" className={inputClass} />
              </Field>
              <Field label="Бележки">
                <textarea name="notes" rows={2} className={textareaClass} />
              </Field>
              <input type="hidden" name="status" value="confirmed" />
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              ) : null}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 items-center rounded-lg border border-[var(--line)] px-4 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)]"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60"
                >
                  {isPending ? "Запис…" : "Запази"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-[var(--ink-soft)]">{label}</span>
      {children}
    </label>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case "title_required":
      return "Въведи заглавие на часа.";
    case "start_required":
      return "Избери дата.";
    case "end_before_start":
      return "Краят трябва да е след началото.";
    case "no_org":
      return "Няма активна организация.";
    default:
      return "Неуспешно създаване на часа.";
  }
}
