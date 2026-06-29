import { PageHeader } from "@/components/page-header";

export default function OrdersPage() {
  return (
    <>
      <PageHeader eyebrow="Optional module" title="Jobs" />
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-sm text-[var(--ink-soft)]">
        Jobs ще стане отделен модул за фирми, които управляват изпълнение след записания час. За generic MVP
        основният поток е разговор - задача - клиент - час.
      </section>
    </>
  );
}
