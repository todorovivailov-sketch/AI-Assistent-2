-- First client seed without DO blocks.
-- Copy the whole file into Supabase SQL Editor and run it as-is.
-- Do not use Supabase AI rewrite/fix buttons on this SQL.

begin;

create temp table seed_target_user on commit drop as
select
  id as user_id,
  email
from auth.users
where lower(email) in (
  lower('ivaylo.v.todorovv@gmail.com'),
  lower('ivaylo.v.todorovv@gmail.ocm'),
  lower('ivaylo.v.todorovv@gmial.com')
)
order by case lower(email)
  when lower('ivaylo.v.todorovv@gmail.com') then 1
  when lower('ivaylo.v.todorovv@gmail.ocm') then 2
  when lower('ivaylo.v.todorovv@gmial.com') then 3
  else 99
end
limit 1;

create temp table seed_org on commit drop as
with upserted_org as (
  insert into public.organizations (
    name,
    slug,
    industry,
    timezone,
    status,
    owner_name,
    owner_phone,
    billing_email,
    notes
  )
  select
    'Demo HVAC Company',
    'demo-hvac-company',
    'hvac',
    'Europe/Sofia',
    'active',
    'Ivaylo Todorov',
    null,
    seed_target_user.email,
    'First AI Receptionist test client.'
  from seed_target_user
  on conflict (slug) do update set
    name = excluded.name,
    billing_email = excluded.billing_email
  returning id as organization_id
)
select organization_id
from upserted_org;

insert into public.organization_members (
  organization_id,
  user_id,
  role
)
select
  seed_org.organization_id,
  seed_target_user.user_id,
  'owner'
from seed_org
cross join seed_target_user
on conflict (organization_id, user_id) do update set
  role = excluded.role;

create temp table seed_assistant on commit drop as
with upserted_assistant as (
  insert into public.assistants (
    organization_id,
    vapi_assistant_id,
    name,
    default_language,
    model,
    voice_provider,
    first_message,
    status
  )
  select
    seed_org.organization_id,
    '3a342308-b8fb-4194-a629-08fd978fdeea',
    'LeadSaver Booking Receptionist BG',
    'bg',
    'gpt-5',
    'vapi',
    'Zdraveyte, svarzahte se s asistenta na firmata. Kak moga da pomogna?',
    'active'
  from seed_org
  on conflict (vapi_assistant_id) do update set
    name = excluded.name
  returning
    id as assistant_id,
    organization_id
)
select
  assistant_id,
  organization_id
from upserted_assistant;

insert into public.phone_numbers (
  organization_id,
  assistant_id,
  provider,
  e164,
  display_number,
  sip_uri,
  vapi_phone_number_id,
  status
)
select
  seed_assistant.organization_id,
  seed_assistant.assistant_id,
  'zadarma',
  '+35924372749',
  '+359 2 437 2749',
  '+35924372749@sip.vapi.ai',
  '527ec41c-769e-4f2a-95dc-71bbaf4728c3',
  'active'
from seed_assistant
on conflict (e164) do update set
  assistant_id = excluded.assistant_id,
  sip_uri = excluded.sip_uri,
  vapi_phone_number_id = excluded.vapi_phone_number_id,
  status = excluded.status;

insert into public.calendar_settings (
  organization_id,
  provider,
  timezone,
  booking_enabled,
  slot_minutes,
  buffer_minutes,
  min_notice_minutes
)
select
  seed_org.organization_id,
  'manual',
  'Europe/Sofia',
  false,
  60,
  15,
  120
from seed_org
on conflict (organization_id) do update set
  timezone = excluded.timezone;

insert into public.services (
  organization_id,
  name,
  description,
  duration_minutes,
  currency,
  status
)
select
  seed_org.organization_id,
  service.name,
  service.description,
  service.duration_minutes,
  'EUR',
  'active'
from seed_org
cross join (
  values
    ('Remont klimatik', 'Diagnostika i remont na domashni klimatici', 60),
    ('Montazh klimatik', 'Ogled i montazh na stenen klimatik', 120),
    ('Serviz termopompa', 'Diagnostika i serviz na termopompa', 90)
) as service(name, description, duration_minutes)
on conflict (organization_id, name) do update set
  status = excluded.status;

commit;

select
  organizations.id as organization_id,
  organizations.name,
  organizations.billing_email,
  phone_numbers.e164,
  assistants.vapi_assistant_id
from public.organizations
left join public.phone_numbers on phone_numbers.organization_id = organizations.id
left join public.assistants on assistants.organization_id = organizations.id
where organizations.slug = 'demo-hvac-company';
