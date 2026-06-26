# Zadarma AI Number Activation Checklist

Дата: 2026-06-24  
Цел: когато Zadarma Sofia номерът бъде активиран, да го вържем към AI voice agent и да направим първи реален call test.

## Какво чакаме от Zadarma

Когато номерът бъде активиран, трябва да имаме:

- активен Sofia номер във формат `+3592...`;
- достъп до Zadarma dashboard;
- SIP номер/login;
- SIP password;
- SIP server, обикновено `sip.zadarma.com`;
- потвърдение дали номерът е вързан към SIP connection или към Cloud PBX;
- възможност за call forwarding или SIP routing.

Не записвай SIP password в chat или публични файлове. Държим го в `.env` или secret manager.

## Активиран номер

Zadarma активира:

```text
+359 2 437 2749
```

За Vapi/Zadarma SIP URI тестове използваме номера без `+` и без интервали:

```text
35924372749
```

## Вариант A: Zadarma -> Vapi чрез BYO SIP trunk

Това е предпочитаният вариант, ако Vapi приеме Zadarma SIP trunk.

Стъпки:

1. В Zadarma взимаме SIP credentials:
   - SIP login;
   - SIP password;
   - server: `sip.zadarma.com`.

2. Във Vapi създаваме SIP trunk credential:
   - provider: BYO SIP trunk;
   - outbound host/realm: Zadarma SIP server;
   - auth username: SIP login;
   - auth password: SIP password.

3. Във Vapi създаваме assistant:
   - език: Bulgarian;
   - цел: receptionist/booking agent;
   - tools:
     - `createLead`;
     - `checkAvailability`;
     - `bookAppointment`;
     - `sendOwnerNotification`;
     - `transferToHuman`.

4. В Zadarma routing настройваме входящите обаждания към SIP/Vapi route.

5. Тест:
   - звъним от мобилен към Sofia номера;
   - AI агентът трябва да вдигне;
   - разговорът трябва да се запише/transcribe-не;
   - backend получава webhook;
   - Supabase получава lead.

## Вариант B: Zadarma -> call forwarding към Vapi/Retell номер

Това е fallback, ако SIP trunk връзката забави старта.

Стъпки:

1. Взимаме временен Vapi/Retell phone number.
2. В Zadarma включваме call forwarding от Sofia номера към този AI номер.
3. Всички входящи calls към Sofia номера се прехвърлят към AI agent.

Плюсове:

- по-лесно за старт;
- по-малко SIP debugging.

Минуси:

- може да има допълнителна цена за forwarded calls;
- по-малко контрол върху caller ID и SIP headers.

## Вариант C: Zadarma Cloud PBX -> extension -> AI route

Това е вариант, ако искаме:

- човешки оператор първо;
- AI само при no answer;
- различни работни времена;
- IVR.

Flow:

1. Клиент звъни на Zadarma Sofia номера.
2. Cloud PBX звъни към човек/extension.
3. Ако няма отговор след 15-20 секунди, PBX пренасочва към AI.
4. AI агентът обслужва клиента.

Това е най-подходящо за реален клиент, който иска да запази човешкия телефон първо.

## Първи test script

Когато номерът е активен, правим 5 тестови разговора:

### Test 1: Нов монтаж

Клиент:

> Здравейте, искам монтаж на климатик в София, Лозенец.

AI трябва да събере:

- име;
- телефон;
- квартал;
- нов монтаж;
- апартамент/офис;
- удобно време.

### Test 2: Термопомпа

Клиент:

> Трябва ми оферта за термопомпа за къща 160 квадрата в Банкя.

AI трябва да пита:

- има ли изградена инсталация;
- тип отопление;
- кога е удобно за оглед.

### Test 3: Ремонт

Клиент:

> Климатикът не духа студено, може ли някой да дойде?

AI трябва да събере:

- адрес;
- модел, ако клиентът знае;
- спешност;
- удобно време.

### Test 4: Цена

Клиент:

> Колко струва монтаж?

AI не трябва да дава финална цена. Трябва да каже:

> Мога да събера информацията, за да ви върнат точна оферта.

### Test 5: Ядосан клиент

Клиент:

> Монтирахте ми климатик и не работи, искам човек веднага.

AI трябва да маркира `needs_human` и да обещае предаване към екипа, без спор и без диагноза.

## Успешен тест

Интеграцията е успешна, ако:

- Sofia номерът звъни;
- AI агентът вдига;
- разбира български приемливо;
- задава кратки въпроси;
- не дава цена;
- създава lead в Supabase;
- може да запише или предложи час;
- собственикът получава notification;
- имаме transcript/summary след разговора.

## Ако не стане от първи път

Ред за debugging:

1. Тествай Zadarma номера със softphone.
2. Ако softphone работи, проблемът е Vapi/Retell SIP config.
3. Ако softphone не работи, проблемът е Zadarma activation/SIP credentials.
4. Ако входящият call стига до AI, но няма webhook, проблемът е в backend endpoint.
5. Ако AI говори лошо български, сменяме Vapi/Retell voice/STT provider или минаваме message-first.
