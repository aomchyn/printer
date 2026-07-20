"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu, Printer } from "lucide-react";
type PrinterLayoutProps = {
    children: React.ReactNode;
};

export default function PrinterLayout({ children }: PrinterLayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex flex-col md:flex-row bg-gradient-to-br from-slate-100 via-blue-200 to-indigo-300 h-[100dvh] overflow-hidden">

            {/* Mobile Header (เพิ่ม shrink-0 ป้องกันเมนูโดนบีบ) */}
            <div className="md:hidden sticky top-0 z-40 shrink-0">
                <div className="bg-gradient-to-r from-[#0f1e3d] via-[#152a54] to-[#1e3a8a] px-4 py-3.5 flex items-center justify-between shadow-xl border-b border-white/10 relative overflow-hidden">
                    {/* Glow decoration */}
                    <div className="absolute right-0 top-0 w-40 h-full bg-blue-500/10 blur-2xl pointer-events-none" />

                    <div className="flex items-center gap-2.5 relative">
                        <div className="p-1.5 bg-white/10 rounded-xl border border-white/15">
                            <Printer className="w-5 h-5 text-blue-300" />
                        </div>
                        <div>
                            <span className="font-black text-white text-lg tracking-tight leading-none">Printer OP</span>
                            <div className="w-2 h-0.5 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full mt-0.5" />
                        </div>
                    </div>

                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="relative p-2 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl border border-white/15 shadow-sm transition-all duration-200">
                        <Menu size={20} className="text-white" />
                    </button>
                </div>
            </div>

            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

            {/* Main Content (เอา flex ออกจาก main เพื่อแก้บั๊ก scroll) */}
            <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full relative">

                {/* Wrapper จัดระเบียบให้อยู่ตรงกลาง และดัน Footer ลงล่างสุด */}
                <div className="mx-auto w-full max-w-[1920px] min-h-full flex flex-col">

                    {/* Content Box (ใช้ flex-1 เพื่อดัน Footer) */}
                    <div className="flex-1 bg-white/10 rounded-lg p-4 md:p-6 shadow-lg text-white w-full">
                        {children}
                    </div>

                    {/* Footer (เพิ่ม shrink-0 ป้องกันโดนบีบ) */}
                    <footer className="shrink-0 mt-8 mb-2 w-full text-center">
                        <div className="inline-flex flex-col items-center gap-1 bg-white/20 backdrop-blur-sm border border-white/30 rounded-2xl px-6 py-3 shadow-sm">
                            <p className="text-[12px] font-bold text-[#0f1e3d]/80 tracking-wide">
                                &copy; {new Date().getFullYear()} Printer OP. All rights reserved.
                            </p>
                            <p className="text-[11px] font-medium text-[#0f1e3d]/60">
                                Created by Rapinlapatchaya Thananpatwarin 🫶🏻
                            </p>
                        </div>
                    </footer>

                </div>
            </main>
        </div>
    );
}