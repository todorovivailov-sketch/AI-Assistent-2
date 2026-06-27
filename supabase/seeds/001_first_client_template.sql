-- First client seed.
-- Copy the whole file into Supabase SQL Editor and run it as-is.
-- It searches for these possible Auth emails, in this order:
-- 1. ivaylo.v.todorovv@gmail.com
-- 2. ivaylo.v.todorovv@gmail.ocm
-- 3. ivaylo.v.todorovv@gmial.com

do $$
begin
  if not exists (
    select 1
    from auth.users
    where lower(email) in (
      lower('ivaylo.v.todorovv@gmail.com'),
      lower('ivaylo.v.todorovv@gmail.ocm'),
      lower('ivaylo.v.todorovv@gmial.com')
    )
  ) then
    raise exception 'No Supabase Auth user found for Ivaylo email variants.';
  end if;
end $$;

begin;

with target_user as (
  select id, email
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
  limit 1
),
created_org as (
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
    target_user.email,
    'First AI Receptionist test client.'
  from target_user
  on conflict (slug) do update set
    name = excluded.name,
    industry = excluded.industry,
    timezone = excluded.timezone,
    status = excluded.status,
    owner_name = excluded.owner_name,
    owner_phone = excluded.owner_phone,
    billing_email = excluded.billing_email,
    notes = excluded.notes
  returning id
),
created_assistant as (
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
    id,
    '3a342308-b8fb-4194-a629-08fd978fdeea',
    'LeadSaver Booking Receptionist BG',
    'bg',
    'gpt-5',
    'vapi',
    'Zdraveyte, svarzahte se s asistenta na firmata. Kak moga da pomogna?',
    'active'
  from created_org
  on conflict (vapi_assistant_id) do update set
    name = excluded.name,
    default_language = excluded.default_language,
    model = excluded.model,
    voice_provider = excluded.voice_provider,
    first_message = excluded.first_message,
    status = excluded.status
  returning id, organization_id
),
created_phone_number as (
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
    organization_id,
    id,
    'zadarma',
    '+35924372749',
    '+359 2 437 2749',
    '+35924372749@sip.vapi.ai',
    '527ec41c-769e-4f2a-95dc-71bbaf4728c3',
    'active'
  from created_assistant
  on conflict (e164) do update set
    assistant_id = excluded.assistant_id,
    sip_uri = excluded.sip_uri,
    vapi_phone_number_id = excluded.vapi_phone_number_id,
    status = excluded.status
  returning organization_id
),
created_calendar_settings as (
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
    organization_id,
    'manual',
    'Europe/Sofia',
    false,
    60,
    0,
    120
  from created_phone_number
  on conflict (organization_id) do update set
    provider = excluded.provider,
    timezone = excluded.timezone,
    booking_enabled = excluded.booking_enabled,
    slot_minutes = excluded.slot_minutes,
    buffer_minutes = excluded.buffer_minutes,
    min_notice_minutes = excluded.min_notice_minutes
  returning organization_id
),
created_membership as (
  insert into public.organization_members (
    organization_id,
    user_id,
    role
  )
  select
    organization_id,
    target_user.id,
    'owner'
  from created_calendar_settings
  cross join target_user
  on conflict (organization_id, user_id) do update set
    role = excluded.role
  returning organization_id
)
insert into public.services (organization_id, name, description, duration_minutes, currency, status)
select organization_id, service.name, service.description, service.duration_minutes, 'EUR', 'active'
from created_membership
cross join (
  values
    ('Remont klimatik', 'Diagnostika i remont na domashni klimatici', 60),
    ('Montazh klimatik', 'Ogled i montazh na stenen klimatik', 120),
    ('Serviz termopompa', 'Diagnostika i serviz na termopompa', 90)
) as service(name, description, duration_minutes)
on conflict (organization_id, name) do update set
  description = excluded.description,
  duration_minutes = excluded.duration_minutes,
  status = excluded.status;

commit;
