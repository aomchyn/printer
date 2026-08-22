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

        // ไม่พบ profile จาก user.id:
        // เช็กซ้ำว่า email นี้มีบัญชีเดิมในระบบหรือไม่
        if (!profile) {
          if (!user.email) {
            throw new Error("ไม่พบอีเมลจากบัญชี Google");
          }

          const { data: existingEmailProfile, error: emailCheckError } =
            await supabase
              .from("users")
              .select("id, role, department")
              .ilike("email", user.email.trim())
              .maybeSingle();

          if (emailCheckError) {
            throw emailCheckError;
          }

          // email มีอยู่แล้ว แต่ auth user id ไม่ตรงกัน
          // ห้ามสร้างบัญชีใหม่หรือคัดลอก role เพื่อป้องกันสิทธิ์ผิดบัญชี
          if (existingEmailProfile) {
            throw new Error(
              "อีเมลนี้มีบัญชีอยู่ในระบบแล้ว แต่บัญชี Google ยังไม่ได้เชื่อมกับบัญชีเดิม กรุณาติดต่อผู้ดูแลระบบ",
            );
          }

          const googleName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email.split("@")[0] ||
            "Google User";

          const { error: insertError } = await supabase.from("users").insert({
            id: user.id,
            email: user.email.trim().toLowerCase(),
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

        if (!profile) {
          router.replace("/select-department");
          return;
        }

        if (profile.role === "user" && !profile.department) {
          router.replace("/select-department");
          return;
        }

        router.replace("/printer/dashboard");
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
