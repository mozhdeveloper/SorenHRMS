import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/services/supabase-server";

/**
 * GET /api/payroll/templates/assignments
 * Retrieve employee deduction assignments.
 * Query: ?employeeId=xxx or ?templateId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const serverClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createAdminSupabaseClient();

    const { data: emp } = await supabase
      .from("employees")
      .select("id, role")
      .or(`profile_id.eq.${user.id},email.eq.${user.email}`)
      .single();

    if (!emp || !["admin", "hr", "finance", "payroll_admin"].includes(emp.role)) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const templateId = searchParams.get("templateId");

    let query = supabase
      .from("employee_deduction_assignments")
      .select(`*, template:deduction_templates(*), employee:employees(id, name)`)
      .order("created_at", { ascending: false });

    if (employeeId) query = query.eq("employee_id", employeeId);
    if (templateId) query = query.eq("template_id", templateId);

    const { data: assignments, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: assignments });
  } catch (err) {
    console.error("GET /api/payroll/templates/assignments error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/payroll/templates/assignments
 * Assign a deduction template to an employee.
 * Body: { employeeId, templateId, overrideValue?, effectiveFrom?, effectiveUntil? }
 */
export async function POST(request: NextRequest) {
  try {
    const serverClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createAdminSupabaseClient();

    const { data: emp } = await supabase
      .from("employees")
      .select("id, role")
      .or(`profile_id.eq.${user.id},email.eq.${user.email}`)
      .single();

    if (!emp || !["admin", "hr", "finance", "payroll_admin"].includes(emp.role)) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { employeeId, templateId, overrideValue, effectiveFrom, effectiveUntil } = body;

    if (!employeeId || !templateId) {
      return NextResponse.json({ ok: false, message: "employeeId and templateId are required" }, { status: 400 });
    }

    // Check for duplicate active assignment
    const { data: existing } = await supabase
      .from("employee_deduction_assignments")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("template_id", templateId)
      .eq("is_active", true)
      .single();

    if (existing) {
      return NextResponse.json(
        { ok: false, message: "Employee already has this deduction assigned" },
        { status: 409 }
      );
    }

    const { data: assignment, error } = await supabase
      .from("employee_deduction_assignments")
      .insert({
        employee_id: employeeId,
        template_id: templateId,
        override_value: overrideValue || null,
        effective_from: effectiveFrom || new Date().toISOString().split("T")[0],
        effective_until: effectiveUntil || null,
        is_active: true,
        assigned_by: emp.id,
      })
      .select(`*, template:deduction_templates(*), employee:employees(id, name)`)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: assignment }, { status: 201 });
  } catch (err) {
    console.error("POST /api/payroll/templates/assignments error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/payroll/templates/assignments
 * Update assignment.
 * Body: { id, overrideValue?, effectiveFrom?, effectiveUntil?, isActive? }
 */
export async function PUT(request: NextRequest) {
  try {
    const serverClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createAdminSupabaseClient();

    const { data: emp } = await supabase
      .from("employees")
      .select("id, role")
      .or(`profile_id.eq.${user.id},email.eq.${user.email}`)
      .single();

    if (!emp || !["admin", "hr", "finance", "payroll_admin"].includes(emp.role)) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, overrideValue, effectiveFrom, effectiveUntil, isActive } = body;

    if (!id) {
      return NextResponse.json({ ok: false, message: "Assignment ID is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (overrideValue !== undefined) updates.override_value = overrideValue;
    if (effectiveFrom !== undefined) updates.effective_from = effectiveFrom;
    if (effectiveUntil !== undefined) updates.effective_until = effectiveUntil;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data: assignment, error } = await supabase
      .from("employee_deduction_assignments")
      .update(updates)
      .eq("id", id)
      .select(`*, template:deduction_templates(*), employee:employees(id, name)`)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: assignment });
  } catch (err) {
    console.error("PUT /api/payroll/templates/assignments error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/payroll/templates/assignments
 * Remove an assignment.
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const serverClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createAdminSupabaseClient();

    const { data: emp } = await supabase
      .from("employees")
      .select("id, role")
      .or(`profile_id.eq.${user.id},email.eq.${user.email}`)
      .single();

    if (!emp || !["admin", "hr", "finance", "payroll_admin"].includes(emp.role)) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ ok: false, message: "Assignment ID is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("employee_deduction_assignments")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Assignment deleted" });
  } catch (err) {
    console.error("DELETE /api/payroll/templates/assignments error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}
