begin;

create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  industry text not null default 'services',
  timezone text not null default 'Europe/Sofia',
  status text not null default 'active' check (status in ('active', 'paused', 'trial', 'cancelled')),
  owner_name text,
  owner_phone text,
  billing_email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.assistants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vapi_assistant_id text not null unique,
  name text not null,
  default_language text not null default 'bg',
  model text,
  voice_provider text,
  voice_id text,
  first_message text,
  system_prompt text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid references public.assistants(id) on delete set null,
  provider text not null default 'zadarma' check (provider in ('zadarma', 'twilio', 'vapi', 'other')),
  e164 text not null unique check (e164 ~ '^\+[1-9][0-9]{7,14}$'),
  display_number text,
  sip_uri text,
  vapi_phone_number_id text unique,
  status text not null default 'active' check (status in ('active', 'pending', 'paused', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('vapi', 'zadarma', 'google_calendar', 'resend', 'other')),
  status text not null default 'active' check (status in ('active', 'pending', 'error', 'disabled')),
  external_account_id text,
  config jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google', 'manual')),
  calendar_id text,
  timezone text not null default 'Europe/Sofia',
  booking_enabled boolean not null default false,
  slot_minutes integer not null default 30 check (slot_minutes between 5 and 240),
  buffer_minutes integer not null default 15 check (buffer_minutes between 0 and 240),
  min_notice_minutes integer not null default 120 check (min_notice_minutes between 0 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, weekday),
  check (is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at))
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 1440),
  price_min numeric(12,2),
  price_max numeric(12,2),
  currency text not null default 'EUR',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  check (price_min is null or price_min >= 0),
  check (price_max is null or price_max >= 0),
  check (price_min is null or price_max is null or price_min <= price_max)
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  city text not null,
  region text,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, city)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_number_id uuid references public.phone_numbers(id) on delete set null,
  assistant_id uuid references public.assistants(id) on delete set null,
  vapi_call_id text not null unique,
  caller_number text,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  status text not null default 'completed' check (status in ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'missed', 'no_answer')),
  disposition text check (disposition in ('lead', 'appointment', 'support', 'spam', 'wrong_number', 'unknown')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  cost_amount numeric(12,4),
  cost_currency text not null default 'USD',
  recording_url text,
  transcript text,
  summary text,
  structured_data jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'qualified', 'booked', 'quoted', 'won', 'lost', 'spam')),
  name text,
  phone text,
  email text,
  city text,
  address text,
  service_type text,
  urgency text check (urgency in ('low', 'normal', 'high', 'emergency')),
  source text not null default 'phone',
  preferred_time_text text,
  ai_summary text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Europe/Sofia',
  location text,
  customer_name text,
  customer_phone text,
  service_type text,
  notes text,
  google_calendar_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'quoted', 'approved', 'in_progress', 'completed', 'cancelled', 'lost')),
  title text not null,
  description text,
  amount numeric(12,2),
  currency text not null default 'EUR',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount is null or amount >= 0)
);

create table public.owner_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'telegram', 'webhook')),
  destination text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  provider text not null check (provider in ('vapi', 'zadarma', 'google_calendar', 'resend', 'other')),
  event_type text not null,
  external_event_id text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create unique index webhook_events_provider_external_id_unique
  on public.webhook_events (provider, external_event_id)
  where external_event_id is not null;

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_organization_id_idx on public.organization_members (organization_id);
create index assistants_organization_id_idx on public.assistants (organization_id);
create index phone_numbers_organization_id_idx on public.phone_numbers (organization_id);
create index integrations_organization_id_provider_idx on public.integrations (organization_id, provider);
create index business_hours_organization_id_idx on public.business_hours (organization_id);
create index services_organization_id_status_idx on public.services (organization_id, status);
create index service_areas_organization_id_status_idx on public.service_areas (organization_id, status);
create index calls_organization_started_at_idx on public.calls (organization_id, started_at desc);
create index calls_phone_number_id_idx on public.calls (phone_number_id);
create index calls_assistant_id_idx on public.calls (assistant_id);
create index calls_caller_number_idx on public.calls (caller_number);
create index leads_organization_status_idx on public.leads (organization_id, status);
create index leads_organization_created_at_idx on public.leads (organization_id, created_at desc);
create index leads_phone_idx on public.leads (phone);
create index leads_call_id_idx on public.leads (call_id);
create index appointments_organization_starts_at_idx on public.appointments (organization_id, starts_at);
create index appointments_organization_status_idx on public.appointments (organization_id, status);
create index orders_organization_status_idx on public.orders (organization_id, status);
create index owner_notifications_organization_id_idx on public.owner_notifications (organization_id);
create index webhook_events_organization_received_at_idx on public.webhook_events (organization_id, received_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at before update on public.organization_members
for each row execute function public.set_updated_at();

create trigger assistants_set_updated_at before update on public.assistants
for each row execute function public.set_updated_at();

create trigger phone_numbers_set_updated_at before update on public.phone_numbers
for each row execute function public.set_updated_at();

create trigger integrations_set_updated_at before update on public.integrations
for each row execute function public.set_updated_at();

create trigger calendar_settings_set_updated_at before update on public.calendar_settings
for each row execute function public.set_updated_at();

create trigger business_hours_set_updated_at before update on public.business_hours
for each row execute function public.set_updated_at();

create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();

create trigger service_areas_set_updated_at before update on public.service_areas
for each row execute function public.set_updated_at();

create trigger calls_set_updated_at before update on public.calls
for each row execute function public.set_updated_at();

create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.assistants enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.integrations enable row level security;
alter table public.calendar_settings enable row level security;
alter table public.business_hours enable row level security;
alter table public.services enable row level security;
alter table public.service_areas enable row level security;
alter table public.calls enable row level security;
alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.orders enable row level security;
alter table public.owner_notifications enable row level security;
alter table public.webhook_events enable row level security;

create policy "members can read organizations"
on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy "admins can update organizations"
on public.organizations for update to authenticated
using (public.is_org_admin(id))
with check (public.is_org_admin(id));

create policy "users can read own memberships"
on public.organization_members for select to authenticated
using (user_id = (select auth.uid()));

create policy "members can read assistants"
on public.assistants for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins can insert assistants"
on public.assistants for insert to authenticated
with check (public.is_org_admin(organization_id));

create policy "admins can update assistants"
on public.assistants for update to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "admins can delete assistants"
on public.assistants for delete to authenticated
using (public.is_org_admin(organization_id));

create policy "members can read phone numbers"
on public.phone_numbers for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins can manage phone numbers"
on public.phone_numbers for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "members can read integrations"
on public.integrations for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins can manage integrations"
on public.integrations for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "members can read calendar settings"
on public.calendar_settings for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins can manage calendar settings"
on public.calendar_settings for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "members can read business hours"
on public.business_hours for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins can manage business hours"
on public.business_hours for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "members can read services"
on public.services for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins can manage services"
on public.services for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "members can read service areas"
on public.service_areas for select to authenticated
using (public.is_org_member(organization_id));

create policy "admins can manage service areas"
on public.service_areas for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "members can read calls"
on public.calls for select to authenticated
using (public.is_org_member(organization_id));

create policy "members can read leads"
on public.leads for select to authenticated
using (public.is_org_member(organization_id));

create policy "members can insert leads"
on public.leads for insert to authenticated
with check (public.is_org_member(organization_id));

create policy "members can update leads"
on public.leads for update to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy "members can read appointments"
on public.appointments for select to authenticated
using (public.is_org_member(organization_id));

create policy "members can insert appointments"
on public.appointments for insert to authenticated
with check (public.is_org_member(organization_id));

create policy "members can update appointments"
on public.appointments for update to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy "members can read orders"
on public.orders for select to authenticated
using (public.is_org_member(organization_id));

create policy "members can insert orders"
on public.orders for insert to authenticated
with check (public.is_org_member(organization_id));

create policy "members can update orders"
on public.orders for update to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy "members can read owner notifications"
on public.owner_notifications for select to authenticated
using (public.is_org_member(organization_id));

create policy "members can read webhook events"
on public.webhook_events for select to authenticated
using (organization_id is not null and public.is_org_member(organization_id));

grant usage on schema public to authenticated;

grant select on
  public.organizations,
  public.organization_members,
  public.assistants,
  public.phone_numbers,
  public.integrations,
  public.calendar_settings,
  public.business_hours,
  public.services,
  public.service_areas,
  public.calls,
  public.leads,
  public.appointments,
  public.orders,
  public.owner_notifications,
  public.webhook_events
to authenticated;

grant insert, update on public.leads, public.appointments, public.orders to authenticated;
grant insert, update, delete on
  public.assistants,
  public.phone_numbers,
  public.integrations,
  public.calendar_settings,
  public.business_hours,
  public.services,
  public.service_areas
to authenticated;
grant update on public.organizations to authenticated;

commit;

