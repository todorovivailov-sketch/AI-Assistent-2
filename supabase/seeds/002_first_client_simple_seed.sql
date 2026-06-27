-- Simple first client seed for AI Receptionist.
-- Copy this whole file into Supabase SQL Editor and run it as-is.

do $$
declare
  target_user_id uuid;
  target_user_email text;
  target_org_id uuid;
  target_assistant_id uuid;
begin
  select id, email
  into target_user_id, target_user_email
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

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for Ivaylo email variants.';
  end if;

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
  values (
    'Demo HVAC Company',
    'demo-hvac-company',
    'hvac',
    'Europe/Sofia',
    'active',
    'Ivaylo Todorov',
    null,
    target_user_email,
    'First AI Receptionist test client.'
  )
  on conflict (slug) do update set name = excluded.name
  returning id into target_org_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  )
  values (
    target_org_id,
    target_user_id,
    'owner'
  )
  on conflict (organization_id, user_id) do update set role = excluded.role;

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
  values (
    target_org_id,
    '3a342308-b8fb-4194-a629-08fd978fdeea',
    'LeadSaver Booking Receptionist BG',
    'bg',
    'gpt-5',
    'vapi',
    'Zdraveyte, svarzahte se s asistenta na firmata. Kak moga da pomogna?',
    'active'
  )
  on conflict (vapi_assistant_id) do update set name = excluded.name
  returning id into target_assistant_id;

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
  values (
    target_org_id,
    target_assistant_id,
    'zadarma',
    '+35924372749',
    '+359 2 437 2749',
    '+35924372749@sip.vapi.ai',
    '527ec41c-769e-4f2a-95dc-71bbaf4728c3',
    'active'
  )
  on conflict (e164) do update set assistant_id = excluded.assistant_id;

  insert into public.calendar_settings (
    organization_id,
    provider,
    timezone,
    booking_enabled,
    slot_minutes,
    buffer_minutes,
    min_notice_minutes
  )
  values (
    target_org_id,
    'manual',
    'Europe/Sofia',
    false,
    60,
    0,
    120
  )
  on conflict (organization_id) do update set timezone = excluded.timezone;

  insert into public.services (
    organization_id,
    name,
    description,
    duration_minutes,
    currency,
    status
  )
  values
    (target_org_id, 'Remont klimatik', 'Diagnostika i remont na domashni klimatici', 60, 'EUR', 'active'),
    (target_org_id, 'Montazh klimatik', 'Ogled i montazh na stenen klimatik', 120, 'EUR', 'active'),
    (target_org_id, 'Serviz termopompa', 'Diagnostika i serviz na termopompa', 90, 'EUR', 'active')
  on conflict (organization_id, name) do update set status = excluded.status;
end $$;
