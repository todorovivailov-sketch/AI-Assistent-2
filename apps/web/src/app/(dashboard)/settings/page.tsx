import { KeyRound, PhoneCall, PlugZap } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MISSED_CALL_TEMPLATE } from "@/lib/notifications/missed-call";
import { DEFAULT_CONFIRMATION_TEMPLATE } from "@/lib/notifications/appointment-confirmation";

import { MissedCallForm } from "./missed-call-form";
import { ConfirmationForm } from "./confirmation-form";
import { RetentionForm } from "./retention-form";

const settings = [
  {
    title: "Телефонен номер",
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

export default async function SettingsPage() {
  const org = await getActiveOrganization();
  let missedEnabled = false;
  let missedTemplate = "";
  let confirmEnabled = false;
  let confirmTemplate = "";
  let retentionDays = 90;
  if (org) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select(
        "missed_call_sms_enabled, missed_call_sms_template, appointment_confirmation_sms_enabled, appointment_confirmation_sms_template, recording_retention_days"
      )
      .eq("id", org.id)
      .maybeSingle();
    missedEnabled = data?.missed_call_sms_enabled ?? false;
    missedTemplate = data?.missed_call_sms_template ?? "";
    confirmEnabled = data?.appointment_confirmation_sms_enabled ?? false;
    confirmTemplate = data?.appointment_confirmation_sms_template ?? "";
    retentionDays = data?.recording_retention_days ?? 90;
  }

  return (
    <>
      <PageHeader eyebrow="Control" title="Настройки" />
      <section className="grid min-w-0 gap-3 lg:grid-cols-3">
        {settings.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="syn-card syn-card-lift min-w-0 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-md bg-[var(--surface-soft)] text-[var(--accent-strong)]">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <StatusBadge value={item.status} />
              </div>
              <div className="mt-5 text-sm font-semibold">{item.title}</div>
              <div className="mt-2 break-words font-mono text-sm">{item.value}</div>
              <div className="mt-2 break-words text-sm text-[var(--ink-soft)]">{item.detail}</div>
            </div>
          );
        })}
      </section>
      <section className="mt-6 grid min-w-0 gap-3 lg:grid-cols-2">
        <MissedCallForm
          enabled={missedEnabled}
          template={missedTemplate}
          placeholder={DEFAULT_MISSED_CALL_TEMPLATE}
        />
        <ConfirmationForm
          enabled={confirmEnabled}
          template={confirmTemplate}
          placeholder={DEFAULT_CONFIRMATION_TEMPLATE}
        />
        <RetentionForm days={retentionDays} />
      </section>
    </>
  );
}
