"use client";

import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { supabase } from "@/lib/supabase";
import {
  formatProductDate,
  tokenizeProductDatePattern,
} from "@/lib/productPrinting";
import {
  sortPrintingDateFormats,
  usesMonthNameInPrintingDatePattern,
  type PrintingDateFormatRegistryRow,
} from "@/lib/printingDateFormatRegistry";

interface PrintingDateFormatManagerProps {
  open: boolean;
  formats: readonly PrintingDateFormatRegistryRow[];
  loading: boolean;
  loadError: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const SAMPLE_DATE = "2025-06-18";

function safePatternError(pattern: string): string | null {
  try {
    tokenizeProductDatePattern(pattern);
    return null;
  } catch {
    return "รูปแบบวันที่ไม่ถูกต้อง กรุณาใช้เฉพาะ token วันที่และตัวคั่นที่ระบบรองรับ";
  }
}

export default function PrintingDateFormatManager({
  open,
  formats,
  loading,
  loadError,
  onClose,
  onRefresh,
}: PrintingDateFormatManagerProps) {
  const [newPattern, setNewPattern] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const orderedFormats = useMemo(() => sortPrintingDateFormats(formats), [formats]);
  const patternError = safePatternError(newPattern);
  const canCreate = newPattern.trim() !== "" && newLabel.trim() !== "" && patternError === null && !saving;

  if (!open) return null;

  const refreshAfterMutation = async () => {
    await onRefresh();
    setActionError(null);
  };

  const createFormat = async () => {
    if (!canCreate) return;
    setSaving(true);
    setActionError(null);
    const { error } = await supabase.rpc("create_printing_date_format", {
      p_pattern: newPattern.trim(),
      p_display_label: newLabel.trim(),
    });
    setSaving(false);
    if (error) {
      setActionError("ไม่สามารถเพิ่มรูปแบบวันที่ได้ กรุณาตรวจสอบข้อมูลหรือสิทธิ์ของคุณ");
      return;
    }
    setNewPattern("");
    setNewLabel("");
    await refreshAfterMutation();
  };

  const updateFormat = async (format: PrintingDateFormatRegistryRow, enabled = format.enabled) => {
    const displayLabel = (labelDrafts[format.id] ?? format.display_label).trim();
    if (!displayLabel) {
      setActionError("ชื่อที่แสดงต้องไม่ว่าง");
      return;
    }
    setSaving(true);
    setActionError(null);
    const { error } = await supabase.rpc("update_printing_date_format", {
      p_id: format.id,
      p_display_label: displayLabel,
      p_enabled: enabled,
    });
    setSaving(false);
    if (error) {
      setActionError("ไม่สามารถบันทึกรูปแบบวันที่ได้ กรุณาลองใหม่");
      return;
    }
    setLabelDrafts((drafts) => {
      const next = { ...drafts };
      delete next[format.id];
      return next;
    });
    await refreshAfterMutation();
  };

  const moveFormat = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedFormats.length) return;
    const nextOrder = [...orderedFormats];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    setSaving(true);
    setActionError(null);
    const { error } = await supabase.rpc("reorder_printing_date_formats", {
      p_ordered_ids: nextOrder.map((format) => format.id),
    });
    setSaving(false);
    if (error) {
      setActionError("ไม่สามารถเรียงลำดับรูปแบบวันที่ได้ กรุณาลองใหม่");
      return;
    }
    await refreshAfterMutation();
  };

  return (
    <Modal id="printing-date-format-manager" title="จัดการรูปแบบวันที่" size="xl" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">ปิดใช้งานแล้วจะไม่ให้เลือกกับสินค้าใหม่ แต่จะไม่เปลี่ยนสินค้าและ Order เดิม ไม่มีการลบรูปแบบวันที่</p>

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
        {loadError && <p role="alert" className="rounded-lg border border-[#C8102E]/25 bg-[#FCEAEC] px-3 py-2 text-sm text-[#9B0B23]">ไม่สามารถโหลดรายการรูปแบบวันที่ได้ กรุณาลองรีเฟรช</p>}
        {loading ? <p className="text-sm text-slate-500">กำลังโหลดรูปแบบวันที่...</p> : (
          <div className="space-y-2">
            {orderedFormats.map((format, index) => {
              const displayLabel = labelDrafts[format.id] ?? format.display_label;
              const example = formatProductDate(SAMPLE_DATE, {
                pattern: format.pattern,
                calendar: "gregorian",
                monthCase: usesMonthNameInPrintingDatePattern(format.pattern) ? "title" : undefined,
              });
              return (
                <div key={format.id} className="rounded-xl border border-[#D9E1E2] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <input aria-label={`ชื่อที่แสดง ${format.pattern}`} value={displayLabel} onChange={(event) => setLabelDrafts((drafts) => ({ ...drafts, [format.id]: event.target.value }))} className="w-full rounded-md border border-[#D9E1E2] px-2 py-1 text-sm font-semibold" />
                      <p className="mt-1 font-mono text-xs text-slate-600">{format.pattern} — {example}</p>
                      <p className={`mt-1 text-xs font-semibold ${format.enabled ? "text-[#008C78]" : "text-[#9B0B23]"}`}>{format.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => updateFormat(format)} disabled={saving} className="rounded-md border border-[#0057B8]/25 px-2 py-1 text-xs font-bold text-[#0057B8] disabled:opacity-50">บันทึกชื่อ</button>
                      <button type="button" onClick={() => updateFormat(format, !format.enabled)} disabled={saving} className="rounded-md border border-[#D9E1E2] px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50">{format.enabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
                      <button type="button" onClick={() => moveFormat(index, -1)} disabled={saving || index === 0} aria-label={`เลื่อน ${format.pattern} ขึ้น`} className="rounded-md border border-[#D9E1E2] px-2 py-1 text-xs disabled:opacity-40">ขึ้น</button>
                      <button type="button" onClick={() => moveFormat(index, 1)} disabled={saving || index === orderedFormats.length - 1} aria-label={`เลื่อน ${format.pattern} ลง`} className="rounded-md border border-[#D9E1E2] px-2 py-1 text-xs disabled:opacity-40">ลง</button>
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
