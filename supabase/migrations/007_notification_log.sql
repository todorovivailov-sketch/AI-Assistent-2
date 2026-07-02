-- Idempotency + history for outbound notifications (Phase 6 reminders).
-- Written only by the cron via the service role; readable by org members.
begin;

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  kind text not null check (kind in ('appointment_reminder', 'owner_daily_agenda')),
  appointment_id uuid references public.appointments(id) on delete set null,
  dedupe_key text not null,
  destination text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);

create index notification_log_org_created_at_idx
  on public.notification_log (organization_id, created_at desc);

alter table public.notification_log enable row level security;

create policy "members can read notification log"
  on public.notification_log for select to authenticated
  using (public.is_org_member(organization_id));

grant select on public.notification_log to authenticated;

commit;
