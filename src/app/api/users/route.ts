import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeUserAudit } from "@/lib/serverAudit";
import {
  PASSWORD_POLICY_MESSAGE,
  validatePassword,
} from "@/lib/passwordPolicy";

const ALLOWED_ROLES = [
  "user",
  "operator",
  "moderator",
  "assistant_moderator",
] as const;

type UserRole = (typeof ALLOWED_ROLES)[number];

function nullableText(value: unknown) {
  if (typeof value !== "string") return null;

  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    // ========================================================
    // AUTHENTICATE CALLER
    // ========================================================

    const token = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // ========================================================
    // AUTHORIZE CALLER
    // ========================================================

    const { data: caller, error: callerError } = await supabaseAdmin
      .from("users")
      .select("id, name, employee_id, role")
      .eq("id", user.id)
      .single();

    if (callerError || !caller) {
      return NextResponse.json(
        { error: "Cannot verify caller" },
        { status: 403 },
      );
    }

    if (caller.role !== "moderator" && caller.role !== "assistant_moderator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ========================================================
    // VALIDATE BODY
    // ========================================================

    const body = await request.json();

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const password = typeof body.password === "string" ? body.password : "";

    const name = typeof body.name === "string" ? body.name.trim() : "";

    const role = typeof body.role === "string" ? body.role : "";

    const employeeId = nullableText(body.employee_id);

    const jobTitle = nullableText(body.job_title);

    const department = nullableText(body.department);

    if (!email || !email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const passwordCheck = validatePassword(password);

    if (!passwordCheck.valid) {
      return NextResponse.json(
        {
          error: PASSWORD_POLICY_MESSAGE,
        },
        { status: 400 },
      );
    }

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!ALLOWED_ROLES.includes(role as UserRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Assistant Moderator ห้ามสร้าง Moderator
    if (caller.role === "assistant_moderator" && role === "moderator") {
      return NextResponse.json(
        {
          error: "Assistant Moderator cannot create a Moderator",
        },
        { status: 403 },
      );
    }

    // ========================================================
    // DUPLICATE NAME CHECK
    // ========================================================

    const { data: existingNames, error: duplicateError } = await supabaseAdmin
      .from("users")
      .select("id, name")
      .ilike("name", name)
      .limit(1);

    if (duplicateError) {
      return NextResponse.json(
        {
          error: "Unable to validate user name",
        },
        { status: 500 },
      );
    }

    if (existingNames && existingNames.length > 0) {
      return NextResponse.json(
        {
          error: "มีชื่อผู้ใช้นี้ในระบบแล้ว",
        },
        { status: 409 },
      );
    }

    // ========================================================
    // CREATE AUTH USER
    // ========================================================

    const { data: createdAuth, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,

        // Admin-created account ใช้งานได้ทันที
        email_confirm: true,
      });

    if (createAuthError || !createdAuth.user) {
      return NextResponse.json(
        {
          error:
            createAuthError?.message || "Failed to create authentication user",
        },
        { status: 400 },
      );
    }

    const newUserId = createdAuth.user.id;

    // ========================================================
    // CREATE PUBLIC PROFILE
    // ========================================================

    const { error: profileError } = await supabaseAdmin.from("users").insert({
      id: newUserId,
      email,
      name,
      role,
      employee_id: employeeId,
      job_title: jobTitle,
      department,
    });

    if (profileError) {
      // compensating rollback:
      // ไม่ปล่อย auth.users ค้างโดยไม่มี public.users
      await supabaseAdmin.auth.admin.deleteUser(newUserId);

      return NextResponse.json(
        {
          error: profileError.message,
        },
        { status: 500 },
      );
    }

    // ========================================================
    // TRUSTED AUDIT
    // service_role write จึงต้องกำหนด actor เอง
    // ========================================================

    try {
      await writeUserAudit(
        supabaseAdmin,
        {
          id: user.id,
          name: caller.name,
          employee_id: caller.employee_id,
        },
        "CREATE_USER",
        `สร้างบัญชีผู้ใช้ ${name}`,
        {
          id: newUserId,
          email,
          name,
          role,
          employee_id: employeeId,
          job_title: jobTitle,
          department,
        },
      );
    } catch (auditError) {
      // Audit ถือเป็นส่วนหนึ่งของ operation
      // rollback account ที่เพิ่งสร้าง
      const { error: rollbackError } =
        await supabaseAdmin.auth.admin.deleteUser(newUserId);

      if (rollbackError) {
        console.error(
          "CREATE_USER audit failed and rollback failed:",
          auditError,
          rollbackError,
        );

        return NextResponse.json(
          {
            error:
              "User was created but audit/rollback failed. Manual review required.",
          },
          { status: 500 },
        );
      }

      console.error("CREATE_USER audit failed:", auditError);

      return NextResponse.json(
        {
          error: "Unable to create user because audit logging failed",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: newUserId,
          email,
          name,
          role,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/users error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
