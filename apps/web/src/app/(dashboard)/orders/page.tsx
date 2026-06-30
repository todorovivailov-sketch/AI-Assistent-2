import { BriefcaseBusiness } from "lucide-react";

import { PageHeader } from "@/components/page-header";

export default function OrdersPage() {
  return (
    <>
      <PageHeader eyebrow="Optional module" title="Jobs" />
      <section className="syn-card flex items-start gap-4 px-5 py-6 text-sm text-[var(--ink-soft)]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface-soft)] text-[var(--accent-strong)]">
          <BriefcaseBusiness size={18} />
        </span>
        <div className="max-w-3xl leading-relaxed">
          Jobs ще стане отделен модул за фирми, които управляват изпълнение след записания час. За generic MVP
          основният поток остава разговор, задача, клиент и час.
        </div>
      </section>
    </>
  );
}
