"use client";

import {
  Bell,
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LogOut,
  PhoneCall,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { signOut } from "@/app/login/actions";

const navItems = [
  { href: "/", label: "Работно табло", icon: LayoutDashboard },
  { href: "/inbox", label: "Задачи", icon: Inbox },
  { href: "/appointments", label: "Календар", icon: CalendarDays },
  { href: "/customers", label: "Клиенти", icon: Users },
  { href: "/leads", label: "Запитвания", icon: ClipboardList },
  { href: "/conversations", label: "Разговори", icon: PhoneCall },
  { href: "/assistant", label: "Асистент", icon: Bot },
  { href: "/reports", label: "Отчети", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Настройки", icon: Settings },
  { href: "/privacy", label: "Лични данни", icon: ShieldCheck },
];

export function AppShell({ children, userEmail }: { children: ReactNode; userEmail: string | null }) {
  const pathname = usePathname();
  const [activeCall, setActiveCall] = useState<{ id: string; phone: string } | null>(null);
  const activeNav = navItems.find((item) => isActivePath(pathname, item.href));
  const ActiveIcon = activeNav?.icon;

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveCall({ id: "call-live-101", phone: "+359 88 923 3722" });
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <aside className="fixed inset-y-0 left-0 hidden w-[252px] flex-col border-r border-[var(--line)] bg-[var(--surface)] lg:flex">
        <div className="flex items-center gap-3 px-5 pb-5 pt-[22px]">
          <span className="flex size-[38px] items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-accent-sm)]">
            <Zap size={19} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">AI Receptionist</div>
            <div className="truncate font-mono text-[11px] font-medium text-[var(--ink-muted)]">booking assistant</div>
          </div>
        </div>

        <div className="px-[22px] pb-2 pt-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
          Работа
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition ${
                  active
                    ? "bg-[var(--surface-soft)] text-[var(--accent-strong)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <span
                  className={`absolute -left-3 top-2.5 bottom-2.5 w-[3px] rounded-r bg-[var(--accent)] transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon size={17} strokeWidth={2} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-3">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--background)] p-3">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[var(--foreground)] text-xs font-semibold text-[var(--surface)]">
              AI
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-semibold">{userEmail ?? "AI Receptionist"}</div>
              <div className="truncate font-mono text-[10.5px] text-[var(--ink-muted)]">+359 2 437 2749</div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                title="Изход"
                aria-label="Изход"
                className="flex size-8 items-center justify-center rounded-lg text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--background)_86%,transparent)] px-4 backdrop-blur-xl md:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              {ActiveIcon ? (
                <ActiveIcon size={16} className="shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
              ) : null}
              <span className="truncate text-[13.5px] font-medium text-[var(--ink-soft)]">
                {activeNav?.label ?? "AI Receptionist"}
              </span>
            </div>

            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              {activeCall ? (
                <div className="hidden items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shadow-sm xl:flex">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-red-600" />
                  </span>
                  <span className="whitespace-nowrap">
                    Активно обаждане · <span className="font-mono font-semibold">{activeCall.phone}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveCall(null)}
                    className="ml-1 h-7 rounded-full bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-700"
                  >
                    Поеми
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="hidden size-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] md:inline-flex"
                aria-label="Търсене"
              >
                <Search size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="relative hidden size-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] md:inline-flex"
                aria-label="Известия"
              >
                <Bell size={17} aria-hidden="true" />
                <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-[var(--accent)]" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 pb-20 md:px-8 md:py-7 lg:pb-8">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--line)] bg-[var(--surface)] lg:hidden">
          {navItems.slice(0, 5).map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                  active ? "text-[var(--accent-strong)]" : "text-[var(--ink-soft)]"
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

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
