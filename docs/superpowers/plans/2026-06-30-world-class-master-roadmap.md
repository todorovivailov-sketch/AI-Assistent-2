# World-Class AI Receptionist — Master Roadmap

**Goal:** Take the working demo (call → lead → appointment) to a sellable, multi-tenant, world-class
AI receptionist SaaS for Bulgarian service businesses.

**How to read this:** This is the ordering + rationale. Each phase gets its own detailed,
task-by-task plan file (`docs/superpowers/plans/2026-06-30-phase-N-*.md`) written **when we reach it**,
so plans stay accurate. Phase 1 is already detailed.

**Guiding principle:** Correctness & the conversion loop first (cheap, high impact) → then make it
self-serve & multi-tenant (sellable) → then expand channels & scale. Don't build Phase 7 polish on a
Phase 1 bug.

---

## Access reality (what I can do solo vs. what needs you)

| Capability | Status | Implication |
|---|---|---|
| Supabase (DB, service role) | ✅ local + prod | I can read/write data, run migrations |
| Google Calendar | ✅ set | availability/booking works |
| Write app code, build, test | ✅ | full speed locally (Next.js 16.2.9 build is green) |
| Push to `main` / deploy | ⛔ needs your OK | safety policy blocks direct push to default branch |
| Update Vapi assistant (prompt/voice/tools) | ⛔ no API key | `VAPI_API_KEY` absent → you paste prompt, or add the key |
| Email (Resend) | ⚠️ not local | only a placeholder locally; may be set in Vercel prod — needs confirming |
| SMS | ❌ none | needs a provider decision (Twilio / Zadarma / other) + key |
| Vercel env / API | ⛔ no token | env changes happen in the Vercel dashboard (you) |

**Decisions I need from you before the dependent phases:** (1) deploy method (authorize push to `main`
vs. PR), (2) how to apply the Vapi prompt (paste vs. give `VAPI_API_KEY`), (3) SMS provider, (4) when to
introduce auth/multi-tenancy (now vs. at client #2).

---

## Phase order

### Phase 0 — Deploy current design ✅ (in progress)
Commit + push the latest dashboard redesign so production matches local. **Blocked on push authorization.**

### Phase 1 — Assistant reliability & data integrity ⭐ (start here)
**Why first:** directly fixes "the agent isn't good", costs nothing extra, and makes every downstream
metric trustworthy. Mostly code I control + one prompt paste.
- Harden structured-data extraction so no captured field is silently dropped (`preferred_time`,
  `disposition`) — code + unit tests.
- Apply v2 system prompt (dynamic date, spoken-form BG, tool-deferral, guardrails) — `receptionist-prompt-v2-bg.md`.
- Owner email notification on new lead / needs-human (Resend).
- Recording-consent line in the greeting (cheap EU-compliance win).
**Detailed plan:** `2026-06-30-phase-1-assistant-reliability.md`.
**Needs:** Vapi prompt apply (paste or key); confirm Resend key in prod.

### Phase 2 — Multi-tenancy & auth (foundation)
**Why:** every per-client feature depends on it; the longer delayed, the more rework. Removes hardcoded
`demo-hvac-company`.
- Supabase Auth login; `user → organization` membership; org resolution by inbound phone number in the
  webhook + tools; enforce RLS; dashboard reads the signed-in user's org.
**Needs:** decision — do this now, or after a 2nd client is lined up.

### Phase 3 — CRM actions (make the dashboard do work, not just show)
- Lead pipeline status changes, notes, owner/staff assignment.
- Appointment reschedule/edit UI (cancel API already exists).
- Manual appointment + manual lead creation.

### Phase 4 — Agent Builder UI (self-serve config)
**Why:** removes you from every client tweak; lets onboarding hit ~15-min go-live like the leaders.
- Editable business hours, services, service areas, handoff rules, guardrails, assistant display name →
  stored in DB, pushed to the Vapi assistant.
**Needs:** `VAPI_API_KEY` (to sync config to the assistant).

### Phase 5 — Analytics & ROI
- Recovered-revenue attribution (missed-call → booked), conversion funnel, CSV export, custom date ranges.

### Phase 6 — Notifications & reminders (expand)
- Appointment reminders + confirmations (email now; SMS once provider chosen), no-show follow-ups.
**Needs:** SMS provider + key.

### Phase 7 — Omnichannel (SMS agent, missed-call text-back, web chat)
- One agent "brain" across voice + SMS + web chat; A2P/sender registration for BG.
**Needs:** SMS provider; bigger build — sequence after the core SaaS is solid.

### Phase 8 — Compliance hardening (EU/GDPR)
- Configurable recording consent + data retention, PII redaction in transcripts, audit log of agent
  actions, data-processing records. (Consent line ships early in Phase 1; the rest here.)

### Phase 9 — Billing & usage
- Per-minute usage metering, plans, per-client billing dashboard, agency/multi-client view.

---

## "World-class" checklist → phase mapping

| World-class trait (from benchmark) | Phase |
|---|---|
| Reliable booking, no dropped data, dynamic dates | 1 |
| Owner alerts on new lead / needs-human | 1 / 6 |
| Recording consent (EU) | 1 / 8 |
| Multi-tenant, secure per-client data | 2 |
| Lead pipeline + notes + assignment | 3 |
| Reschedule/edit appointments | 3 |
| No-code agent config + guardrails + go-live speed | 4 |
| Conversation intelligence (sentiment, QA, search) | 5 |
| ROI / recovered-revenue analytics | 5 |
| Reminders + missed-call text-back | 6 / 7 |
| Omnichannel (voice+SMS+chat, one brain) | 7 |
| GDPR + retention + audit + PII redaction | 8 |
| Usage-based billing + agency view | 9 |

---

## Explicitly NOT now (avoid scope creep)
Voice cloning, 20+ languages, canary/versioned deploys, full Jobs/Orders module, white-label sub-accounts.
Revisit after the first 3–5 paying clients. Win with **one flawless Bulgarian niche + EU compliance +
reliable human handoff** — exactly where the US incumbents are weak.
