"use client";

import {
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  Inbox,
  LayoutDashboard,
  PhoneCall,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";

const navItems = [
  { href: "/", label: "Работно табло", icon: LayoutDashboard },
  { href: "/inbox", label: "Задачи", icon: Inbox },
  { href: "/appointments", label: "Календар", icon: CalendarDays },
  { href: "/customers", label: "Клиенти", icon: Users },
  { href: "/conversations", label: "Разговори", icon: PhoneCall },
  { href: "/assistant", label: "Асистент", icon: Bot },
  { href: "/reports", label: "Отчети", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeCall, setActiveCall] = useState<{ id: string; phone: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveCall({ id: "call-live-101", phone: "+359 88 923 3722" });
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--line)] bg-[var(--surface)] lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-[var(--line)] px-5">
          <span className="flex size-9 items-center justify-center rounded-md bg-teal-700 text-white">
            <Zap size={18} aria-hidden="true" />
          </span>
          <div>
            <div className="text-sm font-semibold">AI Receptionist</div>
            <div className="font-mono text-xs text-[var(--ink-soft)]">Booking assistant</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--surface-muted)] text-[var(--foreground)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--background)_88%,transparent)] px-4 backdrop-blur md:px-7">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">AI Receptionist</div>
              <div className="truncate font-mono text-xs text-[var(--ink-soft)]">+35924372749</div>
            </div>

            {activeCall && (
              <div className="flex items-center gap-3 rounded-full border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 px-3.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 shadow-sm backdrop-blur-sm animate-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
                </span>
                <span className="font-medium whitespace-nowrap">
                  Активно обаждане: <span className="font-bold">{activeCall.phone}</span>
                </span>
                <button
                  onClick={() => {
                    alert(`Поемане на обаждането с ${activeCall.phone}... Разговорът се прехвърля към вашия телефон.`);
                    setActiveCall(null);
                  }}
                  className="rounded-full bg-gradient-to-r from-rose-600 to-red-500 px-3 py-1 font-semibold text-white shadow-sm hover:from-rose-700 hover:to-red-600 active:scale-95 transition cursor-pointer"
                >
                  Поеми разговора
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="hidden h-8 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--ink-soft)] sm:inline-flex">
                AI свързан
              </span>
              <Link
                href="/settings"
                className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:text-[var(--foreground)]"
                title="Настройки"
              >
                <Settings size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 pb-20 md:px-7 md:py-7 lg:pb-7">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--line)] bg-[var(--surface)] lg:hidden">
          {navItems.slice(0, 5).map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                  active ? "text-teal-700 dark:text-teal-300" : "text-[var(--ink-soft)]"
                }`}
              >
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
