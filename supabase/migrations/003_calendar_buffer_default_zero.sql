alter table public.calendar_settings
alter column buffer_minutes set default 0;

update public.calendar_settings
set buffer_minutes = 0
where organization_id in (
  select id
  from public.organizations
  where slug = 'demo-hvac-company'
);
