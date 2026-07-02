begin;

-- 1) allow the new notification kind (008 set a 3-value check; recreate to add the 4th)
alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('appointment_reminder', 'owner_daily_agenda', 'missed_call_recovery', 'appointment_confirmation'));

-- 2) per-business control (default OFF; opt-in)
alter table public.organizations
  add column if not exists appointment_confirmation_sms_enabled boolean not null default false,
  add column if not exists appointment_confirmation_sms_template text;

commit;
