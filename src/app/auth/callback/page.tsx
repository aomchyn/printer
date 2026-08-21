"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("กำลังเข้าสู่ระบบ...");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const finishLogin = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const oauthError =
          params.get("error_description") || params.get("error");

        if (oauthError) {
          throw new Error(oauthError);
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          throw new Error("ไม่พบข้อมูลการเข้าสู่ระบบจาก Google");
        }

        const user = session.user;

        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("id, role, department")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        // Defense-in-depth:
        // Google Login ใช้ได้เฉพาะ role=user
        if (profile && profile.role !== "user") {
          await supabase.auth.signOut();

          throw new Error(
            "บัญชีเจ้าหน้าที่ไม่สามารถเข้าสู่ระบบด้วย Google ได้",
          );
        }

        // Google user ใหม่: สร้าง public.users
        if (!profile) {
          const googleName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Google User";

          const { error: insertError } = await supabase.from("users").insert({
            id: user.id,
            email: user.email,
            name: String(googleName).trim(),
            role: "user",
            department: null,
          });

          if (insertError) {
            throw insertError;
          }
        }

        // ใช้ trusted LOGIN audit เดิม
        const { error: auditError } = await supabase.rpc("record_login_audit");

        if (auditError) {
          throw new Error("ไม่สามารถบันทึกประวัติการเข้าสู่ระบบได้");
        }

        if (!profile || !profile.department) {
          router.replace("/select-department");
        } else {
          router.replace("/printer/dashboard");
        }
      } catch (error) {
        console.error("Google login callback error:", error);

        await supabase.auth.signOut();

        const msg =
          error instanceof Error
            ? error.message
            : "เข้าสู่ระบบด้วย Google ไม่สำเร็จ";

        setMessage(msg);
      }
    };

    finishLogin();
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <p>{message}</p>
    </main>
  );
}
