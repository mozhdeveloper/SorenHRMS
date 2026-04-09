import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/services/supabase-server";

/**
 * POST /api/payroll/templates/assignments/bulk
 * Assign a deduction template to multiple employees at once.
 *
 * Body: {
 *   templateId: string,
 *   employeeIds: string[],      // explicit list (used for individual + dept/project resolved on frontend)
 *   overrideValue?: number,
 *   effectiveFrom?: string      // ISO date, defaults to today
 * }
 *
 * Response: { ok: true, assigned: N, skipped: M }
 *   assigned  = new records created
 *   skipped   = employees that already had this template or are deduction-exempt
 */
export async function POST(request: NextRequest) {
  try {
    const serverClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createAdminSupabaseClient();

    // Verify caller has payroll management role
    const { data: caller } = await supabase
      .from("employees")
      .select("id, role")
      .or(`profile_id.eq.${user.id},email.eq.${user.email}`)
      .single();

    if (!caller || !["admin", "hr", "finance", "payroll_admin"].includes(caller.role)) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { templateId, employeeIds, overrideValue, effectiveFrom } = body as {
      templateId: string;
      employeeIds: string[];
      overrideValue?: number;
      effectiveFrom?: string;
    };

    if (!templateId || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "templateId and a non-empty employeeIds array are required" },
        { status: 400 }
      );
    }

    // Validate template exists
    const { data: template } = await supabase
      .from("deduction_templates")
      .select("id, is_active")
      .eq("id", templateId)
      .single();

    if (!template) {
      return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 });
    }
    if (!template.is_active) {
      return NextResponse.json({ ok: false, message: "Template is inactive" }, { status: 400 });
    }

    // Fetch employees to check existence and deduction_exempt flag
    const { data: empRows } = await supabase
      .from("employees")
      .select("id, deduction_exempt, status")
      .in("id", employeeIds);

    const validEmployeeIds = (empRows ?? [])
      .filter((e) => e.status === "active" && !e.deduction_exempt)
      .map((e) => e.id as string);

    const skippedExempt = employeeIds.length - validEmployeeIds.length;

    if (validEmployeeIds.length === 0) {
      return NextResponse.json({
        ok: true,
        assigned: 0,
        skipped: employeeIds.length,
        message: "All employees are deduction-exempt or inactive.",
      });
    }

    // Find employees that already have this template assigned (active)
    const { data: existingRows } = await supabase
      .from("employee_deduction_assignments")
      .select("employee_id")
      .eq("template_id", templateId)
      .eq("is_active", true)
      .in("employee_id", validEmployeeIds);

    const alreadyAssigned = new Set((existingRows ?? []).map((r) => r.employee_id as string));
    const toCreate = validEmployeeIds.filter((id) => !alreadyAssigned.has(id));
    const skippedExists = alreadyAssigned.size;

    if (toCreate.length === 0) {
      return NextResponse.json({
        ok: true,
        assigned: 0,
        skipped: skippedExempt + skippedExists,
        message: "All eligible employees already have this deduction assigned.",
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const insertRows = toCreate.map((empId) => ({
      employee_id: empId,
      template_id: templateId,
      override_value: overrideValue ?? null,
      effective_from: effectiveFrom ?? today,
      effective_until: null,
      is_active: true,
      assigned_by: caller.id,
    }));

    const { error: insertError } = await supabase
      .from("employee_deduction_assignments")
      .insert(insertRows);

    if (insertError) {
      return NextResponse.json({ ok: false, message: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      assigned: toCreate.length,
      skipped: skippedExempt + skippedExists,
    });
  } catch (err) {
    console.error("POST /api/payroll/templates/assignments/bulk error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}
