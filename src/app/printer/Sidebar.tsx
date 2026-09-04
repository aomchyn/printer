"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Swal from "sweetalert2";
import { supabase } from "@/lib/supabase";
import {
  X,
  Printer,
  UserCircle,
  LogOut,
  LineChart,
  Package,
  ShoppingCart,
  Users,
  History,
  ShieldAlert,
  Trash2,
  Activity,
  Layers,
  Eye,
  EyeOff,
  BriefcaseBusiness,
} from "lucide-react";
import {
  PASSWORD_POLICY_MESSAGE,
  validatePassword,
} from "@/lib/passwordPolicy";
import { shouldShowCareerMetricsNavigation } from "@/lib/careerMetricsAccess";
import { CAREER_METRICS_COPY } from "./career-metrics/copy";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    employee_id: "",
    job_title: "",
    department: "",
    new_password: "",
    confirm_password: "",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [qaPendingCount, setQaPendingCount] = useState(0);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  // ── ไม่แตะ logic เลย ──────────────────────────────────────────────
  async function fetchData() {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session) {
        router.push("/login");
        return;
      }
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (userData) {
        setName(userData.name);
        setRole(userData.role);
        setEmployeeId(userData.employee_id || "");
        setJobTitle(userData.job_title || "");
        setDepartment(userData.department || "");
      } else {
        const fallbackName = session.user.email?.split("@")[0] || "User";
        const fallbackRole = "user";
        await supabase.from("users").insert({
          id: session.user.id,
          email: session.user.email,
          name: fallbackName,
          role: fallbackRole,
          department: "ไม่ระบุ",
        });
        setName(fallbackName);
        setRole(fallbackRole);
      }
    } catch (error) {
      console.error("Failure mapping user info", error);
    }
  }

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("sidebar-roles")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
        },
        (payload) => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user.id === payload.new.id) {
              setName(payload.new.name || "");
              setRole(payload.new.role || "user");
              setEmployeeId(payload.new.employee_id || "");
              setJobTitle(payload.new.job_title || "");
              setDepartment(payload.new.department || "");
            }
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role !== "moderator") {
      setQaPendingCount(0);
      return;
    }

    let active = true;

    const fetchQaPendingCount = async () => {
      try {
        const { count, error } = await supabase
          .from("qa_department_requests")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("status", "pending");

        if (error) {
          console.error("Failed to load QA pending count:", error);
          return;
        }

        if (active) {
          setQaPendingCount(count ?? 0);
        }
      } catch (error) {
        console.error("Failed to load QA pending count:", error);
      }
    };

    fetchQaPendingCount();

    // เผื่อมีคำขอเข้ามาขณะ Moderator เปิดระบบค้างไว้
    const interval = window.setInterval(fetchQaPendingCount, 30000);

    // กลับมาที่ browser แล้ว refresh ทันที
    const handleFocus = () => {
      fetchQaPendingCount();
    };

    // ใช้ตอน approve/reject เพื่อให้ badge เปลี่ยนทันที
    const handleQaRequestChanged = () => {
      fetchQaPendingCount();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("qa-request-changed", handleQaRequestChanged);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("qa-request-changed", handleQaRequestChanged);
    };
  }, [role, pathname]);

  const openProfile = () => {
    setProfileForm({
      name,
      employee_id: employeeId,
      job_title: jobTitle,
      department,
      new_password: "",
      confirm_password: "",
    });
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsProfileOpen(true);
  };

  const saveProfile = async () => {
    if (!profileForm.name.trim()) {
      Swal.fire({
        icon: "warning",
        title: "กรุณากรอกชื่อ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    if (
      profileForm.new_password &&
      profileForm.new_password !== profileForm.confirm_password
    ) {
      Swal.fire({
        icon: "error",
        title: "รหัสผ่านไม่ตรงกัน",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    if (profileForm.new_password) {
      const passwordCheck = validatePassword(profileForm.new_password);

      if (!passwordCheck.valid) {
        Swal.fire({
          icon: "warning",
          title: "รหัสผ่านไม่ปลอดภัย",
          text: PASSWORD_POLICY_MESSAGE,
          confirmButtonColor: "#0057B8",
        });
        return;
      }
    }
    const hasChanges =
      profileForm.name.trim() !== name ||
      profileForm.employee_id.trim() !== employeeId ||
      profileForm.job_title.trim() !== jobTitle ||
      profileForm.new_password !== "";
    if (!hasChanges) {
      Swal.fire({
        icon: "info",
        title: "ไม่มีการเปลี่ยนแปลง",
        text: "คุณยังไม่ได้แก้ไขข้อมูลโปรไฟล์ใดๆ",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    setIsSavingProfile(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { error: updateError } = await supabase
        .from("users")
        .update({
          name: profileForm.name.trim(),
          employee_id: profileForm.employee_id.trim() || null,
          job_title: profileForm.job_title.trim() || null,
        })
        .eq("id", session.user.id);
      if (updateError) throw updateError;
      if (profileForm.new_password) {
        if (!session.access_token) {
          throw new Error("Session expired");
        }

        const res = await fetch(`/api/users/${session.user.id}/password`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            newPassword: profileForm.new_password,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
        }

        await supabase.auth.refreshSession();
      }
      setName(profileForm.name.trim());
      setEmployeeId(profileForm.employee_id.trim());
      setJobTitle(profileForm.job_title.trim());
      setDepartment(profileForm.department.trim());
      setIsProfileOpen(false);
      Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      const errorWithMessage = err as { message?: string };
      Swal.fire({
        icon: "error",
        title: "บันทึกไม่สำเร็จ",
        text: errorWithMessage.message || "กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    try {
      const button = await Swal.fire({
        icon: "warning",
        title: "ยืนยันลงชื่อออก",
        text: "คุณแน่ใจที่จะลงชื่อออกจากระบบหรือไม่ ?",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        await supabase.auth.signOut();
        router.push("/login");
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "ไม่สามารถลงชื่อออกได้" + err,
      });
    }
  };

  const navigate = (path: string) => {
    router.push(path);
    setIsOpen(false);
  };
  // ── จบ logic ──────────────────────────────────────────────────────

  const roleBadge: Record<string, { label: string; cls: string }> = {
    moderator: {
      label: "Moderator",
      cls: "text-white bg-[#0057B8]/35 border-[#00AEC7]/40",
    },
    assistant_moderator: {
      label: "Asst. Moderator",
      cls: "text-[#BFEFF5] bg-[#00AEC7]/15 border-[#00AEC7]/30",
    },
    operator: {
      label: "Operator",
      cls: "text-[#BFEFF5] bg-[#00AEC7]/15 border-[#00AEC7]/30",
    },
  };
  const { label: roleLabel, cls: roleCls } = roleBadge[role] ?? {
    label: "User",
    cls: "text-white/80 bg-white/10 border-white/15",
  };

  const isQaUser = role === "user" && department?.startsWith("QA");

  const navItem = (
    path: string,
    icon: React.ReactNode,
    label: string,
    activeCls = "bg-[#0057B8] text-white shadow-sm",
  ) => (
    <button
      onClick={() => navigate(path)}
      className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all duration-200
                ${pathname.includes(path.split("/").pop()!) ? activeCls + " border border-[#00AEC7]/40" : "text-white/70 hover:bg-white/8 hover:text-white border border-transparent"}`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
                fixed inset-y-0 left-0 z-50 w-72 flex flex-col
bg-[#00263A]
border-r border-white/10 shadow-2xl
                transform transition-transform duration-300 ease-in-out
                md:relative md:translate-x-0
                ${isOpen ? "translate-x-0" : "-translate-x-full"}
            `}
      >
        {/* ── Brand ── */}
        <div className="px-5 py-5 border-b border-white/8 relative overflow-hidden shrink-0">
          {/* glow */}
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-[#00AEC7]/15 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 relative">
            <div className="w-9 h-9 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center shadow-inner shrink-0">
              <Printer className="w-4.5 h-4.5 text-[#00AEC7]" />
            </div>
            <div>
              <div className="text-[16px] font-black text-white tracking-tight leading-none">
                Printer OP
              </div>
              <div className="text-[10px] text-[#00AEC7]/80 font-medium mt-0.5 tracking-wider uppercase">
                Label Management System
              </div>
            </div>
          </div>

          {/* Mobile close */}
          <button
            className="md:hidden absolute top-4 right-4 p-1.5 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all"
            onClick={() => setIsOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── User card ── */}
        <div className="px-4 py-4 border-b border-white/8 shrink-0">
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {/* Avatar row */}
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 bg-[#0057B8] border border-[#00AEC7]/40 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md">
                {name ? name.charAt(0).toUpperCase() : "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-white font-bold text-sm truncate leading-tight">
                  {name || "Loading..."}
                </div>
                <span
                  className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wider ${roleCls}`}
                >
                  {roleLabel}
                </span>
              </div>
            </div>

            {/* Info rows */}
            {(employeeId || jobTitle || department) && (
              <div className="px-4 pb-3 flex flex-col gap-1.5 text-[11px] border-t border-white/8 pt-2.5">
                {employeeId && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#00AEC7]/80 font-medium">
                      รหัสพนักงาน
                    </span>
                    <span className="text-white/90 font-bold font-mono">
                      {employeeId}
                    </span>
                  </div>
                )}
                {jobTitle && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[#00AEC7]/80 font-medium shrink-0">
                      ตำแหน่ง
                    </span>
                    <span className="text-white/90 font-medium truncate text-right">
                      {jobTitle}
                    </span>
                  </div>
                )}
                {department && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[#00AEC7]/80 font-medium shrink-0">
                      หน่วยงาน
                    </span>
                    <span className="text-white/90 font-medium truncate text-right">
                      {department.split(" ")[0]}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={openProfile}
              className="flex-1 flex items-center justify-center gap-1.5 bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white/80 hover:text-white py-2 rounded-xl text-xs font-semibold transition-all duration-200"
            >
              <UserCircle className="w-3.5 h-3.5" /> แก้ไขโปรไฟล์
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/30 hover:border-rose-400/50 text-rose-300 hover:text-rose-200 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItem(
            "/printer/dashboard",
            <LineChart className="w-4 h-4" />,
            "Dashboard",
          )}
          {(role === "moderator" ||
            role === "assistant_moderator" ||
            role === "operator") &&
            navItem(
              "/printer/statistics",
              <History className="w-4 h-4" />,
              "Statistics",
            )}
          {navItem(
            "/printer/product",
            <Package className="w-4 h-4" />,
            "Product",
          )}
          {navItem(
            "/printer/order",
            <ShoppingCart className="w-4 h-4" />,
            "Orders",
          )}
          {(role === "moderator" ||
            role === "assistant_moderator" ||
            role === "operator" ||
            isQaUser) &&
            navItem(
              "/printer/stability",
              <Activity className="w-4 h-4" />,
              "Stability Feed",
            )}

          {(role === "moderator" || role === "assistant_moderator") && (
            <div className="pt-4 mt-2 border-t border-white/8">
              <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2 px-2">
                Admin Tools
              </div>
              <div className="space-y-1">
                {navItem(
                  "/printer/stock",
                  <Package className="w-4 h-4" />,
                  "Paper Stock",
                  "bg-[#0057B8] text-white border-[#00AEC7]/40",
                )}
                {navItem(
                  "/printer/paper-report",
                  <Layers className="w-4 h-4" />,
                  "Paper Report",
                  "bg-[#0057B8] text-white border-[#00AEC7]/40",
                )}
                <div className="relative">
                  {navItem(
                    "/printer/user",
                    <Users className="w-4 h-4" />,
                    "Manage Users",
                    "bg-[#0057B8] text-white border-[#00AEC7]/40",
                  )}

                  {role === "moderator" && qaPendingCount > 0 && (
                    <span
                      className="
        absolute right-2.5 top-1/2 -translate-y-1/2
        min-w-[20px] h-5 px-1.5
        flex items-center justify-center
        rounded-full
        bg-red-500 text-white
        text-[10px] font-black
        shadow-lg shadow-red-500/30
        border border-red-300/40
        pointer-events-none
        animate-pulse
      "
                      title={`${qaPendingCount} คำขอ QA รออนุมัติ`}
                    >
                      {qaPendingCount > 99 ? "99+" : qaPendingCount}
                    </span>
                  )}
                </div>
                {role === "moderator" &&
                  navItem(
                    "/printer/logs",
                    <ShieldAlert className="w-4 h-4" />,
                    "Audit Logs",
                    "bg-[#0057B8] text-white border-[#00AEC7]/40",
                  )}
                {shouldShowCareerMetricsNavigation(role) &&
                  navItem(
                    "/printer/career-metrics",
                    <BriefcaseBusiness className="w-4 h-4" />,
                    CAREER_METRICS_COPY.sidebarLabel,
                    "bg-[#0057B8] text-white border-[#00AEC7]/40",
                  )}
                {navItem(
                  "/printer/trash",
                  <Trash2 className="w-4 h-4" />,
                  "Trash",
                  "bg-[#0057B8] text-white border-[#00AEC7]/40",
                )}
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* ── Profile Modal ── */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-200/80 overflow-hidden">
            {/* Header */}
            <div className="bg-[#00263A] px-6 py-4 flex justify-between items-center border-b border-[#00AEC7]/20">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-white/10 rounded-xl border border-white/15">
                  <UserCircle className="w-4 h-4 text-[#00AEC7]" />
                </div>
                <h2 className="text-[15px] font-black text-white tracking-tight">
                  แก้ไขโปรไฟล์
                </h2>
              </div>
              <button
                onClick={() => setIsProfileOpen(false)}
                className="p-1.5 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {[
                { label: "ชื่อ", key: "name", required: true, type: "text" },
                { label: "รหัสพนักงาน", key: "employee_id", type: "text" },
                { label: "ตำแหน่งงาน", key: "job_title", type: "text" },
              ].map(({ label, key, required, type }) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {label}{" "}
                    {required && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type={type}
                    value={profileForm[key as keyof typeof profileForm]}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[#101820] text-sm font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all"
                  />
                </div>
              ))}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  หน่วยงาน
                </label>

                <div className="w-full px-4 py-2.5 bg-[#F0F3F4] border border-[#D9E1E2] rounded-xl text-[#101820] text-sm font-medium">
                  {department || "ยังไม่ได้เลือกหน่วยงาน"}
                </div>

                <p className="mt-1.5 text-[10.5px] text-slate-400">
                  หน่วยงานไม่สามารถเปลี่ยนจากหน้าโปรไฟล์ได้
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  เปลี่ยนรหัสผ่าน (ถ้าต้องการ)
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      รหัสผ่านใหม่
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={profileForm.new_password}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            new_password: e.target.value,
                          }))
                        }
                        placeholder="ปล่อยว่างถ้าไม่ต้องการเปลี่ยน"
                        className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 rounded-xl text-[#101820] text-sm font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label={
                          showNewPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                        }
                      >
                        {showNewPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      ยืนยันรหัสผ่านใหม่
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={profileForm.confirm_password}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            confirm_password: e.target.value,
                          }))
                        }
                        className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 rounded-xl text-[#101820] text-sm font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label={
                          showConfirmPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setIsProfileOpen(false)}
                className="flex-1 bg-[#F0F3F4] hover:bg-[#D9E1E2] text-[#5F6B70] py-3 rounded-xl font-bold text-xs transition-all duration-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={saveProfile}
                disabled={isSavingProfile}
                className="flex-1 bg-[#0057B8] hover:bg-[#004A9F] disabled:bg-slate-300 text-white py-3 rounded-xl font-bold text-xs shadow-md transition-all duration-200"
              >
                {isSavingProfile ? "กำลังบันทึก..." : "💾 บันทึกการแก้ไข"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
