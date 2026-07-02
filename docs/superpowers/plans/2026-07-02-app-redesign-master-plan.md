# App Redesign — Master Plan

**Date:** 2026-07-02
**Goal:** Re-skin the entire AI Receptionist app to a premium, cohesive, light visual language — **without changing any functionality**.
**Deploy:** push to `main` → Vercel. Solo founder.

Inspiration: the user's Claude Design mock (decoded, used as *direction only* — its demo data and exact screens are NOT copied). Guidance engine: the `ui-ux-pro-max` skill.

---

## 0. Guardrails (non-negotiable)

- **Zero functional change.** This is a presentational re-skin. Do NOT touch: server actions, data fetching, Supabase/Vapi/Resend/Zadarma logic, route structure, form-submit handlers, business logic, auth/RLS.
- **"Move something only if it's better AND won't break anything."** Any layout/interaction change needs a clear UX win and must preserve every input, handler, prop, and data shape.
- **Generic.** No demo data (Климатроник etc.). Must work for any business.
- **Our menu & routes stay ours.** Navigation structure is unchanged; only its styling changes.
- **Additive.** Extend the existing design system (CSS variables, `syn-card`/`card-lift`, `PageHeader`) — do not rewrite it.
- **Every phase ends green:** `tsc` + `next build` pass, and the screen's key flows are manually verified working before moving on.

---

## 1. Design system (agreed spec)

Premium via **restraint** — warm neutral base, generous whitespace, one accent, data on mono.

### Accent — a single, swappable token
- Currently trying **Indigo**: `50 #eef2ff · 100 #e0e7ff · 200 #c7d2fe · 400 #818cf8 · 500 #6366f1 · 600 #4f46e5 (primary) · 700 #4338ca (hover)`.
- Alternative (one-token swap): **Emerald** `600 #059669 / 700 #047857`.
- The accent lives in **one** token pair (`--accent` / `--accent-strong`); changing hue = editing token values only. No component edits.

### Neutrals (warm)
`canvas #faf9f7 · card #ffffff · subtle #f5f5f4 · border #e7e5e4 · muted #78716c · secondary #57534e · ink #1c1917`

### Semantic (never color-only — always pair with icon/label)
- Success emerald `#059669` / bg `#d1fae5` / text `#065f46`
- Warning amber `#b45309` / bg `#fef3c7` / text `#78350f`
- Danger red `#dc2626` / bg `#fee2e2` / text `#7f1d1d`
- Info blue `#2563eb` / bg `#dbeafe` / text `#1e3a8a`

### Typography
- **Inter** for UI (400/500/600/700), **JetBrains Mono** for numbers/metrics/phones (tabular figures). `font-display: swap`. Scale: 12 / 13 / 14 / 16 / 18 / 22 / 30.

### Effects (soft-flat)
- Radius: 8 (controls) / 12 (cards) / 999 (pills).
- Elevation: rest = hairline border, no shadow; hover-lift = subtle shadow + `translateY(-2px)`; floating (menus/modals) = soft shadow. No gradients.
- Motion: 150–200ms ease-out; respect `prefers-reduced-motion`.
- Focus: visible 2px accent ring.

### Quality bar (from ui-ux-pro-max)
WCAG AA contrast (≥4.5:1), visible focus, keyboard nav, skip-link, heading hierarchy, loading skeletons >300ms, sticky-nav padding, `cursor-pointer`, empty states, tables (hover rows + tabular numerals + horizontal-scroll wrapper + sortable), **one primary CTA per screen**.

---

## 2. Architecture / where things live

- **Tokens:** central theme CSS (globals). Extend existing `--accent`, `--surface-soft`, `--ink-soft`, `--line`; add `--ink`, `--ink-muted`, semantic tokens, shadow/radius/mono tokens.
- **Fonts:** Inter + JetBrains Mono via `next/font` (or CSS import) with swap.
- **Primitives (small, focused):** keep/upgrade `syn-card`/`card-lift`, `PageHeader`; add shared as needed — `Button`, `StatCard`, `Badge`, `SegmentedControl`, table styles, `Sidebar`, `Header`, form controls, `EmptyState`, `Skeleton`.
- Follow existing Next.js 16 fork patterns (see `AGENTS.md`).

---

## 3. Phased execution

Each phase gets its own detailed task-by-task plan when reached (same pattern as prior phases).

- **Phase A — Foundation (global skin).** Tokens + fonts + effect scales; upgrade base primitives; restyle **Sidebar + Header + app shell**. → whole app instantly lifts; no screen logic touched.
- **Phase B — Работно табло (Dashboard).** First full screen: KPI stat cards, action queue, next appointments, funnel/mini-charts — wired to the **same** data.
- **Phase C — Задачи / Leads.** Table + filters + priority/status badges.
- **Phase D — Календар.**
- **Phase E — Клиенти.**
- **Phase F — Разговори.**
- **Phase G — Асистент (agent builder).**
- **Phase H — Отчети (reports).**
- **Phase I — Настройки + Privacy.**

---

## 4. Per-screen task pattern

1. **Inventory (read-only):** list the screen's components, the data it reads, the actions/handlers it calls.
2. **Re-skin:** apply primitives + tokens; presentational markup only.
3. **Preserve wiring:** identical props, handlers, server-action calls, form field `name`s, data shapes.
4. **Verify:** `tsc` + `next build` green; manually exercise the screen's key actions (load, create/edit, submit, navigation); visual check vs direction.
5. **Commit** (+ optional deploy).

---

## 5. Verification & rollout

- Smoke flows to re-test after Foundation and after each screen: login/auth, dashboard load, leads create/edit, appointment booking/reschedule, agent publish, settings save, reports + CSV, privacy export.
- Deploy: safe to deploy after Phase A + Dashboard, then per screen or in small batches (push to `main` → Vercel).

---

## 6. Risks & mitigations

- Re-skin subtly breaks a form/action → never touch logic; small diffs; per-screen QA.
- Next.js 16 fork quirks → mirror existing patterns.
- Scope creep → phase gates; one screen at a time.
- Font swap / layout shift → `next/font` + swap + reserved space.

---

## 7. Success criteria

Every screen premium + cohesive; **all existing functionality intact**; `tsc`/`build` green; deployed; generic (no demo data); menu/routes unchanged.
