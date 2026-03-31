/**
 * seed-supabase-users.ts
 *
 * Creates all 8 demo user accounts in Supabase Auth, ensures profiles are
 * correct, and upserts employees table records for the employee-role accounts.
 *
 * Idempotent — safe to run multiple times. Existing auth users get their
 * password reset to demo1234 and their profile/employee records corrected.
 *
 * Usage:
 *   npx tsx scripts/seed-supabase-users.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  console.error("   Get it from: Supabase Dashboard → Settings → API → service_role");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = "demo1234";

// ─── Auth + Profile accounts ─────────────────────────────────────────────────
const DEMO_ACCOUNTS = [
  { name: "Alex Rivera",  email: "admin@nexhrms.com",      role: "admin",         department: "Management" },
  { name: "Jordan Lee",   email: "hr@nexhrms.com",         role: "hr",            department: "Human Resources" },
  { name: "Morgan Chen",  email: "finance@nexhrms.com",    role: "finance",       department: "Finance" },
  { name: "Sam Torres",   email: "employee@nexhrms.com",   role: "employee",      department: "Engineering" },
  { name: "Pat Reyes",    email: "supervisor@nexhrms.com", role: "supervisor",    department: "Engineering" },
  { name: "Dana Cruz",    email: "payroll@nexhrms.com",    role: "payroll_admin", department: "Finance" },
  { name: "Rene Santos",  email: "auditor@nexhrms.com",    role: "auditor",       department: "Compliance" },
  { name: "Jamie Reyes",  email: "qr@nexhrms.com",         role: "employee",      department: "Engineering" },
];

// ─── employees table records for accounts that are role="employee" ────────────
// profileId is populated at runtime after auth user is resolved.
const DEMO_EMPLOYEE_RECORDS: Record<string, {
  id: string; name: string; email: string; department: string;
  job_title: string; work_type: string; salary: number; join_date: string;
  productivity: number; location: string; phone: string; birthday: string;
  pin: string; status: string;
}> = {
  "employee@nexhrms.com": {
    id: "EMP026",
    name: "Sam Torres",
    email: "employee@nexhrms.com",
    department: "Engineering",
    job_title: "Frontend Developer",
    work_type: "WFO",
    salary: 88000,
    join_date: "2024-01-10",
    productivity: 82,
    location: "Manila",
    phone: "+63-555-0126",
    birthday: "1995-04-20",
    pin: "666666",
    status: "active",
  },
  "qr@nexhrms.com": {
    id: "EMP027",
    name: "Jamie Reyes",
    email: "qr@nexhrms.com",
    department: "Engineering",
    job_title: "Field Technician",
    work_type: "WFO",
    salary: 75000,
    join_date: "2024-06-01",
    productivity: 85,
    location: "Manila",
    phone: "+63-555-0127",
    birthday: "1996-08-15",
    pin: "777777",
    status: "active",
  },
};

async function seedUsers() {
  console.log("🔄 Seeding demo users in Supabase...\n");
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log(`   Accounts: ${DEMO_ACCOUNTS.length}\n`);

  // Fetch all existing auth users once (avoid N+1 calls)
  const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existingByEmail = new Map(
    (allUsers?.users ?? []).map((u) => [u.email ?? "", u])
  );

  let created = 0;
  let updated = 0;
  let failed = 0;

  // Map email → resolved auth user ID
  const resolvedIds: Record<string, string> = {};

  for (const account of DEMO_ACCOUNTS) {
    const existing = existingByEmail.get(account.email);

    if (existing) {
      // Reset password to demo1234 so quick-login always works
      const { error: pwErr } = await supabase.auth.admin.updateUserById(existing.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: account.name, role: account.role },
      });
      if (pwErr) {
        console.warn(`   ⚠️  ${account.email} — could not reset password: ${pwErr.message}`);
      }

      // Fix profile role/department if wrong
      await supabase.from("profiles").upsert({
        id: existing.id,
        name: account.name,
        email: account.email,
        role: account.role,
        department: account.department,
        must_change_password: false,
        profile_complete: true,
      }, { onConflict: "id" });

      console.log(`   🔄  ${account.email} (${account.role}) — updated (password reset)`);
      resolvedIds[account.email] = existing.id;
      updated++;
      continue;
    }

    // Create new auth user
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: account.name, role: account.role },
    });

    if (error || !data.user) {
      console.error(`   ❌ ${account.email} (${account.role}) — ${error?.message ?? "unknown error"}`);
      failed++;
      continue;
    }

    // Upsert profile (trigger may have already created it)
    await supabase.from("profiles").upsert({
      id: data.user.id,
      name: account.name,
      email: account.email,
      role: account.role,
      department: account.department,
      must_change_password: false,
      profile_complete: true,
    }, { onConflict: "id" });

    console.log(`   ✅  ${account.email} (${account.role}) — created [${data.user.id}]`);
    resolvedIds[account.email] = data.user.id;
    created++;
  }

  console.log(`\n📊 Auth results: ${created} created, ${updated} updated, ${failed} failed`);

  // ─── Upsert employees table records for employee-role accounts ───────────────
  console.log("\n🔄 Upserting employees table records...\n");

  for (const [email, empData] of Object.entries(DEMO_EMPLOYEE_RECORDS)) {
    const profileId = resolvedIds[email];
    if (!profileId) {
      console.warn(`   ⚠️  No auth user resolved for ${email} — skipping employees row`);
      continue;
    }

    const { error: empErr } = await supabase.from("employees").upsert({
      id: empData.id,
      name: empData.name,
      email: empData.email,
      role: "employee",
      department: empData.department,
      status: empData.status,
      work_type: empData.work_type,
      salary: empData.salary,
      join_date: empData.join_date,
      productivity: empData.productivity,
      location: empData.location,
      phone: empData.phone,
      birthday: empData.birthday,
      pin: empData.pin,
      profile_id: profileId,
    }, { onConflict: "id" });

    if (empErr) {
      console.error(`   ❌ employees row for ${email} — ${empErr.message}`);
    } else {
      // Also patch profile_id on existing row in case it was null
      await supabase.from("employees")
        .update({ profile_id: profileId })
        .eq("email", email)
        .is("profile_id", null);
      console.log(`   ✅  employees[${empData.id}] ${email} → profile_id ${profileId.substring(0, 8)}...`);
    }
  }

  // ─── Final verification ───────────────────────────────────────────────────────
  console.log("\n🔍 Final verification\n");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, email, role, department")
    .in("email", DEMO_ACCOUNTS.map((a) => a.email))
    .order("role");

  if (profiles && profiles.length > 0) {
    console.log("   Profile | Role           | Email");
    console.log("   " + "─".repeat(60));
    for (const p of profiles) {
      console.log(`   ${p.id.substring(0, 8)}  | ${(p.role ?? "").padEnd(14)} | ${p.email}`);
    }
  }

  const { data: empRows } = await supabase
    .from("employees")
    .select("id, name, email, profile_id")
    .in("email", Object.keys(DEMO_EMPLOYEE_RECORDS));

  if (empRows && empRows.length > 0) {
    console.log("\n   Employee | Name         | Email              | profile_id");
    console.log("   " + "─".repeat(70));
    for (const e of empRows) {
      console.log(
        `   ${e.id.padEnd(8)} | ${(e.name ?? "").padEnd(12)} | ${(e.email ?? "").padEnd(18)} | ` +
        `${e.profile_id ? e.profile_id.substring(0, 8) + "..." : "❌ NULL"}`
      );
    }
  }

  console.log("\n✅ Done! All demo accounts are ready.");
  console.log("   Password for all accounts: demo1234");
  console.log("\n   Quick login accounts:");
  for (const a of DEMO_ACCOUNTS) {
    console.log(`   ${a.role.padEnd(14)} → ${a.email}`);
  }
}

seedUsers().catch(console.error);
