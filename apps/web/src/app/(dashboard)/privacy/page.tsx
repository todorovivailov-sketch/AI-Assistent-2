import { PageHeader } from "@/components/page-header";
import { getActiveOrganization } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";

import { SubjectPanel } from "./subject-panel";

export default async function PrivacyPage() {
  const org = await getActiveOrganization();
  let actions: Array<{
    id: string;
    action: string;
    subject_phone: string | null;
    affected: Record<string, number> | null;
    created_at: string;
  }> = [];
  if (org) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("gdpr_actions")
      .select("id,action,subject_phone,affected,created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(20);
    actions = (data ?? []) as unknown as typeof actions;
  }

  const LABELS: Record<string, string> = {
    export: "Експорт",
    erasure: "Изтриване",
    retention_anonymize: "Авто-анонимизиране",
  };

  return (
    <>
      <PageHeader eyebrow="GDPR" title="Лични данни" />
      <section className="grid min-w-0 gap-3 lg:grid-cols-2">
        <SubjectPanel />
      </section>
      <section className="mt-6 syn-card min-w-0 p-5">
        <div className="text-sm font-semibold">Дневник на действията</div>
        {actions.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--ink-muted)]">
            Няма записани действия. Появяват се при експорт или изтриване на данни.
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {actions.map((a) => {
              const n = a.affected ? Object.values(a.affected).reduce((x, y) => x + Number(y || 0), 0) : 0;
              return (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] pb-2">
                  <span>
                    <span className="font-medium">{LABELS[a.action] ?? a.action}</span>
                    {a.subject_phone ? <span className="font-mono"> · {a.subject_phone}</span> : null}
                    <span className="text-[var(--ink-soft)]"> · {n} записа</span>
                  </span>
                  <span className="text-[var(--ink-muted)]">
                    {new Date(a.created_at).toLocaleString("bg-BG")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
