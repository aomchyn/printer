"use client";

import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { Menu, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import Swal from "sweetalert2";

type PrinterLayoutProps = {
  children: React.ReactNode;
};

export default function PrinterLayout({ children }: PrinterLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();
      if (error) {
        console.error("Error fetching user in layout:", error);

        const {
          data: { session: latestSession },
        } = await supabase.auth.getSession();

        // Session ถูกยกเลิกระหว่างตรวจสอบ เช่น ครบเวลาใช้งาน 8 ชั่วโมง
        if (!latestSession) {
          router.replace("/login?reason=session_expired");
          return;
        }

        const result = await Swal.fire({
          icon: "error",
          title: "ตรวจสอบข้อมูลไม่สำเร็จ",
          text: "ระบบไม่สามารถตรวจสอบข้อมูลผู้ใช้งานได้ กรุณาลองใหม่อีกครั้ง",
          confirmButtonText: "ลองใหม่",
          confirmButtonColor: "#0057B8",
          allowOutsideClick: false,
          allowEscapeKey: false,
        });

        if (result.isConfirmed) {
          window.location.reload();
        }

        return;
      }

      const isQaUser =
        data?.role === "user" && data?.department?.startsWith("QA");
      const isAdminOrMod = [
        "moderator",
        "assistant_moderator",
        "operator",
      ].includes(data?.role);

      // เตะออกเฉพาะกรณียังมี session อยู่ แต่ไม่มีข้อมูลผู้ใช้ในฐานข้อมูลจริง
      if (!data) {
        const {
          data: { session: latestSession },
        } = await supabase.auth.getSession();

        // ถ้า session หายไประหว่างตรวจสอบ
        // เช่น SessionExpiryGuard บังคับออกเมื่อครบ 8 ชั่วโมง
        // ไม่ต้องแสดง Swal "ไม่พบข้อมูลผู้ใช้งาน"
        if (!latestSession) {
          router.replace("/login?reason=session_expired");
          return;
        }

        // ยังมี session แต่ไม่มี row ใน public.users จริง
        await Swal.fire({
          icon: "error",
          title: "ไม่มีสิทธิ์เข้าถึง",
          text: "ไม่พบข้อมูลผู้ใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
          confirmButtonColor: "#0057B8",
        });

        await supabase.auth.signOut({
          scope: "local",
        });

        router.replace("/login");
        return;
      } else if (
        pathname === "/printer/stability" &&
        !isQaUser &&
        !isAdminOrMod
      ) {
        // ถ้าพยายามเข้าหน้า stability แต่ไม่ใช่ QA / Moderator / Assistant Moderator / Operator ให้กลับ Dashboard
        await Swal.fire({
          icon: "warning",
          title: "ไม่มีสิทธิ์เข้าถึง",
          text: "หน้านี้สงวนสิทธิ์สำหรับแผนก QA เท่านั้น",
          confirmButtonColor: "#0057B8",
        });
        router.push("/printer/dashboard");
      } else {
        setIsAuthorized(true);
      }
    };

    checkRole();
  }, [router, pathname]);
  if (!isAuthorized) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden bg-[#F5F7F8] px-5">
        {/* Background decoration */}
        <div className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-[#0057B8]/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-[#00AEC7]/8 blur-3xl" />

        <div className="relative flex min-h-[100dvh] items-center justify-center">
          <div
            role="status"
            aria-live="polite"
            className="w-full max-w-[380px] overflow-hidden rounded-3xl border border-[#D9E1E2] bg-white shadow-[0_20px_60px_rgba(0,38,58,0.10)]"
          >
            {/* Brand header */}
            <div className="border-b border-[#D9E1E2]/80 bg-[#00263A] px-6 py-5">
              <div className="flex items-center justify-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner">
                  <Printer className="h-5 w-5 text-[#00AEC7]" />
                </div>

                <div>
                  <div className="text-[17px] font-black tracking-tight text-white">
                    Printer OP
                  </div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#00AEC7]">
                    Label Management System
                  </div>
                </div>
              </div>
            </div>

            {/* Loading content */}
            <div className="px-7 py-9 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#EAF3FC] ring-1 ring-[#0057B8]/10">
                <Loader2
                  className="h-10 w-10 animate-spin text-[#0057B8]"
                  strokeWidth={2.25}
                  aria-hidden="true"
                />
              </div>

              <h1 className="mt-6 text-xl font-black tracking-tight text-[#00263A]">
                กำลังตรวจสอบสิทธิ์
              </h1>

              <p className="mx-auto mt-2 max-w-[280px] text-[13px] font-medium leading-relaxed text-[#5F6B70]">
                กำลังยืนยันบัญชีและสิทธิ์การใช้งาน
                <br />
                กรุณารอสักครู่
              </p>

              {/* Loading indicator */}
              <div className="relative mx-auto mt-6 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-[#EAF3FC]">
                <div className="auth-loading-bar absolute inset-y-0 left-0 w-[45%] rounded-full bg-gradient-to-r from-[#0057B8] via-[#00AEC7] to-[#00B398]" />
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#8A9498]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00B398]" />
                Secure Access Verification
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row bg-[#F5F7F8] h-[100dvh] overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden sticky top-0 z-40 shrink-0">
        <div className="bg-[#00263A] px-4 py-3 flex items-center justify-between border-b border-[#00AEC7]/20 shadow-lg relative overflow-hidden">
          {/* Glow decoration */}
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-[#00AEC7]/15 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center gap-2.5 relative">
            <div className="w-9 h-9 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center shadow-inner">
              <Printer className="w-4.5 h-4.5 text-[#00AEC7]" />
            </div>

            <div>
              <div className="font-black text-white text-[16px] tracking-tight leading-none">
                Printer OP
              </div>
              <div className="text-[9px] text-[#00AEC7]/80 font-medium mt-1 tracking-wider uppercase">
                Label Management System
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="relative w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl border border-white/15 text-white transition-all duration-200"
            aria-label="เปิดเมนู"
          >
            <Menu size={19} />
          </button>
        </div>
      </div>

      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Main Content (เอา flex ออกจาก main เพื่อแก้บั๊ก scroll) */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full relative">
        {/* Wrapper จัดระเบียบให้อยู่ตรงกลาง และดัน Footer ลงล่างสุด */}
        <div className="mx-auto w-full max-w-[1920px] min-h-full flex flex-col">
          {/* Content Box (ใช้ flex-1 เพื่อดัน Footer) */}
          <div className="flex-1 rounded-lg p-4 md:p-6 text-[#101820] w-full">
            {children}
          </div>

          {/* Footer (เพิ่ม shrink-0 ป้องกันโดนบีบ) */}
          <footer className="shrink-0 mt-8 mb-2 w-full text-center">
            <div className="inline-flex flex-col items-center gap-1 bg-white border border-[#D9E1E2] rounded-2xl px-6 py-3 shadow-sm">
              <p className="text-[12px] font-bold text-[#00263A] tracking-wide">
                &copy; {new Date().getFullYear()} Printer OP. All rights
                reserved.
              </p>
              <p className="text-[11px] font-medium text-[#5F6B70]">
                Created by Rapinlapatchaya Thananpatwarin 🫶🏻
              </p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
