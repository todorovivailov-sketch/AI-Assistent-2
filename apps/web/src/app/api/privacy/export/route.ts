import { NextResponse } from "next/server";

import { getActiveOrganization } from "@/lib/auth/organization";
import { gatherSubject } from "@/lib/gdpr/engine";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const org = await getActiveOrganization();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 401 });

  const supabase = await createClient();
  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .maybeSingle();
  const role = (membershipRow as { role: string } | null)?.role;
  if (!role || !["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  const phone = new URL(request.url).searchParams.get("phone") ?? "";
  const data = await gatherSubject(supabase, org.id, phone);
  if (!data) return NextResponse.json({ error: "bad_phone" }, { status: 400 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("gdpr_actions").insert({
    organization_id: org.id,
    action: "export",
    subject_phone: data.phone,
    performed_by: user?.id ?? null,
    affected: {
      calls: data.calls.length,
      leads: data.leads.length,
      appointments: data.appointments.length,
      notifications: data.notifications.length,
    },
  });

  const filename = `subject-${data.phone.replace(/[^0-9]/g, "")}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
