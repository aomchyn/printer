"use client";

import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import Modal from "../components/Modal";
import { supabase } from "@/lib/supabase";
import QaApprovalPanel from "./QaApprovalPanel";
import { getSignatureStoragePath } from "@/lib/signatureStorage";
import {
  Edit2,
  Trash2,
  X,
  Check,
  UserPlus,
  Search,
  Mail,
  BadgeCheck,
  Briefcase,
  Building2,
  Shield,
  Users,
  Eye,
  EyeOff,
} from "lucide-react";
import { UserSkeleton } from "./skeleton-loading-user";
import {
  PASSWORD_POLICY_MESSAGE,
  validatePassword,
} from "@/lib/passwordPolicy";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  employee_id?: string;
  job_title?: string;
  department?: string;
  signature_url?: string | null;
  signature_preview_url?: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type RoleKey = "moderator" | "assistant_moderator" | "operator" | "user";

const ROLE_LABEL: Record<RoleKey, string> = {
  moderator: "Moderator",
  assistant_moderator: "Asst. Moderator",
  operator: "Operator",
  user: "User",
};

const ROLE_CONFIG: Record<
  RoleKey,
  { badge: string; avatar: string; border: string; cardCls: string }
> = {
  moderator: {
    badge: "bg-[#EAF3FC] text-[#0057B8] border border-[#0057B8]/20",
    avatar: "bg-gradient-to-br from-[#0057B8] to-[#00263A]",
    border: "border-l-[#0057B8]",
    cardCls:
      "bg-gradient-to-br from-white to-[#EAF3FC] border-[#0057B8]/20 shadow-md shadow-[#0057B8]/5",
  },
  assistant_moderator: {
    badge: "bg-[#E5F8FB] text-[#007E91] border border-[#00AEC7]/25",
    avatar: "bg-gradient-to-br from-[#00AEC7] to-[#0057B8]",
    border: "border-l-[#00AEC7]",
    cardCls:
      "bg-gradient-to-br from-white to-[#E5F8FB] border-[#00AEC7]/25 shadow-md shadow-[#00AEC7]/5",
  },
  operator: {
    badge: "bg-[#E6F8F4] text-[#008C78] border border-[#00B398]/25",
    avatar: "bg-gradient-to-br from-[#00B398] to-[#008C78]",
    border: "border-l-[#00B398]",
    cardCls:
      "bg-gradient-to-br from-white to-[#E6F8F4] border-[#00B398]/25 shadow-md shadow-[#00B398]/5",
  },
  user: {
    badge: "bg-[#EAF3FC] text-[#0057B8] border border-[#0057B8]/20",
    avatar: "bg-gradient-to-br from-[#0057B8] to-[#004A9F]",
    border: "border-l-[#0057B8]",
    cardCls:
      "bg-gradient-to-br from-white to-[#EAF3FC] border-[#0057B8]/20 shadow-md shadow-[#0057B8]/5",
  },
};

const SECTION_GROUPS: {
  key: string;
  roles: RoleKey[];
  label: string;
  icon: React.ElementType;
  colorClass: string;
}[] = [
  {
    key: "admin",
    roles: ["moderator", "assistant_moderator"],
    label: "ผู้ดูแลระบบ",
    icon: Shield,
    colorClass: "text-[#0057B8]",
  },
  {
    key: "operator",
    roles: ["operator"],
    label: "Operator",
    icon: Briefcase,
    colorClass: "text-[#00B398]",
  },
  {
    key: "user",
    roles: ["user"],
    label: "พนักงานทั่วไป",
    icon: Users,
    colorClass: "text-[#00AEC7]",
  },
];

const DEPARTMENTS = [
  { value: "QA ประกันคุณภาพ", short: "QA", label: "ประกันคุณภาพ" },
  { value: "PD ฝ่ายผลิต", short: "PD", label: "ฝ่ายผลิต" },
  { value: "WH คลังสินค้า", short: "WH", label: "คลังสินค้า" },
  { value: "VD ผลิตยาสัตว์", short: "VD", label: "ผลิตยาสัตว์" },
];

function MetaChip({
  icon: Icon,
  value,
}: {
  icon: React.ElementType;
  value?: string | null;
}) {
  const isEmpty = !value;
  return (
    <div
      className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md ${isEmpty ? "text-slate-300" : "text-slate-500 bg-[#EAF3FC]"}`}
    >
      <Icon
        className={`w-3 h-3 flex-shrink-0 ${isEmpty ? "text-slate-300" : "text-slate-400"}`}
      />
      <span className="truncate">{isEmpty ? "—" : value}</span>
    </div>
  );
}

function UserCard({
  user,
  onEdit,
  onDelete,
  currentUserId,
}: {
  user: User;
  onEdit: (u: User) => void;
  onDelete: (u: User) => void;
  currentUserId: string | null;
}) {
  const role = (user.role ?? "user") as RoleKey;
  const cfg = ROLE_CONFIG[role];
  const isSelf = user.id === currentUserId;

  return (
    <div
      className={`${cfg.cardCls} border border-l-4 ${cfg.border} rounded-2xl p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between h-full`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center text-[13px] font-bold text-white ${cfg.avatar} shadow-md mt-0.5 shrink-0`}
        >
          {getInitials(user.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span
              className="text-[13.5px] font-bold text-[#00263A] truncate"
              title={user.name}
            >
              {user.name}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide ${cfg.badge}`}
            >
              {ROLE_LABEL[role]}
            </span>
            {isSelf && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-600 border border-amber-400/30 shrink-0">
                คุณ
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-2.5 overflow-hidden">
            <Mail className="w-3 h-3 flex-shrink-0 text-slate-300" />
            <span className="truncate" title={user.email}>
              {user.email}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mb-1">
            <MetaChip icon={BadgeCheck} value={user.employee_id} />
            <MetaChip icon={Briefcase} value={user.job_title} />
            <MetaChip
              icon={Building2}
              value={
                user.department
                  ? (DEPARTMENTS.find((d) => d.value === user.department)
                      ?.short ?? user.department)
                  : null
              }
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 pt-3 mt-3 border-t border-[#EAF3FC] justify-end">
        <button
          onClick={() => onEdit(user)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#0057B8]/30 hover:bg-[#EAF3FC] text-slate-700 hover:text-[#0057B8] text-[11.5px] font-bold transition-all active:scale-95"
        >
          <Edit2 className="w-3 h-3" /> แก้ไข
        </button>
        {isSelf ? (
          <div
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-300 text-[11.5px] font-bold cursor-not-allowed"
            title="ไม่สามารถลบบัญชีตัวเองได้"
          >
            <Trash2 className="w-3 h-3" /> ลบ
          </div>
        ) : (
          <button
            onClick={() => onDelete(user)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50/30 text-slate-700 hover:text-red-600 text-[11.5px] font-bold transition-all active:scale-95"
          >
            <Trash2 className="w-3 h-3" /> ลบ
          </button>
        )}
      </div>
    </div>
  );
}

const inputCls = `w-full px-3.5 py-2.5 text-[13px] bg-white border border-[#D9E1E2] rounded-lg text-[#00263A] placeholder:text-slate-400 focus:outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10 transition-all`;
const labelCls =
  "block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider";

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showUserPassword, setShowUserPassword] = useState(false);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) {
        const usersWithSignaturePreview = await Promise.all(
          data.map(async (user) => {
            const storedSignature = user.signature_url;

            if (!storedSignature) {
              return {
                ...user,
                signature_preview_url: null,
              };
            }

            // รองรับข้อมูลเก่าระหว่าง migration
            if (/^https?:\/\//i.test(storedSignature)) {
              return {
                ...user,
                signature_preview_url: storedSignature,
              };
            }

            const path = getSignatureStoragePath(storedSignature);

            if (!path) {
              return {
                ...user,
                signature_preview_url: null,
              };
            }

            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("signatures")
                .createSignedUrl(path, 3600);

            return {
              ...user,
              signature_url: path,
              signature_preview_url: signedError
                ? null
                : (signedData?.signedUrl ?? null),
            };
          }),
        );

        setUsers(usersWithSignaturePreview);
      }
    } catch {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to fetch users",
      });
    }
  };

  const checkAdminStatus = async () => {
    setIsLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      setCurrentUserId(session.user.id);
      const { data } = await supabase
        .from("users")
        .select("role")
        .eq("id", session.user.id)
        .single();
      if (data?.role === "moderator" || data?.role === "assistant_moderator") {
        setIsAdmin(true);
        setCurrentUserRole(data.role);
        await fetchUsers();
      } else
        Swal.fire({
          icon: "error",
          title: "ไม่มีสิทธิ์เข้าถึง",
          text: "เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น",
        });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const isDuplicateName = (n: string, excludeId?: string) =>
    users.some(
      (u) => u.name.toLowerCase() === n.toLowerCase() && u.id !== excludeId,
    );

  const resetForm = () => {
    setShowModal(false);
    setEditingUser(null);
    setEmail("");
    setName("");
    setEmployeeId("");
    setJobTitle("");
    setDepartment("");
    setPassword("");
    setShowUserPassword(false);
    setRole("user");
    setSignatureFile(null);
    setSignaturePreview(null);
  };

  const handleDeleteSignature = async () => {
    if (!editingUser?.signature_url || signatureFile !== null) {
      setSignaturePreview(null);
      setSignatureFile(null);
      return;
    }

    const result = await Swal.fire({
      title: "ยืนยันการลบลายเซ็น?",
      text: "ลายเซ็นนี้จะถูกลบออกจากฐานข้อมูลทันที ไม่สามารถกู้คืนได้",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "ลบทันที",
      cancelButtonText: "ยกเลิก",
    });

    if (result.isConfirmed) {
      Swal.fire({
        title: "กำลังลบ...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("Session not found");

        const res = await fetch(`/api/users/${editingUser.id}/signature`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Failed to delete signature");

        setSignaturePreview(null);
        setSignatureFile(null);
        setEditingUser({
          ...editingUser,
          signature_url: null,
          signature_preview_url: null,
        });
        fetchUsers();

        Swal.fire({
          icon: "success",
          title: "ลบลายเซ็นเรียบร้อย",
          timer: 1500,
        });
      } catch (err: any) {
        Swal.fire({
          icon: "error",
          title: "ข้อผิดพลาด",
          text: err.message || "ไม่สามารถลบลายเซ็นได้",
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      const hasChanges =
        name !== editingUser.name ||
        email !== editingUser.email ||
        role !== (editingUser.role ?? "user") ||
        (employeeId || "") !== (editingUser.employee_id || "") ||
        (jobTitle || "") !== (editingUser.job_title || "") ||
        (department || "") !== (editingUser.department || "") ||
        (password && password.trim().length > 0) ||
        signatureFile !== null;
      if (!hasChanges) {
        Swal.fire({
          icon: "info",
          title: "ไม่มีการเปลี่ยนแปลง",
          text: "ไม่พบการแก้ไขข้อมูลใดๆ",
        });
        return;
      }
      if (isDuplicateName(name, editingUser.id)) {
        Swal.fire({
          icon: "error",
          title: "ชื่อผู้ใช้ซ้ำ",
          text: "มีชื่อผู้ใช้นี้ในระบบแล้ว",
        });
        return;
      }

      if (password && password.trim().length > 0) {
        const passwordCheck = validatePassword(password);

        if (!passwordCheck.valid) {
          Swal.fire({
            icon: "error",
            title: "รหัสผ่านไม่ปลอดภัย",
            text: PASSWORD_POLICY_MESSAGE,
          });
          return;
        }
      }
      Swal.fire({
        title: "กำลังบันทึก...",
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });
      try {
        let finalSignatureUrl: string | null =
          editingUser.signature_url || null;

        // หากมีการอัพโหลดรูปใหม่ทับของเดิม ให้ไปลบรูปเก่าออกจาก Storage ด้วย
        if (signatureFile !== null && editingUser.signature_url) {
          try {
            const oldFilePath = getSignatureStoragePath(
              editingUser.signature_url,
            );

            if (oldFilePath) {
              await supabase.storage.from("signatures").remove([oldFilePath]);
            }
          } catch (err) {
            console.error("Failed to delete old signature:", err);
          }
        }

        if (signatureFile) {
          const fileExt = signatureFile.name.split(".").pop();
          const fileName = `${editingUser.id}-${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from("signatures")
            .upload(fileName, signatureFile, { upsert: true });
          if (uploadError) throw uploadError;
          finalSignatureUrl = fileName;
        }

        const { error } = await supabase
          .from("users")
          .update({
            name,
            role,
            employee_id: employeeId || null,
            job_title: jobTitle || null,
            department: department || null,
            signature_url: finalSignatureUrl,
          })
          .eq("id", editingUser.id);
        if (error) throw error;
        if (email !== editingUser.email) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error("Session expired");
          const res = await fetch(`/api/users/${editingUser.id}/email`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ newEmail: email }),
          });
          if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error || "Failed to update email");
          }
        }
        if (password && password.trim().length > 0) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) throw new Error("Session หมดอายุ กรุณา Login ใหม่");
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error("Session expired");
          const res = await fetch(`/api/users/${editingUser.id}/password`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ newPassword: password }),
          });
          if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error || "Failed to update password");
          }
        }
        Swal.fire({
          icon: "success",
          title: "สำเร็จ",
          text: password
            ? "อัปเดตผู้ใช้และเปลี่ยนรหัสผ่านเรียบร้อย"
            : "อัปเดตผู้ใช้เรียบร้อย",
          timer: 1500,
        });
        resetForm();
        fetchUsers();
      } catch (error: any) {
        Swal.fire({
          icon: "error",
          title: "ข้อผิดพลาด",
          text: error.message || "Failed to save user",
        });
      }
    } else {
      if (isDuplicateName(name)) {
        Swal.fire({
          icon: "error",
          title: "ชื่อผู้ใช้ซ้ำ",
          text: "มีชื่อผู้ใช้นี้ในระบบแล้ว",
        });
        return;
      }
      const passwordCheck = validatePassword(password);

      if (!passwordCheck.valid) {
        Swal.fire({
          icon: "error",
          title: "รหัสผ่านไม่ปลอดภัย",
          text: PASSWORD_POLICY_MESSAGE,
        });
        return;
      }
      Swal.fire({
        title: "กำลังสร้างบัญชี...",
        didOpen: () => {
          Swal.showLoading();
        },
      });
      try {
        const { error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
          throw new Error("Session หมดอายุ กรุณา Login ใหม่");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("Session expired");
        }

        const res = await fetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email,
            password,
            name,
            role,
            employee_id: employeeId || null,
            job_title: jobTitle || null,
            department: department || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json();

          throw new Error(data.error || "Failed to create user");
        }
        Swal.fire({
          icon: "success",
          title: "สำเร็จ",
          text: "สร้างบัญชีผู้ใช้ใหม่เรียบร้อยแล้ว",
          timer: 1500,
        });
        resetForm();
        fetchUsers();
      } catch (error: any) {
        let msg = error.message;
        if (msg?.includes("users_id_fkey"))
          msg = "ไม่สามารถสร้างผู้ใช้ได้ เนื่องจากอีเมลนี้ถูกใช้งานไปแล้ว";
        Swal.fire({
          icon: "error",
          title: "ข้อผิดพลาด",
          text: msg || "Failed to save user",
        });
      }
    }
  };

  const handleDelete = async (user: User) => {
    if (
      user.role === "moderator" &&
      currentUserRole === "assistant_moderator"
    ) {
      Swal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์",
        text: "คุณไม่สามารถลบบัญชีของ Moderator ได้",
      });
      return;
    }
    if (user.id === currentUserId) {
      Swal.fire({
        icon: "warning",
        title: "ไม่สามารถดำเนินการได้",
        text: "คุณไม่สามารถลบบัญชีของตัวเองได้",
      });
      return;
    }
    const result = await Swal.fire({
      icon: "warning",
      title: "Are You Sure?",
      text: `คุณต้องการลบบัญชีผู้ใช้ "${user.name}" อย่างถาวรหรือไม่?`,
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to delete user via API");
      }
      Swal.fire({
        icon: "success",
        title: "Success",
        text: "User Deleted Successfully",
        timer: 1000,
      });
      fetchUsers();
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error instanceof Error ? error.message : "Failed to delete user",
      });
    }
  };

  const handleEdit = (user: User) => {
    if (
      user.role === "moderator" &&
      currentUserRole === "assistant_moderator"
    ) {
      Swal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์",
        text: "คุณไม่สามารถแก้ไขข้อมูลของ Moderator ได้",
      });
      return;
    }
    setEditingUser(user);
    setEmail(user.email);
    setName(user.name);
    setEmployeeId(user.employee_id || "");
    setJobTitle(user.job_title || "");
    setDepartment(user.department || "");
    setRole(user.role ?? "user");
    setPassword("");
    setShowUserPassword(false);
    setSignatureFile(null);
    setSignaturePreview(user.signature_preview_url || null);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingUser(null);
    setEmail("");
    setName("");
    setEmployeeId("");
    setJobTitle("");
    setDepartment("");
    setPassword("");
    setShowUserPassword(false);
    setRole("user");
    setShowModal(true);
  };

  if (isLoading) return <UserSkeleton />;

  if (!isAdmin)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7F8] p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-[#00263A] mb-2 tracking-wide">
            Access Denied
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถเข้าถึงหน้านี้ได้
          </p>
        </div>
      </div>
    );

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.employee_id ?? "").toLowerCase().includes(q) ||
      (u.department ?? "").toLowerCase().includes(q)
    );
  });

  const countRole = (roles: RoleKey[]) =>
    users.filter((u) => roles.includes((u.role ?? "user") as RoleKey)).length;

  const STAT_CARDS = [
    {
      label: "ผู้ใช้ทั้งหมด",
      value: users.length,
      icon: Users,
      gradient: "from-white to-[#EAF3FC]",
      border: "border-[#0057B8]/20",
      text: "text-[#0057B8]",
      iconBg: "bg-[#EAF3FC]",
    },
    {
      label: "Moderator",
      value: countRole(["moderator", "assistant_moderator"]),
      icon: Shield,
      gradient: "from-white to-[#E5F8FB]",
      border: "border-[#00AEC7]/25",
      text: "text-[#007E91]",
      iconBg: "bg-[#E5F8FB]",
    },
    {
      label: "Operator",
      value: countRole(["operator"]),
      icon: Briefcase,
      gradient: "from-white to-[#E6F8F4]",
      border: "border-[#00B398]/25",
      text: "text-[#008C78]",
      iconBg: "bg-[#E6F8F4]",
    },
    {
      label: "User",
      value: countRole(["user"]),
      icon: Users,
      gradient: "from-white to-[#EAF3FC]",
      border: "border-[#0057B8]/20",
      text: "text-[#0057B8]",
      iconBg: "bg-[#EAF3FC]",
    },
  ];

  return (
    <div
      className="min-h-screen bg-[#F5F7F8]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)",
      }}
    >
      {/* ── Page header: light, blends with content bg ── */}
      <div className="bg-white/80 backdrop-blur-md border-b border-[#D9E1E2] px-4 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0057B8] to-[#00263A] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#0057B8]/10 border border-[#0057B8]/20">
            <Users className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[#00263A] font-black text-[18px] sm:text-[20px] md:text-[22px] leading-none tracking-wide truncate">
              จัดการผู้ใช้งาน
            </h1>
            <p className="text-slate-400 text-[11px] sm:text-[12px] font-medium hidden sm:block truncate mt-1">
              ตั้งค่าบัญชี · กำหนดสิทธิ์ · ดูแลพนักงาน
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-600 tracking-wide">
              เรียลไทม์
            </span>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 bg-[#00263A] hover:bg-[#004A9F] text-white text-[12px] font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm border border-[#00263A]/10 active:scale-95 shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">สร้างบัญชีใหม่</span>
          <span className="sm:hidden">เพิ่ม</span>
        </button>
      </div>

      <div className="p-3 sm:p-5 max-w-7xl mx-auto w-full">
        <QaApprovalPanel currentUserRole={currentUserRole} />

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {STAT_CARDS.map((s) => (
            <div
              key={s.label}
              className={`bg-gradient-to-br ${s.gradient} border ${s.border} rounded-2xl p-3.5 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-all duration-300`}
            >
              <div
                className={`w-9 h-9 ${s.iconBg} rounded-xl flex items-center justify-center shrink-0 shadow-inner`}
              >
                <s.icon className={`w-4 h-4 ${s.text}`} />
              </div>
              <div className="min-w-0">
                <div
                  className={`text-2xl font-black leading-none ${s.text} mb-0.5`}
                >
                  {s.value}
                </div>
                <div className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider truncate">
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Search bar ── */}
        <div className="relative mb-5">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, อีเมล, รหัสพนักงาน, หน่วยงาน..."
            className="w-full pl-11 pr-4 py-3 text-[13.5px] bg-white border border-[#D9E1E2] rounded-2xl text-[#00263A] placeholder:text-slate-400 focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all duration-200 shadow-sm hover:border-[#B8C4C8]"
          />
        </div>

        {/* ── User groups ── */}
        <div className="space-y-6">
          {SECTION_GROUPS.map((group) => {
            const groupUsers = filtered.filter((u) =>
              group.roles.includes((u.role ?? "user") as RoleKey),
            );
            if (groupUsers.length === 0) return null;
            const Icon = group.icon;
            return (
              <div key={group.key}>
                <div className="flex items-center gap-2 mb-3.5">
                  <Icon
                    className={`w-3.5 h-3.5 ${group.colorClass} shrink-0`}
                  />
                  <span
                    className={`text-[11px] font-bold uppercase tracking-[0.12em] ${group.colorClass}`}
                  >
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-[#D9E1E2]" />
                  <span className="text-[10px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-[#D9E1E2]">
                    {groupUsers.length} คน
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {groupUsers.map((user) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      currentUserId={currentUserId}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-white border border-[#D9E1E2] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
              <Search className="w-5 h-5 text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm">
              ไม่พบผู้ใช้ที่ตรงกับการค้นหา
            </p>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <Modal
          id="user-modal"
          title={editingUser ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งาน"}
          onClose={resetForm}
          size="md"
        >
          <div className="bg-[#F5F7F8] -mx-6 -mb-6 px-6 pb-6 rounded-b-2xl">
            <form onSubmit={handleSubmit} className="pt-4 space-y-4">
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>ชื่อพนักงาน</label>
                <input
                  type="text"
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>รหัสพนักงาน</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="เช่น 0001"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>ตำแหน่งงาน</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="เช่น Operator"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>หน่วยงาน</label>
                <div className="relative">
                  <select
                    className={`${inputCls} appearance-none pr-10 cursor-pointer`}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="">— เลือกหน่วยงาน —</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.value} value={d.value}>
                        [{d.short}] {d.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <svg
                      className="w-4 h-4 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
                {department &&
                  (() => {
                    const found = DEPARTMENTS.find(
                      (d) => d.value === department,
                    );
                    return found ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#EAF3FC] text-[#0057B8] tracking-wider">
                          {found.short}
                        </span>
                        <span className="text-[12px] text-slate-500">
                          {found.label}
                        </span>
                      </div>
                    ) : null;
                  })()}
              </div>
              <div>
                <label className={labelCls}>
                  {editingUser ? "ตั้งรหัสผ่านใหม่ (ไม่บังคับ)" : "Password"}
                </label>

                <div className="relative">
                  <input
                    type={showUserPassword ? "text" : "password"}
                    className={`${inputCls} pr-11`}
                    value={password}
                    placeholder={
                      editingUser
                        ? "ปล่อยว่างหากไม่เปลี่ยน"
                        : "อย่างน้อย 10 ตัว พร้อม A-Z, a-z, 0-9 และสัญลักษณ์"
                    }
                    onChange={(e) => setPassword(e.target.value)}
                    required={!editingUser}
                  />

                  <button
                    type="button"
                    onClick={() => setShowUserPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={
                      showUserPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                    }
                  >
                    {showUserPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>ระดับสิทธิ์ (Role)</label>
                <select
                  className={inputCls}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {currentUserRole === "moderator" && (
                    <option value="moderator">Moderator</option>
                  )}
                  <option value="assistant_moderator">
                    Assistant Moderator
                  </option>
                  <option value="operator">Operator</option>
                  <option value="user">User</option>
                </select>
              </div>

              {editingUser && currentUserRole === "moderator" && (
                <div>
                  <label className={labelCls}>ลายเซ็น</label>
                  <div className="mt-2">
                    {signaturePreview ? (
                      <div className="flex flex-col items-center gap-3 border border-[#D9E1E2] bg-white p-3 rounded-xl shadow-sm">
                        <img
                          src={signaturePreview}
                          alt="Signature Preview"
                          className="max-h-24 object-contain rounded border border-slate-100"
                        />
                        {currentUserRole === "moderator" && (
                          <button
                            type="button"
                            onClick={handleDeleteSignature}
                            className="flex items-center justify-center w-full gap-1.5 py-1.5 px-3 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-sm font-semibold transition-colors"
                          >
                            <X className="w-4 h-4" />
                            ลบลายเซ็น
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-[#D9E1E2] border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-slate-400">
                            <svg
                              className="w-6 h-6 mb-2"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                              />
                            </svg>
                            <p className="text-xs font-semibold">
                              อัปโหลดภาพลายเซ็น
                            </p>
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/jpeg, image/png, image/jpg"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setSignatureFile(file);
                                setSignaturePreview(URL.createObjectURL(file));
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="border-t border-[#D9E1E2] pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 border border-[#D9E1E2] text-slate-600 font-semibold rounded-lg text-[13px] transition-all"
                >
                  <X className="w-4 h-4" /> ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#0057B8] to-[#0057B8] hover:from-[#0057B8] hover:to-[#004A9F] text-white font-semibold rounded-lg text-[13px] shadow-lg shadow-[#0057B8]/15 transition-all active:scale-95"
                >
                  <Check className="w-4 h-4" /> บันทึก
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
