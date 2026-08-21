import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { writeUserAudit } from "@/lib/serverAudit";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PUT(
  req: NextRequest,
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
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const token = req.headers
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

    if (
      caller.role !== "moderator" &&
      caller.role !== "assistant_moderator"
    ) {
      return NextResponse.json(
        { error: "Forbidden" },
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
            "Assistant Moderator cannot edit a Moderator",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const newEmail =
      typeof body.newEmail === "string"
        ? body.newEmail.trim()
        : "";

    if (!EMAIL_REGEX.test(newEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    if (newEmail === target.email) {
      return NextResponse.json({
        success: true,
        message: "Email unchanged",
      });
    }

    const { error: authUpdateError } =
      await supabaseAdmin.auth.admin.updateUserById(
        id,
        { email: newEmail },
      );

    if (authUpdateError) {
      return NextResponse.json(
        { error: authUpdateError.message },
        { status: 500 },
      );
    }

    const { error: dbError } = await supabaseAdmin
      .from("users")
      .update({ email: newEmail })
      .eq("id", id);

    if (dbError) {
      return NextResponse.json(
        { error: dbError.message },
        { status: 500 },
      );
    }

    const action =
      id === user.id
        ? "UPDATE_PROFILE"
        : "UPDATE_USER";

    try {
      await writeUserAudit(
        supabaseAdmin,
        caller,
        action,
        "เปลี่ยนอีเมลผู้ใช้",
        {
          id: target.id,
          name: target.name,
          email: newEmail,
          email_changed: true,
        },
        {
          email: {
            old: target.email,
            new: newEmail,
          },
        },
      );
    } catch (auditError) {
      console.error(
        "Email changed but audit logging failed:",
        auditError,
      );

      return NextResponse.json(
        {
          error:
            "Email was changed, but audit logging failed",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email updated successfully",
    });
  } catch (error) {
    console.error("Unexpected email update error:", error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}