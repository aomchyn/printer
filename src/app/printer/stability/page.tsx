"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import { X, ClipboardCheck, Download } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { StabilitySkeleton } from "./skeleton-loading-stability";
const AppSwal = Swal.mixin({
  confirmButtonColor: "#0057B8",
  cancelButtonColor: "#5F6B70",
  confirmButtonText: "รับทราบ",
});

export interface OrderInterface {
  id?: number;
  orderDate: string;
  orderTime: string;
  orderDateTime: string;
  orderType: string;
  lotNumber: string;
  productId: string;
  productName: string;
  productExp: string;
  productionDate: string;
  expiryDate: string;
  quantity: number;
  notes?: string;
  createdBy?: string;
  createdByDepartment?: string;
  isVerified?: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt?: string;
}

export interface FgcodeInterface {
  id: string;
  name: string;
  exp: string;
}

export interface StabilityFeedLog {
  id?: number;
  lotNumber: string;
  productId: string;
  productName: string;
  productExp: string;
  productionDate: string;
  expiryDate: string;
  feedType: string;
  remark: string;
  selectedIntervals: number[];
  completedIntervals: number[];
  createdBy?: string;
  createdByDepartment?: string;
  createdAt?: string;
}

type UpcomingTest = StabilityFeedLog & {
  id: number;
  intervalMonths: number;
  testDate: Date;
  diffDays: number;
};

const FormWrapper = ({
  isModal,
  onClose,
  title,
  children,
}: {
  isModal: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) => {
  if (isModal) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#00263A]/55 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#D9E1E2] bg-white p-4 shadow-2xl md:max-w-3xl md:rounded-3xl md:p-8">
          <div className="mb-6 flex items-center justify-between border-b border-[#D9E1E2] pb-4">
            <h2 className="text-xl font-black text-[#00263A]">{title}</h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F0F3F4] text-[#8A9498] transition-colors hover:bg-[#FCEAEC] hover:text-[#C8102E]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-[#D9E1E2] pt-8 animate-in fade-in slide-in-from-top-4 duration-300">
      {children}
    </div>
  );
};

export default function StabilityPage() {
  // ✅ ใส่ค่า initial time ตรงนี้แทน useEffect เพื่อหลีกเลี่ยง setState in effect
  const [orderData, setOrderData] = useState<OrderInterface>(() => {
    const now = new Date();
    return {
      orderDate: now.toISOString().split("T")[0],
      orderTime: now.toTimeString().split(" ")[0].substring(0, 5),
      orderDateTime: now.toISOString(),
      orderType: "พิมพ์ฉลาก",
      lotNumber: "",
      productId: "",
      productName: "",
      productExp: "",
      productionDate: "",
      expiryDate: "",
      quantity: 0,
      notes: "",
    };
  });
  const [products, setProducts] = useState<FgcodeInterface[]>([]);
  const [username, setUsername] = useState("Unknown User");
  const [department, setDepartment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [stabilityLogs, setStabilityLogs] = useState<StabilityFeedLog[]>([]);
  const [selectedIntervals, setSelectedIntervals] = useState<number[]>([
    0, 3, 6, 9, 12,
  ]);
  const [completedIntervals, setCompletedIntervals] = useState<number[]>([]);
  const [feedType, setFeedType] = useState("");
  const [remark, setRemark] = useState("");
  const [editOrderId, setEditOrderId] = useState<number | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ ย้ายฟังก์ชันขึ้นก่อน useEffect
  const fetchUserInfo = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from("users")
          .select("name, department")
          .eq("id", session.user.id)
          .single();
        if (data?.name) setUsername(data.name);
        if (data?.department) setDepartment(data.department);
      }
    } catch {
      console.error("Error fetching user info");
    }
  };

  const fetchProducts = async () => {
    try {
      let allData: FgcodeInterface[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("fgcode")
          .select("*")
          .range(from, from + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      setProducts(allData);
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า:", err);
    }
  };

  const fetchStabilityLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("stability_feeds")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) {
        const mappedData = data.map((item) => ({
          id: item.id,
          lotNumber: item.lot_number,
          productId: item.product_id,
          productName: item.product_name,
          productExp: item.product_exp,
          productionDate: item.production_date,
          expiryDate: item.expiry_date,
          feedType: item.feed_type || "",
          remark: item.remark || "",
          selectedIntervals: item.selected_intervals || [0, 3, 6, 9, 12],
          completedIntervals: item.completed_intervals || [],
          createdBy: item.created_by,
          createdByDepartment: item.created_by_department,
          createdAt: item.created_at,
        }));
        setStabilityLogs(mappedData);
      }
    } catch (err) {
      console.error("Error fetching stability logs:", err);
    }
  };

  // ✅ useEffect เดียว ไม่มี setState โดยตรง
  useEffect(() => {
    Promise.all([
      fetchUserInfo(),
      fetchProducts(),
      fetchStabilityLogs(),
    ]).finally(() => setIsLoading(false));
  }, []);

  const calculateExpiryDate = (
    manufactureDate: string,
    shelfLife: string,
  ): string => {
    if (!manufactureDate || !shelfLife) return "";
    try {
      const mfgDate = new Date(manufactureDate);
      if (isNaN(mfgDate.getTime())) return "";

      const trimmedShelfLife = shelfLife.trim();
      const spaceIndex = trimmedShelfLife.indexOf(" ");
      let numValue: number;
      let unit: string;

      if (spaceIndex === -1) {
        numValue = parseInt(trimmedShelfLife);
        unit = "months";
      } else {
        numValue = parseInt(trimmedShelfLife.substring(0, spaceIndex));
        unit = trimmedShelfLife.substring(spaceIndex + 1).toLowerCase();
      }

      if (isNaN(numValue) || numValue <= 0) return "";

      const newDate = new Date(mfgDate);
      if (unit.includes("day") || unit.includes("วัน")) {
        newDate.setDate(newDate.getDate() + numValue);
      } else if (
        unit.includes("month") ||
        unit.includes("mon") ||
        unit.includes("เดือน")
      ) {
        newDate.setMonth(newDate.getMonth() + numValue);
      } else if (
        unit.includes("year") ||
        unit.includes("yr") ||
        unit.includes("ปี")
      ) {
        newDate.setFullYear(newDate.getFullYear() + numValue);
      } else {
        newDate.setMonth(newDate.getMonth() + numValue);
      }

      return newDate.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const handleProductionDateChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!orderData.productId) return;

    const mfgDate = e.target.value;
    setOrderData((prev) => ({
      ...prev,
      productionDate: mfgDate,
      expiryDate: calculateExpiryDate(mfgDate, prev.productExp),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const confirm = await AppSwal.fire({
      icon: "question",
      title: editOrderId ? "ยืนยันการอัปเดตข้อมูล?" : "ยืนยันการบันทึก?",
      html: `
                <div style="font-family: sans-serif;">
                    <table style="width:100%; border-collapse:collapse; font-size:13px; margin:auto;">
                        <tr style="background:#F5F7F8;"><td style="padding:4px 6px; color:#5F6B70;">🔢 ลอต</td><td style="padding:4px 6px; font-weight:600;">${orderData.lotNumber}</td></tr>
                        <tr><td style="padding:4px 6px; color:#5F6B70;">📝 ชื่อสินค้า</td><td style="padding:4px 6px; font-weight:600;">${orderData.productName}</td></tr>
                        <tr style="background:#F5F7F8;"><td style="padding:4px 6px; color:#5F6B70;">📅 เดือนที่ทดสอบ</td><td style="padding:4px 6px; font-weight:600; color:#0057B8;">${selectedIntervals.length > 0 ? selectedIntervals.map((m) => (m === 0 ? "Initial" : m + " เดือน")).join(", ") : "-"}</td></tr>
                        ${feedType ? `<tr><td style="padding:4px 6px; color:#5F6B70;">ประเภทอาหาร</td><td style="padding:4px 6px;"><span style="display:inline-flex; align-items:center; gap:4px; padding:2px 6px; border-radius:4px; background:#FFF8D6; color:#101820; border:1px solid #F1C400; font-size:12px; font-weight:600;"><svg style="width:12px; height:12px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>${feedType}</span></td></tr>` : ""}
                        ${remark ? `<tr style="${feedType ? "background:#F5F7F8;" : ""}"><td style="padding:4px 6px; color:#5F6B70;">หมายเหตุ</td><td style="padding:4px 6px;"><span style="display:inline-flex; align-items:center; gap:4px; padding:2px 6px; border-radius:4px; background:#F0F3F4; color:#5F6B70; border:1px solid #D9E1E2; font-size:12px; font-weight:600;"><svg style="width:12px; height:12px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>${remark}</span></td></tr>` : ""}
                    </table>
                </div>
            `,
      showCancelButton: true,
      confirmButtonText: "ยืนยัน",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#0057B8",
      cancelButtonColor: "#5F6B70",
      width: "clamp(300px, 90vw, 500px)",
      heightAuto: true,
      customClass: {
        popup: "rounded-xl text-sm !p-4",
        title: "text-base",
        confirmButton: "text-sm py-2 px-4",
        cancelButton: "text-sm py-2 px-4",
      },
    });

    if (!confirm.isConfirmed) return;

    try {
      const requiredFields = ["lotNumber", "productId", "productionDate"];
      const missingFields = requiredFields.filter(
        (field) => !orderData[field as keyof OrderInterface],
      );
      if (missingFields.length > 0) {
        alert(`กรุณากรอกข้อมูลให้ครบถ้วน: ${missingFields.join(", ")}`);
        return;
      }

      if (!orderData.productExp || orderData.productExp.trim() === "") {
        AppSwal.fire({
          icon: "error",
          title: "ไม่สามารถบันทึกได้",
          text: "สินค้านี้ไม่มีข้อมูลอายุผลิตภัณฑ์ที่ถูกต้อง กรุณาเลือกสินค้าใหม่หรือตรวจสอบข้อมูลใน FG Code",
          confirmButtonText: "รับทราบ",
          confirmButtonColor: "#0057B8",
        });
        return;
      }

      setUploading(true);

      const payload = {
        lot_number: orderData.lotNumber,
        product_id: orderData.productId,
        product_name: orderData.productName,
        product_exp: orderData.productExp,
        production_date: orderData.productionDate,
        expiry_date: orderData.expiryDate,
        feed_type: feedType || null,
        remark: remark || null,
        selected_intervals: [...selectedIntervals].sort((a, b) => a - b),
        completed_intervals: completedIntervals,
        created_by: username,
        created_by_department: department || "ไม่ระบุหน่วยงาน",
      };

      let submitError;
      if (editOrderId) {
        const { error } = await supabase
          .from("stability_feeds")
          .update(payload)
          .eq("id", editOrderId);
        submitError = error;
      } else {
        const { error } = await supabase
          .from("stability_feeds")
          .insert(payload);
        submitError = error;
      }

      if (submitError) throw new Error(submitError.message);

      AppSwal.fire({
        icon: "success",
        title: "สำเร็จ",
        text: editOrderId
          ? "อัปเดตข้อมูลสำเร็จแล้ว"
          : "บันทึกคำสั่งพิมพ์ชิ้นงานสำเร็จแล้ว",
      });

      fetchStabilityLogs();

      // Reset form
      setSelectedIntervals([0, 3, 6, 9, 12]);
      setCompletedIntervals([]);
      setFeedType("");
      setRemark("");
      setEditOrderId(null);
      setIsFormOpen(false);
      setProductSearch("");
      const resetNow = new Date();
      setOrderData({
        orderDate: resetNow.toISOString().split("T")[0],
        orderTime: resetNow.toTimeString().split(" ")[0].substring(0, 5),
        orderDateTime: resetNow.toISOString(),
        orderType: "พิมพ์ฉลาก",
        lotNumber: "",
        productId: "",
        productName: "",
        productExp: "",
        productionDate: "",
        expiryDate: "",
        quantity: 0,
        notes: "",
      });
    } catch {
      AppSwal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: "กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setUploading(false);
    }
  };

  const formatThaiDateTime = () => {
    if (!orderData.orderDate || !orderData.orderTime) return "กำลังโหลด...";
    try {
      const [year, month, day] = orderData.orderDate.split("-");
      const [hours, minutes] = orderData.orderTime.split(":");
      const thaiYear = parseInt(year) + 543;
      return `${day}/${month}/${thaiYear}, ${hours}:${minutes}`;
    } catch {
      return `${orderData.orderDate}, ${orderData.orderTime}`;
    }
  };

  const getRequiredFieldStyle = (
    value: string | number,
    isRequired: boolean = true,
  ) => {
    const base =
      "w-full px-4 py-3 rounded-xl text-[#101820] text-[13.5px] font-medium bg-white border focus:outline-none transition-all duration-200 shadow-sm";

    if (!isRequired) {
      return `${base} border-[#D9E1E2] focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10`;
    }

    const hasValue =
      typeof value === "string" ? value.trim().length > 0 : value > 0;

    if (hasValue) {
      return `${base} border-[#D9E1E2] focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10`;
    }

    return `${base} border-[#C8102E]/25 bg-[#FCEAEC]/35 focus:border-[#C8102E] focus:ring-4 focus:ring-[#C8102E]/10 placeholder:text-[#C8102E]/45`;
  };

  const handleMarkCompleted = async (
    logId: number,
    months: number,
    currentCompleted: number[],
  ) => {
    try {
      const confirm = await AppSwal.fire({
        title: "ยืนยันการตรวจสอบ",
        text: `ยืนยันว่าได้ทำการทดสอบรอบ ${months === 0 ? "Initial" : months + " Months"} แล้วใช่หรือไม่?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "ยืนยัน",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#0057B8",
      });

      if (!confirm.isConfirmed) return;

      const completed = [...currentCompleted];
      if (!completed.includes(months)) {
        completed.push(months);
      }

      const { error } = await supabase
        .from("stability_feeds")
        .update({ completed_intervals: completed })
        .eq("id", logId);

      if (error) throw error;

      AppSwal.fire({
        icon: "success",
        title: "สำเร็จ",
        text: "บันทึกการตรวจสอบเรียบร้อยแล้ว",
        timer: 1500,
        showConfirmButton: false,
      });

      fetchStabilityLogs();
    } catch (err) {
      console.error(err);
      AppSwal.fire({
        icon: "error",
        title: "ผิดพลาด",
        text: "ไม่สามารถบันทึกข้อมูลได้",
      });
    }
  };

  const handleEditLog = (log: StabilityFeedLog) => {
    const now = new Date();
    setOrderData({
      orderDate: now.toISOString().split("T")[0],
      orderTime: now.toTimeString().split(" ")[0].substring(0, 5),
      orderDateTime: now.toISOString(),
      orderType: "Stability Feed",
      lotNumber: log.lotNumber || "",
      productId: log.productId || "",
      productName: log.productName || "",
      productExp: log.productExp || "",
      productionDate: log.productionDate || "",
      expiryDate: log.expiryDate || "",
      quantity: 0,
      notes: "",
    });
    setEditOrderId(log.id || null);
    setIsFormOpen(true);
    setProductSearch(log.productId || "");
    setSelectedIntervals(log.selectedIntervals || [0, 3, 6, 9, 12]);
    setCompletedIntervals(log.completedIntervals || []);
    setFeedType(log.feedType || "");
    setRemark(log.remark || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteLog = async (logId: number) => {
    try {
      const confirm = await AppSwal.fire({
        title: "ยืนยันการลบ",
        text: "คุณต้องการลบรายการนี้ใช่หรือไม่?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "ลบข้อมูล",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#C8102E",
      });

      if (!confirm.isConfirmed) return;

      const { error } = await supabase
        .from("stability_feeds")
        .update({
          is_deleted: true,
          deleted_by: username,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", logId);

      if (error) throw error;

      AppSwal.fire({
        icon: "success",
        title: "ลบสำเร็จ",
        text: "ลบรายการนี้เรียบร้อยแล้ว",
        timer: 1500,
        showConfirmButton: false,
      });

      fetchStabilityLogs();
    } catch (err) {
      console.error(err);
      AppSwal.fire({
        icon: "error",
        title: "ผิดพลาด",
        text: "ไม่สามารถลบข้อมูลได้",
      });
    }
  };

  const parseLogData = (log: StabilityFeedLog) => ({
    intervals: log.selectedIntervals || [0, 3, 6, 9, 12],
    completed: log.completedIntervals || [],
    feedType: log.feedType || "",
    remark: log.remark || "",
  });

  const filteredLogs = stabilityLogs.filter((log) => {
    const search = globalSearch.toLowerCase();
    return (
      (log.productName || "").toLowerCase().includes(search) ||
      (log.lotNumber || "").toLowerCase().includes(search) ||
      (log.productId || "").toLowerCase().includes(search)
    );
  });

  const exportStabilityExcel = async () => {
    if (filteredLogs.length === 0) return;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Stability Feed");
    ws.columns = [
      { header: "ลอต", key: "lot", width: 16 },
      { header: "รหัสสินค้า", key: "product_id", width: 14 },
      { header: "ชื่อสินค้า", key: "product_name", width: 30 },
      { header: "อายุผลิตภัณฑ์", key: "exp", width: 14 },
      { header: "วันที่ผลิต", key: "mfg", width: 14 },
      { header: "วันหมดอายุ", key: "expiry", width: 14 },
      { header: "ประเภทการป้อน", key: "feed_type", width: 16 },
      { header: "ช่วงที่ต้องทดสอบ (เดือน)", key: "selected", width: 22 },
      { header: "ช่วงที่ทดสอบแล้ว (เดือน)", key: "completed", width: 22 },
      { header: "หมายเหตุ", key: "remark", width: 26 },
      { header: "ผู้บันทึก", key: "created_by", width: 20 },
      { header: "หน่วยงาน", key: "dept", width: 16 },
      { header: "วันที่บันทึก", key: "created_at", width: 18 },
    ];
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF00263A" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    filteredLogs.forEach((log) => {
      const { intervals, completed } = parseLogData(log);
      ws.addRow({
        lot: log.lotNumber,
        product_id: log.productId,
        product_name: log.productName,
        exp: log.productExp,
        mfg: log.productionDate,
        expiry: log.expiryDate,
        feed_type: log.feedType || "-",
        selected: intervals.join(", "),
        completed: completed.length > 0 ? completed.join(", ") : "-",
        remark: log.remark || "-",
        created_by: log.createdBy || "-",
        dept: log.createdByDepartment || "-",
        created_at: log.createdAt
          ? new Date(log.createdAt).toLocaleDateString("th-TH", {
              timeZone: "Asia/Bangkok",
            })
          : "-",
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(
      blob,
      `stability-feed-${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })}.xlsx`,
    );
  };

  const upcomingTests = filteredLogs
    .flatMap((log) => {
      if (!log.productionDate) return [];

      const { intervals: selected, completed } = parseLogData(log);

      const upcoming: UpcomingTest[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      selected.forEach((months) => {
        if (completed.includes(months)) return;

        const testDate = new Date(log.productionDate);
        testDate.setMonth(testDate.getMonth() + months);
        testDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil(
          (testDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        // แจ้งเตือนล่วงหน้า 1 วัน และเลยกำหนดไปแล้วไม่เกิน 30 วัน
        if (diffDays <= 1 && diffDays >= -30) {
          upcoming.push({
            ...log,
            intervalMonths: months,
            testDate: testDate,
            diffDays: diffDays,
          } as UpcomingTest);
        }
      });

      return upcoming;
    })
    .sort((a, b) => a.testDate.getTime() - b.testDate.getTime());

  if (isLoading) return <StabilitySkeleton />;

  return (
    <div className="flex w-full flex-col items-center gap-8 text-[#101820]">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#00AEC7]/15 bg-[#00263A] p-5 shadow-lg transition-all duration-300 md:max-w-3xl md:rounded-3xl md:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 shrink-0 rounded-2xl border border-white/15 bg-white/10 text-[#00AEC7] flex items-center justify-center shadow-inner">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-[20px] md:text-[22px] font-black text-white tracking-tight">
                STABILITY FEED KPI
              </h1>
              <p className="mt-1 text-[12px] text-white/60">
                บันทึกและติดตามรอบทดสอบความคงตัวของสินค้า
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditOrderId(null);
              setIsFormOpen(true);
            }}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#0057B8] px-4 py-3 text-[13px] font-bold text-white shadow-md shadow-[#0057B8]/15 transition-all hover:bg-[#004A9F] hover:shadow-lg"
          >
            <span className="text-lg leading-none">+</span>
            เพิ่มข้อมูล
          </button>
        </div>

        {isFormOpen && (
          <FormWrapper
            isModal={true}
            title={
              editOrderId
                ? "แก้ไขข้อมูล Stability"
                : "เพิ่มข้อมูล Stability Feed"
            }
            onClose={() => {
              setIsFormOpen(false);
              setEditOrderId(null);
            }}
          >
            <div className="mb-7 rounded-2xl border border-[#0057B8]/15 bg-[#EAF3FC] px-4 py-4 md:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0057B8]">
                    Stability Feed
                  </p>
                  <h2 className="mt-1 text-lg font-black text-[#00263A]">
                    {editOrderId
                      ? "แก้ไขข้อมูลรอบทดสอบ"
                      : "เพิ่มข้อมูล Stability Feed"}
                  </h2>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#5F6B70]">
                    ระบุสินค้าและวันที่ผลิต
                    เพื่อสร้างกำหนดการตรวจสอบความคงตัวโดยอัตโนมัติ
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[#0057B8] shadow-sm ring-1 ring-[#0057B8]/15">
                  {editOrderId ? "โหมดแก้ไข" : "รายการใหม่"}
                </span>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div className="md:col-span-2 flex items-center gap-3 border-b border-[#D9E1E2] pb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F0F3F4] text-[11px] font-black text-[#5F6B70]">
                    1
                  </span>
                  <div>
                    <h3 className="text-[13px] font-black text-[#00263A]">
                      ข้อมูลการบันทึก
                    </h3>
                    <p className="text-[11px] text-[#8A9498]">
                      วันที่และเวลาที่สร้างรายการนี้
                    </p>
                  </div>
                </div>
                {/* วันที่และเวลา */}
                <div className="md:col-span-2">
                  <label className="block text-[12px] font-bold text-[#5F6B70] mb-2">
                    วันที่และเวลาบันทึก
                  </label>
                  <div className="w-full px-4 py-3 bg-[#F0F3F4] border border-[#D9E1E2] rounded-xl text-[#101820] text-[13.5px] font-semibold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00B398] animate-pulse" />
                    {formatThaiDateTime()}
                  </div>
                </div>

                <div className="md:col-span-2 flex items-center gap-3 border-b border-[#D9E1E2] pb-2 pt-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F0F3F4] text-[11px] font-black text-[#5F6B70]">
                    2
                  </span>
                  <div>
                    <h3 className="text-[13px] font-black text-[#00263A]">
                      ข้อมูลสินค้า
                    </h3>
                    <p className="text-[11px] text-[#8A9498]">
                      เลือกสินค้าและระบุเลขลอตให้ตรงกับฉลากจริง
                    </p>
                  </div>
                </div>

                {/* เลขลอต */}
                <div>
                  <label className="block text-[12px] font-bold text-[#5F6B70] mb-2">
                    เลขลอตสินค้า{" "}
                    <span className="text-[#C8102E] font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    value={orderData.lotNumber}
                    onChange={(e) =>
                      setOrderData((prev) => ({
                        ...prev,
                        lotNumber: e.target.value,
                      }))
                    }
                    placeholder="ป้อนเลขลอตสินค้า..."
                    required
                    className={getRequiredFieldStyle(orderData.lotNumber)}
                  />
                </div>

                {/* รหัสสินค้า — custom dropdown */}
                <div>
                  <label className="block text-[12px] font-bold text-[#5F6B70] mb-2">
                    รหัสสินค้า{" "}
                    <span className="text-[#C8102E] font-bold">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowDropdown(true);
                        if (!e.target.value) {
                          setOrderData((prev) => ({
                            ...prev,
                            productId: "",
                            productName: "",
                            productExp: "",
                            expiryDate: "",
                          }));
                        }
                      }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="ค้นหาด้วยรหัสหรือชื่อสินค้า..."
                      required
                      className={`${getRequiredFieldStyle(orderData.productId)} pr-10`}
                    />

                    {/* ปุ่มเคลียร์ */}
                    {productSearch && (
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
                            setProductSearch("");
                            setShowDropdown(false);
                            setOrderData((prev) => ({
                              ...prev,
                              productId: "",
                              productName: "",
                              productExp: "",
                              expiryDate: "",
                            }));
                          }}
                          className="text-[#8A9498] hover:text-[#C8102E] hover:bg-[#FCEAEC] rounded-full p-1 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Dropdown */}
                    {showDropdown && productSearch.length > 0 && (
                      <div
                        className="absolute z-50 w-full mt-1.5 bg-white border border-[#D9E1E2] rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-[#D9E1E2]"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {products
                          .filter(
                            (p) =>
                              p.id
                                .toLowerCase()
                                .includes(productSearch.toLowerCase()) ||
                              p.name
                                .toLowerCase()
                                .includes(productSearch.toLowerCase()),
                          )
                          .slice(0, 20)
                          .map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => {
                                setProductSearch(product.id);
                                setShowDropdown(false);
                                const hasExp =
                                  product.exp && product.exp.trim() !== "";
                                setOrderData((prev) => ({
                                  ...prev,
                                  productId: product.id,
                                  productName: product.name,
                                  productExp: product.exp ?? "",
                                  expiryDate: hasExp
                                    ? calculateExpiryDate(
                                        prev.productionDate,
                                        product.exp,
                                      )
                                    : "",
                                }));
                                if (!hasExp) {
                                  AppSwal.fire({
                                    icon: "warning",
                                    title: "ไม่มีอายุผลิตภัณฑ์",
                                    text: `รหัสสินค้า "${product.id}" ไม่มีข้อมูลอายุผลิตภัณฑ์ที่ถูกต้อง กรุณาตรวจสอบข้อมูลใน Product`,
                                    confirmButtonText: "รับทราบ",
                                    confirmButtonColor: "#0057B8",
                                    cancelButtonColor: "#5F6B70",
                                  });
                                }
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-[#EAF3FC]/50 transition-colors"
                            >
                              <div className="font-mono font-bold text-[#0057B8] text-[12.5px]">
                                {product.id}
                              </div>
                              <div className="text-[#00263A] font-bold text-[12px] mt-0.5 truncate">
                                {product.name}
                              </div>
                            </button>
                          ))}
                        {products.filter(
                          (p) =>
                            p.id
                              .toLowerCase()
                              .includes(productSearch.toLowerCase()) ||
                            p.name
                              .toLowerCase()
                              .includes(productSearch.toLowerCase()),
                        ).length === 0 && (
                          <div className="px-4 py-3 text-[#8A9498] text-[12.5px] text-center font-medium">
                            ไม่พบสินค้า
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Overlay ปิด dropdown */}
                  {showDropdown && (
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowDropdown(false)}
                    />
                  )}
                </div>

                {/* ชื่อสินค้า */}
                {orderData.productName && (
                  <div className="md:col-span-2">
                    <label className="block text-[12px] font-bold text-[#5F6B70] mb-2">
                      ชื่อสินค้า
                    </label>
                    <input
                      type="text"
                      value={orderData.productName}
                      readOnly
                      className="w-full px-4 py-3 bg-[#F0F3F4] border border-[#D9E1E2] rounded-xl text-[#5F6B70] text-[13.5px] font-semibold cursor-not-allowed"
                    />
                  </div>
                )}

                <div className="md:col-span-2 flex items-center gap-3 border-b border-[#D9E1E2] pb-2 pt-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F0F3F4] text-[11px] font-black text-[#5F6B70]">
                    3
                  </span>
                  <div>
                    <h3 className="text-[13px] font-black text-[#00263A]">
                      รายละเอียดการทดสอบ
                    </h3>
                    <p className="text-[11px] text-[#8A9498]">
                      วันที่ผลิตเป็นตัวตั้งต้นของกำหนดการ Stability
                    </p>
                  </div>
                </div>

                {/* วันที่ผลิต */}
                <div>
                  <label className="block text-[12px] font-bold text-[#5F6B70] mb-2">
                    วันที่ผลิต{" "}
                    <span className="text-[#C8102E] font-bold">*</span>
                  </label>
                  <input
                    type="date"
                    value={orderData.productionDate}
                    onChange={handleProductionDateChange}
                    onKeyDown={(e) => {
                      if (e.key !== "Tab") e.preventDefault();
                    }}
                    disabled={!orderData.productId}
                    required
                    className={
                      !orderData.productId
                        ? "w-full px-4 py-3 rounded-xl text-[13.5px] font-medium border border-[#D9E1E2] bg-[#F0F3F4] text-[#8A9498] cursor-not-allowed select-none"
                        : getRequiredFieldStyle(orderData.productionDate)
                    }
                  />
                  <p className="mt-1.5 text-[11px] text-[#8A9498]">
                    ต้องเลือกสินค้า ก่อนระบุวันที่ผลิต
                  </p>
                </div>

                {/* ประเภทอาหารสัตว์ */}
                <div>
                  <label className="block text-[12px] font-bold text-[#5F6B70] mb-2">
                    ประเภทอาหารสัตว์
                  </label>
                  <select
                    value={feedType}
                    onChange={(e) => setFeedType(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-[13.5px] font-medium border border-[#D9E1E2] bg-white text-[#101820] focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10 outline-none transition-all shadow-sm"
                  >
                    <option value="">-- เลือกประเภทอาหารสัตว์ --</option>
                    <option value="พรีมิกส์">พรีมิกส์</option>
                    <option value="เสริมโปรตีน">เสริมโปรตีน</option>
                    <option value="เสริมไขมัน">เสริมไขมัน</option>
                    <option value="สำเร็จรูป">สำเร็จรูป</option>
                    <option value="นม">นม</option>
                    <option value="อื่นๆ">อื่นๆ</option>
                  </select>
                </div>

                {/* หมายเหตุ */}
                <div>
                  <label className="block text-[12px] font-bold text-[#5F6B70] mb-2">
                    หมายเหตุ{" "}
                    <span className="font-normal text-[#8A9498]">(ถ้ามี)</span>
                  </label>
                  <input
                    type="text"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="ระบุหมายเหตุ (ถ้ามี)"
                    className="w-full px-4 py-3 rounded-xl text-[13.5px] font-medium border border-[#D9E1E2] bg-white text-[#101820] focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10 outline-none transition-all shadow-sm"
                  />
                </div>

                {/* ช่วงเวลา Stability */}
                {orderData.productionDate && (
                  <div className="md:col-span-2">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[13px] font-black text-[#00263A]">
                          กำหนดรอบทดสอบความคงตัว
                        </h3>
                        <p className="mt-0.5 text-[11px] text-[#8A9498]">
                          เลือกเฉพาะรอบที่ต้องการตรวจสอบ
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#E6F8F4] px-2.5 py-1 text-[10px] font-bold text-[#101820] ring-1 ring-[#00B398]/20">
                        เลือกแล้ว {selectedIntervals.length} รอบ
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {[
                        { label: "วันที่สั่ง (Initial)", months: 0 },
                        { label: "3 Months", months: 3 },
                        { label: "6 Months", months: 6 },
                        { label: "9 Months", months: 9 },
                        { label: "12 Months", months: 12 },
                      ].map((interval) => {
                        const d = new Date(orderData.productionDate);
                        d.setMonth(d.getMonth() + interval.months);
                        const dateStr = d.toISOString().split("T")[0];
                        const [year, month, day] = dateStr.split("-");
                        const thaiYear = parseInt(year) + 543;
                        const isSelected = selectedIntervals.includes(
                          interval.months,
                        );
                        return (
                          <div
                            key={interval.label}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedIntervals((prev) =>
                                  prev.filter((m) => m !== interval.months),
                                );
                              } else {
                                setSelectedIntervals((prev) => [
                                  ...prev,
                                  interval.months,
                                ]);
                              }
                            }}
                            className={`p-3 border rounded-xl text-center shadow-sm cursor-pointer transition-all duration-200 select-none relative overflow-hidden ${
                              isSelected
                                ? "bg-[#E6F8F4] border-[#00B398] ring-1 ring-[#00B398]"
                                : "bg-[#F0F3F4] border-[#D9E1E2] opacity-60 hover:opacity-100 hover:border-[#00B398]/50"
                            }`}
                          >
                            <div className="absolute top-2 right-2">
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
  isSelected
    ? "bg-[#00B398] border-[#00B398]"
    : "border-[#B8C4C8] bg-white"
}`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-3 h-3 text-[#101820]"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="3"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                            </div>
                            <div
                              className={`text-[11.5px] font-bold mb-1.5 ${
  isSelected ? "text-[#101820]" : "text-[#5F6B70]"
}`}
                            >
                              {interval.label}
                            </div>
                            <div
                              className={`text-[13px] font-black ${
  isSelected ? "text-[#101820]" : "text-[#5F6B70]"
}`}
                            >
                              {day}/{month}/{thaiYear}
                            </div>
                            <div
                              className={`text-[10px] font-medium ${
  isSelected ? "text-[#5F6B70]" : "text-[#8A9498]"
}`}
                            >
                              {day}/{month}/{year}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-[#5F6B70]">
                      คลิกการ์ดเพื่อเลือกหรือยกเลิกรอบทดสอบ วันที่จะแสดงทั้ง
                      พ.ศ. และ ค.ศ.
                    </p>
                  </div>
                )}

                {/* Submit */}
                <div className="md:col-span-2 pt-4">
                  <button
                    type="submit"
                    className="w-full bg-[#0057B8] hover:bg-[#004A9F] text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-md shadow-[#0057B8]/15 hover:shadow-lg disabled:opacity-40 disabled:hover:bg-[#0057B8] disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 text-[14px]"
                    disabled={
                      !orderData.lotNumber ||
                      !orderData.productId ||
                      !orderData.productExp ||
                      !orderData.productionDate ||
                      uploading
                    }
                  >
                    {uploading ? (
                      <>
                        <svg
                          className="animate-spin w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        กำลังบันทึก...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4.5 h-4.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        บันทึกข้อมูล Stability
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </FormWrapper>
        )}
      </div>

      {/* ช่องค้นหา */}
      <div className="w-full max-w-5xl flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg
              className="w-5 h-5 text-[#8A9498]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              ></path>
            </svg>
          </div>
          <input
            type="text"
            placeholder="ค้นหาสินค้า, รหัสสินค้า, หรือ ลอต..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="w-full pl-11 pr-12 py-3.5 bg-white border border-[#D9E1E2] rounded-xl md:rounded-2xl shadow-sm focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all text-[14px] text-[#101820] placeholder:text-[#8A9498]"
          />
          {globalSearch && (
            <button
              onClick={() => setGlobalSearch("")}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#8A9498] hover:text-[#C8102E] transition-colors"
              title="ล้างคำค้นหา"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={exportStabilityExcel}
          disabled={filteredLogs.length === 0}
          className="shrink-0 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl md:rounded-2xl font-bold text-[13px] transition-all duration-200 bg-[#00B398] text-[#101820] shadow-sm hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
        >
          <Download className="w-4 h-4" />
          Export Excel
        </button>
      </div>

      {/* ตารางแจ้งเตือนใกล้ถึงกำหนด */}

      {upcomingTests.length > 0 && (
        <div className="w-full max-w-5xl bg-[#FCEAEC]/50 rounded-2xl shadow-[0_8px_30px_rgba(200,16,46,0.06)] border border-[#C8102E]/15 overflow-hidden">
          <div className="bg-[#FCEAEC] px-6 py-4 border-b border-[#C8102E]/15 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#C8102E]/10 flex items-center justify-center animate-pulse">
              <svg
                className="w-4 h-4 text-[#C8102E]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-[16px] font-bold text-[#C8102E]">
              แจ้งเตือน: ใกล้ครบกำหนดทดสอบความคงตัว (Upcoming Tests)
            </h2>
          </div>

          {/* Mobile View (Cards) */}
          <div className="lg:hidden flex flex-col gap-4 p-4 bg-[#FCEAEC]/30">
            {upcomingTests.map((item, idx) => {
              const d = item.testDate;
              const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear() + 543}`;
              const intervalLabel =
                item.intervalMonths === 0
                  ? "Initial (วันที่ผลิต)"
                  : `${item.intervalMonths} Months`;

              let statusBadge = null;
              if (item.diffDays < 0) {
                statusBadge = (
                  <span className="px-2 py-1 bg-[#FCEAEC] text-[#C8102E] rounded-md text-[11px] font-bold">
                    เลยกำหนด {Math.abs(item.diffDays)} วัน
                  </span>
                );
              } else if (item.diffDays === 0) {
                statusBadge = (
                  <span className="px-2 py-1 bg-[#C8102E] text-white rounded-md text-[11px] font-bold">
                    ครบกำหนดวันนี้
                  </span>
                );
              } else {
                statusBadge = (
                  <span className="px-2 py-1 bg-[#FFF8D6] text-[#101820] rounded-md text-[11px] font-bold">
                    เหลืออีก {item.diffDays} วัน
                  </span>
                );
              }

              return (
                <div
                  key={`mobile-upcoming-${item.id}-${item.intervalMonths}-${idx}`}
                  className="bg-white p-4 rounded-xl border border-[#C8102E]/20 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="text-[12px] text-[#5F6B70] font-bold mb-1">
                        ล็อต: {item.lotNumber}
                      </div>
                      <div className="font-semibold text-[#00263A] text-[14px] leading-tight">
                        {item.productName}
                      </div>
                      <div className="text-[11px] text-[#8A9498] mt-0.5">
                        {item.productId}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-[11px] font-bold px-2 py-1 bg-[#FCEAEC] text-[#C8102E] rounded-lg">
                        {intervalLabel}
                      </div>
                      {statusBadge}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-[#C8102E]/10 mt-1">
                    <div className="text-[12px] font-bold text-[#5F6B70]">
                      กำหนด: <span className="text-[#C8102E]">{dateStr}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleMarkCompleted(
                            item.id,
                            item.intervalMonths,
                            item.completedIntervals || [],
                          )
                        }
                        className="p-2 bg-[#E6F8F4] text-[#101820] hover:bg-[#00B398] rounded-lg transition-colors border border-[#00B398]/20"
                        title="ยืนยันการตรวจแล้ว"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteLog(item.id)}
                        className="p-2 bg-[#FCEAEC] text-[#C8102E] hover:bg-[#C8102E] hover:text-white rounded-lg transition-colors border border-[#C8102E]/20"
                        title="ลบรายการ"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop View (Table) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-[13px] text-left">
              <thead className="text-[11px] text-[#C8102E] uppercase bg-[#FCEAEC]/80 border-b border-[#C8102E]/15">
                <tr>
                  <th className="px-3 py-3 font-bold">ล็อต (Lot)</th>
                  <th className="px-3 py-3 font-bold">สินค้า (Product)</th>
                  <th className="px-3 py-3 font-bold">รอบทดสอบ</th>
                  <th className="px-3 py-3 font-bold text-center">
                    วันที่กำหนด
                  </th>
                  <th className="px-3 py-3 font-bold text-center">สถานะ</th>
                  <th className="px-3 py-3 font-bold text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C8102E]/15">
                {upcomingTests.map((item, idx) => {
                  const d = item.testDate;
                  const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear() + 543}`;

                  let statusBadge = null;
                  if (item.diffDays < 0) {
                    statusBadge = (
                      <span className="px-2 py-1 bg-[#FCEAEC] text-[#C8102E] rounded-md text-[11px] font-bold">
                        เลยกำหนด {Math.abs(item.diffDays)} วัน
                      </span>
                    );
                  } else if (item.diffDays === 0) {
                    statusBadge = (
                      <span className="px-2 py-1 bg-[#C8102E] text-white rounded-md text-[11px] font-bold">
                        ครบกำหนดวันนี้
                      </span>
                    );
                  } else {
                    statusBadge = (
                      <span className="px-2 py-1 bg-[#FFF8D6] text-[#101820] rounded-md text-[11px] font-bold">
                        เหลืออีก {item.diffDays} วัน
                      </span>
                    );
                  }

                  const intervalLabel =
                    item.intervalMonths === 0
                      ? "Initial (วันที่ผลิต)"
                      : `${item.intervalMonths} Months`;

                  return (
                    <tr
                      key={`${item.id}-${item.intervalMonths}-${idx}`}
                      className="hover:bg-[#FCEAEC] transition-colors bg-white"
                    >
                      <td className="px-3 py-3 font-bold text-[#101820]">
                        {item.lotNumber}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#101820]">
                          {item.productName}
                        </div>
                        <div className="text-[11px] text-[#5F6B70]">
                          {item.productId}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-[#C8102E]">
                        {intervalLabel}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-[#101820]">
                        {dateStr}
                      </td>
                      <td className="px-3 py-3 text-center">{statusBadge}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() =>
                              handleMarkCompleted(
                                item.id,
                                item.intervalMonths,
                                item.completedIntervals || [],
                              )
                            }
                            className="p-1.5 bg-[#E6F8F4] text-[#101820] hover:bg-[#00B398] rounded-lg transition-colors border border-[#00B398]/20"
                            title="ยืนยันการตรวจแล้ว"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteLog(item.id)}
                            className="p-1.5 bg-[#FCEAEC] text-[#C8102E] hover:bg-[#C8102E] hover:text-white rounded-lg transition-colors border border-[#C8102E]/20"
                            title="ลบรายการ"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ตารางแสดงประวัติ Stability */}
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#D9E1E2]/60 overflow-hidden">
        <div className="bg-[#F5F7F8] px-6 py-4 border-b border-[#D9E1E2] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E6F8F4] flex items-center justify-center">
            <svg
              className="w-4 h-4 text-[#00B398]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h2 className="text-[16px] font-bold text-[#00263A]">
            รายการข้อมูล Stability (Recent Logs)
          </h2>
        </div>

        {/* Mobile View (Cards) */}
        <div className="xl:hidden flex flex-col gap-4 p-4 bg-[#F0F3F4]/50">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-[#8A9498] font-medium py-8 bg-white rounded-xl border border-[#D9E1E2]">
              ไม่พบข้อมูล
            </div>
          ) : (
            filteredLogs.map((log) => {
              const { intervals, completed, feedType, remark } =
                parseLogData(log);
              const calculateDate = (months: number) => {
                if (!log.productionDate) return "-";

                if (!intervals.includes(months))
                  return <span className="text-[#B8C4C8] font-normal">-</span>;

                const d = new Date(log.productionDate);
                d.setMonth(d.getMonth() + months);
                const dateStr = d.toISOString().split("T")[0];
                const [year, month, day] = dateStr.split("-");
                const thaiYear = parseInt(year) + 543;
                const formattedDate = `${day}/${month}/${thaiYear}`;

                if (completed.includes(months)) {
                  return (
                    <span className="flex items-center gap-1 text-[#101820] font-bold">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {formattedDate}
                    </span>
                  );
                }
                return <span className="font-medium">{formattedDate}</span>;
              };

              return (
                <div
                  key={`mobile-log-${log.id}`}
                  className="bg-white p-4 rounded-xl border border-[#D9E1E2] shadow-sm flex flex-col relative"
                >
                  <div className="absolute top-4 right-4 flex items-center gap-1">
                    <button
                      onClick={() => handleEditLog(log)}
                      className="p-2 text-[#8A9498] hover:bg-[#EAF3FC] hover:text-[#0057B8] rounded-lg transition-colors"
                      title="แก้ไขรายการ"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteLog(log.id!)}
                      className="p-2 text-[#8A9498] hover:bg-[#FCEAEC] hover:text-[#C8102E] rounded-lg transition-colors"
                      title="ลบรายการนี้"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="border-b border-[#D9E1E2] pb-3 mb-3 pr-10">
                    <div className="text-[11.5px] font-bold text-[#5F6B70] mb-1.5 flex items-center gap-1.5">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {log.createdAt
                        ? `${new Date(log.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })} ${new Date(log.createdAt).toLocaleTimeString("th-TH").slice(0, 5)} น.`
                        : "-"}
                    </div>
                    <div className="font-bold text-[#00263A] text-[14.5px] leading-tight mb-1">
                      {(feedType || remark) && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {feedType && (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FFF8D6] text-[#101820] border border-[#F1C400]/30 shadow-sm text-[10px] font-medium">
                              <svg
                                className="w-3 h-3 opacity-70"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                />
                              </svg>
                              {feedType}
                            </div>
                          )}
                          {remark && (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F0F3F4] text-[#5F6B70] border border-[#D9E1E2] shadow-sm text-[10px] font-medium">
                              <svg
                                className="w-3 h-3 opacity-70"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                                />
                              </svg>
                              {remark}
                            </div>
                          )}
                        </div>
                      )}
                      {log.productName}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="text-[#5F6B70]">{log.productId}</span>
                      <span className="text-[#B8C4C8]">|</span>
                      <span className="font-bold text-[#0057B8]">
                        ลอต: {log.lotNumber}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                    <div className="flex flex-col bg-[#F0F3F4]/80 p-2.5 rounded-xl border border-[#D9E1E2]">
                      <div className="mb-1">
                        <span className="text-[9px] text-[#0057B8] bg-[#EAF3FC] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          Initial
                        </span>
                      </div>
                      <span className="text-[13px] text-[#101820] font-bold">
                        {calculateDate(0)}
                      </span>
                    </div>
                    <div className="flex flex-col bg-[#F0F3F4]/80 p-2.5 rounded-xl border border-[#D9E1E2]">
                      <div className="mb-1">
                        <span className="text-[9px] text-[#0057B8] bg-[#EAF3FC] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          3 Months
                        </span>
                      </div>
                      <span className="text-[13px] text-[#101820] font-bold">
                        {calculateDate(3)}
                      </span>
                    </div>
                    <div className="flex flex-col bg-[#F0F3F4]/80 p-2.5 rounded-xl border border-[#D9E1E2]">
                      <div className="mb-1">
                        <span className="text-[9px] text-[#0057B8] bg-[#EAF3FC] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          6 Months
                        </span>
                      </div>
                      <span className="text-[13px] text-[#101820] font-bold">
                        {calculateDate(6)}
                      </span>
                    </div>
                    <div className="flex flex-col bg-[#F0F3F4]/80 p-2.5 rounded-xl border border-[#D9E1E2]">
                      <div className="mb-1">
                        <span className="text-[9px] text-[#0057B8] bg-[#EAF3FC] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          9 Months
                        </span>
                      </div>
                      <span className="text-[13px] text-[#101820] font-bold">
                        {calculateDate(9)}
                      </span>
                    </div>
                    <div className="flex flex-col bg-[#F0F3F4]/80 p-2.5 rounded-xl border border-[#D9E1E2] col-span-2">
                      <div className="mb-1">
                        <span className="text-[9px] text-[#0057B8] bg-[#EAF3FC] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          12 Months
                        </span>
                      </div>
                      <span className="text-[13px] text-[#101820] font-bold">
                        {calculateDate(12)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden xl:block overflow-x-auto">
          <table className="w-full text-[13px] text-left">
            <thead className="text-[11px] text-[#5F6B70] uppercase bg-[#F0F3F4]/50 border-b border-[#D9E1E2]">
              <tr>
                <th className="px-3 py-3 font-bold">วันที่บันทึก (Recorded)</th>
                <th className="px-3 py-3 font-bold">ล็อต (Lot)</th>
                <th className="px-3 py-3 font-bold max-w-[200px]">
                  สินค้า (Product)
                </th>
                <th className="px-3 py-3 font-bold text-center">
                  Initial (วันที่ผลิต)
                </th>
                <th className="px-3 py-3 font-bold text-center">3 Months</th>
                <th className="px-3 py-3 font-bold text-center">6 Months</th>
                <th className="px-3 py-3 font-bold text-center">9 Months</th>
                <th className="px-3 py-3 font-bold text-center">12 Months</th>
                <th className="px-3 py-3 font-bold text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E1E2]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-12 text-center text-[#8A9498] font-medium bg-[#F0F3F4]/30"
                  >
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const { intervals, completed, feedType, remark } =
                    parseLogData(log);
                  const calculateDate = (months: number) => {
                    if (!log.productionDate) return "-";

                    if (!intervals.includes(months))
                      return (
                        <span className="text-[#B8C4C8] font-normal">-</span>
                      );

                    const d = new Date(log.productionDate);
                    d.setMonth(d.getMonth() + months);
                    const dateStr = d.toISOString().split("T")[0];
                    const [year, month, day] = dateStr.split("-");
                    const thaiYear = parseInt(year) + 543;
                    const formattedDate = `${day}/${month}/${thaiYear}`;

                    if (completed.includes(months)) {
                      return (
                        <span className="flex items-center justify-center gap-1 text-[#101820] bg-[#E6F8F4] py-1 px-2 rounded-lg font-bold">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="3"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {formattedDate}
                        </span>
                      );
                    }
                    return formattedDate;
                  };

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-[#F0F3F4]/80 transition-colors group"
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-semibold text-[#101820]">
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleDateString(
                                "th-TH",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                },
                              )
                            : "-"}
                        </div>
                        <div className="text-[11px] text-[#5F6B70] flex items-center gap-1 mt-0.5">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleTimeString(
                                "th-TH",
                                { hour: "2-digit", minute: "2-digit" },
                              ) + " น."
                            : "-"}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold text-[#00263A] whitespace-nowrap">
                        {log.lotNumber}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#00263A]">
                          {(feedType || remark) && (
                            <div className="flex flex-wrap gap-1.5 mb-1">
                              {feedType && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FFF8D6] text-[#101820] border border-[#F1C400]/30 text-[10.5px] font-medium">
                                  <svg
                                    className="w-3 h-3 opacity-70"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                    />
                                  </svg>
                                  {feedType}
                                </span>
                              )}
                              {remark && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F0F3F4] text-[#5F6B70] border border-[#D9E1E2] text-[10.5px] font-medium">
                                  <svg
                                    className="w-3 h-3 opacity-70"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                                    />
                                  </svg>
                                  {remark}
                                </span>
                              )}
                            </div>
                          )}
                          {log.productName}
                        </div>
                        <div className="text-[11px] text-[#5F6B70] flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                          <span>{log.productId}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-[#101820] bg-[#E6F8F4]/40">
                        {calculateDate(0)}
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-[#101820]">
                        {calculateDate(3)}
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-[#101820] bg-[#E6F8F4]/40">
                        {calculateDate(6)}
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-[#101820]">
                        {calculateDate(9)}
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-[#101820] bg-[#E6F8F4]/40">
                        {calculateDate(12)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditLog(log)}
                            className="p-1.5 text-[#8A9498] hover:bg-[#EAF3FC] hover:text-[#0057B8] rounded-lg transition-colors"
                            title="แก้ไขรายการ"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log.id!)}
                            className="p-1.5 text-[#8A9498] hover:bg-[#FCEAEC] hover:text-[#C8102E] rounded-lg transition-colors"
                            title="ลบรายการนี้"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
