import { KeyRound, PhoneCall, PlugZap } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

const settings = [
  {
    title: "Zadarma number",
    value: "+35924372749",
    detail: "+35924372749@sip.vapi.ai",
    icon: PhoneCall,
    status: "active",
  },
  {
    title: "Vapi webhook",
    value: "/api/vapi/end-of-call",
    detail: "Bearer token auth",
    icon: PlugZap,
    status: "requested",
  },
  {
    title: "Supabase",
    value: "Postgres + Auth",
    detail: "RLS enabled",
    icon: KeyRound,
    status: "active",
  },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Control" title="Настройки" />
      <section className="grid min-w-0 gap-3 lg:grid-cols-3">
        {settings.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--ink-soft)]">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <StatusBadge value={item.status} />
              </div>
              <div className="mt-4 text-sm font-semibold">{item.title}</div>
              <div className="mt-2 break-words font-mono text-sm">{item.value}</div>
              <div className="mt-2 break-words text-sm text-[var(--ink-soft)]">{item.detail}</div>
            </div>
          );
        })}
      </section>
    </>
  );
}
