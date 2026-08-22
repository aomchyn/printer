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
        .single();
      if (error) console.error("Error fetching user in layout:", error);

      const isQaUser =
        data?.role === "user" && data?.department?.startsWith("QA");
      const isAdminOrMod = [
        "moderator",
        "assistant_moderator",
        "operator",
      ].includes(data?.role);

      // เตะออกแค่คนไม่มีข้อมูลในฐานข้อมูล
      if (!data) {
        await Swal.fire({
          icon: "error",
          title: "ไม่มีสิทธิ์เข้าถึง",
          text: "ไม่พบข้อมูลผู้ใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
          confirmButtonColor: "#0057B8",
        });
        await supabase.auth.signOut();
        router.push("/login");
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
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7F8] text-[#00263A]">
        <Loader2 className="animate-spin mr-2" size={32} />
        <span className="text-lg font-bold">กำลังตรวจสอบสิทธิ์...</span>
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
