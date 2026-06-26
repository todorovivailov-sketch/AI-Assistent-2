# AI Receptionist Web

Next.js dashboard for the AI Receptionist product.

## Local Setup

```powershell
Copy-Item .env.example .env.local
npm run dev
```

Use Supabase publishable and secret keys for new projects. Legacy anon/service role keys are supported as fallbacks.

## Vapi Webhook

Set the assistant or phone number Server URL to:

```text
https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call
```

Configure Vapi Custom Credentials as Bearer Token and put the same value in `VAPI_WEBHOOK_SECRET`.

## Google Calendar Sync

`vercel.json` runs `/api/calendar/google/sync` once per day. Set `CRON_SECRET`
in Vercel so cron requests are authorized.

## Scripts

```powershell
npm run dev
npm run build
npm run lint
```
