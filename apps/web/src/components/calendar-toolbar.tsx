"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Ban, ChevronLeft, ChevronRight, Clock } from "lucide-react";

interface CalendarToolbarProps {
  previousWeek: string;
  nextWeek: string;
}

export function CalendarToolbar({ previousWeek, nextWeek }: CalendarToolbarProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("Обедна почивка");

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    }

    if (isPopoverOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPopoverOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsModalOpen(false);
    }

    if (isModalOpen) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  const handleDelaySelect = (minutes: number) => {
    alert(`Изпратени са известия по SMS до следващите клиенти за закъснение от ${minutes} минути.`);
    setIsPopoverOpen(false);
  };

  const handleBlockSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (startTime >= endTime) {
      alert("Крайният час трябва да бъде след началния час.");
      return;
    }

    alert(`Блокирахте времето от ${startTime} до ${endTime} за ${reason}. AI няма да записва часове в този диапазон.`);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconLink href={`/appointments?week=${previousWeek}`} label="Предишна седмица">
        <ChevronLeft size={17} aria-hidden="true" />
      </IconLink>
      <Link
        href="/appointments"
        className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
      >
        Днес
      </Link>
      <IconLink href={`/appointments?week=${nextWeek}`} label="Следваща седмица">
        <ChevronRight size={17} aria-hidden="true" />
      </IconLink>

      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsPopoverOpen((value) => !value)}
          aria-expanded={isPopoverOpen}
          aria-haspopup="menu"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
        >
          <Clock size={16} className="text-amber-600" aria-hidden="true" />
          <span>Закъснявам</span>
        </button>

        {isPopoverOpen ? (
          <div className="syn-card absolute right-0 z-50 mt-2 w-56 overflow-hidden p-1">
            <div className="border-b border-[var(--line)] px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              Време на закъснение
            </div>
            {[15, 30, 45].map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => handleDelaySelect(minutes)}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
              >
                {minutes} минути
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          setStartTime("12:00");
          setEndTime("13:00");
          setReason("Обедна почивка");
          setIsModalOpen(true);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
      >
        <Ban size={16} className="text-red-600" aria-hidden="true" />
        <span>Блокирай време</span>
      </button>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-time-title"
            aria-describedby="block-time-desc"
            className="syn-card w-full max-w-md p-6"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <Ban size={20} aria-hidden="true" />
              </span>
              <div>
                <h3 id="block-time-title" className="text-lg font-semibold">
                  Блокиране на време
                </h3>
                <p id="block-time-desc" className="mt-1 text-xs text-[var(--ink-soft)]">
                  AI няма да записва часове в този диапазон.
                </p>
              </div>
            </div>

            <form onSubmit={handleBlockSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <TimeInput label="Начало" id="start-time" value={startTime} onChange={setStartTime} />
                <TimeInput label="Край" id="end-time" value={endTime} onChange={setEndTime} />
              </div>

              <label className="block">
                <span className="syn-label">Причина</span>
                <input
                  id="reason"
                  type="text"
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent-strong)]"
                />
              </label>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:brightness-95"
                >
                  Блокирай
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
      aria-label={label}
      title={label}
    >
      {children}
    </Link>
  );
}

function TimeInput({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="syn-label">{label}</span>
      <input
        id={id}
        type="time"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent-strong)]"
      />
    </label>
  );
}
