# CRM Dashboard Redesign Task 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 5 of the CRM Dashboard Redesign: Create the `<DashboardTimeline>` client-side component, integrate it into the dashboard home page, and redesign the metrics section into a stunning Bento Grid layout.

**Architecture:** 
- A client-side component `DashboardTimeline` that receives appointment data and displays a vertical timeline with line/dot decorators and support for scheduling actions (cancellation and rescheduling).
- A Server Component `CommandCenterPage` that fetches data and displays a redesigned Bento Grid dashboard layout featuring custom metric cards with sleek gradients and hover micro-animations.

**Tech Stack:** React, Next.js (App Router), Tailwind CSS (v4), Lucide Icons, Next.js Link / useRouter.

---

### Task 1: Create Dashboard Timeline Client Component

**Files:**
- Create: `apps/web/src/components/dashboard-timeline.tsx`

- [ ] **Step 1: Create the client-side component file**
  - Implement a client component that takes `appointments: any[]` as a prop.
  - Implement dynamic, client-safe date formatting or timezone-safe Bulgaria strings to prevent hydration mismatches, using `suppressHydrationWarning`.
  - Design a vertical timeline using a left border line `border-l` and absolutely positioned dots centered on the line (`-left-[30px]` or appropriate centering relative to padding).
  - Implement action footers:
    - Link to `/appointments?appointment=[id]`
    - Cancellation button calling `POST /api/appointments/[id]/cancel` with confirmation, alert on success, and router refresh.
  - Render empty state "Няма предстоящи часове за днес." if no upcoming appointments are passed.

### Task 2: Redesign Dashboard Server Component (Bento Grid)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Replace static appointments list with <DashboardTimeline>**
  - Import `DashboardTimeline` and replace the existing inline list rendering under "Следващи часове".
- [ ] **Step 2: Redesign the metrics section**
  - Layout the metrics section into a Bento Grid using a custom diagonal 3-column or balanced grid layout with spans (e.g. Card 1 spans `col-span-2` on md, Others span `col-span-1`).
  - Add sleek gradient styles (from teal, blue, amber, emerald to transparent), micro-animations (transitions, hover translation, hover scale/shadow), and custom-styled metrics.
- [ ] **Step 3: Clean up unused imports**
  - Remove any unused imports in `page.tsx` (e.g., `formatDateTime`, `StatusBadge` if not used directly anymore, any unused icons).

### Task 3: Lint and Verify

- [ ] **Step 1: Run the linter**
  - Execute: `npm run lint` in the `apps/web` directory.
  - Expected: No errors or warnings.
- [ ] **Step 2: Commit the changes**
  - Add modified and created files:
    `git add apps/web/src/components/dashboard-timeline.tsx apps/web/src/app/(dashboard)/page.tsx`
  - Commit:
    `git commit -m "feat: implement Bento Grid dashboard layout and interactive vertical timeline"`
