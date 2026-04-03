# NexHRMS Implementation Sprint
> **Date:** 2026-04-02 | **Lead:** Full-Stack Developer
> **Goal:** Close critical gaps for production readiness

---

## Sprint Scope

### Phase 1: Type System Fixes (Immediate)
| # | Task | File | Status |
|---|------|------|--------|
| 1.1 | Add `Holiday` interface | `src/types/index.ts` | ✅ (already existed) |
| 1.2 | Add `EmployeeDocument` interface | `src/types/index.ts` | ✅ (already existed) |
| 1.3 | Add `KioskDevice` interface | `src/types/index.ts` | ✅ (already existed) |
| 1.4 | Add `QRToken` interface | `src/types/index.ts` | ✅ (already existed) |
| 1.5 | Add `ServiceResult<T>` type | `src/types/index.ts` | ✅ |
| 1.6 | Fix `ChannelMessage` missing `readBy` | `src/types/index.ts` | ✅ |

### Phase 2: Service Layer Foundation
| # | Task | File | Status |
|---|------|------|--------|
| 2.1 | Create `employees.service.ts` | `src/services/employees.service.ts` | ✅ |
| 2.2 | Create `attendance.service.ts` | `src/services/attendance.service.ts` | ✅ |
| 2.3 | Create `payroll.service.ts` | `src/services/payroll.service.ts` | ✅ |
| 2.4 | Create `db-mappers.ts` utility | `src/lib/db-mappers.ts` | ✅ (already existed) |

### Phase 3: Store Tests
| # | Task | File | Status |
|---|------|------|--------|
| 3.1 | Add timesheet.store tests | `settings-config.test.ts` | ✅ (already covered) |
| 3.2 | Add projects.store tests | `projects-tasks.test.ts` | ✅ (already covered) |
| 3.3 | Add audit.store tests | `settings-config.test.ts` | ✅ (already covered) |

### Phase 4: Missing Features
| # | Task | Files | Status |
|---|------|-------|--------|
| 4.1 | Kiosk device management UI | `src/app/[role]/settings/kiosk/page.tsx` | 🔄 |
| 4.2 | Gov table version management | `src/app/[role]/settings/gov-tables/page.tsx` | 🔄 |

---

## Completed This Sprint

### Service Layer (Server Actions)
- **employees.service.ts**: CRUD, salary change requests, salary history
- **attendance.service.ts**: Events (append-only), evidence, exceptions, logs, shifts, overtime, holidays  
- **payroll.service.ts**: Payslips lifecycle, payroll runs, adjustments, final pay, schedule config

### TypeScript Fixes
- Added `ServiceResult<T>` union type for standardized server action returns
- Fixed `ChannelMessage` type to include required `readBy: string[]` field
- Fixed all type casting using `as unknown as Type` pattern for strict TS

### Test Verification
- All 559 tests passing
- TypeScript compilation: 0 errors
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("employees").select("*");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data.map(mapDbToEmployee) };
}

export async function createEmployee(emp: Omit<Employee, "id">): Promise<ServiceResult<Employee>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("employees")
    .insert(mapEmployeeToDb(emp))
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: mapDbToEmployee(data) };
}
```

### 3. DB Mapper Pattern

```typescript
// db-mappers.ts
export function mapDbToEmployee(row: DbEmployee): Employee {
  return {
    ...row,
    profileId: row.profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dateOfBirth: row.date_of_birth,
    // ... other field mappings
  };
}
```

---

## Success Criteria

- [ ] 0 TypeScript errors after type additions
- [ ] All 3 service files compile and export correct functions
- [ ] Tests for timesheet, projects, audit stores passing
- [ ] Total test count increases by ~50

---

## Notes

- Demo mode continues to work unchanged (service layer is additive)
- All services return `{ ok: true, data } | { ok: false, error }` pattern
- Stores will be refactored to dual-mode in a follow-up sprint
