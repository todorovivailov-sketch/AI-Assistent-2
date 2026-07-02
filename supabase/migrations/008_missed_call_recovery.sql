begin;

-- 1) allow the new notification kind (007 created an inline column check
--    named notification_log_kind_check; drop + recreate to add the value)
alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('appointment_reminder', 'owner_daily_agenda', 'missed_call_recovery'));

-- 2) per-business control (default OFF; opt-in)
alter table public.organizations
  add column if not exists missed_call_sms_enabled boolean not null default false,
  add column if not exists missed_call_sms_template text;

-- 3) store Vapi endedReason for classification + audit
alter table public.calls
  add column if not exists ended_reason text;

commit;
