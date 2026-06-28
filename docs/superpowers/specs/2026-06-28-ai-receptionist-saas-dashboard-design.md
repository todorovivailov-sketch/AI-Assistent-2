# AI Receptionist SaaS Dashboard Design

Date: 2026-06-28  
Status: Approved direction, ready for implementation planning  
Product: AI Receptionist / booking assistant dashboard for service businesses

## Goal

Build a professional B2B SaaS dashboard for businesses that receive calls, qualify customers, and book appointments through an AI receptionist.

The app must be useful for two roles:

- Owner / manager: wants business performance, missed opportunity recovery, assistant quality, cost, and trends.
- Operator / admin: wants daily work, appointment handling, customer details, confirmations, and follow-ups.

The product should feel operational, precise, and trustworthy. It should not feel like a marketing site, a generic CRM, or a page full of decorative charts.

## Product Principle

The first screen is a command center, not a vanity overview.

Every page must answer one of these questions:

- What needs attention now?
- What is booked and when?
- Who is the customer?
- What happened in the conversation?
- How is the AI assistant performing?
- What should the business change?

Avoid duplicate pages that show the same records under different names. Calls, leads, customers, and appointments must each have a clear owner in the information architecture.

## Recommended Navigation

Primary sidebar:

1. Работно табло / Command Center
2. Задачи / Inbox
3. Календар / Calendar
4. Клиенти / Customers
5. Разговори / Conversations
6. Асистент / Assistant
7. Отчети / Reports
8. Настройки / Settings

Mobile bottom nav should show only:

1. Работно табло
2. Задачи
3. Календар
4. Клиенти
5. Асистент

Reports and Settings remain accessible from a menu on mobile.

Visible UI labels should be Bulgarian for the Bulgarian market. Route names and internal code can remain English, for example `/inbox`, `/customers`, and `/reports`.

## Page Responsibilities

### 1. Command Center

Purpose: one screen for the current day and current risk.

Primary users: owner and operator.

Content:

- Today summary: appointments today, confirmed, needs attention, cancelled/no-show.
- Recovery summary: calls answered by AI, missed calls recovered, bookings created, estimated saved value.
- Work queue preview: top 5 items from Inbox.
- Next appointments: chronological list for today.
- AI health strip: assistant online status, calendar connected, last tool error, STT/transcriber status.
- Booking funnel: calls -> qualified -> calendar checked -> booked.
- Alerts: calendar disconnected, tool failures, repeated unhandled questions, high no-show risk.

Main actions:

- Review attention item.
- Open today's calendar.
- Create manual appointment.
- Test assistant.

Must not duplicate:

- Full call archive. That belongs in Conversations.
- Full customer records. That belongs in Customers.
- Deep analytics. That belongs in Reports.

### 2. Inbox

Purpose: operational queue of items that require human action.

Primary users: operator/admin.

Inbox item types:

- Needs confirmation: booking exists but name, phone, location, or service is uncertain.
- Human requested: customer asked for a person.
- Failed booking: assistant could not book automatically.
- Reschedule requested.
- Cancel requested.
- Price follow-up.
- Urgent request.
- Low confidence extraction.
- Calendar conflict or sync warning.

Views:

- Open
- Snoozed
- Done
- All

Filters:

- Priority
- Type
- Date
- Assigned user
- Source phone number / assistant

Row content:

- Customer name or phone.
- Reason.
- Appointment date/time if present.
- Last conversation summary.
- Confidence indicators.
- Owner/assignee.
- SLA age.

Actions:

- Mark done.
- Assign.
- Call back.
- Add note.
- Confirm appointment.
- Move appointment.
- Open customer.
- Open conversation.

Must not duplicate:

- Calendar grid. Inbox can link to appointment, not render the full calendar.
- Reports. Inbox may show counts, not trend analytics.

### 3. Calendar

Purpose: manage availability and bookings.

Primary users: operator/admin.

Views:

- Day
- Week
- Agenda/list
- Availability rules

Appointment card content:

- Time and duration.
- Customer.
- Service/request.
- Status: requested, confirmed, needs confirmation, cancelled, no-show.
- Location.
- Source: AI, manual, Google import.
- Confidence flags.

Actions:

- Create appointment.
- Move/reschedule.
- Cancel.
- Mark confirmed.
- Mark no-show.
- Open customer.
- Open conversation.

Availability settings visible from Calendar:

- Working hours.
- Buffer time.
- Minimum notice.
- Slot duration.
- Holidays / closed dates.
- Google Calendar sync status.

Must not duplicate:

- Full customer history.
- Full report analytics.

### 4. Customers

Purpose: customer database and history.

Primary users: operator, owner.

List columns:

- Name.
- Phone.
- Last interaction.
- Next appointment.
- Total appointments.
- Tags.
- Status: new, active, needs follow-up, blocked.

Customer profile sections:

- Contact details.
- Timeline: calls, bookings, cancellations, notes.
- Upcoming appointments.
- Past appointments.
- Conversation summaries.
- Notes and tags.
- Consent / communication preferences, later.

Actions:

- Create appointment.
- Add note.
- Call back.
- Merge duplicate customers, later.
- Export customer, later.

Must not duplicate:

- Raw transcripts by default. Show summaries and link to Conversations.

### 5. Conversations

Purpose: complete archive and quality review of AI/customer interactions.

Primary users: owner, admin, support.

List columns:

- Time.
- Caller.
- Outcome: booked, lead, failed booking, support, wrong number, no answer.
- Duration.
- Cost.
- Assistant.
- Confidence/quality marker.

Conversation detail:

- Recording.
- Transcript.
- AI summary.
- Extracted data.
- Tool calls and results.
- Appointment created, if any.
- Customer linked, if any.
- Error/debug details for admins.

Actions:

- Open customer.
- Open appointment.
- Create inbox item.
- Mark transcript issue.
- Flag assistant behavior.

Must not duplicate:

- Operational queue. Actionable problems should become Inbox items.

### 6. Assistant

Purpose: configure and test the AI receptionist.

Primary users: owner during setup, admin/support for tuning.

Sections:

- Overview: assistant status, phone number, model, voice, transcriber, calendar tool status.
- Business profile: company name, service areas, languages, tone.
- Services and request types: generic/free-text for MVP, client-specific later.
- Conversation flow: greeting, required questions, booking rules, escalation rules.
- Knowledge and answers: prices, FAQs, what not to answer.
- Test center: simulated call scripts, real test call, last test result.
- Quality review: misunderstood phrases, failed intents, tool errors, repeated customer corrections.

Actions:

- Edit business profile.
- Edit booking rules.
- Run test call.
- Review failed conversations.

Must not duplicate:

- General company settings like billing/team/security.

### 7. Reports

Purpose: owner-level performance and business insight.

Primary users: owner/manager.

Core charts:

- Booking funnel: calls -> qualified -> calendar checked -> booked.
- Booking rate over time.
- Calls by hour/day heatmap.
- Missed opportunity recovery: AI bookings from calls that otherwise would be missed.
- Service/request mix.
- Assistant quality: successful tool calls, failed tool calls, low-confidence extractions.
- Cost: call minutes, Vapi/provider cost estimate, cost per booking.
- No-show/cancellation rate, later.

Report filters:

- Date range.
- Assistant.
- Phone number.
- Service/request type.
- Outcome.

Export:

- CSV for calls/bookings.
- PDF/weekly report later.

Must not duplicate:

- Day-to-day task management. That belongs in Inbox and Calendar.

### 8. Settings

Purpose: system and account configuration.

Sections:

- Company profile.
- Team and roles.
- Phone numbers.
- Calendar integrations.
- Notifications.
- Billing.
- Security.
- Data retention.

Role permissions:

- Owner: all pages and billing/settings.
- Admin/operator: Inbox, Calendar, Customers, Conversations.
- Viewer: Reports and read-only data.

## Data Ownership Rules

- Conversation is the source for transcript, recording, call cost, AI summary, and extracted fields.
- Customer is the long-lived contact record.
- Appointment is the scheduled time and booking status.
- Inbox item is a task that requires human action.
- Report is derived analytics, not a separate record.

If one entity needs another, link it rather than copying whole content between pages.

## Visual Direction

Style: quiet, utilitarian, premium B2B SaaS.

Principles:

- Dense but organized.
- No oversized hero areas.
- No decorative gradients or one-note palettes.
- Use restrained color with semantic accents.
- Use tables, queues, timelines, compact cards, and charts built for scanning.
- Prioritize clear typography, spacing, and state labels.

Recommended palette direction:

- Neutral surfaces: white/off-white and charcoal text.
- Primary accent: teal or green-blue for active/connected/success.
- Warning: amber.
- Error: red.
- Informational: blue.

Typography:

- Clean sans-serif for UI.
- Tabular figures for metrics, times, phone numbers, and costs.
- Avoid oversized headings inside operational panels.

Iconography:

- Lucide icons.
- One consistent stroke style.
- No emojis as structural icons.

## Layout Patterns

Desktop:

- Persistent left sidebar.
- Sticky top bar with company, phone, connection status, and quick actions.
- Main content max width but allow dense data grids.
- Tables and lists should be first-class, not hidden behind card grids.

Mobile:

- Bottom nav with five primary destinations.
- Command Center shows summary first, then queue.
- Calendar defaults to agenda/day list, not full week grid.
- Tables become stacked rows with key metadata.

## MVP Scope

Implement first:

1. Rename/restructure navigation.
2. Command Center page.
3. Inbox page with derived task types from existing call/appointment data.
4. Calendar refinements.
5. Customers page replacing simple Leads flow.
6. Conversations page replacing Calls.
7. Assistant page with status and prompt/config overview.
8. Reports page with core charts.
9. Settings cleanup.

Defer:

- Billing.
- Multi-user role management.
- PDF exports.
- Customer merge.
- Advanced service catalogs.
- Automated weekly email reports.
- No-show prediction.
- Multi-location scheduling.

Non-goals for the generic MVP:

- Full CRM pipeline with deals and sales stages.
- Inventory, invoicing, or payments.
- Field technician mobile app.
- Industry-specific order/job management unless enabled as a client-specific module.
- Complex automation builder.

## Success Criteria

- A new business owner can understand within 30 seconds what the AI did today.
- An operator can see every item requiring human action without searching calls manually.
- A booked appointment is traceable back to the conversation that created it.
- A customer profile shows future and past activity.
- Reports answer whether the assistant is saving time and creating bookings.
- Navigation has no duplicate conceptual pages.
- The interface feels like professional SaaS, not a demo dashboard.

## Implementation Notes

The current pages map as follows:

- `/` Overview -> Command Center.
- `/calls` -> Conversations.
- `/leads` -> Customers plus Inbox-derived open items.
- `/appointments` -> Calendar.
- `/orders` -> remove from primary nav for generic MVP; later optional Jobs module.
- `/settings` -> Settings.

New pages needed:

- `/inbox`
- `/customers`
- `/conversations`
- `/assistant`
- `/reports`

Existing database can support the first version with calls, appointments, leads, assistants, phone numbers, and organizations. Inbox can initially be derived from call structured data and appointment flags, then become a dedicated table later if needed.
