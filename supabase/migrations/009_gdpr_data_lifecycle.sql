begin;

-- Tier A anonymization marker on calls
alter table public.calls
  add column if not exists anonymized_at timestamptz;

-- Per-org Tier A retention window (days)
alter table public.organizations
  add column if not exists recording_retention_days integer not null default 90
    check (recording_retention_days between 1 and 3650);

-- Compliance audit trail
create table if not exists public.gdpr_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('export', 'erasure', 'retention_anonymize')),
  subject_phone text,
  performed_by uuid references auth.users(id) on delete set null,
  affected jsonb not null default '{}'::jsonb,
  vapi_deleted integer not null default 0,
  vapi_errors integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gdpr_actions_org_created_at_idx
  on public.gdpr_actions (organization_id, created_at desc);

alter table public.gdpr_actions enable row level security;

drop policy if exists "members can read gdpr actions" on public.gdpr_actions;
create policy "members can read gdpr actions"
on public.gdpr_actions for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "admins can insert gdpr actions" on public.gdpr_actions;
create policy "admins can insert gdpr actions"
on public.gdpr_actions for insert to authenticated
with check (public.is_org_admin(organization_id));

grant select, insert on public.gdpr_actions to authenticated;

commit;
