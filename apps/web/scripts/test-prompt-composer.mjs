// Unit tests for the pure prompt composer (no DB, no network). Transpile TS + import via data URL,
// same harness as test-lead-form.mjs. Run (from apps/web): node ./scripts/test-prompt-composer.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadModule(relParts) {
  const src = path.join(process.cwd(), ...relParts);
  if (!existsSync(src)) throw new Error(`Missing module: ${src}`);
  const code = ts
    .transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: false },
    })
    .outputText.replace(/^\s*import\s[^;]*;\s*$/gm, "");
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

const { renderBusinessContext, composeSystemPrompt, renderKnowledgeSection, renderOperatingGuidelines, withRecordingConsent } =
  await loadModule(["src", "lib", "agent", "prompt-composer.ts"]);

// renderBusinessContext: active-only, NO prices, empty sections omitted
const ctx = renderBusinessContext({
  orgName: "Демо ЕООД",
  services: [
    { name: "Монтаж", description: "на климатик", status: "active" },
    { name: "Профилактика", description: null, status: "active" },
    { name: "Стар", description: null, status: "archived" },
  ],
  hours: [
    { weekday: 2, opens_at: "09:00:00", closes_at: "18:00:00", is_closed: false },
    { weekday: 6, opens_at: null, closes_at: null, is_closed: true },
  ],
  areas: [
    { city: "София", region: "Люлин", status: "active" },
    { city: "Скрит", region: null, status: "paused" },
  ],
});
assert.ok(ctx.includes("## Бизнес контекст"), "has header");
assert.ok(ctx.includes("Демо ЕООД"), "org name");
assert.ok(ctx.includes("Монтаж") && ctx.includes("Профилактика"), "active services listed");
assert.ok(!ctx.includes("Стар"), "archived service omitted");
assert.ok(!/\d+(\.\d+)?\s*(лв|EUR|BGN|€)/.test(ctx), "no prices rendered");
assert.ok(ctx.includes("Вторник") && ctx.includes("09:00") && ctx.includes("18:00"), "hours rendered (weekday 2 = Вторник)");
assert.ok(ctx.includes("почивен"), "closed day rendered");
assert.ok(ctx.includes("София") && ctx.includes("Люлин"), "active area with region");
assert.ok(!ctx.includes("Скрит"), "paused area omitted");

// empty facts -> empty string (no dangling header)
assert.equal(renderBusinessContext({ orgName: "X", services: [], hours: [], areas: [] }), "", "empty facts -> empty context");

// composeSystemPrompt: ordering, omit empty, base-only fallback
const composed = composeSystemPrompt({ base: "BASE", businessContext: "## Бизнес контекст\nУслуги: A", guardrails: "Не псувай." });
assert.ok(composed.startsWith("BASE"), "base first");
assert.ok(composed.indexOf("## Бизнес контекст") > composed.indexOf("BASE"), "context after base");
assert.ok(composed.indexOf("Твърди правила") > composed.indexOf("## Бизнес контекст"), "guardrails last");
assert.ok(composed.includes("Не псувай."), "guardrails body included");

assert.equal(composeSystemPrompt({ base: "ONLY", businessContext: "", guardrails: "" }), "ONLY", "base-only when nothing else");
assert.ok(!composeSystemPrompt({ base: "B", businessContext: "", guardrails: "G" }).includes("Бизнес контекст"), "no empty context section");

// --- renderKnowledgeSection: prices OFF by default; a price_list document unlocks quoting ---
const k0 = renderKnowledgeSection({ documents: [] });
assert.ok(k0.includes("## Цени"), "no docs -> price header");
assert.ok(!k0.includes("business_docs"), "no tool instruction without docs");
assert.ok(/оферта|консултаци/.test(k0), "no docs -> deflect prices");

const k1 = renderKnowledgeSection({ documents: [{ kind: "general", status: "active" }] });
assert.ok(k1.includes("## Документи и цени"), "docs -> docs header");
assert.ok(k1.includes("business_docs"), "docs -> tool instruction present");
assert.ok(/оферта|консултаци/.test(k1), "general doc only -> still deflect prices");

const k2 = renderKnowledgeSection({ documents: [{ kind: "price_list", status: "active" }, { kind: "general", status: "active" }] });
assert.ok(k2.includes("business_docs"), "price list -> tool instruction");
assert.ok(/цена/i.test(k2) && !/Не казвай точни цени/.test(k2), "price list -> quoting allowed, no deflection");

const k3 = renderKnowledgeSection({ documents: [{ kind: "price_list", status: "archived" }] });
assert.ok(/Не казвай точни цени/.test(k3), "archived price list -> still deflect");
assert.ok(!k3.includes("business_docs"), "archived doc -> no tool instruction");

// composeSystemPrompt places knowledge between context and guardrails
const composedK = composeSystemPrompt({ base: "BASE", businessContext: "## Бизнес контекст\nУслуги: A", knowledge: "## Цени\nX", guardrails: "G" });
assert.ok(composedK.indexOf("## Цени") > composedK.indexOf("## Бизнес контекст"), "knowledge after context");
assert.ok(composedK.indexOf("Твърди правила") > composedK.indexOf("## Цени"), "guardrails after knowledge");
assert.equal(composeSystemPrompt({ base: "ONLY", businessContext: "", guardrails: "" }), "ONLY", "no knowledge arg -> base only (4b behaviour intact)");

// --- renderOperatingGuidelines: systemic reliability rules; dynamic date; spoken BG; NO prices ---
const g = renderOperatingGuidelines();
assert.ok(/\{\{\s*"now"\s*\|\s*date:/.test(g), "guidelines embed the Vapi dynamic-date Liquid variable");
assert.ok(g.includes("Europe/Sofia"), "date uses Sofia timezone");
assert.ok(/ГГГГ-ММ-ДД/.test(g) && /ЧЧ:ММ/.test(g), "tool date/time formats stated");
assert.ok(/Не измисляй свободни часове/i.test(g), "tool-deferral: no invented availability");
assert.ok(g.includes("девет часа"), "spoken-form BG example present");
assert.ok(!/цена|оферт/i.test(g), "guidelines must NOT touch prices (knowledge section owns that)");

// composeSystemPrompt with guidelines: base -> guidelines -> context -> knowledge -> guardrails
const composedG = composeSystemPrompt({
  base: "BASE",
  guidelines: "## Как да работиш\nGUIDE",
  businessContext: "## Бизнес контекст\nУслуги: A",
  knowledge: "## Цени\nX",
  guardrails: "G",
});
assert.ok(composedG.indexOf("Как да работиш") > composedG.indexOf("BASE"), "guidelines after base");
assert.ok(composedG.indexOf("## Бизнес контекст") > composedG.indexOf("Как да работиш"), "context after guidelines");
assert.ok(composedG.indexOf("## Цени") > composedG.indexOf("## Бизнес контекст"), "knowledge after context");
assert.equal(composeSystemPrompt({ base: "ONLY", businessContext: "", guardrails: "" }), "ONLY", "no guidelines arg -> base only (backward compat)");

// --- withRecordingConsent: EU recording disclosure, appended when absent, idempotent when present ---
const consented = withRecordingConsent("Здравейте! Аз съм Алекс.");
assert.ok(consented.startsWith("Здравейте! Аз съм Алекс."), "keeps the original greeting");
assert.ok(/разговор/i.test(consented) && /запис/i.test(consented), "adds a recording-consent clause");
const alreadyConsented = "Добре дошли! Разговорът може да бъде записан с цел качество. Как да помогна?";
assert.equal(withRecordingConsent(alreadyConsented), alreadyConsented, "does not duplicate consent when already disclosed");
assert.ok(/запис/i.test(withRecordingConsent("")), "empty greeting still yields a consent line");
assert.ok(
  /цел качество/.test(withRecordingConsent("Здравейте, обадихте се за записване на час.")),
  "‘записване на час’ is not recording consent -> still appends"
);

console.log("prompt-composer checks passed");
