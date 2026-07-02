"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, Loader2, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";

interface Appointment {
  id: string;
  startsAt?: string | null;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  serviceType?: string | null;
}

interface DashboardTimelineProps {
  appointments: Appointment[];
}

export function DashboardTimeline({ appointments }: DashboardTimelineProps) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    if (!window.confirm("Сигурни ли сте, че искате да отмените този час?")) return;

    setCancellingId(id);
    try {
      const response = await fetch(`/api/appointments/${id}/cancel`, { method: "POST" });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        const body = contentType?.includes("application/json") ? await response.json() : null;
        throw new Error(body?.error ?? "неизвестна грешка");
      }

      alert("Часът е анулиран успешно.");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "неизвестна грешка";
      alert(`Грешка при анулиране: ${message}`);
    } finally {
      setCancellingId(null);
    }
  };

  if (!appointments || appointments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--accent-strong)]">
          <CalendarClock size={18} aria-hidden="true" />
        </span>
        <div className="text-sm font-medium">Няма предстоящи часове</div>
        <div className="text-xs text-[var(--ink-muted)]">Новите часове ще се появят тук.</div>
      </div>
    );
  }

  return (
    <div className="relative ml-3 pl-6">
      <div className="absolute bottom-4 left-[7px] top-4 w-px bg-[var(--line)]" aria-hidden="true" />

      <ul className="space-y-4" role="list">
        {appointments.map((appointment) => {
          const isCancelling = cancellingId === appointment.id;
          const labelContext = appointment.customerName || "клиент";

          return (
            <li key={appointment.id} className="group relative" role="listitem">
              <span
                className={`absolute -left-[24px] top-4 h-3 w-3 -translate-x-1/2 rounded-full border-2 bg-[var(--surface)] transition-transform group-hover:scale-125 ${
                  appointment.status === "confirmed" ? "border-[var(--accent-strong)]" : "border-blue-500"
                }`}
                aria-hidden="true"
              />

              <div className="syn-card syn-card-lift p-4 shadow-none">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2.5">
                  <span className="font-mono text-sm font-semibold text-[var(--accent-strong)]" suppressHydrationWarning>
                    {appointment.startsAt ? formatDateTime(appointment.startsAt) : "Няма час"}
                  </span>
                  <StatusBadge value={appointment.status} />
                </div>

                <div className="mt-3 space-y-2">
                  <div className="text-sm font-semibold">{appointment.customerName || "Няма име"}</div>
                  {appointment.customerPhone ? (
                    <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--ink-muted)]">
                      <Phone size={12} aria-hidden="true" />
                      <span>{appointment.customerPhone}</span>
                    </div>
                  ) : null}
                  <span className="inline-flex rounded-md border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--ink-soft)]">
                    {appointment.serviceType || "Обща услуга"}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-end gap-4 border-t border-[var(--line)] pt-3 text-xs font-semibold">
                  <Link
                    href={`/appointments?appointment=${appointment.id}`}
                    className="inline-flex items-center gap-1 text-[var(--accent-strong)] transition hover:brightness-90"
                    aria-label={`Отвори часа за ${labelContext}`}
                  >
                    Отвори
                    <ArrowRight size={12} aria-hidden="true" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleCancel(appointment.id)}
                    disabled={cancellingId !== null}
                    className="inline-flex items-center gap-1 text-[var(--danger)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Отмени часа за ${labelContext}`}
                  >
                    {isCancelling ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
                    Отмени
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("bg-BG", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Sofia",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
