"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import {
  Layers,
  Download,
  CalendarDays,
  BarChart3,
  Play,
  MinusCircle,
  X,
  RotateCcw,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PAPER_TYPES } from "../constants/paperTypes";
import {
  generateDocument,
  generateMergedDocumentsToSingleDocx,
} from "@/lib/docxExport";
import PaperReportSkeleton from "./skeleton-loading-paper-report";
import { getSignatureStoragePath } from "@/lib/signatureStorage";

interface DashboardOrderGroup {
  id: string;
  department: string;
  lotName: string;
  productName: string;
  targetQty: number;
  sheetsNeeded: number;
  totalPrinted: number;
  excessQty: number;
  wasteQty: number;
  wasteA3: number;
  remarks: string[];
  productId: string;
  entries: any[];
}

export default function PaperReportPage() {
  const router = useRouter();
  const [accessStatus, setAccessStatus] = useState<
    "checking" | "allowed" | "denied"
  >("checking");
  const [printOrders, setPrintOrders] = useState<DashboardOrderGroup[]>([]);
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // States for Manual Deduct
  const [showManualModal, setShowManualModal] = useState(false);
  const [editReportId, setEditReportId] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  // States for Report Generation
  const [showReportModal, setShowReportModal] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportStartDate, setReportStartDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
  );
  const [reportEndDate, setReportEndDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
  );
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Accordion state
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});
  const toggleSection = (pt: string) => {
    setExpandedSections((prev) => ({ ...prev, [pt]: !prev[pt] }));
  };

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
      }
    };
    fetchUser();
  }, []);

  const [productsList, setProductsList] = useState<any[]>([]);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const actionLock = useRef(false);
  const editOriginalValues = useRef<Record<string, string>>({});
  const [mdProduct, setMdProduct] = useState("");
  const [mdPaperType, setMdPaperType] = useState(PAPER_TYPES[0]);
  const [mdQty, setMdQty] = useState("");
  const [mdGoodA3, setMdGoodA3] = useState("");
  const [mdTargetQty, setMdTargetQty] = useState("");
  const [mdWasteQty, setMdWasteQty] = useState("");
  const [mdWasteA3, setMdWasteA3] = useState("");
  const [mdRemarks, setMdRemarks] = useState("");
  const [mdWasteQtyRemark, setMdWasteQtyRemark] = useState("");
  const [mdWasteA3Remark, setMdWasteA3Remark] = useState("");
  const [mdLot, setMdLot] = useState("");
  const [mdDept, setMdDept] = useState("");
  const [mdProductSearch, setMdProductSearch] = useState("");
  const [showMdDropdown, setShowMdDropdown] = useState(false);

  useEffect(() => {
    if (mdProduct) {
      const prod = productsList.find((p) => p.id === mdProduct);
      if (prod && prod.qty_per_a3 > 0) {
        if (mdTargetQty || mdWasteQty) {
          const target = Number(mdTargetQty) || 0;
          const waste = Number(mdWasteQty) || 0;
          const sheets = Math.ceil((target + waste) / prod.qty_per_a3);
          setMdQty(sheets.toString());
        } else {
          setMdQty("");
        }
      }
    }
  }, [mdTargetQty, mdWasteQty, mdProduct, productsList]);

  const manualDeductCalc = useMemo(() => {
    const selectedProd = productsList.find((p) => p.id === mdProduct);
    const qtyPerA3 = selectedProd?.qty_per_a3 || 1;
    const target = Number(mdTargetQty) || 0;
    const wasteQty = Number(mdWasteQty) || 0;
    const wasteA3 = Number(mdWasteA3) || 0;
    const targetA3 = Number(mdQty) || 0;
    const extraGoodA3 = Number(mdGoodA3) || 0;
    const goodA3 = targetA3 + extraGoodA3;
    const totalA3 = goodA3 + wasteA3;
    const totalPrinted = qtyPerA3 > 0 ? goodA3 * qtyPerA3 : 0;
    const excessQty = Math.max(0, totalPrinted - target - wasteQty);

    // Breakdown: how many A3 for target only vs extra from waste pieces
    const baseA3 = qtyPerA3 > 0 ? Math.ceil(target / qtyPerA3) : targetA3;
    const extraA3FromWasteQty = Math.max(0, targetA3 - baseA3);

    return {
      qtyPerA3,
      target,
      wasteQty,
      wasteA3,
      goodA3,
      totalA3,
      totalPrinted,
      excessQty,
      baseA3,
      extraA3FromWasteQty,
    };
  }, [
    mdProduct,
    mdTargetQty,
    mdWasteQty,
    mdWasteA3,
    mdQty,
    mdGoodA3,
    productsList,
  ]);

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
          fetchOrders();
        } else {
          setAccessStatus("denied");
        }
      } catch {
        router.push("/login");
      }
    };
    checkAccess();
  }, []);

  const fetchOrders = async () => {
    setIsLoadingOrders(true);
    setOrdersError(null);
    try {
      const PAGE_SIZE = 1000;

      let allFgData: any[] = [];
      let fgFrom = 0;
      let fgHasMore = true;
      while (fgHasMore) {
        const { data } = await supabase
          .from("fgcode")
          .select("id, name, qty_per_a3, default_paper_type")
          .range(fgFrom, fgFrom + PAGE_SIZE - 1);
        if (data && data.length > 0) {
          allFgData = [...allFgData, ...data];
          fgFrom += PAGE_SIZE;
        } else {
          fgHasMore = false;
        }
      }

      const sorted = [...allFgData].sort((a, b) =>
        (a.name || "").localeCompare(b.name || ""),
      );
      setProductsList(sorted);

      const productMetaMap: Record<string, any> = {};
      allFgData.forEach((p: any) => {
        productMetaMap[p.id] = {
          qtyPerA3: p.qty_per_a3 || 1,
          paperType: p.default_paper_type || "ไม่ระบุ",
          name: p.name || "ไม่ทราบชื่อสินค้า",
        };
      });

      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("paper_reports")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allData = allData.concat(data);
          from += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      const groupedOrders = new Map<string, DashboardOrderGroup>();

      allData.forEach((o: any) => {
        const department = o.department
          ? o.department.split(" ")[0]
          : "หน่วยงานอื่นๆ";
        const lotName = o.lot_number || "N/A";
        const productId = o.product_id;
        const pt =
          o.paper_type || productMetaMap[productId]?.paperType || "ไม่ระบุ";
        const groupKey = `${department}-${lotName}-${productId}-${pt}`;

        const goodA3 = o.good_a3 || 0;
        const wasteA3 = o.waste_a3 || 0;
        const wasteQty = o.waste_qty || 0;

        const remarkW = o.waste_qty_remark
          ? String(o.waste_qty_remark).trim()
          : "";
        const remarkA3 = o.waste_a3_remark
          ? String(o.waste_a3_remark).trim()
          : "";
        const remarkGen = o.remark ? String(o.remark).trim() : "";

        const initialRemarks: string[] = [];
        if (remarkGen && remarkGen !== "ไม่มี" && remarkGen !== "-")
          initialRemarks.push(remarkGen);
        if (wasteQty > 0 && remarkW && remarkW !== "ไม่มี" && remarkW !== "-")
          initialRemarks.push(`ชิ้นเสีย: ${remarkW}`);
        if (wasteA3 > 0 && remarkA3 && remarkA3 !== "ไม่มี" && remarkA3 !== "-")
          initialRemarks.push(`A3เสีย: ${remarkA3}`);
        if (o.report_type === "MANUAL") initialRemarks.push(`(Manual Deduct)`);

        const qtyPerA3 =
          o.qty_per_a3_used || productMetaMap[productId]?.qtyPerA3 || 1;
        const productName =
          productMetaMap[productId]?.name || "ไม่ทราบชื่อสินค้า";

        const totalPrinted = goodA3 * qtyPerA3;
        const targetQty = o.target_qty || 0;
        const trueExcess = Math.max(0, totalPrinted - targetQty - wasteQty);

        const entry = {
          ...o,
          paper_type: pt,
          sheets_needed: goodA3 + wasteA3,
          date: o.created_at
            ? new Date(o.created_at).toLocaleDateString("en-CA", {
                timeZone: "Asia/Bangkok",
              })
            : "",
        };

        if (groupedOrders.has(groupKey)) {
          const existing = groupedOrders.get(groupKey)!;
          existing.targetQty += targetQty;
          existing.sheetsNeeded += goodA3 + wasteA3;
          existing.totalPrinted += totalPrinted;
          existing.excessQty += trueExcess;
          existing.wasteQty += wasteQty;
          existing.wasteA3 += wasteA3;
          existing.remarks.push(...initialRemarks);
          existing.entries.push(entry);
        } else {
          groupedOrders.set(groupKey, {
            id: groupKey,
            department: department,
            lotName: lotName,
            productName: productName,
            targetQty: targetQty,
            sheetsNeeded: goodA3 + wasteA3,
            totalPrinted: totalPrinted,
            excessQty: trueExcess,
            wasteQty: wasteQty,
            wasteA3: wasteA3,
            remarks: initialRemarks,
            productId: productId,
            entries: [entry],
          });
        }
      });

      const formattedOrders = Array.from(groupedOrders.values());
      setRawOrders(allData);
      setPrintOrders(formattedOrders);
    } catch (error: any) {
      console.error("Error fetching print orders:", error);
      setOrdersError("ไม่สามารถโหลดประวัติคำสั่งพิมพ์ได้: " + error.message);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  // --- Daily Summary (Today) ---
  const dailySummary = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Bangkok",
    });
    const byPaperType: Record<
      string,
      { sheetsUsed: number; sheetsGood: number; sheetsWaste: number }
    > = {};
    let totalSheets = 0;
    let totalGood = 0;
    let totalWaste = 0;

    printOrders.forEach((group) => {
      group.entries.forEach((entry: any) => {
        const entryDate = entry.date;
        if (entryDate === todayStr) {
          const sheets = entry.sheets_needed || 0;
          const waste = entry.waste_a3 || 0;
          totalSheets += sheets;
          totalGood += sheets - waste;
          totalWaste += waste;

          const pt = entry.paper_type || "ไม่ระบุ";
          if (!byPaperType[pt])
            byPaperType[pt] = { sheetsUsed: 0, sheetsGood: 0, sheetsWaste: 0 };
          byPaperType[pt].sheetsUsed += sheets;
          byPaperType[pt].sheetsGood += sheets - waste;
          byPaperType[pt].sheetsWaste += waste;
        }
      });
    });
    return { byPaperType, totalSheets, totalGood, totalWaste };
  }, [printOrders]);

  // --- Today's Orders Grouped by Paper Type ---
  const todayOrders = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Bangkok",
    });
    const grouped: Record<string, DashboardOrderGroup[]> = {};
    let totalTarget = 0;

    // Build meta map from state
    const metaMap: Record<string, any> = {};
    productsList.forEach((p) => {
      metaMap[p.id] = {
        qtyPerA3: p.qty_per_a3 || 1,
        paperType: p.default_paper_type || "ไม่ระบุ",
        name: p.name || "ไม่ทราบชื่อสินค้า",
      };
    });

    rawOrders.forEach((o: any) => {
      const entryDate = o.created_at
        ? new Date(o.created_at).toLocaleDateString("en-CA", {
            timeZone: "Asia/Bangkok",
          })
        : "";
      const isToday = entryDate === todayStr;
      if (isToday) {
        const department = o.department
          ? o.department.split(" ")[0]
          : "หน่วยงานอื่นๆ";
        const lotName = o.lot_number || "N/A";
        const productId = o.product_id;
        const pt = o.paper_type || metaMap[productId]?.paperType || "ไม่ระบุ";
        const productName = metaMap[productId]?.name || "ไม่ทราบชื่อสินค้า";
        const goodA3 = o.good_a3 || 0;
        const qtyPerA3 = o.qty_per_a3_used || metaMap[productId]?.qtyPerA3 || 1;
        const totalPrinted = goodA3 * qtyPerA3;
        const targetQty = o.target_qty || 0;
        const wasteA3 = o.waste_a3 || 0;
        const wasteQty = o.waste_qty || 0;
        const trueExcess = Math.max(0, totalPrinted - targetQty - wasteQty);

        const remarkW = o.waste_qty_remark
          ? String(o.waste_qty_remark).trim()
          : "";
        const remarkA3 = o.waste_a3_remark
          ? String(o.waste_a3_remark).trim()
          : "";
        const remarkGen = o.remark ? String(o.remark).trim() : "";
        const initialRemarks: string[] = [];
        if (remarkGen && remarkGen !== "ไม่มี" && remarkGen !== "-")
          initialRemarks.push(remarkGen);
        if (wasteQty > 0 && remarkW && remarkW !== "ไม่มี" && remarkW !== "-")
          initialRemarks.push(`ชิ้นเสีย: ${remarkW}`);
        if (wasteA3 > 0 && remarkA3 && remarkA3 !== "ไม่มี" && remarkA3 !== "-")
          initialRemarks.push(`A3เสีย: ${remarkA3}`);
        if (o.report_type === "MANUAL") initialRemarks.push(`(Manual Deduct)`);

        const orderGroup: DashboardOrderGroup = {
          id: o.id.toString(),
          department,
          lotName,
          productName,
          targetQty,
          sheetsNeeded: goodA3 + wasteA3,
          totalPrinted,
          excessQty: trueExcess,
          wasteQty,
          wasteA3,
          remarks: initialRemarks,
          productId,
          entries: [{ ...o, date: entryDate, paper_type: pt }],
        };

        if (!grouped[pt]) grouped[pt] = [];
        grouped[pt].push(orderGroup);
        totalTarget += targetQty;
      }
    });

    return { byPaperType: grouped, totalTarget };
  }, [rawOrders, productsList]);

  // --- Weekly Summary (Per Department) ---
  const weeklySummary = useMemo(() => {
    const summary: Record<
      string,
      {
        sheetsUsed: number;
        sheetsGood: number;
        sheetsWaste: number;
        targetQty: number;
        totalPrinted: number;
        wasteQty: number;
        excessQty: number;
      }
    > = {};
    const byPaperType: Record<
      string,
      { sheetsUsed: number; sheetsGood: number; sheetsWaste: number }
    > = {};

    printOrders.forEach((group) => {
      const dept = group.department || "หน่วยงานอื่นๆ";
      if (!summary[dept]) {
        summary[dept] = {
          sheetsUsed: 0,
          sheetsGood: 0,
          sheetsWaste: 0,
          targetQty: 0,
          totalPrinted: 0,
          wasteQty: 0,
          excessQty: 0,
        };
      }
      summary[dept].sheetsUsed += group.sheetsNeeded;
      summary[dept].sheetsGood += group.sheetsNeeded - group.wasteA3;
      summary[dept].sheetsWaste += group.wasteA3;
      summary[dept].targetQty += group.targetQty;
      summary[dept].totalPrinted += group.totalPrinted;
      summary[dept].wasteQty += group.wasteQty;
      summary[dept].excessQty += group.excessQty;

      group.entries.forEach((entry: any) => {
        const pt = entry.paper_type || "ไม่ระบุ";
        if (!byPaperType[pt])
          byPaperType[pt] = { sheetsUsed: 0, sheetsGood: 0, sheetsWaste: 0 };
        const sheets = entry.sheets_needed || 0;
        const waste = entry.waste_a3 || 0;
        byPaperType[pt].sheetsUsed += sheets;
        byPaperType[pt].sheetsGood += sheets - waste;
        byPaperType[pt].sheetsWaste += waste;
      });
    });
    return { byDept: summary, byPaperType };
  }, [printOrders]);

  // --- Daily Summary (By Date) ---
  const dailySummaryByDate = useMemo(() => {
    const summary: Record<
      string,
      {
        sheetsUsed: number;
        sheetsGood: number;
        sheetsWaste: number;
        targetQty: number;
        wasteQty: number;
        byPaperType: Record<string, number>;
      }
    > = {};

    printOrders.forEach((group) => {
      group.entries.forEach((entry: any) => {
        const date = entry.date;
        if (!date) return;
        if (!summary[date]) {
          summary[date] = {
            sheetsUsed: 0,
            sheetsGood: 0,
            sheetsWaste: 0,
            targetQty: 0,
            wasteQty: 0,
            byPaperType: {},
          };
        }
        const sheets = entry.sheets_needed || 0;
        const waste = entry.waste_a3 || 0;
        const pt = entry.paper_type || "ไม่ระบุ";
        const target = entry.target_qty || 0;
        const wasteQ = entry.waste_qty || 0;

        summary[date].sheetsUsed += sheets;
        summary[date].sheetsGood += sheets - waste;
        summary[date].sheetsWaste += waste;
        summary[date].targetQty += target;
        summary[date].wasteQty += wasteQ;

        if (!summary[date].byPaperType[pt]) summary[date].byPaperType[pt] = 0;
        summary[date].byPaperType[pt] += sheets;
      });
    });

    // Sort by date descending
    return Object.entries(summary).sort(([dateA], [dateB]) =>
      dateB.localeCompare(dateA),
    );
  }, [printOrders]);

  const closeManualModal = () => {
    setShowManualModal(false);
    setEditReportId(null);
    setEditOrderId(null);
    setMdProduct("");
    setMdProductSearch("");
    setMdPaperType(PAPER_TYPES[0]);
    setMdQty("");
    setMdGoodA3("");
    setMdTargetQty("");
    setMdWasteQty("");
    setMdWasteA3("");
    setMdRemarks("");
    setMdWasteQtyRemark("");
    setMdWasteA3Remark("");
    setMdLot("");
    setMdDept("");
  };

  const handleDeleteOrderGroup = async (group: DashboardOrderGroup) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "ยืนยันการลบ",
      text: `คุณต้องการลบรายการของ Lot: ${group.lotName} หรือไม่? (รายการที่เกี่ยวข้องจะถูกลบทั้งหมด)`,
      showCancelButton: true,
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#C8102E",
    });
    if (!result.isConfirmed) return;

    const idsToDelete = group.entries.map((e: any) => e.id);
    const orderIdsToDelete = group.entries
      .map((e: any) => e.order_id)
      .filter(Boolean);
    const allTxRefIds = [...idsToDelete, ...orderIdsToDelete];
    if (idsToDelete.length === 0) return;

    try {
      const { error: txErr } = await supabase
        .from("paper_transactions")
        .delete()
        .in("reference_id", allTxRefIds);
      if (txErr) console.error("Failed to delete tx:", txErr);

      const { error: repErr } = await supabase
        .from("paper_reports")
        .delete()
        .in("id", idsToDelete);
      if (repErr) throw repErr;

      Swal.fire({
        icon: "success",
        title: "สำเร็จ",
        text: "ลบรายการเรียบร้อยแล้ว",
        timer: 1500,
        showConfirmButton: false,
      });
      fetchOrders();
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: "ไม่สามารถลบรายการได้",
      });
    }
  };

  const openEditManualModal = (group: DashboardOrderGroup) => {
    // Pick MANUAL entry if exists, otherwise take the first entry (e.g. from dashboard)
    const manualEntry =
      group.entries.find((e: any) => e.report_type === "MANUAL") ||
      group.entries[0];
    if (!manualEntry) return;

    setEditReportId(manualEntry.id);
    setEditOrderId(manualEntry.order_id || null);
    setMdProduct(manualEntry.product_id || "");
    setMdPaperType(manualEntry.paper_type || PAPER_TYPES[0]);
    const prod = productsList.find((p) => p.id === manualEntry.product_id);

    let calculatedTargetA3 = manualEntry.target_a3 || 0;
    const targetQty = manualEntry.target_qty || 0;

    if (prod) {
      setMdProductSearch(`${prod.id} - ${prod.name || ""}`);
      setMdTargetQty(targetQty ? String(targetQty) : "");

      // Auto-calculate Target A3 if missing (for dashboard entries)
      if (!calculatedTargetA3 && targetQty > 0 && prod.qty_per_a3 > 0) {
        calculatedTargetA3 = Math.ceil(targetQty / prod.qty_per_a3);
      }
    } else {
      setMdProductSearch(manualEntry.product_id || "");
      setMdTargetQty(targetQty ? String(targetQty) : "");
    }

    setMdQty(calculatedTargetA3 > 0 ? String(calculatedTargetA3) : "");

    const totalGoodA3 = manualEntry.good_a3 || 0;
    const extraGoodA3 = Math.max(0, totalGoodA3 - calculatedTargetA3);
    setMdGoodA3(extraGoodA3 > 0 ? String(extraGoodA3) : "");

    setMdWasteA3(manualEntry.waste_a3 ? String(manualEntry.waste_a3) : "");
    setMdWasteQty(manualEntry.waste_qty ? String(manualEntry.waste_qty) : "");
    setMdWasteA3Remark(manualEntry.waste_a3_remark || "");
    setMdWasteQtyRemark(manualEntry.waste_qty_remark || "");
    setMdRemarks(manualEntry.remark || "");
    setMdLot(manualEntry.lot_number || "");
    setMdDept(manualEntry.department || "");
    // Store original values for change detection
    editOriginalValues.current = {
      product: manualEntry.product_id || "",
      paperType: manualEntry.paper_type || PAPER_TYPES[0],
      targetQty: targetQty ? String(targetQty) : "",
      qty: calculatedTargetA3 > 0 ? String(calculatedTargetA3) : "",
      goodA3: extraGoodA3 > 0 ? String(extraGoodA3) : "",
      wasteA3: manualEntry.waste_a3 ? String(manualEntry.waste_a3) : "",
      wasteQty: manualEntry.waste_qty ? String(manualEntry.waste_qty) : "",
      wasteA3Remark: manualEntry.waste_a3_remark || "",
      wasteQtyRemark: manualEntry.waste_qty_remark || "",
      remark: manualEntry.remark || "",
      lot: manualEntry.lot_number || "",
      dept: manualEntry.department || "",
    };

    setShowManualModal(true);
  };

  const handleManualDeduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true;
    try {
      if (!mdProduct || !mdLot || !mdDept) {
        Swal.fire(
          "ข้อมูลไม่ครบ",
          "กรุณาระบุเลขลอต หน่วยงาน และรหัสสินค้าให้ครบถ้วน",
          "warning",
        );
        return;
      }
      if (!mdTargetQty || Number(mdTargetQty) <= 0) {
        const confirm = await Swal.fire({
          title: "ไม่ได้ระบุจำนวนชิ้นที่สั่ง",
          text: "คุณแน่ใจหรือไม่ว่าต้องการบันทึกข้อมูลโดยไม่ระบุจำนวนชิ้นที่สั่ง?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: "#0057B8",
          cancelButtonColor: "#C8102E",
          confirmButtonText: "ดำเนินการต่อ",
          cancelButtonText: "กลับไปแก้ไข",
        });
        if (!confirm.isConfirmed) return;
      }

      if (!mdQty || Number(mdQty) <= 0) {
        const confirmA3 = await Swal.fire({
          title: "เป้าหมาย A3 เป็น 0",
          text: "ต้องการบันทึกการตัดสต็อคด้วยเป้าหมาย 0 ใบ A3 หรือไม่?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: "#0057B8",
          cancelButtonColor: "#C8102E",
          confirmButtonText: "ดำเนินการต่อ",
          cancelButtonText: "ยกเลิก",
        });
        if (!confirmA3.isConfirmed) return;
      }
      if ((Number(mdWasteQty) || 0) > 0 && !mdWasteQtyRemark.trim()) {
        Swal.fire(
          "ข้อมูลไม่ครบ",
          "มีชิ้นเสีย กรุณาระบุหมายเหตุชิ้นเสีย",
          "warning",
        );
        return;
      }
      if ((Number(mdWasteA3) || 0) > 0 && !mdWasteA3Remark.trim()) {
        Swal.fire(
          "ข้อมูลไม่ครบ",
          "มีกระดาษเสีย กรุณาระบุหมายเหตุกระดาษเสีย",
          "warning",
        );
        return;
      }

      // Check for no changes when editing
      if (editReportId) {
        const orig = editOriginalValues.current;
        const noChanges =
          mdProduct === orig.product &&
          mdPaperType === orig.paperType &&
          mdTargetQty === orig.targetQty &&
          mdQty === orig.qty &&
          (mdGoodA3 || "") === (orig.goodA3 || "") &&
          (mdWasteA3 || "") === (orig.wasteA3 || "") &&
          (mdWasteQty || "") === (orig.wasteQty || "") &&
          mdWasteA3Remark === orig.wasteA3Remark &&
          mdWasteQtyRemark === orig.wasteQtyRemark &&
          mdRemarks === orig.remark &&
          mdLot === orig.lot &&
          mdDept === orig.dept;
        if (noChanges) {
          Swal.fire({
            title: "ไม่มีการเปลี่ยนแปลง",
            text: "ข้อมูลยังคงเหมือนเดิม ไม่จำเป็นต้องบันทึก",
            icon: "info",
            confirmButtonText: "รับทราบ",
            confirmButtonColor: "#0057B8",
          });
          return;
        }
      }

      let previousUsed = 0;
      const targetTxRefId = editOrderId || editReportId;
      if (targetTxRefId) {
        const { data: prevTx } = await supabase
          .from("paper_transactions")
          .select("qty, transaction_type, paper_type")
          .eq("reference_id", targetTxRefId);

        if (prevTx) {
          prevTx.forEach((tx) => {
            if (tx.paper_type === mdPaperType) {
              if (tx.transaction_type === "OUT") previousUsed += tx.qty;
              if (tx.transaction_type === "IN") previousUsed -= tx.qty;
            }
          });
        }
      }

      const { data: stockData, error: stockErr } = await supabase
        .from("paper_transactions")
        .select("transaction_type, qty")
        .eq("paper_type", mdPaperType);

      if (!stockErr && stockData) {
        let totalIn = 0;
        let totalOut = 0;
        stockData.forEach((tx) => {
          if (tx.transaction_type === "IN") totalIn += tx.qty;
          else if (tx.transaction_type === "OUT") totalOut += tx.qty;
        });
        const currentStock = totalIn - totalOut + previousUsed;

        if (manualDeductCalc.totalA3 > currentStock) {
          Swal.fire({
            title: "กระดาษในสต็อคไม่พอ!",
            text: `ประเภทกระดาษ ${mdPaperType} คงเหลือ ${currentStock.toLocaleString()} ใบ (ต้องการใช้ ${manualDeductCalc.totalA3.toLocaleString()} ใบ)`,
            icon: "error",
            confirmButtonText: "รับทราบ",
            confirmButtonColor: "#C8102E",
          });
          return;
        }
      }

      const selectedProd = productsList.find((p) => p.id === mdProduct);
      const prodName = selectedProd?.name || "ไม่ทราบชื่อสินค้า";

      const confirm = await Swal.fire({
        title: editReportId
          ? "ยืนยันการแก้ไขข้อมูล"
          : "ยืนยันการตัดสต็อคกระดาษ (Manual)",
        html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6;">
            <p><strong>สินค้า:</strong> ${prodName}</p>
            <p><strong>ประเภทกระดาษ:</strong> ${mdPaperType}</p>
            <p><strong>Lot Number:</strong> ${mdLot}</p>
            <p><strong>หน่วยงาน:</strong> ${mdDept}</p>
            <hr style="margin: 10px 0;">
            <p><strong>เป้าหมายการผลิต:</strong> ${Number(mdTargetQty).toLocaleString()} ชิ้น</p>
            <p><strong>A3 ใช้ (รวมเสีย):</strong> ${manualDeductCalc.totalA3.toLocaleString()} ใบ</p>
            ${Number(mdGoodA3) > 0 ? `<p><strong>A3 ดีเพิ่มเติม:</strong> ${Number(mdGoodA3).toLocaleString()} ใบ</p>` : ""}
            ${Number(mdWasteA3) > 0 ? `<p><strong>A3 เสีย:</strong> ${Number(mdWasteA3).toLocaleString()} ใบ</p>` : ""}
            ${Number(mdWasteQty) > 0 ? `<p><strong>ชิ้นเสีย:</strong> ${Number(mdWasteQty).toLocaleString()} ชิ้น</p>` : ""}
        </div>
      `,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: editReportId ? "บันทึกการแก้ไข" : "ยืนยันบันทึก",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#0057B8",
        cancelButtonColor: "#C8102E",
      });

      if (!confirm.isConfirmed) return;

      setIsSubmittingManual(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("ไม่พบเซสชัน");

      const { data: userData } = await supabase
        .from("users")
        .select("name, department")
        .eq("id", session.user.id)
        .single();
      const userName = userData?.name || "ไม่ทราบชื่อ";

      let targetReportId = editOrderId || editReportId;

      if (editReportId) {
        const refIdsToDelete = editOrderId
          ? [editReportId, editOrderId]
          : [editReportId];
        await supabase
          .from("paper_transactions")
          .delete()
          .in("reference_id", refIdsToDelete);

        const { error: reportErr } = await supabase
          .from("paper_reports")
          .update({
            lot_number: mdLot,
            product_id: mdProduct,
            department: mdDept,
            paper_type: mdPaperType,
            target_qty: Number(mdTargetQty) || 0,
            target_a3: Number(mdQty) || 0,
            good_a3: manualDeductCalc.goodA3,
            waste_a3: Number(mdWasteA3) || 0,
            waste_qty: Number(mdWasteQty) || 0,
            waste_a3_remark: mdWasteA3Remark || null,
            waste_qty_remark: mdWasteQtyRemark || null,
            remark: mdRemarks || null,
          })
          .eq("id", editReportId);
        if (reportErr) throw reportErr;
      } else {
        const { data: newReport, error: reportErr } = await supabase
          .from("paper_reports")
          .insert({
            report_type: "MANUAL",
            lot_number: mdLot,
            product_id: mdProduct,
            department: mdDept,
            paper_type: mdPaperType,
            target_qty: Number(mdTargetQty) || 0,
            target_a3: Number(mdQty) || 0,
            good_a3: manualDeductCalc.goodA3,
            waste_a3: Number(mdWasteA3) || 0,
            waste_qty: Number(mdWasteQty) || 0,
            waste_a3_remark: mdWasteA3Remark || null,
            waste_qty_remark: mdWasteQtyRemark || null,
            remark: mdRemarks || null,
            created_by: userName,
          })
          .select()
          .single();
        if (reportErr) throw reportErr;
        targetReportId = newReport.id;
      }

      if (Number(mdQty) > 0) {
        const { error: txErr } = await supabase
          .from("paper_transactions")
          .insert({
            reference_id: targetReportId,
            transaction_type: "OUT",
            transaction_category: "GOOD",
            paper_type: mdPaperType,
            qty: Number(mdQty),
            created_by: userName,
            date: new Date().toLocaleDateString("en-CA", {
              timeZone: "Asia/Bangkok",
            }),
            description: `ตัดสต็อค Manual (ตั้งต้น) - ${prodName} ล็อต ${mdLot || "-"}`,
          });
        if (txErr) throw txErr;
      }

      if (Number(mdGoodA3) > 0) {
        const { error: txErr } = await supabase
          .from("paper_transactions")
          .insert({
            reference_id: targetReportId,
            transaction_type: "OUT",
            transaction_category: "GOOD",
            paper_type: mdPaperType,
            qty: Number(mdGoodA3),
            created_by: userName,
            date: new Date().toLocaleDateString("en-CA", {
              timeZone: "Asia/Bangkok",
            }),
            description: `ตัดสต็อค Manual (กระดาษดีเพิ่มเติม) - ${prodName} ล็อต ${mdLot || "-"}`,
          });
        if (txErr) throw txErr;
      }

      if (Number(mdWasteA3) > 0) {
        const { error: txErr } = await supabase
          .from("paper_transactions")
          .insert({
            reference_id: targetReportId,
            transaction_type: "OUT",
            transaction_category: "WASTE",
            paper_type: mdPaperType,
            qty: Number(mdWasteA3),
            created_by: userName,
            date: new Date().toLocaleDateString("en-CA", {
              timeZone: "Asia/Bangkok",
            }),
            description: `ตัดสต็อค Manual (กระดาษเสีย) - ${prodName} ล็อต ${mdLot || "-"}: ${mdWasteA3Remark || "-"}`,
          });
        if (txErr) throw txErr;
      }
      closeManualModal();
      fetchOrders();
    } catch (err: any) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setIsSubmittingManual(false);
      actionLock.current = false;
    }
  };

  const handleResetWeekly = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    try {
      const firstConfirm = await Swal.fire({
        title: "⚠️ รีเซ็ตข้อมูลประจำสัปดาห์",
        html: `
          <div style="text-align: left; font-size: 14px; line-height: 1.8;">
            <p>คุณกำลังจะ <strong style="color: #C8102E;">ลบข้อมูลทั้งหมด</strong> และ <strong style="color: #00B398;">ยกยอดสต็อคกระดาษใหม่</strong></p>
            <hr style="margin: 10px 0;">
            <p>⛔ สิ่งที่จะเกิดขึ้น:</p>
            <ul style="margin-left: 16px; list-style: disc;">
              <li>ลบประวัติตัดสต็อค Manual และแดชบอร์ดทั้งหมด</li>
              <li>ลบประวัติการรับเข้า-เบิกจ่ายกระดาษทั้งหมด</li>
              <li style="color: #00B398; font-weight: bold;">คำนวณและยกยอดคงเหลือปัจจุบันไปเป็นรายการรับเข้าใหม่ (ยกยอดมา)</li>
            </ul>
            <p style="color: #C8102E; margin-top: 8px;"><strong>การดำเนินการนี้ไม่สามารถย้อนคืนได้!</strong></p>
          </div>
        `,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "ยืนยันรีเซ็ตและยกยอด",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#C8102E",
        cancelButtonColor: "#5F6B70",
      });

      if (!firstConfirm.isConfirmed) return;

      const secondConfirm = await Swal.fire({
        title: "ยืนยันอีกครั้ง",
        text: "กรุณายืนยันอีกครั้งว่าต้องการลบข้อมูลทั้งหมดและยกยอดกระดาษใหม่",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "ดำเนินการเลย",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#C8102E",
        cancelButtonColor: "#5F6B70",
      });

      if (!secondConfirm.isConfirmed) return;

      Swal.fire({
        title: "กำลังดำเนินการ...",
        text: "โปรดรอสักครู่",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      // 1. คำนวณยอดคงเหลือกระดาษแต่ละประเภทปัจจุบัน
      const { data: allTxs, error: txFetchErr } = await supabase
        .from("paper_transactions")
        .select("paper_type, transaction_type, qty");
      if (txFetchErr) throw txFetchErr;

      const balances: Record<string, number> = {};
      if (allTxs) {
        allTxs.forEach((tx) => {
          const pt = tx.paper_type;
          if (!pt) return;
          if (!balances[pt]) balances[pt] = 0;
          if (tx.transaction_type === "IN") balances[pt] += tx.qty;
          else if (tx.transaction_type === "OUT") balances[pt] -= tx.qty;
        });
      }

      // 2. ลบข้อมูล paper_transactions ทั้งหมด
      const { error: delTxErr } = await supabase
        .from("paper_transactions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (delTxErr) throw delTxErr;

      // 3. ลบ paper_reports ทั้งหมด
      const { error: delReportErr } = await supabase
        .from("paper_reports")
        .delete()
        .gt("id", 0);
      if (delReportErr) throw delReportErr;

      // 4. บันทึกยกยอดคงเหลือ (เฉพาะกระดาษที่ยอดมากกว่า 0)
      const carryForwardInserts = Object.entries(balances)
        .filter(([_, balance]) => balance > 0)
        .map(([pt, balance]) => ({
          paper_type: pt,
          transaction_type: "IN",
          qty: balance,
          description: "ยกยอดสต็อคคงเหลือจากการรีเซ็ตประจำสัปดาห์",
          date: new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Bangkok",
          }),
        }));

      if (carryForwardInserts.length > 0) {
        const { error: insertErr } = await supabase
          .from("paper_transactions")
          .insert(carryForwardInserts);
        if (insertErr) throw insertErr;
      }

      await Swal.fire({
        title: "✅ รีเซ็ตและยกยอดสำเร็จ",
        text: "ลบข้อมูล Paper Reports ทั้งหมดเรียบร้อยแล้ว",
        icon: "success",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });

      fetchOrders();
    } catch (err: any) {
      Swal.fire(
        "เกิดข้อผิดพลาด",
        err.message || "ไม่สามารถรีเซ็ตข้อมูลได้",
        "error",
      );
    } finally {
      actionLock.current = false;
    }
  };

  const handleDownloadReport = async () => {
    if (!currentUser) {
      alert("ไม่พบข้อมูลผู้ใช้");
      return;
    }

    setIsReportLoading(true);
    try {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("signature_url")
        .eq("id", currentUser.id)
        .single();

      if (userError) {
        throw userError;
      }

      const storedSignature = userData?.signature_url || null;

      let signature_url: string | null = null;

      if (storedSignature) {
        // รองรับ public URL เดิมก่อน migration
        if (/^https?:\/\//i.test(storedSignature)) {
          signature_url = storedSignature;
        } else {
          const signaturePath = getSignatureStoragePath(storedSignature);

          if (signaturePath) {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("signatures")
                .createSignedUrl(signaturePath, 600);

            if (signedError) {
              throw signedError;
            }

            signature_url = signedData?.signedUrl || null;
          }
        }
      }

      if (!signature_url) {
        await Swal.fire({
          title: "บังคับใช้ลายเซ็น",
          text: 'คุณจำเป็นต้องมีลายเซ็นในระบบก่อนจึงจะสามารถออกรายงานได้ กรุณาติดต่อผู้ดูแลระบบ (Moderator) เพื่อเพิ่มลายเซ็นใน "หน้าจัดการผู้ใช้"',
          icon: "error",
          confirmButtonColor: "#0057B8",
          confirmButtonText: "ตกลง",
        });

        setIsReportLoading(false);
        return;
      }

      const start = new Date(reportStartDate);
      const end = new Date(reportEndDate);

      const dates = [];
      const current = new Date(start);
      while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }

      if (dates.length === 0) {
        alert(
          "กรุณาระบุช่วงวันที่ให้ถูกต้อง (วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น)",
        );
        setIsReportLoading(false);
        return;
      }

      const fullName =
        currentUser.user_metadata?.full_name || currentUser.email;

      if (dates.length === 1) {
        // ออกเอกสารแค่วันเดียว เป็นไฟล์ .docx
        const dateObj = dates[0];
        const dateStr = dateObj.toLocaleDateString("en-CA", {
          timeZone: "Asia/Bangkok",
        });
        const formattedDate = `${String(dateObj.getDate()).padStart(2, "0")}/${String(dateObj.getMonth() + 1).padStart(2, "0")}/${String(dateObj.getFullYear()).slice(-2)}`;

        const data = {
          name: fullName,
          date: formattedDate,
          "signature%": signature_url,
        };

        await generateDocument(
          "/templates/cleaning_report.docx",
          `Cleaning_Report_${dateStr}.docx`,
          data,
        );
      } else {
        // ออกเอกสารหลายวันรวมเป็นไฟล์เดียว .zip
        const records = dates.map((dateObj) => {
          const dateStr = dateObj.toLocaleDateString("en-CA", {
            timeZone: "Asia/Bangkok",
          });
          const formattedDate = `${String(dateObj.getDate()).padStart(2, "0")}/${String(dateObj.getMonth() + 1).padStart(2, "0")}/${String(dateObj.getFullYear()).slice(-2)}`;

          return {
            data: {
              name: fullName,
              date: formattedDate,
              "signature%": signature_url,
            },
          };
        });

        await generateMergedDocumentsToSingleDocx(
          "/templates/cleaning_report.docx",
          `Merged_Cleaning_Reports_${reportStartDate}_to_${reportEndDate}.docx`,
          records,
        );
      }
    } catch (error: any) {
      console.error(error);
      alert(
        "เกิดข้อผิดพลาดในการดาวน์โหลดเอกสาร (กรุณาตรวจสอบว่ามีไฟล์ cleaning_report.docx ในโฟลเดอร์ public/templates หรือไม่)\n" +
          error.message,
      );
    } finally {
      setIsReportLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsExporting(true);
    try {
      const ejWb = new ExcelJS.Workbook();
      ejWb.creator = "WorkTracker";
      ejWb.created = new Date();

      const allDates = printOrders
        .flatMap((g) => g.entries.map((e: any) => e.date as string))
        .filter(Boolean);
      const minDate = allDates.length
        ? allDates.reduce((a, b) => (a < b ? a : b))
        : null;
      const maxDate = allDates.length
        ? allDates.reduce((a, b) => (a > b ? a : b))
        : null;
      const fmtDate = (d: string) =>
        new Date(d).toLocaleDateString("th-TH", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      const orderDateRange =
        minDate && maxDate
          ? minDate === maxDate
            ? fmtDate(minDate)
            : `${fmtDate(minDate)} - ${fmtDate(maxDate)}`
          : "-";
      const todayTH = new Date().toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const addHeaderToSheet = (
        ws: ExcelJS.Worksheet,
        title: string,
        subtitleLabel: string,
        subtitleVal: string,
      ) => {
        const row = ws.getRow(1);
        row.values = [title, `${subtitleLabel}: ${subtitleVal}`];
        row.getCell(1).font = { bold: true, size: 12 };
        ws.addRow([]);
      };

      const { data: txAll } = await supabase
        .from("paper_transactions")
        .select("paper_type, transaction_type, qty, reference_id");

      const stockMap: Record<
        string,
        { totalIn: number; totalOutAllTime: number; thisWeekOut: number }
      > = {};
      (txAll || []).forEach((tx: any) => {
        const pt = tx.paper_type || "ไม่ระบุ";
        if (!stockMap[pt])
          stockMap[pt] = { totalIn: 0, totalOutAllTime: 0, thisWeekOut: 0 };
        if (tx.transaction_type === "IN") stockMap[pt].totalIn += tx.qty;
        else stockMap[pt].totalOutAllTime += tx.qty;
      });

      Object.entries(weeklySummary.byPaperType).forEach(([pt, data]) => {
        if (!stockMap[pt])
          stockMap[pt] = { totalIn: 0, totalOutAllTime: 0, thisWeekOut: 0 };
        stockMap[pt].thisWeekOut = data.sheetsUsed;
      });

      const stockRows = Object.entries(stockMap).map(([pt, s]) => ({
        ประเภทกระดาษ: pt,
        "รับเข้ารวม (ใบ)": s.totalIn,
        "ใช้ออกรวมสัปดาห์นี้ (ใบ)": s.thisWeekOut,
        "คงเหลือในระบบ (ใบ)": s.totalIn - s.totalOutAllTime,
      }));
      stockRows.push({
        ประเภทกระดาษ: "รวมทั้งหมด",
        "รับเข้ารวม (ใบ)": stockRows.reduce(
          (s, r) => s + (r["รับเข้ารวม (ใบ)"] as number),
          0,
        ),
        "ใช้ออกรวมสัปดาห์นี้ (ใบ)": stockRows.reduce(
          (s, r) => s + (r["ใช้ออกรวมสัปดาห์นี้ (ใบ)"] as number),
          0,
        ),
        "คงเหลือในระบบ (ใบ)": stockRows.reduce(
          (s, r) => s + (r["คงเหลือในระบบ (ใบ)"] as number),
          0,
        ),
      });

      const wsStock = ejWb.addWorksheet("สต็อคกระดาษ");
      addHeaderToSheet(wsStock, `สรุปยอดสต็อคกระดาษ A3`, `ณ วันที่`, todayTH);
      wsStock.columns = [
        { width: 20 },
        { width: 18 },
        { width: 22 },
        { width: 20 },
      ];
      const headerRowStock = wsStock.getRow(3);
      headerRowStock.values = [
        "ประเภทกระดาษ",
        "รับเข้ารวม (ใบ)",
        "ใช้ออกรวมสัปดาห์นี้ (ใบ)",
        "คงเหลือในระบบ (ใบ)",
      ];
      headerRowStock.font = { bold: true };
      stockRows.forEach((row) => {
        const r = wsStock.addRow([
          row["ประเภทกระดาษ"],
          row["รับเข้ารวม (ใบ)"],
          row["ใช้ออกรวมสัปดาห์นี้ (ใบ)"],
          row["คงเหลือในระบบ (ใบ)"],
        ]);
        if (row["ประเภทกระดาษ"] === "รวมทั้งหมด") r.font = { bold: true };
      });

      const weeklyRows = Object.entries(weeklySummary.byDept).map(
        ([dept, d]) => ({
          หน่วยงาน: dept,
          "ยอดสั่ง (ชิ้น)": d.targetQty,
          "A3 ใช้รวม (ใบ)": d.sheetsUsed,
          "A3 ดี (ใบ)": d.sheetsGood,
          "A3 เสีย (ใบ)": d.sheetsWaste,
          ชิ้นเสีย: d.wasteQty,
          "ส่วนเกิน (ชิ้น)": d.excessQty,
        }),
      );
      const wTotals = Object.values(weeklySummary.byDept);
      weeklyRows.push({
        หน่วยงาน: "รวมทั้งหมด",
        "ยอดสั่ง (ชิ้น)": wTotals.reduce((s, d) => s + d.targetQty, 0),
        "A3 ใช้รวม (ใบ)": wTotals.reduce((s, d) => s + d.sheetsUsed, 0),
        "A3 ดี (ใบ)": wTotals.reduce((s, d) => s + d.sheetsGood, 0),
        "A3 เสีย (ใบ)": wTotals.reduce((s, d) => s + d.sheetsWaste, 0),
        ชิ้นเสีย: wTotals.reduce((s, d) => s + d.wasteQty, 0),
        "ส่วนเกิน (ชิ้น)": wTotals.reduce((s, d) => s + d.excessQty, 0),
      });

      const ws1 = ejWb.addWorksheet("สรุปรายสัปดาห์");
      addHeaderToSheet(
        ws1,
        `สรุปยอดสั่งพิมพ์รายสัปดาห์`,
        `ช่วงวันที่`,
        orderDateRange,
      );
      ws1.columns = [
        { width: 20 },
        { width: 16 },
        { width: 18 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 18 },
      ];
      const headerRow1 = ws1.getRow(3);
      headerRow1.values = [
        "หน่วยงาน",
        "ยอดสั่ง (ชิ้น)",
        "A3 ใช้รวม (ใบ)",
        "A3 ดี (ใบ)",
        "A3 เสีย (ใบ)",
        "ชิ้นเสีย",
        "ส่วนเกิน (ชิ้น)",
      ];
      headerRow1.font = { bold: true };
      weeklyRows.forEach((row) => {
        const r = ws1.addRow([
          row["หน่วยงาน"],
          row["ยอดสั่ง (ชิ้น)"],
          row["A3 ใช้รวม (ใบ)"],
          row["A3 ดี (ใบ)"],
          row["A3 เสีย (ใบ)"],
          row["ชิ้นเสีย"],
          row["ส่วนเกิน (ชิ้น)"],
        ]);
        if (row["หน่วยงาน"] === "รวมทั้งหมด") r.font = { bold: true };
      });

      const buildDetailRows = (groups: typeof printOrders) => {
        const rows: Record<string, string | number>[] = groups.map((group) => ({
          หน่วยงาน: group.department || "-",
          Lot: group.lotName,
          สินค้า: group.productName,
          "เป้าหมาย (ชิ้น)": group.targetQty,
          "พิมพ์จริง (ชิ้น)": group.totalPrinted,
          "A3 ใช้ (ใบ)": group.sheetsNeeded,
          ชิ้นเสีย: group.wasteQty,
          "A3 เสีย (ใบ)": group.wasteA3,
          "ส่วนเกิน (ชิ้น)": group.excessQty,
          หมายเหตุ: group.remarks.join(", "),
        }));
        rows.push({
          หน่วยงาน: "รวมทั้งหมด",
          Lot: "",
          สินค้า: "",
          "เป้าหมาย (ชิ้น)": groups.reduce((s, g) => s + g.targetQty, 0),
          "พิมพ์จริง (ชิ้น)": groups.reduce((s, g) => s + g.totalPrinted, 0),
          "A3 ใช้ (ใบ)": groups.reduce((s, g) => s + g.sheetsNeeded, 0),
          ชิ้นเสีย: groups.reduce((s, g) => s + g.wasteQty, 0),
          "A3 เสีย (ใบ)": groups.reduce((s, g) => s + g.wasteA3, 0),
          "ส่วนเกิน (ชิ้น)": groups.reduce((s, g) => s + g.excessQty, 0),
          หมายเหตุ: "",
        });
        return rows;
      };

      const departments = [
        ...new Set(printOrders.map((g) => g.department || "-")),
      ].sort();
      departments.forEach((dept) => {
        const deptGroups = printOrders.filter(
          (g) => (g.department || "-") === dept,
        );
        const deptDates = deptGroups
          .flatMap((g) => g.entries.map((e: any) => e.date as string))
          .filter(Boolean);
        const dMin = deptDates.length
          ? deptDates.reduce((a, b) => (a < b ? a : b))
          : null;
        const dMax = deptDates.length
          ? deptDates.reduce((a, b) => (a > b ? a : b))
          : null;
        const deptRange =
          dMin && dMax
            ? dMin === dMax
              ? fmtDate(dMin)
              : `${fmtDate(dMin)} - ${fmtDate(dMax)}`
            : "-";

        const wsName = dept.substring(0, 31).replace(/[\/*?:\[\]]/g, "");
        const wsDept = ejWb.addWorksheet(wsName);

        addHeaderToSheet(
          wsDept,
          `รายละเอียดคำสั่งพิมพ์ — ${dept}`,
          `ช่วงวันที่`,
          deptRange,
        );
        wsDept.columns = [
          { width: 16 },
          { width: 14 },
          { width: 22 },
          { width: 16 },
          { width: 16 },
          { width: 14 },
          { width: 12 },
          { width: 14 },
          { width: 16 },
          { width: 28 },
        ];

        const headerRowDept = wsDept.getRow(3);
        headerRowDept.values = [
          "หน่วยงาน",
          "Lot",
          "สินค้า",
          "เป้าหมาย (ชิ้น)",
          "พิมพ์จริง (ชิ้น)",
          "A3 ใช้ (ใบ)",
          "ชิ้นเสีย",
          "A3 เสีย (ใบ)",
          "ส่วนเกิน (ชิ้น)",
          "หมายเหตุ",
        ];
        headerRowDept.font = { bold: true };

        const deptRows = buildDetailRows(deptGroups);
        deptRows.forEach((row: any) => {
          const r = wsDept.addRow([
            row["หน่วยงาน"],
            row["Lot"],
            row["สินค้า"],
            row["เป้าหมาย (ชิ้น)"],
            row["พิมพ์จริง (ชิ้น)"],
            row["A3 ใช้ (ใบ)"],
            row["ชิ้นเสีย"],
            row["A3 เสีย (ใบ)"],
            row["ส่วนเกิน (ชิ้น)"],
            row["หมายเหตุ"],
          ]);
          if (row["หน่วยงาน"] === "รวมทั้งหมด") r.font = { bold: true };
        });
      });

      const fileName = `WorkTracker_${minDate || todayTH}_${maxDate || todayTH}.xlsx`;

      const finalBuffer = await ejWb.xlsx.writeBuffer();
      const blob = new Blob([finalBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, fileName);
      Swal.fire({
        title: "สำเร็จ",
        text: "ดาวน์โหลดไฟล์ Excel เรียบร้อยแล้ว",
        icon: "success",
        confirmButtonText: "ตกลง",
        confirmButtonColor: "#0057B8",
      });
    } catch (error) {
      console.error(error);
      Swal.fire({
        title: "เกิดข้อผิดพลาด",
        text: "ไม่สามารถดาวน์โหลดไฟล์ Excel ได้",
        icon: "error",
        confirmButtonText: "ตกลง",
        confirmButtonColor: "#C8102E",
      });
    } finally {
      setIsExporting(false);
      actionLock.current = false;
    }
  };

  const getDepartmentStyle = (dept: string) => {
    if (dept === "ZT")
      return {
        solid: "bg-[#00B398]",
        light: "bg-[#E6F8F4]",
        text: "text-[#008C78]",
        accent: "border-[#00B398]",
      };
    if (dept === "13 ไร่")
      return {
        solid: "bg-[#0057B8]",
        light: "bg-[#EAF3FC]",
        text: "text-[#0057B8]",
        accent: "border-[#0057B8]",
      };
    return {
      solid: "bg-[#5F6B70]",
      light: "bg-[#F5F7F8]",
      text: "text-[#5F6B70]",
      accent: "border-[#B8C4C8]",
    };
  };

  const departmentsList = [
    ...new Set(printOrders.map((o) => o.department)),
  ].sort();

  if (accessStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8A9498] text-sm">
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }
  if (accessStatus === "denied") {
    return (
      <div className="min-h-screen bg-[#F5F7F8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-[#D9E1E2] p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-[#FCEAEC] text-[#C8102E] rounded-full flex items-center justify-center mx-auto mb-4">
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
          <h2 className="text-xl font-bold text-[#101820] mb-2">
            Access Denied
          </h2>
          <p className="text-[#5F6B70] text-sm mb-6">
            เฉพาะ Moderator และ Assistant Moderator
            เท่านั้นที่สามารถเข้าถึงรายงานนี้ได้
          </p>
          <button
            onClick={() => router.push("/printer/dashboard")}
            className="w-full bg-[#00263A] text-white rounded-lg py-2.5 font-medium hover:bg-[#004A9F] transition-colors"
          >
            กลับไปหน้าแรก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7F8] pb-20">
      {/* ── Page header ── */}
      <div className="bg-white/90 backdrop-blur-sm border-b border-[#D9E1E2] px-4 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#EAF3FC] flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-[#0057B8]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[#00263A] font-bold text-[16px] md:text-[18px] leading-tight tracking-wide truncate">
              สรุปการใช้กระดาษ A3 (เชิงลึก)
            </h1>
            <p className="text-[#8A9498] text-[12px] md:text-[13px] hidden sm:block truncate">
              วิเคราะห์ยอดการใช้กระดาษและของเสียรายแผนก / รายสัปดาห์
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowManualModal(true)}
            className="bg-[#C8102E] hover:bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
          >
            <MinusCircle className="w-3.5 h-3.5" /> ตัดสต็อค Manual
          </button>
          <button
            onClick={() => setShowReportModal(true)}
            className="bg-[#00AEC7] hover:bg-[#00AEC7] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" /> ออกรายงาน
          </button>
          <button
            onClick={handleExportExcel}
            className="bg-[#00B398] hover:bg-[#00B398] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
          <button
            onClick={handleResetWeekly}
            className="bg-[#F1C400] hover:bg-[#F1C400] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" /> รีเซ็ตสัปดาห์
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-5 max-w-6xl mx-auto space-y-5">
        {isLoadingOrders ? (
          <PaperReportSkeleton />
        ) : ordersError ? (
          <div className="text-center py-16 text-[#C8102E] text-sm bg-[#FCEAEC] rounded-2xl border border-[#C8102E]/15">
            {ordersError}
          </div>
        ) : printOrders.length === 0 ? (
          <div className="text-center py-16 text-[#8A9498] text-sm bg-white rounded-2xl border border-[#D9E1E2]">
            ยังไม่มีข้อมูลผลผลิตที่บันทึกไว้ในสัปดาห์นี้
          </div>
        ) : (
          <>
            {/* ── Daily Summary (New Layout) ── */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[18px]">📝</span>
                <h2 className="text-[16px] font-black text-[#00263A]">
                  รายการสั่งพิมพ์วันนี้{" "}
                  <span className="text-[#8A9498] font-normal text-[14px]">
                    (
                    {new Date().toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    )
                  </span>
                </h2>
              </div>

              {/* Total Today Card */}
              <div className="bg-white border border-[#D9E1E2] rounded-xl shadow-sm overflow-hidden mb-6">
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[#00B398]" />
                    <span className="font-bold text-[15px] text-[#101820]">
                      รวมทั้งหมดวันนี้
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 md:gap-6 text-[14px]">
                    <div className="text-[#5F6B70]">
                      เป้าหมาย{" "}
                      <span className="font-bold text-[#101820]">
                        {todayOrders.totalTarget.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[#0057B8]">
                      A3 ใช้{" "}
                      <span className="font-bold">
                        {dailySummary.totalSheets.toLocaleString()} ใบ
                      </span>
                    </div>
                    <div className="text-[#C8102E]">
                      A3 เสีย{" "}
                      <span className="font-bold">
                        {dailySummary.totalWaste.toLocaleString()} ใบ
                      </span>
                    </div>
                    <div className="text-[#A88700]">
                      ส่วนเกิน{" "}
                      <span className="font-bold">
                        {Object.values(todayOrders.byPaperType)
                          .flat()
                          .reduce((s, o) => s + o.excessQty, 0)
                          .toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                {Object.keys(todayOrders.byPaperType).length > 0 && (
                  <div className="bg-[#F5F7F8] border-t border-[#D9E1E2] p-4 flex flex-wrap gap-3">
                    {Object.entries(dailySummary.byPaperType).map(([pt, d]) => (
                      <div
                        key={pt}
                        className="bg-white border border-[#0057B8]/20 text-[#0057B8] text-[12px] px-3 py-1.5 rounded-full flex items-center gap-2 font-medium shadow-sm"
                      >
                        <div className="w-2 h-2 rounded-full bg-[#0057B8]"></div>
                        {pt}{" "}
                        <span className="font-bold text-[#0057B8]">
                          {d.sheetsUsed} ใบ
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Orders Grouped by Paper Type */}
              <div className="space-y-6">
                {Object.entries(todayOrders.byPaperType).length > 0 ? (
                  Object.entries(todayOrders.byPaperType).map(
                    ([pt, orders]) => {
                      const totalSheets = orders.reduce(
                        (s, o) => s + o.sheetsNeeded,
                        0,
                      );
                      const totalTarget = orders.reduce(
                        (s, o) => s + o.targetQty,
                        0,
                      );
                      const totalExcess = orders.reduce(
                        (s, o) => s + o.excessQty,
                        0,
                      );

                      return (
                        <div
                          key={pt}
                          className="bg-white border border-[#D9E1E2] rounded-xl shadow-sm overflow-hidden"
                        >
                          <div
                            className="bg-[#00AEC7] px-5 py-3 flex justify-between items-center text-white cursor-pointer hover:bg-[#00AEC7] transition-colors"
                            onClick={() => toggleSection(pt)}
                          >
                            <div className="flex items-center gap-2">
                              {expandedSections[pt] ? (
                                <ChevronDown className="w-5 h-5 text-white/80" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-white/80" />
                              )}
                              <Layers className="w-5 h-5 text-white/80" />
                              <h3 className="font-bold text-[15px]">
                                {pt}{" "}
                                <span className="font-normal text-[13px] opacity-80">
                                  ({orders.length} รายการ)
                                </span>
                              </h3>
                            </div>
                            <span className="bg-white/20 px-3 py-1 rounded-full text-[13px] font-bold shadow-sm">
                              {totalSheets.toLocaleString()} ใบ
                            </span>
                          </div>
                          {expandedSections[pt] && (
                            <>
                              <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[700px]">
                                  <thead>
                                    <tr className="border-b border-[#D9E1E2] bg-[#F5F7F8]/50">
                                      <th className="p-4 text-[12px] font-bold text-[#5F6B70]">
                                        หน่วยงาน
                                      </th>
                                      <th className="p-4 text-[12px] font-bold text-[#5F6B70]">
                                        LOT / สินค้า
                                      </th>
                                      <th className="p-4 text-[12px] font-bold text-[#5F6B70] text-center">
                                        เป้าหมาย
                                      </th>
                                      <th className="p-4 text-[12px] font-bold text-[#0057B8] text-center">
                                        A3 ใช้
                                      </th>
                                      <th className="p-4 text-[12px] font-bold text-[#C8102E] text-center">
                                        ชิ้นเสีย
                                      </th>
                                      <th className="p-4 text-[12px] font-bold text-[#C8102E] text-center">
                                        A3 เสีย
                                      </th>
                                      <th className="p-4 text-[12px] font-bold text-[#6E5B00] text-center">
                                        ส่วนเกิน
                                      </th>
                                      <th className="p-4 text-[12px] font-bold text-[#5F6B70] text-center">
                                        หมายเหตุ
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {orders.map((order) => (
                                      <tr
                                        key={order.id}
                                        className="border-b border-[#F0F3F4] hover:bg-[#F5F7F8]/50 transition-colors"
                                      >
                                        <td className="p-4 text-[14px] text-[#5F6B70]">
                                          {order.department}
                                        </td>
                                        <td className="p-4">
                                          <div className="font-bold text-[14px] text-[#101820]">
                                            {order.lotName}
                                          </div>
                                          <div className="text-[12px] text-[#8A9498] uppercase">
                                            {order.productName}
                                          </div>
                                        </td>
                                        <td className="p-4 text-center text-[14px] font-bold text-[#5F6B70]">
                                          {order.targetQty.toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center text-[14px] font-bold text-[#0057B8]">
                                          {order.sheetsNeeded.toLocaleString()}{" "}
                                          ใบ
                                        </td>
                                        <td className="p-4 text-center text-[14px] font-bold text-[#8A9498]">
                                          {order.wasteQty > 0 ? (
                                            <span className="text-[#C8102E]">
                                              {order.wasteQty}
                                            </span>
                                          ) : (
                                            "-"
                                          )}
                                        </td>
                                        <td className="p-4 text-center text-[14px] font-bold text-[#8A9498]">
                                          {order.wasteA3 > 0 ? (
                                            <span className="text-[#C8102E]">
                                              {order.wasteA3} ใบ
                                            </span>
                                          ) : (
                                            "-"
                                          )}
                                        </td>
                                        <td className="p-4 text-center text-[14px] font-bold text-[#8A9498]">
                                          {order.excessQty > 0 ? (
                                            <span className="text-[#A88700]">
                                              {order.excessQty}
                                            </span>
                                          ) : (
                                            "-"
                                          )}
                                        </td>
                                        <td className="p-4 text-[12px] text-[#5F6B70] text-center">
                                          <div className="flex flex-col items-center gap-1">
                                            {order.remarks.length > 0 ? (
                                              order.remarks.map((r, i) => (
                                                <span
                                                  key={i}
                                                  className="text-[10px] bg-[#F0F3F4] text-[#5F6B70] px-2 py-0.5 rounded"
                                                >
                                                  {r}
                                                </span>
                                              ))
                                            ) : (
                                              <span className="text-[#B8C4C8]">
                                                -
                                              </span>
                                            )}
                                            <div className="flex gap-1 mt-1">
                                              <button
                                                onClick={() =>
                                                  handleDeleteOrderGroup(order)
                                                }
                                                className="text-[10px] bg-[#FCEAEC] text-[#C8102E] hover:bg-[#FCEAEC] px-2 py-1 rounded transition-colors font-medium border border-[#C8102E]/20"
                                              >
                                                ลบ
                                              </button>
                                              <button
                                                onClick={() =>
                                                  openEditManualModal(order)
                                                }
                                                className="text-[10px] bg-[#EAF3FC] text-[#0057B8] hover:bg-[#EAF3FC] px-2 py-1 rounded transition-colors font-medium border border-[#0057B8]/20"
                                              >
                                                แก้ไขข้อมูล
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="bg-[#F5F7F8] border-t-2 border-[#D9E1E2]">
                                      <td
                                        colSpan={2}
                                        className="p-4 text-[13px] font-bold text-[#5F6B70] text-right"
                                      >
                                        รวม ({pt})
                                      </td>
                                      <td className="p-4 text-center text-[14px] font-bold text-[#5F6B70]">
                                        {totalTarget.toLocaleString()}
                                      </td>
                                      <td className="p-4 text-center text-[14px] font-bold text-[#0057B8]">
                                        {totalSheets.toLocaleString()} ใบ
                                      </td>
                                      <td className="p-4 text-center text-[14px] font-bold text-[#C8102E]">
                                        {orders.reduce(
                                          (s, o) => s + o.wasteQty,
                                          0,
                                        ) > 0
                                          ? orders.reduce(
                                              (s, o) => s + o.wasteQty,
                                              0,
                                            )
                                          : "-"}
                                      </td>
                                      <td className="p-4 text-center text-[14px] font-bold text-[#C8102E]">
                                        {orders.reduce(
                                          (s, o) => s + o.wasteA3,
                                          0,
                                        ) > 0
                                          ? `${orders.reduce((s, o) => s + o.wasteA3, 0)} ใบ`
                                          : "-"}
                                      </td>
                                      <td className="p-4 text-center text-[14px] font-bold text-[#A88700]">
                                        {totalExcess > 0 ? totalExcess : "-"}
                                      </td>
                                      <td></td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile View (Cards) */}
                              <div className="block md:hidden divide-y divide-gray-100">
                                {orders.map((order) => (
                                  <div
                                    key={order.id}
                                    className="p-4 bg-white hover:bg-[#F5F7F8] transition-colors"
                                  >
                                    <div className="flex justify-between items-start mb-3">
                                      <div>
                                        <div className="font-bold text-[14px] text-[#101820]">
                                          {order.lotName}
                                        </div>
                                        <div className="text-[12px] text-[#5F6B70] uppercase mt-0.5 leading-tight">
                                          {order.productName}
                                        </div>
                                      </div>
                                      <div className="text-right ml-2 shrink-0">
                                        <div className="text-[11px] font-bold text-[#5F6B70] bg-[#F0F3F4] px-2.5 py-1 rounded-md">
                                          {order.department}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 mt-3">
                                      <div className="bg-[#F5F7F8] p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#D9E1E2]">
                                        <span className="text-[11px] text-[#5F6B70] font-bold mb-0.5">
                                          เป้าหมาย
                                        </span>
                                        <span className="text-[14px] font-black text-[#5F6B70]">
                                          {order.targetQty.toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="bg-[#EAF3FC]/50 p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#0057B8]/15/50">
                                        <span className="text-[11px] text-[#0057B8] font-bold mb-0.5">
                                          A3 ใช้
                                        </span>
                                        <span className="text-[14px] font-black text-[#0057B8]">
                                          {order.sheetsNeeded.toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="bg-[#FFF8D6]/50 p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#F1C400]/15/50">
                                        <span className="text-[11px] text-[#6E5B00] font-bold mb-0.5">
                                          ส่วนเกิน
                                        </span>
                                        <span className="text-[14px] font-black text-[#6E5B00]">
                                          {order.excessQty > 0
                                            ? order.excessQty.toLocaleString()
                                            : "-"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                      <div className="bg-[#FCEAEC]/50 p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#C8102E]/15/50">
                                        <span className="text-[11px] text-[#C8102E] font-bold mb-0.5">
                                          ชิ้นเสีย
                                        </span>
                                        <span className="text-[14px] font-black text-[#9B0B23]">
                                          {order.wasteQty > 0
                                            ? order.wasteQty.toLocaleString()
                                            : "-"}
                                        </span>
                                      </div>
                                      <div className="bg-[#FCEAEC]/50 p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#C8102E]/15/50">
                                        <span className="text-[11px] text-[#C8102E] font-bold mb-0.5">
                                          A3 เสีย
                                        </span>
                                        <span className="text-[14px] font-black text-[#9B0B23]">
                                          {order.wasteA3 > 0
                                            ? order.wasteA3.toLocaleString()
                                            : "-"}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-[#F0F3F4] flex flex-wrap items-center gap-1.5">
                                      {order.remarks.map((r, i) => (
                                        <span
                                          key={i}
                                          className="text-[10px] bg-[#F0F3F4] text-[#5F6B70] px-2 py-1 rounded-md font-medium border border-[#D9E1E2]/60"
                                        >
                                          {r}
                                        </span>
                                      ))}
                                      <div className="flex gap-2 ml-auto">
                                        <button
                                          onClick={() =>
                                            handleDeleteOrderGroup(order)
                                          }
                                          className="text-[10px] bg-[#FCEAEC] text-[#C8102E] hover:bg-[#FCEAEC] px-2 py-1 rounded-md font-medium border border-[#C8102E]/20 transition-colors"
                                        >
                                          ลบ
                                        </button>
                                        <button
                                          onClick={() =>
                                            openEditManualModal(order)
                                          }
                                          className="text-[10px] bg-[#EAF3FC] text-[#0057B8] hover:bg-[#EAF3FC] px-2 py-1 rounded-md font-medium border border-[#0057B8]/20 transition-colors"
                                        >
                                          แก้ไขข้อมูล
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <div className="bg-[#F5F7F8] p-4 border-t border-[#D9E1E2]">
                                  <div className="font-bold text-[13px] text-[#5F6B70] mb-2">
                                    รวมทั้งหมด ({pt})
                                  </div>
                                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                                    <div className="flex justify-between items-center text-[12px]">
                                      <span className="text-[#5F6B70] font-medium">
                                        เป้าหมาย:
                                      </span>
                                      <span className="font-bold text-[#5F6B70]">
                                        {totalTarget.toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-[12px]">
                                      <span className="text-[#5F6B70] font-medium">
                                        A3 ใช้:
                                      </span>
                                      <span className="font-bold text-[#0057B8]">
                                        {totalSheets.toLocaleString()} ใบ
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-[12px]">
                                      <span className="text-[#5F6B70] font-medium">
                                        ชิ้นเสีย:
                                      </span>
                                      <span className="font-bold text-[#C8102E]">
                                        {orders.reduce(
                                          (s, o) => s + o.wasteQty,
                                          0,
                                        ) || "-"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-[12px]">
                                      <span className="text-[#5F6B70] font-medium">
                                        A3 เสีย:
                                      </span>
                                      <span className="font-bold text-[#C8102E]">
                                        {orders.reduce(
                                          (s, o) => s + o.wasteA3,
                                          0,
                                        )
                                          ? `${orders.reduce((s, o) => s + o.wasteA3, 0)} ใบ`
                                          : "-"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-[12px] col-span-2">
                                      <span className="text-[#5F6B70] font-medium">
                                        ส่วนเกิน:
                                      </span>
                                      <span className="font-bold text-[#A88700]">
                                        {totalExcess || "-"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    },
                  )
                ) : (
                  <div className="text-center py-8 text-[#8A9498] text-sm bg-white rounded-xl border border-[#D9E1E2]">
                    ไม่มีรายการสั่งพิมพ์ที่บันทึกแล้วในวันนี้
                  </div>
                )}
              </div>
            </div>

            {/* ── Weekly Summary (By Dept) ── */}
            <div className="mb-8">
              <h2 className="text-[15px] font-black text-[#00263A] mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#0057B8]" />{" "}
                สรุปยอดรายสัปดาห์แยกหน่วยงาน{" "}
                <span className="text-[#8A9498] font-normal text-[13px]">
                  (สัปดาห์ปัจจุบัน)
                </span>
              </h2>
              <div className="space-y-4">
                {Object.entries(weeklySummary.byDept).map(([dept, d]) => {
                  const style = getDepartmentStyle(dept);
                  const isExpanded = expandedSections[`week-dept-${dept}`];
                  return (
                    <div
                      key={dept}
                      className="rounded-xl overflow-hidden border border-[#D9E1E2] shadow-sm bg-[#F5F7F8]/50"
                    >
                      <div
                        className={`${style.solid} px-5 py-3 flex justify-between items-center text-white cursor-pointer`}
                        onClick={() => toggleSection(`week-dept-${dept}`)}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-white/80" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-white/80" />
                          )}
                          <h3 className="font-bold text-[15px]">{dept}</h3>
                        </div>
                        <span className="bg-white/20 px-3 py-1 rounded-full text-[13px] font-bold shadow-sm">
                          {d.sheetsUsed.toLocaleString()} ใบ
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="p-5 grid grid-cols-2 md:grid-cols-5 gap-6">
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              ยอดสั่ง
                            </div>
                            <div className="text-[16px] font-black text-[#00263A]">
                              {d.targetQty.toLocaleString()}{" "}
                              <span className="text-[12px] font-bold">
                                ชิ้น
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              A3 ดี
                            </div>
                            <div className="text-[16px] font-black text-[#008C78]">
                              {d.sheetsGood.toLocaleString()}{" "}
                              <span className="text-[12px] font-bold">ใบ</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              A3 เสีย
                            </div>
                            <div className="text-[16px] font-black text-[#C8102E]">
                              {d.sheetsWaste > 0
                                ? `${d.sheetsWaste.toLocaleString()} ใบ`
                                : "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              ชิ้นเสีย
                            </div>
                            <div className="text-[16px] font-black text-[#C8102E]">
                              {d.wasteQty > 0
                                ? `${d.wasteQty.toLocaleString()}`
                                : "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              ส่วนเกิน
                            </div>
                            <div className="text-[16px] font-black text-[#A88700]">
                              {d.excessQty > 0
                                ? d.excessQty.toLocaleString()
                                : "0"}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Total Card */}
                <div className="rounded-xl border border-[#D9E1E2] shadow-sm bg-[#F5F7F8] p-5 flex flex-col md:flex-row items-center justify-between mt-2">
                  <div className="font-bold text-[15px] text-[#00263A] mb-4 md:mb-0">
                    รวมทั้งหมด
                  </div>
                  <div className="flex flex-wrap items-center gap-4 md:gap-6">
                    <div className="text-[14px] text-[#5F6B70]">
                      ยอดสั่ง{" "}
                      <span className="font-black text-[#00263A]">
                        {Object.values(weeklySummary.byDept)
                          .reduce((s, d) => s + d.targetQty, 0)
                          .toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[14px] text-[#0057B8]">
                      A3 ใช้รวม{" "}
                      <span className="font-black">
                        {Object.values(weeklySummary.byDept)
                          .reduce((s, d) => s + d.sheetsUsed, 0)
                          .toLocaleString()}{" "}
                        ใบ
                      </span>
                    </div>
                    <div className="text-[14px] text-[#008C78]">
                      A3 ดี{" "}
                      <span className="font-black">
                        {Object.values(weeklySummary.byDept)
                          .reduce((s, d) => s + d.sheetsGood, 0)
                          .toLocaleString()}{" "}
                        ใบ
                      </span>
                    </div>
                    <div className="text-[14px] text-[#C8102E]">
                      A3 เสีย{" "}
                      <span className="font-black">
                        {Object.values(weeklySummary.byDept)
                          .reduce((s, d) => s + d.sheetsWaste, 0)
                          .toLocaleString()}{" "}
                        ใบ
                      </span>
                    </div>
                    <div className="text-[14px] text-[#A88700]">
                      ส่วนเกิน{" "}
                      <span className="font-black">
                        {Object.values(weeklySummary.byDept)
                          .reduce((s, d) => s + d.excessQty, 0)
                          .toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Daily Summary (By Date) ── */}
            <div className="mb-8">
              <h2 className="text-[15px] font-black text-[#00263A] mb-4 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-[#007E91]" />{" "}
                สรุปยอดรวมรายวัน{" "}
                <span className="text-[#8A9498] font-normal text-[13px]">
                  (เรียงตามวันที่)
                </span>
              </h2>
              <div className="space-y-4">
                {dailySummaryByDate.map(([date, d]) => {
                  const isExpanded = expandedSections[`daily-${date}`];
                  return (
                    <div
                      key={date}
                      className="rounded-xl overflow-hidden border border-[#D9E1E2] shadow-sm bg-white"
                    >
                      <div
                        className="bg-[#E5F8FB] border-b border-[#00AEC7]/15 px-5 py-3 flex justify-between items-center text-[#00263A] cursor-pointer"
                        onClick={() => toggleSection(`daily-${date}`)}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-[#007E91]/70" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-[#007E91]/70" />
                          )}
                          <h3 className="font-bold text-[15px]">
                            {new Date(date).toLocaleDateString("th-TH", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </h3>
                        </div>
                        <span className="bg-white text-[#007E91] px-3 py-1 rounded-full text-[13px] font-bold shadow-sm border border-[#00AEC7]/20">
                          ใช้รวม {d.sheetsUsed.toLocaleString()} ใบ
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="p-5 grid grid-cols-2 md:grid-cols-5 gap-6">
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              ยอดสั่งรวม
                            </div>
                            <div className="text-[16px] font-black text-[#00263A]">
                              {d.targetQty.toLocaleString()}{" "}
                              <span className="text-[12px] font-bold">
                                ชิ้น
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              A3 ดี
                            </div>
                            <div className="text-[16px] font-black text-[#008C78]">
                              {d.sheetsGood.toLocaleString()}{" "}
                              <span className="text-[12px] font-bold">ใบ</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              A3 เสีย
                            </div>
                            <div className="text-[16px] font-black text-[#C8102E]">
                              {d.sheetsWaste > 0
                                ? `${d.sheetsWaste.toLocaleString()} ใบ`
                                : "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              ชิ้นเสีย
                            </div>
                            <div className="text-[16px] font-black text-[#C8102E]">
                              {d.wasteQty > 0
                                ? `${d.wasteQty.toLocaleString()}`
                                : "-"}
                            </div>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-2">
                              แยกตามกระดาษ
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {Object.entries(d.byPaperType).map(
                                ([pt, qty]) => (
                                  <div
                                    key={pt}
                                    className="text-[13px] flex justify-between items-center bg-[#F5F7F8] px-2 py-1 rounded"
                                  >
                                    <span className="text-[#5F6B70]">{pt}</span>
                                    <span className="font-bold text-[#101820]">
                                      {qty.toLocaleString()} ใบ
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Weekly Summary (By Paper Type) ── */}
            <div className="mb-10">
              <h2 className="text-[15px] font-black text-[#00263A] mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#8A9498]" /> แยกตามประเภทกระดาษ{" "}
                <span className="text-[#8A9498] font-normal text-[13px]">
                  (สัปดาห์ปัจจุบัน)
                </span>
              </h2>
              <div className="space-y-4">
                {Object.entries(weeklySummary.byPaperType).map(([pt, d]) => {
                  const isExpanded = expandedSections[`week-paper-${pt}`];
                  return (
                    <div
                      key={pt}
                      className="rounded-xl overflow-hidden border border-[#D9E1E2] shadow-sm bg-[#F5F7F8]/50"
                    >
                      <div
                        className="bg-[#00AEC7] px-5 py-3 flex justify-between items-center text-white cursor-pointer"
                        onClick={() => toggleSection(`week-paper-${pt}`)}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-white/80" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-white/80" />
                          )}
                          <h3 className="font-bold text-[15px]">{pt}</h3>
                        </div>
                        <span className="bg-white/20 px-3 py-1 rounded-full text-[13px] font-bold shadow-sm">
                          {d.sheetsUsed.toLocaleString()} ใบ
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="p-5 grid grid-cols-2 gap-6">
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              A3 ดี
                            </div>
                            <div className="text-[16px] font-black text-[#008C78]">
                              {d.sheetsGood.toLocaleString()}{" "}
                              <span className="text-[12px] font-bold">ใบ</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-[#5F6B70] mb-1">
                              A3 เสีย
                            </div>
                            <div className="text-[16px] font-black text-[#C8102E]">
                              {d.sheetsWaste > 0
                                ? `${d.sheetsWaste.toLocaleString()} ใบ`
                                : "0 ใบ"}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Detailed Orders List (Grouped By Department) ── */}
            {departmentsList.length > 0 ? (
              departmentsList.map((dept) => {
                const deptOrders = printOrders.filter(
                  (o) => o.department === dept,
                );
                const style = getDepartmentStyle(dept);
                const totalSheets = deptOrders.reduce(
                  (sum, o) => sum + o.sheetsNeeded,
                  0,
                );
                const isExpanded = expandedSections[`detail-dept-${dept}`];

                return (
                  <div
                    key={dept}
                    className="mb-6 rounded-xl overflow-hidden border border-[#D9E1E2] shadow-sm bg-white"
                  >
                    {/* Header */}
                    <div
                      className={`${style.solid} px-4 py-3 flex justify-between items-center text-white cursor-pointer`}
                      onClick={() => toggleSection(`detail-dept-${dept}`)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-white/80" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-white/80" />
                        )}
                        <h3 className="font-bold text-[15px]">{dept}</h3>
                      </div>
                      <span className="bg-white/20 px-3 py-1 rounded-full text-[12px] font-bold shadow-sm">
                        {totalSheets.toLocaleString()} ใบ
                      </span>
                    </div>

                    {/* Table */}
                    {isExpanded && (
                      <>
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                              <tr className="border-b border-[#D9E1E2] bg-[#F5F7F8]/50">
                                <th className="p-4 text-[11px] font-bold text-[#5F6B70] uppercase">
                                  LOT: สินค้า
                                </th>
                                <th className="p-4 text-[11px] font-bold text-[#5F6B70] uppercase text-center">
                                  เป้ารวม
                                </th>
                                <th className="p-4 text-[11px] font-bold text-[#0057B8] uppercase text-center">
                                  A3 ใช้รวม
                                </th>
                                <th className="p-4 text-[11px] font-bold text-[#008C78] uppercase text-center">
                                  A3 ดีสะสม
                                </th>
                                <th className="p-4 text-[11px] font-bold text-[#6E5B00] uppercase text-center">
                                  ส่วนเกิน
                                </th>
                                <th className="p-4 text-[11px] font-bold text-[#C8102E] uppercase text-center">
                                  ของเสียสะสม
                                </th>
                                <th className="p-4 text-[11px] font-bold text-[#5F6B70] uppercase text-center">
                                  หมายเหตุ
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {deptOrders.map((order) => (
                                <tr
                                  key={order.id}
                                  className="border-b border-[#F0F3F4] hover:bg-[#F5F7F8]/50 transition-colors"
                                >
                                  <td className="p-4">
                                    <div className="flex items-start gap-2">
                                      <Play className="w-3 h-3 text-[#B8C4C8] fill-slate-300 mt-1 shrink-0" />
                                      <div>
                                        <div className="font-bold text-[13px] text-[#101820]">
                                          {order.lotName}
                                        </div>
                                        <div className="text-[11px] text-[#5F6B70] mt-0.5">
                                          {order.productName}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-4 text-center text-[13px] font-medium text-[#5F6B70]">
                                    {order.targetQty.toLocaleString()}
                                  </td>
                                  <td className="p-4 text-center text-[13px] font-bold text-[#0057B8]">
                                    {order.sheetsNeeded.toLocaleString()} ใบ
                                  </td>
                                  <td className="p-4 text-center text-[13px] font-bold text-[#00B398]">
                                    {(
                                      order.sheetsNeeded - order.wasteA3
                                    ).toLocaleString()}{" "}
                                    ใบ
                                  </td>
                                  <td className="p-4 text-center text-[13px] font-bold text-[#A88700]">
                                    {order.excessQty.toLocaleString()} ชิ้น
                                  </td>
                                  <td className="p-4 text-center text-[13px] font-bold text-[#C8102E]">
                                    {order.wasteQty > 0 || order.wasteA3 > 0 ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        {order.wasteQty > 0 && (
                                          <span>{order.wasteQty} ชิ้น</span>
                                        )}
                                        {order.wasteA3 > 0 && (
                                          <span>{order.wasteA3} ใบ</span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[#B8C4C8] font-normal">
                                        -
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-4 text-center text-[12px] text-[#5F6B70]">
                                    {order.remarks.length > 0 ? (
                                      <div className="flex flex-col items-center gap-1">
                                        {order.remarks.map((r, i) => (
                                          <span
                                            key={i}
                                            className="text-[10px] bg-[#F0F3F4] text-[#5F6B70] px-2 py-0.5 rounded"
                                          >
                                            {r}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-[#B8C4C8]">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile View (Cards) */}
                        <div className="block md:hidden divide-y divide-gray-100">
                          {deptOrders.map((order) => (
                            <div
                              key={order.id}
                              className="p-4 bg-white hover:bg-[#F5F7F8] transition-colors"
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-start gap-2">
                                  <Play className="w-3 h-3 text-[#B8C4C8] fill-slate-300 mt-1 shrink-0" />
                                  <div>
                                    <div className="font-bold text-[14px] text-[#101820]">
                                      {order.lotName}
                                    </div>
                                    <div className="text-[12px] text-[#5F6B70] uppercase mt-0.5 leading-tight">
                                      {order.productName}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 mt-3">
                                <div className="bg-[#F5F7F8] p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#D9E1E2]">
                                  <span className="text-[11px] text-[#5F6B70] font-bold mb-0.5">
                                    เป้ารวม
                                  </span>
                                  <span className="text-[14px] font-black text-[#5F6B70]">
                                    {order.targetQty.toLocaleString()}
                                  </span>
                                </div>
                                <div className="bg-[#EAF3FC]/50 p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#0057B8]/15/50">
                                  <span className="text-[11px] text-[#0057B8] font-bold mb-0.5">
                                    A3 ใช้รวม
                                  </span>
                                  <span className="text-[14px] font-black text-[#0057B8]">
                                    {order.sheetsNeeded.toLocaleString()} ใบ
                                  </span>
                                </div>
                                <div className="bg-[#E6F8F4]/50 p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#00B398]/15/50">
                                  <span className="text-[11px] text-[#008C78] font-bold mb-0.5">
                                    A3 ดีสะสม
                                  </span>
                                  <span className="text-[14px] font-black text-[#008C78]">
                                    {(
                                      order.sheetsNeeded - order.wasteA3
                                    ).toLocaleString()}{" "}
                                    ใบ
                                  </span>
                                </div>
                                <div className="bg-[#FFF8D6]/50 p-2.5 rounded-lg flex flex-col justify-center items-center border border-[#F1C400]/15/50">
                                  <span className="text-[11px] text-[#6E5B00] font-bold mb-0.5">
                                    ส่วนเกิน
                                  </span>
                                  <span className="text-[14px] font-black text-[#6E5B00]">
                                    {order.excessQty > 0
                                      ? order.excessQty.toLocaleString()
                                      : "-"}
                                  </span>
                                </div>
                                <div className="col-span-2 bg-[#FCEAEC]/50 p-2.5 rounded-lg flex justify-between items-center border border-[#C8102E]/15/50">
                                  <span className="text-[11px] text-[#C8102E] font-bold">
                                    ของเสียสะสม
                                  </span>
                                  <span className="text-[13px] font-black text-[#9B0B23]">
                                    {order.wasteQty > 0 || order.wasteA3 > 0 ? (
                                      <>
                                        {order.wasteQty > 0
                                          ? `${order.wasteQty} ชิ้น`
                                          : ""}{" "}
                                        {order.wasteQty > 0 && order.wasteA3 > 0
                                          ? "|"
                                          : ""}{" "}
                                        {order.wasteA3 > 0
                                          ? `${order.wasteA3} ใบ`
                                          : ""}
                                      </>
                                    ) : (
                                      "-"
                                    )}
                                  </span>
                                </div>
                              </div>

                              {order.remarks.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-[#F0F3F4] flex flex-wrap gap-1.5">
                                  {order.remarks.map((r, i) => (
                                    <span
                                      key={i}
                                      className="text-[10px] bg-[#F0F3F4] text-[#5F6B70] px-2 py-1 rounded-md font-medium border border-[#D9E1E2]/60"
                                    >
                                      {r}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-[#8A9498] text-sm">
                ไม่มีประวัติคำสั่งพิมพ์ที่บันทึกผลผลิตแล้ว
              </div>
            )}
          </>
        )}
      </div>

      {/* Manual Deduct Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#00263A]/35 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[#D9E1E2] flex justify-between items-center bg-[#F5F7F8] shrink-0">
              <h3 className="text-[16px] font-bold text-[#101820]">
                ตัดสต็อคกระดาษ Manual
              </h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-[#8A9498] hover:text-[#5F6B70] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={handleManualDeduct}
              className="flex flex-col overflow-hidden"
            >
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                      เลขลอต (Lot) <span className="text-[#C8102E]">*</span>
                    </label>
                    <input
                      type="text"
                      value={mdLot}
                      onChange={(e) => setMdLot(e.target.value)}
                      className={`w-full border rounded-lg p-2.5 text-[13px] focus:ring-2 ${mdLot ? "bg-[#E6F8F4] border-[#00B398]/20 text-[#003B32] focus:ring-emerald-500/20 focus:border-[#00B398]" : "border-[#C8102E]/20 text-[#9B0B23] bg-[#FCEAEC] focus:ring-rose-500/20 focus:border-[#C8102E]"}`}
                      placeholder="เช่น 123456"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                      หน่วยงาน <span className="text-[#C8102E]">*</span>
                    </label>
                    <select
                      value={mdDept}
                      onChange={(e) => setMdDept(e.target.value)}
                      className={`w-full border rounded-lg p-2.5 text-[13px] focus:ring-2 ${mdDept ? "bg-[#E6F8F4] border-[#00B398]/20 text-[#003B32] focus:ring-emerald-500/20 focus:border-[#00B398]" : "border-[#C8102E]/20 text-[#9B0B23] bg-[#FCEAEC] focus:ring-rose-500/20 focus:border-[#C8102E]"}`}
                    >
                      <option value="">-- เลือกหน่วยงาน --</option>
                      <option value="QA ประกันคุณภาพ">QA — ประกันคุณภาพ</option>
                      <option value="PD ฝ่ายผลิต">PD — ฝ่ายผลิต</option>
                      <option value="WH คลังสินค้า">WH — คลังสินค้า</option>
                      <option value="VD ผลิตยาสัตว์">VD — ผลิตยาสัตว์</option>
                      <option value="หน่วยงานอื่นๆ">หน่วยงานอื่นๆ</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                    รหัส/ชื่อสินค้า <span className="text-[#C8102E]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={mdProductSearch}
                      onChange={(e) => {
                        setMdProductSearch(e.target.value);
                        setShowMdDropdown(true);
                        if (!e.target.value) setMdProduct("");
                      }}
                      onFocus={() => setShowMdDropdown(true)}
                      placeholder="ค้นหาสินค้า..."
                      className={`w-full border rounded-lg p-2.5 text-[13px] focus:ring-2 pr-10 ${mdProductSearch ? "bg-[#E6F8F4] border-[#00B398]/20 text-[#003B32] focus:ring-emerald-500/20 focus:border-[#00B398]" : "border-[#C8102E]/20 text-[#9B0B23] bg-[#FCEAEC] focus:ring-rose-500/20 focus:border-[#C8102E]"}`}
                    />
                    {mdProductSearch && (
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
                            setMdProductSearch("");
                            setShowMdDropdown(false);
                            setMdProduct("");
                          }}
                          className="text-[#8A9498] hover:text-[#C8102E] p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {showMdDropdown && mdProductSearch.length > 0 && (
                      <div
                        className="absolute z-50 w-full mt-1 bg-white border border-[#D9E1E2] rounded-lg shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {productsList
                          .filter(
                            (p) =>
                              p.id
                                .toLowerCase()
                                .includes(mdProductSearch.toLowerCase()) ||
                              (p.name &&
                                p.name
                                  .toLowerCase()
                                  .includes(mdProductSearch.toLowerCase())),
                          )
                          .slice(0, 20)
                          .map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => {
                                if (
                                  !product.qty_per_a3 ||
                                  product.qty_per_a3 <= 0
                                ) {
                                  Swal.fire({
                                    title: "ข้อมูลไม่ครบถ้วน",
                                    text: "สินค้านี้ยังไม่มีข้อมูลจำนวนชิ้นต่อ A3 กรุณาไปเพิ่มข้อมูลที่หน้าข้อมูลสินค้าคงคลังก่อนทำรายการครับ",
                                    icon: "warning",
                                    confirmButtonText: "รับทราบ",
                                    confirmButtonColor: "#0057B8",
                                  });
                                  return;
                                }
                                setMdProduct(product.id);
                                setMdProductSearch(
                                  `${product.id} - ${product.name || ""}`,
                                );
                                setShowMdDropdown(false);
                                if (product.default_paper_type)
                                  setMdPaperType(product.default_paper_type);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[#F5F7F8] transition-colors"
                            >
                              <div className="font-bold text-[#0057B8] text-[12px]">
                                {product.id}
                              </div>
                              <div className="text-[#101820] text-[12px] truncate">
                                {product.name}
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  {showMdDropdown && (
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowMdDropdown(false)}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                    ประเภทกระดาษ <span className="text-[#C8102E]">*</span>
                  </label>
                  <select
                    value={mdPaperType}
                    onChange={(e) => setMdPaperType(e.target.value)}
                    className={`w-full border rounded-lg p-2.5 text-[13px] focus:ring-2 ${mdPaperType ? "bg-[#E6F8F4] border-[#00B398]/20 text-[#003B32] focus:ring-emerald-500/20 focus:border-[#00B398]" : "border-[#C8102E]/20 text-[#9B0B23] bg-[#FCEAEC] focus:ring-rose-500/20 focus:border-[#C8102E]"}`}
                  >
                    {PAPER_TYPES.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                      จำนวนชิ้นที่สั่ง{" "}
                      <span className="text-[#8A9498] font-normal">
                        (ถ้ามี)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={mdTargetQty}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (Number(val) < 0) val = "0";
                        setMdTargetQty(val);
                      }}
                      className={`w-full border rounded-lg p-2.5 text-[13px] focus:ring-2 ${mdTargetQty ? "bg-[#E6F8F4] border-[#00B398]/20 text-[#003B32] focus:ring-emerald-500/20 focus:border-[#00B398]" : "border-[#D9E1E2] text-[#101820] bg-white focus:ring-rose-500/20 focus:border-[#C8102E]"}`}
                      placeholder="ระบุจำนวนชิ้น..."
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                      เป้าหมาย (ใบ A3)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={mdQty}
                      readOnly={
                        (productsList.find((p) => p.id === mdProduct)
                          ?.qty_per_a3 || 0) > 0
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (Number(val) < 0) val = "0";
                        setMdQty(val);
                      }}
                      className={`w-full border border-[#D9E1E2] rounded-lg p-2.5 text-[13px] text-[#101820] focus:ring-2 focus:ring-rose-500/20 focus:border-[#C8102E] ${(productsList.find((p) => p.id === mdProduct)?.qty_per_a3 || 0) > 0 ? "bg-[#F0F3F4] cursor-not-allowed text-[#5F6B70]" : "bg-white"}`}
                      placeholder="คำนวณอัตโนมัติ"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                      A3 ดีเพิ่มเติม{" "}
                      <span className="text-[#8A9498] font-normal">
                        (ถ้ามี)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={mdGoodA3}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (Number(val) < 0) val = "0";
                        setMdGoodA3(val);
                      }}
                      className="w-full border border-[#D9E1E2] rounded-lg p-2.5 text-[13px] text-[#101820] bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-[#C8102E]"
                      placeholder="จำนวน A3 ดี"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                      A3 เสีย{" "}
                      <span className="text-[#8A9498] font-normal">
                        (ถ้ามี)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={mdWasteA3}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (Number(val) < 0) val = "0";
                        setMdWasteA3(val);
                      }}
                      className="w-full border border-[#D9E1E2] rounded-lg p-2.5 text-[13px] text-[#101820] bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-[#C8102E]"
                      placeholder="จำนวน A3 เสีย"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                      ชิ้นเสีย{" "}
                      <span className="text-[#8A9498] font-normal">
                        (ถ้ามี)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={mdWasteQty}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (Number(val) < 0) val = "0";
                        setMdWasteQty(val);
                      }}
                      className="w-full border border-[#D9E1E2] rounded-lg p-2.5 text-[13px] text-[#101820] bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-[#C8102E]"
                      placeholder="จำนวนชิ้นเสีย"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-[#5F6B70] mb-1.5">
                      หมายเหตุทั่วไป{" "}
                      <span className="text-[#8A9498] font-normal">
                        (ถ้ามี)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={mdRemarks}
                      onChange={(e) => setMdRemarks(e.target.value)}
                      className="w-full border border-[#D9E1E2] rounded-lg p-2.5 text-[13px] text-[#101820] bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-[#C8102E]"
                      placeholder="ระบุหมายเหตุ (ถ้ามี)"
                    />
                  </div>
                </div>
                {(Number(mdWasteQty) || 0) > 0 && (
                  <div>
                    <label
                      className={`block text-[13px] font-bold uppercase tracking-wider mb-1.5 ${!mdWasteQtyRemark.trim() ? "text-[#C8102E]" : "text-[#5F6B70]"}`}
                    >
                      หมายเหตุชิ้นเสีย{" "}
                      {!mdWasteQtyRemark.trim() && (
                        <span className="normal-case">*</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={mdWasteQtyRemark}
                      onChange={(e) => setMdWasteQtyRemark(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-lg text-[13px] text-[#101820] font-medium focus:outline-none transition-colors ${
                        !mdWasteQtyRemark.trim()
                          ? "bg-[#FCEAEC] border-2 border-[#C8102E]/30 focus:border-[#C8102E] focus:ring-2 focus:ring-red-500/20"
                          : "bg-white border border-[#D9E1E2] focus:bg-white focus:border-[#0057B8] focus:ring-2 focus:ring-blue-500/10"
                      }`}
                      placeholder="เช่น สีเพี้ยน"
                    />
                    {!mdWasteQtyRemark.trim() && (
                      <p className="mt-1 text-[11px] text-[#C8102E] font-medium">
                        มีชิ้นเสีย — กรุณาระบุหมายเหตุ
                      </p>
                    )}
                  </div>
                )}
                {(Number(mdWasteA3) || 0) > 0 && (
                  <div>
                    <label
                      className={`block text-[13px] font-bold uppercase tracking-wider mb-1.5 ${!mdWasteA3Remark.trim() ? "text-[#C8102E]" : "text-[#5F6B70]"}`}
                    >
                      หมายเหตุกระดาษเสีย{" "}
                      {!mdWasteA3Remark.trim() && (
                        <span className="normal-case">*</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={mdWasteA3Remark}
                      onChange={(e) => setMdWasteA3Remark(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-lg text-[13px] text-[#101820] font-medium focus:outline-none transition-colors ${
                        !mdWasteA3Remark.trim()
                          ? "bg-[#FCEAEC] border-2 border-[#C8102E]/30 focus:border-[#C8102E] focus:ring-2 focus:ring-red-500/20"
                          : "bg-white border border-[#D9E1E2] focus:bg-white focus:border-[#0057B8] focus:ring-2 focus:ring-blue-500/10"
                      }`}
                      placeholder="เช่น กระดาษยับตอนป้อนเครื่อง"
                    />
                    {!mdWasteA3Remark.trim() && (
                      <p className="mt-1 text-[11px] text-[#C8102E] font-medium">
                        มีกระดาษเสีย — กรุณาระบุหมายเหตุ
                      </p>
                    )}
                  </div>
                )}

                {(manualDeductCalc.totalA3 > 0 ||
                  manualDeductCalc.target > 0 ||
                  Number(mdQty) > 0) && (
                  <div className="bg-[#E6F8F4] border border-[#00B398]/20 rounded-xl p-3 flex flex-col gap-1.5 text-[12.5px]">
                    <div className="flex justify-between">
                      <span className="text-[#5F6B70]">
                        อัตราส่วน (ชิ้น/A3)
                      </span>
                      <span className="font-bold text-[#5F6B70]">
                        {manualDeductCalc.qtyPerA3} ชิ้น
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5F6B70]">
                        จำนวนที่พิมพ์ได้จริง (ชิ้น)
                      </span>
                      <span className="font-bold text-[#5F6B70]">
                        {manualDeductCalc.totalPrinted.toLocaleString()} ชิ้น
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span
                        className={
                          manualDeductCalc.excessQty > 0
                            ? "text-[#6E5B00]"
                            : "text-[#5F6B70]"
                        }
                      >
                        ส่วนเกิน (ชิ้น)
                      </span>
                      <span
                        className={`font-black ${manualDeductCalc.excessQty > 0 ? "text-[#6E5B00]" : "text-[#5F6B70]"}`}
                      >
                        {manualDeductCalc.excessQty.toLocaleString()} ชิ้น
                      </span>
                    </div>

                    {manualDeductCalc.wasteQty > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#C8102E]">
                          ชิ้นเสีย (Waste Qty)
                        </span>
                        <span className="font-black text-[#C8102E]">
                          {manualDeductCalc.wasteQty.toLocaleString()} ชิ้น
                        </span>
                      </div>
                    )}

                    <div className="border-t border-[#00B398]/20/60 my-1"></div>

                    {/* A3 Breakdown */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-[#0057B8] font-medium">
                          A3 ตั้งต้น (เป้าหมาย)
                        </span>
                        <span className="font-bold text-[#0057B8]">
                          {manualDeductCalc.baseA3.toLocaleString()} ใบ
                        </span>
                      </div>
                      {manualDeductCalc.extraA3FromWasteQty > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[#C8102E] font-medium">
                            + A3 เพิ่มจากชิ้นเสีย ({manualDeductCalc.wasteQty}{" "}
                            ชิ้น)
                          </span>
                          <span className="font-bold text-[#C8102E]">
                            +
                            {manualDeductCalc.extraA3FromWasteQty.toLocaleString()}{" "}
                            ใบ
                          </span>
                        </div>
                      )}
                      {Number(mdGoodA3) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[#00AEC7] font-medium">
                            + A3 ดีเพิ่มเติม
                          </span>
                          <span className="font-bold text-[#00AEC7]">
                            +{Number(mdGoodA3).toLocaleString()} ใบ
                          </span>
                        </div>
                      )}
                      {manualDeductCalc.wasteA3 > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[#C8102E] font-medium">
                            + A3 เสีย (กระดาษเสีย)
                          </span>
                          <span className="font-bold text-[#C8102E]">
                            +{manualDeductCalc.wasteA3.toLocaleString()} ใบ
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-[#00B398]/30 my-0.5"></div>

                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[#008C78] font-bold">
                        รวมตัดสต็อคกระดาษ (ใบ A3)
                      </span>
                      <span className="text-lg font-black text-[#008C78]">
                        {manualDeductCalc.totalA3.toLocaleString()} ใบ
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-[#D9E1E2] bg-white shrink-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 px-4 py-2.5 border border-[#D9E1E2] text-[#5F6B70] rounded-xl text-[13px] font-bold hover:bg-[#F5F7F8] transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="flex-1 px-4 py-2.5 bg-[#C8102E] text-white rounded-xl text-[13px] font-bold hover:bg-[#C8102E] transition-colors disabled:opacity-50"
                >
                  {isSubmittingManual ? "กำลังบันทึก..." : "บันทึกตัดสต็อค"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Report Generation Modal ── */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#00263A]/35 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-slide-up relative">
            <div className="px-6 py-4 border-b border-[#D9E1E2] flex justify-between items-center bg-[#F5F7F8] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3FC] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-[#0057B8]" />
                </div>
                <h3 className="text-[16px] font-bold text-[#101820]">
                  ออกรายงานทำความสะอาดเครื่องพิมพ์
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-[#8A9498] hover:text-[#5F6B70] hover:bg-slate-200/50 p-1.5 rounded-lg transition-colors"
                disabled={isReportLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="bg-[#EAF3FC]/50 border border-[#0057B8]/15 rounded-xl p-4 mb-5">
                <p className="text-[#5F6B70] text-[13px] leading-relaxed">
                  ดาวน์โหลดรายงานการทำความสะอาดประจำสัปดาห์เป็นไฟล์ Word (.docx)
                  ระบบจะแนบลายเซ็นของคุณลงในไฟล์อัตโนมัติ (หากตั้งค่าไว้) <br />
                  <span className="text-[#0057B8]/80 font-medium">
                    *(หากเลือกวันที่มากกว่า 1 วัน จะดาวน์โหลดเป็นไฟล์ .zip
                    อัตโนมัติ)
                  </span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1 w-full flex flex-col gap-1.5">
                  <label className="text-[13px] font-bold text-[#5F6B70]">
                    วันที่เริ่มต้น (จาก)
                  </label>
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D9E1E2] rounded-lg text-[13px] text-[#5F6B70] focus:outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-blue-500/20 cursor-pointer transition-all shadow-sm"
                  />
                </div>
                <div className="flex-1 w-full flex flex-col gap-1.5">
                  <label className="text-[13px] font-bold text-[#5F6B70]">
                    วันที่สิ้นสุด (ถึง)
                  </label>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D9E1E2] rounded-lg text-[13px] text-[#5F6B70] focus:outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-blue-500/20 cursor-pointer transition-all shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="bg-[#F5F7F8] border-t border-[#D9E1E2] p-4 shrink-0 flex justify-end gap-3 sticky bottom-0">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 bg-white border border-[#D9E1E2] text-[#5F6B70] rounded-lg text-[13px] font-semibold hover:bg-[#F5F7F8] hover:text-[#101820] transition-colors shadow-sm"
                disabled={isReportLoading}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDownloadReport}
                className="px-5 py-2 bg-[#00263A] hover:bg-[#00263A] text-white rounded-lg text-[13px] font-semibold transition-all flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isReportLoading}
              >
                {isReportLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    กำลังสร้างเอกสาร...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    ดาวน์โหลดเอกสาร
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
