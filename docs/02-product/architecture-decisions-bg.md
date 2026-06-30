# Архитектурни решения (заключени 2026-06-30)

Решения от продуктовата дискусия, които управляват Phase 2 (auth) и Phase 4 (Agent Builder).

## 1. Промпт: обща база + per-client overlay
- **Един универсален базов промпт** (вече активен във Vapi — v2). Не е вързан за конкретна индустрия;
  пита за услугата в свободен текст.
- **Тънък client overlay** за всяка фирма (име, услуги, райони, работно време, guardrails, специфики).
  Базата не се пипа никога — различното е само overlay-ът.
- HVAC е просто един overlay, не специален случай.

## 2. Agent Builder: чернова + изричен „Публикувай"
- Per-client настройките се пазят в Supabase (`agent_settings`, по `organization_id`).
- UI: клиентът редактира (промпт overlay, часове, услуги, guardrails) → вижда preview → натиска
  **Публикувай** → server сглобява финалния промпт (база + overlay) и прави `PATCH` към техния Vapi assistant.
- Механиката е същата като `apps/web/scripts/vapi/apply-prompt.mjs`, но per-client и от UI.
- **Не** авто-push на всяка промяна — изричен Publish (по-безопасно, прегледно).

## 3. Документи / Knowledge Base
- Vapi поддържа Knowledge Base (RAG от файлове). Клиентът качва документ (напр. ценова листа) през app →
  app го качва във Vapi KB → закача към техния assistant.
- **Guardrail-ите стават настройка, не фиксирани:** HVAC = „не давам цени"; търговски консултант =
  „давай цени от листата". Per-industry чрез overlay-а.
- Телефонна реалност: прости отговори на глас; сложни таблици → кратко устно + изпрати по SMS/имейл.

## 4. Провизиране на клиент (Vapi assistant + номер)
- Модел: 1 организация = 1 Vapi assistant (клон от темплейт) + 1 номер; всичко в Supabase с `organization_id`.
- **Сега (първи клиенти): ръчно ние** — създаваме assistant + номер + seed редовете в Supabase
  (`organizations`, `phone_numbers`, `assistants`). App-ът управлява само конфигурацията.
- **По-късно (scale):** автоматизирано onboarding през app (Vapi API създава assistant + провизира номер).
- Резолюция по входящ номер вече е скелетирана в `apps/web/src/app/api/vapi/end-of-call/route.ts`.

## Следствие за реда
Всичко „per-client" (overlay, KB, конфиг) стъпва на организации + auth. Затова **Phase 2 (auth +
multi-tenancy) е следващата стъпка** и е предпоставка за Phase 4 (Agent Builder).
