-- Run this whole file in Supabase SQL Editor.
-- If Supabase still runs only part of it, run each numbered section separately.

-- 1. Organization
insert into public.organizations (name, slug, industry, timezone, status, owner_name, owner_phone, billing_email, notes)
select 'Demo HVAC Company', 'demo-hvac-company', 'hvac', 'Europe/Sofia', 'active', 'Ivaylo Todorov', null, auth.users.email, 'First AI Receptionist test client.'
from auth.users
where lower(auth.users.email) in (lower('ivaylo.v.todorovv@gmail.com'), lower('ivaylo.v.todorovv@gmail.ocm'), lower('ivaylo.v.todorovv@gmial.com'))
order by case lower(auth.users.email) when lower('ivaylo.v.todorovv@gmail.com') then 1 when lower('ivaylo.v.todorovv@gmail.ocm') then 2 when lower('ivaylo.v.todorovv@gmial.com') then 3 else 99 end
limit 1
on conflict (slug) do update set name = excluded.name, billing_email = excluded.billing_email;

-- 2. Membership
insert into public.organization_members (organization_id, user_id, role)
select organizations.id, auth.users.id, 'owner'
from public.organizations
cross join auth.users
where organizations.slug = 'demo-hvac-company'
and lower(auth.users.email) in (lower('ivaylo.v.todorovv@gmail.com'), lower('ivaylo.v.todorovv@gmail.ocm'), lower('ivaylo.v.todorovv@gmial.com'))
on conflict (organization_id, user_id) do update set role = excluded.role;

-- 3. Assistant
insert into public.assistants (organization_id, vapi_assistant_id, name, default_language, model, voice_provider, first_message, status)
select organizations.id, '3a342308-b8fb-4194-a629-08fd978fdeea', 'LeadSaver Booking Receptionist BG', 'bg', 'gpt-5', 'vapi', 'Zdraveyte, kak moga da pomogna?', 'active'
from public.organizations
where organizations.slug = 'demo-hvac-company'
on conflict (vapi_assistant_id) do update set name = excluded.name;

-- 4. Phone number
insert into public.phone_numbers (organization_id, assistant_id, provider, e164, display_number, sip_uri, vapi_phone_number_id, status)
select organizations.id, assistants.id, 'zadarma', '+35924372749', '+359 2 437 2749', '+35924372749@sip.vapi.ai', '527ec41c-769e-4f2a-95dc-71bbaf4728c3', 'active'
from public.organizations
join public.assistants on assistants.organization_id = organizations.id
where organizations.slug = 'demo-hvac-company'
and assistants.vapi_assistant_id = '3a342308-b8fb-4194-a629-08fd978fdeea'
on conflict (e164) do update set assistant_id = excluded.assistant_id, sip_uri = excluded.sip_uri, vapi_phone_number_id = excluded.vapi_phone_number_id, status = excluded.status;

-- 5. Calendar settings
insert into public.calendar_settings (organization_id, provider, timezone, booking_enabled, slot_minutes, buffer_minutes, min_notice_minutes)
select organizations.id, 'manual', 'Europe/Sofia', false, 60, 15, 120
from public.organizations
where organizations.slug = 'demo-hvac-company'
on conflict (organization_id) do update set timezone = excluded.timezone;

-- 6. Services
insert into public.services (organization_id, name, description, duration_minutes, currency, status)
select organizations.id, service.name, service.description, service.duration_minutes, 'EUR', 'active'
from public.organizations
cross join (values
  ('Remont klimatik', 'Diagnostika i remont na domashni klimatici', 60),
  ('Montazh klimatik', 'Ogled i montazh na stenen klimatik', 120),
  ('Serviz termopompa', 'Diagnostika i serviz na termopompa', 90)
) as service(name, description, duration_minutes)
where organizations.slug = 'demo-hvac-company'
on conflict (organization_id, name) do update set status = excluded.status;

-- 7. Check result
select organizations.id as organization_id, organizations.name, organizations.billing_email, phone_numbers.e164, assistants.vapi_assistant_id
from public.organizations
left join public.phone_numbers on phone_numbers.organization_id = organizations.id
left join public.assistants on assistants.organization_id = organizations.id
where organizations.slug = 'demo-hvac-company';
