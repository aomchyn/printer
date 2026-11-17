"use client";

import { useState } from "react";
import { Edit2, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import Swal from "sweetalert2";
import { supabase } from "@/lib/supabase";
import {
  buildDepartmentValue,
  mapDepartmentError,
  validateDepartmentCode,
  validateDepartmentName,
  type Department,
} from "@/lib/departments";

type Props = {
  currentUserRole: string | null;
  departments: Department[];
  departmentsError: Error | null;
  reloadDepartments: () => Promise<void>;
};

export default function DepartmentManagement({
  currentUserRole,
  departments,
  departmentsError,
  reloadDepartments,
}: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  if (
    currentUserRole !== "moderator" &&
    currentUserRole !== "assistant_moderator"
  ) {
    return null;
  }

  const showError = (error: unknown) => {
    void Swal.fire({
      icon: "error",
      title: "ดำเนินการไม่สำเร็จ",
      text: mapDepartmentError(error),
    });
  };

  const addDepartment = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, "");
    const codeError = validateDepartmentCode(normalizedCode);
    const nameError = validateDepartmentName(name);
    if (codeError || nameError) {
      void Swal.fire({
        icon: "warning",
        title: "ข้อมูลไม่ถูกต้อง",
        text: codeError ?? nameError ?? "",
      });
      return;
    }

    setSaving(true);
    try {
      const sortOrder =
        departments.reduce(
          (max, department) => Math.max(max, department.sort_order),
          0,
        ) + 1;
      const { error } = await supabase.from("departments").insert({
        code: normalizedCode,
        name: name.trim(),
        value: buildDepartmentValue(normalizedCode, name),
        sort_order: sortOrder,
      });
      if (error) throw error;
      setCode("");
      setName("");
      await reloadDepartments();
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const saveName = async (department: Department) => {
    const nameError = validateDepartmentName(editingName);
    if (nameError) {
      showError(new Error(nameError));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("departments")
        .update({ name: editingName.trim() })
        .eq("id", department.id);
      if (error) throw error;
      setEditingId(null);
      setEditingName("");
      await reloadDepartments();
      void Swal.fire({
        icon: "success",
        title: "บันทึกชื่อแล้ว",
        text: "ชื่อใหม่มีผลกับตัวเลือกใหม่ ข้อมูลเก่ายังแสดงชื่อเดิม",
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (department: Department, isActive: boolean) => {
    if (department.is_system) return;

    if (!isActive) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("department")
        .eq("department", department.value);
      if (usersError) {
        showError(usersError);
        return;
      }

      const result = await Swal.fire({
        icon: "warning",
        title: `ซ่อนแผนก ${department.code}?`,
        text: `มีผู้ใช้ ${users?.length ?? 0} คนอยู่ในแผนกนี้ ผู้ใช้และข้อมูลเก่ายังใช้งานได้ตามปกติ`,
        showCancelButton: true,
        confirmButtonText: "ซ่อนแผนก",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#dc2626",
      });
      if (!result.isConfirmed) return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("departments")
        .update({ is_active: isActive })
        .eq("id", department.id);
      if (error) throw error;
      await reloadDepartments();
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-black text-[#0f1e3d]">
              จัดการแผนก
            </h2>
            <p className="text-[11px] text-slate-400">
              เพิ่ม แก้ไข ซ่อน และเปิดใช้งานแผนก
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void reloadDepartments()}
          disabled={saving}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 disabled:opacity-50"
          title="รีเฟรช"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <form
        onSubmit={addDepartment}
        className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_2fr_auto]"
      >
        <input
          value={code}
          onChange={(event) =>
            setCode(event.target.value.toUpperCase().replace(/\s+/g, ""))
          }
          placeholder="รหัส เช่น HR"
          className={inputClass}
          maxLength={6}
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ชื่อแผนก"
          className={inputClass}
          maxLength={60}
        />
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-[#0057B8] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          เพิ่มแผนก
        </button>
      </form>

      {departmentsError ? (
        <p className="p-4 text-sm text-rose-600">
          โหลดรายการแผนกไม่สำเร็จ: {mapDepartmentError(departmentsError)}
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {departments.map((department) => {
            const editing = editingId === department.id;
            return (
              <div
                key={department.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-[#0f1e3d]">
                      {department.code}
                    </span>
                    {department.is_system && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        ระบบ
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        department.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {department.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </div>
                  {editing ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        className={inputClass}
                        maxLength={60}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void saveName(department)}
                        disabled={saving}
                        className="rounded-lg bg-blue-600 px-3 text-xs font-bold text-white"
                      >
                        บันทึก
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-600">
                      {department.name}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={department.is_system || saving}
                    onClick={() => {
                      setEditingId(department.id);
                      setEditingName(department.name);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Edit2 className="h-3 w-3" />
                    แก้ชื่อ
                  </button>
                  <button
                    type="button"
                    disabled={department.is_system || saving}
                    onClick={() =>
                      void setActive(department, !department.is_active)
                    }
                    className={`rounded-lg px-3 py-2 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
                      department.is_active
                        ? "border border-rose-200 text-rose-600"
                        : "bg-emerald-600 text-white"
                    }`}
                  >
                    {department.is_active ? "ซ่อน" : "เปิดใช้งานอีกครั้ง"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const inputClass =
  "w-full rounded-lg border border-[#D9E1E2] bg-white px-3.5 py-2.5 text-[13px] text-[#00263A] outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10";
