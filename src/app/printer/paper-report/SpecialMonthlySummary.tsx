"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import SpecialMonthlyDetails from "./SpecialMonthlyDetails";
import { saveAs } from "file-saver";
import { supabase } from "@/lib/supabase";
import {
  currentBangkokMonth,
  parseSpecialMonthlyRows,
  specialMonthlyDate,
  specialMonthlyLabel,
  specialMonthlyTotal,
  SPECIAL_MONTHLY_JOB_LABELS,
  type SpecialMonthlyPaperRow,
} from "@/lib/specialMonthlyPaper";

async function readMonth(month: string) {
  // Each read/export is authorized by the database using the weekly-reset gate.
  const { data, error } = await supabase.rpc("get_special_job_paper_month", {
    p_month: specialMonthlyDate(month),
  });
  if (error) throw error;
  return parseSpecialMonthlyRows(data);
}

export default function SpecialMonthlySummary({
  allowed,
  revision,
}: {
  allowed: boolean;
  revision: number;
}) {
  const actionLock = useRef(false);
  const [month, setMonth] = useState(() => currentBangkokMonth());
  const [rows, setRows] = useState<SpecialMonthlyPaperRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [detailGroup, setDetailGroup] = useState<SpecialMonthlyPaperRow | null>(
    null,
  );
  const detailOpener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    readMonth(month)
      .then((data) => {
        if (active) {
          setRows(data);
          setError(false);
        }
      })
      .catch(() => {
        if (active) {
          setRows([]);
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowed, month, revision, refresh]);

  if (!allowed) return null;
  const label = specialMonthlyLabel(month);
  const reload = () => {
    setLoading(true);
    setRefresh((value) => value + 1);
  };

  async function showNoDataAlert() {
    await Swal.fire({
      icon: "info",
      title: "ไม่มีข้อมูล",
      text: `ไม่มีข้อมูลสรุปงานคุณมิ้นท์ของ ${label}`,
      confirmButtonText: "ตกลง",
    });
  }
  async function exportMonth() {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);

    try {
      const freshRows = await readMonth(month);

      if (freshRows.length === 0) {
        await showNoDataAlert();
        return;
      }

      const { buildSpecialMonthlyPaperWorkbook, specialMonthlyExcelFilename } =
        await import("@/lib/specialMonthlyPaperExcel");

      const bytes = await buildSpecialMonthlyPaperWorkbook(
        month,
        freshRows,
      ).xlsx.writeBuffer();

      saveAs(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        specialMonthlyExcelFilename(month),
      );
    } catch {
      await Swal.fire({
        icon: "error",
        title: "ส่งออกไม่สำเร็จ",
        text: "กรุณาตรวจสอบสิทธิ์และลองอีกครั้ง",
      });
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function resetMonth() {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);

    try {
      const freshRows = await readMonth(month);

      if (freshRows.length === 0) {
        await showNoDataAlert();
        return;
      }

      const result = await Swal.fire({
        icon: "warning",
        title: "ล้างข้อมูลสรุปรายเดือน?",
        text: `ข้อมูลสรุปงานคุณมิ้นท์ของ ${label} จะถูกลบ แต่ข้อมูล Paper Reports ปัจจุบันจะไม่ถูกลบ`,
        showCancelButton: true,
        confirmButtonText: "ล้างข้อมูลเดือนนี้",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#C8102E",
        focusCancel: true,
      });

      if (!result.isConfirmed) return;

      const { error: resetError } = await supabase.rpc(
        "reset_special_job_paper_month",
        {
          p_month: specialMonthlyDate(month),
        },
      );

      if (resetError) throw resetError;

      setDetailGroup(null);
      reload();

      await Swal.fire({
        icon: "success",
        title: "ล้างข้อมูลเดือนที่เลือกแล้ว",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        icon: "error",
        title: "ล้างข้อมูลไม่สำเร็จ",
        text: "กรุณาตรวจสอบสิทธิ์และลองอีกครั้ง",
      });
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="special-monthly-title"
      className="min-w-0 rounded-2xl border border-[#D9E1E2] bg-white p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="special-monthly-title" className="font-bold text-[#00263A]">
          สรุปรายเดือน — งานคุณมิ้นท์
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="special-month">เดือน</label>
          <input
            id="special-month"
            type="month"
            value={month}
            disabled={busy}
            min="1000-01"
            max="9999-12"
            onChange={(event) => {
              if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
                setLoading(true);
                setRows([]);
                setDetailGroup(null);
                setMonth(event.target.value);
              }
            }}
            className="min-w-0 max-w-full rounded-lg border border-[#D9E1E2] px-2 py-1.5"
          />
          <button
            onClick={exportMonth}
            disabled={busy || loading || error}
            className="rounded-lg bg-[#0057B8] px-3 py-2 text-white disabled:opacity-50"
          >
            ส่งออก Excel
          </button>
          <button
            onClick={resetMonth}
            disabled={busy || loading || error}
            className="rounded-lg border border-[#C8102E] px-3 py-2 text-[#C8102E] disabled:opacity-50"
          >
            ล้างข้อมูลเดือนนี้
          </button>
        </div>
      </div>
      <p className="text-sm text-[#5F6B70]">{label}</p>
      {loading ? (
        <p role="status" className="text-sm">
          กำลังโหลดสรุปรายเดือน...
        </p>
      ) : error ? (
        <div role="alert" className="text-sm text-[#C8102E]">
          โหลดสรุปรายเดือนไม่สำเร็จ{" "}
          <button onClick={reload} className="underline">
            ลองอีกครั้ง
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-[#EAF3FC] p-4">
            <p className="text-sm text-[#5F6B70]">ใช้กระดาษทั้งหมด</p>
            <p className="mt-1 text-2xl font-bold text-[#00263A]">
              {specialMonthlyTotal(rows).toLocaleString("th-TH")}{" "}
              <span className="text-base">A3</span>
            </p>
          </div>
          {rows.length === 0 ? (
            <p className="py-3 text-center text-sm text-[#8A9498]">
              ไม่มีข้อมูลในเดือนที่เลือก
            </p>
          ) : (
            <table className="w-full table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-[#D9E1E2] text-[#5F6B70]">
                  <th scope="col" className="w-[25%] py-2 pr-2">
                    ประเภทงาน
                  </th>
                  <th scope="col" className="w-[33%] py-2 pr-2">
                    กระดาษที่ใช้
                  </th>
                  <th scope="col" className="w-[20%] py-2 text-right">
                    A3 ใช้ทั้งหมด
                  </th>
                  <th scope="col" className="w-[22%] py-2 text-right">
                    รายการ
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={JSON.stringify([row.job_type, row.paper_type])}
                    className="border-b border-[#EEF1F2] align-top"
                  >
                    <td className="break-words py-3 pr-2">
                      {SPECIAL_MONTHLY_JOB_LABELS[row.job_type]}
                    </td>
                    <td className="break-words py-3 pr-2 [overflow-wrap:anywhere]">
                      {row.paper_type}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {row.paper_used_a3.toLocaleString("th-TH")}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        aria-expanded={
                          detailGroup?.job_type === row.job_type &&
                          detailGroup?.paper_type === row.paper_type
                        }
                        aria-controls="special-monthly-details"
                        aria-label={`ดูรายการ ${SPECIAL_MONTHLY_JOB_LABELS[row.job_type]} ${row.paper_type}`}
                        onClick={(event) => {
                          detailOpener.current = event.currentTarget;
                          setDetailGroup(row);
                        }}
                        className="rounded-lg px-1 py-2 text-[#0057B8] underline underline-offset-2 disabled:opacity-50"
                      >
                        ดูรายการ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {detailGroup && (
        <SpecialMonthlyDetails
          key={JSON.stringify([
            month,
            detailGroup.job_type,
            detailGroup.paper_type,
          ])}
          month={month}
          group={detailGroup}
          revision={revision + refresh}
          onChanged={reload}
          onClose={() => {
            setDetailGroup(null);
            detailOpener.current?.focus();
          }}
        />
      )}
    </section>
  );
}
