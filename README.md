# AI Receptionist

AI Receptionist is a multi-client voice receptionist product for local service businesses.
The first working setup is a Bulgarian HVAC receptionist connected through Vapi and Zadarma.

## Current Status

- Zadarma Sofia number is active: `+35924372749`
- Vapi assistant is created: `LeadSaver HVAC Receptionist BG`
- Working Zadarma external SIP URI: `+35924372749@sip.vapi.ai`
- Supabase schema is installed.
- First client seed is installed.
- Web app skeleton is built in `apps/web`.
- Webhook env is configured in `apps/web/.env.local`.
- Local webhook test writes calls to Supabase.
- Current Cloudflare tunnel Vapi Server URL:
  `https://disposal-absent-sullivan-fought.trycloudflare.com/api/vapi/end-of-call`

Quick tunnel URLs are temporary. If the tunnel is restarted, update the Server URL in Vapi.

## Folder Structure

```text
AI Receptionist/
  apps/
    web/                 Next.js dashboard and Vapi webhook
  supabase/
    migrations/          Supabase SQL migrations
  docs/
    01-strategy/         Business, sales, and offer documents
    02-product/          Product plan and build plan
    03-setup/            Vapi, Zadarma, and setup checklists
  scripts/
    vapi-zadarma/        Local setup/diagnostic scripts
  archive/
    vapi-results/        Historical setup logs and API results
```

## Build Order

1. Set Vapi Server URL to the current Cloudflare tunnel endpoint.
2. Call the Zadarma number and confirm a real Vapi webhook lands in Supabase.
3. Replace demo dashboard data with Supabase reads.
4. Add Google Calendar availability and booking.
5. Add client onboarding flow for new businesses.
6. Deploy the web app with a permanent HTTPS URL.

## Local Commands

```powershell
.\scripts\restart-web-dev-server.ps1
.\scripts\start-web-cloudflare-tunnel.ps1
```
