"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, ShieldCheck, RefreshCw } from "lucide-react";
import Swal from "sweetalert2";
import { supabase } from "@/lib/supabase";

type QaRequest = {
  id: string;
  user_id: string;
  requested_at: string;
};

type RequestUser = {
  id: string;
  name: string;
  email: string;
};

type DisplayRequest = QaRequest & {
  user: RequestUser | null;
};

type Props = {
  currentUserRole: string | null;
};

export default function QaApprovalPanel({ currentUserRole }: Props) {
  const [requests, setRequests] = useState<DisplayRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    // QA approval ให้ Moderator เท่านั้น
    if (currentUserRole !== "moderator") {
      setRequests([]);
      return;
    }

    setLoading(true);

    try {
      const { data: requestRows, error: requestError } = await supabase
        .from("qa_department_requests")
        .select("id, user_id, requested_at")
        .eq("status", "pending")
        .order("requested_at", { ascending: true });

      if (requestError) {
        throw requestError;
      }

      if (!requestRows || requestRows.length === 0) {
        setRequests([]);
        return;
      }

      const userIds = requestRows.map((request) => request.user_id);

      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", userIds);

      if (usersError) {
        throw usersError;
      }

      const userMap = new Map((users ?? []).map((user) => [user.id, user]));

      const rows: DisplayRequest[] = requestRows.map((request) => ({
        ...request,
        user: userMap.get(request.user_id) ?? null,
      }));

      setRequests(rows);
    } catch (error) {
      console.error("Failed to load QA requests:", error);

      Swal.fire({
        icon: "error",
        title: "โหลดคำขอไม่สำเร็จ",
        text:
          error instanceof Error ? error.message : "ไม่สามารถโหลดคำขอ QA ได้",
      });
    } finally {
      setLoading(false);
    }
  }, [currentUserRole]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const reviewRequest = async (request: DisplayRequest, approve: boolean) => {
    if (currentUserRole !== "moderator") {
      return;
    }

    const result = await Swal.fire({
      icon: approve ? "question" : "warning",
      title: approve ? "อนุมัติคำขอ QA?" : "ปฏิเสธคำขอ QA?",
      text: request.user
        ? `${request.user.name} (${request.user.email})`
        : "คำขอนี้",
      showCancelButton: true,
      confirmButtonText: approve ? "อนุมัติ" : "ปฏิเสธ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: approve ? "#2563eb" : "#dc2626",
    });

    if (!result.isConfirmed) {
      return;
    }

    setReviewingId(request.id);

    try {
      const { error } = await supabase.rpc("review_qa_department_request", {
        p_request_id: request.id,
        p_approve: approve,
      });

      if (error) {
        throw error;
      }

      window.dispatchEvent(new CustomEvent("qa-request-changed"));

      await Swal.fire({
        icon: "success",
        title: approve ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว",
        text: approve
          ? "ผู้ใช้ได้รับหน่วยงาน QA ประกันคุณภาพแล้ว"
          : "ผู้ใช้สามารถกลับไปเลือกหน่วยงานใหม่ได้",
        timer: 1600,
        showConfirmButton: false,
      });

      await fetchRequests();
    } catch (error) {
      console.error("QA review failed:", error);

      Swal.fire({
        icon: "error",
        title: "ดำเนินการไม่สำเร็จ",
        text:
          error instanceof Error
            ? error.message
            : "ไม่สามารถตรวจสอบคำขอ QA ได้",
      });
    } finally {
      setReviewingId(null);
    }
  };

  // Assistant Moderator ไม่แสดง panel นี้
  if (currentUserRole !== "moderator") {
    return null;
  }

  return (
    <section className="mb-5 bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3.5 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <ShieldCheck className="w-4.5 h-4.5" />
          </div>

          <div>
            <h2 className="text-[14px] font-black text-[#0f1e3d]">
              คำขอเข้า QA
            </h2>

            <p className="text-[11px] text-slate-400 font-medium">
              รอ Moderator ตรวจสอบ {requests.length} รายการ
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchRequests}
          disabled={loading}
          className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          title="รีเฟรช"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && requests.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">
          กำลังโหลดคำขอ...
        </div>
      ) : requests.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">
          ไม่มีคำขอ QA ที่รออนุมัติ
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {requests.map((request) => {
            const busy = reviewingId === request.id;

            return (
              <div
                key={request.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-bold text-[13.5px] text-[#0f1e3d] truncate">
                    {request.user?.name ?? "ไม่พบชื่อผู้ใช้"}
                  </div>

                  <div className="text-[12px] text-slate-500 truncate mt-0.5">
                    {request.user?.email ?? request.user_id}
                  </div>

                  <div className="text-[10.5px] text-slate-400 mt-1">
                    ขอเมื่อ{" "}
                    {new Date(request.requested_at).toLocaleString("th-TH")}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy || reviewingId !== null}
                    onClick={() => reviewRequest(request, false)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-[12px] font-bold hover:bg-rose-100 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    ปฏิเสธ
                  </button>

                  <button
                    type="button"
                    disabled={busy || reviewingId !== null}
                    onClick={() => reviewRequest(request, true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-[12px] font-bold hover:bg-blue-500 shadow-sm disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {busy ? "กำลังทำรายการ..." : "อนุมัติ"}
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
