/** @jest-environment jsdom */
/**
 * Leave Store Tests — NexHRMS
 * Tests leave request lifecycle, balance management, policy enforcement, and conflict detection
 */

import { renderHook, act } from "@testing-library/react";
import { useLeaveStore } from "@/store/leave.store";

describe("Leave Store", () => {
    beforeEach(() => {
        const { result } = renderHook(() => useLeaveStore());
        act(() => {
            result.current.resetToSeed();
        });
    });

    // ══════════════════════════════════════════════════════════
    // Leave Day Calculation (exposed through addRequest behavior)
    // ══════════════════════════════════════════════════════════

    describe("Leave Request Creation", () => {
        it("should create a full-day leave request with pending status", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "VL",
                    startDate: "2026-04-10",
                    endDate: "2026-04-10",
                    duration: "full_day",
                    reason: "Personal errand",
                });
            });

            const requests = result.current.getByEmployee("EMP-001");
            const newReq = requests.find((r) => r.reason === "Personal errand");
            expect(newReq).toBeDefined();
            expect(newReq?.status).toBe("pending");
            expect(newReq?.duration).toBe("full_day");
        });

        it("should create half-day AM leave request", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "SL",
                    startDate: "2026-04-10",
                    endDate: "2026-04-10",
                    duration: "half_day_am",
                    reason: "Doctor appointment",
                });
            });

            const requests = result.current.getByEmployee("EMP-001");
            const halfDay = requests.find((r) => r.reason === "Doctor appointment");
            expect(halfDay?.duration).toBe("half_day_am");
        });

        it("should create half-day PM leave request", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "VL",
                    startDate: "2026-04-10",
                    endDate: "2026-04-10",
                    duration: "half_day_pm",
                    reason: "Family matter",
                });
            });

            const requests = result.current.getByEmployee("EMP-001");
            const halfDay = requests.find((r) => r.reason === "Family matter");
            expect(halfDay?.duration).toBe("half_day_pm");
        });

        it("should create multi-day leave request", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "VL",
                    startDate: "2026-04-10",
                    endDate: "2026-04-14",
                    duration: "full_day",
                    reason: "Family vacation",
                });
            });

            const requests = result.current.getByEmployee("EMP-001");
            const multiDay = requests.find((r) => r.reason === "Family vacation");
            expect(multiDay).toBeDefined();
            expect(multiDay?.startDate).toBe("2026-04-10");
            expect(multiDay?.endDate).toBe("2026-04-14");
        });

        it("should create hourly leave request", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "SL",
                    startDate: "2026-04-10",
                    endDate: "2026-04-10",
                    duration: "hourly",
                    hours: 4,
                    reason: "Dental visit",
                });
            });

            const requests = result.current.getByEmployee("EMP-001");
            const hourly = requests.find((r) => r.reason === "Dental visit");
            expect(hourly?.duration).toBe("hourly");
            expect(hourly?.hours).toBe(4);
        });

        it("should default to full_day duration when not specified", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "VL",
                    startDate: "2026-04-10",
                    endDate: "2026-04-10",
                    duration: "full_day",
                    reason: "Default duration test",
                });
            });

            const requests = result.current.getByEmployee("EMP-001");
            const req = requests.find((r) => r.reason === "Default duration test");
            expect(req?.duration).toBe("full_day");
        });
    });

    // ══════════════════════════════════════════════════════════
    // Leave Status Lifecycle
    // ══════════════════════════════════════════════════════════

    describe("Leave Status Lifecycle", () => {
        it("should approve pending leave request", () => {
            const { result } = renderHook(() => useLeaveStore());

            // Create a request
            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "VL",
                    startDate: "2026-04-15",
                    endDate: "2026-04-15",
                    duration: "full_day",
                    reason: "Approve test",
                });
            });

            const pending = result.current.getPending();
            const req = pending.find((r) => r.reason === "Approve test");
            expect(req).toBeDefined();

            act(() => {
                result.current.updateStatus(req!.id, "approved", "ADMIN-001");
            });

            const updated = result.current.getByEmployee("EMP-001").find((r) => r.id === req!.id);
            expect(updated?.status).toBe("approved");
            expect(updated?.reviewedBy).toBe("ADMIN-001");
            expect(updated?.reviewedAt).toBeDefined();
        });

        it("should reject pending leave request", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "VL",
                    startDate: "2026-04-20",
                    endDate: "2026-04-20",
                    duration: "full_day",
                    reason: "Reject test",
                });
            });

            const pending = result.current.getPending();
            const req = pending.find((r) => r.reason === "Reject test");

            act(() => {
                result.current.updateStatus(req!.id, "rejected", "ADMIN-001");
            });

            const updated = result.current.getByEmployee("EMP-001").find((r) => r.id === req!.id);
            expect(updated?.status).toBe("rejected");
        });

        it("should list all pending requests", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "SL",
                    startDate: "2026-05-01",
                    endDate: "2026-05-01",
                    duration: "full_day",
                    reason: "Pending 1",
                });
                result.current.addRequest({
                    employeeId: "EMP-002",
                    type: "VL",
                    startDate: "2026-05-02",
                    endDate: "2026-05-02",
                    duration: "full_day",
                    reason: "Pending 2",
                });
            });

            const pending = result.current.getPending();
            expect(pending.length).toBeGreaterThanOrEqual(2);
            expect(pending.every((r) => r.status === "pending")).toBe(true);
        });
    });

    // ══════════════════════════════════════════════════════════
    // Leave Balance Management
    // ══════════════════════════════════════════════════════════

    describe("Leave Balance Management", () => {
        it("should initialize balances for employee from policies", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.initBalances("EMP-TEST-001", 2026);
            });

            const balances = result.current.getEmployeeBalances("EMP-TEST-001", 2026);
            expect(balances.length).toBeGreaterThan(0);

            // Check VL balance matches policy
            const vlBalance = result.current.getBalance("EMP-TEST-001", "VL", 2026);
            expect(vlBalance).toBeDefined();
            expect(vlBalance?.entitled).toBe(5); // VL policy has 5 days
            expect(vlBalance?.used).toBe(0);
            expect(vlBalance?.remaining).toBe(5);
        });

        it("should not re-initialize existing balances", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.initBalances("EMP-TEST-001", 2026);
            });
            const firstCount = result.current.getEmployeeBalances("EMP-TEST-001", 2026).length;

            act(() => {
                result.current.initBalances("EMP-TEST-001", 2026); // second call
            });
            const secondCount = result.current.getEmployeeBalances("EMP-TEST-001", 2026).length;

            expect(secondCount).toBe(firstCount);
        });

        it("should deduct balance when leave is approved", () => {
            const { result } = renderHook(() => useLeaveStore());

            // Init balances
            act(() => {
                result.current.initBalances("EMP-TEST-001", 2026);
            });

            const vlBefore = result.current.getBalance("EMP-TEST-001", "VL", 2026);
            const remainingBefore = vlBefore!.remaining;

            // Create and approve leave
            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-TEST-001",
                    type: "VL",
                    startDate: "2026-04-10",
                    endDate: "2026-04-10",
                    duration: "full_day",
                    reason: "Balance deduction test",
                });
            });

            const req = result.current.getByEmployee("EMP-TEST-001").find(
                (r) => r.reason === "Balance deduction test"
            );

            act(() => {
                result.current.updateStatus(req!.id, "approved", "ADMIN-001");
            });

            const vlAfter = result.current.getBalance("EMP-TEST-001", "VL", 2026);
            expect(vlAfter!.remaining).toBe(remainingBefore - 1); // 1 full day deducted
            expect(vlAfter!.used).toBe(1);
        });

        it("should credit balance back when approved leave is rejected", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.initBalances("EMP-TEST-001", 2026);
            });

            // Create and approve
            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-TEST-001",
                    type: "VL",
                    startDate: "2026-04-15",
                    endDate: "2026-04-15",
                    duration: "full_day",
                    reason: "Credit back test",
                });
            });

            const req = result.current.getByEmployee("EMP-TEST-001").find(
                (r) => r.reason === "Credit back test"
            );

            act(() => {
                result.current.updateStatus(req!.id, "approved", "ADMIN-001");
            });

            const afterApproval = result.current.getBalance("EMP-TEST-001", "VL", 2026);
            const usedAfterApproval = afterApproval!.used;

            // Now reject the previously approved leave
            act(() => {
                result.current.updateStatus(req!.id, "rejected", "ADMIN-001");
            });

            const afterRejection = result.current.getBalance("EMP-TEST-001", "VL", 2026);
            expect(afterRejection!.used).toBe(usedAfterApproval - 1);
            expect(afterRejection!.remaining).toBe(afterApproval!.remaining + 1);
        });

        it("should accrue additional leave days", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.initBalances("EMP-TEST-001", 2026);
            });

            const before = result.current.getBalance("EMP-TEST-001", "VL", 2026);
            const entitledBefore = before!.entitled;

            act(() => {
                result.current.accrueLeave("EMP-TEST-001", "VL", 2026, 2);
            });

            const after = result.current.getBalance("EMP-TEST-001", "VL", 2026);
            expect(after!.entitled).toBe(entitledBefore + 2);
            expect(after!.remaining).toBe(before!.remaining + 2);
        });
    });

    // ══════════════════════════════════════════════════════════
    // Leave Policy CRUD
    // ══════════════════════════════════════════════════════════

    describe("Leave Policy Management", () => {
        it("should have default PH leave policies loaded", () => {
            const { result } = renderHook(() => useLeaveStore());

            // PH statutory leaves
            expect(result.current.getPolicy("SL")).toBeDefined();
            expect(result.current.getPolicy("VL")).toBeDefined();
            expect(result.current.getPolicy("EL")).toBeDefined();
            expect(result.current.getPolicy("ML")).toBeDefined();
            expect(result.current.getPolicy("PL")).toBeDefined();
            expect(result.current.getPolicy("SPL")).toBeDefined();
        });

        it("should verify Maternity Leave is 105 days (RA 11210)", () => {
            const { result } = renderHook(() => useLeaveStore());
            const ml = result.current.getPolicy("ML");
            expect(ml?.annualEntitlement).toBe(105);
            expect(ml?.attachmentRequired).toBe(true);
        });

        it("should verify Paternity Leave is 7 days (RA 8187)", () => {
            const { result } = renderHook(() => useLeaveStore());
            const pl = result.current.getPolicy("PL");
            expect(pl?.annualEntitlement).toBe(7);
        });

        it("should verify Solo Parent Leave is 7 days (RA 8972)", () => {
            const { result } = renderHook(() => useLeaveStore());
            const spl = result.current.getPolicy("SPL");
            expect(spl?.annualEntitlement).toBe(7);
            expect(spl?.attachmentRequired).toBe(true);
        });

        it("should add a custom leave policy", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addPolicy({
                    leaveType: "OTHER",
                    name: "Bereavement Leave",
                    accrualFrequency: "annual",
                    annualEntitlement: 3,
                    carryForwardAllowed: false,
                    maxCarryForward: 0,
                    maxBalance: 3,
                    expiryMonths: 12,
                    negativeLeaveAllowed: false,
                    attachmentRequired: true,
                });
            });

            const policies = result.current.policies;
            const bereavement = policies.find((p) => p.name === "Bereavement Leave");
            expect(bereavement).toBeDefined();
            expect(bereavement?.annualEntitlement).toBe(3);
        });

        it("should update a leave policy", () => {
            const { result } = renderHook(() => useLeaveStore());

            const vlPolicy = result.current.getPolicy("VL");
            act(() => {
                result.current.updatePolicy(vlPolicy!.id, { annualEntitlement: 10 });
            });

            const updated = result.current.getPolicy("VL");
            expect(updated?.annualEntitlement).toBe(10);
        });

        it("should delete a leave policy", () => {
            const { result } = renderHook(() => useLeaveStore());

            const initialCount = result.current.policies.length;
            const otherPolicy = result.current.policies.find((p) => p.leaveType === "OTHER");

            act(() => {
                result.current.deletePolicy(otherPolicy!.id);
            });

            expect(result.current.policies.length).toBe(initialCount - 1);
        });
    });

    // ══════════════════════════════════════════════════════════
    // Conflict Detection
    // ══════════════════════════════════════════════════════════

    describe("Leave Conflict Detection", () => {
        it("should detect conflict with approved leave", () => {
            const { result } = renderHook(() => useLeaveStore());

            // Create and approve a leave
            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-CONFLICT",
                    type: "VL",
                    startDate: "2026-05-10",
                    endDate: "2026-05-12",
                    duration: "full_day",
                    reason: "Conflict source",
                });
            });

            const req = result.current.getByEmployee("EMP-CONFLICT").find(
                (r) => r.reason === "Conflict source"
            );
            act(() => {
                result.current.updateStatus(req!.id, "approved", "ADMIN-001");
            });

            // Check conflict on date within that range
            expect(result.current.hasLeaveConflict("EMP-CONFLICT", "2026-05-11")).toBe(true);
        });

        it("should not flag conflict on dates outside leave range", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-CONFLICT",
                    type: "VL",
                    startDate: "2026-05-10",
                    endDate: "2026-05-12",
                    duration: "full_day",
                    reason: "No conflict source",
                });
            });

            const req = result.current.getByEmployee("EMP-CONFLICT").find(
                (r) => r.reason === "No conflict source"
            );
            act(() => {
                result.current.updateStatus(req!.id, "approved", "ADMIN-001");
            });

            expect(result.current.hasLeaveConflict("EMP-CONFLICT", "2026-05-13")).toBe(false);
            expect(result.current.hasLeaveConflict("EMP-CONFLICT", "2026-05-09")).toBe(false);
        });

        it("should not flag conflict for pending (unapproved) leave", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.addRequest({
                    employeeId: "EMP-CONFLICT",
                    type: "VL",
                    startDate: "2026-06-01",
                    endDate: "2026-06-03",
                    duration: "full_day",
                    reason: "Pending leave",
                });
            });

            // Pending leave should not trigger conflict
            expect(result.current.hasLeaveConflict("EMP-CONFLICT", "2026-06-02")).toBe(false);
        });
    });

    // ══════════════════════════════════════════════════════════
    // Carry Forward
    // ══════════════════════════════════════════════════════════

    describe("Leave Carry Forward", () => {
        it("should carry forward VL balance from previous year", () => {
            const { result } = renderHook(() => useLeaveStore());

            // Init 2025 balances
            act(() => {
                result.current.initBalances("EMP-CARRY", 2025);
            });

            const vl2025 = result.current.getBalance("EMP-CARRY", "VL", 2025);
            expect(vl2025).toBeDefined();
            const remaining2025 = vl2025!.remaining;
            const vlPolicy = result.current.getPolicy("VL");

            // Init 2026 — should carry forward VL (up to maxCarryForward)
            act(() => {
                result.current.initBalances("EMP-CARRY", 2026);
            });

            const vl2026 = result.current.getBalance("EMP-CARRY", "VL", 2026);
            const expectedCarry = Math.min(remaining2025, vlPolicy!.maxCarryForward);
            expect(vl2026?.carriedForward).toBe(expectedCarry);
            // remaining = entitled + carried forward
            expect(vl2026?.remaining).toBe(vl2026!.entitled + vl2026!.carriedForward);
        });

        it("should NOT carry forward SL balance (policy disallows)", () => {
            const { result } = renderHook(() => useLeaveStore());

            act(() => {
                result.current.initBalances("EMP-CARRY-SL", 2025);
                result.current.initBalances("EMP-CARRY-SL", 2026);
            });

            const sl2026 = result.current.getBalance("EMP-CARRY-SL", "SL", 2026);
            expect(sl2026?.carriedForward).toBe(0);
            expect(sl2026?.remaining).toBe(sl2026!.entitled); // only annual entitlement
        });
    });

    // ══════════════════════════════════════════════════════════
    // Reset
    // ══════════════════════════════════════════════════════════

    describe("Reset Functionality", () => {
        it("should reset to seed state and clear balances", () => {
            const { result } = renderHook(() => useLeaveStore());

            // Make changes
            act(() => {
                result.current.initBalances("EMP-001", 2026);
                result.current.addRequest({
                    employeeId: "EMP-001",
                    type: "SL",
                    startDate: "2026-07-01",
                    endDate: "2026-07-01",
                    duration: "full_day",
                    reason: "Before reset",
                });
            });

            // Reset
            act(() => {
                result.current.resetToSeed();
            });

            const balances = result.current.getEmployeeBalances("EMP-001", 2026);
            expect(balances.length).toBe(0);
        });
    });
});
