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
- Local verification: lint OK, build OK, npm audit 0 vulnerabilities.

## Building Next

1. Set Vapi Server URL to the current Cloudflare tunnel URL.
2. Make a real phone call and confirm Vapi sends the webhook.
3. Replace demo dashboard data with real Supabase reads.
4. Add appointment booking with Google Calendar.
5. Build per-client setup flow: company, assistant, phone number, calendar, notifications.
6. Deploy the app so Vapi uses a permanent HTTPS URL instead of localtunnel.

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
