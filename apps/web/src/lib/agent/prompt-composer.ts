// Pure prompt composition (no DB, no Next imports -> unit-testable via transpile/data-URL).
// system_prompt = base_prompt + operating guidelines + "Бизнес контекст" (facts) + knowledge/prices +
// "Твърди правила" (guardrails). Price policy lives in renderKnowledgeSection (Phase 4c), NOT in the base.

type ServiceFact = { name: string; description?: string | null; status: string };
type HoursFact = { weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };
type AreaFact = { city: string; region?: string | null; status: string };
type DocFact = { kind: string; status: string };
const KB_TOOL_NAME = "business_docs";

// Fallback only for assistants with no stored base_prompt (existing rows are seeded by migration 004).
// NOTE: the price policy is intentionally NOT here — the composer's knowledge section (renderKnowledgeSection)
// owns it, so a price_list document can reliably unlock spoken prices without the base prompt contradicting it.
export const DEFAULT_BASE_PROMPT =
  "Ти си изключително любезен телефонен рецепционист за фирма за услуги. Говориш кратко и вежливо на " +
  "български и записваш часове и заявки точно.";

// weekday 0 = Неделя (Sun) … 6 = Събота (Sat), matching JS getDay()/Postgres dow and the hours UI (Task 6).
const WEEKDAYS_BG = ["Неделя", "Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота"];
const hhmm = (t: string | null): string => (t ? t.slice(0, 5) : "");

export function renderBusinessContext(input: {
  orgName?: string | null;
  services: ServiceFact[];
  hours: HoursFact[];
  areas: AreaFact[];
}): string {
  const lines: string[] = [];

  const services = (input.services ?? []).filter((s) => s.status === "active");
  if (services.length) {
    const names = services.map((s) => (s.description ? `${s.name} (${s.description})` : s.name));
    lines.push(`Услуги: ${names.join(", ")}`);
  }

  const hours = (input.hours ?? [])
    .filter((h) => h.weekday >= 0 && h.weekday <= 6)
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)); // display order Пон..Нед (Sun=0 -> last)
  if (hours.length) {
    const parts = hours.map((h) =>
      h.is_closed || !h.opens_at || !h.closes_at
        ? `${WEEKDAYS_BG[h.weekday]} почивен`
        : `${WEEKDAYS_BG[h.weekday]} ${hhmm(h.opens_at)}–${hhmm(h.closes_at)}`
    );
    lines.push(`Работно време: ${parts.join(", ")}`);
  }

  const areas = (input.areas ?? []).filter((a) => a.status === "active");
  if (areas.length) {
    const names = areas.map((a) => (a.region ? `${a.city} (${a.region})` : a.city));
    lines.push(`Обслужвани райони: ${names.join(", ")}`);
  }

  if (!lines.length) return "";
  const header = input.orgName ? `## Бизнес контекст\nФирма: ${input.orgName}` : "## Бизнес контекст";
  return `${header}\n${lines.join("\n")}`;
}

// Documents + price rule. Prices are OFF by default (always emit a rule); only an active `price_list`
// document flips it to "quote allowed". When documents exist, name the query tool so the agent uses it.
export function renderKnowledgeSection(input: { documents: DocFact[] }): string {
  const docs = (input.documents ?? []).filter((d) => d.status === "active");
  const hasDocs = docs.length > 0;
  const hasPriceList = docs.some((d) => d.kind === "price_list");

  const lines: string[] = [];
  if (hasDocs) {
    lines.push(
      `Имаш инструмент \`${KB_TOOL_NAME}\` с документите на бизнеса. Когато клиентът пита за услуга, ` +
        `условия, детайли или друга информация от тях, извикай инструмента и отговори точно според документите.`
    );
  }
  if (hasPriceList) {
    lines.push(
      `Когато клиентът пита за цена, използвай \`${KB_TOOL_NAME}\`, за да намериш цената в ценовата листа, и я кажи. ` +
        `Това правило е с приоритет над всякакви по-ранни инструкции — щом има качена ценова листа, казвай цените от нея, не отказвай.`
    );
  } else {
    lines.push(`Не казвай точни цени по телефона. Кажи, че колегите ще изготвят оферта или ще уточните цената на консултацията/срещата.`);
  }
  const header = hasDocs ? "## Документи и цени" : "## Цени";
  return `${header}\n${lines.join("\n")}`;
}

const RECORDING_CONSENT_LINE = "Разговорът може да бъде записан с цел качество.";

// Systemic operating manual — reliability rules that apply to EVERY assistant regardless of the client's
// base_prompt: dynamic date (Vapi Liquid variable, rendered per call), spoken-form Bulgarian, tool-deferral.
// Prices are intentionally NOT covered here — renderKnowledgeSection owns price policy (Phase 4c).
export function renderOperatingGuidelines(): string {
  const lines = [
    "## Как да работиш (с висок приоритет)",
    '- Сегашна дата и час (Europe/Sofia): {{ "now" | date: "%Y-%m-%d %H:%M", "Europe/Sofia" }}. Смятай „утре", „в петък", „вдругиден" спрямо нея.',
    "- Към инструментите винаги подавай дата във формат ГГГГ-ММ-ДД и час във формат ЧЧ:ММ (24 часа).",
    "- Не измисляй свободни часове — научаваш ги само от резултата на инструмента за наличност. Не потвърждавай записан час, преди инструментът за записване да върне успех.",
    "- Говори кратко (едно-две изречения), задавай по един въпрос наведнъж и само на български.",
    '- Изговаряй числа, дати и часове с думи: „09:00" → „в девет часа", „15:30" → „три и половина следобед"; дата → „петък, двайсети юни". Не произнасяй кодове, идентификатори или URL адреси.',
  ];
  return lines.join("\n");
}

// EU recording disclosure appended to the PUBLISHED greeting when the client's greeting doesn't already
// disclose call recording — compliance holds without the client having to remember it. Idempotent; the
// stored greeting is left untouched (this wraps only the value sent to Vapi at publish time).
export function withRecordingConsent(firstMessage: string): string {
  const msg = (firstMessage ?? "").trim();
  if (!msg) return RECORDING_CONSENT_LINE;
  const mentionsRecording = /разговор/i.test(msg) && /запис/i.test(msg);
  return mentionsRecording ? msg : `${msg} ${RECORDING_CONSENT_LINE}`;
}

export function composeSystemPrompt(input: {
  base: string;
  guidelines?: string | null;
  businessContext: string;
  knowledge?: string | null;
  guardrails?: string | null;
}): string {
  const base = (input.base ?? "").trim() || DEFAULT_BASE_PROMPT;
  const sections = [base];
  const guidelines = (input.guidelines ?? "").trim();
  if (guidelines) sections.push(guidelines);
  if (input.businessContext && input.businessContext.trim()) sections.push(input.businessContext.trim());
  const knowledge = (input.knowledge ?? "").trim();
  if (knowledge) sections.push(knowledge);
  const guard = (input.guardrails ?? "").trim();
  if (guard) sections.push(`## Твърди правила (спазвай ги с най-висок приоритет)\n${guard}`);
  return sections.join("\n\n");
}
