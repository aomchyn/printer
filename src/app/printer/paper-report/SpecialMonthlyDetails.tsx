"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { supabase } from "@/lib/supabase";
import {
  parseSpecialMonthlyDetails, specialMonthlyDate, specialMonthlyReportDate,
  SPECIAL_MONTHLY_JOB_LABELS, type SpecialMonthlyPaperDetail, type SpecialMonthlyPaperRow,
} from "@/lib/specialMonthlyPaper";

async function readDetails(month: string, group: SpecialMonthlyPaperRow) {
  const rows: SpecialMonthlyPaperDetail[] = [];
  let afterId = "0";
  for (;;) {
    const { data, error } = await supabase.rpc("get_special_job_paper_details", {
      p_month: specialMonthlyDate(month), p_job_type: group.job_type,
      p_paper_type: group.paper_type, p_after_id: afterId,
    });
    if (error) throw error;
    const page = parseSpecialMonthlyDetails(data);
    rows.push(...page);
    if (page.length < 200) return rows;
    const nextId = page[page.length - 1].snapshot_id;
    if (BigInt(nextId) <= BigInt(afterId)) throw new Error("Invalid detail pagination");
    afterId = nextId;
  }
}

export default function SpecialMonthlyDetails({ month, group, revision, onChanged, onClose }: {
  month: string; group: SpecialMonthlyPaperRow; revision: number;
  onChanged: () => void; onClose: () => void;
}) {
  const [rows, setRows] = useState<SpecialMonthlyPaperDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const actionLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    readDetails(month, group).then((data) => {
      if (active) { setRows(data); setError(false); }
    }).catch(() => {
      if (active) { setRows([]); setError(true); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, group, revision, retry]);

  async function deleteSnapshot(row: SpecialMonthlyPaperDetail) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true);
    try {
      const result = await Swal.fire({
        icon: "warning", title: "ลบรายการจากสรุปรายเดือน?",
        // Use text, never interpolated HTML, for snapshotted Product/paper names.
        text: `รายการนี้จะถูกนำออกจากสรุปงานคุณมิ้นท์เท่านั้น ข้อมูล Paper Report และ Order ต้นทางจะไม่ถูกลบ\n\nสินค้า: ${row.product_name_snapshot || "ไม่ระบุชื่อสินค้า"}\nกระดาษ: ${row.paper_type}\nA3: ${row.paper_used_a3.toLocaleString("th-TH")}`,
        showCancelButton: true, confirmButtonText: "ลบรายการ", cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#C8102E", focusCancel: true,
      });
      if (!result.isConfirmed) return;
      const { error: deleteError } = await supabase.rpc("delete_special_job_paper_snapshot", {
        p_snapshot_id: row.snapshot_id, p_month: specialMonthlyDate(month),
      });
      if (deleteError) throw deleteError;
      setLoading(true);
      onChanged();
    } catch {
      await Swal.fire({ icon: "error", title: "ลบรายการไม่สำเร็จ", text: "กรุณาตรวจสอบสิทธิ์และลองอีกครั้ง" });
    } finally { actionLock.current = false; setBusy(false); }
  }

  const deleteButton = (row: SpecialMonthlyPaperDetail) => (
    <button type="button" onClick={() => deleteSnapshot(row)} disabled={busy || loading}
      aria-label={`ลบรายการ ${row.product_name_snapshot || "ไม่ระบุชื่อสินค้า"} ${specialMonthlyReportDate(row.report_date)} ${row.paper_used_a3} A3`}
      className="rounded-lg border border-[#C8102E]/30 px-3 py-2 text-sm text-[#C8102E] disabled:opacity-50">ลบ</button>
  );

  return (
    <section id="special-monthly-details" aria-labelledby="special-monthly-details-title" aria-busy={loading}
      className="min-w-0 rounded-xl border border-[#D9E1E2] bg-[#FAFCFD] p-3 sm:p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="special-monthly-details-title" tabIndex={-1} ref={heading} className="font-bold text-[#00263A] outline-offset-4">รายการในสรุปรายเดือน</h3>
          <p className="mt-1 break-words text-sm text-[#5F6B70]">{SPECIAL_MONTHLY_JOB_LABELS[group.job_type]} · {group.paper_type}</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} className="shrink-0 rounded-lg border border-[#D9E1E2] px-3 py-2 text-sm disabled:opacity-50">ปิดรายการ</button>
      </div>
      {loading ? <p role="status" className="text-sm">กำลังโหลดรายการ...</p> : error ? (
        <p role="alert" className="text-sm text-[#C8102E]">โหลดรายการไม่สำเร็จ <button type="button" className="underline" onClick={() => { setLoading(true); setRetry((n) => n + 1); }}>ลองอีกครั้ง</button></p>
      ) : rows.length === 0 ? <p className="py-3 text-sm text-[#5F6B70]">ไม่มีรายการในกลุ่มนี้</p> : (
        <>
          <table className="hidden w-full table-fixed text-left text-sm md:table">
            <thead><tr className="border-b border-[#D9E1E2] text-[#5F6B70]">
              <th scope="col" className="w-[12%] py-2">วันที่</th><th scope="col" className="w-[28%] py-2">สินค้า</th>
              <th scope="col" className="w-[22%] py-2">กระดาษ</th><th scope="col" className="w-[10%] py-2 text-right">A3 ใช้</th>
              <th scope="col" className="w-[17%] py-2 pl-3">การจัดประเภท</th><th scope="col" className="w-[11%] py-2 text-right">การจัดการ</th>
            </tr></thead>
            <tbody>{rows.map((row) => <tr key={row.snapshot_id} className="border-b border-[#E5EBEE] align-top">
              <td className="py-3 pr-2"><time dateTime={row.report_date}>{specialMonthlyReportDate(row.report_date)}</time></td>
              <td className="break-words py-3 pr-3 [overflow-wrap:anywhere]">{row.product_name_snapshot || "ไม่ระบุชื่อสินค้า"}</td>
              <td className="break-words py-3 pr-3 [overflow-wrap:anywhere]">{row.paper_type}</td>
              <td className="py-3 text-right tabular-nums">{row.paper_used_a3.toLocaleString("th-TH")}</td>
              <td className="break-words py-3 pl-3">{SPECIAL_MONTHLY_JOB_LABELS[row.job_type]}</td>
              <td className="py-2 text-right">{deleteButton(row)}</td>
            </tr>)}</tbody>
          </table>
          <ul className="space-y-3 md:hidden">{rows.map((row) => <li key={row.snapshot_id} className="min-w-0 rounded-lg border border-[#D9E1E2] bg-white p-3">
            <p className="break-words font-semibold text-[#00263A] [overflow-wrap:anywhere]">{row.product_name_snapshot || "ไม่ระบุชื่อสินค้า"}</p>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-[#5F6B70]">วันที่</dt><dd><time dateTime={row.report_date}>{specialMonthlyReportDate(row.report_date)}</time></dd>
              <dt className="text-[#5F6B70]">กระดาษ</dt><dd className="break-words [overflow-wrap:anywhere]">{row.paper_type}</dd>
              <dt className="text-[#5F6B70]">A3 ใช้</dt><dd className="font-bold tabular-nums">{row.paper_used_a3.toLocaleString("th-TH")}</dd>
              <dt className="text-[#5F6B70]">การจัดประเภท</dt><dd>{SPECIAL_MONTHLY_JOB_LABELS[row.job_type]}</dd>
            </dl>
            <div className="mt-3 flex justify-end">{deleteButton(row)}</div>
          </li>)}</ul>
        </>
      )}
      <p className="text-xs text-[#5F6B70]">ลบเฉพาะรายการในสรุปรายเดือน ข้อมูลต้นทางจะยังคงอยู่</p>
    </section>
  );
}
