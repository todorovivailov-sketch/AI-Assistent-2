-- Link an appointment to the call that booked it, so the calendar drawer can show the real
-- transcript + recording. Populated at booking time (calendar-tools) from message.call.id, which
-- equals calls.vapi_call_id. Nullable: manually-created appointments have no call.
alter table public.appointments add column if not exists vapi_call_id text;
create index if not exists appointments_vapi_call_id_idx on public.appointments (vapi_call_id);
