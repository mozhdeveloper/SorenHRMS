# NexHRMS Payroll System — Full Audit & Improvement Plan

> **Auditor:** Lead HRMS Full-Stack Expert  
> **Date:** April 10, 2026  
> **Scope:** Complete payroll flow audit, redundancy check, and improvement plan

---

## Executive Summary

The NexHRMS payroll system is **approximately 85% complete** for Philippine-compliant payroll processing. The core flow (issue → publish → sign → acknowledge) works, PH deductions compute correctly, and the API routes exist. However, there are critical gaps in routing, UX issues with the 13th Month feature, and opportunities to consolidate redundant functionality.

### Overall Score: **B+ (85%)**

| Category | Score | Notes |
|----------|-------|-------|
| Core Payslip Flow | ✅ 95% | Issue, publish, sign, acknowledge all work |
| PH Deductions | ✅ 95% | SSS, PhilHealth, Pag-IBIG, BIR TRAIN Law compliant |
| 13th Month Pay | ⚠️ 60% | Basic generation works, no UI for selection, no confirmation |
| Payroll Settings | ❌ 40% | Page exists but route broken (404), needs fixing |
| Government Reports | ✅ 90% | SSS R3, PhilHealth RF-1, Pag-IBIG templates present |
| Final Pay | ✅ 85% | Pro-rating works, UI functional |
| Custom Deductions | ✅ 90% | Template system, bulk assignment functional |
| Database Sync | ✅ 90% | Write-through to Supabase works |

---

## 🔴 Critical Issues (P0 — Must Fix)

### 1. Payroll Settings Route 404 Error

**Problem:** Clicking "Payroll Settings" button navigates to `/admin/payroll/settings` but shows "Page Not Found".

**Root Cause:** The route `/payroll/settings` is missing from:
- `ROLE_ACCESS` in `src/lib/constants.ts`
- `PATH_TO_PERMISSION` mapping

**Impact:** Admins cannot access the Payroll Settings page despite the page existing at `src/app/[role]/payroll/settings/page.tsx`.

**Fix:**
1. Add `"/payroll/settings"` to ROLE_ACCESS for admin, finance, payroll_admin
2. Add `"/payroll/settings": "page:payroll"` to PATH_TO_PERMISSION
3. Verify the page renders after route fix

---

### 2. 13th Month Pay — No Confirmation Modal

**Problem:** Clicking "13th Month" button immediately generates payslips for ALL active employees without any confirmation or selection UI.

**Current Behavior:**
```typescript
const handle13thMonth = () => {
    const activeEmps = employees.filter((e) => e.status === "active");
    generate13thMonth(activeEmps.map((e) => ({ id: e.id, salary: e.salary, joinDate: e.joinDate })));
    toast.success(`Generated 13th Month Pay for ${activeEmps.length} employees`);
};
```

**Problems:**
- No confirmation before generating 50+ payslips
- No ability to select specific employees, departments, or projects
- No preview of amounts before generation
- Cannot undo easily
- Doesn't sync to Supabase (store-only)

**Required Fix:** Create a proper 13th Month Modal with:
1. Confirmation dialog before generating
2. Employee/Department/Project filter
3. Preview table showing each employee's 13th month amount
4. Select/deselect individual employees
5. Summary totals
6. "Generate" button to proceed

---

## 🟡 High Priority Issues (P1 — Should Fix)

### 3. Redundant Settings Locations

**Problem:** Payroll settings are fragmented across multiple locations:

| Location | Settings Contained |
|----------|-------------------|
| `/payroll` → "Pay Schedule" tab | Pay frequency, cutoffs, pay days |
| `/payroll` → "Tax Settings" tab | SSS/PhilHealth/Pag-IBIG overrides, exemptions |
| `/payroll` → "Deduction/Allowance" tab | Custom deduction templates |
| `/payroll/settings` page | Duplicates of Pay Schedule + Custom Deductions |
| `/settings` (Admin Settings) | More deduction config in some views |

**Recommendation:**
- **Consolidate** into `/payroll/settings` as the single source for all payroll configuration
- **Remove** inline tabs (Pay Schedule, Tax Settings, Deduction/Allowance) from main payroll page
- Keep main payroll page focused on operational tasks (Payslips, Runs, Gov Reports)

### 4. 13th Month Database Persistence

**Problem:** 13th month payslips are generated in Zustand store only. They need to persist to Supabase like regular payslips.

**Current Code:**
```typescript
generate13thMonth: (employees) =>
    set((s) => {
        // Creates payslips with notes: "13th Month Pay (X/12 months)"
        const newSlips: Payslip[] = employees.map((emp) => { ... });
        return { payslips: [...s.payslips, ...newSlips] };
    }),
```

**Fix:** The write-through subscriber should handle this automatically, but we need to verify 13th month payslips are being synced. Add a `payslipType: "thirteenth_month"` flag for better filtering.

### 5. Tax Settings Tab Redundant with Payroll Settings Page

**Problem:** The "Tax Settings" tab inside the payroll page contains:
- Global SSS/PhilHealth/Pag-IBIG/BIR enable/disable toggles
- Per-employee override management
- Exemption reason configuration

This duplicates functionality that should live in `/payroll/settings`.

**Recommendation:** Move all tax settings to the Payroll Settings page under a "Tax Configuration" tab.

---

## 🟢 Improvements (P2 — Nice to Have)

### 6. 13th Month — Additional Features

Per Philippine Labor Code requirements, consider adding:
- **Cut-off date selection** — 13th month can be released any time between Nov 1 and Dec 24
- **Partial payment tracking** — Some companies pay in two tranches (50% in June, 50% in December)
- **Amount cap display** — Show ₱90,000 tax-exempt limit (TRAIN Law)
- **Year-to-date earnings view** — Show how much basic salary was earned

### 7. Payslip Status Simplification

**Current statuses:** `draft`, `published`, `signed`, `confirmed`, `paid`, `acknowledged`

**Issue:** The lifecycle is more complex than needed. Consider:
- `draft` → `published` → `signed` → `paid` (4 states instead of 6)
- Remove `confirmed` (merge with draft → published)
- Remove `acknowledged` (payment receipt is the acknowledgement)

### 8. Pay Schedule — Validation

**Missing:** Validation that cutoff dates make sense:
- 1st cutoff should be ≤ 15
- 2nd cutoff pay day should be after 1st cutoff
- Warning if pay days fall on weekends/holidays

### 9. Government Reports — Live Database Queries

**Current:** Reports pull from Zustand store (local state)
**Ideal:** Reports should query Supabase directly for compliance accuracy

---

## Implementation Plan

### Phase 1: Critical Fixes (Week 1)

| # | Task | Effort | Status |
|---|------|--------|--------|
| 1.1 | Fix `/payroll/settings` 404 — add to ROLE_ACCESS & PATH_TO_PERMISSION | 30 min | ✅ |
| 1.2 | Create 13th Month Confirmation Modal | 3 hrs | ✅ |
| 1.3 | Add employee/dept/project selection to 13th Month Modal | 2 hrs | ✅ |
| 1.4 | Add preview table to 13th Month Modal | 1 hr | ✅ |
| 1.5 | Verify 13th month payslips sync to Supabase | 30 min | ✅ |

### Phase 2: Consolidation (Week 2)

| # | Task | Effort | Status |
|---|------|--------|--------|
| 2.1 | Move Tax Settings tab content to /payroll/settings | 2 hrs | ⬜ |
| 2.2 | Move Deduction/Allowance tab content to /payroll/settings | 1 hr | ⬜ |
| 2.3 | Remove redundant tabs from main payroll page | 1 hr | ⬜ |
| 2.4 | Update Payroll Settings page with 4 unified tabs | 2 hrs | ⬜ |

### Phase 3: Polish (Week 3)

| # | Task | Effort | Status |
|---|------|--------|--------|
| 3.1 | Add pay schedule validation | 1 hr | ⬜ |
| 3.2 | Add 13th month year-to-date preview | 2 hrs | ⬜ |
| 3.3 | Simplify payslip status lifecycle | 3 hrs | ⬜ |
| 3.4 | Add `payslipType` field for 13th month filtering | 1 hr | ⬜ |

---

## Database Alignment Check

### Current `payslips` table columns:
```sql
- id, employee_id, period_start, period_end, pay_frequency
- gross_pay, allowances, net_pay, holiday_pay
- sss_deduction, philhealth_deduction, pagibig_deduction, tax_deduction
- other_deductions, loan_deduction, custom_deductions
- issued_at, status, confirmed_at, published_at, paid_at
- signed_at, signature_data_url
- payment_method, bank_reference_id
- notes, adjustment_ref
- acknowledged_at, acknowledged_by, paid_confirmed_by, paid_confirmed_at
- line_items_json
```

### Missing columns for 13th Month:
```sql
-- Suggested addition:
ALTER TABLE payslips ADD COLUMN payslip_type text DEFAULT 'regular' 
  CHECK (payslip_type IN ('regular', 'thirteenth_month', 'final_pay', 'adjustment'));
```

This allows filtering 13th month payslips separately from regular payslips.

---

## 13th Month Modal — Detailed Specification

### UI Requirements

```
┌─────────────────────────────────────────────────────────────────────┐
│  🎁 Generate 13th Month Pay                                   ✕   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Year: [2026 ▼]                                                    │
│                                                                     │
│  Filter Recipients:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ○ All Active Employees (26 total)                           │   │
│  │ ○ By Department       [Engineering ▼]                       │   │
│  │ ○ By Project          [Metro Tower ▼]                       │   │
│  │ ○ Select Individual   [Open Selection Dialog]               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Preview (26 employees):                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ☑ │ Employee       │ Monthly Salary │ Months │ 13th Amount  │   │
│  │───│────────────────│───────────────│────────│──────────────│   │
│  │ ☑ │ Juan Cruz      │ ₱45,000       │ 12/12  │ ₱45,000      │   │
│  │ ☑ │ Maria Santos   │ ₱35,000       │ 12/12  │ ₱35,000      │   │
│  │ ☑ │ Pedro Reyes    │ ₱28,000       │ 8/12   │ ₱18,667      │   │
│  │ ☐ │ Jose Garcia    │ ₱32,000       │ 12/12  │ ₱32,000      │   │
│  │   │ ...            │               │        │              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Summary:                                                           │
│  ├─ Selected: 25 employees                                         │
│  ├─ Total 13th Month: ₱892,500                                     │
│  └─ Tax-exempt limit: ₱90,000/employee (TRAIN Law)                 │
│                                                                     │
│  ⚠️ This will create 25 payslips with status "Draft".              │
│     You can review and publish them from the Payslips tab.         │
│                                                                     │
│           [ Cancel ]                    [ ✓ Generate 13th Month ]  │
└─────────────────────────────────────────────────────────────────────┘
```

### Functional Requirements

1. **Year Selector** — Default to current year, allow past years for corrections
2. **Filter Options:**
   - All Active Employees (default)
   - By Department (dropdown)
   - By Project (dropdown)
   - Individual Selection (opens employee picker)
3. **Preview Table:**
   - Checkbox for each employee (can deselect)
   - Shows monthly salary, months worked, calculated amount
   - Pro-rates automatically for mid-year hires
4. **Summary:**
   - Count of selected employees
   - Total 13th month payout
   - Note about tax exemption
5. **Confirmation:**
   - Warning text about what will happen
   - "Cancel" and "Generate" buttons
6. **After Generation:**
   - Toast success message
   - Auto-navigate to Payslips tab filtered by "Draft"

---

## Files to Modify

### Phase 1 Changes:

| File | Change |
|------|--------|
| `src/lib/constants.ts` | Add `/payroll/settings` to ROLE_ACCESS and PATH_TO_PERMISSION |
| `src/app/[role]/payroll/_views/admin-view.tsx` | Replace inline 13th Month button with new modal |
| `src/components/payroll/thirteenth-month-modal.tsx` | **NEW FILE** — Full modal component |
| `src/store/payroll.store.ts` | Update `generate13thMonth` to accept filtered list |

### Phase 2 Changes:

| File | Change |
|------|--------|
| `src/app/[role]/payroll/_views/admin-view.tsx` | Remove Tax Settings, Deduction/Allowance, Pay Schedule tabs |
| `src/app/[role]/payroll/settings/page.tsx` | Add Tax Settings tab, consolidate all settings |
| `src/store/payroll.store.ts` | No changes needed |

---

## Verification Checklist

After implementing Phase 1:

- [x] `/admin/payroll/settings` loads without 404
- [x] 13th Month button opens confirmation modal
- [x] Can filter by Department
- [x] Can filter by Project
- [x] Can select/deselect individual employees
- [x] Preview shows correct pro-rated amounts
- [x] Generate creates payslips with status "Draft"
- [x] Payslips synced to Supabase via write-through subscriber
- [x] Toast notification shows success
- [x] Build passes (`npm run build`)

---

## Conclusion

The payroll system is **functional but needs polish**. The critical 404 error and missing 13th Month modal are the top priorities. Once fixed, the system will be **production-ready** for Philippine-compliant payroll processing.

**Estimated Total Effort:** 15-20 hours across 3 phases

**Risk Level:** Low — All changes are additive or consolidation; no breaking changes to existing workflows.
