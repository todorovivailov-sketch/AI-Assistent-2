# CRM Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the CRM dashboard, calendar, and calling interfaces to provide a world-class, premium SaaS tool featuring live call takeover widgets, delay reminders, block-out calendars, appointment drawers with call playback/transcripts, and SMS templates.

**Architecture:** We will enhance the existing Next.js (App Router) pages inside `(dashboard)`. We will introduce a sliding Drawer component for calendar details, integrate interactive call control modules inside the sidebar shell, and split the calling dashboard into a modern dual-pane workspace. We will use vanilla Tailwind CSS classes and Lucide Icons for styling.

**Tech Stack:** React, Next.js, Tailwind CSS, Lucide Icons, Supabase client.

---

### Task 1: AppShell - Live Call Widget & Takeover Simulation

**Files:**
- Modify: [app-shell.tsx](file:///c:/Users/Ivaylo/Desktop/AI%20Receptionist/apps/web/src/components/app-shell.tsx)

- [ ] **Step 1: Implement Live Call State and Widget inside AppShell header**
  We will add simulated active call status states to the header bar, featuring a pulsing indicator and a "Takeover" button. Add the following JSX to the header:
  ```tsx
  // Add this inside AppShell component (e.g., lines 74-85):
  const [activeCall, setActiveCall] = useState<{ id: string; phone: string } | null>(null);

  // Simulate an incoming call 10 seconds after load for demonstration
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveCall({ id: "call-live-101", phone: "+359 88 923 3722" });
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const handleTakeover = () => {
    alert(`Поемане на обаждането с ${activeCall?.phone}... Разговорът се прехвърля към вашия телефон.`);
    setActiveCall(null);
  };
  ```
  Render the pulsing bar next to settings:
  ```tsx
  {activeCall && (
    <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200 animate-pulse dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span>Активно обаждане: {activeCall.phone}</span>
      <button 
        onClick={handleTakeover} 
        className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white hover:bg-emerald-700"
      >
        Поеми разговора
      </button>
    </div>
  )}
  ```

- [ ] **Step 2: Verify changes build successfully**
  Run: `npm run lint` inside `apps/web`
  Expected: Compiled clean.

- [ ] **Step 3: Commit**
  ```bash
  git add apps/web/src/components/app-shell.tsx
  git commit -m "feat: add live call widget and takeover simulation to AppShell"
  ```

---

### Task 2: Calendar Page - Toolbar, Late Delay Popover, Block Time Modal

**Files:**
- Modify: [page.tsx](file:///c:/Users/Ivaylo/Desktop/AI%20Receptionist/apps/web/src/app/(dashboard)/appointments/page.tsx)

- [ ] **Step 1: Add "Late Delay" & "Block Time" Buttons to the Calendar Toolbar**
  Modify the calendar page header actions to include two interactive buttons: "Закъснявам" and "Блокирай време".
  ```tsx
  // Insert these into the PageHeader actions array or wrapper:
  // Late Delay popover toggle
  <button 
    onClick={() => setShowDelayPopover(!showDelayPopover)}
    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 hover:bg-amber-100"
  >
    <Clock size={16} />
    Закъснявам
  </button>
  // Block Time button
  <button 
    onClick={() => setShowBlockModal(true)}
    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-muted)]"
  >
    <Ban size={16} />
    Блокирай време
  </button>
  ```

- [ ] **Step 2: Add client-side state behaviors**
  Since the page is currently a React Server Component, we will convert it to a client-side component (using `"use client"`) or separate it out so that we can handle state for popovers and modals cleanly.
  Let's keep calendar rendering dynamic but add interactive hooks.
  Create a wrapper component if needed, or convert `AppointmentsPage` to a Client Component.
  Let's write a Modal component in `apps/web/src/components/block-time-modal.tsx` and integrate it.

- [ ] **Step 3: Test modal rendering**
  Open the browser or run playbooks/lint checks.
  Run: `npm run lint`
  Expected: Passed.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/web/src/app/(dashboard)/appointments/page.tsx
  git commit -m "feat: add delay notification and block-out time actions to calendar toolbar"
  ```

---

### Task 3: Appointment Detail Drawer Component

**Files:**
- Create: `apps/web/src/components/appointment-drawer.tsx`
- Modify: [page.tsx](file:///c:/Users/Ivaylo/Desktop/AI%20Receptionist/apps/web/src/app/(dashboard)/appointments/page.tsx)

- [ ] **Step 1: Design and write the slide-out Drawer component**
  The drawer slides in from the right when an appointment is selected. It must display:
  - Caller info & communication shortcuts (Viber, Phone)
  - AI call recording player (with speeds: 1x, 1.5x, 2x)
  - Full transcript chat log
  - Action buttons: "Премести часа" (Reschedule) & "Отмени часа" (Cancel).
  Save it as `apps/web/src/components/appointment-drawer.tsx`.

- [ ] **Step 2: Mount the drawer in appointments/page.tsx**
  Replace the static sidebar aside in `appointments/page.tsx` with a trigger that opens this new drawer when `selectedAppointmentId` is present, adding slide-in animations.

- [ ] **Step 3: Run linter and verify**
  Run: `npm run lint`
  Expected: Passed.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/web/src/components/appointment-drawer.tsx apps/web/src/app/(dashboard)/appointments/page.tsx
  git commit -m "feat: implement sliding appointment detail drawer with audio transcripts and booking actions"
  ```

---

### Task 4: Call Center / Conversations Page Split-Pane Redesign

**Files:**
- Modify: [page.tsx](file:///c:/Users/Ivaylo/Desktop/AI%20Receptionist/apps/web/src/app/(dashboard)/conversations/page.tsx)

- [ ] **Step 1: Redesign conversations page to a modern two-column workspace**
  - Left column: Chronological feed of recent calls (filters for Missed, Urgent, Booked, All).
  - Right column: Detail workspace showing:
    - Audio waveform playback controller.
    - AI-extracted summary and lead cards.
    - Full speech-to-text transcript dialog block.
    - SMS/Viber template console for sending quick replies.

- [ ] **Step 2: Connect simulated quick reply templates**
  Allow the user to select templates like "Изпрати адрес на кабинета" or "Потвърждение на преместен час" and click "Изпрати", rendering a success toast message.

- [ ] **Step 3: Lint check**
  Run: `npm run lint`
  Expected: Clean compile.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/web/src/app/(dashboard)/conversations/page.tsx
  git commit -m "feat: redesign conversations tab into split-pane call center workspace"
  ```

---

### Task 5: Dashboard Bento Grid & Timeline Redesign

**Files:**
- Modify: [page.tsx](file:///c:/Users/Ivaylo/Desktop/AI%20Receptionist/apps/web/src/app/(dashboard)/page.tsx)

- [ ] **Step 1: Apply Bento-grid styles to the main command dashboard**
  Update the metrics layout in `(dashboard)/page.tsx` to use card classes with glassmorphic backgrounds, subtle borders, and micro-hover lifting animations.

- [ ] **Step 2: Enhance the Inbox preview and Calendar timeline**
  Improve the visual timeline layout for today's upcoming appointments. Show patient initials, service indicators, and status badges.

- [ ] **Step 3: Run logic & lint verification**
  Run: `npm run lint`
  Run: `npm run test:dashboard`
  Expected: All checks passed.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/web/src/app/(dashboard)/page.tsx
  git commit -m "feat: apply bento style and upcoming timeline cards to dashboard page"
  ```
