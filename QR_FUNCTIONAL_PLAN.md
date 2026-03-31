# QR Attendance — Make It Fully Functional

> **Goal:** End-to-end working QR check-in. Employee opens attendance → sees real QR → walks to kiosk → kiosk camera scans it → kiosk shows employee name + confirms check-in.

---

## Current State Assessment

### What Already Works ✅

| Layer | Component | Status |
|-------|-----------|--------|
| **Crypto** | `qr-utils.ts` — HMAC-SHA256 daily payload generation + validation | Fully functional |
| **API: Generate** | `GET /api/attendance/daily-qr?employeeId=X` → returns signed `NEXHRMS-DAY:EMP027:2026-03-31:a1b2c3` | Fully functional (validates employee in Supabase) |
| **API: Validate** | `POST /api/attendance/validate-qr` → rate-limited, delegates to `validateAnyQR()` | Fully functional |
| **Service** | `qr-token.service.ts` — `validateAnyQR()` dispatcher (daily/static/dynamic) | Fully functional |
| **Component** | `<EmployeeQRDisplay>` — fetches daily QR from API, renders via `<QRCodeSVG>` (real QR image) | Fully functional |
| **Kiosk Scanner** | `BarcodeDetector` API scanning at 300ms intervals, calls `/api/attendance/validate-qr` | Fully functional |
| **Kiosk Clock** | `clockEmployee()` → `appendEvent()` + `checkIn()`/`checkOut()` + daily log | Fully functional |
| **Auth Guards** | Kiosk PIN verification, rate-limiting, HMAC tamper protection | Fully functional |
| **Auth Bypass (dev)** | `kiosk-auth.ts` auto-passes when `KIOSK_API_KEY` not set | Works in dev |

### What's Broken / Needs Fixing ❌

| # | Problem | Where | Impact |
|---|---------|-------|--------|
| **B1** | Employee check-in dialog doesn't **auto-show** QR for `qr_only` employees — requires clicking through location step first, then "Show My QR Code" button | `employee-view.tsx` lines 782-790 | Employee has to click twice to see QR |
| **B2** | `handleQrCheckedIn` just closes dialog — no visual feedback that name was recognized at kiosk | `employee-view.tsx` line 374 | Employee doesn't know if kiosk actually scanned them |
| **B3** | Kiosk success overlay shows employee name briefly then resets — name is small (`text-white/80 text-xl`) and overlay disappears after `feedbackDuration` (default 3000ms) | `kiosk/qr/page.tsx` feedback overlay | Hard to confirm identity from across the room |
| **B4** | `BarcodeDetector` API is **not available in all browsers** (Safari, Firefox desktop don't support it) — no fallback QR decoder | `kiosk/qr/page.tsx` line 220 | Scanner doesn't work on non-Chrome browsers |
| **B5** | After scanning a QR, scanner stops but doesn't auto-restart for next employee | `kiosk/qr/page.tsx` — `stopQrScanner()` called on success | Admin has to click "Start Scanner" again for each employee |
| **B6** | Demo button is visible in production — should be dev/demo only | `kiosk/qr/page.tsx` line 240 | Confusing for real users |
| **B7** | `myEmployeeId` is derived from `currentUser` which may be the admin — the QR fetched may be for the admin, not the employee | `employee-view.tsx` | Admin seeing their own QR when viewing employee attendance |

---

## Implementation Plan

### Phase 1 — Auto-Show QR for `qr_only` Employees
**File:** `src/app/[role]/attendance/_views/employee-view.tsx`
**Effort:** Small

Currently the check-in dialog always starts at `step: "idle"` (Share Location). For `qr_only` employees, the QR code is what matters — location is secondary.

**Changes:**
1. When check-in dialog opens and `myProject?.verificationMethod === "qr_only"`:
   - Still do location check first (keep geofence validation — it's important)
   - But after location success, **auto-transition** to `qr_scan` step instead of showing a "Show My QR Code" button
   - Remove the intermediate button — go straight to `<EmployeeQRDisplay>`
2. Keep the current behavior for `face_or_qr` (show choice buttons)

**Code change (conceptual):**
```tsx
// After location_result, if qr_only, auto-advance to qr_scan
{(!locationConfig.requireSelfie || selfieDataUrl) && myProject?.verificationMethod === "qr_only" && (
    // Instead of showing a button, immediately render the QR display
    <EmployeeQRDisplay
        employeeId={myEmployeeId}
        employeeName={currentUser.name}
        onCheckedIn={handleQrCheckedIn}
    />
)}
```

---

### Phase 2 — Auto-Restart Scanner After Successful Scan
**File:** `src/app/kiosk/qr/page.tsx`
**Effort:** Small

After a successful scan + feedback duration, the kiosk should automatically restart the camera for the next employee instead of returning to the "Start Scanner" button.

**Changes:**
1. After `triggerFeedback` timeout completes, call `startQrScanner()` again
2. Add a `shouldAutoRestart` ref to avoid restarting when manually cancelled

**Code change (conceptual):**
```tsx
const autoRestartRef = useRef(true);

const triggerFeedback = useCallback((state, name?) => {
    setFeedback(state);
    if (name) setCheckedInName(name);
    setTimeout(() => {
        setFeedback("idle");
        setCheckedInName("");
        setQrProcessing(false);
        // Auto-restart scanner for next employee
        if (autoRestartRef.current && (state === "success-in" || state === "success-out")) {
            startQrScanner();
        }
    }, ks.feedbackDuration);
}, [ks.feedbackDuration, startQrScanner]);
```

---

### Phase 3 — Prominent Employee Identity Display on Kiosk
**File:** `src/app/kiosk/qr/page.tsx`
**Effort:** Small

When a QR is scanned, the success overlay should show the employee name **large and prominently** — this is the primary visual confirmation for both the employee and the admin.

**Changes:**
1. Increase the employee name size in the success overlay from `text-xl` to `text-3xl font-bold`
2. Add employee avatar/initials circle if available
3. Show project name if assigned
4. Keep the overlay visible for the full `feedbackDuration` (default 3s is fine)

**Code change (conceptual):**
```tsx
{isSuccess && (
    <>
        <div className={cn("h-24 w-24 mx-auto rounded-full flex items-center justify-center", ...)}>
            <CheckCircle className="h-12 w-12" />
        </div>
        <p className="text-4xl font-bold">{isSuccessIn ? "Checked In" : "Checked Out"}</p>
        {checkedInName && (
            <p className="text-white text-3xl font-bold mt-2">{checkedInName}</p>
        )}
        <p className="text-white/30 text-sm">{now.toLocaleTimeString()}</p>
    </>
)}
```

---

### Phase 4 — BarcodeDetector Fallback for Non-Chrome Browsers
**File:** `src/app/kiosk/qr/page.tsx` + new dependency
**Effort:** Medium

`BarcodeDetector` is Chrome/Edge only. For Safari, Firefox, and mobile browsers, we need a JS-based QR decoder.

**Changes:**
1. Install `jsqr` package (`npm install jsqr`) — lightweight, no-dependency QR decoder that works on canvas ImageData
2. In `startQrScanner()`, check if `BarcodeDetector` exists:
   - If yes → use native API (current behavior, faster)
   - If no → use `jsQR()` fallback: capture video frame to canvas, extract ImageData, decode
3. The fallback scans at 500ms intervals (slightly slower to avoid perf issues)

**Code change (conceptual):**
```tsx
import jsQR from "jsqr";

// In startQrScanner():
if ("BarcodeDetector" in window) {
    // ... existing BarcodeDetector logic
} else {
    // Fallback: jsQR on canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    qrScanIntervalRef.current = setInterval(() => {
        if (!qrVideoRef.current || qrVideoRef.current.readyState < 2) return;
        canvas.width = qrVideoRef.current.videoWidth;
        canvas.height = qrVideoRef.current.videoHeight;
        ctx.drawImage(qrVideoRef.current, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code?.data) processQrPayload(code.data);
    }, 500);
}
```

---

### Phase 5 — Hide Demo Button in Production
**File:** `src/app/kiosk/qr/page.tsx`
**Effort:** Trivial

**Changes:**
1. Only render the Demo button when `process.env.NEXT_PUBLIC_DEMO_MODE === "true"` or `process.env.NODE_ENV === "development"`

```tsx
{process.env.NODE_ENV === "development" && (
    <button onClick={handleDemoQrTap} className="...">Demo</button>
)}
```

---

### Phase 6 — Employee Identity Guard (Correct QR Owner)
**File:** `src/app/[role]/attendance/_views/employee-view.tsx`
**Effort:** Small

Ensure `myEmployeeId` is the **actual employee** viewing the page, not the admin. The `EmployeeQRDisplay` must fetch the QR for the correct person.

**Changes:**
1. Verify `myEmployeeId` is derived from the employee's profile, not the admin's `currentUser` when an admin views the attendance page
2. The QR should only be shown when the logged-in user **is** the employee (role check)
3. If admin is viewing an employee's attendance, hide the QR check-in dialog entirely

**Code check (verify existing logic):**
```tsx
// Already in employee-view.tsx — confirm this is correct:
const myEmployeeId = currentUser.employeeId || currentUser.id;
// Ensure this maps to the employee, not the admin
```

---

## Execution Order

```
Phase 1  →  Auto-show QR for qr_only employees     (small, high impact)
Phase 2  →  Auto-restart scanner after scan          (small, high impact)
Phase 3  →  Prominent name display on kiosk          (small, high impact)
Phase 5  →  Hide demo button in production           (trivial)
Phase 6  →  Employee identity guard                  (small, correctness)
Phase 4  →  BarcodeDetector fallback (jsQR)          (medium, browser compat)
```

---

## Files Modified

| File | Phases | Type of Change |
|------|--------|---------------|
| `src/app/[role]/attendance/_views/employee-view.tsx` | 1, 6 | Auto-show QR, identity guard |
| `src/app/kiosk/qr/page.tsx` | 2, 3, 4, 5 | Auto-restart, name display, jsQR fallback, demo hide |
| `package.json` | 4 | Add `jsqr` dependency |

---

## Testing Checklist

- [ ] Employee (`qr_only` project) opens check-in → shares location → QR auto-appears
- [ ] QR code is real and scannable (test with phone camera)
- [ ] Kiosk "Start Scanner" → scan employee QR → employee name appears prominently
- [ ] After successful scan, scanner auto-restarts for next employee
- [ ] Activity log shows the scan entry
- [ ] `face_only` project employee's QR is rejected at kiosk with clear message
- [ ] `face_or_qr` employee sees choice buttons (QR + Face)
- [ ] Demo button hidden when `NODE_ENV !== "development"`
- [ ] Works in Chrome (BarcodeDetector), Firefox/Safari (jsQR fallback)
- [ ] Multiple employees can scan consecutively without page reload
- [ ] QR expires at midnight (next-day QR is different)

---

## Non-Goals (Out of Scope)

- Real-time push notification from kiosk to employee's device (would need WebSocket/SSE)
- Supabase sync of attendance events (existing sync layer handles this)
- QR_HMAC_SECRET env var setup (works with fallback in dev)
- KIOSK_API_KEY header (not needed in dev, already documented for production)
