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
- Production Vapi Server URL:
  `https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call`

Cloudflare tunnel URLs are only for temporary local testing. Production Vapi should use the Vercel URL.

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

1. Configure Vapi Server URL to the production Vercel endpoint.
2. Configure Vapi `check_availability` and `book_appointment` tools.
3. Add Google Calendar service account env vars in Vercel.
4. Run the Google Calendar Supabase migration/index if needed.
5. Test a real phone booking into Supabase and Google Calendar.
6. Add client onboarding flow for new businesses.

## Local Commands

```powershell
.\scripts\restart-web-dev-server.ps1
.\scripts\start-web-cloudflare-tunnel.ps1
```
