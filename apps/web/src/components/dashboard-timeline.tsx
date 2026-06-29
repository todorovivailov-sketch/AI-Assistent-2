"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Phone, Loader2 } from "lucide-react";
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

// Move outside component scope to avoid recreation on render
const formatDateTime = (value: string) => {
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
};

export function DashboardTimeline({ appointments }: DashboardTimelineProps) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    const confirmed = window.confirm("Сигурни ли сте, че искате да отмените този час?");
    if (!confirmed) return;

    setCancellingId(id);
    try {
      const response = await fetch(`/api/appointments/${id}/cancel`, {
        method: "POST",
      });

      if (response.ok) {
        alert("Часът е анулиран успешно.");
        router.refresh();
      } else {
        let errorMessage = "неизвестна грешка";
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        }
        alert(`Грешка при анулиране: ${errorMessage}`);
      }
    } catch (error) {
      console.error("Cancel request error:", error);
      alert("Възникна грешка при изпращане на заявката за отмяна.");
    } finally {
      setCancellingId(null);
    }
  };

  if (!appointments || appointments.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--ink-soft)]">
        Няма предстоящи часове за днес.
      </div>
    );
  }

  return (
    <div className="relative pl-6 ml-3">
      {/* Decorative vertical timeline line - prevents top/bottom overflow */}
      <div className="absolute left-[7px] top-4 bottom-4 w-px bg-[var(--line)]" aria-hidden="true" />

      <ul className="space-y-6" role="list">
        {appointments.map((appointment) => {
          const isCancelling = cancellingId === appointment.id;
          const labelContext = appointment.customerName || "неизвестен клиент";
          
          return (
            <li key={appointment.id} className="relative group" role="listitem">
              {/* Timeline Dot */}
              <span 
                className={`absolute -left-[24px] top-2.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 bg-[var(--surface)] transition-transform duration-300 group-hover:scale-125 ${
                  appointment.status === "confirmed"
                    ? "border-emerald-500 dark:border-emerald-400 animate-glow-pulse"
                    : "border-blue-500 dark:border-blue-400 animate-glow-pulse-blue"
                }`}
                aria-hidden="true"
              />

              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 transition-all duration-300 hover:border-teal-500/40 hover:shadow-xs">
                {/* Header: Date/Time & Status */}
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2.5">
                  <span className="font-mono text-sm font-semibold text-teal-700 dark:text-teal-400" suppressHydrationWarning>
                    {appointment.startsAt ? formatDateTime(appointment.startsAt) : "Няма час"}
                  </span>
                  <StatusBadge value={appointment.status} />
                </div>

                {/* Content: Customer & Service details */}
                <div className="mt-3 space-y-2">
                  <div className="font-medium text-sm text-[var(--foreground)]">
                    {appointment.customerName || "Няма име"}
                  </div>

                  {appointment.customerPhone && (
                    <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--ink-soft)]">
                      <Phone size={12} className="text-[var(--ink-soft)]" aria-hidden="true" />
                      <span>{appointment.customerPhone}</span>
                    </div>
                  )}

                  <div className="mt-1 text-xs text-[var(--ink-soft)]">
                    <span className="inline-block rounded-md bg-[var(--surface-muted)] px-2 py-0.5 font-medium border border-[var(--line)]">
                      {appointment.serviceType || "Обща услуга"}
                    </span>
                  </div>
                </div>

                {/* Action Footer */}
                <div className="mt-4 flex items-center justify-end gap-4 border-t border-[var(--line)] pt-3 text-xs font-semibold">
                  <Link
                    href={`/appointments?appointment=${appointment.id}`}
                    className="inline-flex items-center gap-1 text-teal-700 transition-colors hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                    aria-label={`Премести часа за ${labelContext}`}
                  >
                    Премести часа
                    <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                  
                  <button
                    type="button"
                    onClick={() => handleCancel(appointment.id)}
                    disabled={cancellingId !== null}
                    className="inline-flex items-center gap-1 text-[var(--danger)] transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    aria-label={`Отмени часа за ${labelContext}`}
                  >
                    {isCancelling && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                    Отмени часа
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
