"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CalendarDays,
  MapPin,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Trash2,
  Volume2,
  X,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";

export interface Appointment {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  customerName: string;
  customerPhone: string | null;
  serviceType: string;
  location: string | null;
  notes: string | null;
  hasGoogleEvent: boolean;
}

type AppointmentDrawerProps = {
  appointment: Appointment;
};

type TranscriptLine = {
  sender: "assistant" | "customer";
  text: string;
};

const waveform = [28, 44, 22, 55, 72, 31, 48, 63, 36, 24, 58, 70, 80, 46, 34, 62, 41, 29, 52, 66, 32, 47, 25, 38];

function formatAudioTime(secs: number) {
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildTranscript(appointment: Appointment): TranscriptLine[] {
  const name = appointment.customerName || "клиента";
  const service = appointment.serviceType || appointment.title || "консултация";
  const location = appointment.location || "адресът е уточнен по време на разговора";

  return [
    { sender: "assistant", text: "Здравейте! С какво мога да съдействам?" },
    { sender: "customer", text: `Здравейте, казвам се ${name}. Искам да запазя час за ${service}.` },
    { sender: "assistant", text: "Разбирам. Кой ден и приблизително в колко часа ви е удобно?" },
    { sender: "customer", text: "Удобно ми е следобед, ако има свободен час." },
    { sender: "assistant", text: "Проверявам календара. Има свободен час, който мога да потвърдя за вас." },
    { sender: "customer", text: "Да, устройва ме." },
    { sender: "assistant", text: "Записах часа. Моля, потвърдете телефон и адрес за посещението." },
    { sender: "customer", text: location },
    {
      sender: "assistant",
      text: "Благодаря. Часът е потвърден. Има ли още нещо, с което мога да съдействам?",
    },
    { sender: "customer", text: "Не, благодаря." },
    { sender: "assistant", text: "Благодаря за обаждането. Дочуване и приятен ден!" },
  ];
}

export default function AppointmentDrawer({ appointment }: AppointmentDrawerProps) {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [isDeleting, setIsDeleting] = useState(false);
  const duration = 74;

  useEffect(() => {
    if (!isPlaying) return;

    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= duration) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, 1000 / speed);

    return () => window.clearInterval(interval);
  }, [duration, isPlaying, speed]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        router.push("/appointments");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  const transcript = useMemo(() => buildTranscript(appointment), [appointment]);

  const formattedDate = appointment.startsAt
    ? new Intl.DateTimeFormat("bg-BG", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Sofia",
      }).format(new Date(appointment.startsAt))
    : "Няма точен час";

  const handleSpeedToggle = () => {
    setSpeed((prev) => {
      if (prev === 1) return 1.5;
      if (prev === 1.5) return 2;
      return 1;
    });
  };

  const handleMessage = () => {
    alert(`Подготвено съобщение до ${appointment.customerPhone || "клиента"}.`);
  };

  const handleRescheduleAlert = () => {
    alert("Тук ще се отвори диалог за преместване на часа.");
  };

  const handleCancel = async () => {
    if (!confirm("Сигурни ли сте, че искате да отмените този час?")) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/appointments/${appointment.id}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Неуспешно анулиране на часа.");
      }

      alert("Часът е анулиран успешно.");
      router.push("/appointments");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Нещо се обърка.";
      alert(`Грешка: ${message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <Link href="/appointments" className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" aria-label="Затвори" />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
          className="flex h-full w-screen max-w-[460px] flex-col border-l border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="drawer-title" className="truncate text-lg font-semibold tracking-tight">
                  {appointment.customerName}
                </h2>
                <StatusBadge value={appointment.status} />
              </div>
              <p className="mt-1 truncate text-sm text-[var(--ink-soft)]">{appointment.serviceType}</p>
            </div>
            <Link
              href="/appointments"
              aria-label="Затвори"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
            >
              <X size={18} />
            </Link>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm">
              <IconLine icon={CalendarDays} text={formattedDate} strong />
              {appointment.customerPhone ? <IconLine icon={Phone} text={appointment.customerPhone} mono /> : null}
              {appointment.location ? <IconLine icon={MapPin} text={appointment.location} /> : null}
              {appointment.notes ? <p className="text-[var(--ink-soft)]">{appointment.notes}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleMessage}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
              >
                <MessageSquare size={16} />
                Съобщение
              </button>
              {appointment.customerPhone ? (
                <a
                  href={`tel:${appointment.customerPhone}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
                >
                  <Phone size={16} />
                  Обади се
                </a>
              ) : (
                <button
                  disabled
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--ink-soft)]"
                >
                  <Phone size={16} />
                  Няма номер
                </button>
              )}
            </div>

            <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Volume2 size={16} className="text-[var(--accent-strong)]" />
                  Запис от разговора
                </div>
                <button
                  onClick={handleSpeedToggle}
                  className="rounded-md border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs font-semibold"
                >
                  {speed}x
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlaying((value) => !value)}
                  aria-label={isPlaying ? "Пауза" : "Пусни"}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-white"
                >
                  {isPlaying ? <Pause size={15} fill="white" /> : <Play size={15} fill="white" className="ml-0.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div
                    className="flex h-9 cursor-pointer items-end gap-[3px]"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setCurrentTime(Math.floor(((event.clientX - rect.left) / rect.width) * duration));
                    }}
                  >
                    {waveform.map((height, index) => {
                      const active = index / waveform.length <= currentTime / duration;
                      return (
                        <div
                          key={index}
                          className="flex-1 rounded-sm transition-colors"
                          style={{
                            height: `${height}%`,
                            backgroundColor: active ? "var(--accent-strong)" : "var(--line)",
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--ink-soft)]">
                    <span>{formatAudioTime(currentTime)}</span>
                    <span>{formatAudioTime(duration)}</span>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="syn-label mb-3">Транскрипция</h3>
              <div className="max-h-[330px] space-y-3 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                {transcript.map((line, index) => {
                  const customer = line.sender === "customer";
                  return (
                    <div key={index} className={`flex ${customer ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[86%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                          customer
                            ? "bg-[var(--foreground)] text-[var(--background)]"
                            : "border border-[var(--line)] bg-[var(--surface)]"
                        }`}
                      >
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] opacity-70">
                          {customer ? "Клиент" : "Асистент"}
                        </div>
                        {line.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-[var(--line)] bg-[var(--surface-muted)] px-6 py-5">
            <button
              onClick={handleRescheduleAlert}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
            >
              <Calendar size={16} />
              Премести
            </button>
            <button
              onClick={handleCancel}
              disabled={isDeleting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={16} />
              {isDeleting ? "Анулиране..." : "Отмени"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconLine({
  icon: Icon,
  text,
  strong = false,
  mono = false,
}: {
  icon: typeof CalendarDays;
  text: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Icon size={16} className="shrink-0 text-[var(--accent-strong)]" />
      <span
        className={`min-w-0 truncate ${strong ? "font-semibold text-[var(--foreground)]" : "text-[var(--ink-soft)]"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {text}
      </span>
    </div>
  );
}
