# AI Receptionist - Product Build Plan and Current Status

Дата: 2026-06-24  
Проект: AI Receptionist / AI Booking Agent за локални service бизнеси  
Първа ниша: климатици и термопомпи  
Цел: продукт, който приема обаждания, обслужва клиенти, записва часове и дава на клиента dashboard с обаждания, заявки, часове и поръчки.

---

## 1. Къде сме стигнали

### Взети решения

- Не правим generic chatbot.
- Правим **AI receptionist** за фирми с телефонни заявки, огледи и поръчки.
- Първата ниша е **климатици и термопомпи**.
- Първата цел е агентът да:
  - вдига телефона;
  - говори на български;
  - събира информация;
  - не дава цени;
  - записва заявка;
  - по-късно проверява календар и записва час.

### Телефония и voice agent

Вече е направено:

- Zadarma Sofia номер е активен:

```text
+359 2 437 2749
```

- Vapi assistant е създаден:

```text
LeadSaver Booking Receptionist BG
assistant_id: 3a342308-b8fb-4194-a629-08fd978fdeea
```

- Vapi + Zadarma SIP връзката беше оправена.
- Работещият вариант е:

```text
Vapi phone number: +35924372749
Zadarma External Server / SIP URI: +35924372749@sip.vapi.ai
Vapi credential gateway: pbx.zadarma.com
```

- Старият вариант без `+` не работеше правилно:

```text
35924372749@sip.vapi.ai
```

- Причина: Vapi/Zadarma мачват правилно номера във формат `+E.164`.

### Създадени локални помощни scripts

В `work/` има scripts за:

- създаване на Vapi + Zadarma SIP credential;
- създаване на Vapi BYO номер;
- диагностика на Vapi phone numbers и calls;
- коригиран E.164 setup.

Не са записвани пароли/API keys във файловете.

### Текущо качество

Телефонията работи. Агентът говори "горе-долу". Това значи:

- SIP route е валидиран;
- Vapi assistant приема реално обаждане;
- следващият риск е качеството на разговора, transcriber-а и prompt-а.

Преди продажба трябва да подобрим:

- transcriber language;
- voice choice;
- prompt ограниченията;
- end-of-call summary;
- записване на lead в Supabase.

---

## 2. Какъв продукт строим

Продуктът не е само "AI глас". Продуктът е:

> AI Receptionist + Client Portal за service фирми.

Клиентът влиза в app-а и вижда:

- всички обаждания;
- записи/transcripts;
- AI summaries;
- нови заявки;
- записани часове;
- статуси на поръчки;
- заявки, които искат човешка намеса;
- колко заявки са спасени;
- basic revenue/pipeline view.

Основният flow:

```text
Call -> AI conversation -> Lead -> Appointment -> Job/Order -> Won/Lost
```

---

## 3. Продуктови роли

### Platform admin

Това сме ние.

Може да:

- създава clients;
- вижда всички calls/leads;
- настройва agent prompt;
- настройва phone number;
- debug-ва integrations;
- вижда usage/cost.

### Client owner

Собственикът на фирмата.

Може да:

- вижда само своите calls/leads/appointments/jobs;
- сменя lead/job статус;
- вижда recordings/transcripts;
- настройва работно време, услуги, райони;
- задава правила кога AI да прехвърля към човек.

### Client staff

Служител на фирмата.

Може да:

- вижда assigned leads;
- вижда calendar;
- сменя статуси;
- добавя notes.

В MVP може да започнем само с `platform_admin` и `client_owner`.

---

## 4. MVP обхват

### MVP включва

- Login.
- Client dashboard.
- Calls list.
- Call detail с transcript/summary.
- Leads list.
- Lead detail.
- Appointments calendar/list.
- Manual status updates.
- Vapi end-of-call webhook.
- Supabase запис на calls/leads.
- Basic Google Calendar integration.
- Owner notification по email.

### MVP не включва

- Billing.
- Multi-language UI.
- Mobile app.
- Complex CRM automation.
- Advanced analytics.
- Full job management.
- SMS campaigns.
- WhatsApp production setup.

---

## 5. Tech stack

### Frontend

```text
Next.js App Router
TypeScript
Tailwind CSS
shadcn/ui или собствен lightweight component set
Lucide icons
```

### Backend

```text
Next.js API routes / route handlers
Supabase Postgres
Supabase Auth
Supabase Row Level Security
Google Calendar API
Vapi webhooks/tools
Resend email
```

### Voice/phone

```text
Zadarma Sofia number
Vapi assistant
Zadarma External Server -> Vapi SIP
```

### Hosting

Първи избор:

```text
Vercel за Next.js
Supabase за DB/Auth
```

Алтернатива:

```text
Railway за backend, ако Vapi webhooks/tools имат нужда от по-дълги операции
```

---

## 6. Frontend план

### Основни routes

```text
/login
/dashboard
/calls
/calls/[id]
/leads
/leads/[id]
/calendar
/jobs
/jobs/[id]
/customers
/settings/agent
/settings/business
/settings/integrations
```

### `/dashboard`

Показва:

- Calls today.
- New leads.
- Appointments booked.
- Needs human.
- Missed/recovered calls.
- Estimated pipeline value.
- Latest calls.
- Upcoming appointments.

Компоненти:

```text
DashboardMetricCard
LatestCallsTable
UpcomingAppointmentsList
NeedsHumanPanel
PipelineSummary
```

### `/calls`

Таблица с:

```text
date
caller_phone
customer_name
status
duration
lead_status
appointment_status
summary
```

Филтри:

```text
date range
status
needs human
has appointment
service type
```

### `/calls/[id]`

Показва:

- call metadata;
- transcript;
- recording URL;
- AI summary;
- extracted customer info;
- linked lead;
- button "Create lead" ако няма lead;
- button "Mark needs human";
- notes.

### `/leads`

Kanban или table view.

Първа версия: table.

Статуси:

```text
new
qualified
appointment_booked
needs_human
quoted
won
lost
```

### `/leads/[id]`

Показва:

- клиент;
- телефон;
- услуга;
- град/квартал;
- urgency;
- notes;
- call transcript;
- appointment;
- job;
- статус;
- internal notes.

### `/calendar`

Първа версия:

- list view с appointments.
- бутон за manual appointment.
- показва Google Calendar sync status.

Втора версия:

- week calendar grid.

### `/jobs`

Първа версия:

- проста таблица/pipeline след lead.

Статуси:

```text
inspection_scheduled
inspection_done
quote_sent
won
lost
cancelled
```

### `/settings/agent`

Клиентът настройва:

- assistant display name;
- working hours;
- accepted services;
- rejected services;
- service areas;
- handoff rules;
- phrases AI must not say;
- emergency contact.

В MVP част от тези настройки може да са read-only и да се редактират от нас.

### `/settings/integrations`

Показва:

- Zadarma number status;
- Vapi assistant status;
- Google Calendar connection;
- email notification settings.

---

## 7. Backend план

### API endpoints

```text
POST /api/vapi/end-of-call
POST /api/vapi/tools
POST /api/tools/create-lead
POST /api/tools/check-availability
POST /api/tools/book-appointment
POST /api/notifications/send-owner-email
GET  /api/dashboard/stats
GET  /api/calls
GET  /api/calls/[id]
GET  /api/leads
PATCH /api/leads/[id]
GET  /api/appointments
PATCH /api/appointments/[id]
```

### Vapi webhook: `POST /api/vapi/end-of-call`

Приключва разговорът и Vapi изпраща:

- call id;
- phone number;
- customer number;
- transcript;
- recording URL;
- summary, ако има;
- assistant id;
- started/ended timestamps.

Backend прави:

1. намира client по `phone_number`;
2. записва call в `calls`;
3. извлича structured lead data от transcript;
4. създава или обновява `lead`;
5. ако lead е `needs_human`, праща notification;
6. ако има appointment intent, подготвя appointment flow.

### Vapi tools: `POST /api/vapi/tools`

Един endpoint приема tool calls.

Поддържани tools:

```text
createLead
checkAvailability
bookAppointment
sendOwnerNotification
transferToHuman
```

Tool dispatch:

```text
if toolName == "createLead" -> create lead
if toolName == "checkAvailability" -> query calendar
if toolName == "bookAppointment" -> create appointment
if toolName == "sendOwnerNotification" -> send email
if toolName == "transferToHuman" -> mark lead needs_human
```

---

## 8. Supabase schema

### `clients`

```sql
id uuid primary key
name text not null
slug text unique not null
primary_phone text
timezone text not null default 'Europe/Sofia'
created_at timestamptz not null default now()
```

### `client_users`

```sql
id uuid primary key
client_id uuid references clients(id)
user_id uuid references auth.users(id)
role text not null
created_at timestamptz not null default now()
```

Roles:

```text
owner
staff
admin
```

### `agent_settings`

```sql
id uuid primary key
client_id uuid references clients(id)
assistant_id text
vapi_phone_number_id text
public_phone text
accepted_services text[]
rejected_services text[]
service_areas text[]
handoff_rules text[]
working_hours jsonb
booking_rules jsonb
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### `calls`

```sql
id uuid primary key
client_id uuid references clients(id)
vapi_call_id text unique
assistant_id text
phone_number_id text
caller_phone text
direction text
status text
ended_reason text
started_at timestamptz
ended_at timestamptz
duration_seconds integer
recording_url text
transcript text
summary text
raw_payload jsonb
created_at timestamptz not null default now()
```

### `customers`

```sql
id uuid primary key
client_id uuid references clients(id)
name text
phone text not null
email text
city text
district text
address text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique(client_id, phone)
```

### `leads`

```sql
id uuid primary key
client_id uuid references clients(id)
customer_id uuid references customers(id)
call_id uuid references calls(id)
service_type text
property_type text
city text
district text
address text
urgency text
status text not null default 'new'
notes text
ai_summary text
estimated_value numeric
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Lead statuses:

```text
new
qualified
appointment_booked
needs_human
quoted
won
lost
cancelled
```

### `appointments`

```sql
id uuid primary key
client_id uuid references clients(id)
lead_id uuid references leads(id)
customer_id uuid references customers(id)
google_event_id text
start_time timestamptz not null
end_time timestamptz not null
status text not null default 'scheduled'
title text
notes text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Appointment statuses:

```text
scheduled
confirmed
completed
cancelled
no_show
rescheduled
```

### `jobs`

```sql
id uuid primary key
client_id uuid references clients(id)
lead_id uuid references leads(id)
appointment_id uuid references appointments(id)
customer_id uuid references customers(id)
status text not null default 'inspection_scheduled'
value numeric
notes text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### `notifications`

```sql
id uuid primary key
client_id uuid references clients(id)
lead_id uuid references leads(id)
call_id uuid references calls(id)
type text not null
channel text not null
recipient text not null
status text not null
payload jsonb
created_at timestamptz not null default now()
```

---

## 9. Google Calendar integration

Първа версия:

- един Google Calendar за demo client;
- service account;
- calendar shared with service account email;
- backend проверява free/busy;
- backend създава event.

Tools:

```text
checkAvailability
bookAppointment
```

Booking rules в `agent_settings.booking_rules`:

```json
{
  "slotMinutes": 30,
  "bufferMinutes": 30,
  "workDays": [1, 2, 3, 4, 5],
  "startTime": "10:00",
  "endTime": "17:00",
  "timezone": "Europe/Sofia",
  "sameDayCutoff": "15:00"
}
```

AI prompt правило:

```text
Не измисляй свободни часове. Винаги използвай checkAvailability.
Потвърждавай час само ако bookAppointment върне success.
```

---

## 10. Vapi tools план

### `createLead`

Вход:

```json
{
  "customerName": "Иван Петров",
  "customerPhone": "+359888123456",
  "serviceType": "монтаж климатик",
  "city": "София",
  "district": "Лозенец",
  "urgency": "тази седмица",
  "notes": "Нов монтаж за апартамент"
}
```

Изход:

```json
{
  "success": true,
  "leadId": "uuid",
  "message": "Заявката е записана."
}
```

### `checkAvailability`

Вход:

```json
{
  "preferredDate": "2026-06-25",
  "preferredTimeOfDay": "afternoon",
  "durationMinutes": 30
}
```

Изход:

```json
{
  "success": true,
  "slots": [
    "2026-06-25T14:00:00+03:00",
    "2026-06-25T15:30:00+03:00"
  ]
}
```

### `bookAppointment`

Вход:

```json
{
  "leadId": "uuid",
  "startTime": "2026-06-25T14:00:00+03:00",
  "durationMinutes": 30,
  "title": "Оглед: монтаж климатик - Иван Петров"
}
```

Изход:

```json
{
  "success": true,
  "appointmentId": "uuid",
  "message": "Часът е записан."
}
```

---

## 11. Build фази

### Фаза 1: Project scaffold

Цел: работещ Next.js + Supabase проект.

Задачи:

- create Next.js app;
- add TypeScript;
- add Tailwind;
- add Supabase client;
- add env validation;
- add layout shell;
- add login page.

Definition of done:

- app starts locally;
- login page renders;
- env vars are validated;
- Supabase connection works.

### Фаза 2: Database и auth

Цел: schema + RLS.

Задачи:

- create Supabase migrations;
- create tables от раздел 8;
- enable RLS;
- policies by client membership;
- seed demo client;
- seed admin user relation.

Definition of done:

- authenticated user sees only own client data;
- demo client exists;
- tables can store calls/leads/appointments.

### Фаза 3: Vapi webhook ingestion

Цел: Vapi calls да се записват в Supabase.

Задачи:

- create `/api/vapi/end-of-call`;
- verify webhook signature/token if configured;
- normalize Vapi payload;
- insert `calls`;
- store raw payload;
- show call in `/calls`.

Definition of done:

- test payload creates call;
- real Vapi call creates call;
- call appears in dashboard.

### Фаза 4: Lead extraction

Цел: от transcript да се създава lead.

Задачи:

- add structured extraction prompt;
- parse customer name/phone/service/city/urgency;
- upsert customer;
- create lead;
- link lead to call.

Definition of done:

- test transcript creates lead;
- lead appears in `/leads`;
- call detail links to lead.

### Фаза 5: Frontend dashboard

Цел: клиентът вижда calls/leads.

Задачи:

- dashboard metrics;
- calls table;
- call detail;
- leads table;
- lead detail;
- status update.

Definition of done:

- user can inspect every call;
- user can update lead status;
- dashboard shows live counts.

### Фаза 6: Google Calendar

Цел: app и AI могат да проверяват свободни часове.

Задачи:

- create Google Cloud project;
- enable Calendar API;
- create service account;
- share demo calendar;
- implement `checkAvailability`;
- implement `bookAppointment`;
- save appointments in Supabase;
- show appointments in `/calendar`.

Definition of done:

- backend returns real free slots;
- booking creates Google event;
- appointment appears in app.

### Фаза 7: Vapi tools

Цел: AI сам да създава lead и да записва час.

Задачи:

- add Vapi tool definitions;
- configure tool server URL;
- implement tool dispatch;
- add assistant prompt rules;
- test call: customer asks for appointment;
- AI calls `checkAvailability`;
- AI calls `bookAppointment`;
- customer hears confirmation.

Definition of done:

- real phone call creates lead;
- real phone call books appointment;
- Supabase and Google Calendar match.

### Фаза 8: Client settings

Цел: клиентът настройва бизнеса.

Задачи:

- settings/business page;
- services editor;
- service areas editor;
- working hours editor;
- handoff rules editor;
- save to `agent_settings`.

Definition of done:

- prompt/tools use client settings;
- owner can change working hours from app.

### Фаза 9: Jobs/orders

Цел: след appointment клиентът управлява поръчката.

Задачи:

- jobs table page;
- create job from lead;
- update job status;
- set estimated/actual value;
- dashboard pipeline summary.

Definition of done:

- client can move lead to job;
- won/lost tracking works.

---

## 12. Immediate next tasks

Следващите реални задачи са:

1. Да създадем Next.js проекта в папка `AI Receptionist`.
2. Да вържем Supabase.
3. Да направим DB schema/migrations.
4. Да направим първия dashboard shell.
5. Да направим `/api/vapi/end-of-call`.
6. Да настроим Vapi end-of-call webhook към локален/public URL.
7. Да запишем първия реален call в Supabase.

Не започваме с calendar tool преди call ingestion. Първо трябва да записваме всеки разговор.

---

## 13. Рискове

### Български voice/transcriber

Риск: агентът разбира "горе-долу", но не достатъчно за продажба.

Решение:

- тествай различни transcribers;
- избери Bulgarian/multilingual;
- по-кратък prompt;
- по-ясни въпроси;
- fallback към human handoff.

### Vapi cost

Риск: по-скъп модел/voice прави margin слаб.

Решение:

- първо quality;
- после тест с по-евтин модел;
- ограничаване на long calls;
- handoff при сложни случаи.

### Calendar complexity

Риск: райони, пътуване и различни услуги усложняват booking.

Решение:

- първо 30-min generic slots;
- после service-specific duration;
- после routing/travel logic.

### Client trust

Риск: клиентът не вярва, че AI говори достатъчно добре.

Решение:

- demo с реален телефон;
- dashboard с transcript;
- "AI не дава цени";
- human handoff;
- 14-дневен пилот.

---

## 14. Как ще изглежда първата demo продажба

Показваме:

1. Звъним на `+359 2 437 2749`.
2. AI вдига.
3. Клиент казва: "Искам монтаж на климатик в София, Лозенец."
4. AI събира информация.
5. Разговорът се появява в app-а.
6. Lead се появява в app-а.
7. Собственикът вижда summary.
8. Ако calendar е готов, AI записва час.

Това е demo, което продава.

---

## 15. Project files created so far

Планове и документи:

- `ai-lead-recovery-business-blueprint-bg.md`
- `ai-lead-recovery-sales-demo-kit-bg.md`
- `ai-lead-recovery-detailed-implementation-plan-bg.md`
- `vapi-setup-checklist-bg.md`
- `zadarma-ai-number-activation-checklist-bg.md`
- `ai-receptionist-product-build-plan-and-status-bg.md`

Scripts и diagnostic files:

- `configure-vapi-zadarma.ps1`
- `configure-vapi-zadarma-e164.ps1`
- `create-vapi-explicit-sip-uri.ps1`
- `diagnose-vapi-phone-numbers.ps1`
- `vapi-diagnosis-result.json`
- `vapi-zadarma-e164-setup-result.json`
- logs от setup опитите.

---

## 16. Следващо решение преди build

Има два възможни build подхода:

### Approach A: Full app scaffold first

Правим Next.js app, auth, layout, DB schema, dashboard pages.

Плюс:

- чист продукт;
- добра основа.

Минус:

- повече време преди първия live webhook.

### Approach B: Backend ingestion first

Първо правим Supabase schema + `/api/vapi/end-of-call`, после dashboard.

Плюс:

- по-бързо доказваме real call -> data.

Минус:

- UI идва малко по-късно.

Препоръка:

**Approach B.**  
Първо real call ingestion, после dashboard. Причината е, че вече имаме работещ телефон; следващият най-важен риск е дали можем надеждно да превърнем разговор в данни.
