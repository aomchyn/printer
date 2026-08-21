import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { writeUserAudit } from "@/lib/serverAudit";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const newPassword =
      typeof body.newPassword === "string"
        ? body.newPassword
        : "";

    if (newPassword.length < 8) {
      return NextResponse.json(
        {
          error:
            "Password must be at least 8 characters long",
        },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const token = request.headers
      .get("Authorization")
      ?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userClient = createClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: caller, error: callerError } =
      await supabaseAdmin
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

    const { data: target, error: targetError } =
      await supabaseAdmin
        .from("users")
        .select("id, email, name, role")
        .eq("id", id)
        .single();

    if (targetError || !target) {
      return NextResponse.json(
        { error: "Target user not found" },
        { status: 404 },
      );
    }

    const isSelf = user.id === id;

    const isManager =
      caller.role === "moderator" ||
      caller.role === "assistant_moderator";

    if (!isSelf && !isManager) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    if (
      !isSelf &&
      caller.role === "assistant_moderator" &&
      target.role === "moderator"
    ) {
      return NextResponse.json(
        {
          error:
            "Assistant Moderator cannot change a Moderator password",
        },
        { status: 403 },
      );
    }

    const { error: passwordError } =
      await supabaseAdmin.auth.admin.updateUserById(
        id,
        { password: newPassword },
      );

    if (passwordError) {
      return NextResponse.json(
        { error: passwordError.message },
        { status: 500 },
      );
    }

    const action =
      isSelf
        ? "UPDATE_PROFILE"
        : "UPDATE_USER";

    try {
      await writeUserAudit(
        supabaseAdmin,
        caller,
        action,
        isSelf
          ? "เปลี่ยนรหัสผ่านของตนเอง"
          : "เปลี่ยนรหัสผ่านผู้ใช้",
        {
          id: target.id,
          name: target.name,
          password_changed: true,
        },
        {
          password: {
            changed: true,
          },
        },
      );
    } catch (auditError) {
      console.error(
        "Password changed but audit logging failed:",
        auditError,
      );

      return NextResponse.json(
        {
          error:
            "Password was changed, but audit logging failed",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error(
      "Unexpected password update error:",
      error,
    );

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}