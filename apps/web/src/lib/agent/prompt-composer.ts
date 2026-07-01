// Pure prompt composition (no DB, no Next imports -> unit-testable via transpile/data-URL).
// system_prompt = base_prompt + generated "Бизнес контекст" (from facts) + "Твърди правила" (guardrails).
// Prices are intentionally NEVER rendered (Phase 4c/Knowledge Base unlocks spoken prices).

type ServiceFact = { name: string; description?: string | null; status: string };
type HoursFact = { weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };
type AreaFact = { city: string; region?: string | null; status: string };
type DocFact = { kind: string; status: string };
const KB_TOOL_NAME = "business_docs";

// Fallback only for assistants with no stored base_prompt (existing rows are seeded by migration 004).
export const DEFAULT_BASE_PROMPT =
  "Ти си изключително любезен телефонен рецепционист за фирма за услуги. Говориш кратко и вежливо на " +
  "български и записваш часове и заявки точно. Не казвай цени по телефона — предложи да изпратите оферта.";

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
    lines.push(`Ако клиентът пита за цена, използвай \`${KB_TOOL_NAME}\`, за да намериш цената в ценовата листа, и я кажи.`);
  } else {
    lines.push(`Не казвай точни цени по телефона. Кажи, че колегите ще изготвят оферта или ще уточните цената на консултацията/срещата.`);
  }
  const header = hasDocs ? "## Документи и цени" : "## Цени";
  return `${header}\n${lines.join("\n")}`;
}

export function composeSystemPrompt(input: {
  base: string;
  businessContext: string;
  knowledge?: string | null;
  guardrails?: string | null;
}): string {
  const base = (input.base ?? "").trim() || DEFAULT_BASE_PROMPT;
  const sections = [base];
  if (input.businessContext && input.businessContext.trim()) sections.push(input.businessContext.trim());
  const knowledge = (input.knowledge ?? "").trim();
  if (knowledge) sections.push(knowledge);
  const guard = (input.guardrails ?? "").trim();
  if (guard) sections.push(`## Твърди правила (спазвай ги с най-висок приоритет)\n${guard}`);
  return sections.join("\n\n");
}
