"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { supabase } from "@/lib/supabase";
import { Package, Plus, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { StockSkeleton } from "./skeleton-loading-stock";
import { PAPER_TYPES } from "../constants/paperTypes";

export interface PaperTransactionInterface {
  id: string;
  date: string;
  transaction_type: "IN" | "OUT";
  paper_type: string;
  qty: number;
  description: string | null;
  reference_id: number | null;
  created_by: string | null;
  created_at: string;
}

export default function StockPage() {
  const router = useRouter();
  const [accessStatus, setAccessStatus] = useState<
    "checking" | "allowed" | "denied"
  >("checking");
  const [transactions, setTransactions] = useState<PaperTransactionInterface[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("Unknown User");
  const [activeTab, setActiveTab] = useState<"HISTORY" | "DAILY_SUMMARY">(
    "HISTORY",
  );

  const [paperType, setPaperType] = useState(PAPER_TYPES[0]);
  const [qty, setQty] = useState("");
  const [description, setDescription] = useState("");

  // ─── Guard: เฉพาะ moderator/assistant_moderator ──────────────────────────
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.push("/login");
          return;
        }
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .single();
        if (
          data?.role === "moderator" ||
          data?.role === "assistant_moderator"
        ) {
          setAccessStatus("allowed");
          fetchUserInfo();
          fetchTransactions();
        } else {
          setAccessStatus("denied");
        }
      } catch {
        router.push("/login");
      }
    };
    checkAccess();
  }, []);

  const fetchUserInfo = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data } = await supabase
        .from("users")
        .select("name")
        .eq("id", session.user.id)
        .single();
      if (data?.name) setUsername(data.name);
    }
  };

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("paper_transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setTransactions(data || []);
    } catch {
      Swal.fire({
        icon: "error",
        title: "ผิดพลาด",
        text: "ไม่สามารถดึงข้อมูลสต็อคกระดาษได้",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handled by checkAccess now

  const balances = PAPER_TYPES.map((type) => {
    const typeTxs = transactions.filter((t) => t.paper_type === type);
    const tIn = typeTxs
      .filter((t) => t.transaction_type === "IN")
      .reduce((acc, t) => acc + t.qty, 0);
    const tOut = typeTxs
      .filter((t) => t.transaction_type === "OUT")
      .reduce((acc, t) => acc + t.qty, 0);
    return { type, balance: tIn - tOut };
  });

  const dailySummaries = useMemo(() => {
    // Sort explicitly: oldest date first, then oldest created_at first
    const sortedTxs = [...transactions].sort((a, b) => {
      if (a.date !== b.date) {
        return (a.date || "").localeCompare(b.date || "");
      }
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return (timeA || 0) - (timeB || 0);
    });

    const runningBalance: Record<string, number> = {};
    const summariesMap: Record<
      string,
      Record<string, { start: number; in: number; out: number; end: number }>
    > = {};

    sortedTxs.forEach((tx) => {
      const dateKey =
        tx.date ||
        new Date(tx.created_at).toLocaleDateString("en-CA", {
          timeZone: "Asia/Bangkok",
        });
      const pt = tx.paper_type;

      if (!summariesMap[dateKey]) summariesMap[dateKey] = {};
      if (!summariesMap[dateKey][pt]) {
        summariesMap[dateKey][pt] = {
          start: runningBalance[pt] || 0,
          in: 0,
          out: 0,
          end: runningBalance[pt] || 0,
        };
      }

      if (tx.transaction_type === "IN") {
        summariesMap[dateKey][pt].in += tx.qty;
        summariesMap[dateKey][pt].end += tx.qty;
        runningBalance[pt] = (runningBalance[pt] || 0) + tx.qty;
      } else {
        summariesMap[dateKey][pt].out += tx.qty;
        summariesMap[dateKey][pt].end -= tx.qty;
        runningBalance[pt] = (runningBalance[pt] || 0) - tx.qty;
      }
    });

    return Object.entries(summariesMap)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA)) // Descending
      .map(([date, pts]) => {
        let displayDate = date;
        try {
          const dateObj = new Date(date);
          if (!isNaN(dateObj.getTime())) {
            displayDate = dateObj.toLocaleDateString("th-TH", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
          }
        } catch (e) {}

        return {
          dateKey: date,
          displayDate,
          paperTypes: Object.entries(pts).map(([pt, data]) => ({
            pt,
            ...data,
          })),
        };
      });
  }, [transactions]);

  if (
    accessStatus === "checking" ||
    (accessStatus === "allowed" && isLoading && transactions.length === 0)
  ) {
    return <StockSkeleton />;
  }
  if (accessStatus === "denied") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            เฉพาะ Moderator และ Assistant Moderator
            เท่านั้นที่สามารถเข้าถึงการจัดการสต็อคกระดาษได้
          </p>
          <button
            onClick={() => router.push("/printer/dashboard")}
            className="w-full bg-gray-900 text-white rounded-lg py-2.5 font-medium hover:bg-gray-800 transition-colors"
          >
            กลับไปหน้าแรก
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQty = parseInt(qty);
    if (!cleanQty || cleanQty <= 0) {
      Swal.fire({
        icon: "warning",
        title: "ข้อมูลไม่ถูกต้อง",
        text: "กรุณาระบุจำนวนกระดาษที่รับเข้าให้ถูกต้อง",
      });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("paper_transactions").insert({
        transaction_type: "IN",
        paper_type: paperType,
        qty: cleanQty,
        description: description || "รับเข้ากระดาษใหม่",
      });
      if (error) throw error;
      Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        timer: 1200,
        showConfirmButton: false,
      });
      setQty("");
      setDescription("");
      fetchTransactions();
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "ผิดพลาด",
        text: (error as Error).message || "ไม่สามารถบันทึกข้อมูลได้",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tx: PaperTransactionInterface) => {
    if (tx.reference_id !== null) {
      await Swal.fire({
        icon: "warning",
        title: "ไม่สามารถลบจากหน้านี้ได้",
        text: "รายการนี้เชื่อมกับ Order หรือ Paper Report กรุณายกเลิกหรือแก้ไขจากรายการต้นทาง",
      });
      return;
    }
    const typeLabel = tx.transaction_type === "IN" ? "รับเข้า" : "เบิกใช้";
    const impactLabel =
      tx.transaction_type === "IN" ? "ยอดสต็อคจะลดลง" : "ยอดสต็อคจะเพิ่มขึ้น";
    const result = await Swal.fire({
      title: "ยืนยันการลบ",
      html: `รายการ "${typeLabel} ${tx.paper_type} ${tx.qty} ใบ"<br/><span style="color:#94a3b8;font-size:12px;">${impactLabel} ${tx.qty} ใบ</span>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
    });
    if (!result.isConfirmed) return;
    try {
      const { error } = await supabase
        .from("paper_transactions")
        .delete()
        .eq("id", tx.id);
      if (error) throw error;
      Swal.fire({
        icon: "success",
        title: "ลบสำเร็จ",
        timer: 1200,
        showConfirmButton: false,
      });
      fetchTransactions();
    } catch {
      Swal.fire({
        icon: "error",
        title: "ผิดพลาด",
        text: "ไม่สามารถลบรายการได้",
      });
    }
  };

  const inputCls = `w-full px-3.5 py-2.5 text-[13px] bg-white border border-[#d0daf0] rounded-lg text-[#0f1e3d] placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400 transition-all`;

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)",
      }}
    >
      {/* ── Page header ── */}
      <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[#0f1e3d] font-bold text-[16px] md:text-[18px] leading-tight tracking-wide truncate">
              จัดการสต็อคกระดาษ A3
            </h1>
            <p className="text-slate-400 text-[12px] md:text-[13px] hidden sm:block truncate">
              รับเข้า · ตรวจเช็คประวัติการเบิกจ่าย
            </p>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left column: form + balances ── */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          <div className="bg-white border border-[#dde8f5] rounded-2xl p-5 shadow-sm">
            <h2 className="text-[13px] font-black text-[#0f1e3d] mb-4">
              รับเข้ากระดาษ (Stock In)
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block mb-1.5 text-[11.5px] font-semibold text-slate-500 uppercase tracking-wider">
                  ประเภทกระดาษ
                </label>
                <select
                  className={`${inputCls} cursor-pointer`}
                  value={paperType}
                  onChange={(e) => setPaperType(e.target.value)}
                >
                  {PAPER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1.5 text-[11.5px] font-semibold text-slate-500 uppercase tracking-wider">
                  จำนวน (แผ่น)
                </label>
                <input
                  type="number"
                  min="1"
                  className={inputCls}
                  placeholder="เช่น 500"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-[13px] shadow-md shadow-blue-500/20 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />{" "}
                {saving ? "กำลังบันทึก..." : "บันทึกรับเข้าสต็อค"}
              </button>
            </form>
          </div>

          <div className="bg-gradient-to-br from-[#0f1e3d] to-[#152a54] border border-[#0f1e3d] rounded-2xl p-5 shadow-sm">
            <h3 className="text-[11px] font-black text-blue-200 uppercase tracking-widest mb-3">
              สต็อคกระดาษคงเหลือ
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {balances.map((b) => (
                <div
                  key={b.type}
                  className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center"
                >
                  <span className="block text-[10px] text-blue-200/70 mb-1 truncate">
                    {b.type}
                  </span>
                  <span
                    className={`block text-lg font-bold ${b.balance < 2000 ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {b.balance.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column: history & daily summary ── */}
        <div className="lg:col-span-2 bg-white border border-[#dde8f5] rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <h2 className="text-[13px] font-black text-[#0f1e3d]">
              ประวัติการทำรายการ
            </h2>
            <div className="flex bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
              <button
                onClick={() => setActiveTab("HISTORY")}
                className={`px-3 py-1.5 text-[11.5px] font-bold rounded-md transition-all ${activeTab === "HISTORY" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                ประวัติทั้งหมด
              </button>
              <button
                onClick={() => setActiveTab("DAILY_SUMMARY")}
                className={`px-3 py-1.5 text-[11.5px] font-bold rounded-md transition-all ${activeTab === "DAILY_SUMMARY" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                สรุปรายวัน
              </button>
            </div>
          </div>
          <div
            className="flex-1 space-y-2 overflow-y-auto pr-1"
            style={{ maxHeight: "640px" }}
          >
            {activeTab === "HISTORY" ? (
              isLoading ? (
                <div className="text-center py-8 text-slate-400 text-[13px]">
                  กำลังโหลด...
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-[13px]">
                  ยังไม่มีประวัติการทำรายการ
                </div>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className={`group flex items-center justify-between gap-3 bg-white border border-[#dde8f5] border-l-2 ${tx.transaction_type === "IN" ? "border-l-emerald-400" : "border-l-rose-400"} rounded-xl px-3.5 py-3 hover:shadow-md transition-all`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.transaction_type === "IN" ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"}`}
                      >
                        {tx.transaction_type === "IN" ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-bold text-[#0f1e3d] truncate">
                          {tx.paper_type}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {tx.description || "-"}{" "}
                          {tx.created_by ? `· ${tx.created_by}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col items-end">
                        <span
                          className={`font-bold text-[13px] ${tx.transaction_type === "IN" ? "text-emerald-500" : "text-rose-500"}`}
                        >
                          {tx.transaction_type === "IN" ? "+" : "-"}
                          {tx.qty}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(tx.created_at).toLocaleDateString("th-TH")}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDelete(tx)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : dailySummaries.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-[13px]">
                ไม่มีข้อมูลสรุปรายวัน
              </div>
            ) : (
              dailySummaries.map((day) => (
                <div
                  key={day.dateKey}
                  className="mb-4 border border-[#dde8f5] rounded-xl overflow-hidden bg-white shadow-sm"
                >
                  <div className="bg-slate-50 px-4 py-2 border-b border-[#dde8f5]">
                    <span className="font-bold text-[13px] text-[#0f1e3d]">
                      {day.displayDate}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {day.paperTypes.map((p) => (
                      <div
                        key={p.pt}
                        className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-bold text-[#0f1e3d] truncate">
                            {p.pt}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 sm:gap-6 text-[11.5px] shrink-0 self-end sm:self-auto">
                          <div className="flex flex-col items-end">
                            <span className="text-slate-400 mb-0.5">ยกมา</span>
                            <span className="font-semibold text-slate-700">
                              {p.start.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-slate-400 mb-0.5">
                              รับเข้า
                            </span>
                            <span className="font-semibold text-emerald-500">
                              {p.in > 0 ? "+" : ""}
                              {p.in.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-slate-400 mb-0.5">
                              เบิกใช้
                            </span>
                            <span className="font-semibold text-rose-500">
                              {p.out > 0 ? "-" : ""}
                              {p.out.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex flex-col items-end border-l border-gray-200 pl-4">
                            <span className="text-slate-400 mb-0.5">
                              คงเหลือ
                            </span>
                            <span className="font-bold text-blue-600">
                              {p.end.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
