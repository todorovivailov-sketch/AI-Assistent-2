# Sliding Appointment Drawer and Cancellation API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement dynamic client-side sliding side drawer for viewing appointment details (including simulated Viber/Phone actions, audio call playback, and transcript bubbles) and a cancellation API endpoint to delete appointments from Supabase.

**Architecture:** 
1. A Next.js API route (`apps/web/src/app/api/appointments/[id]/cancel/route.ts`) handles a `POST` request to delete an appointment from the `appointments` table using `getSupabaseServiceClient()`.
2. A Next.js client-side component (`apps/web/src/components/appointment-drawer.tsx`) renders the detail drawer sliding in from the right, with a backdrop.
3. The server component page (`apps/web/src/app/(dashboard)/appointments/page.tsx`) imports and renders the drawer, and handles dynamic Link navigation so clicking an appointment updates the query parameters to open the drawer.

**Tech Stack:** React, Next.js (App Router), Tailwind CSS, Lucide Icons, Supabase JS.

---

### Task 1: Create Cancellation API Endpoint

**Files:**
- Create: `apps/web/src/app/api/appointments/[id]/cancel/route.ts`

- [ ] **Step 1: Write the cancellation API endpoint**
  Create `apps/web/src/app/api/appointments/[id]/cancel/route.ts` with Next.js App Router POST handler using `getSupabaseServiceClient()` to delete the row.

- [ ] **Step 2: Verify linting of the API route**
  Run: `npm run lint` inside `apps/web`
  Expected: Passes with no errors in the route.

- [ ] **Step 3: Commit API route**
  ```bash
  git add apps/web/src/app/api/appointments/[id]/cancel/route.ts
  git commit -m "feat: add cancellation API endpoint for appointments"
  ```

---

### Task 2: Create sliding side Drawer Component

**Files:**
- Create: `apps/web/src/components/appointment-drawer.tsx`

- [ ] **Step 1: Implement Client-Side Appointment Drawer**
  Write the component that takes `appointment` (type `any`) as a prop. It should use `"use client"` and render a sliding drawer from the right side, an overlay backdrop, and close using `Link` or `useRouter().push('/appointments')`.
  
  Content structure:
  - Header: Displays customer name, service type, and StatusBadge.
  - Contact Actions: Viber button (alerts Mock Viber message) and Phone button (standard `tel:` link).
  - AI Call Recording Player: Play/pause button, audio bar with mock times, speed toggle (1x, 1.5x, 2x).
  - AI Call Transcript: Bubble conversation view showing a realistic Bulgarian conversation between client and receptionist tailored to the service type.
  - Footer Action Buttons: "Премести часа" (reschedule - alert) and "Отмени часа" (cancel - calls `/api/appointments/[id]/cancel` and redirects).

- [ ] **Step 2: Verify component lints correctly**
  Run: `npm run lint`
  Expected: Passed.

- [ ] **Step 3: Commit Drawer Component**
  ```bash
  git add apps/web/src/components/appointment-drawer.tsx
  git commit -m "feat: create client-side sliding appointment detail drawer"
  ```

---

### Task 3: Integrate Drawer into Appointments Page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/appointments/page.tsx`

- [ ] **Step 1: Update Link tags for selecting appointments**
  Wrap or convert appointment blocks and lists into Next.js `<Link href="/appointments?appointment=...">` so they update search parameters on click.

- [ ] **Step 2: Mount the drawer**
  Import `<AppointmentDrawer appointment={focusedAppointment} />` and render it at the bottom of the page if `focusedAppointment` is not null.

- [ ] **Step 3: Lint and compile check**
  Run: `npm run lint` and `npm run build` inside `apps/web`
  Expected: Zero errors.

- [ ] **Step 4: Commit integration**
  ```bash
  git add apps/web/src/app/(dashboard)/appointments/page.tsx
  git commit -m "feat: integrate appointment drawer into calendar dashboard page"
  ```
