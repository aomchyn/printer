import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { writeUserAudit } from "@/lib/serverAudit";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: NextRequest,
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const token = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
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

    const isManager =
      caller.role === "moderator" ||
      caller.role === "assistant_moderator";

    if (!isManager) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    if (user.id === id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
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

    if (
      caller.role === "assistant_moderator" &&
      target.role === "moderator"
    ) {
      return NextResponse.json(
        {
          error:
            "Assistant Moderator cannot delete a Moderator",
        },
        { status: 403 },
      );
    }

    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 },
      );
    }

    try {
      await writeUserAudit(
        supabaseAdmin,
        {
          id: caller.id,
          name: caller.name,
          employee_id: caller.employee_id,
        },
        "DELETE_USER",
        `ลบบัญชีผู้ใช้ ${target.name}`,
        {
          id: target.id,
          email: target.email,
          name: target.name,
          role: target.role,
        },
      );
    } catch (auditError) {
      console.error(
        "User deleted but audit logging failed:",
        auditError,
      );

      return NextResponse.json(
        {
          error:
            "User was deleted, but audit logging failed",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "User deleted successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "DELETE /api/users/[id] error:",
      error,
    );

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}