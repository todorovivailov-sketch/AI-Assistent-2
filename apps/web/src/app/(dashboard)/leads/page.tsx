import { PageHeader } from "@/components/page-header";
import { getLeadsData } from "@/lib/dashboard/data";

import { LeadsBoard } from "./leads-board";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await getLeadsData();

  return (
    <>
      <PageHeader eyebrow="CRM" title="Запитвания" />
      <LeadsBoard leads={leads} />
    </>
  );
}
