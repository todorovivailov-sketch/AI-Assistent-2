# Synapse Reference Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the existing AI Receptionist SaaS dashboard more closely with the Synapse/Neuform HTML reference while preserving all current app functionality.

**Architecture:** Apply the reference as a visual system rather than replacing the app with mockup HTML. Keep existing Next.js routes, Supabase loaders, client components, deep links, and API routes intact while standardizing tokens, shell, cards, tables, calendar, drawer, call center, reports, and settings.

**Tech Stack:** Next.js App Router, React, Tailwind CSS v4, Lucide icons, existing Supabase dashboard data loaders.

---

### Task 1: Global Tokens And Shared Surfaces

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/section-panel.tsx`
- Modify: `apps/web/src/components/metric-card.tsx`
- Modify: `apps/web/src/components/data-table.tsx`
- Modify: `apps/web/src/components/status-badge.tsx`

- [ ] **Step 1: Replace the current cool-neutral palette with Synapse tokens.**
  Use `#FDFDFD` background, `#FFFFFF` surface, `#E5E7EB` borders, `#4ADE80` primary, `#BBF7D0` soft accent, and `#111827` primary text.

- [ ] **Step 2: Normalize reusable cards and tables to 8px radius, subtle border, and reference shadow.**
  Use restrained hover lift and green focus/active states.

- [ ] **Step 3: Run lint after shared component changes.**
  Run `npm run lint` in `apps/web`; expected result is exit code 0.

### Task 2: Reference App Shell

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`

- [ ] **Step 1: Restyle desktop sidebar to the reference layout.**
  Use 252px width, green square brand icon, mono helper labels, active left bar, and compact nav rows.

- [ ] **Step 2: Restyle topbar to the reference.**
  Use title/subtitle space, active call pill, search/notification icon buttons, and green primary appointment CTA.

- [ ] **Step 3: Preserve mobile bottom nav and responsive behavior.**
  Keep the 5-item bottom nav functional with the same green active state.

### Task 3: Dashboard, Calendar, And Drawer Polish

**Files:**
- Modify: `apps/web/src/app/(dashboard)/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/appointments/page.tsx`
- Modify: `apps/web/src/components/calendar-toolbar.tsx`
- Modify: `apps/web/src/components/appointment-drawer.tsx`
- Modify: `apps/web/src/components/dashboard-timeline.tsx`

- [ ] **Step 1: Convert dashboard cards from glow-heavy Bento to reference compact metric cards.**
  Keep live data and dashboard links intact.

- [ ] **Step 2: Normalize calendar grid, toolbar popovers, and appointment cards.**
  Use white surfaces, subtle borders, green CTA, and compact density.

- [ ] **Step 3: Normalize appointment drawer controls, audio player, transcript bubbles, and footer.**
  Keep cancel API, Escape close, phone/Viber actions, and playback simulation intact.

### Task 4: Conversations, Reports, Assistant, And Settings Polish

**Files:**
- Modify: `apps/web/src/app/(dashboard)/conversations/call-center-workspace.tsx`
- Modify: `apps/web/src/app/(dashboard)/reports/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/assistant/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Align call center workspace with reference split-pane density.**
  Keep search, tabs, selected call deep-linking, waveform, transcript, and SMS chips.

- [ ] **Step 2: Align reports and assistant panels with reference cards and funnel rows.**
  Preserve live data calculations.

- [ ] **Step 3: Expand settings to reference-style integration and notification/team panels.**
  Keep current settings informational, no backend write behavior.

### Task 5: Verification And Production Readiness

**Files:**
- No source files unless verification exposes a defect.

- [ ] **Step 1: Run unit/logic checks.**
  Run `npm run test:availability` and `npm run test:dashboard` in `apps/web`; expected result is exit code 0 for both.

- [ ] **Step 2: Run lint and build.**
  Run `npm run lint` and `npm run build` in `apps/web`; expected result is exit code 0 for both.

- [ ] **Step 3: Run browser smoke on desktop and mobile.**
  Check `/`, `/appointments`, `/conversations`, `/assistant`, `/reports`, and `/settings` for status 200, no error overlay, and no horizontal overflow.
