# Face Recognition — Security Fixes & Interactive UX Plan

## Overview

This plan addresses all critical/high security issues identified in the face recognition audit and adds interactive real-time guidance to both enrollment and verification flows.

---

## 1. Security Fixes

### 1.1 CRITICAL: `verify-face` API Fails-Open (verify-face/route.ts)
**Issue**: All error/timeout paths return `verified: true`, allowing anyone to bypass liveness detection when AI is unavailable.  
**Fix**: Change all fallback responses to `verified: false`.  
**File**: `src/app/api/attendance/verify-face/route.ts`

### 1.2 HIGH: No Auth on Enrollment API (enroll/route.ts)
**Issue**: `handleEnroll()` accepts `x-user-id` header but doesn't verify the caller is authorized. Anyone can enroll faces for any employee.  
**Fix**: Apply `validateKioskAuth()` OR require the caller's auth context to match the target employeeId. Add kiosk auth check for enroll/delete actions, same as verify/match.  
**File**: `src/app/api/face-recognition/enroll/route.ts`

### 1.3 HIGH: `matchFace` Loads ALL Reference Images Into Memory (face-recognition.service.ts)
**Issue**: `matchFace()` fetches ALL face_enrollments including `reference_image` (base64 strings ~100KB each). With 500 employees this loads ~50MB into memory per request.  
**Fix**: Exclude `reference_image` from the initial query. Only fetch the reference image for the best-match candidate before AI comparison.  
**File**: `src/services/face-recognition.service.ts`

### 1.4 MEDIUM: Kiosk Face Page Missing Auth Headers (kiosk/face/page.tsx)
**Issue**: The match request to `/api/face-recognition/enroll?action=match` doesn't include kiosk auth headers.  
**Fix**: Add `x-kiosk-device-id` and `x-kiosk-pin` headers from kiosk store.  
**File**: `src/app/kiosk/face/page.tsx`

### 1.5 MEDIUM: Kiosk Enrollment Sends Wrong employeeId (kiosk/face/enroll/page.tsx)
**Issue**: Uses `currentUser.id` (which is a Supabase UUID, not an employee ID) and falls back to `"EMP001"`.  
**Fix**: Look up the employee by profileId/email to get the correct `employeeId` (e.g., "EMP027"). Also add kiosk auth headers.  
**File**: `src/app/kiosk/face/enroll/page.tsx`

### 1.6 MEDIUM: Test Thresholds Don't Match Service (face-recognition.test.ts)
**Issue**: Tests hard-code `PREFILTER=0.75` and `STRICT=0.55`, but the service uses `0.50` and `0.38`.  
**Fix**: Update test constants to match the service.  
**File**: `src/__tests__/features/face-recognition.test.ts`

---

## 2. Interactive Enrollment UX

### 2.1 Real-Time Face Direction Detection (face-enrollment/page.tsx)
**Current**: User manually captures 3 angles (front/left/right) with a countdown timer. No feedback during detection.  
**Enhanced**:
- **Live face tracking overlay**: Continuous `detectFace()` runs in a requestAnimationFrame loop during camera state
- **Face position guidance**: Use face detection bounding box position relative to the oval to show directional arrows
- **Head turn detection**: Compare face bounding box width/center-offset to determine if user is facing front/left/right
- **Real-time warnings**:
  - "No face detected" — red overlay when no face in frame
  - "Multiple faces detected" — warning when >1 face
  - "Move closer" / "Move back" — based on bounding box size vs oval
  - "Hold still" — when face position is jittering
  - "Good lighting" / "Too dark" — based on detection confidence
- **Auto-capture**: When face is in correct position + angle for 1.5 seconds, auto-capture without needing button press
- **Step-by-step prompts**: Large animated arrows showing which direction to turn next
- **Progress ring**: Visual ring around the oval that fills as frames are captured

### 2.2 Kiosk Enrollment Enhancement (kiosk/face/enroll/page.tsx)
- Same live feedback as employee enrollment
- Fix employeeId resolution
- Add kiosk auth headers

---

## 3. Interactive Face Verification UX

### 3.1 Real-Time Scanning Feedback (real-face-verification.tsx & kiosk/face/page.tsx)
**Current**: Shows a spinner during multi-frame capture with no feedback.  
**Enhanced**:
- **Live face tracking**: Continuous face detection with oval color changes (red=no face, yellow=detecting, green=locked on)
- **Frame capture progress**: Visual progress bar showing "3/10 frames captured"
- **Quality indicator**: Real-time score display (e.g., "Quality: 85%")
- **Position guidance**: "Center your face", "Move closer", "Hold still"
- **Auto-scan**: Automatically begins scanning when face is detected and centered for 1 second
- **Scanning animation**: Pulsing overlay with frame count during capture

---

## 4. File Change Summary

| File | Changes |
|------|---------|
| `src/app/api/attendance/verify-face/route.ts` | Fix fails-open → `verified: false` on all error paths |
| `src/app/api/face-recognition/enroll/route.ts` | Add kiosk auth for enroll/delete actions |
| `src/services/face-recognition.service.ts` | Exclude reference_image from initial matchFace query |
| `src/app/kiosk/face/page.tsx` | Add kiosk auth headers, live face tracking |
| `src/app/kiosk/face/enroll/page.tsx` | Fix employeeId, add auth, live guidance |
| `src/app/[role]/face-enrollment/page.tsx` | Interactive guided enrollment with auto-capture |
| `src/components/attendance/real-face-verification.tsx` | Live tracking, progress bar, auto-scan |
| `src/__tests__/features/face-recognition.test.ts` | Update thresholds to match service |

---

## 5. Implementation Order

1. Security fixes first (items 1.1–1.6) — prevent vulnerabilities
2. Interactive enrollment UX (items 2.1–2.2)
3. Interactive verification UX (item 3.1)
4. Test validation (`tsc --noEmit` + `jest --ci`)
