# AI Lead Recovery Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Да изградим работещ MVP за AI Lead Recovery Agent, който спасява пропуснати обаждания/заявки, квалифицира клиента и записва оглед, за да може да се продаде първи платен пилот.

**Architecture:** Започваме с concierge MVP: n8n автоматизации, Google Sheets като CRM, Google Calendar за booking, Twilio/Retell/Vapi за voice/SMS и проста landing page. Не строим пълен SaaS dashboard преди първите платени клиенти.

**Tech Stack:** Next.js или статичен HTML, n8n, Google Sheets, Google Calendar, Twilio, Retell или Vapi, OpenAI/LLM за structured extraction, email/Telegram/WhatsApp owner notifications, Supabase във версия 2.

---

## Най-важното решение

Първата версия не трябва да е голям SaaS. Тя трябва да доказва само едно:

> Когато фирмата изпусне клиент, системата реагира бързо, събира информация и записва реална заявка.

Затова build-ът се прави в 3 слоя:

1. **Demo слой** - показва как работи системата пред потенциален клиент.
2. **Pilot слой** - работи реално за първи клиент, дори с ръчни части.
3. **Product слой** - автоматизира повтарящите се части след 2-3 платени клиента.

## MVP версията, която строим първо

Първият MVP е **message-first + optional voice**.

Причина: българският AI voice може да се окаже недостатъчно добър или скъп. SMS/WhatsApp/email qualification е по-надежден за първи пилот. Voice остава като demo и като upsell, ако тестовете са добри.

MVP включва:

- landing page;
- lead intake форма;
- missed call simulation;
- Google Sheet pipeline;
- n8n workflow за qualification;
- owner notification;
- Google Calendar booking;
- weekly report;
- demo video;
- prospecting sheet;
- първи client onboarding checklist.

## Файлова структура за code MVP

Ако решим да го строим като малък web проект, структурата е:

```text
lead-recovery-ai/
  app/
    page.tsx
    demo/page.tsx
    api/leads/route.ts
    api/twilio/voice/route.ts
    api/twilio/sms/route.ts
    api/calendar/book/route.ts
  components/
    LeadForm.tsx
    DemoTimeline.tsx
    PricingBlock.tsx
  lib/
    leadSchema.ts
    scoring.ts
    calendar.ts
    notifications.ts
    env.ts
  data/
    demoLeads.ts
  docs/
    n8n-workflows.md
    agent-prompts.md
    onboarding.md
  tests/
    leadSchema.test.ts
    scoring.test.ts
```

За първите 1-2 пилота можем да пропуснем повечето code и да използваме n8n + Google Sheets. Web проектът е нужен основно за landing page, demo и по-късно dashboard.

---

# Фаза 0: Подготовка

Цел: да имаме всички акаунти, ключове и работни документи преди build-а.

## Task 0.1: Създай работен списък с инструменти

- [ ] Създай акаунт или достъп до n8n.
  - Най-бързо: n8n Cloud.
  - По-евтино: self-host на Railway/Render/VPS.

- [ ] Създай Google account/workspace за проекта.
  - Google Sheets за CRM.
  - Google Calendar за booking.
  - Gmail или SMTP за owner notifications.

- [ ] Създай Twilio акаунт.
  - Нужно за SMS, phone number, call forwarding тестове.
  - За България провери дали нужният phone number type е наличен и каква е цената.

- [ ] Създай Retell и/или Vapi акаунт.
  - Тествай кой дава по-добър български speech-to-text и text-to-speech.

- [ ] Създай OpenAI API key или друг LLM provider.
  - Използва се за structured extraction, summaries и classification.

- [ ] Създай folder структура:
  - `outputs/` за планове и deliverables.
  - `work/prospects/` за prospect lists.
  - `work/demo/` за скриптове, prompts и тестове.

## Task 0.2: Избери първа ниша

Първата ниша е:

**Климатици и термопомпи.**

Защо:

- висока стойност на сделка;
- сезонност и спешност;
- много малки фирми;
- собствениците често са на обект;
- лесно се прави qualification script.

Не започваме с всички ниши едновременно. Това ще размие sales message-а.

---

# Фаза 1: Дефиниране на данните

Цел: всички lead-и да влизат в една проста структура, независимо дали идват от форма, missed call, SMS или voice agent.

## Task 1.1: Създай Google Sheet CRM

Създай Google Sheet с име:

```text
LeadSaver AI - Demo CRM
```

Създай tab `Leads` с тези колони:

```text
lead_id
created_at
source
client_company
customer_name
customer_phone
customer_email
city
district
service_type
property_type
urgency
preferred_time
photos_url
notes
qualification_status
appointment_time
appointment_status
owner_notified
estimated_value
conversation_summary
next_action
```

Стойности за `source`:

```text
web_form
missed_call
sms_reply
whatsapp_reply
voice_agent
manual
```

Стойности за `qualification_status`:

```text
new
contacted
qualified
not_qualified
booked
needs_human
lost
```

## Task 1.2: Създай Google Sheet tab за клиентски настройки

Tab: `Client Settings`

Колони:

```text
client_id
company_name
owner_name
owner_phone
owner_email
service_area
working_hours
calendar_id
accepted_services
rejected_services
handoff_rules
booking_rules
notification_channel
```

Първи demo client:

```text
client_id: demo_hvac_001
company_name: Demo Клима Сервиз
owner_name: Иван
service_area: София, Перник, Банкя
accepted_services: монтаж климатик, ремонт климатик, профилактика, термопомпа
rejected_services: автомобилни климатици, индустриални хладилни инсталации
handoff_rules: ядосан клиент, гаранционен проблем, искане за финална цена
booking_rules: огледи понеделник-петък 10:00-17:00
notification_channel: email + sms
```

---

# Фаза 2: Prompt и qualification логика

Цел: AI да не "говори свободно", а да събира точно нужната информация.

## Task 2.1: Напиши system prompt за qualification agent

Използвай този prompt за първия agent:

```text
Ти си асистент за фирма за климатици и термопомпи.

Целта ти е да събереш информация за заявка и да я подготвиш за човек от фирмата.

Задавай кратки въпроси, един по един.
Не обещавай цена, наличност или срок за монтаж.
Не давай технически диагнози.
Не спори с клиента.
Ако клиентът е ядосан, има гаранционен проблем или настоява за финална цена, маркирай заявката като needs_human.

Събери:
1. име;
2. телефон;
3. град и квартал;
4. тип услуга: монтаж, ремонт, профилактика, термопомпа, оферта;
5. тип имот: апартамент, къща, офис, магазин;
6. спешност;
7. удобно време за оглед или разговор;
8. кратко описание.

Когато имаш достатъчно информация, върни structured JSON със следните полета:
customer_name, customer_phone, city, district, service_type, property_type, urgency, preferred_time, notes, qualification_status, next_action.
```

## Task 2.2: Дефинирай scoring rules

Lead е `qualified`, ако има:

- телефон;
- град;
- услуга;
- реален service type;
- удобен follow-up time или ясно "обадете ми се".

Lead е `needs_human`, ако:

- клиентът е ядосан;
- има гаранционен спор;
- иска финална цена;
- пита за нещо извън accepted services;
- пише/говори объркано и agent-ът не може да класифицира.

Lead е `not_qualified`, ако:

- е извън service area;
- иска услуга, която фирмата не предлага;
- няма телефон;
- няма реална заявка.

---

# Фаза 3: n8n workflow - web lead intake

Цел: всяка заявка от форма да влиза в CRM, да се квалифицира и да уведомява собственика.

## Task 3.1: Създай n8n workflow `web_lead_intake`

Nodes:

1. **Webhook Trigger**
   - Method: `POST`
   - Path: `/lead-intake`

2. **Set Node: Normalize Input**
   - Полета:
     - `source`
     - `customer_name`
     - `customer_phone`
     - `customer_email`
     - `message`
     - `client_id`

3. **OpenAI/LLM Node: Extract Lead Fields**
   - Използва prompt от Task 2.1.
   - Output да бъде JSON.

4. **IF Node: Is Qualified**
   - Ако `qualification_status` е `qualified` или `needs_human`, продължава към notification.
   - Ако е `not_qualified`, записва в sheet, но не праща urgent notification.

5. **Google Sheets: Append Row**
   - Sheet: `LeadSaver AI - Demo CRM`
   - Tab: `Leads`

6. **Email/Telegram Notification**
   - До собственика.
   - Message:

```text
Нова заявка:
Име: {{$json.customer_name}}
Телефон: {{$json.customer_phone}}
Град: {{$json.city}}
Услуга: {{$json.service_type}}
Спешност: {{$json.urgency}}
Бележки: {{$json.notes}}
Следващо действие: {{$json.next_action}}
```

7. **Respond to Webhook**
   - Status: `200`
   - Body:

```json
{
  "ok": true,
  "message": "Lead received"
}
```

## Task 3.2: Тествай workflow-а

Изпрати test request:

```json
{
  "source": "web_form",
  "client_id": "demo_hvac_001",
  "customer_name": "Георги",
  "customer_phone": "+359888123456",
  "message": "Трябва ми оферта за термопомпа за къща 160 квадрата в Банкя."
}
```

Очакван резултат:

- нов ред в Google Sheet;
- `service_type` съдържа `термопомпа`;
- `city` или `district` съдържа `Банкя`;
- собственикът получава notification;
- webhook връща `ok: true`.

---

# Фаза 4: n8n workflow - missed call recovery

Цел: когато има пропуснато обаждане, системата да изпрати follow-up и да създаде lead.

## Task 4.1: Създай workflow `missed_call_recovery`

Първо го правим със simulation webhook. Реалната телефония идва след това.

Nodes:

1. **Webhook Trigger**
   - Method: `POST`
   - Path: `/missed-call`

2. **Set Node: Normalize Call**
   - Полета:
     - `caller_phone`
     - `called_number`
     - `client_id`
     - `call_time`

3. **Google Sheets: Append Row**
   - Добавя lead със:
     - `source = missed_call`
     - `customer_phone = caller_phone`
     - `qualification_status = new`
     - `next_action = send_followup`

4. **Twilio SMS Node или placeholder notification**
   - Message:

```text
Здравейте, опитахте да се свържете с {{company_name}}. За климатик, термопомпа, ремонт или профилактика е заявката?
```

5. **Owner notification**
   - Message:

```text
Пропуснато обаждане от {{$json.caller_phone}}. Изпратен е автоматичен follow-up.
```

## Task 4.2: Тествай missed call simulation

Test payload:

```json
{
  "caller_phone": "+359888123456",
  "called_number": "+359XXXXXXXXX",
  "client_id": "demo_hvac_001",
  "call_time": "2026-06-24T10:30:00+03:00"
}
```

Очакван резултат:

- ред в Google Sheet;
- SMS или test notification;
- owner notification.

## Task 4.3: Вържи Twilio real webhook

След simulation теста:

- [ ] Купи или активирай Twilio number.
- [ ] В Twilio console настрой incoming call webhook към n8n.
- [ ] Ако call не е отговорен, прати payload към `/missed-call`.
- [ ] Ако Twilio не може лесно да засече missed call в текущия setup, използвай fallback:
  - клиентът включва call forwarding on no answer към наш номер;
  - нашият номер вдига с кратък message или voice agent;
  - системата записва lead.

Практична бележка: за първи пилот е допустимо клиентът да forward-ва calls след 15-20 секунди към наш AI номер. Това е по-лесно от интеграция със съществуващата му телефония.

---

# Фаза 5: SMS/WhatsApp reply qualification

Цел: ако клиентът отговори на follow-up съобщението, системата да продължи разговора и да събере данни.

## Task 5.1: Създай workflow `message_reply_qualification`

Nodes:

1. **Webhook Trigger**
   - Twilio inbound SMS/WhatsApp webhook.

2. **Lookup Lead**
   - Търси последния lead по `customer_phone`.

3. **LLM Node: Next Question Or Final JSON**
   - Вход:
     - досегашни съобщения;
     - client settings;
     - prompt от Task 2.1.

4. **IF Node: Needs More Info**
   - Ако липсват данни, изпраща следващ кратък въпрос.
   - Ако lead е qualified, записва summary и предлага booking.

5. **Google Sheets Update Row**
   - Обновява lead status и summary.

6. **Owner Notification**
   - Праща само когато lead стане `qualified`, `booked` или `needs_human`.

## Task 5.2: Първа версия без дълъг conversation memory

За MVP не строим сложен chat memory. Използваме тези полета в Google Sheet:

```text
conversation_summary
notes
qualification_status
next_action
```

Всеки нов входящ reply се обобщава и обновява реда.

Това е достатъчно за пилот.

---

# Фаза 6: Calendar booking

Цел: qualified lead да стане реален оглед/разговор в календара.

## Task 6.1: Създай booking rules

За demo client:

```text
Работни дни: понеделник-петък
Часове: 10:00-17:00
Slot length: 30 минути
Buffer: 30 минути
Не записвай за същия ден след 15:00
```

## Task 6.2: Настрой Google Calendar integration

В n8n:

- [ ] Свържи Google Calendar credentials.
- [ ] Избери calendar за demo client.
- [ ] Направи node `Get availability`.
- [ ] Направи node `Create event`.

Event title:

```text
Оглед: {{$json.service_type}} - {{$json.customer_name}}
```

Event description:

```text
Телефон: {{$json.customer_phone}}
Град/квартал: {{$json.city}} {{$json.district}}
Услуга: {{$json.service_type}}
Имот: {{$json.property_type}}
Спешност: {{$json.urgency}}
Бележки: {{$json.notes}}
Източник: {{$json.source}}
```

## Task 6.3: Booking fallback

Ако автоматичният booking е сложен за първата седмица:

- agent-ът събира 2 удобни времеви прозореца;
- системата праща notification към собственика;
- собственикът потвърждава ръчно.

Важно: не блокираме продажбата заради perfect calendar automation.

---

# Фаза 7: Voice agent

Цел: да имаме voice demo и възможност за real callback, ако българският voice е достатъчно добър.

## Task 7.1: Тествай Retell и Vapi

Направи един и същ тест в Retell и Vapi:

Сценарий:

```text
Клиент: Здравейте, трябва ми термопомпа за къща около 160 квадрата в Банкя.
Agent: Здравейте. Ще събера няколко детайла, за да ви върнат точна оферта. Къщата има ли изградена отоплителна инсталация?
Клиент: Да, има подово отопление.
Agent: Разбрах. За кога искате оглед или разговор?
```

Оценка:

- разбира ли български;
- говори ли естествено;
- прекъсва ли клиента;
- може ли да върне structured summary;
- колко струва минута;
- може ли да извиква webhook/tool.

## Task 7.2: Voice agent prompt

Използвай:

```text
Ти си телефонен асистент за фирма за климатици и термопомпи.
Говори кратко и спокойно на български.
Не казвай, че си "изкуствен интелект", освен ако те попитат. Кажи: "Аз съм автоматизиран асистент на фирмата."
Целта е да събереш информация и да организираш обратен разговор или оглед.
Не давай крайна цена.
Не обещавай наличност.
Не приемай плащания.
Ако клиентът е ядосан, има гаранционен проблем или настоява за човек, кажи че ще предадеш на екипа приоритетно.
След разговора върни summary в JSON.
```

## Task 7.3: Интеграция voice -> CRM

След всеки voice call:

- [ ] Call ended webhook към n8n.
- [ ] n8n получава transcript/summary.
- [ ] LLM structured extraction.
- [ ] Google Sheet append/update.
- [ ] Owner notification.
- [ ] Ако lead е qualified, booking step.

## Task 7.4: Решение voice-first или message-first

След тестове:

- Ако voice quality е добра: demo-то започва с voice missed call callback.
- Ако voice quality е средна: voice е optional, основният продукт е SMS/WhatsApp qualification.
- Ако voice quality е лоша: не продаваме voice. Продаваме "instant missed lead recovery" чрез съобщения.

---

# Фаза 8: Landing page

Цел: прост сайт, който продава пилота.

## Task 8.1: Структура на страницата

Секции:

1. Hero:
   - headline;
   - подзаглавие;
   - CTA "Виж 2-минутно демо".

2. Problem:
   - пропуснати обаждания;
   - клиентът отива при конкурент;
   - скъпа стойност на сделката.

3. How it works:
   - missed call;
   - follow-up;
   - qualification;
   - booking;
   - report.

4. Demo:
   - видео или интерактивна timeline.

5. Pricing:
   - 14-дневен пилот;
   - 499 евро/месец след пилота.

6. CTA:
   - форма за demo.

## Task 8.2: Първата версия може да е статична

Не е нужен login. Не е нужен dashboard. Не е нужен billing.

Минимални полета във формата:

```text
Име
Фирма
Телефон
Услуга/ниша
Град
```

Формата праща към n8n `/lead-intake`.

---

# Фаза 9: Dashboard и weekly report

Цел: клиентът да вижда стойност всяка седмица.

## Task 9.1: Първа версия на report

Всяка седмица пращаме email:

```text
Седмичен отчет - LeadSaver AI

Нови заявки: 14
Пропуснати обаждания засечени: 8
Автоматично върнати: 8
Квалифицирани заявки: 5
Записани огледи: 3
Нужда от човешка намеса: 2
Потенциална стойност: 3 x средна сделка
```

## Task 9.2: n8n weekly report workflow

Nodes:

1. Cron trigger - всеки понеделник 09:00.
2. Google Sheets read rows for last 7 days.
3. Aggregate counts.
4. LLM summary:

```text
Напиши кратък отчет за собственика. Фокусирай се върху спасени заявки, записани огледи и следващи действия.
```

5. Email to owner.

---

# Фаза 10: Demo video

Цел: да не обясняваме продукта всеки път от нула.

## Task 10.1: Script за 2-минутно видео

Структура:

```text
0:00 - "Това е AI асистент за пропуснати заявки."
0:15 - Симулираме пропуснато обаждане.
0:30 - Клиентът получава SMS/WhatsApp.
0:50 - Асистентът задава 4 въпроса.
1:15 - Системата записва оглед.
1:35 - Собственикът получава готова заявка.
1:50 - "Ако това спаси една продажба месечно, системата се изплаща."
```

## Task 10.2: Какво да покажем на екрана

- Google Sheet lead row.
- SMS/WhatsApp conversation mock.
- Calendar event.
- Owner notification.
- Weekly report.

Не показваме сложна архитектура. Собственикът купува резултат, не технология.

---

# Фаза 11: Първи платен пилот

Цел: първи реален клиент, без да чакаме перфектен продукт.

## Task 11.1: Минимален setup за клиент

За първия клиент настройваме:

- client settings row;
- accepted/rejected services;
- owner notification;
- Google Calendar;
- lead intake workflow;
- missed call workflow или manual missed call import;
- weekly report.

## Task 11.2: Call forwarding setup

Най-прост setup:

1. Клиентът настройва call forwarding on no answer към нашия demo/AI number.
2. Ако не може:
   - започваме само с web/Facebook lead forms;
   - или клиентът праща screenshot/call log за missed calls в края на деня.

Не спираме пилота, ако phone integration се забави.

## Task 11.3: Pilot success criteria

Пилотът е успешен, ако за 14 дни имаме поне едно от тези:

- 1 записан оглед от пропусната заявка;
- 3 квалифицирани заявки;
- собственикът каже, че системата му е спестила време;
- открием реален missed call проблем в call log.

---

# Фаза 12: Sales execution

Цел: да стигнем до първи 1-2 платени пилота.

## Task 12.1: Prospect list

Събери 150 фирми:

- 50 климатици/термопомпи София;
- 25 Пловдив;
- 25 Варна;
- 25 Бургас;
- 25 резервни: дограма/солари.

Записвай в prospecting sheet:

```text
Company
City
Website
Phone
Google reviews
Facebook/Instagram
Contact channel
Message sent
Reply
Demo booked
Pilot status
Notes
```

## Task 12.2: Outreach cadence

Ден 1:

- 30 DMs;
- 10 emails;
- 10 calls.

Ден 2:

- follow-up към всички, които не са отговорили;
- още 30 нови DMs.

Ден 3:

- calls към най-добрите 20 prospects.

Ден 4-5:

- demo calls;
- close към pilot.

## Task 12.3: Close offer

Използвай:

```text
Предлагам да го пуснем като 14-дневен пилот.
Инсталацията е лека: настройваме ви lead recovery flow, уведомления и отчет.
Ако не видим реални пропуснати или спасени заявки, не продължаваме.
Ако работи, оставате на 499 евро/месец.
```

---

# Фаза 13: QA checklist

Преди да покажем демото:

- [ ] Webhook приема lead.
- [ ] Lead се записва в Google Sheet.
- [ ] LLM връща structured fields.
- [ ] Owner notification пристига.
- [ ] Calendar event се създава или fallback notification работи.
- [ ] Missed call simulation работи.
- [ ] SMS/WhatsApp follow-up template е готов.
- [ ] Demo video или live demo flow работи без ръчно търсене на файлове.
- [ ] Pricing и pilot offer са ясни.

Преди реален клиент:

- [ ] Имаме consent за call/message automation.
- [ ] Клиентът знае какви съобщения ще се пращат от негово име.
- [ ] Има handoff правило към човек.
- [ ] Не обещаваме цени/наличности автоматично.
- [ ] Има fallback, ако AI не разбере клиента.

---

# Фаза 14: Какво строим след първите 3 клиента

Само след платени клиенти:

1. Supabase база вместо Google Sheets.
2. Client portal.
3. Multi-client settings UI.
4. Billing.
5. Better analytics dashboard.
6. Vertical templates за:
   - климатици;
   - термопомпи;
   - дограма;
   - солари;
   - ремонти.

Не преди това.

---

# Ден по ден план

## Ден 1

- [ ] Създай акаунти: n8n, Google, Twilio, Retell/Vapi.
- [ ] Създай Google Sheet CRM.
- [ ] Напиши client settings за demo HVAC фирма.
- [ ] Тествай Retell/Vapi с български сценарий.
- [ ] Реши дали demo-то е voice-first или message-first.

## Ден 2

- [ ] Направи n8n `web_lead_intake`.
- [ ] Направи Google Sheets append.
- [ ] Направи owner notification.
- [ ] Тествай с 5 примерни заявки.

## Ден 3

- [ ] Направи `missed_call_recovery` simulation.
- [ ] Настрой SMS или test notification.
- [ ] Направи първата demo timeline.
- [ ] Запиши 2-минутно rough demo video.

## Ден 4

- [ ] Направи landing page.
- [ ] Свържи формата към n8n.
- [ ] Добави pricing и pilot CTA.
- [ ] Пробвай целия flow end-to-end.

## Ден 5

- [ ] Направи weekly report workflow.
- [ ] Подготви sales demo script.
- [ ] Подготви onboarding questions.
- [ ] Подготви pilot agreement notes.

## Ден 6

- [ ] Събери 50 prospects.
- [ ] Изпрати 30 DMs.
- [ ] Изпрати 10 emails.
- [ ] Направи 10 calls.

## Ден 7

- [ ] Follow-up към всички.
- [ ] Събери още 50 prospects.
- [ ] Направи 3-5 live demos.
- [ ] Опитай да затвориш първи pilot.

## Ден 8-10

- [ ] Инсталирай първи pilot.
- [ ] Настрой client settings.
- [ ] Настрой calendar/notifications.
- [ ] Стартирай daily monitoring.
- [ ] Прати първи мини отчет след 48 часа.

---

# Definition of done за MVP

MVP е готов, когато можем да направим това live:

1. Симулираме пропуснато обаждане.
2. Системата създава lead.
3. Клиентът получава follow-up.
4. Данните се квалифицират.
5. Собственикът получава готова заявка.
6. Можем да запишем оглед или да изпратим handoff.
7. Всичко се вижда в Google Sheet.
8. Имаме landing page и demo video.
9. Имаме 50 prospects и outreach script.
10. Можем да предложим 14-дневен пилот.

Ако тези 10 неща работят, не строим повече. Започваме продажби.

