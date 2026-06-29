"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  X,
  Phone,
  MessageSquare,
  Play,
  Pause,
  MapPin,
  Calendar,
  Trash2,
  CalendarDays,
  Volume2
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

export default function AppointmentDrawer({ appointment }: AppointmentDrawerProps) {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [isDeleting, setIsDeleting] = useState(false);

  const duration = 74; // 1:14 in seconds

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying) {
      const delay = 1000 / speed;
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, delay);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, speed]);

  // Close drawer on ESC key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        router.push("/appointments");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [router]);

  if (!appointment) return null;

  const formatAudioTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleSpeedToggle = () => {
    setSpeed((prev) => {
      if (prev === 1) return 1.5;
      if (prev === 1.5) return 2;
      return 1;
    });
  };

  const handleViberAlert = () => {
    alert(`Mock Viber message sent to ${appointment.customerPhone || "клиента"}`);
  };

  const handleRescheduleAlert = () => {
    alert("Simulated reschedule dialog");
  };

  const handleCancel = async () => {
    if (!confirm("Сигурни ли сте, че искате да отмените този час?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/appointments/${appointment.id}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Неуспешно изтриване на часа.");
      }

      alert("Часът е анулиран успешно.");
      router.push("/appointments");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Нещо се обърка";
      alert(`Грешка: ${message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Get localized BG transcript based on service type
  const getTranscript = () => {
    const name = appointment.customerName || "Георги";
    const type = (appointment.serviceType || "").toLowerCase();

    if (type.includes("профилактика")) {
      return [
        { sender: "receptionist", text: "Здравейте! Благодарим ви, че се свързахте с нас. Как можем да ви помогнем днес?" },
        { sender: "customer", text: `Здравейте, казвам се ${name}. Искам да запазя час за годишна профилактика на климатика у дома.` },
        { sender: "receptionist", text: "Чудесно, господин Петров. Имате ли предпочитания за ден и час през следващата седмица?" },
        { sender: "customer", text: "Ами, по възможност вторник или сряда сутринта." },
        { sender: "receptionist", text: "Разбира се, нека проверя. Във вторник от 9:30 часа свободен ли сте?" },
        { sender: "customer", text: "Да, вторник в 9:30 ме устройва отлично." },
        { sender: "receptionist", text: "Записах ви. Моля, потвърдете адреса за посещението." },
        { sender: "customer", text: appointment.location || "Адресът е София, ж.к. Младост 2, блок 220, вх. Б, ап. 12." },
        { sender: "receptionist", text: "Благодаря! Часът ви е потвърден за вторник от 09:30 часа. Наш техник ще ви посети. Приятен ден!" },
        { sender: "customer", text: "Благодаря ви много, хубав ден!" }
      ];
    }

    if (type.includes("диагностика") || type.includes("ремонт")) {
      return [
        { sender: "receptionist", text: "Здравейте! Каква услуга бихте искали да заявите днес?" },
        { sender: "customer", text: `Здравейте. Климатикът ми в хола спря да духа топло и мига някаква червена лампичка. Името ми е ${name}.` },
        { sender: "receptionist", text: "Съжалявам да го чуя. Трябва да изпратим наш техник за диагностика. Кога би било удобно за вас?" },
        { sender: "customer", text: "Имате ли възможност за утре следобед? Доста е спешно." },
        { sender: "receptionist", text: "Нека видя... Да, утре (четвъртък) имаме свободен час в 15:00 часа за диагностика. Устройва ли ви?" },
        { sender: "customer", text: "Да, перфектно. Моля да ме запишете тогава." },
        { sender: "receptionist", text: "Записах ви. Техникът ще ви се обади 15 минути преди пристигане. Лек ден!" },
        { sender: "customer", text: "Благодаря ви! До утре." }
      ];
    }

    if (type.includes("монтаж")) {
      return [
        { sender: "receptionist", text: "Здравейте! Благодарим ви, че избрахте нашата компания. С какво можем да сме ви полезни?" },
        { sender: "customer", text: `Здравейте, бих искал да запиша час за монтаж на нов климатик, който закупих от вас. Казвам се ${name}.` },
        { sender: "receptionist", text: "Разбира се! Монтажът обикновено отнема около 3-4 часа. Имаме свободни часове в петък от 9:00 часа сутринта. Подходящо ли е за вас?" },
        { sender: "customer", text: "Да, петък от 9:00 сутринта е супер." },
        { sender: "receptionist", text: "Идеално, записах ви. Адресът същият ли е като в поръчката?" },
        { sender: "customer", text: appointment.location || "Да, ж.к. Люлин 5, блок 512, вх. А." },
        { sender: "receptionist", text: "Благодаря ви. Часът за монтаж е потвърден. Приятен ден!" },
        { sender: "customer", text: "Хубав ден и на вас!" }
      ];
    }

    return [
      { sender: "receptionist", text: "Здравейте! С какво мога да ви помогна днес?" },
      { sender: "customer", text: `Здравейте, обаждам се да запазя час за обслужване на климатична система. Казвам се ${name}.` },
      { sender: "receptionist", text: "Разбира се. Мога да ви предложа свободен час за следващия понеделник в 11:00 часа." },
      { sender: "customer", text: "Този ден и час ме устройват напълно." },
      { sender: "receptionist", text: "Чудесно. Записах ви. Ще получите потвърждение и по SMS. Приятен ден!" },
      { sender: "customer", text: "Благодаря, приятен ден!" }
    ];
  };

  const transcript = getTranscript();

  const formattedDate = appointment.startsAt
    ? new Intl.DateTimeFormat("bg-BG", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Sofia"
      }).format(new Date(appointment.startsAt))
    : "Няма точен час";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop Backdrop Overlay */}
      <Link
        href="/appointments"
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        {/* Drawer Panel */}
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="drawer-title" 
          className="w-screen max-w-md transform bg-[var(--surface)] text-[var(--foreground)] border-l border-[var(--line)] shadow-2xl transition-transform duration-300 ease-out flex flex-col h-full"
        >
          
          {/* Header */}
          <div className="border-b border-[var(--line)] px-6 py-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="drawer-title" className="text-lg font-bold tracking-tight">{appointment.customerName}</h2>
                <StatusBadge value={appointment.status} />
              </div>
              <p className="mt-1 text-sm text-[var(--ink-soft)] font-medium">{appointment.serviceType}</p>
            </div>
            <Link
              href="/appointments"
              aria-label="Затвори"
              className="rounded-md p-1.5 text-[var(--ink-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] transition cursor-pointer"
            >
              <X size={20} />
            </Link>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            
            {/* Quick Details */}
            <div className="grid gap-3 rounded-lg bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-soft)] border border-[var(--line)]">
              <div className="flex items-center gap-3">
                <CalendarDays size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
                <span className="font-semibold text-[var(--foreground)]">{formattedDate}</span>
              </div>
              {appointment.customerPhone && (
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="font-mono text-[var(--foreground)]">{appointment.customerPhone}</span>
                </div>
              )}
              {appointment.location && (
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="truncate text-[var(--foreground)]">{appointment.location}</span>
                </div>
              )}
            </div>

            {/* Quick Contact Actions */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)] mb-2">Бързи действия</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleViberAlert}
                  className="flex items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] py-2.5 px-3 text-sm font-semibold hover:bg-[var(--surface-muted)] transition cursor-pointer"
                >
                  <MessageSquare size={16} className="text-indigo-600 dark:text-indigo-400" />
                  Viber съобщение
                </button>
                {appointment.customerPhone ? (
                  <a
                    href={`tel:${appointment.customerPhone}`}
                    className="flex items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] py-2.5 px-3 text-sm font-semibold hover:bg-[var(--surface-muted)] transition text-center"
                  >
                    <Phone size={16} className="text-emerald-600 dark:text-emerald-400" />
                    Обаждане
                  </a>
                ) : (
                  <button
                    disabled
                    className="flex items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-muted)] py-2.5 px-3 text-sm font-semibold text-slate-400 cursor-not-allowed"
                  >
                    <Phone size={16} />
                    Няма номер
                  </button>
                )}
              </div>
            </div>

            {/* AI Call Recording Player */}
            <div className="border border-[var(--line)] rounded-lg p-4 space-y-3 bg-[var(--surface)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 size={16} className="text-teal-600 dark:text-teal-400" />
                  <span className="text-xs font-bold text-[var(--foreground)]">Запис от разговор</span>
                </div>
                <button
                  onClick={handleSpeedToggle}
                  className="px-2 py-0.5 rounded border border-[var(--line)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--ink-soft)] hover:text-[var(--foreground)] transition cursor-pointer"
                >
                  {speed}x
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  aria-label={isPlaying ? "Пауза" : "Пусни"}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white hover:bg-teal-700 transition cursor-pointer"
                >
                  {isPlaying ? <Pause size={14} fill="white" /> : <Play size={14} className="ml-0.5" fill="white" />}
                </button>

                {/* Progress bar */}
                <div className="flex-1 space-y-1">
                  <div
                    className="relative w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const percentage = clickX / rect.width;
                      setCurrentTime(Math.floor(percentage * duration));
                    }}
                  >
                    <div
                      className="absolute top-0 left-0 h-full bg-teal-600 transition-all duration-100"
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[var(--ink-soft)]">
                    <span>{formatAudioTime(currentTime)}</span>
                    <span>{formatAudioTime(duration)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Call Transcript */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">Транскрипция от AI асистента</h3>
              <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 max-h-[300px] overflow-y-auto">
                {transcript.map((bubble, i) => (
                  <div
                    key={i}
                    className={`flex flex-col max-w-[85%] ${
                      bubble.sender === "customer" ? "ml-auto items-end" : "mr-auto items-start"
                    }`}
                  >
                    <span className="text-[10px] text-[var(--ink-soft)] font-semibold mb-0.5 uppercase tracking-wide">
                      {bubble.sender === "customer" ? "Клиент" : "Асистент"}
                    </span>
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        bubble.sender === "customer"
                          ? "bg-teal-600 text-white rounded-tr-none"
                          : "bg-[var(--surface)] text-[var(--foreground)] border border-[var(--line)] rounded-tl-none"
                      }`}
                    >
                      {bubble.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Footer Action Buttons */}
          <div className="border-t border-[var(--line)] px-6 py-5 bg-[var(--surface-muted)] grid grid-cols-2 gap-3 shrink-0">
            <button
              onClick={handleRescheduleAlert}
              className="flex items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] py-2.5 px-4 text-sm font-semibold hover:bg-[var(--surface-muted)] transition cursor-pointer"
            >
              <Calendar size={16} className="text-teal-600 dark:text-teal-400" />
              Премести часа
            </button>
            <button
              onClick={handleCancel}
              disabled={isDeleting}
              className="flex items-center justify-center gap-2 rounded-md bg-red-600 text-white py-2.5 px-4 text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 size={16} />
              {isDeleting ? "Анулиране..." : "Отмени часа"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
