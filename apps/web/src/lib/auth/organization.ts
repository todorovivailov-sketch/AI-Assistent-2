import { createClient } from "@/lib/supabase/server";

export type Membership = { organization_id: string; role: string };
export type ActiveOrganization = { id: string; name: string; slug: string; timezone: string };

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, operator: 2, viewer: 3 };

export function pickActiveMembership(memberships: Membership[]): Membership | null {
  if (!memberships?.length) return null;
  return [...memberships].sort(
    (a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9)
  )[0];
}

export async function getActiveOrganization(): Promise<ActiveOrganization | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role");
  const active = pickActiveMembership((memberships as Membership[]) ?? []);
  if (!active) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, timezone")
    .eq("id", active.organization_id)
    .maybeSingle();
  return org ?? null;
}
