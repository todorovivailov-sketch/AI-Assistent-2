"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Phone } from "lucide-react";
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

  const handleCancel = async (id: string) => {
    const confirmed = window.confirm("Сигурни ли сте, че искате да отмените този час?");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/appointments/${id}/cancel`, {
        method: "POST",
      });

      if (response.ok) {
        alert("Часът е анулиран успешно.");
        router.refresh();
      } else {
        const errData = await response.json();
        alert(`Грешка при анулиране: ${errData.error || "неизвестна грешка"}`);
      }
    } catch (error) {
      console.error("Cancel request error:", error);
      alert("Възникна грешка при изпращане на заявката за отмяна.");
    }
  };

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

  if (!appointments || appointments.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--ink-soft)]">
        Няма предстоящи часове за днес.
      </div>
    );
  }

  return (
    <div className="relative border-l border-[var(--line)] pl-6 ml-3 space-y-6">
      {appointments.map((appointment) => (
        <div key={appointment.id} className="relative group">
          {/* Timeline Dot */}
          <span 
            className="absolute -left-[30px] top-2 h-3.5 w-3.5 rounded-full border-2 border-teal-600 bg-[var(--surface)] transition-transform duration-300 group-hover:scale-125 dark:border-teal-400"
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
                  <Phone size={12} className="text-[var(--ink-soft)]" />
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
              >
                Премести часа
                <ArrowRight size={12} />
              </Link>
              
              <button
                type="button"
                onClick={() => handleCancel(appointment.id)}
                className="text-[var(--danger)] transition-opacity hover:opacity-80 cursor-pointer"
              >
                Отмени часа
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
