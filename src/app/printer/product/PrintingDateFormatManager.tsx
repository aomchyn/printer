"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import Modal from "../components/Modal";
import { supabase } from "@/lib/supabase";
import { formatProductDate, tokenizeProductDatePattern } from "@/lib/productPrinting";
import {
  isPrintingDateFormatDeletable,
  sortPrintingDateFormats,
  usesMonthNameInPrintingDatePattern,
  type PrintingDateFormatManagementRow,
} from "@/lib/printingDateFormatRegistry";

interface PrintingDateFormatManagerProps {
  open: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const SAMPLE_DATE = "2025-06-18";
const ManagerSwal = Swal.mixin({
  confirmButtonColor: "#0057B8",
  cancelButtonColor: "#75787B",
  confirmButtonText: "ยืนยัน",
  cancelButtonText: "ยกเลิก",
});

function safePatternError(pattern: string): string | null {
  try {
    tokenizeProductDatePattern(pattern);
    return null;
  } catch {
    return "รูปแบบวันที่ไม่ถูกต้อง กรุณาใช้เฉพาะ token วันที่และตัวคั่นที่ระบบรองรับ";
  }
}

function safeMutationError(error: { message?: string | null } | null, fallback: string): string {
  const message = error?.message ?? "";
  if (message.includes("still used by")) return "ไม่สามารถลบรูปแบบนี้ได้ เนื่องจากยังมี Product ใช้งานอยู่ กรุณาปิดใช้งานแทน";
  if (message.includes("Manager permission")) return "คุณไม่มีสิทธิ์จัดการรูปแบบวันที่";
  if (message.includes("was not found")) return "ไม่พบรูปแบบวันที่นี้แล้ว กรุณารีเฟรชรายการ";
  return fallback;
}

function usageLabel(productUsageCount: number): string {
  return productUsageCount > 0 ? `ใช้งานโดย Product ${productUsageCount} รายการ` : "ไม่มี Product ใช้งาน";
}

export default function PrintingDateFormatManager({ open, onClose, onRefresh }: PrintingDateFormatManagerProps) {
  const [newPattern, setNewPattern] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [formats, setFormats] = useState<PrintingDateFormatManagementRow[]>([]);
  const [registryStatus, setRegistryStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const orderedFormats = useMemo(() => sortPrintingDateFormats(formats), [formats]);
  const patternError = safePatternError(newPattern);
  const canCreate = newPattern.trim() !== "" && newLabel.trim() !== "" && patternError === null && !saving;

  const fetchManagedFormats = useCallback(async () => {
    setRegistryStatus("loading");
    const { data, error } = await supabase.rpc("get_printing_date_format_management_rows");
    if (error || !data) {
      setFormats([]);
      setRegistryStatus("error");
      return;
    }
    setFormats(sortPrintingDateFormats(data as PrintingDateFormatManagementRow[]));
    setRegistryStatus("loaded");
  }, []);

  useEffect(() => {
    if (open) void fetchManagedFormats();
  }, [open, fetchManagedFormats]);

  const refreshAfterMutation = async () => {
    await Promise.all([onRefresh(), fetchManagedFormats()]);
    setActionError(null);
  };

  const createFormat = async () => {
    if (!canCreate) return;
    const preview = formatProductDate(SAMPLE_DATE, { pattern: newPattern.trim(), calendar: "gregorian", monthCase: "title" });
    const confirmation = await ManagerSwal.fire({
      icon: "question",
      title: "เพิ่มรูปแบบวันที่?",
      text: `ชื่อที่แสดง: ${newLabel.trim()}\nPattern: ${newPattern.trim()}\nตัวอย่าง: ${preview}`,
      showCancelButton: true,
      confirmButtonText: "เพิ่มรูปแบบ",
    });
    if (!confirmation.isConfirmed) return;

    setSaving(true);
    setActionError(null);
    const { error } = await supabase.rpc("create_printing_date_format", {
      p_pattern: newPattern.trim(),
      p_display_label: newLabel.trim(),
    });
    setSaving(false);
    if (error) {
      setActionError(safeMutationError(error, "ไม่สามารถเพิ่มรูปแบบวันที่ได้ กรุณาตรวจสอบข้อมูลหรือสิทธิ์ของคุณ"));
      return;
    }
    setNewPattern("");
    setNewLabel("");
    await refreshAfterMutation();
    await ManagerSwal.fire({ icon: "success", title: "เพิ่มรูปแบบวันที่แล้ว", timer: 1400, showConfirmButton: false });
  };

  const saveDisplayLabel = async (format: PrintingDateFormatManagementRow) => {
    const displayLabel = (labelDrafts[format.id] ?? format.display_label).trim();
    if (!displayLabel) {
      setActionError("ชื่อที่แสดงต้องไม่ว่าง");
      return;
    }
    if (displayLabel === format.display_label) return;

    const confirmation = await ManagerSwal.fire({
      icon: "question",
      title: "แก้ไขชื่อที่แสดง?",
      text: `ชื่อเดิม: ${format.display_label}\nชื่อใหม่: ${displayLabel}\nPattern: ${format.pattern}\nPattern จะไม่เปลี่ยน`,
      showCancelButton: true,
      confirmButtonText: "บันทึก",
    });
    if (!confirmation.isConfirmed) return;

    setSaving(true);
    setActionError(null);
    const { error } = await supabase.rpc("update_printing_date_format", {
      p_id: format.id,
      p_display_label: displayLabel,
      p_enabled: format.enabled,
    });
    setSaving(false);
    if (error) {
      setActionError(safeMutationError(error, "ไม่สามารถบันทึกชื่อรูปแบบวันที่ได้ กรุณาลองใหม่"));
      return;
    }
    setLabelDrafts((drafts) => {
      const next = { ...drafts };
      delete next[format.id];
      return next;
    });
    await refreshAfterMutation();
    await ManagerSwal.fire({ icon: "success", title: "บันทึกชื่อที่แสดงแล้ว", timer: 1400, showConfirmButton: false });
  };

  const setFormatEnabled = async (format: PrintingDateFormatManagementRow, enabled: boolean) => {
    if (format.enabled === enabled) return;
    if (!enabled) {
      const confirmation = await ManagerSwal.fire({
        icon: "warning",
        title: `ปิดใช้งาน ${format.pattern}?`,
        text: "จะไม่สามารถเลือกกับสินค้าใหม่ได้\nProduct ที่ใช้อยู่จะยังเก็บรูปแบบเดิม\nOrder เก่าจะไม่เปลี่ยน\nสามารถเปิดใช้งานกลับได้",
        showCancelButton: true,
        confirmButtonText: "ปิดใช้งาน",
        confirmButtonColor: "#C8102E",
      });
      if (!confirmation.isConfirmed) return;
    }

    setSaving(true);
    setActionError(null);
    const { error } = await supabase.rpc("update_printing_date_format", {
      p_id: format.id,
      p_display_label: format.display_label,
      p_enabled: enabled,
    });
    setSaving(false);
    if (error) {
      setActionError(safeMutationError(error, "ไม่สามารถเปลี่ยนสถานะรูปแบบวันที่ได้ กรุณาลองใหม่"));
      return;
    }
    await refreshAfterMutation();
    await ManagerSwal.fire({ icon: "success", title: enabled ? "เปิดใช้งานรูปแบบวันที่แล้ว" : "ปิดใช้งานรูปแบบวันที่แล้ว", timer: 1400, showConfirmButton: false });
  };

  const deleteFormat = async (format: PrintingDateFormatManagementRow) => {
    if (!isPrintingDateFormatDeletable(format)) return;
    const example = formatProductDate(SAMPLE_DATE, {
      pattern: format.pattern,
      calendar: "gregorian",
      monthCase: usesMonthNameInPrintingDatePattern(format.pattern) ? "title" : undefined,
    });
    const confirmation = await ManagerSwal.fire({
      icon: "warning",
      title: "ลบรูปแบบวันที่ถาวร?",
      text: `ชื่อที่แสดง: ${format.display_label}\nPattern: ${format.pattern}\nตัวอย่าง: ${example}\nไม่มี Product ปัจจุบันใช้งาน\nOrder เก่าจะไม่เปลี่ยน\nการลบไม่สามารถเปิดกลับได้ หากต้องการใช้อีกต้องสร้างรูปแบบใหม่`,
      input: "text",
      inputPlaceholder: "พิมพ์ ลบ เพื่อยืนยัน",
      showCancelButton: true,
      confirmButtonText: "ลบถาวร",
      confirmButtonColor: "#C8102E",
      inputValidator: (value) => value.trim() === "ลบ" ? undefined : "กรุณาพิมพ์ ลบ เพื่อยืนยัน",
      didOpen: () => {
        const input = ManagerSwal.getInput();
        const confirmButton = ManagerSwal.getConfirmButton();
        const updateConfirmState = () => {
          if (confirmButton) confirmButton.disabled = input?.value.trim() !== "ลบ";
        };
        input?.addEventListener("input", updateConfirmState);
        updateConfirmState();
      },
    });
    if (!confirmation.isConfirmed) return;

    setSaving(true);
    setActionError(null);
    const { error } = await supabase.rpc("delete_printing_date_format", { p_id: format.id });
    setSaving(false);
    if (error) {
      setActionError(safeMutationError(error, "ไม่สามารถลบรูปแบบวันที่ได้ กรุณารีเฟรชและลองใหม่"));
      return;
    }
    setLabelDrafts((drafts) => {
      const next = { ...drafts };
      delete next[format.id];
      return next;
    });
    await refreshAfterMutation();
    await ManagerSwal.fire({ icon: "success", title: "ลบรูปแบบวันที่แล้ว", timer: 1400, showConfirmButton: false });
  };

  const moveFormat = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedFormats.length) return;
    const nextOrder = [...orderedFormats];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    setSaving(true);
    setActionError(null);
    const { error } = await supabase.rpc("reorder_printing_date_formats", { p_ordered_ids: nextOrder.map((format) => format.id) });
    setSaving(false);
    if (error) {
      setActionError(safeMutationError(error, "ไม่สามารถเรียงลำดับรูปแบบวันที่ได้ กรุณาลองใหม่"));
      return;
    }
    await refreshAfterMutation();
  };

  if (!open) return null;

  return (
    <Modal id="printing-date-format-manager" title="จัดการรูปแบบวันที่" size="xl" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">ปิดใช้งานเป็นวิธีเลิกใช้ตามปกติ: จะไม่ให้เลือกกับสินค้าใหม่ แต่จะไม่เปลี่ยน Product และ Order เดิม ลบถาวรได้เฉพาะรูปแบบที่ไม่มี Product ใช้งาน</p>

        <section className="rounded-xl border border-[#D9E1E2] bg-[#F5F7F8] p-3 space-y-3">
          <h4 className="text-sm font-black text-[#00263A]">เพิ่มรูปแบบวันที่</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Pattern
              <input value={newPattern} onChange={(event) => setNewPattern(event.target.value)} placeholder="เช่น YY-MM-DD" className="mt-1 w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 font-mono text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">ชื่อที่แสดง
              <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="เช่น ปี-เดือน-วัน (2 หลัก)" className="mt-1 w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-sm" />
            </label>
          </div>
          {newPattern.trim() && patternError && <p className="text-xs text-[#C8102E]" role="alert">{patternError}</p>}
          {newPattern.trim() && !patternError && <p className="text-xs text-[#008C78]" aria-live="polite">ตัวอย่าง: <span className="font-mono">{formatProductDate(SAMPLE_DATE, { pattern: newPattern, calendar: "gregorian", monthCase: "title" })}</span></p>}
          <button type="button" onClick={createFormat} disabled={!canCreate} className="rounded-lg bg-[#0057B8] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "กำลังบันทึก..." : "เพิ่มรูปแบบ"}</button>
        </section>

        {actionError && <p role="alert" className="rounded-lg border border-[#C8102E]/25 bg-[#FCEAEC] px-3 py-2 text-sm text-[#9B0B23]">{actionError}</p>}
        {registryStatus === "error" ? (
          <div role="alert" className="rounded-lg border border-[#C8102E]/25 bg-[#FCEAEC] px-3 py-2 text-sm text-[#9B0B23]">
            <p>ไม่สามารถโหลดรายการรูปแบบวันที่ได้ กรุณาลองใหม่</p>
            <button type="button" onClick={() => void fetchManagedFormats()} className="mt-2 rounded-md border border-[#C8102E]/30 bg-white px-2 py-1 text-xs font-bold text-[#9B0B23]">ลองใหม่</button>
          </div>
        ) : registryStatus === "loading" || registryStatus === "idle" ? <p className="text-sm text-slate-500">กำลังโหลดรูปแบบวันที่...</p> : (
          <div className="space-y-2">
            {orderedFormats.map((format, index) => {
              const displayLabel = labelDrafts[format.id] ?? format.display_label;
              const example = formatProductDate(SAMPLE_DATE, {
                pattern: format.pattern,
                calendar: "gregorian",
                monthCase: usesMonthNameInPrintingDatePattern(format.pattern) ? "title" : undefined,
              });
              const deletable = isPrintingDateFormatDeletable(format);
              return (
                <div key={format.id} className="rounded-xl border border-[#D9E1E2] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <input aria-label={`ชื่อที่แสดง ${format.pattern}`} value={displayLabel} onChange={(event) => setLabelDrafts((drafts) => ({ ...drafts, [format.id]: event.target.value }))} className="w-full rounded-md border border-[#D9E1E2] px-2 py-1 text-sm font-semibold" />
                      <p className="mt-1 break-words font-mono text-xs text-slate-600">{format.pattern} — {example}</p>
                      <p className={`mt-1 text-xs font-semibold ${format.enabled ? "text-[#008C78]" : "text-[#9B0B23]"}`}>{format.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</p>
                      <p className={`mt-1 text-xs ${deletable ? "text-slate-600" : "text-[#9B0B23]"}`}>{usageLabel(format.product_usage_count)}{!deletable && !format.enabled ? " — Product เดิมยังใช้รูปแบบที่เลิกใช้แล้ว" : ""}</p>
                      {!deletable && <p className="mt-1 text-xs text-slate-500">ไม่สามารถลบได้ กรุณาปิดใช้งานแทน</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => saveDisplayLabel(format)} disabled={saving} className="rounded-md border border-[#0057B8]/25 px-2 py-1 text-xs font-bold text-[#0057B8] disabled:opacity-50">บันทึกชื่อ</button>
                      <button type="button" onClick={() => setFormatEnabled(format, !format.enabled)} disabled={saving} className="rounded-md border border-[#D9E1E2] px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50">{format.enabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
                      <button type="button" onClick={() => moveFormat(index, -1)} disabled={saving || index === 0} aria-label={`เลื่อน ${format.pattern} ขึ้น`} className="rounded-md border border-[#D9E1E2] px-2 py-1 text-xs disabled:opacity-40">ขึ้น</button>
                      <button type="button" onClick={() => moveFormat(index, 1)} disabled={saving || index === orderedFormats.length - 1} aria-label={`เลื่อน ${format.pattern} ลง`} className="rounded-md border border-[#D9E1E2] px-2 py-1 text-xs disabled:opacity-40">ลง</button>
                      <button type="button" onClick={() => deleteFormat(format)} disabled={saving || !deletable} title={deletable ? "ลบรูปแบบวันที่ถาวร" : "ยังมี Product ใช้งานรูปแบบนี้"} className="rounded-md border border-[#C8102E]/30 px-2 py-1 text-xs font-bold text-[#9B0B23] disabled:cursor-not-allowed disabled:opacity-40">ลบถาวร</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
