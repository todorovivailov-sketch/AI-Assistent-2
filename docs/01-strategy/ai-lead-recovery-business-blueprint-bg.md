# AI Lead Recovery Agent - бизнес blueprint

Дата: 2026-06-24  
Цел: бързо изградим AI/vibecoding бизнес, който може да стигне около 3000 евро месечен приход и после да расте.

## Крайно решение

Най-добрата първа идея е productized service, не чист SaaS:

**AI Lead Recovery Agent за скъпи локални услуги.**

Продуктът спасява пропуснати обаждания и заявки. Когато фирма не отговори на телефон, Facebook/Instagram lead, контактна форма или WhatsApp съобщение, агентът реагира до 60 секунди, квалифицира клиента, събира нужните данни и записва оглед/консултация в календар.

Първата ниша трябва да е **климатици, термопомпи, дограма, солари, покриви и ремонти**, защото:

- заявките са с висока стойност;
- собствениците често са на обект и изпускат телефона;
- скоростта на отговор директно влияе на продажбата;
- клиентът разбира ROI без дълго обучение;
- 6 клиента по 499 евро правят почти 3000 евро MRR.

## Защо не generic AI chatbot

Generic чатботите са трудни за продажба, защото звучат като разход. Тук офертата е ясна:

> "Връщаме пропуснатите ви клиенти преди да отидат при конкурент."

Това е по-лесно за продажба от "AI автоматизация", защото клиентът вече знае болката: телефонът звъни, няма кой да вдигне, после клиентът намира друга фирма.

## Пазарни сигнали

- CallRail посочва, че средно 28% от бизнес обажданията остават без отговор и че това може да струва сериозни пропуснати приходи на малки и средни бизнеси: https://www.callrail.com/blog/missed-calls-costing-your-business
- Meta пусна Business Agent за WhatsApp, който отговаря на въпроси, квалифицира leads, записва срещи и може да затваря продажби. Това валидира посоката, но не решава локалната интеграция и нишовия sales процес: https://whatsappbusiness.com/blog/introducing-meta-business-agent-ai/
- Salesforce докладва силно AI adoption движение при SMB бизнеса и твърди, че 91% от SMB фирмите с AI казват, че AI повишава приходите им: https://www.salesforce.com/news/stories/smbs-ai-trends-2025/
- ServiceTitan отчита растеж и конкурентен натиск в residential services, включително HVAC, plumbing, roofing и други локални услуги: https://www.servicetitan.com/press/residential-industry-report-2025
- Vapi и Retell позволяват voice AI agent да се сглоби бързо без да строим цялата телефония от нула: https://vapi.ai/pricing и https://www.retellai.com/pricing
- Twilio има pay-as-you-go voice и WhatsApp инфраструктура, включително България voice rates и WhatsApp API pricing: https://www.twilio.com/en-us/voice/pricing/bg и https://www.twilio.com/en-us/whatsapp/pricing

## Първи target customer

Започваме с фирми, които отговарят на поне 4 от тези 6 условия:

1. Средна поръчка над 500 евро.
2. Имат телефон на сайта и Google Business Profile.
3. Имат поне 15-20 Google reviews.
4. Работят с огледи, консултации или монтажи.
5. Имат платени реклами или активен Facebook/Instagram.
6. Собственикът или малък екип отговаря на телефона, вместо отделен call center.

Първи вертикал: **климатици и термопомпи**.  
Втори вертикал: **дограма и външни щори**.  
Трети вертикал: **соларни системи и зарядни станции**.

## Оферта

Име за начало: **LeadSaver AI** или **NePropuskai.ai**.

Основно обещание:

> AI асистент, който реагира на пропуснати обаждания и нови заявки до 60 секунди, квалифицира клиента и записва оглед в календара ви.

Позициониране:

- не "чатбот";
- не "call center";
- не "замества служители";
- а "застраховка срещу пропуснати продажби".

## Pricing

Стартова цена:

- Setup: 750 евро еднократно.
- Месечно: 499 евро.
- Пилот: 14 дни срещу 150 евро refundable deposit или безплатен пилот само ако клиентът даде достъп до call log/формите и позволи case study.

Пакети след първите 3 клиента:

| Пакет | Цена | Подходящ за | Включва |
|---|---:|---|---|
| Recovery | 399 евро/месец | Малки фирми | Missed call SMS/WhatsApp, lead form response, Google Sheet CRM |
| Booking | 599 евро/месец | Фирми с огледи | Voice callback, qualification, calendar booking, weekly report |
| Growth | 899 евро/месец | Растящи фирми | Multi-channel, ad lead follow-up, pipeline dashboard, monthly optimization |

Път до 3000 евро:

- Консервативно: 6 клиента × 499 евро = 2994 евро MRR.
- По-добро: 4 клиента × 599 евро + 4 setup такси × 750 евро в първия месец = 2396 евро MRR + 3000 евро setup cash.
- След 90 дни: 8 клиента × средно 599 евро = 4792 евро MRR.

## Unit economics

При 1 клиент с 300 минути AI voice на месец:

- Voice platform: приблизително 0.05-0.31 долара/минута според Vapi/Retell setup.
- Twilio voice за България: зависи от посоката и типа номер; мобилни разговори са по-скъпи, затова трябва да се тества реален route.
- WhatsApp: Twilio такса около 0.005 долара на съобщение плюс Meta template такси според категорията.
- Google Calendar API: стандартната употреба е без допълнителна цена в рамките на quota.
- n8n/Supabase/hosting: ниски фиксирани разходи при първите клиенти.

Груба цел: gross margin над 70%.  
Ако voice minutes станат скъпи, ограничаваме AI voice до missed/after-hours и местим част от follow-up към SMS/WhatsApp.

## MVP scope

MVP не е пълна receptionist система. MVP е "lead recovery layer".

Включва:

1. **Missed call capture**
   - Вариант A: клиентът пренасочва unanswered calls към наш номер.
   - Вариант B: клиентът ни праща missed call notification чрез съществуващ VoIP/CRM.
   - Вариант C: за пилот ръчно качваме call log веднъж дневно, ако техническата интеграция бави продажбата.

2. **Instant follow-up**
   - SMS/WhatsApp: "Здравейте, опитахте да се свържете с [фирма]. За какво е заявката?"
   - AI voice callback само когато качеството на българския voice е приемливо.

3. **Qualification**
   - Име.
   - Телефон.
   - Град/адрес.
   - Тип услуга.
   - Спешност.
   - Снимки, ако каналът позволява.
   - Удобно време за оглед.

4. **Booking**
   - Google Calendar event.
   - Уведомление към собственика по email/WhatsApp/SMS.
   - Запис в Google Sheet/Supabase.

5. **Weekly ROI report**
   - Нови заявки.
   - Спасени пропуснати обаждания.
   - Записани огледи.
   - Неуспешни контакти.
   - Потенциален pipeline value.

## Архитектура

Първа версия:

- Landing page: Next.js или статичен HTML.
- Automation: n8n.
- Voice: Vapi или Retell.
- Telephony: Twilio, или локален VoIP provider ако Twilio Bulgaria номерата/цената са проблем.
- Messaging: Twilio SMS/WhatsApp, като WhatsApp се използва за customer support и конкретна бизнес заявка, не като general-purpose AI assistant.
- Data: Google Sheets за първите 3 клиента, Supabase след това.
- Calendar: Google Calendar.
- Dashboard: първо Google Looker Studio или прост Next.js admin.

Важна WhatsApp бележка: Meta ограничава general-purpose AI chatbot distribution през WhatsApp Business API, но customer support ботове за конкретен бизнес use case остават различен случай. Затова продуктът трябва да е позициониран и реализиран като помощник за конкретен бизнес, не като публичен AI assistant.

## Build план: 10 дни

Ден 1:

- Избор на име и домейн.
- Тест на Bulgarian STT/TTS във Vapi и Retell.
- Решение: voice-first или message-first MVP.

Ден 2:

- Създаване на демо сценарий за климатици/термопомпи.
- n8n flow: new lead -> AI qualification -> Google Sheet -> Calendar -> owner notification.

Ден 3:

- Twilio/Vapi/Retell телефонен demo number.
- Missed call simulation.
- Recording/transcript.

Ден 4:

- Landing page с 1 оферта, 1 demo video, 1 CTA.
- Pricing: "Пилот за 14 дни".

Ден 5:

- Dashboard template.
- Weekly report template.
- Case study template.

Ден 6-7:

- 100 prospect list от Google Maps за София, Пловдив, Варна, Бургас.
- 20 персонализирани Loom demos.

Ден 8-10:

- Outreach.
- 10 sales calls.
- Цел: 1 платен пилот.

## Sales процес

Не продаваме с "искате ли AI?". Продаваме с audit.

Стъпка 1: намираме фирма.

Стъпка 2: проверяваме:

- има ли телефон;
- има ли форма;
- има ли Facebook/Instagram ads или активни posts;
- има ли reviews;
- може ли да пропуска заявки извън работно време.

Стъпка 3: пращаме кратко съобщение:

> Здравейте, видях че приемате заявки за [климатици/термопомпи/дограма]. Правим AI асистент, който връща пропуснати обаждания и нови заявки до 60 секунди, задава правилните въпроси и записва оглед в календара. Идеята е да не губите клиент, когато сте на обект или извън работно време. Мога да ви покажа 2-минутно демо за вашия тип заявки?

Стъпка 4: ако отговорят, не правим дълга презентация. Показваме:

- пропуснат call;
- автоматичен follow-up;
- 5 въпроса за qualification;
- calendar booking;
- owner notification;
- weekly report.

Стъпка 5: оферта:

> Пускаме ви 14-дневен пилот. Ако не донесе поне 1 допълнителна квалифицирана заявка, не продължаваме. Ако работи, оставате на 499 евро/месец.

## Sales objection handling

"Имаме човек, който вдига телефона."

Отговор:

> Чудесно. Това не го заменя. Системата покрива само моментите, когато човекът не може да вдигне, когато е извън работно време, или когато lead-ът идва от реклама и трябва бърз отговор.

"Клиентите няма да говорят с AI."

Отговор:

> Затова MVP-то е lead recovery, не пълен call center. Започваме с кратък follow-up и квалификация. Ако voice не работи добре за вашите клиенти, използваме SMS/WhatsApp и ви пращаме само готови заявки.

"Скъпо е."

Отговор:

> Ако една продадена термопомпа/дограма/соларна система струва повече от месечната такса, трябва да спасим само една допълнителна сделка на месец. Пилотът е точно за да го докажем с ваши реални заявки.

"Ние нямаме много пропуснати обаждания."

Отговор:

> Тогава ще го видим в пилота. Ако няма пропуснати заявки, няма смисъл да плащате. Ако има, ще ги видите в отчета.

## Рискове и решения

| Риск | Какво правим |
|---|---|
| Bulgarian voice quality не е достатъчно добра | Започваме message-first: SMS/WhatsApp + кратки structured flows, voice само за демо и после за клиенти, където работи |
| Twilio Bulgaria numbers са скъпи/ограничени | Използваме локален VoIP provider или интеграция с existing missed call notifications |
| WhatsApp policy риск | Не правим general-purpose assistant; правим customer support/lead qualification за конкретна фирма; SMS fallback |
| Клиентът няма CRM | Google Sheet + Calendar са достатъчни за първите клиенти |
| Собственикът не иска сложен setup | Пилотът работи с минимален redirect или дори с lead forms преди phone integration |
| Много конкуренция | Вертикализираме: скриптове, отчети и demo за климатици/термопомпи първо |

## Какво не строим първо

- Пълен SaaS dashboard с login, billing, permissions.
- Marketplace.
- CRM replacement.
- Сложни AI agents, които правят всичко.
- Генерална chatbot платформа за всички индустрии.
- Мобилно приложение.

Първо продаваме, после продуктализираме повтарящото се.

## 14-дневен execution план

### Седмица 1 - demo и offer

1. Тествай Bulgarian voice във Vapi и Retell.
2. Избери message-first или voice-first MVP.
3. Направи демо за "фирма за климатици".
4. Направи landing page.
5. Направи 2-минутно video demo.
6. Подготви Google Sheet pipeline.
7. Подготви пилотен договор/условия.

### Седмица 2 - sales

1. Събери 150 prospects.
2. Прати 50 персонализирани съобщения.
3. Обади се на 30 фирми.
4. Запиши 10 демо срещи.
5. Затвори 1-2 платени пилота.
6. Инсталирай първия клиент ръчно, без излишна автоматизация.

## 90-дневен план

Дни 1-14:

- 1-2 платени пилота.
- Цел: валидиран problem/offer.

Дни 15-30:

- 3 платени клиента.
- Първи case study.
- Първа версия на vertical script library.

Дни 31-60:

- 6 клиента.
- 3000 евро MRR.
- Пакетирани onboarding steps.

Дни 61-90:

- 8-10 клиента.
- Наемане на part-time appointment setter или closer.
- Начало на outbound към Румъния/Гърция/UK niche agencies, ако България е тясна.

## Метрики

Вътрешни:

- reply rate от outreach;
- demo booking rate;
- pilot close rate;
- activation time;
- gross margin per client.

Клиентски:

- missed calls detected;
- leads recovered;
- appointments booked;
- appointment show rate;
- deals won;
- estimated recovered revenue.

North star metric:

> Qualified appointments booked from leads that otherwise would have been missed.

## Конкретна следваща стъпка

Преди да строим дълго, трябва да докажем две неща:

1. Българският voice agent е достатъчно разбираем за кратки calls.
2. Собственици на high-ticket service фирми ще приемат пилот срещу 150-750 евро.

Затова следващата реална задача е:

**Да направим демо flow за фирма за климатици/термопомпи и 1-page landing page, след което да изпратим 50 outreach съобщения.**

Ако след 50 съобщения няма поне 3 разговора, сменяме niche или offer. Ако има 3 разговора, затваряме първи пилот и не губим време с допълнителен продукт.

