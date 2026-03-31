# Kiosk, QR & Face Recognition — Complete Redesign Plan

> **Author**: Lead Full-Stack Developer  
> **Date**: March 30, 2026  
> **Status**: Planning — Do NOT implement until approved

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Current Architecture (As-Is)](#2-current-architecture-as-is)
3. [Target Architecture (To-Be)](#3-target-architecture-to-be)
4. [Change Inventory](#4-change-inventory)
5. [Phase 1 — Remove /kiosk/select & Restructure Routing](#5-phase-1--remove-kioskselect--restructure-routing)
6. [Phase 2 — Redesign Kiosk QR Page with Daily Log & Theme Support](#6-phase-2--redesign-kiosk-qr-page-with-daily-log--theme-support)
7. [Phase 3 — Redesign Kiosk Face Page with Theme Support](#7-phase-3--redesign-kiosk-face-page-with-theme-support)
8. [Phase 4 — Employee QR Flow (/employee/attendance)](#8-phase-4--employee-qr-flow-employeeattendance)
9. [Phase 5 — Employee Face Flow (/employee/attendance)](#9-phase-5--employee-face-flow-employeeattendance)
10. [Phase 6 — Project-Based Verification Routing](#10-phase-6--project-based-verification-routing)
11. [Phase 7 — Light/Dark Mode & Branding Consistency](#11-phase-7--lightdark-mode--branding-consistency)
12. [File-by-File Change Matrix](#12-file-by-file-change-matrix)
13. [Testing Plan](#13-testing-plan)
14. [Migration Notes](#14-migration-notes)

---

## 1. Problem Statement

### Issues Identified

| # | Issue | Severity |
|---|-------|----------|
| 1 | `/kiosk/select` page exists but is orphaned — sidebar links go directly to `/kiosk/qr` and `/kiosk/face`, yet the PIN page (`/kiosk`) redirects to `/kiosk/select`, and both kiosk pages have "Back" buttons pointing to `/kiosk/select`. The `select` page no longer exists as a file. | **Critical** |
| 2 | Kiosk pages (`/kiosk`, `/kiosk/qr`, `/kiosk/face`) are **always dark mode** — they use hardcoded `bg-zinc-950`/`bg-slate-950` + `text-white` without respecting the user's theme preference (light/dark/system). | **High** |
| 3 | QR kiosk (`/kiosk/qr`) has no daily activity log panel (unlike the face kiosk which now has one). | **Medium** |
| 4 | Employee QR display (`EmployeeQRDisplay`) generates a QR code but the employee-side flow for project-assigned QR verification is incomplete — if a project requires `qr_only`, the employee sees their QR but must manually confirm "I've Scanned at Kiosk". | **Medium** |
| 5 | Face recognition works differently on `/kiosk/face` (uses `match` against all enrolled faces) vs `/employee/attendance` (`RealFaceVerification` component verifies against a specific `employeeId`). Both paths should work correctly, but the kiosk makes an unreliable `currentUser`-based fallback. | **Medium** |
| 6 | The kiosk PIN page (`/kiosk`) doesn't offer method selection post-PIN — it just pushes to the non-existent `/kiosk/select`. | **Critical** |
| 7 | Both kiosk pages have no branding consistency — they don't show company logo, and colors don't match the app's configured color theme. | **Low** |

---

## 2. Current Architecture (As-Is)

### Route Map

```
/kiosk                    → PIN entry page (redirects → /kiosk/select ❌ BROKEN)
/kiosk/select             → ❌ FILE DOES NOT EXIST (was deleted or never created)
/kiosk/qr                 → QR scanner kiosk (dark-only, no daily log)
/kiosk/face               → Face recognition kiosk (dark-only, has daily log)
/kiosk/face/enroll        → Face enrollment for kiosk
/[role]/attendance         → Employee attendance (QR display + face verification)
/[role]/face-enrollment   → Employee face enrollment
```

### Sidebar Nav Links (from `src/lib/constants.ts`)

```
Kiosk (QR)        → /kiosk/qr        (admin, hr)  absolute: true
Kiosk (Face)      → /kiosk/face      (admin, hr)  absolute: true
Face Enrollment   → /face-enrollment  (all roles)  relative to [role]
```

### Client Layout Shell Skip Logic (`client-layout.tsx`)

```typescript
const skipShell = isLoginPage || isRoot || isKiosk;
// Only skips shell for exact `/kiosk` — NOT for /kiosk/qr or /kiosk/face
// This means /kiosk/qr and /kiosk/face render INSIDE the AppShell with sidebar
```

**Problem**: The sidebar is visible on kiosk pages because `skipShell` only matches `/kiosk` exactly. This is actually by design — admin/HR access kiosk pages from the sidebar. But a dedicated kiosk device should have a fullscreen mode without the sidebar.

### Theme Handling

- `ThemeProvider` adds `light`/`dark` class to `<html>` based on `useAuthStore.theme`
- Kiosk pages **ignore** this entirely — they use hardcoded dark backgrounds (`bg-zinc-950`, `text-white`)
- The kiosk PIN page uses `bg-primary` for accent blobs, which respects the theme, but the dark background doesn't

### QR Flow

**Employee side** (`/[role]/attendance`):
1. Employee clicks "Show My QR Code" → `EmployeeQRDisplay` fetches `GET /api/attendance/daily-qr?employeeId=XXX`
2. API generates `NEXHRMS-DAY:<empId>:<date>:<hmac>` payload
3. QR code rendered via `qrcode.react`
4. Employee shows phone to kiosk camera
5. Employee manually clicks "I've Scanned at Kiosk" to confirm attendance

**Kiosk side** (`/kiosk/qr`):
1. Admin enables camera via "Start Scanner"
2. BarcodeDetector API scans QR every 300ms
3. Payload sent to `POST /api/attendance/validate-qr` (validates HMAC, checks date, finds employee)
4. On success → `appendEvent()` (attendance event ledger) + visual feedback

**Gap**: Kiosk uses `appendEvent()` but employee view uses `checkIn()`. The QR kiosk does NOT call `checkIn()`, which means the daily `logs[]` array may not be updated correctly. The event ledger and computed logs are two separate systems.

### Face Flow

**Employee side** (`/[role]/attendance`):
1. After location verification → `RealFaceVerification` component loads
2. Component verifies against the logged-in `employeeId` specifically
3. Uses `/api/face-recognition/enroll?action=verify` (single-employee check)
4. On success → `handleFaceVerified()` → `checkIn()` with `faceVerified: true`

**Kiosk side** (`/kiosk/face`):
1. Camera loads face-api.js models
2. Multi-frame capture (7 frames, 3+ good, averaged)
3. First tries `?action=match` (against ALL enrolled faces) → if matched, shows name
4. Fallback: `?action=verify` against `currentUser.id` (unreliable on kiosk)
5. On confirm → `checkIn()` or `checkOut()`

**Gap**: The kiosk `currentUser` is whoever is logged in to the main app, not the employee at the kiosk. The fallback verify should be removed — kiosk should ONLY use match-all.

---

## 3. Target Architecture (To-Be)

### Route Map (After)

```
/kiosk                    → PIN entry → method selection (Face or QR) embedded in same page
/kiosk/qr                 → QR scanner kiosk (theme-aware, daily log, branding)
/kiosk/face               → Face recognition kiosk (theme-aware, daily log, branding)
/kiosk/face/enroll        → Face enrollment for kiosk (unchanged)
/[role]/attendance         → Employee attendance (improved QR + face flow)
/[role]/face-enrollment   → Employee face enrollment (unchanged)
```

### Key Architectural Changes

1. **No more `/kiosk/select`** — method selection is embedded in the PIN page (`/kiosk`) after successful PIN entry
2. **Theme-aware kiosk** — kiosk pages respect light/dark mode from the global theme, using CSS variables (`bg-background`, `text-foreground`) instead of hardcoded dark colors. A `kioskTheme` setting in the store provides an **override** option: `"auto"` (follow system theme), `"dark"`, `"midnight"`, `"charcoal"`
3. **Daily activity log** on BOTH kiosk pages (QR and Face)
4. **QR kiosk calls `checkIn()`/`checkOut()`** in addition to `appendEvent()` for consistency
5. **Face kiosk removes `currentUser` fallback** — only match-all is used
6. **Employee QR display auto-detects kiosk confirmation** via polling or realtime
7. **Branding** — company logo and name shown on all kiosk pages
8. **Client layout shell skip** updated to skip AppShell for ALL `/kiosk/*` routes

---

## 4. Change Inventory

| File | Action | Description |
|------|--------|-------------|
| `src/app/kiosk/page.tsx` | **MAJOR REWRITE** | Merge method selection into PIN page. After PIN verified, show Face/QR selection cards. Remove redirect to `/kiosk/select`. |
| `src/app/kiosk/qr/page.tsx` | **MAJOR REWRITE** | Add daily activity log panel. Add theme support (light/dark). Update branding. Replace "Back → /kiosk/select" with "Back → /kiosk". Fix checkIn/checkOut calls. |
| `src/app/kiosk/face/page.tsx` | **MODERATE EDIT** | Add theme support (light/dark). Update branding. Replace "Back → /kiosk/select" with "Back → /kiosk". Remove currentUser fallback verify. |
| `src/app/client-layout.tsx` | **SMALL EDIT** | Update `skipShell` to match all `/kiosk*` routes |
| `src/store/kiosk.store.ts` | **SMALL EDIT** | Add `"auto"` option to `kioskTheme`. Default to `"auto"`. |
| `src/lib/constants.ts` | **SMALL EDIT** | Update sidebar nav — remove `Kiosk (QR)` and `Kiosk (Face)` as separate links, replace with single `Kiosk` link to `/kiosk`. Or keep both if admin needs direct access. |
| `src/components/attendance/employee-qr-display.tsx` | **MODERATE EDIT** | Show QR immediately on load (already does), improve UX with countdown timer showing daily QR validity, add project context. |
| `src/app/[role]/attendance/_views/employee-view.tsx` | **MODERATE EDIT** | When project verification is `qr_only`, auto-show QR without requiring button click. When `face_or_qr`, let employee choose. |
| `src/app/kiosk/face/enroll/page.tsx` | **NO CHANGE** | Already works correctly. |
| `src/app/[role]/face-enrollment/page.tsx` | **NO CHANGE** | Already has admin redirect guard. |

---

## 5. Phase 1 — Remove /kiosk/select & Restructure Routing

### 5.1 Merge Method Selection into PIN Page

**File**: `src/app/kiosk/page.tsx`

After PIN verification succeeds, instead of `router.push("/kiosk/select")`, transition to an in-page method selection view:

```
State flow:  "pin_entry" → "method_select"
```

**PIN Entry State**: Current PIN card UI (unchanged)

**Method Select State**: Two cards side-by-side:
- **Face Recognition** card → navigates to `/kiosk/face`
- **QR Code Scanner** card → navigates to `/kiosk/qr`

Each card conditionally rendered based on `settings.enableFace` / `settings.enableQr`:
- If only face enabled → auto-redirect to `/kiosk/face`
- If only QR enabled → auto-redirect to `/kiosk/qr`
- If both enabled → show selection cards

**Visual Design Requirements**:
- Cards use `bg-card`/`text-card-foreground` (theme-aware)
- Accent colors: Face = emerald/green, QR = violet/purple
- Icon + title + description + feature bullets
- Responsive: side-by-side on desktop, stacked on mobile
- Smooth transition from PIN entry to selection (fade/slide animation)

### 5.2 Update All "Back" Buttons

Replace all references to `/kiosk/select` with `/kiosk`:

| File | Line | Old | New |
|------|------|-----|-----|
| `src/app/kiosk/face/page.tsx` | ~300 | `router.push("/kiosk/select")` | `router.push("/kiosk")` |
| `src/app/kiosk/qr/page.tsx` | ~259 | `router.push("/kiosk/select")` | `router.push("/kiosk")` |

### 5.3 Update Client Layout Shell Skip

**File**: `src/app/client-layout.tsx`

```typescript
// Before:
const isKiosk = pathname === "/kiosk";

// After:
const isKiosk = pathname === "/kiosk" || pathname.startsWith("/kiosk/");
```

This ensures ALL kiosk pages render without the sidebar/AppShell, making them truly fullscreen terminals.

### 5.4 Update Sidebar Nav Links

**File**: `src/lib/constants.ts`

Option A (recommended): Keep both sidebar links for admin/HR direct access, but they now skip PIN (since admin is already authenticated). The PIN is only for a dedicated kiosk device.

Option B: Replace with a single "Kiosk" link → `/kiosk`.

**Decision**: Keep Option A. Admin accessing kiosk pages from the sidebar already has authentication — PIN is a secondary layer for shared/public devices.

### 5.5 Update PIN Session Logic

The kiosk pages verify PIN via `sessionStorage`. When admin navigates directly from sidebar (already authenticated), they should bypass this check. Add a flag:

```typescript
// In kiosk/qr and kiosk/face pages, check:
// 1. Is the user an admin/HR accessing from the sidebar? → Allow
// 2. Is a valid PIN session present? → Allow 
// 3. Otherwise → redirect to /kiosk for PIN entry
```

**Implementation**: Check if `document.referrer` includes the app domain + sidebar, OR check if `useAuthStore.isAuthenticated && role === "admin" || role === "hr"`.

Simpler approach: Always require PIN for kiosk pages. The sidebar links already set the PIN session when admin navigates through the kiosk settings page. Keep current behavior.

---

## 6. Phase 2 — Redesign Kiosk QR Page with Daily Log & Theme Support

### 6.1 Theme-Aware Background System

**Current** (hardcoded dark):
```typescript
className={cn(
    "fixed inset-0 ...",
    ks.kioskTheme === "midnight" ? "bg-slate-950" : 
    ks.kioskTheme === "charcoal" ? "bg-neutral-950" : "bg-zinc-950"
)}
```

**Target** (theme-aware):
```typescript
// kioskTheme options: "auto" | "dark" | "midnight" | "charcoal"
// When "auto" → use bg-background text-foreground (follows system light/dark)
// When "dark"/"midnight"/"charcoal" → force dark background (existing behavior)

const isAutoTheme = ks.kioskTheme === "auto";

className={cn(
    "fixed inset-0 ...",
    isAutoTheme ? "bg-background text-foreground" :
    ks.kioskTheme === "midnight" ? "bg-slate-950 text-white" :
    ks.kioskTheme === "charcoal" ? "bg-neutral-950 text-white" : "bg-zinc-950 text-white"
)}
```

For "auto" mode, all child elements must also use theme-aware classes:
- `text-white/40` → `text-muted-foreground`
- `text-white` → `text-foreground`
- `bg-white/[0.04]` → `bg-card`
- `border-white/10` → `border-border`
- etc.

### 6.2 QR Scanner Panel Redesign

The current QR page is a single-column centered layout. Redesign to match the face page's two-column layout:

**Left Column (Scanner)**:
- Mode toggle (Check In / Check Out) — styled with theme-aware emerald/sky accents
- Camera viewfinder with QR frame overlay
- Start Scanner / Demo buttons
- Scanner status indicator (scanning, processing, idle)

**Right Column (Daily Activity Log)**:
- Same design as face kiosk's activity log
- Shows each QR scan event with employee name, type (in/out), timestamp
- Persisted in `sessionStorage`, clears at midnight
- Color-coded entries (emerald = in, sky = out)

### 6.3 Fix checkIn/checkOut Calls

**Current**: QR kiosk uses `appendEvent()` only — writes to the event ledger but NOT the daily `logs[]` array.

**Fix**: After `appendEvent()`, also call `checkIn(empId, project?.id)` or `checkOut(empId, project?.id)`:

```typescript
const clockEmployee = useCallback((empId: string, empName: string) => {
    if (mode === "in") checkWorkDay(empId);
    
    // Event ledger (append-only audit trail)
    appendEvent({
        employeeId: empId,
        eventType: mode === "in" ? "IN" : "OUT",
        timestampUTC: new Date().toISOString(),
        deviceId,
    });
    
    // Daily log (backward-compatible computed view)
    const project = getProjectForEmployee(empId);
    if (mode === "in") {
        checkIn(empId, project?.id);
    } else {
        checkOut(empId, project?.id);
    }
    
    // Activity log
    addToKioskLog(empName);
    triggerFeedback(mode === "in" ? "success-in" : "success-out", empName);
}, [mode, deviceId, appendEvent, checkIn, checkOut, checkWorkDay, getProjectForEmployee, triggerFeedback]);
```

### 6.4 Branding

- Show company logo (top-left) using `useAppearanceStore.logoUrl`
- Show company name if no logo
- Footer: `{companyName} • QR Code Kiosk`

### 6.5 Success/Error Feedback

- Theme-aware success overlay: `bg-emerald-500/20` (works in both light/dark)
- Matched employee name shown prominently in a banner card (same design as face kiosk)
- Error overlay with specific error message from API

---

## 7. Phase 3 — Redesign Kiosk Face Page with Theme Support

### 7.1 Theme-Aware Background

Same approach as QR page (Section 6.1). Apply `isAutoTheme` conditional classes throughout.

### 7.2 Remove currentUser Fallback

**Current** (face page, lines ~180-210):
```typescript
// Fallback: verify against current user specifically
const verifyRes = await fetch("/api/face-recognition/enroll?action=verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        employeeId: currentUser.id || "EMP001",
        embedding: averaged,
        probeImage,
    }),
});
```

**Problem**: On a shared kiosk, `currentUser` is whoever opened the browser — NOT the employee standing at the kiosk. This fallback can incorrectly verify any face as the admin's face.

**Fix**: Remove the fallback entirely. If match-all fails, show "Face not recognized" and prompt re-scan or enrollment:

```typescript
if (matchData.ok && matchData.matched && matchData.employeeId) {
    // Matched — show name and confirm button
    const emp = employees.find((e) => e.id === matchData.employeeId);
    setMatchedName(emp?.name || matchData.employeeId);
    setMatchDistance(matchData.distance);
    setScanState("verified");
} else {
    // No match — do NOT fall back to currentUser
    toast.error("Face not recognized. Try again or enroll at the enrollment page.");
    setScanState("idle");
}
```

### 7.3 Branding & Layout

Already has two-column layout with daily log. Apply:
- Theme-aware classes (same as QR page)
- Company logo in header
- Consistent design language between QR and Face pages

---

## 8. Phase 4 — Employee QR Flow (/employee/attendance)

### 8.1 Current Flow (Problem)

When an employee's project has `verificationMethod: "qr_only"`:

1. Employee clicks "Check In" → location verification
2. After location verified → button "Show My QR Code" appears
3. Employee clicks button → `step` changes to `"qr_scan"`
4. `EmployeeQRDisplay` renders with QR code
5. Employee shows QR to kiosk camera (separate device)
6. Employee manually clicks "I've Scanned at Kiosk" → `handleQrCheckedIn()` → `checkIn()`

**Problems**:
- Employee must manually confirm (honor system)
- QR display is behind an extra click
- No real-time detection of kiosk scan

### 8.2 Improved Flow

**Option A (Simple — recommended)**: Auto-show QR after location verification, remove manual confirmation:

When `verificationMethod === "qr_only"`:
1. After location verified, **immediately** show QR code (no extra button click)
2. QR code displayed large and centered for easy scanning
3. Below QR: "Show this to the kiosk scanner" instruction
4. After the kiosk scans and processes the QR → attendance is recorded server-side
5. Employee can close the dialog or click "Done" — the attendance entry already exists from the kiosk-side

The "I've Scanned at Kiosk" button becomes "Done" and just closes the dialog without calling `checkIn()` again (kiosk already did it).

**Option B (Advanced — future)**: Real-time notification via Supabase Realtime:
- Employee subscribes to `attendance_events` filtered by their ID
- When kiosk processes their QR → Supabase triggers INSERT
- Employee's page auto-updates to show "Check-in confirmed by kiosk at {time}"

**Implement Option A now**; Option B is a future enhancement.

### 8.3 Changes to `employee-view.tsx`

```typescript
// When project method is qr_only AND location is verified → auto-show QR
{step === "location_result" && geoResult?.within && myProject?.verificationMethod === "qr_only" && (
    <EmployeeQRDisplay
        employeeId={myEmployeeId!}
        employeeName={currentUser.name}
        onCheckedIn={() => setStep("done")}
    />
)}
```

Instead of showing a "Show My QR Code" button that transitions to a separate `qr_scan` step.

### 8.4 Changes to `EmployeeQRDisplay`

- Make QR code larger (240px → 280px) for easier scanning
- Show "Valid until midnight" countdown
- Show project name context ("For: {projectName}")
- Change button text from "I've Scanned at Kiosk" → "Done — Close"
- Remove the `onCheckedIn` calling `checkIn()` — just close the dialog
- Add instruction: "The kiosk will automatically record your attendance when scanned"

---

## 9. Phase 5 — Employee Face Flow (/employee/attendance)

### 9.1 Current Flow (Works Correctly)

When `verificationMethod !== "qr_only"`:
1. After location verified → `RealFaceVerification` component renders
2. Component checks enrollment for the logged-in `employeeId`
3. If enrolled → camera loads → employee scans → verify against their specific embedding
4. On success → `handleFaceVerified()` → `checkIn()` with `faceVerified: true`

This flow is correct for employee-side because the `employeeId` is known (the logged-in user).

### 9.2 Ensure Both Paths Work

**Employee path** (`/[role]/attendance`): Uses `?action=verify` with specific `employeeId` ✓
**Kiosk path** (`/kiosk/face`): Uses `?action=match` against all enrolled faces ✓

These are intentionally different:
- Employee: "Verify that I am who I claim to be" (1:1 comparison)
- Kiosk: "Who is this person?" (1:N identification)

No changes needed to the face verification API or service. The tightened thresholds (Phase 0) already improve accuracy on both paths.

### 9.3 Face Enrollment Prompt

When an employee has `face_only` or `face_or_qr` verification and is NOT enrolled:
- `RealFaceVerification` now shows "Face Enrollment Required" (no bypass)
- Button links to `/{role}/face-enrollment`
- This is already implemented (Phase 0 changes)

---

## 10. Phase 6 — Project-Based Verification Routing

### 10.1 Verification Methods

From `project-verification.service.ts`:
```typescript
type VerificationMethod = "face_only" | "qr_only" | "face_or_qr" | "manual_only";
```

### 10.2 Employee-Side Routing

**File**: `src/app/[role]/attendance/_views/employee-view.tsx`

After location verification succeeds, the verification method determines the next step:

| Method | Employee Action |
|--------|----------------|
| `face_only` | Show `RealFaceVerification` (required, no skip) |
| `qr_only` | Auto-show `EmployeeQRDisplay` (show QR to kiosk) |
| `face_or_qr` | Show choice: "Verify by Face" or "Show QR Code" |
| `manual_only` | Skip verification, go straight to `checkIn()` |
| (no project) | Show `RealFaceVerification` (default, with enrollment prompt if not enrolled) |

**Current behavior**: Already mostly correct. `face_or_qr` currently shows face verification with `required=true`. Should offer a choice instead.

**Fix for `face_or_qr`**:
```typescript
{step === "location_result" && geoResult?.within && 
 myProject?.verificationMethod === "face_or_qr" && 
 !verificationMethodChosen && (
    <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground text-center">Choose verification method:</p>
        <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setVerificationMethodChosen("face")} className="gap-1.5">
                <ScanFace className="h-4 w-4" /> Face Scan
            </Button>
            <Button variant="outline" onClick={() => setVerificationMethodChosen("qr")} className="gap-1.5">
                <QrCode className="h-4 w-4" /> Show QR
            </Button>
        </div>
    </div>
)}
```

### 10.3 Kiosk-Side Routing

**QR Kiosk** (`/kiosk/qr`):
- Scans any employee's QR regardless of their project's verification method
- If the employee's project is `face_only`, the kiosk should reject the QR and display: "This employee's project requires face verification"
- Implementation: After identifying the employee from the QR, check their project's verification method before confirming

**Face Kiosk** (`/kiosk/face`):
- Matches any enrolled employee's face
- If the employee's project is `qr_only`, the kiosk should still allow face check-in (kiosk is admin-controlled)
- No additional validation needed on face kiosk

### 10.4 QR Kiosk Project Verification

```typescript
// In processQrPayload(), after identifying the employee:
const emp = employees.find((e) => e.id === empId);
if (emp) {
    const project = getProjectForEmployee(emp.id);
    if (project?.verificationMethod === "face_only") {
        setErrorMessage(`${emp.name}'s project requires face verification. Use the Face kiosk.`);
        triggerFeedback("error");
        return;
    }
    stopQrScanner();
    clockEmployee(emp.id, emp.name);
}
```

---

## 11. Phase 7 — Light/Dark Mode & Branding Consistency

### 11.1 Kiosk Theme Setting Extension

**File**: `src/store/kiosk.store.ts`

```typescript
// Before:
kioskTheme: "dark" | "midnight" | "charcoal";

// After:
kioskTheme: "auto" | "dark" | "midnight" | "charcoal";
```

Default: `"auto"` (follows the user's system/app theme).

### 11.2 Theme-Aware Component Strategy

Create a helper for kiosk theme classes:

```typescript
// Utility (can be inline or a small helper)
function useKioskThemeClasses() {
    const kioskTheme = useKioskStore((s) => s.settings.kioskTheme);
    const isAuto = kioskTheme === "auto";
    
    return {
        isAuto,
        // Root container class
        bg: isAuto ? "bg-background" : 
            kioskTheme === "midnight" ? "bg-slate-950" :
            kioskTheme === "charcoal" ? "bg-neutral-950" : "bg-zinc-950",
        // Text classes
        text: isAuto ? "text-foreground" : "text-white",
        textMuted: isAuto ? "text-muted-foreground" : "text-white/40",
        textSubtle: isAuto ? "text-muted-foreground/60" : "text-white/20",
        // Card classes
        card: isAuto ? "bg-card border-border" : "bg-white/[0.04] border-white/10",
        // Success/error states remain the same (always use colored backgrounds)
    };
}
```

### 11.3 Branding Elements

All kiosk pages should show:

**Header** (top-left):
```tsx
{logoUrl ? (
    <img src={logoUrl} alt={companyName} className={cn(
        "h-8 max-w-[130px] object-contain",
        !isAuto && "brightness-0 invert opacity-90"  // Only invert for dark themes
    )} />
) : (
    <span className={cn("font-bold text-lg tracking-tight", text)}>
        {companyName || "NexHRMS"}
    </span>
)}
```

**Footer**:
```tsx
<span className={textSubtle}>
    {companyName || "NexHRMS"} • {pageType} Kiosk
</span>
```

### 11.4 Color Accent Strategy

Both kiosk modes use semantic accent colors that work in both light and dark:

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Check-in success | `bg-emerald-100 text-emerald-800` | `bg-emerald-500/20 text-emerald-300` |
| Check-out success | `bg-sky-100 text-sky-800` | `bg-sky-500/20 text-sky-300` |
| Error | `bg-red-100 text-red-800` | `bg-red-500/20 text-red-300` |
| Scanner accent | `bg-violet-100 text-violet-700` | `bg-violet-500/20 text-violet-300` |
| Mode toggle active | `bg-primary text-primary-foreground` | Same (CSS vars handle it) |

For auto theme: Use Tailwind's `dark:` variants:
```tsx
className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
```

For forced dark themes: Use the dark variants directly.

---

## 12. File-by-File Change Matrix

| # | File | Phase | Action | Estimated Lines Changed |
|---|------|-------|--------|------------------------|
| 1 | `src/app/kiosk/page.tsx` | P1 | Major rewrite — add method selection post-PIN, theme support | ~100 |
| 2 | `src/app/kiosk/qr/page.tsx` | P2 | Major rewrite — two-column layout, daily log, theme, branding, fix checkIn/checkOut | ~300 |
| 3 | `src/app/kiosk/face/page.tsx` | P3 | Moderate — theme support, remove currentUser fallback, branding | ~80 |
| 4 | `src/app/client-layout.tsx` | P1 | 1-line change — update `isKiosk` check | ~1 |
| 5 | `src/store/kiosk.store.ts` | P7 | Add `"auto"` to kioskTheme type + default | ~5 |
| 6 | `src/components/attendance/employee-qr-display.tsx` | P4 | Moderate — larger QR, countdown, project context, remove manual confirm | ~30 |
| 7 | `src/app/[role]/attendance/_views/employee-view.tsx` | P4, P6 | Moderate — auto-show QR for qr_only, face_or_qr choice UI | ~40 |
| 8 | `src/lib/constants.ts` | P1 | Optional — nav link updates | ~5 |
| 9 | `src/app/kiosk/face/enroll/page.tsx` | — | No change needed | 0 |
| 10 | `src/app/[role]/face-enrollment/page.tsx` | — | No change needed (admin guard already added) | 0 |

**Total estimated lines changed**: ~560

---

## 13. Testing Plan

### 13.1 Manual Testing Scenarios

| # | Scenario | Expected Result |
|---|----------|----------------|
| 1 | Navigate to `/kiosk` → enter correct PIN | Shows method selection (Face + QR cards) |
| 2 | Navigate to `/kiosk` → enter correct PIN → only QR enabled | Auto-redirects to `/kiosk/qr` |
| 3 | Navigate to `/kiosk` → enter correct PIN → only Face enabled | Auto-redirects to `/kiosk/face` |
| 4 | Navigate to `/kiosk/qr` without PIN | Redirects to `/kiosk` |
| 5 | Navigate to `/kiosk/qr` → scan valid QR | Employee name shown, check-in recorded in both event ledger and daily logs |
| 6 | Navigate to `/kiosk/qr` → scan QR of `face_only` project employee | Error: "Requires face verification" |
| 7 | Navigate to `/kiosk/face` → scan enrolled face | Matched name shown prominently, can confirm check-in |
| 8 | Navigate to `/kiosk/face` → scan unenrolled face | "Face not recognized" (no currentUser fallback) |
| 9 | `/kiosk/qr` in light mode (kioskTheme = "auto", user theme = light) | Light background, dark text, readable UI |
| 10 | `/kiosk/qr` in dark mode (kioskTheme = "auto", user theme = dark) | Dark background, light text |
| 11 | `/kiosk/qr` with kioskTheme = "midnight" | Forced dark (slate) regardless of user theme |
| 12 | Employee with `qr_only` project → `/employee/attendance` → Check In → location OK | QR code auto-displayed (no extra button click) |
| 13 | Employee with `face_or_qr` project → Check In → location OK | Choice UI: "Face Scan" or "Show QR" |
| 14 | Employee with `face_only` project, not enrolled → Check In → location OK | "Face Enrollment Required" with link (no bypass) |
| 15 | Activity log persists across page refreshes within same session | Log entries preserved |
| 16 | Activity log clears after midnight | Fresh log on new day |
| 17 | Company logo displays on all kiosk pages | Logo visible in header |
| 18 | No sidebar visible on any `/kiosk/*` route | Fullscreen kiosk mode |

### 13.2 Theme Combinations to Verify

| kioskTheme | User Theme | Result |
|------------|-----------|--------|
| auto | light | Light kiosk UI |
| auto | dark | Dark kiosk UI |
| auto | system (OS=light) | Light kiosk UI |
| auto | system (OS=dark) | Dark kiosk UI |
| dark | light | Dark kiosk UI (overrides user pref) |
| dark | dark | Dark kiosk UI |
| midnight | any | Slate dark kiosk UI |
| charcoal | any | Neutral dark kiosk UI |

---

## 14. Migration Notes

### Breaking Changes

1. **`/kiosk/select` route** is officially removed. Any bookmarks or saved links to this route will hit the generic 404 page.

2. **`kioskTheme` default** changes from `"dark"` to `"auto"`. Existing kiosk installations with persisted settings in localStorage will keep their current `"dark"` value (Zustand persist). Only new installations default to `"auto"`.

3. **QR kiosk now calls `checkIn()`/`checkOut()`** in addition to `appendEvent()`. This means double-recording could theoretically occur if both event ledger and daily logs are consumed. The event ledger is append-only (audit trail) while daily logs are the operational view — this is by design.

4. **Face kiosk removes `currentUser` verify fallback**. If a face is not in the enrolled database, it will NOT be recognized. This is more secure but requires all employees to be enrolled before using face kiosk.

### Rollback Plan

- All changes are client-side (stores, pages, components). No database migrations.
- Git revert to the commit before implementation if issues arise.
- The `kioskTheme` store addition is backward-compatible (new option, old values still work).

### Dependencies

- No new npm packages
- No new API endpoints
- No database changes
- No environment variable changes

---

## Implementation Order

```
Phase 1 → Phase 7 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
  │          │          │          │          │          │          │
  │          │          │          │          │          │          └─ Project routing
  │          │          │          │          │          └─ Employee face (verify works)
  │          │          │          │          └─ Employee QR (auto-show + UX)
  │          │          │          └─ Kiosk face theme + branding
  │          │          └─ Kiosk QR redesign + daily log + theme
  │          └─ Theme infrastructure (store + helper)
  └─ Route restructuring (foundation for all)
```

**Phase 1 first** because all other phases depend on the routing fix and shell skip.  
**Phase 7 before 2/3** because the theme-aware utility classes are used by both kiosk redesigns.

---

*End of plan. Ready for implementation upon approval.*
