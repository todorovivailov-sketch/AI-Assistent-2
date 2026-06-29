"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarPlus, Clock, Ban } from "lucide-react";

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

  // Close popover on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    }
    if (isPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPopoverOpen]);

  // Close modal on ESC key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    }
    if (isModalOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  const handleDelaySelect = (minutes: number) => {
    alert(`Изпратени са известия по SMS до следващите клиенти за деня за закъснение от ${minutes} минути.`);
    setIsPopoverOpen(false);
  };

  const handleBlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (startTime >= endTime) {
      alert("Крайният час трябва да бъде след началния час.");
      return;
    }
    alert(`Успешно блокирахте времето от ${startTime} до ${endTime} за ${reason}. AI няма да записва часове в този диапазон.`);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/appointments?week=${previousWeek}`}
        className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
        title="Предишна седмица"
      >
        <ChevronLeft size={17} aria-hidden="true" />
      </Link>
      <Link
        href="/appointments"
        className="inline-flex h-9 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
      >
        Днес
      </Link>
      <Link
        href={`/appointments?week=${nextWeek}`}
        className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
        title="Следваща седмица"
      >
        <ChevronRight size={17} aria-hidden="true" />
      </Link>

      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          aria-expanded={isPopoverOpen}
          aria-haspopup="menu"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
        >
          <Clock size={16} className="text-amber-500" aria-hidden="true" />
          <span>Закъснявам</span>
        </button>

        {isPopoverOpen && (
          <div className="absolute right-0 mt-2 w-48 rounded-md border border-[var(--line)] bg-[var(--surface)] p-1 shadow-lg z-50 transition duration-150 ease-out">
            <div className="px-2 py-1.5 text-xs font-semibold text-[var(--ink-soft)] border-b border-[var(--line)] mb-1">
              Изберете време на закъснение:
            </div>
            <button
              onClick={() => handleDelaySelect(15)}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-[var(--surface-muted)] text-[var(--foreground)] transition cursor-pointer"
            >
              15 минути
            </button>
            <button
              onClick={() => handleDelaySelect(30)}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-[var(--surface-muted)] text-[var(--foreground)] transition cursor-pointer"
            >
              30 минути
            </button>
            <button
              onClick={() => handleDelaySelect(45)}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-[var(--surface-muted)] text-[var(--foreground)] transition cursor-pointer"
            >
              45 минути
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          setStartTime("12:00");
          setEndTime("13:00");
          setReason("Обедна почивка");
          setIsModalOpen(true);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
      >
        <Ban size={16} className="text-rose-500" aria-hidden="true" />
        <span>Блокирай време</span>
      </button>

      <button
        className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 hover:bg-teal-800 px-3 text-sm font-medium text-white transition cursor-pointer"
        title="Нов час"
      >
        <CalendarPlus size={16} aria-hidden="true" />
        <span>Нов час</span>
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div 
            role="dialog" 
            aria-modal="true" 
            aria-labelledby="modal-title" 
            aria-describedby="modal-desc" 
            className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xl transition duration-200 ease-out"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-rose-50 dark:bg-rose-950/30 rounded-md text-rose-500">
                <Ban size={20} aria-hidden="true" />
              </div>
              <div>
                <h3 id="modal-title" className="text-lg font-semibold text-[var(--foreground)]">Блокиране на време</h3>
                <p id="modal-desc" className="text-xs text-[var(--ink-soft)]">AI няма да записва часове в този диапазон</p>
              </div>
            </div>

            <form onSubmit={handleBlockSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="start-time" className="block text-xs font-semibold text-[var(--ink-soft)] uppercase mb-1.5">
                    Начало
                  </label>
                  <input
                    id="start-time"
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-teal-500 focus:outline-none transition"
                  />
                </div>
                <div>
                  <label htmlFor="end-time" className="block text-xs font-semibold text-[var(--ink-soft)] uppercase mb-1.5">
                    Край
                  </label>
                  <input
                    id="end-time"
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-teal-500 focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reason" className="block text-xs font-semibold text-[var(--ink-soft)] uppercase mb-1.5">
                  Причина
                </label>
                <input
                  id="reason"
                  type="text"
                  required
                  placeholder="Обедна почивка"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-teal-500 focus:outline-none transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-md border border-[var(--line)] hover:bg-[var(--surface-muted)] text-[var(--foreground)] transition cursor-pointer"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-md bg-teal-700 hover:bg-teal-800 text-white transition cursor-pointer"
                >
                  Блокирай
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
