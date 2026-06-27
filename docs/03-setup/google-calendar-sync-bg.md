# Google Calendar Sync Setup

Goal: the assistant checks both calendars before offering a time, books into the app calendar, and creates the same event in Google Calendar.

## How It Works

1. Supabase `appointments` stays the main app calendar.
2. Vapi calls `check_availability`.
3. The app reads busy slots from:
   - Supabase `appointments`
   - Google Calendar events, when Google sync is enabled
4. Vapi calls `book_appointment`.
5. The app writes the appointment to Supabase first.
6. If Google is configured, the app creates the same event in Google Calendar and stores `google_calendar_event_id`.
7. The sync endpoint can import manually created Google events back into Supabase.

## Google Cloud Setup

Create a Google Cloud project, enable Google Calendar API, then create a Service Account key.

Important: for normal Gmail/Google Calendar accounts, share the target calendar with the Service Account email and give it permission to make changes to events.

The Service Account email looks like:

```text
ai-receptionist-calendar@project-id.iam.gserviceaccount.com
```

Do not use `primary` as the calendar id for a shared personal calendar. Use the real calendar id from Google Calendar settings.

## Vercel Environment Variables

Add these in Vercel Project Settings -> Environment Variables:

```text
GOOGLE_CALENDAR_SYNC_ENABLED=true
GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL=service-account-email-from-google
GOOGLE_CALENDAR_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_CALENDAR_DEFAULT_ID=calendar-id-from-google
CALENDAR_SYNC_SECRET=random-long-secret
CRON_SECRET=random-long-secret
```

The private key must keep line breaks as `\n` when entered as one line.

Use the same random value for `CALENDAR_SYNC_SECRET` and `CRON_SECRET`, or set only
`CRON_SECRET` if the sync endpoint will be called only by Vercel Cron.

## Supabase Calendar Settings

For the demo organization:

```sql
update public.calendar_settings
set
  provider = 'google',
  booking_enabled = true,
  calendar_id = 'YOUR_GOOGLE_CALENDAR_ID',
  timezone = 'Europe/Sofia',
  slot_minutes = 60,
  buffer_minutes = 0,
  min_notice_minutes = 120
where organization_id = (
  select id from public.organizations where slug = 'demo-hvac-company'
);
```

Also run the sync index migration if it has not been applied yet:

```sql
create unique index if not exists appointments_organization_google_event_uidx
on public.appointments (organization_id, google_calendar_event_id)
where google_calendar_event_id is not null;
```

## Manual Google To App Sync

After setting `CALENDAR_SYNC_SECRET`, call:

```bash
curl -X POST "https://ai-assistent-2-delta.vercel.app/api/calendar/google/sync?organization=demo-hvac-company" \
  -H "Authorization: Bearer YOUR_CALENDAR_SYNC_SECRET"
```

This imports future Google Calendar events into Supabase `appointments`, so they show in the app calendar.

## Vercel Cron

The repo includes `apps/web/vercel.json` with a daily sync:

```json
{
  "crons": [
    {
      "path": "/api/calendar/google/sync",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Vercel sends the `CRON_SECRET` value as the `Authorization: Bearer ...` header.
Deploy after adding the env vars so the cron can run in production.

## Vapi Tools

No new Vapi tool is needed. Keep using:

- `check_availability`
- `book_appointment`

Server URL:

```text
https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call
```

The same tools will start checking and writing Google Calendar once the environment variables and Supabase `calendar_id` are configured.
