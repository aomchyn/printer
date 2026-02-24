"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu, TreePine } from "lucide-react";

type PrinterLayoutProps = {
    children: React.ReactNode;
};

export default function PrinterLayout({ children }: PrinterLayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex flex-col md:flex-row bg-gradient-to-t from-blue-900 via-green-700 to-white min-h-screen">

            {/* Mobile Header (Visible only on small screens) */}
            <div className="md:hidden flex items-center justify-between bg-blue-900/90 text-white p-4 sticky top-0 z-40 shadow-lg backdrop-blur-md">
                <div className="font-bold text-lg flex items-center">
                    <TreePine className="mr-2 text-green-300 w-5 h-5 inline" />
                    {"<Printer OP />"}
                </div>
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition">
                    <Menu size={24} />
                </button>
            </div>

            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

            <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full flex flex-col items-center">
                <div className="bg-white/10 rounded-lg p-4 md:p-6 shadow-lg min-h-[calc(100vh-12rem)] md:min-h-full text-white w-full max-w-[1920px]">
                    {children}
                </div>

                {/* Global Footer */}
                <footer className="mt-8 mb-2 w-full text-center text-sm text-white/60">
                    <p>&copy; {new Date().getFullYear()} Printer OP. All rights reserved.</p>
                    <p className="mt-1 text-xs">Created by Chaloempon Promma</p>
                </footer>
            </main>
        </div>
    );
}
