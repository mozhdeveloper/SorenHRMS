# NexHRMS Attendance System Documentation

> **Status:** ✅ Production Ready  
> **Last Updated:** April 3, 2026  
> **Version:** 2.0

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Check-In/Check-Out Methods](#check-incheck-out-methods)
4. [Core Features](#core-features)
5. [Flow Diagrams](#flow-diagrams)
6. [Philippine Labor Compliance](#philippine-labor-compliance)
7. [Security & Anti-Cheat](#security--anti-cheat)
8. [API Reference](#api-reference)
9. [Database Schema](#database-schema)
10. [Configuration](#configuration)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The NexHRMS Attendance System is a comprehensive, enterprise-grade attendance management solution that supports multiple verification methods including QR codes, face recognition, and manual check-in. The system is designed with Philippine labor standards in mind and includes robust anti-cheat mechanisms.

### Key Capabilities

| Feature | Status | Description |
|---------|--------|-------------|
| QR Code Check-in | ✅ Complete | Daily HMAC-signed tokens with rotation |
| Face Recognition | ✅ Complete | face-api.js with 128-d embeddings |
| Manual Check-in | ✅ Complete | Admin/HR fallback with audit trail |
| Admin Override | ✅ Complete | Full edit capabilities with logging |
| Shift Management | ✅ Complete | Multiple shifts with grace periods |
| Overtime Tracking | ✅ Complete | Submit/approve/reject workflow |
| Holiday Management | ✅ Complete | PH regular & special holidays |
| Exception Handling | ✅ Complete | Auto-detection of anomalies |
| Offline Support | ✅ Complete | Queue events when offline |
| Geofence Validation | ✅ Complete | GPS-based location verification |

---

## System Architecture

### Dual-Layer Data Model

The attendance system uses a dual-layer architecture for data integrity:

```
┌─────────────────────────────────────────────────────────────┐
│                    EVENTS LAYER (Immutable)                  │
│  Append-only ledger of all attendance events                │
│  EVT-* IDs | IN, OUT, BREAK_START, BREAK_END, OVERRIDE     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    LOGS LAYER (Computed)                     │
│  Daily aggregated view per employee                         │
│  ATT-YYYY-MM-DD-EMP* | checkIn, checkOut, hours, status    │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Frontend:** Next.js 14, React, TypeScript
- **State Management:** Zustand with persistence
- **Face Recognition:** face-api.js (TensorFlow.js)
- **QR Scanning:** BarcodeDetector API + jsQR fallback
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth

### Store Structure

```typescript
// attendance.store.ts
interface AttendanceStore {
  events: AttendanceEvent[];      // Immutable event ledger
  logs: AttendanceLog[];          // Computed daily logs
  exceptions: AttendanceException[];
  overtimeRequests: OvertimeRequest[];
  shiftTemplates: ShiftTemplate[];
  employeeShifts: Record<string, string>;
  holidays: Holiday[];
  penalties: Penalty[];
}
```

---

## Check-In/Check-Out Methods

### 1. QR Code Attendance

**Flow:**
```
Employee App → Generate Daily QR → Scan at Kiosk → Validate → Clock In/Out
```

**Features:**
- Daily HMAC-signed tokens (rotate at midnight)
- Multi-use per day (can scan multiple times)
- Location validation (optional)
- Project-based verification method override

**Payload Format:**
```
SDS-DAILY-{employeeId}-{date}-{signature}
```

**API Endpoint:** `POST /api/attendance/validate-qr`

### 2. Face Recognition

**Flow:**
```
Camera Init → Face Detection → Multi-frame Capture → Embedding Match → Clock In/Out
```

**Features:**
- Real-time face tracking (~5fps)
- Multi-frame capture (7 frames, need 4+ valid)
- Consistency check (rejects movement/lighting changes)
- 128-dimensional embedding vectors
- Auto-confirm with 3-second countdown

**Technical Details:**
- Detection score threshold: 0.75
- Consistency threshold: 0.35 (max pairwise distance)
- Matching threshold: 0.6 (Euclidean distance)

**API Endpoint:** `POST /api/face-recognition/enroll?action=match`

### 3. Manual Check-In (Fallback)

**Purpose:** Admin/HR can manually record attendance when biometric systems fail.

**Predefined Reasons:**
- Biometric system failure
- Network/system downtime
- Visitor/contractor check-in
- Employee forgot badge/phone
- Medical/emergency situation
- Device malfunction
- Custom reason

**API Endpoint:** `POST /api/attendance/manual-checkin`

**Audit Trail:** Every manual check-in creates:
- `manual_checkins` record
- `attendance_events` entry (device_id: "MANUAL_CHECKIN")
- `audit_logs` entry with before/after snapshots

---

## Core Features

### Shift Management

**Default Shifts:**

| Shift | Start | End | Grace | Break |
|-------|-------|-----|-------|-------|
| Day | 08:00 | 17:00 | 15 min | 60 min |
| Mid | 12:00 | 21:00 | 15 min | 60 min |
| Night | 22:00 | 06:00 | 15 min | 60 min |

**Late Calculation:**
```typescript
lateMinutes = checkInTime - (shiftStart + gracePeriod)
```

**Overnight Shift Handling:**
```typescript
// Hours calculation handles day boundary
if (outTotal < inTotal) {
  diffMin = 24 * 60 - inTotal + outTotal;
}
```

### Exception Auto-Detection

The system automatically generates exceptions for:

| Exception | Trigger |
|-----------|---------|
| `missing_in` | No IN event for scheduled work day |
| `missing_out` | IN event but no OUT event |
| `duplicate_scan` | Multiple IN events same day |
| `out_of_geofence` | Check-in outside allowed radius |
| `device_mismatch` | Different device IDs for same day |

### Overtime Management

**Workflow:**
```
Submit Request → Pending → Approve/Reject → Apply to Payroll
```

**Fields:**
- Employee ID
- Date
- Hours requested
- Reason
- Status (pending/approved/rejected)
- Reviewed by (approver ID)
- Rejection reason (if applicable)

### Holiday Types

| Type | Description | Pay Impact |
|------|-------------|------------|
| `regular` | Regular holiday | 200% pay |
| `special` | Special non-working | 130% pay |
| `special_working` | Special working day | 130% pay |
| `special_non_working` | Special non-working holiday | No work required |

---

## Flow Diagrams

### Main Attendance Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         KIOSK ENTRY                              │
│                                                                  │
│    /kiosk → PIN Entry (6-digit) → Verify → Select Method        │
│                                                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   FACE KIOSK     │ │    QR KIOSK      │ │  MANUAL (Admin)  │
│                  │ │                  │ │                  │
│ Camera Init      │ │ Camera Init      │ │ Select Employee  │
│ Face Detection   │ │ QR Scan          │ │ Select Reason    │
│ Multi-frame      │ │ Validate Payload │ │ Submit           │
│ Match Embedding  │ │ Check Project    │ │                  │
│ Auto-confirm     │ │                  │ │                  │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      CLOCK OPERATION                             │
│                                                                  │
│  Mode = IN?                          Mode = OUT?                │
│     ↓                                   ↓                        │
│  Create EVT-* (IN)                   Create EVT-* (OUT)         │
│  Create/Update ATT-*                 Calculate hours            │
│  Calculate late minutes              Update ATT-*               │
│  → Based on shift + grace            → Handle overnight         │
│                                                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                      DATABASE WRITE                              │
│                                                                  │
│  → attendance_events (immutable ledger)                         │
│  → attendance_logs (daily aggregation)                          │
│  → audit_logs (if manual/override)                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Admin Override Flow

```
Admin View → Select Log → Override Dialog
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         Edit Times      Change Status    Adjust Late
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                   Save → Create OVERRIDE Event
                              │
                              ▼
                   Audit Log with before/after
```

---

## Philippine Labor Compliance

### Time & Attendance

| Requirement | Implementation |
|-------------|----------------|
| 8-hour work day | Default shift duration |
| 15-minute grace period | Configurable per shift |
| Late deductions | Auto-calculated from check-in time |
| Overtime (125%) | Separate approval workflow |
| Night differential (+10%) | Applied 10pm-6am |
| Rest day premium (30%) | Holiday/weekend detection |

### Government Deductions (Integrated with Payroll)

| Deduction | Rate | Implementation |
|-----------|------|----------------|
| SSS | 4.5% employee | Bracket-based calculation |
| PhilHealth | 2.5% employee | Percentage of salary |
| Pag-IBIG | ₱100 cap | Capped at ₱100/month |
| Withholding Tax | TRAIN brackets | BIR tax tables |

### Leave Types

- Vacation Leave (VL) - 5 days minimum
- Sick Leave (SL) - 5 days minimum
- Emergency Leave (EL)
- Maternity Leave (ML) - 105 days
- Paternity Leave (PL) - 7 days
- Solo Parent Leave (SPL) - 7 days

---

## Security & Anti-Cheat

### Kiosk Security

| Feature | Description |
|---------|-------------|
| PIN Protection | 6-digit code to access kiosk |
| Session Timeout | Auto-logout after 5 minutes |
| Rate Limiting | Max requests per IP |
| Device ID | Persistent kiosk identification |

### Anti-Spoofing Measures

| Detection | Action |
|-----------|--------|
| Developer tools open | Lockout penalty |
| Mock GPS provider | Reject + penalty |
| Location teleportation | Reject (>300 km/h) |
| Automation/WebDriver | Block check-in |
| Suspiciously precise GPS | Flag as suspicious |

### Penalty System

```typescript
interface Penalty {
  employeeId: string;
  reason: string;
  triggeredAt: string;
  penaltyUntil: string;  // Lockout duration
  resolved: boolean;
}
```

Default penalty duration: 30 minutes (configurable)

---

## API Reference

### Attendance Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/attendance/validate-qr` | Validate QR and clock in/out |
| POST | `/api/attendance/verify-face` | Face recognition verification |
| POST | `/api/attendance/manual-checkin` | Manual check-in (Admin/HR) |
| POST | `/api/attendance/sync-offline` | Sync offline events |
| GET | `/api/attendance/daily-qr` | Generate daily QR for employee |
| POST | `/api/attendance/reset-today` | Reset today's log for employee |

### Face Recognition Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/face-recognition/enroll` | Enroll face embedding |
| POST | `/api/face-recognition/enroll?action=match` | Match face against enrolled |

---

## Database Schema

### attendance_events
```sql
CREATE TABLE attendance_events (
  id VARCHAR PRIMARY KEY,           -- EVT-{nanoid}
  employee_id VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL,      -- IN, OUT, BREAK_START, BREAK_END, OVERRIDE
  timestamp_utc TIMESTAMPTZ NOT NULL,
  device_id VARCHAR,
  project_id VARCHAR,
  performed_by VARCHAR,             -- For manual/override
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### attendance_logs
```sql
CREATE TABLE attendance_logs (
  id VARCHAR PRIMARY KEY,           -- ATT-{date}-{empId}
  employee_id VARCHAR NOT NULL,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  hours DECIMAL(4,1),
  status VARCHAR DEFAULT 'absent',  -- present, absent, on_leave
  late_minutes INTEGER,
  project_id VARCHAR,
  location_snapshot JSONB,
  face_verified BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### manual_checkins
```sql
CREATE TABLE manual_checkins (
  id VARCHAR PRIMARY KEY,           -- MCI-{nanoid}
  employee_id VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL,      -- IN, OUT
  reason_id VARCHAR,
  custom_reason TEXT,
  performed_by VARCHAR NOT NULL,
  timestamp_utc TIMESTAMPTZ NOT NULL,
  project_id VARCHAR,
  notes TEXT
);
```

---

## Configuration

### Kiosk Settings (kiosk.store.ts)

```typescript
interface KioskSettings {
  // Check-in methods
  enablePin: boolean;
  enableQr: boolean;
  enableFace: boolean;
  
  // Display
  kioskTheme: "auto" | "dark" | "midnight" | "charcoal";
  clockFormat: "12h" | "24h";
  showClock: boolean;
  showDate: boolean;
  
  // Security
  adminPin: string;
  requireGeofence: boolean;
  
  // Anti-cheat
  devOptionsPenaltyEnabled: boolean;
  devOptionsPenaltyMinutes: number;
  devOptionsPenaltyApplyTo: "devtools" | "spoofing" | "both";
}
```

### Shift Template

```typescript
interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  gracePeriod: number;    // minutes
  breakDuration: number;  // minutes
  workDays: number[];     // 0=Sun, 1=Mon, ..., 6=Sat
}
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| QR not scanning | Camera permissions | Check browser permissions |
| Face not detected | Poor lighting | Improve lighting conditions |
| Check-in rejected | Geofence violation | Verify employee location |
| Locked out | DevTools penalty | Wait for penalty to expire |
| Events not syncing | Network issue | Check offline queue |

### Debug Logging

Enable console logs in kiosk pages:
```javascript
// Browser console shows detailed logs
[kiosk-face] Starting multi-frame face capture...
[kiosk-face] Frame 1: score=0.912 ✓
[kiosk-face] Server response: { ok: true, matched: true, distance: 0.42 }
```

### Offline Recovery

If kiosk loses network:
1. Events are queued locally in `offline-queue.store`
2. When network returns, auto-sync triggers
3. Events older than 24h require manual correction
4. Duplicate events within 5 minutes are skipped

---

## Completeness Checklist

| Component | Status | Notes |
|-----------|--------|-------|
| QR Check-in/out | ✅ | Daily HMAC tokens |
| Face Check-in/out | ✅ | Multi-frame + consistency |
| Manual Fallback | ✅ | Admin/HR with audit |
| Admin Override | ✅ | Full CRUD + bulk |
| Shift Management | ✅ | 3 default shifts |
| Exception Handling | ✅ | 5 auto-detection types |
| Overtime Workflow | ✅ | Submit/approve/reject |
| Holiday Management | ✅ | 4 holiday types |
| Geofence Validation | ✅ | GPS + accuracy check |
| Anti-Cheat | ✅ | DevTools + spoofing |
| Offline Support | ✅ | Queue + auto-sync |
| PH Labor Compliance | ✅ | Verified |
| Audit Trail | ✅ | Full logging |
| Dashboard Widgets | ✅ | Live stats + enrollment |

---

**The NexHRMS Attendance System is complete and production-ready.**
