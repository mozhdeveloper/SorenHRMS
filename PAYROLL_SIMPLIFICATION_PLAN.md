# Payroll Simplification & Custom Deductions Plan

> **Date:** April 9, 2026  
> **Author:** Lead Full-Stack Developer  
> **Scope:** Complete payroll flow overhaul, custom deductions CRUD, per-employee deduction exemptions

---

## 1. Current State Analysis

### 1.1 Current Payslip Status Flow (5 states — overcomplicated)

```
issued → confirmed → published → paid → acknowledged
```

**Problems:**
- **"confirmed"** is confusing — admin "confirms" but this is really just review, not a meaningful gate
- **"paid"** before "acknowledged" means employee sees payslip was paid but hasn't signed yet — backwards
- **"acknowledged"** is a redundant concept — signing IS the acknowledgment
- Employees are confused about when to sign vs when to acknowledge

### 1.2 Current Payroll Run Status Flow (5 states)

```
draft → validated → locked → published → paid
```

**Problems:**
- **"validated"** is never used in practice (store accepts `draft` directly to `locked`)
- **"published"** and **"paid"** are separate but functionally equivalent after lock
- Too many steps for admin/finance

### 1.3 Current Deduction System

- Government deductions (SSS, PhilHealth, Pag-IBIG, BIR) exist with per-employee overrides and global defaults
- The override modes are: `auto | exempt | percentage | fixed`
- **Problem:** This is stored ONLY in the Zustand store (client-side `localStorage`), NOT in the database
- **Problem:** No custom deduction/allowance templates — only a flat `otherDeductions` number field
- **Problem:** Contract employees can't be exempted properly — no `deduction_exempt` flag on the employee record
- **Problem:** No CRUD UI for custom recurring deductions like Tardiness, Uniform, Shuttle, etc.

### 1.4 Database Schema Issues (currentdb.md)

| Table | Issue |
|-------|-------|
| `payslips.status` | CHECK allows only `issued, confirmed, published, paid, acknowledged` — needs migration |
| `payroll_runs.status` | CHECK allows only `draft, validated, locked, published, paid` — needs migration |
| `employees` | No `deduction_exempt` column for contract-based employees |
| No `deduction_templates` table | Custom deductions have no home |
| No `employee_deduction_assignments` table | No way to link custom deductions to employees |
| No `payslip_line_items` table | No line-item breakdown for payslip (only flat amounts) |

---

## 2. Proposed Simplified Flow

### 2.1 New Payslip Status Flow (3 states)

```
draft → published → signed
```

| Status | Meaning | Who Acts |
|--------|---------|----------|
| `draft` | Payslip generated, under review | Admin/Finance can edit |
| `published` | Locked and visible to employee | Admin publishes, employee sees it |
| `signed` | Employee has e-signed receipt | Employee signs — terminal state |

### 2.2 New Payroll Run Status Flow (3 states)

```
draft → locked → completed
```

| Status | Meaning | Who Acts |
|--------|---------|----------|
| `draft` | Run created with payslips | Admin creates |
| `locked` | Policy snapshot frozen, payslips auto-published | Admin locks → payslips go `published` |
| `completed` | All done | Admin marks complete after signatures |

### 2.3 Employee Flow (Simplified)

1. Employee sees **"Published"** payslips with a **"Sign"** button
2. Employee reviews breakdown → clicks **Sign** → draws signature
3. Payslip moves to **"Signed"** — done. No separate acknowledge step.

---

## 3. Custom Deduction Templates System

### 3.1 New Tables

#### `deduction_templates`
Reusable deduction/allowance definitions that admin can CRUD.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Auto-generated |
| `name` | text NOT NULL | e.g., "Tardiness Deduction", "Uniform Deduction" |
| `type` | text CHECK | `deduction` or `allowance` |
| `calculation_mode` | text CHECK | `fixed`, `percentage`, `daily`, `hourly` |
| `value` | numeric NOT NULL | Amount or percentage |
| `conditions` | jsonb | Auto-apply conditions: `{ department?, role?, minSalary?, maxSalary? }` |
| `applies_to_all` | boolean DEFAULT false | If true, auto-apply to all employees |
| `is_active` | boolean DEFAULT true | Soft-delete support |
| `created_by` | text | Admin who created |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

#### `employee_deduction_assignments`
Links templates to specific employees with optional overrides.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Auto-generated |
| `employee_id` | text FK → employees | |
| `template_id` | text FK → deduction_templates | |
| `override_value` | numeric | Per-employee override (null = use template value) |
| `effective_from` | date | Start date |
| `effective_until` | date | End date (null = ongoing) |
| `is_active` | boolean DEFAULT true | |
| `assigned_by` | text | Admin who assigned |
| `created_at` | timestamptz | |

#### `payslip_line_items`
Detailed breakdown for each payslip.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | |
| `payslip_id` | text FK → payslips | |
| `label` | text NOT NULL | Display name |
| `type` | text CHECK | `earning`, `deduction`, `government`, `loan` |
| `amount` | numeric NOT NULL | Positive = earning, negative = deduction |
| `template_id` | text FK → deduction_templates | Source template (if applicable) |
| `calculation_detail` | text | e.g., "5% of ₱30,000 = ₱1,500" |

### 3.2 Employee Deduction Exemption

Add to `employees` table:
- `deduction_exempt boolean DEFAULT false` — if true, skip ALL government deductions (SSS, PhilHealth, Pag-IBIG, BIR)
- `deduction_exempt_reason text` — reason for exemption (e.g., "Contract-based", "Minimum wage earner")

This replaces the per-employee override system for the common case of "this employee has no deductions."

---

## 4. Deduction Flow During Payslip Generation

```
For each employee:
  1. Check employee.deduction_exempt
     → If true: skip ALL government deductions (SSS, PhilHealth, Pag-IBIG, BIR)
     → If false: continue
  
  2. For each government deduction (SSS, PhilHealth, Pag-IBIG, BIR):
     a. Check deduction_overrides for this employee+type
        → If "exempt": skip
        → If "fixed": use fixedAmount
        → If "percentage": use percentage% of salary
        → If "auto": compute standard PH tables
     b. Check deduction_global_defaults
        → Fallback to company-wide settings
  
  3. Get custom deductions:
     a. Fetch employee_deduction_assignments where active AND within effectiveFrom/Until
     b. For each assignment:
        → Use override_value if set, else use template.value
        → Apply calculation_mode: fixed/percentage/daily/hourly
     
  4. Check loan deductions (if employee has active loans):
     → Cap at loan.deduction_cap_percent (default 30% of net)
  
  5. Calculate net pay:
     gross + allowances + holidayPay + OT + nightDiff
     - govDeductions - customDeductions - loanDeductions
     = netPay
```

---

## 5. Loans Decision

**Keep loans as optional.** Loans are already in the database (`loans`, `loan_deductions`, `loan_balance_history`, `loan_repayment_schedule`) and the store (`loans.store.ts`). During payslip generation, if an employee has active loans, the deduction is applied. If not, it's zero. No need to remove — just don't enforce.

---

## 6. Implementation Phases

### Phase 1: Database Migration (045)
- [ ] Add `deduction_exempt`, `deduction_exempt_reason` to `employees`
- [ ] Create `deduction_templates` table
- [ ] Create `employee_deduction_assignments` table
- [ ] Create `payslip_line_items` table
- [ ] Migrate `payslips.status` CHECK to new 3 values
- [ ] Migrate `payroll_runs.status` CHECK to new 3 values
- [ ] Add RLS policies for new tables

### Phase 2: TypeScript Types
- [ ] Update `PayslipStatus` to `"draft" | "published" | "signed"`
- [ ] Update `PayrollRunStatus` to `"draft" | "locked" | "completed"`
- [ ] Add `DeductionTemplate`, `EmployeeDeductionAssignment`, `PayslipLineItem` types
- [ ] Add `deductionExempt`, `deductionExemptReason` to `Employee` interface
- [ ] Add `customDeductions`, `lineItemsJson` to `Payslip` interface

### Phase 3: Store Updates
- [ ] Update `payroll.store.ts` — simplified status methods
- [ ] Create `deductions.store.ts` — template CRUD + assignment CRUD

### Phase 4: API Routes
- [ ] `POST/GET/PUT/DELETE /api/payroll/templates` — deduction template CRUD
- [ ] `POST/GET/PUT/DELETE /api/payroll/templates/assignments` — employee assignments
- [ ] Update `/api/payroll/sign` — accept `published` status only
- [ ] Remove `/api/payroll/acknowledge` — merged into sign

### Phase 5: Frontend
- [ ] Create Payroll Settings page (`/[role]/payroll/settings`)
  - Tab 1: Pay Schedule (existing `PayScheduleSettings` component)
  - Tab 2: Government Deductions (read-only tables + global defaults)
  - Tab 3: Custom Deductions (CRUD table for templates)
  - Tab 4: Signature Settings (existing authorized signature config)
- [ ] Update `admin-view.tsx`
  - Simplify batch actions: Issue → Publish → Mark Complete
  - Remove "Confirm" and "Record Payment" buttons
  - Add deduction template selection during generation
  - Add employee deduction exempt toggle in employee management
- [ ] Update `employee-view.tsx`
  - Remove "Acknowledge" button/flow
  - Simplify status config to 3 states
  - "Sign" button only appears on `published` payslips

### Phase 6: Build & Verify
- [ ] `npm run build` passes with 0 errors
- [ ] All routes compile
- [ ] No TypeScript errors

---

## 7. File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/045_payroll_simplification.sql` | CREATE | New migration |
| `src/types/index.ts` | MODIFY | Simplified status types, new deduction types, employee exempt fields |
| `src/store/payroll.store.ts` | MODIFY | Simplified lifecycle methods |
| `src/store/deductions.store.ts` | CREATE | Custom deduction templates store |
| `src/app/api/payroll/templates/route.ts` | CREATE | Template CRUD API |
| `src/app/api/payroll/templates/assignments/route.ts` | CREATE | Assignment CRUD API |
| `src/app/api/payroll/sign/route.ts` | MODIFY | Accept only `published` status |
| `src/app/api/payroll/acknowledge/route.ts` | MODIFY | Redirect to sign (backward compat) |
| `src/app/[role]/payroll/settings/page.tsx` | CREATE | Payroll Settings page |
| `src/app/[role]/payroll/_views/admin-view.tsx` | MODIFY | Simplified flow |
| `src/app/[role]/payroll/_views/employee-view.tsx` | MODIFY | Remove acknowledge, simplify |
| `src/store/employees.store.ts` | MODIFY | Add deductionExempt field support |

---

## 8. Migration Strategy (Existing Data)

```sql
-- Map old statuses to new:
-- issued → draft
-- confirmed → draft  
-- published → published (unchanged)
-- paid → signed (was terminal before, now terminal is signed)
-- acknowledged → signed

-- Map old run statuses:
-- draft → draft (unchanged)
-- validated → draft
-- locked → locked (unchanged)
-- published → locked (merged into locked)
-- paid → completed
```
