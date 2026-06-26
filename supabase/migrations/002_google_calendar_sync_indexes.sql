create unique index if not exists appointments_organization_google_event_uidx
on public.appointments (organization_id, google_calendar_event_id)
where google_calendar_event_id is not null;
