"use client";

import { ClipboardList, Plus, StickyNote, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { DataRow, DataTable } from "@/components/data-table";
import { LEAD_STATUSES } from "@/lib/crm/lead-form";
import type { DashboardLeadListItem } from "@/lib/dashboard/data";

import { createLead, updateLeadNotes, updateLeadStatus } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  new: "Нова",
  qualified: "Квалифициран",
  booked: "Записан",
  quoted: "Оферта",
  won: "Спечелен",
  lost: "Загубен",
  spam: "Спам",
};

const inputClass =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--accent-strong)]";
const textareaClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-strong)]";
const primaryBtn =
  "inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95 disabled:opacity-60";
const secondaryBtn =
  "inline-flex h-10 items-center rounded-lg border border-[var(--line)] px-4 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)]";

export function LeadsBoard({ leads }: { leads: DashboardLeadListItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [notesLead, setNotesLead] = useState<DashboardLeadListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changeStatus(id: string, status: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateLeadStatus(id, status);
      if (!result.ok) setError(statusErrorLabel(result.error));
      else router.refresh();
    });
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createLead(formData);
      if (!result.ok) setError(createErrorLabel(result.error));
      else {
        setCreateOpen(false);
        router.refresh();
      }
    });
  }

  function saveNotes(id: string, notes: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateLeadNotes(id, notes);
      if (!result.ok) setError("Неуспешен запис на бележката.");
      else {
        setNotesLead(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-[var(--ink-soft)]">{leads.length} запитвания</div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] shadow-[var(--shadow-accent)] transition hover:brightness-95"
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          Ново запитване
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <DataTable columns={["Клиент", "Телефон", "Услуга", "Създаден", "Статус", "Бележки"]}>
        {leads.map((lead) => (
          <DataRow key={lead.id} columns={6} className={isPending ? "opacity-70" : ""}>
            <div className="min-w-0">
              <div className="truncate font-medium">{lead.name}</div>
              <div className="mt-1 truncate text-xs text-[var(--ink-soft)]">{lead.city ?? "—"}</div>
            </div>
            <div className="truncate font-mono">{lead.phone ?? "—"}</div>
            <div className="min-w-0 truncate text-[var(--ink-soft)]">{lead.serviceType ?? "—"}</div>
            <div className="font-mono text-[var(--ink-soft)]">{formatDate(lead.createdAt)}</div>
            <div>
              <select
                value={normalizedStatus(lead.status)}
                onChange={(event) => changeStatus(lead.id, event.target.value)}
                disabled={isPending}
                aria-label="Статус"
                className="h-8 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 text-xs font-semibold outline-none focus:border-[var(--accent-strong)]"
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setNotesLead(lead);
                }}
                title="Бележки"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--line)] px-2 text-xs text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)]"
              >
                <StickyNote size={14} aria-hidden="true" />
                {lead.notes ? "Има" : "Добави"}
              </button>
            </div>
          </DataRow>
        ))}
        {leads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--accent-strong)]">
              <ClipboardList size={20} aria-hidden="true" />
            </span>
            <div className="text-sm font-medium">Още няма запитвания</div>
            <div className="text-xs text-[var(--ink-muted)]">
              Появяват се автоматично след обаждане — или добави ръчно.
            </div>
          </div>
        ) : null}
      </DataTable>

      {createOpen ? (
        <Modal title="Ново запитване" onClose={() => setCreateOpen(false)}>
          <form onSubmit={submitCreate} className="flex flex-col gap-3">
            <Field label="Име">
              <input name="name" className={inputClass} placeholder="Иван Петров" />
            </Field>
            <Field label="Телефон">
              <input name="phone" className={inputClass} placeholder="+359 88 ..." />
            </Field>
            <Field label="Имейл">
              <input name="email" type="email" className={inputClass} />
            </Field>
            <Field label="Град">
              <input name="city" className={inputClass} />
            </Field>
            <Field label="Услуга">
              <input name="service_type" className={inputClass} placeholder="напр. Профилактика климатик" />
            </Field>
            <Field label="Бележки">
              <textarea name="notes" rows={3} className={textareaClass} />
            </Field>
            <input type="hidden" name="status" value="new" />
            <p className="text-xs text-[var(--ink-muted)]">Въведи поне име или телефон.</p>
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} className={secondaryBtn}>
                Отказ
              </button>
              <button type="submit" disabled={isPending} className={primaryBtn}>
                {isPending ? "Запис…" : "Запази"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {notesLead ? (
        <Modal title={`Бележки · ${notesLead.name}`} onClose={() => setNotesLead(null)}>
          <NotesEditor
            lead={notesLead}
            pending={isPending}
            onSave={(notes) => saveNotes(notesLead.id, notes)}
            onClose={() => setNotesLead(null)}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function NotesEditor({
  lead,
  pending,
  onSave,
  onClose,
}: {
  lead: DashboardLeadListItem;
  pending: boolean;
  onSave: (notes: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(lead.notes ?? "");

  return (
    <div className="flex flex-col gap-3">
      {lead.aiSummary ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm">
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            AI резюме
          </div>
          {lead.aiSummary}
        </div>
      ) : null}
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={5}
        className={textareaClass}
        placeholder="Добави бележка…"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryBtn}>
          Отказ
        </button>
        <button type="button" disabled={pending} onClick={() => onSave(value)} className={primaryBtn}>
          {pending ? "Запис…" : "Запази"}
        </button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори"
            className="shrink-0 text-[var(--ink-soft)] transition hover:text-[var(--foreground)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizedStatus(status: string) {
  return (LEAD_STATUSES as readonly string[]).includes(status) ? status : "new";
}

function statusErrorLabel(code: string) {
  return code === "invalid_status" ? "Невалиден статус." : "Неуспешна промяна на статуса.";
}

function createErrorLabel(code: string) {
  if (code === "name_or_phone_required") return "Въведи поне име или телефон.";
  if (code === "no_org") return "Няма активна организация.";
  return "Неуспешно създаване на запитване.";
}
