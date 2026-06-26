# Vapi Setup Checklist за AI Receptionist

Дата: 2026-06-24  
Цел: да подготвим Vapi assistant, който вдига обаждания от Zadarma Sofia номер, говори на български, събира информация и записва часове.

## Какво правиш сега, преди Zadarma номерът да е активен

### 1. Създай Vapi акаунт

- Отиди в Vapi dashboard: https://dashboard.vapi.ai
- Създай account/organization.
- Ако има избор на регион, избери EU organization, защото работим с европейски клиенти.

### 2. Добави малък billing credit

За тестове не ни трябва голям бюджет.

Начален credit:

```text
$10-$30
```

Това стига за първите тестови разговори. Не купувай скъпи номера от Vapi засега.

### 3. Вземи Private Key, но не го пращай в chat

Във Vapi:

```text
Organization Settings -> API Keys -> Private Key
```

Не го пращай в чат. Когато започнем build-а, ще го сложим в `.env`:

```text
VAPI_PRIVATE_KEY=...
```

### 4. Създай първи Assistant

Във Vapi:

```text
Assistants -> Create Assistant
```

Име:

```text
LeadSaver HVAC Receptionist BG
```

Първа цел:

```text
Да приема обаждания за климатици и термопомпи, да събира информация и да записва оглед или обратен разговор.
```

### 5. System prompt за assistant-а

Сложи този prompt:

```text
Ти си телефонен асистент за фирма за климатици и термопомпи.

Говори на български, кратко, спокойно и професионално.
Отговаряй с кратки изречения.
Задавай по един въпрос наведнъж.

Целта ти е да събереш информация за заявка и да организираш оглед или обратен разговор.

Събери:
1. име;
2. телефон за връзка;
3. град и квартал;
4. тип услуга: монтаж, ремонт, профилактика, термопомпа или оферта;
5. тип имот: апартамент, къща, офис или магазин;
6. кратко описание;
7. спешност;
8. удобно време за оглед или обратен разговор.

Не давай финална цена.
Не обещавай наличност.
Не обещавай конкретен срок за монтаж.
Не прави техническа диагностика.
Не приемай плащания.

Ако клиентът пита за цена, кажи:
"Мога да събера информацията, за да ви върнат точна оферта."

Ако клиентът е ядосан, има гаранционен проблем или настоява за човек, кажи:
"Разбирам. Ще предам на екипа да се свърже с вас приоритетно."
След това маркирай разговора като нужда от човешка намеса.

Когато имаш достатъчно информация, потвърди кратко:
"Благодаря. Записах заявката и ще я предам на екипа."
```

### 6. Избери voice/model настройки

Тествай поне 2-3 гласа. Критерии:

- разбираем български;
- не говори прекалено бързо;
- не звучи прекалено роботизирано;
- не прекъсва клиента често.

Не търсим перфектен глас. Търсим достатъчно добър за записване на часове.

### 7. Test в dashboard-а

Преди телефонен номер:

- Натисни `Talk to Assistant` или equivalent test call в dashboard-а.
- Проведи разговор на български.
- Тествай тези 5 сценария:
  - монтаж на климатик;
  - термопомпа за къща;
  - ремонт;
  - въпрос за цена;
  - ядосан клиент.

Ако assistant-ът дава цени или обещава срокове, prompt-ът трябва да се затегне.

## Какво правим, когато Zadarma номерът стане активен

### 8. Вземаме Zadarma данните

От Zadarma ще трябват:

```text
Virtual number: +3592...
SIP server: sip.zadarma.com
SIP number/login: ...
SIP password: ...
```

SIP password не се праща в chat.

### 9. Добавяме Zadarma SIP credentials във Vapi

Vapi има официална Zadarma SIP интеграция. Обикновено се прави през API request.

Ако organization-ът е US:

```text
https://api.vapi.ai
```

Ако organization-ът е EU:

```text
https://api.eu.vapi.ai
```

Примерен request:

```bash
curl -X POST "$VAPI_API_BASE_URL/credential" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_VAPI_PRIVATE_KEY" \
  -d '{
    "provider": "byo-sip-trunk",
    "name": "Zadarma Trunk",
    "gateways": [{
      "ip": "sip.zadarma.com",
      "inboundEnabled": false
    }],
    "outboundLeadingPlusEnabled": true,
    "outboundAuthenticationPlan": {
      "authUsername": "YOUR_ZADARMA_SIP_NUMBER",
      "authPassword": "YOUR_ZADARMA_SIP_PASSWORD"
    }
  }'
```

Vapi ще върне `credentialId`. Запазваме го.

### 10. Добавяме Zadarma virtual number във Vapi

```bash
curl -X POST "$VAPI_API_BASE_URL/phone-number" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_VAPI_PRIVATE_KEY" \
  -d '{
    "provider": "byo-phone-number",
    "name": "Zadarma Sofia Number",
    "number": "3592XXXXXXX",
    "numberE164CheckEnabled": false,
    "credentialId": "YOUR_CREDENTIAL_ID"
  }'
```

Важно: във Vapi примерите понякога номерът се подава без `+`. Ще го тестваме точно според API response-а.

### 11. Assign assistant към номера

Във Vapi dashboard:

```text
Build / Phone Numbers -> Zadarma Sofia Number -> Inbound Settings -> Assistant
```

Избираш:

```text
LeadSaver HVAC Receptionist BG
```

Ако има Outbound Form/Outbound Settings, също го assign-ваме към същия assistant.

### 12. Настрой Zadarma да праща входящите calls към Vapi

В Zadarma:

```text
Settings -> Virtual phone numbers -> gear icon до номера -> External server
```

Enable:

```text
External server / SIP URI
```

За US Vapi:

```text
3592XXXXXXX@sip.vapi.ai
```

За EU Vapi:

```text
3592XXXXXXX@sip.eu.vapi.ai
```

### 13. Първи реален call test

Звъниш от мобилен към Zadarma Sofia номера.

Успех, ако:

- Vapi assistant-ът вдига;
- говори на български;
- не дава цени;
- събира данни;
- call transcript се появява във Vapi;
- call report се записва.

## Какво ще добавим след първия phone test

След като телефонът работи, добавяме tools към assistant-а:

```text
createLead
checkAvailability
bookAppointment
sendOwnerNotification
transferToHuman
```

Тези tools ще викат наш backend:

```text
POST /api/vapi/tools
POST /api/vapi/end-of-call
```

Backend-ът ще пише в:

- Supabase;
- Google Calendar;
- email/SMS notification.

Не добавяме tools преди да имаме публичен backend URL.

## Източници

- Vapi Assistants quickstart: https://docs.vapi.ai/assistants/quickstart
- Vapi Zadarma SIP integration: https://docs.vapi.ai/advanced/sip/zadarma
- Vapi SIP trunking: https://docs.vapi.ai/advanced/sip/sip-trunk
- Vapi Server URLs: https://docs.vapi.ai/server-url
- Vapi Server Events / tool calls: https://docs.vapi.ai/server-url/events

