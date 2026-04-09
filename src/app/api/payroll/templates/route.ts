import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/services/supabase-server";

/**
 * GET /api/payroll/templates
 * Retrieve all deduction templates.
 * Auth: Requires valid session with admin/hr/finance/payroll_admin role.
 */
export async function GET() {
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

    const { data: templates, error } = await supabase
      .from("deduction_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: templates }, { status: 200 });
  } catch (err) {
    console.error("GET /api/payroll/templates error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/payroll/templates
 * Create a new deduction template.
 * Body: { name, type, calculationMode, value, conditions?, appliesToAll?, isActive? }
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
    const { name, type, calculationMode, value, conditions, appliesToAll, isActive } = body;

    if (!name || !type || !calculationMode || value === undefined) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields: name, type, calculationMode, value" },
        { status: 400 }
      );
    }

    if (!["deduction", "allowance"].includes(type)) {
      return NextResponse.json({ ok: false, message: "Type must be 'deduction' or 'allowance'" }, { status: 400 });
    }
    if (!["fixed", "percentage", "daily", "hourly"].includes(calculationMode)) {
      return NextResponse.json({ ok: false, message: "calculationMode must be fixed/percentage/daily/hourly" }, { status: 400 });
    }
    if (typeof value !== "number" || value < 0) {
      return NextResponse.json({ ok: false, message: "Value must be a non-negative number" }, { status: 400 });
    }

    const { data: template, error } = await supabase
      .from("deduction_templates")
      .insert({
        name,
        type,
        calculation_mode: calculationMode,
        value,
        conditions: conditions || null,
        applies_to_all: appliesToAll ?? false,
        is_active: isActive ?? true,
        created_by: emp.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: template }, { status: 201 });
  } catch (err) {
    console.error("POST /api/payroll/templates error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/payroll/templates
 * Update an existing deduction template.
 * Body: { id, ...fieldsToUpdate }
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
    const { id, name, type, calculationMode, value, conditions, appliesToAll, isActive } = body;

    if (!id) {
      return NextResponse.json({ ok: false, message: "Template ID is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (calculationMode !== undefined) updates.calculation_mode = calculationMode;
    if (value !== undefined) updates.value = value;
    if (conditions !== undefined) updates.conditions = conditions;
    if (appliesToAll !== undefined) updates.applies_to_all = appliesToAll;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data: template, error } = await supabase
      .from("deduction_templates")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: template }, { status: 200 });
  } catch (err) {
    console.error("PUT /api/payroll/templates error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/payroll/templates
 * Delete a deduction template (soft-delete if has assignments).
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

    if (!emp || !["admin", "payroll_admin"].includes(emp.role)) {
      return NextResponse.json({ ok: false, message: "Only admin can delete templates" }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ ok: false, message: "Template ID is required" }, { status: 400 });
    }

    // Check if in use
    const { count } = await supabase
      .from("employee_deduction_assignments")
      .select("*", { count: "exact", head: true })
      .eq("template_id", id);

    if (count && count > 0) {
      // Soft-delete
      await supabase
        .from("deduction_templates")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      return NextResponse.json({
        ok: true,
        message: "Template has assignments. Marked as inactive instead of deleted.",
        softDeleted: true,
      });
    }

    const { error } = await supabase
      .from("deduction_templates")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Template deleted" });
  } catch (err) {
    console.error("DELETE /api/payroll/templates error:", err);
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
  }
}
