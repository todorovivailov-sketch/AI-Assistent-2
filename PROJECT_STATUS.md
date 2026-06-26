# Project Status

## Done

- Business direction chosen: AI receptionist / booking agent for local service companies.
- First niche chosen: HVAC, air conditioners, and heat pumps.
- Zadarma number connected: `+35924372749`.
- Vapi assistant created and assigned.
- Final working SIP forwarding format confirmed: `+35924372749@sip.vapi.ai`.
- Project folder cleaned into app, Supabase, docs, scripts, and archive areas.
- Supabase schema installed successfully.
- First organization, assistant, phone number, and owner membership seeded.
- Next.js dashboard scaffolded in `apps/web`.
- Vapi webhook route created at `/api/vapi/end-of-call`.
- `apps/web/.env.local` configured with Supabase keys.
- Local webhook health check returns `supabaseConfigured: true`.
- Test `end-of-call-report` POST writes a call row to Supabase.
- After env setup rerun, Next.js was restarted and public Cloudflare POST was verified again.
- First real inbound Vapi call was received and stored in Supabase:
  caller `+359892337322`, duration `114` seconds, lead created.
- Vapi payload fallback parsing added for transcript-based summary and lead data.
- Vapi payload fallback parsing now extracts city and district from transcript when structured data is missing.
- First real lead backfilled with `София, Красно село`.
- Improved Bulgarian HVAC Vapi prompt and structured data schema saved in `docs/03-setup/vapi-hvac-assistant-prompt-bg.md`.
- `webhook_events` logging fixed by replacing partial-index upsert with duplicate-tolerant insert.
- Dashboard `/`, `/calls`, and `/leads` now read live Supabase data instead of demo data.
- Browser verification confirmed the real call/lead appears in the app.
- 2026-06-26: Missing later test calls were caused by the temporary Cloudflare tunnel going offline.
  The old URL `https://disposal-absent-sullivan-fought.trycloudflare.com/api/vapi/end-of-call`
  no longer resolves and no later Vapi webhook rows reached Supabase.
- Current Cloudflare tunnel Vapi Server URL copied to clipboard:
  `https://relay-transit-zone-commented.trycloudflare.com/api/vapi/end-of-call`
- GitHub repository connected and pushed:
  `https://github.com/todorovivailov-sketch/AI-Assistent-2`
- Vercel production deployment is live:
  `https://ai-assistent-2-delta.vercel.app`
- Permanent Vapi Server URL copied to clipboard:
  `https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call`
- Vercel production env configured with Supabase keys and temporary
  `VAPI_WEBHOOK_ALLOW_UNAUTHENTICATED=true`.
- App calendar MVP added:
  `/appointments` now reads live Supabase `appointments` and shows a weekly calendar
  with time slots, appointment cards, week navigation, and an upcoming list.
- Vapi calendar tools added:
  `check_availability` reads Supabase appointments and returns free slots.
  `book_appointment` creates confirmed Supabase appointments.
- Google Calendar sync layer added behind env flags:
  availability can include Google Calendar busy events, bookings can create Google Calendar events,
  and `/api/calendar/google/sync` can import Google events into Supabase.
- Google Calendar setup instructions saved in `docs/03-setup/google-calendar-sync-bg.md`.
- Vercel Cron config added in `apps/web/vercel.json` for daily Google Calendar sync.
- Calendar sync endpoint now accepts Vercel's standard `CRON_SECRET` authorization header.
- Vercel production env now includes Google Calendar service account credentials,
  `GOOGLE_CALENDAR_SYNC_ENABLED=true`, `CRON_SECRET`, and `CALENDAR_SYNC_SECRET`.
- Production redeployed with the cron config; Vercel reports `/api/calendar/google/sync`
  cron enabled and a manual cron trigger succeeded.
- Google Calendar `todorov.ivailo.v@gmail.com` was shared with
  `ai-receptionist-calendar@ai-assistent-2-500610.iam.gserviceaccount.com`.
- Vercel production env now includes `GOOGLE_CALENDAR_DEFAULT_ID=todorov.ivailo.v@gmail.com`.
- Supabase `calendar_settings` for `demo-hvac-company` now uses provider `google`,
  booking enabled, calendar id `todorov.ivailo.v@gmail.com`, and `Europe/Sofia`.
- Production Google Calendar sync verified successfully:
  `/api/calendar/google/sync?organization=demo-hvac-company` returned `ok: true`
  for calendar `todorov.ivailo.v@gmail.com` with `0` imported, `0` updated, `0` skipped.
- Generic Bulgarian booking receptionist prompt created in
  `docs/03-setup/generic-booking-receptionist-prompt-bg.md`.
- Local verification: lint OK, build OK, npm audit 0 vulnerabilities.

## Building Next

1. Configure the two Vapi tools in the Vapi assistant UI.
2. Run the Supabase Google event id index migration if it has not been applied.
3. Test a real phone booking from Vapi into the app calendar and Google Calendar.
4. Build per-client setup flow: company, assistant, phone number, calendar, notifications.

## Product Model

- One backend and one dashboard for all clients.
- Separate phone number per client.
- Separate Vapi assistant per client, cloned from a base template.
- Shared database tables with `organization_id` on all client-owned data.

## MVP Dashboard Pages

- Overview
- Calls
- Leads
- Appointments
- Orders
- Settings
- Integrations
