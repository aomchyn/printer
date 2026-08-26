"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import { useRouter } from "next/navigation";
import {
  Check,
  Undo,
  Edit2,
  Trash2,
  UserCircle,
  CheckCircle2,
  Clock,
  X,
  Printer,
  FileQuestion,
  Search,
  Copy,
  Layers,
  ArrowUp,
  ChevronDown,
} from "lucide-react";
import EditHistory from "../components/EditHistory";
import { DashboardSkeleton } from "./loading-skeleton";
import Modal from "../components/Modal";
import {
  calculateProductExpiryDate,
  parseProductShelfLifeMonths,
  type ActualExpiryOffsetDays,
} from "@/lib/productDate";
import {
  formatProductDate,
  renderPrintingTemplate,
  type ProductPrintingConfig,
  validatePrintingConfig,
} from "@/lib/productPrinting";

const AppSwal = Swal.mixin({
  confirmButtonColor: "#0057B8",
  cancelButtonColor: "#75787B",
  confirmButtonText: "รับทราบ",
});
export interface OrderInterface {
  id: number;
  order_date: string;
  order_time: string;
  order_datetime: string;
  order_type?: string;
  lot_number: string;
  product_id: string;
  product_name: string;
  product_exp: string;
  expiry_offset_days_used?: unknown;
  printing_config_used?: unknown;
  production_date: string;
  expiry_date: string;
  quantity: number;
  notes?: string;
  created_by: string;
  created_by_user_id?: string | null;
  created_by_department?: string;
  is_verified: boolean;
  is_printed?: boolean;
  verified_by?: string | null;
  verified_by_user_id?: string | null;
  verified_at?: string | null;
  image_url?: string | null;
  created_at: string;
  updated_at?: string | null;
  updated_by?: string | null;
  edit_summary?: string | null;
  is_cancelled?: boolean;
  is_no_file?: boolean;
  original_product_name?: string;
  printed_by?: string | null; // ✅ ชื่อผู้พิมพ์
  printed_by_user_id?: string | null; // ✅ UUID ผู้พิมพ์ (ใช้เช็คสิทธิ์)
  printed_at?: string | null; // ✅ เวลาที่พิมพ์
  previous_product_name?: string | null;
  paper_type?: string | null;
  good_a3?: number | null;
  waste_qty?: number | null;
  waste_qty_remark?: string | null;
  waste_a3?: number | null;
  waste_a3_remark?: string | null;
  reconciled_by?: string | null;
  reconciled_at?: string | null;
  qty_per_a3_used?: number | null;
  target_a3?: number | null;
}

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type CanonicalSnapshotValidation =
  | { valid: true; actualExpiryOffsetDays: ActualExpiryOffsetDays }
  | { valid: false; message: string };

type PrintingSnapshotValidation =
  | { valid: true; config: ProductPrintingConfig }
  | { valid: false; message: string };

type OrderPrintingDisplay =
  | { state: "invalid_config" }
  | { state: "not_configured" }
  | { state: "incomplete"; formatDescription: string }
  | { state: "unavailable"; formatDescription: string }
  | { state: "ready"; formatDescription: string; text: string };

const PRINTING_PRESET_LABELS: Record<
  NonNullable<ProductPrintingConfig>["preset"],
  string
> = {
  date_only: "วันที่ผลิตอย่างเดียว",
  date_and_lot: "วันที่ผลิต + LOT",
  mfg_exp: "MFG + EXP",
  mfg_exp_lot: "MFG + EXP + LOT",
  mfg_exp_unlabeled: "MFG + EXP ไม่มี label",
  custom: "กำหนดรูปแบบเอง",
};

function isActualExpiryOffsetDays(
  value: unknown,
): value is ActualExpiryOffsetDays {
  return value === 0 || value === -1;
}

function validateCanonicalSnapshot(
  order: Pick<OrderInterface, "product_exp" | "expiry_offset_days_used">,
): CanonicalSnapshotValidation {
  if (typeof order.product_exp !== "string") {
    return {
      valid: false,
      message: "อายุผลิตภัณฑ์ของ Order นี้ไม่ถูกต้อง จึงไม่สามารถคำนวณวันหมดอายุใหม่ได้",
    };
  }

  try {
    parseProductShelfLifeMonths(order.product_exp);
  } catch {
    return {
      valid: false,
      message: "อายุผลิตภัณฑ์ของ Order นี้ไม่ถูกต้อง จึงไม่สามารถคำนวณวันหมดอายุใหม่ได้",
    };
  }

  if (!isActualExpiryOffsetDays(order.expiry_offset_days_used)) {
    return {
      valid: false,
      message: "รูปแบบวันหมดอายุของ Order นี้ไม่ถูกต้อง จึงไม่สามารถคำนวณวันหมดอายุใหม่ได้",
    };
  }

  return {
    valid: true,
    actualExpiryOffsetDays: order.expiry_offset_days_used,
  };
}

function validatePrintingSnapshot(
  value: unknown,
): PrintingSnapshotValidation {
  const validation = validatePrintingConfig(value);
  if (!validation.valid) {
    return {
      valid: false,
      message: "รูปแบบการพิมพ์ของ Order นี้ไม่ถูกต้อง จึงไม่สามารถสร้างตัวอย่างการพิมพ์ได้",
    };
  }

  return { valid: true, config: value as ProductPrintingConfig };
}

function describeSnapshotPrintingFormat(
  config: NonNullable<ProductPrintingConfig>,
): string {
  const mfgPattern = config.template.includes("{MFG_DATE}")
    ? config.mfg_format?.pattern
    : null;
  const expPattern = config.template.includes("{EXP_DATE}")
    ? config.exp_format?.pattern
    : null;

  if (mfgPattern && expPattern) {
    return `MFG: ${mfgPattern}\nEXP: ${expPattern}`;
  }
  if (mfgPattern) return mfgPattern;
  if (expPattern) return `EXP: ${expPattern}`;

  return "ไม่มีรูปแบบวันที่";
}

function deriveOrderPrintingDisplay(
  order: Pick<
    OrderInterface,
    "printing_config_used" | "production_date" | "expiry_date" | "lot_number"
  >,
): OrderPrintingDisplay {
  const snapshot = validatePrintingSnapshot(order.printing_config_used);
  if (!snapshot.valid) return { state: "invalid_config" };
  if (snapshot.config === null) return { state: "not_configured" };

  const formatDescription = describeSnapshotPrintingFormat(snapshot.config);
  const preview = renderPrintingTemplate({
    config: snapshot.config,
    productionDate: order.production_date,
    canonicalExpiryDate: order.expiry_date,
    lot: order.lot_number,
  });

  if (preview.status === "ready") {
    return { state: "ready", formatDescription, text: preview.text };
  }
  if (preview.status === "incomplete") {
    return { state: "incomplete", formatDescription };
  }

  return { state: "unavailable", formatDescription };
}

function calculateSnapshotExpiryDate(
  productionDate: string,
  order: Pick<OrderInterface, "product_exp" | "expiry_offset_days_used">,
): string {
  if (!productionDate) return "";

  const snapshot = validateCanonicalSnapshot(order);
  if (!snapshot.valid) return "";

  try {
    return calculateProductExpiryDate({
      productionDate,
      shelfLifeMonths: order.product_exp,
      actualExpiryOffsetDays: snapshot.actualExpiryOffsetDays,
    });
  } catch {
    return "";
  }
}

function formatCalendarDateForSummary(date: string): string {
  if (!date) return "ไม่มี";

  try {
    return formatProductDate(date, {
      pattern: "DD/MM/YYYY",
      calendar: "gregorian",
    });
  } catch {
    return date;
  }
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<OrderInterface[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingOrder, setEditingOrder] = useState<OrderInterface | null>(null);
  const [editingQuantity, setEditingQuantity] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [currentUserId, setCurrentUserId] = useState(""); // ✅ เก็บ UUID ของ user ปัจจุบัน
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedPrintTextId, setCopiedPrintTextId] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(240);
  const [visibleCount, setVisibleCount] = useState(10);
  const [focusedOrderId, setFocusedOrderId] = useState<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isPendingFilePanelOpen, setIsPendingFilePanelOpen] = useState(false);

  // ✅ สต็อคกระดาษ A3 — เฉพาะ moderator/assistant_moderator
  const [productMetaMap, setProductMetaMap] = useState<
    Record<string, { qtyPerA3: number; paperType: string }>
  >({});
  const [reconcilingOrder, setReconcilingOrder] =
    useState<OrderInterface | null>(null);
  const [stockDetailOrder, setStockDetailOrder] =
    useState<OrderInterface | null>(null);
  const [reconcileForm, setReconcileForm] = useState({
    wasteQty: "",
    wasteA3: "",
    wasteQtyRemark: "",
    wasteA3Remark: "",
    goodA3Extra: "",
  });
  const [initialReconcileForm, setInitialReconcileForm] = useState({
    wasteQty: "",
    wasteA3: "",
    wasteQtyRemark: "",
    wasteA3Remark: "",
    goodA3Extra: "",
  });
  const [isSubmittingReconcile, setIsSubmittingReconcile] = useState(false);
  const [reconcileErrors, setReconcileErrors] = useState<{
    wasteQtyRemark?: string;
    wasteA3Remark?: string;
  }>({});

  const sentinelRef = useRef<HTMLDivElement>(null);
  const productMetaMapRef = useRef(productMetaMap);

  const router = useRouter();

  const editingCanonicalSnapshot = editingOrder
    ? validateCanonicalSnapshot(editingOrder)
    : null;
  const editingPrintingSnapshot = editingOrder
    ? validatePrintingSnapshot(editingOrder.printing_config_used)
    : null;
  const editingPrintingConfig = editingPrintingSnapshot?.valid
    ? editingPrintingSnapshot.config
    : null;
  const editingHasPrintedExpiry =
    editingPrintingConfig !== null &&
    editingPrintingConfig.template.includes("{EXP_DATE}");
  const editingPrintingPreview =
    editingOrder &&
    editingPrintingSnapshot?.valid &&
    editingOrder.production_date &&
    editingOrder.expiry_date
      ? renderPrintingTemplate({
          config: editingPrintingSnapshot.config,
          productionDate: editingOrder.production_date,
          canonicalExpiryDate: editingOrder.expiry_date,
          lot: editingOrder.lot_number,
        })
      : null;

  const fetchUserInfo = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // ✅ เก็บ UUID ของ user ปัจจุบันไว้ใช้เช็คสิทธิ์
      setCurrentUserId(session.user.id);

      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setRole(data.role);
        setUserName(data.name);
        setEmployeeId(data.employee_id || "");
        loadOrders();
      } else {
        setRole("user");
        setUserName(session.user.email?.split("@")[0] || "User");
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
      router.push("/login");
    }
  };

  const [auditKey] = useState(0);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      let allOrders: OrderInterface[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allOrders = [...allOrders, ...(data as OrderInterface[])];
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }
      setOrders(allOrders);
      setIsLoading(false);
    } catch {
      setIsLoading(false);
      AppSwal.fire({
        icon: "error",
        title: "โหลดข้อมูลไม่สำเร็จ",
        text: "กรุณาลองใหม่อีกครั้ง",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
    }
  };
  const fetchProductMeta = useCallback(async () => {
    let allData: {
      id: string;
      qty_per_a3: number | null;
      default_paper_type: string | null;
    }[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from("fgcode")
        .select("id, qty_per_a3, default_paper_type")
        .range(from, from + pageSize - 1);

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    setProductMetaMap(
      Object.fromEntries(
        allData.map((p) => [
          p.id,
          {
            qtyPerA3:
              typeof p.qty_per_a3 === "number" && p.qty_per_a3 > 0
                ? p.qty_per_a3
                : 0,
            paperType: p.default_paper_type?.trim() || "",
          },
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    productMetaMapRef.current = productMetaMap;
  }, [productMetaMap]);

  useEffect(() => {
    fetchUserInfo();

    const playNotificationSound = () => {
      try {
        const AudioContext =
          window.AudioContext ||
          (window as AudioContextWindow).webkitAudioContext;
        if (!AudioContext) return;
        const audioCtx = new AudioContext();

        const playTone = (
          freq: number,
          startTime: number,
          duration: number,
        ) => {
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(
            freq,
            audioCtx.currentTime + startTime,
          );
          gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + startTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioCtx.currentTime + startTime + duration,
          );
          oscillator.start(audioCtx.currentTime + startTime);
          oscillator.stop(audioCtx.currentTime + startTime + duration);
        };

        playTone(880, 0, 0.3);
        playTone(1108.73, 0.15, 0.5);
      } catch (e) {
        console.error("Audio playback failed", e);
      }
    };

    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload: {
          eventType: string;
          new?: Record<string, unknown>;
          old?: Record<string, unknown>;
        }) => {
          const nowTS = Date.now();
          if (payload.eventType === "INSERT") {
            const newData = payload.new as Record<string, unknown>;
            if (newData) {
              playNotificationSound();
              AppSwal.fire({
                toast: true,
                position: "top-end",
                icon: "info",
                title: "🔔 มีคำสั่งพิมพ์ฉลากมาใหม่!",
                showConfirmButton: false,
                timer: 4000,
                timerProgressBar: true,
                background: "#EAF3FC",
                color: "#0057B8",
              });
              loadOrders();
            }
          } else if (payload.eventType === "UPDATE" && payload.new) {
            const newData = payload.new as Record<string, unknown>;
            const nextProductId =
              typeof newData.product_id === "string" ? newData.product_id : null;
            if (nextProductId && !productMetaMapRef.current[nextProductId]) {
              void fetchProductMeta();
            }
            if (newData.updated_at) {
              const updateTS = new Date(newData.updated_at as string).getTime();
              if (nowTS - updateTS < 10000) {
                playNotificationSound();
                const isCancelled = newData.is_cancelled;
                AppSwal.fire({
                  toast: true,
                  position: "top-end",
                  icon: isCancelled ? "warning" : "info",
                  title: isCancelled
                    ? "❌ มีคำสั่งพิมพ์ถูกยกเลิก!"
                    : "📝 มีการแก้ไขคำสั่งพิมพ์!",
                  text: newData.product_name
                    ? `สินค้า: ${newData.product_name}`
                    : "",
                  showConfirmButton: false,
                  timer: 4000,
                  timerProgressBar: true,
                  background: isCancelled ? "#FCEAEC" : "#EAF3FC",
                  color: isCancelled ? "#9B0B23" : "#0057B8",
                });
              }
            }
            // Update local state without fetching to prevent refresh flickers on status changes
            setOrders((prev) =>
              prev.map((o) => (o.id === newData.id ? { ...o, ...newData } : o)),
            );
          } else if (payload.eventType === "DELETE" && payload.old) {
            const oldId = payload.old.id;
            setOrders((prev) => prev.filter((o) => o.id !== oldId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProductMeta]);

  // ✅ ดึง qty_per_a3 + default_paper_type แยกต่างหาก ไม่ยุ่งกับ fetch เดิมที่ใช้ sync ชื่อสินค้า
  useEffect(() => {
    void fetchProductMeta();
  }, [fetchProductMeta]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const timeA = new Date(a.updated_at || a.created_at).getTime();
      const timeB = new Date(b.updated_at || b.created_at).getTime();
      return timeB - timeA;
    });
  }, [orders]);

  const isAdmin = role === "moderator" || role === "assistant_moderator";
  const copyPrintText = async (orderId: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrintTextId(orderId);
      window.setTimeout(() => setCopiedPrintTextId(null), 2000);
    } catch {
      AppSwal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "คัดลอกข้อความสำหรับพิมพ์ไม่สำเร็จ",
        text: "กรุณาลองใหม่อีกครั้ง",
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
    }
  };
  const pendingFileOrders = useMemo(
    () =>
      sortedOrders.filter((order) => order.is_no_file && !order.is_cancelled),
    [sortedOrders],
  );
  const filteredOrders = sortedOrders.filter(
    (order) =>
      searchTerm.trim() === "" ||
      order.lot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.product_name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const focusOrder = (order: OrderInterface) => {
    setSearchTerm("");
    const orderIndex = sortedOrders.findIndex(
      (sortedOrder) => sortedOrder.id === order.id,
    );
    setVisibleCount((previousCount) => Math.max(previousCount, orderIndex + 1));
    setFocusedOrderId(order.id);
  };

  const getCurrentUserIdentifier = () =>
    employeeId ? `${userName} (${employeeId})` : userName;

  const hasStockReconciliation = (order?: OrderInterface | null) =>
    Boolean(
      order &&
      (order.reconciled_at ||
        order.paper_type ||
        typeof order.good_a3 === "number" ||
        (order.waste_qty ?? 0) > 0 ||
        (order.waste_a3 ?? 0) > 0),
    );

  const deleteOrder = async (id: number) => {
    if (!isAdmin) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์",
        text: "เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    const orderToDelete = orders.find((order) => order.id === id);

    if (hasStockReconciliation(orderToDelete)) {
      await AppSwal.fire({
        icon: "warning",
        title: "ยังลบคำสั่งไม่ได้",
        text: "รายการนี้ตัดสต็อคกระดาษแล้ว กรุณายกเลิกการตัดสต็อคกระดาษก่อนลบคำสั่ง",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    const result = await AppSwal.fire({
      title: "ยืนยันการลบ?",
      text: "คุณต้องการลบคำสั่งพิมพ์ฉลากหรือไม่?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#C8102E",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ใช่, ลบเลย!",
      cancelButtonText: "ยกเลิก",
    });
    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from("orders")
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by: getCurrentUserIdentifier(),
          })
          .eq("id", id);
        if (error) throw error;

        setOrders((prev) => prev.filter((order) => order.id !== id));
        AppSwal.fire({
          icon: "success",
          title: "ลบสำเร็จ!",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "ลบไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  const saveEdit = async () => {
    if (!editingOrder) return;
    if (isSaving) return;
    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const original = orders.find((o) => o.id === editingOrder.id);
      const changeDetails: string[] = [];

      const parsedQuantity = Number(editingQuantity);
      const productionDateChanged = Boolean(
        original && original.production_date !== editingOrder.production_date,
      );
      let expiryDateForSave = editingOrder.expiry_date;

      if (
        editingQuantity.trim() === "" ||
        !Number.isInteger(parsedQuantity) ||
        parsedQuantity <= 0
      ) {
        AppSwal.fire({
          icon: "warning",
          title: "จำนวนไม่ถูกต้อง",
          text: "กรุณากรอกจำนวนสั่งทำเป็นจำนวนเต็มที่มากกว่า 0",
          confirmButtonText: "รับทราบ",
          confirmButtonColor: "#0057B8",
        });
        setIsSaving(false);
        return;
      }

      if (productionDateChanged) {
        const canonicalSnapshot = validateCanonicalSnapshot(editingOrder);
        if (!canonicalSnapshot.valid) {
          await AppSwal.fire({
            icon: "error",
            title: "ไม่สามารถแก้ไขวันที่ผลิตได้",
            text: canonicalSnapshot.message,
            confirmButtonText: "รับทราบ",
            confirmButtonColor: "#0057B8",
          });
          setIsSaving(false);
          return;
        }

        expiryDateForSave = calculateSnapshotExpiryDate(
          editingOrder.production_date,
          editingOrder,
        );
        if (!expiryDateForSave) {
          await AppSwal.fire({
            icon: "error",
            title: "ไม่สามารถคำนวณวันหมดอายุได้",
            text: "กรุณาตรวจสอบวันที่ผลิตของ Order นี้",
            confirmButtonText: "รับทราบ",
            confirmButtonColor: "#0057B8",
          });
          setIsSaving(false);
          return;
        }
      }

      if (original) {
        const displayVal = (val: unknown) =>
          val === null ||
          val === undefined ||
          String(val).trim() === "" ||
          val === "-"
            ? "ไม่มี"
            : String(val).trim();

        // ประเภทคำสั่ง
        const oldType = displayVal(original.order_type);
        const newType = displayVal(editingOrder.order_type);
        if (oldType !== newType)
          changeDetails.push(`ประเภท: ${oldType} ➡️ ${newType}`);

        // เลขลอต
        const oldLot = displayVal(original.lot_number);
        const newLot = displayVal(editingOrder.lot_number);
        if (oldLot !== newLot)
          changeDetails.push(`เลขลอต: ${oldLot} ➡️ ${newLot}`);

        // จำนวน
        const oldQty = Number(original.quantity) || 0;
        const newQty = parsedQuantity;
        if (oldQty !== newQty)
          changeDetails.push(`จำนวน: ${oldQty} ➡️ ${newQty}`);

        // วันที่ผลิต
        const oldDateRaw = original.production_date || "";
        const newDateRaw = editingOrder.production_date || "";
        if (oldDateRaw !== newDateRaw) {
          changeDetails.push(
            `วันที่ผลิต: ${formatCalendarDateForSummary(oldDateRaw)} ➡️ ${formatCalendarDateForSummary(newDateRaw)}`,
          );
        }

        const oldExpiryRaw = original.expiry_date || "";
        if (oldExpiryRaw !== expiryDateForSave) {
          changeDetails.push(
            `วันหมดอายุจริง (คำนวณอัตโนมัติ): ${formatCalendarDateForSummary(oldExpiryRaw)} ➡️ ${formatCalendarDateForSummary(expiryDateForSave)}`,
          );
        }

        // หมายเหตุ
        const oldNotes = displayVal(original.notes);
        const newNotes = displayVal(editingOrder.notes);
        if (oldNotes !== newNotes)
          changeDetails.push(`หมายเหตุ: ${oldNotes} ➡️ ${newNotes}`);
      }

      if (changeDetails.length === 0) {
        AppSwal.fire({
          icon: "info",
          title: "ไม่มีการเปลี่ยนแปลง",
          text: "คุณยังไม่ได้แก้ไขข้อมูลใดๆ ของคำสั่งพิมพ์นี้",
          confirmButtonText: "รับทราบ",
          confirmButtonColor: "#0057B8",
        });
        setIsSaving(false);
        return;
      }

      const summary = `แก้ไข: ${changeDetails.join(" | ")}`;
      const editorName = getCurrentUserIdentifier();

      const confirmResult = await AppSwal.fire({
        icon: "question",
        title: "ยืนยันการแก้ไข?",
        html: `
        <div style="text-align:left; font-size:13px;">
            <p style="color:#5F6B70; margin-bottom:8px;">รายการที่แก้ไข:</p>
            <table style="width:100%; border-collapse:collapse;">
                ${changeDetails
                  .map((detail) => {
                    const [label, rest] = detail.split(": ");
                    const [oldVal, newVal] = (rest || "").split(" ➡️ ");
                    return `
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:6px 8px; color:#5F6B70; font-weight:600; white-space:nowrap;">${label}</td>
                            <td style="padding:6px 8px; color:#C8102E; text-decoration:line-through; font-size:12px;">${oldVal || ""}</td>
                            <td style="padding:6px 4px; color:#5F6B70;">→</td>
                            <td style="padding:6px 8px; color:#008C78; font-weight:700;">${newVal || ""}</td>
                        </tr>
                    `;
                  })
                  .join("")}
            </table>
        </div>
    `,
        showCancelButton: true,
        confirmButtonText: "✓ ยืนยันบันทึก",
        cancelButtonText: "กลับไปแก้ไข",
        confirmButtonColor: "#0057B8",
        cancelButtonColor: "#75787B",
        customClass: { popup: "rounded-xl text-sm" },
        width: "clamp(320px, 90vw, 480px)",
      });

      if (!confirmResult.isConfirmed) {
        setIsSaving(false);
        return;
      }

      const updateData = {
        order_type: editingOrder.order_type,
        lot_number: editingOrder.lot_number,
        quantity: parsedQuantity,
        production_date: editingOrder.production_date,
        expiry_date: expiryDateForSave,
        notes: editingOrder.notes,
        updated_at: now,
        updated_by: editorName,
        edit_summary: summary,
      };

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", editingOrder.id);
      if (error) throw error;

      setOrders((prev) =>
        prev.map((o) =>
          o.id === editingOrder.id ? { ...o, ...updateData } : o,
        ),
      );
      setEditingOrder(null);
      AppSwal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      AppSwal.fire({
        icon: "error",
        title: "แก้ไขไม่สำเร็จ",
        text: "กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (order: OrderInterface) => {
    if (!isAdmin && order.created_by_user_id !== currentUserId) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์แก้ไข",
        html: `
        <div class="text-sm text-gray-600 space-y-1 text-left">
          <p>คำสั่งนี้ถูกสั่งโดย <b>${order.created_by}</b></p>
          <p class="mt-2 text-[#C8102E] font-medium">
            คุณสามารถแก้ไขได้เฉพาะคำสั่งของตนเองเท่านั้น
          </p>
        </div>
      `,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    if (hasStockReconciliation(order)) {
      AppSwal.fire({
        icon: "warning",
        title: "ยังแก้ไขคำสั่งไม่ได้",
        text: "รายการนี้ตัดสต็อคกระดาษแล้ว กรุณายกเลิกการตัดสต็อคกระดาษก่อนแก้ไขคำสั่ง",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    setEditingOrder({ ...order });
    setEditingQuantity(String(order.quantity ?? ""));
  };

  // ✅ บันทึกผลผลิต (กระดาษดี/เสีย) — เฉพาะ moderator/assistant_moderator เท่านั้น
  const startReconcile = (order: OrderInterface) => {
    if (!isAdmin) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์",
        text: "เฉพาะ Moderator และ Assistant Moderator เท่านั้น",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    const meta = productMetaMap[order.product_id];

    const hasPaperType = Boolean(meta?.paperType?.trim());
    const hasQtyPerA3 =
      typeof meta?.qtyPerA3 === "number" &&
      Number.isFinite(meta.qtyPerA3) &&
      meta.qtyPerA3 > 0;

    if (!meta || !hasPaperType || !hasQtyPerA3) {
      const missingFields: string[] = [];

      if (!hasPaperType) {
        missingFields.push("ประเภทกระดาษ");
      }

      if (!hasQtyPerA3) {
        missingFields.push("จำนวนชิ้นต่อ A3");
      }

      AppSwal.fire({
        icon: "warning",
        title: "ข้อมูลสินค้าไม่ครบ",
        html: `
        <div style="text-align:left; font-size:13px;">
          <p>
            สินค้ารหัส <b>${order.product_id}</b>
            ยังไม่สามารถตัดสต็อคกระดาษได้
          </p>

          <p style="margin-top:8px; color:#C8102E; font-weight:700;">
            ขาดข้อมูล: ${missingFields.join(" และ ")}
          </p>

          <p style="margin-top:8px; color:#5F6B70;">
            กรุณาไปตั้งค่าให้ครบที่หน้า Product ก่อนบันทึกผลผลิต
          </p>
        </div>
      `,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });

      return;
    }

    setReconcileErrors({});
    setReconcilingOrder(order);

    const qtyPerA3 = meta.qtyPerA3;
    const target = order.quantity || 0;
    const wasteQty = order.waste_qty || 0;

    const baseSheetsForTarget = target > 0 ? Math.ceil(target / qtyPerA3) : 0;

    const naturalTotal = baseSheetsForTarget * qtyPerA3;
    const naturalExcess = target > 0 ? naturalTotal - target : 0;

    const extraSheetsForWaste =
      wasteQty > naturalExcess
        ? Math.ceil((wasteQty - naturalExcess) / qtyPerA3)
        : 0;

    const autoGoodA3 = baseSheetsForTarget + extraSheetsForWaste;

    const existingGoodA3Extra =
      order.good_a3 != null ? Math.max(0, order.good_a3 - autoGoodA3) : 0;

    const initial = {
      wasteQty: order.waste_qty ? String(order.waste_qty) : "",
      wasteA3: order.waste_a3 ? String(order.waste_a3) : "",
      wasteQtyRemark: order.waste_qty_remark || "",
      wasteA3Remark: order.waste_a3_remark || "",
      goodA3Extra: existingGoodA3Extra > 0 ? String(existingGoodA3Extra) : "",
    };

    setReconcileForm(initial);
    setInitialReconcileForm(initial);
  };

  const reconcileCalculation = useMemo(() => {
    if (!reconcilingOrder) return null;

    const meta = productMetaMap[reconcilingOrder.product_id];

    if (
      !meta ||
      !meta.paperType?.trim() ||
      !Number.isFinite(meta.qtyPerA3) ||
      meta.qtyPerA3 <= 0
    ) {
      return null;
    }

    const qtyPerA3 = meta.qtyPerA3;
    const target = reconcilingOrder.quantity || 0;
    const wasteQty = parseInt(reconcileForm.wasteQty, 10) || 0;
    const wasteA3 = parseInt(reconcileForm.wasteA3, 10) || 0;
    const goodA3Extra = parseInt(reconcileForm.goodA3Extra, 10) || 0;

    const baseSheetsForTarget = target > 0 ? Math.ceil(target / qtyPerA3) : 0;

    const naturalTotal = baseSheetsForTarget * qtyPerA3;
    const naturalExcess = target > 0 ? naturalTotal - target : 0;

    const extraSheetsForWaste =
      wasteQty > naturalExcess
        ? Math.ceil((wasteQty - naturalExcess) / qtyPerA3)
        : 0;

    const autoGoodA3 = baseSheetsForTarget + extraSheetsForWaste;
    const goodA3 = autoGoodA3 + goodA3Extra;
    const sheetsNeeded = goodA3 + wasteA3;
    const totalPrinted = goodA3 * qtyPerA3;
    const excessQty = Math.max(0, totalPrinted - target - wasteQty);

    return {
      paperType: meta.paperType,
      qtyPerA3,
      target,
      wasteQty,
      wasteA3,
      goodA3,
      autoGoodA3,
      sheetsNeeded,
      totalPrinted,
      excessQty,
    };
  }, [reconcilingOrder, reconcileForm, productMetaMap]);

  const submitReconcile = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    // 🟢 ดัก Event ป้องกันไม่ให้การคลิกทะลุไปถึง Modal ข้างหลัง
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!reconcilingOrder || !reconcileCalculation || !isAdmin) return;

    // ✅ เช็คว่ารายการนี้เคยบันทึกผลผลิตแล้วหรือยัง
    const wasAlreadyReconciled = reconcilingOrder.good_a3 != null;

    // ✅ เช็คว่ามีการเปลี่ยนแปลงจริงไหม
    const noChange =
      wasAlreadyReconciled &&
      (parseInt(reconcileForm.wasteQty) || 0) ===
        (parseInt(initialReconcileForm.wasteQty) || 0) &&
      (parseInt(reconcileForm.wasteA3) || 0) ===
        (parseInt(initialReconcileForm.wasteA3) || 0) &&
      reconcileForm.wasteQtyRemark.trim() ===
        initialReconcileForm.wasteQtyRemark.trim() &&
      reconcileForm.wasteA3Remark.trim() ===
        initialReconcileForm.wasteA3Remark.trim() &&
      (parseInt(reconcileForm.goodA3Extra) || 0) ===
        (parseInt(initialReconcileForm.goodA3Extra) || 0);

    if (noChange) {
      await AppSwal.fire({
        icon: "info",
        title: "ไม่มีการเปลี่ยนแปลง",
        text: "คุณยังไม่ได้แก้ไขข้อมูลใดๆ",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
        returnFocus: false,
      });
      return;
    }

    // ✅ บังคับระบุเหตุผลเมื่อมีของเสีย (inline validation)
    const errors: { wasteQtyRemark?: string; wasteA3Remark?: string } = {};
    if (
      reconcileCalculation.wasteQty > 0 &&
      !reconcileForm.wasteQtyRemark.trim()
    ) {
      errors.wasteQtyRemark = "มีชิ้นเสีย — กรุณาระบุหมายเหตุ";
    }
    if (
      reconcileCalculation.wasteA3 > 0 &&
      !reconcileForm.wasteA3Remark.trim()
    ) {
      errors.wasteA3Remark = "มีกระดาษเสีย — กรุณาระบุหมายเหตุ";
    }
    if (Object.keys(errors).length > 0) {
      setReconcileErrors(errors);
      return;
    }
    setReconcileErrors({});

    // ✅ เช็คสต็อคกระดาษคงเหลือก่อนตัด — กันตัดสต็อคติดลบ
    const { data: txData, error: txErr } = await supabase
      .from("paper_transactions")
      .select("transaction_type, qty")
      .eq("paper_type", reconcileCalculation.paperType);

    if (txErr) {
      await AppSwal.fire({
        icon: "error",
        title: "เช็คสต็อคไม่สำเร็จ",
        text: "กรุณาลองใหม่อีกครั้ง",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
        returnFocus: false,
      });
      return;
    }

    const currentBalance = (txData || []).reduce(
      (acc, t) => acc + (t.transaction_type === "IN" ? t.qty : -t.qty),
      0,
    );
    const oldSheetsUsed =
      (reconcilingOrder.good_a3 || 0) + (reconcilingOrder.waste_a3 || 0);

    const previousPaperType = reconcilingOrder.paper_type?.trim() || "";
    const currentPaperType = reconcileCalculation.paperType.trim();
    const isSamePaperType = previousPaperType === currentPaperType;

    const requiredFromCurrentStock = isSamePaperType
      ? Math.max(0, reconcileCalculation.sheetsNeeded - oldSheetsUsed)
      : reconcileCalculation.sheetsNeeded;

    if (requiredFromCurrentStock > currentBalance) {
      await AppSwal.fire({
        icon: "error",
        title: "สต็อคกระดาษไม่พอ",
        html: `
      <div style="text-align:left; font-size:13px;">
        <p>ประเภทกระดาษ: <b>${reconcileCalculation.paperType}</b></p>
        <p>สต็อคคงเหลือ: <b>${currentBalance}</b> ใบ</p>
        <p>
          ต้องการใช้จากสต็อคประเภทนี้:
          <b>${requiredFromCurrentStock}</b> ใบ
        </p>
        ${
          !isSamePaperType && previousPaperType
            ? `<p style="margin-top:6px; color:#5F6B70;">
                 ประเภทกระดาษเดิม: <b>${previousPaperType}</b>
               </p>`
            : ""
        }
        <p style="margin-top:6px; color:#C8102E;">
          กรุณารับกระดาษเข้าสต็อคที่หน้า Paper Stock ก่อน
        </p>
      </div>
    `,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
        returnFocus: false,
      });
      return;
    }

    const confirmResult = await AppSwal.fire({
      icon: "question",
      title: "ยืนยันบันทึกผลผลิต?",
      html: `
                <div style="text-align:left; font-size:13px;">
                    <p>สินค้า: <b>${reconcilingOrder.product_name}</b></p>
                    <p>ล็อต: <b>${reconcilingOrder.lot_number}</b></p>
                    <p style="margin-top:6px; border-top:1px solid #e5e7eb; padding-top:6px;">ประเภทกระดาษ: <b>${reconcileCalculation.paperType}</b></p>
                    <p>กระดาษดี: <b>${reconcileCalculation.goodA3}</b> ใบ</p>
                    ${reconcileCalculation.wasteA3 > 0 ? `<p>กระดาษเสีย: <b>${reconcileCalculation.wasteA3}</b> ใบ</p>` : ""}
                    ${reconcileCalculation.wasteQty > 0 ? `<p>ชิ้นเสีย: <b>${reconcileCalculation.wasteQty}</b> ชิ้น</p>` : ""}
                    <p style="margin-top:6px; border-top:1px solid #e5e7eb; padding-top:6px;">รวมตัดสต็อค: <b>${reconcileCalculation.sheetsNeeded}</b> ใบ</p>
                </div>
            `,
      showCancelButton: true,
      confirmButtonText: "✓ ยืนยันบันทึก",
      cancelButtonText: "กลับไปแก้ไข",
      confirmButtonColor: "#0057B8",
      cancelButtonColor: "#75787B",
      returnFocus: false,
    });

    if (!confirmResult.isConfirmed) return;

    setIsSubmittingReconcile(true);
    try {
      const entryId = reconcilingOrder.id;
      const editorName = getCurrentUserIdentifier();

      const { error: updateErr } = await supabase
        .from("orders")
        .update({
          paper_type: reconcileCalculation.paperType,
          good_a3: reconcileCalculation.goodA3,
          waste_qty:
            reconcileCalculation.wasteQty > 0
              ? reconcileCalculation.wasteQty
              : null,
          waste_qty_remark: reconcileForm.wasteQtyRemark || null,
          waste_a3:
            reconcileCalculation.wasteA3 > 0
              ? reconcileCalculation.wasteA3
              : null,
          waste_a3_remark: reconcileForm.wasteA3Remark || null,
          reconciled_by: editorName,
          reconciled_at: new Date().toISOString(),
          qty_per_a3_used: reconcileCalculation.qtyPerA3,
        })
        .eq("id", entryId);

      if (updateErr) throw updateErr;

      const { data: existingGoodTx } = await supabase
        .from("paper_transactions")
        .select("id")
        .eq("reference_id", entryId)
        .eq("transaction_type", "OUT")
        .or("transaction_category.eq.GOOD,transaction_category.is.null")
        .limit(1)
        .maybeSingle();

      if (existingGoodTx) {
        const { error: goodTxErr } = await supabase
          .from("paper_transactions")
          .update({
            paper_type: reconcileCalculation.paperType,
            qty: reconcileCalculation.goodA3,
            transaction_category: "GOOD",
            description: `คำสั่งพิมพ์ ล็อต ${reconcilingOrder.lot_number} (กระดาษดี)`,
          })
          .eq("id", existingGoodTx.id);
        if (goodTxErr)
          throw new Error(`ตัดสต็อคกระดาษดีไม่สำเร็จ: ${goodTxErr.message}`);
      } else {
        const { error: goodTxErr } = await supabase
          .from("paper_transactions")
          .insert({
            reference_id: entryId,
            transaction_type: "OUT",
            transaction_category: "GOOD",
            paper_type: reconcileCalculation.paperType,
            qty: reconcileCalculation.goodA3,
            date: new Date().toLocaleDateString("en-CA", {
              timeZone: "Asia/Bangkok",
            }),
            created_by: editorName,
            description: `คำสั่งพิมพ์ ล็อต ${reconcilingOrder.lot_number} (กระดาษดี)`,
          });
        if (goodTxErr)
          throw new Error(`ตัดสต็อคกระดาษดีไม่สำเร็จ: ${goodTxErr.message}`);
      }

      if (reconcileCalculation.wasteA3 > 0) {
        const { data: existingWasteTx } = await supabase
          .from("paper_transactions")
          .select("id")
          .eq("reference_id", entryId)
          .eq("transaction_type", "OUT")
          .eq("transaction_category", "WASTE")
          .maybeSingle();

        if (existingWasteTx) {
          const { error: wasteTxErr } = await supabase
            .from("paper_transactions")
            .update({
              paper_type: reconcileCalculation.paperType,
              qty: reconcileCalculation.wasteA3,
              description: `คำสั่งพิมพ์ ล็อต ${reconcilingOrder.lot_number} (กระดาษเสีย)`,
            })
            .eq("id", existingWasteTx.id);
          if (wasteTxErr)
            throw new Error(
              `ตัดสต็อคกระดาษเสียไม่สำเร็จ: ${wasteTxErr.message}`,
            );
        } else {
          const { error: wasteTxErr } = await supabase
            .from("paper_transactions")
            .insert({
              reference_id: entryId,
              transaction_type: "OUT",
              transaction_category: "WASTE",
              paper_type: reconcileCalculation.paperType,
              qty: reconcileCalculation.wasteA3,
              date: new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Bangkok",
              }),
              created_by: editorName,
              description: `คำสั่งพิมพ์ ล็อต ${reconcilingOrder.lot_number} (กระดาษเสีย)`,
            });
          if (wasteTxErr)
            throw new Error(
              `ตัดสต็อคกระดาษเสียไม่สำเร็จ: ${wasteTxErr.message}`,
            );
        }
      } else {
        const { error: clearWasteErr } = await supabase
          .from("paper_transactions")
          .delete()
          .eq("reference_id", entryId)
          .eq("transaction_type", "OUT")
          .eq("transaction_category", "WASTE");
        if (clearWasteErr)
          throw new Error(
            `ล้างรายการกระดาษเสียเดิมไม่สำเร็จ: ${clearWasteErr.message}`,
          );
      }

      // อัปเดตตาราง paper_reports
      // อัปเดตตาราง paper_reports
      const { data: existingReport, error: reportLookupErr } = await supabase
        .from("paper_reports")
        .select("id")
        .eq("order_id", entryId)
        .maybeSingle();

      if (reportLookupErr) {
        throw new Error(
          `ตรวจสอบรายงานกระดาษไม่สำเร็จ: ${reportLookupErr.message}`,
        );
      }

      if (existingReport) {
        const { error: reportUpdateErr } = await supabase
          .from("paper_reports")
          .update({
            target_qty: reconcilingOrder.quantity || 0,
            target_a3: reconcilingOrder.target_a3 || 0,
            good_a3: reconcileCalculation.goodA3,
            waste_a3: reconcileCalculation.wasteA3,
            waste_qty: reconcileCalculation.wasteQty,
            waste_a3_remark: reconcileForm.wasteA3Remark.trim() || null,
            waste_qty_remark: reconcileForm.wasteQtyRemark.trim() || null,
            paper_type: reconcileCalculation.paperType,
            product_id: reconcilingOrder.product_id,
            department: reconcilingOrder.created_by_department,
            lot_number: reconcilingOrder.lot_number,
            qty_per_a3_used: reconcileCalculation.qtyPerA3,
          })
          .eq("id", existingReport.id);

        if (reportUpdateErr) {
          throw new Error(
            `อัปเดตรายงานกระดาษไม่สำเร็จ: ${reportUpdateErr.message}`,
          );
        }
      } else {
        const { error: reportInsertErr } = await supabase
          .from("paper_reports")
          .insert({
            order_id: entryId,
            report_type: "ORDER",
            lot_number: reconcilingOrder.lot_number,
            product_id: reconcilingOrder.product_id,
            department: reconcilingOrder.created_by_department,
            paper_type: reconcileCalculation.paperType,
            target_qty: reconcilingOrder.quantity || 0,
            target_a3: reconcilingOrder.target_a3 || 0,
            good_a3: reconcileCalculation.goodA3,
            waste_a3: reconcileCalculation.wasteA3,
            waste_qty: reconcileCalculation.wasteQty,
            waste_a3_remark: reconcileForm.wasteA3Remark.trim() || null,
            waste_qty_remark: reconcileForm.wasteQtyRemark.trim() || null,
            created_by: editorName,
            created_at: new Date().toISOString(),
            qty_per_a3_used: reconcileCalculation.qtyPerA3,
          });

        if (reportInsertErr) {
          throw new Error(
            `สร้างรายงานกระดาษไม่สำเร็จ: ${reportInsertErr.message}`,
          );
        }
      }

      // อัปเดต Orders ใน State หลังฉาก
      setOrders((prev) =>
        prev.map((o) =>
          o.id === entryId
            ? {
                ...o,
                paper_type: reconcileCalculation.paperType,
                good_a3: reconcileCalculation.goodA3,
                waste_qty:
                  reconcileCalculation.wasteQty > 0
                    ? reconcileCalculation.wasteQty
                    : undefined,
                waste_qty_remark: reconcileForm.wasteQtyRemark || undefined,
                waste_a3:
                  reconcileCalculation.wasteA3 > 0
                    ? reconcileCalculation.wasteA3
                    : undefined,
                waste_a3_remark: reconcileForm.wasteA3Remark || undefined,
                reconciled_by: editorName,
                reconciled_at: new Date().toISOString(),
                qty_per_a3_used: reconcileCalculation.qtyPerA3,
              }
            : o,
        ),
      );

      // อัปเดตค่าที่ค้างอยู่ใน Modal เพื่อแสดงค่าล่าสุด แทนการปิด Modal
      setReconcilingOrder((prev) =>
        prev
          ? {
              ...prev,
              paper_type: reconcileCalculation.paperType,
              good_a3: reconcileCalculation.goodA3,
              waste_qty:
                reconcileCalculation.wasteQty > 0
                  ? reconcileCalculation.wasteQty
                  : undefined,
              waste_qty_remark: reconcileForm.wasteQtyRemark || undefined,
              waste_a3:
                reconcileCalculation.wasteA3 > 0
                  ? reconcileCalculation.wasteA3
                  : undefined,
              waste_a3_remark: reconcileForm.wasteA3Remark || undefined,
              reconciled_by: editorName,
              reconciled_at: new Date().toISOString(),
              qty_per_a3_used: reconcileCalculation.qtyPerA3,
            }
          : null,
      );

      setInitialReconcileForm({
        wasteQty: reconcileForm.wasteQty,
        wasteA3: reconcileForm.wasteA3,
        wasteQtyRemark: reconcileForm.wasteQtyRemark,
        wasteA3Remark: reconcileForm.wasteA3Remark,
        goodA3Extra: reconcileForm.goodA3Extra,
      });
      await AppSwal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        text: "ตัดสต็อคกระดาษเรียบร้อยแล้ว",
        timer: 1800,
        showConfirmButton: false,
        returnFocus: false,
      });
      setReconcilingOrder(null);
    } catch (error) {
      await AppSwal.fire({
        icon: "error",
        title: "บันทึกไม่สำเร็จ",
        text: (error as Error).message || "กรุณาลองใหม่อีกครั้ง",
        returnFocus: false,
      });
    } finally {
      setIsSubmittingReconcile(false);
    }
  };

  const undoReconcile = async (order: OrderInterface) => {
    if (!isAdmin) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์",
        text: "เฉพาะ Moderator และ Assistant Moderator เท่านั้น",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    const goodA3 = order.good_a3 || 0;
    const wasteA3 = order.waste_a3 || 0;
    const totalSheets = goodA3 + wasteA3;

    // ✅ เช็คว่าอัตราส่วนชิ้น/A3 ตอนตัดสต็อค ยังตรงกับอัตราปัจจุบันของสินค้านี้ไหม
    const currentQtyPerA3 = productMetaMap[order.product_id]?.qtyPerA3;
    let ratioWarningHtml = "";
    if (order.qty_per_a3_used == null) {
      ratioWarningHtml = `<p style="margin-top:6px; color:#6E5B00; background:#FFF8D6; border:1px solid rgba(241,196,0,0.35); border-radius:8px; padding:6px 8px;">⚠️ ไม่สามารถตรวจสอบอัตราส่วนของรายการนี้ได้ (บันทึกไว้ก่อนระบบอัปเดต) กรุณาตรวจสอบยอดด้วยตนเอง</p>`;
    } else if (currentQtyPerA3 && order.qty_per_a3_used !== currentQtyPerA3) {
      ratioWarningHtml = `<p style="margin-top:6px; color:#C8102E; background:#FCEAEC; border:1px solid rgba(200,16,46,0.20); border-radius:8px; padding:6px 8px;">⚠️ อัตราส่วนชิ้น/A3 ของสินค้านี้เปลี่ยนไปหลังตัดสต็อคครั้งนี้ (ตอนตัด: <b>${order.qty_per_a3_used}</b> ชิ้น/A3 ตอนนี้: <b>${currentQtyPerA3}</b> ชิ้น/A3) กรุณาตรวจสอบยอดให้แน่ใจก่อนยกเลิก</p>`;
    }

    const result = await AppSwal.fire({
      icon: "warning",
      title: "ยกเลิกการตัดสต็อค?",
      html: `
                <div style="text-align:left; font-size:13px;">
                    <p>สินค้า: <b>${order.product_name}</b></p>
                    <p>ล็อต: <b>${order.lot_number}</b></p>
                    <p style="margin-top:6px; border-top:1px solid #e5e7eb; padding-top:6px;">
                        กระดาษ <b>${totalSheets}</b> ใบ (ประเภท <b>${order.paper_type || "-"}</b>) จะถูกคืนเข้าสต็อค
                    </p>
                                        ${ratioWarningHtml}
                    <p style="margin-top:4px; color:#C8102E;">รายการตัดสต็อคเดิมของคำสั่งนี้จะถูกลบทั้งหมด</p>
                </div>
            `,
      showCancelButton: true,
      confirmButtonText: "ยืนยันยกเลิกตัดสต็อค",
      cancelButtonText: "ปิด",
      confirmButtonColor: "#C8102E",
      cancelButtonColor: "#75787B",
      returnFocus: false,
    });
    if (!result.isConfirmed) return;

    try {
      const { error: txErr } = await supabase
        .from("paper_transactions")
        .delete()
        .eq("reference_id", order.id)
        .eq("transaction_type", "OUT");
      if (txErr) throw txErr;

      const { error: reportErr } = await supabase
        .from("paper_reports")
        .delete()
        .eq("order_id", order.id);
      if (reportErr) throw reportErr;

      const { error: updateErr } = await supabase
        .from("orders")
        .update({
          paper_type: null,
          good_a3: null,
          waste_qty: null,
          waste_qty_remark: null,
          waste_a3: null,
          waste_a3_remark: null,
          reconciled_by: null,
          reconciled_at: null,
          qty_per_a3_used: null,
        })
        .eq("id", order.id);
      if (updateErr) throw updateErr;

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                paper_type: undefined,
                good_a3: undefined,
                waste_qty: undefined,
                waste_qty_remark: undefined,
                waste_a3: undefined,
                waste_a3_remark: undefined,
                reconciled_by: undefined,
                reconciled_at: undefined,
                qty_per_a3_used: undefined,
              }
            : o,
        ),
      );

      AppSwal.fire({
        icon: "success",
        title: "ยกเลิกตัดสต็อคสำเร็จ",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (error) {
      AppSwal.fire({
        icon: "error",
        title: "ยกเลิกไม่สำเร็จ",
        text: (error as Error).message || "กรุณาลองใหม่อีกครั้ง",
      });
    }
  };

  const verifyOrder = async (order: OrderInterface) => {
    if (!isAdmin) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์",
        text: "เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    if (order.is_verified) {
      AppSwal.fire({
        icon: "warning",
        title: "ตรวจสอบไปแล้ว",
        html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งรายการนี้ได้รับการตรวจสอบและตัดชิ้นงานเสร็จแล้ว</p>
                        <p class="mt-2">✅ <b>ผู้ตรวจสอบ:</b> ${order.verified_by || "ไม่ระบุ"}</p>
                        <p>🕐 <b>เวลา:</b> ${formatThaiDateTimeFromISO(order.verified_at)}</p>
                        <p class="mt-2 text-[#FF6A13] font-medium">เฉพาะผู้ที่ตรวจสอบเท่านั้นที่สามารถยกเลิกได้</p>
                    </div>
                `,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    const result = await AppSwal.fire({
      title: "ยืนยันการตรวจสอบ",
      text: "คุณต้องการยืนยันว่าได้ตรวจสอบคำสั่งพิมพ์ฉลากนี้แล้วหรือไม่?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#00B398",
      cancelButtonColor: "#75787B",
      confirmButtonText: "✓ ยืนยันการตรวจสอบ",
      cancelButtonText: "ยกเลิก",
    });
    if (result.isConfirmed) {
      try {
        const now = new Date().toISOString();
        const verifierName = getCurrentUserIdentifier();
        const { error } = await supabase
          .from("orders")
          .update({
            is_verified: true,
            verified_by: verifierName,
            verified_by_user_id: currentUserId,
            verified_at: now,
          })
          .eq("id", order.id);
        if (error) throw error;

        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  is_verified: true,
                  verified_by: verifierName,
                  verified_by_user_id: currentUserId,
                  verified_at: now,
                }
              : o,
          ),
        );

        AppSwal.fire({
          icon: "success",
          title: "ตรวจสอบสำเร็จ!",
          html: `ผู้ตรวจสอบ: <strong>${verifierName}</strong>`,
          timer: 2000,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "ตรวจสอบไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  // ✅ markPrinted — ดึง DB ก่อน + บันทึก printed_by, printed_by_user_id, printed_at
  const markPrinted = async (order: OrderInterface) => {
    if (!isAdmin) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: freshOrder, error: fetchError } = await supabase
      .from("orders")
      .select("is_printed, printed_by, printed_by_user_id")
      .eq("id", order.id)
      .single();

    if (fetchError || !freshOrder) {
      AppSwal.fire({
        icon: "error",
        title: "โหลดข้อมูลไม่สำเร็จ",
        text: "กรุณาลองใหม่",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    // ✅ ดักซ้ำด้วย UUID
    if (freshOrder.is_printed) {
      AppSwal.fire({
        icon: "warning",
        title: "พิมพ์ฉลากไปแล้ว!",
        html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งนี้ได้รับการยืนยันพิมพ์ฉลากแล้ว</p>
                        <p class="mt-2">🖨️ <b>ผู้พิมพ์:</b> ${freshOrder.printed_by || "ไม่ระบุ"}</p>
                        <p class="mt-2 text-[#FF6A13] font-medium">เฉพาะผู้ที่พิมพ์เท่านั้นที่สามารถยกเลิกได้</p>
                    </div>
                `,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    const result = await AppSwal.fire({
      title: "ยืนยันพิมพ์ฉลากแล้ว?",
      text: `คุณต้องการยืนยันว่าได้พิมพ์ฉลากของ ${order.product_name} เสร็จแล้วหรือไม่?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0057B8",
      cancelButtonColor: "#75787B",
      confirmButtonText: "✓ ยืนยันพิมพ์แล้ว",
      cancelButtonText: "ยกเลิก",
    });

    if (result.isConfirmed) {
      try {
        const printerName = getCurrentUserIdentifier();
        const now = new Date().toISOString();

        const { error } = await supabase
          .from("orders")
          .update({
            is_printed: true,
            is_no_file: false,
            printed_by: printerName, // ✅ ชื่อผู้พิมพ์
            printed_by_user_id: session.user.id, // ✅ UUID ผู้พิมพ์
            printed_at: now, // ✅ เวลาที่พิมพ์
          })
          .eq("id", order.id);

        if (error) throw error;

        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  is_printed: true,
                  is_no_file: false,
                  printed_by: printerName,
                  printed_by_user_id: session.user.id,
                  printed_at: now,
                }
              : o,
          ),
        );
        AppSwal.fire({
          icon: "success",
          title: 'อัปเดตสถานะเป็น "พิมพ์แล้ว"',
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "เปลี่ยนสถานะไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  // ✅ unmarkPrinted — เปรียบเทียบ UUID จาก DB กับ session โดยตรง
  const unmarkPrinted = async (order: OrderInterface) => {
    if (!isAdmin) return;

    if (hasStockReconciliation(order)) {
      await AppSwal.fire({
        icon: "warning",
        title: "ยังยกเลิกการพิมพ์ไม่ได้",
        text: "รายการนี้ตัดสต็อคกระดาษแล้ว กรุณายกเลิกการตัดสต็อคกระดาษก่อนยกเลิกสถานะพิมพ์",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    const [
      { data: freshOrder, error: fetchError },
      {
        data: { session },
      },
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("is_printed, printed_by, printed_by_user_id")
        .eq("id", order.id)
        .single(),
      supabase.auth.getSession(),
    ]);

    if (fetchError || !freshOrder || !session) {
      AppSwal.fire({
        icon: "error",
        title: "โหลดข้อมูลไม่สำเร็จ",
        text: "กรุณาลองใหม่",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    // ✅ เปรียบเทียบ UUID ตรงๆ ไม่มีปัญหา format
    if (
      freshOrder.printed_by_user_id &&
      freshOrder.printed_by_user_id !== session.user.id
    ) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์ยกเลิก",
        html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งนี้ถูกยืนยันพิมพ์โดย <b>${freshOrder.printed_by || "ไม่ระบุ"}</b></p>
                        <p class="mt-2 text-[#C8102E] font-medium">เฉพาะผู้ที่พิมพ์เท่านั้นที่สามารถยกเลิกได้</p>
                    </div>
                `,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    const result = await AppSwal.fire({
      title: "ยกเลิกการพิมพ์?",
      text: 'คุณต้องการยกเลิกสถานะ "พิมพ์ฉลากแล้ว" ใช่หรือไม่?',
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#C8102E",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ใช่, ยกเลิกการพิมพ์",
      cancelButtonText: "ปิด",
    });

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from("orders")
          .update({
            is_printed: false,
            printed_by: null,
            printed_by_user_id: null, // ✅ เคลียร์ UUID
            printed_at: null, // ✅ เคลียร์เวลา
          })
          .eq("id", order.id);
        if (error) throw error;

        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  is_printed: false,
                  printed_by: null,
                  printed_by_user_id: null,
                  printed_at: null,
                }
              : o,
          ),
        );
        AppSwal.fire({
          icon: "success",
          title: "ยกเลิกการพิมพ์สำเร็จ",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "เปลี่ยนสถานะไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  const unverifyOrder = async (order: OrderInterface) => {
    if (!isAdmin) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์",
        text: "เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    if (
      order.verified_by_user_id &&
      order.verified_by_user_id !== currentUserId
    ) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์ยกเลิก",
        html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งนี้ถูกตรวจสอบโดย <b>${order.verified_by}</b> แล้ว</p>
                        <p class="mt-2 text-[#C8102E] font-medium">เฉพาะผู้ที่ตรวจสอบเท่านั้นที่สามารถยกเลิกได้</p>
                    </div>
                `,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    const result = await AppSwal.fire({
      title: "ยกเลิกการตรวจสอบ?",
      text: "คุณต้องการยกเลิกการตรวจสอบคำสั่งพิมพ์ฉลากนี้หรือไม่?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#C8102E",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ใช่, ยกเลิก",
      cancelButtonText: "ปิด",
    });
    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from("orders")
          .update({
            is_verified: false,
            verified_by: null,
            verified_by_user_id: null,
            verified_at: null,
          })
          .eq("id", order.id);
        if (error) throw error;
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  is_verified: false,
                  verified_by: null,
                  verified_by_user_id: null,
                  verified_at: null,
                }
              : o,
          ),
        );
        AppSwal.fire({
          icon: "success",
          title: "ยกเลิกสำเร็จ!",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "ยกเลิกไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
          confirmButtonText: "รับทราบ",
          confirmButtonColor: "#0057B8",
        });
      }
    }
  };

  const handleCancelOrder = async (order: OrderInterface) => {
    // ✅ ตรวจสอบสิทธิ์การยกเลิก
    if (!isAdmin && order.created_by_user_id !== currentUserId) {
      AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์ยกเลิก",
        html: `
        <div class="text-sm text-gray-600 space-y-1 text-left">
          <p>คำสั่งนี้ถูกสั่งโดย <b>${order.created_by}</b></p>
          <p class="mt-2 text-[#C8102E] font-medium">
            คุณสามารถยกเลิกได้เฉพาะคำสั่งของตนเองเท่านั้น
          </p>
        </div>
      `,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    if (hasStockReconciliation(order)) {
      await AppSwal.fire({
        icon: "warning",
        title: "ยังยกเลิกคำสั่งไม่ได้",
        text: "รายการนี้ตัดสต็อคกระดาษแล้ว กรุณายกเลิกการตัดสต็อคกระดาษก่อนยกเลิกคำสั่ง",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }

    const result = await AppSwal.fire({
      title: "ยืนยันการยกเลิกสั่งพิมพ์?",
      text: "กรุณาระบุเหตุผลที่ต้องการยกเลิกคำสั่งนี้",
      icon: "warning",
      input: "text",
      inputPlaceholder: "ใส่เหตุผลการยกเลิกที่นี่...",
      showCancelButton: true,
      confirmButtonColor: "#C8102E",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ยืนยันยกเลิก",
      cancelButtonText: "ไม่ยกเลิก",
      inputValidator: (value) => {
        if (!value) return "คุณต้องระบุเหตุผลในการยกเลิก!";
      },
    });
    if (result.isConfirmed) {
      try {
        const now = new Date().toISOString();
        const editorName = getCurrentUserIdentifier();
        const summary = `ยกเลิกเพราะ: ${result.value}`;
        const updateData = {
          is_printed: false,
          printed_by: null,
          printed_by_user_id: null,
          printed_at: null,

          is_verified: false,
          verified_by: null,
          verified_by_user_id: null,
          verified_at: null,

          is_cancelled: true,
          updated_at: now,
          updated_by: editorName,
          edit_summary: summary,
        };
        const { error } = await supabase
          .from("orders")
          .update(updateData)
          .eq("id", order.id);
        if (error) throw error;
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, ...updateData } : o)),
        );
        AppSwal.fire({
          icon: "success",
          title: "ยกเลิกสำเร็จ",
          text: "รายการถูกยกเลิกและบันทึกเหตุผลเรียบร้อยแล้ว",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "ยกเลิกไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  const markNoFile = async (order: OrderInterface) => {
    const result = await AppSwal.fire({
      title: "แจ้งเตือนไม่มีไฟล์?",
      text: 'ระบบจะแจ้งสถานะว่า "ไม่มีไฟล์" ให้ทราบ (คำสั่งนี้จะไม่ถูกยกเลิก)',
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#FF6A13",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ยืนยัน",
      cancelButtonText: "ยกเลิก",
    });
    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from("orders")
          .update({ is_no_file: true })
          .eq("id", order.id);
        if (error) throw error;
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, is_no_file: true } : o)),
        );
        AppSwal.fire({
          icon: "success",
          title: "ทำเครื่องหมายสำเร็จ",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "ดำเนินการไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  const unmarkNoFile = async (order: OrderInterface) => {
    const result = await AppSwal.fire({
      title: "ยกเลิกการแจ้งเตือนไม่มีไฟล์?",
      text: 'สถานะ "ไม่มีไฟล์" จะถูกยกเลิก และคำสั่งจะกลับสู่ปกติ',
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#00B398",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ใช่, ยกเลิก",
      cancelButtonText: "ปิด",
    });

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from("orders")
          .update({ is_no_file: false })
          .eq("id", order.id);
        if (error) throw error;
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id ? { ...o, is_no_file: false } : o,
          ),
        );
        AppSwal.fire({
          icon: "success",
          title: "ยกเลิกการแจ้งเตือนสำเร็จ",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "ดำเนินการไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  const restoreOrder = async (order: OrderInterface) => {
    const result = await AppSwal.fire({
      title: "กู้คืนคำสั่งผลิต?",
      text: "รายการนี้จะถูกดึงกลับมาเป็นรายการใหม่เพื่อให้ดำเนินการต่อได้",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#00B398",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ยืนยันกู้คืน",
      cancelButtonText: "ยกเลิก",
    });
    if (result.isConfirmed) {
      try {
        const now = new Date().toISOString();
        const editorName = getCurrentUserIdentifier();
        const updateData = {
          is_cancelled: false,

          is_printed: false,
          printed_by: null,
          printed_by_user_id: null,
          printed_at: null,

          is_verified: false,
          verified_by: null,
          verified_by_user_id: null,
          verified_at: null,

          updated_at: now,
          updated_by: editorName,
          edit_summary: "กู้คืนคำสั่งพิมพ์ฉลาก (จากสถานะยกเลิก)",
        };
        const { error } = await supabase
          .from("orders")
          .update(updateData)
          .eq("id", order.id);
        if (error) throw error;
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, ...updateData } : o)),
        );
        AppSwal.fire({
          icon: "success",
          title: "กู้คืนสำเร็จ",
          text: "รายการกลับมาเป็นปกติแล้ว",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "กู้คืนไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  const deleteImage = async (order: OrderInterface) => {
    if (!isAdmin || !order.image_url) return;
    const result = await AppSwal.fire({
      title: "ยืนยันการลบรูปภาพ?",
      text: "รูปภาพนี้จะถูกลบออกจากระบบเป็นการถาวร",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#C8102E",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ใช่, ลบเลย!",
      cancelButtonText: "ยกเลิก",
    });
    if (result.isConfirmed) {
      try {
        const urlObj = new URL(order.image_url);
        const marker = "/order-images/";
        const markerIdx = urlObj.pathname.indexOf(marker);

        if (markerIdx === -1) {
          throw new Error(`ไม่สามารถระบุ path ของไฟล์ได้: ${order.image_url}`);
        }

        const filePath = urlObj.pathname.substring(markerIdx + marker.length);

        const { error: storageError } = await supabase.storage
          .from("order-images")
          .remove([filePath]);

        if (storageError) throw storageError;

        const { error: dbError } = await supabase
          .from("orders")
          .update({ image_url: null })
          .eq("id", order.id);

        if (dbError) throw dbError;

        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, image_url: null } : o)),
        );
        AppSwal.fire({
          icon: "success",
          title: "ลบรูปภาพสำเร็จ!",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "ลบรูปภาพไม่สำเร็จ",
          text: "กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  const formatThaiDateTimeFromISO = (isoString?: string | null): string => {
    if (!isoString) return "ไม่ระบุ";
    try {
      const hasTimezone =
        isoString.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(isoString);
      const normalized = hasTimezone ? isoString : isoString + "+07:00";
      const date = new Date(normalized);
      if (isNaN(date.getTime())) return isoString;
      const thaiDate = date.toLocaleDateString("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const thaiTime = date.toLocaleTimeString("th-TH", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return `${thaiDate}, ${thaiTime}`;
    } catch {
      return isoString;
    }
  };

  const formatWaitingDuration = (createdAt?: string | null): string => {
    if (!createdAt) return "ไม่ทราบเวลาที่สั่ง";

    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000),
    );
    const days = Math.floor(elapsedMinutes / 1_440);
    const hours = Math.floor((elapsedMinutes % 1_440) / 60);
    const minutes = elapsedMinutes % 60;

    if (days > 0) return `รอมาแล้ว ${days} วัน ${hours} ชม. ${minutes} นาที`;
    if (hours > 0) return `รอมาแล้ว ${hours} ชม. ${minutes} นาที`;
    return `รอมาแล้ว ${minutes} นาที`;
  };

  const formatToThaiDate = (dateString: string) => {
    if (!dateString) return "";
    try {
      const thaiDate = formatProductDate(dateString, {
        pattern: "DD/MM/YYYY",
        calendar: "buddhist",
      });
      const gregorianDate = formatProductDate(dateString, {
        pattern: "DD/MM/YYYY",
        calendar: "gregorian",
      });
      return (
        <>
          {thaiDate}
          <br />
          <span className="text-sm opacity-75">
            {gregorianDate}
          </span>
        </>
      );
    } catch {
      return dateString;
    }
  };

  const formatLastRefreshed = (date: Date): string => {
    return date.toLocaleTimeString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => prev + 10);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredOrders]);

  // เพิ่มใน useEffect ที่ฟัง searchTerm หรือ filter
  useEffect(() => {
    if (focusedOrderId) return;
    setVisibleCount(10);
  }, [searchTerm]); // ใส่ตัวแปร filter ที่มีด้วย

  useEffect(() => {
    if (!focusedOrderId) return;

    const card = document.getElementById(`order-card-${focusedOrderId}`);
    if (!card) return;

    card.scrollIntoView({ behavior: "smooth", block: "center" });
    const highlightTimeout = window.setTimeout(
      () => setFocusedOrderId(null),
      2200,
    );
    return () => window.clearTimeout(highlightTimeout);
  }, [focusedOrderId, visibleCount, searchTerm]);

  useEffect(() => {
    // รีเฟรชทุก 4 นาที
    const refreshInterval = setInterval(() => {
      loadOrders();
      setLastRefreshed(new Date());
      setCountdown(240);
    }, 240_000);

    // นับถอยหลังทุก 1 วินาที
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 240 : prev - 1));
    }, 1000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
    };
  }, []);

  useEffect(() => {
    const scrollContainer = document.querySelector("main");
    if (!scrollContainer) return;

    const handleScroll = () =>
      setShowScrollTop(scrollContainer.scrollTop > 420);
    handleScroll();
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="text-[#101820]">
      {/* Header Block */}
      <div className="bg-gradient-to-br from-[#00263A] via-[#003B56] to-[#0057B8] rounded-3xl shadow-lg p-5 md:p-6 mb-7 border border-[#00AEC7]/15 relative overflow-hidden">
        {/* Background decorative glowing circles */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#00AEC7]/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-[#00AEC7]/8 rounded-full blur-3xl pointer-events-none -ml-12 -mb-12" />

        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="hidden min-w-0 md:block">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-2 h-7 bg-gradient-to-b from-[#00AEC7] to-[#0057B8] rounded-full" />
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Dashboard
                  <span className="text-[#BFEFF5] ml-3 font-medium text-lg">
                    คำสั่งพิมพ์ชิ้นงาน
                  </span>
                </h1>
              </div>
              <p className="text-[12.5px] text-white/80 font-bold uppercase tracking-wider ml-5">
                Label &amp; Bag Stamp Production Control Center
              </p>
            </div>

            <div className="w-full min-w-0 space-y-3 md:max-w-[440px]">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาเลขลอต หรือชื่อสินค้า..."
                  className="w-full pl-9 pr-4 py-3 bg-white/10 hover:bg-white/15 focus:bg-white border border-white/15 focus:border-[#00AEC7] rounded-2xl text-white focus:text-[#101820] placeholder-white/65 focus:placeholder-[#8A9498] focus:outline-none focus:ring-4 focus:ring-[#00AEC7]/15 text-sm font-semibold transition-all duration-300 shadow-inner"
                />
              </div>
              {searchTerm && (
                <div className="mt-2 text-xs text-[#BFEFF5] flex justify-between items-center px-1">
                  <span className="font-medium">
                    พบ {filteredOrders.length} รายการ
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="text-[#BFEFF5] hover:text-white font-bold underline transition-colors"
                  >
                    ล้างการค้นหา
                  </button>
                </div>
              )}
              {/* Auto-refresh status bar */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/10 pt-2.5">
                <span className="text-[11px] text-white/75 font-medium flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00B398] animate-pulse" />
                  รีเฟรชล่าสุด:{" "}
                  <span className="text-white font-bold">
                    {formatLastRefreshed(lastRefreshed)}
                  </span>
                </span>

                <div className="flex items-center gap-2">
                  {/* Progress bar */}
                  <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#00AEC7] to-[#0057B8] rounded-full transition-all duration-1000"
                      style={{ width: `${(countdown / 240) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-[#BFEFF5] tabular-nums whitespace-nowrap">
                    รีเฟรชในอีก {Math.floor(countdown / 60)}:
                    {String(countdown % 60).padStart(2, "0")}
                  </span>
                  {/* ปุ่ม refresh ทันที */}
                  <button
                    type="button"
                    onClick={() => {
                      loadOrders();
                      setLastRefreshed(new Date());
                      setCountdown(240);
                    }}
                    className="text-[10px] font-bold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg border border-white/10 transition-all duration-200"
                    title="รีเฟรชทันที"
                  >
                    ↻ รีเฟรชเลย
                  </button>
                </div>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="w-full rounded-2xl border border-white/10 bg-[#00263A]/20 text-left">
              <button
                type="button"
                onClick={() =>
                  setIsPendingFilePanelOpen((previousOpen) => !previousOpen)
                }
                className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-white/5 md:px-4"
                aria-expanded={isPendingFilePanelOpen}
              >
                <div className="flex items-center gap-2 text-[#FFF0E7]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FF6A13]/20">
                    <FileQuestion className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-black">คำสั่งรอไฟล์</h2>
                    <p className="text-[10px] text-[#FFF0E7]/65">
                      กดเพื่อดูรายละเอียดและไปยังคำสั่ง
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[#FF6A13] px-3 py-1 text-base font-black text-white">
                    {pendingFileOrders.length} คำสั่ง
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[#FFF0E7] transition-transform ${isPendingFilePanelOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
              {isPendingFilePanelOpen && (
                <div className="border-t border-white/10 p-3 md:p-4">
                  {pendingFileOrders.length > 0 ? (
                    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                      {pendingFileOrders.map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => focusOrder(order)}
                          className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-[#FFF0E7] transition-colors hover:border-[#FF6A13]/60 hover:bg-white/10"
                          title={`ไปยังคำสั่งล็อต ${order.lot_number}`}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <span className="shrink-0 text-xs font-black">
                              ล็อต {order.lot_number}
                            </span>
                            <span className="min-w-0 truncate text-right text-[11px] font-semibold text-[#FFF0E7]/90">
                              {order.product_name}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] text-[#FFF0E7]/65">
                            <span className="truncate">
                              ผู้สั่ง: {order.created_by || "ไม่ระบุ"}
                            </span>
                            <span>
                              {formatThaiDateTimeFromISO(order.created_at)}
                            </span>
                            <span className="font-bold text-[#FFF0E7]">
                              {formatWaitingDuration(order.created_at)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#BFF2E9]">
                      ไม่มีคำสั่งที่รอไฟล์
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white/95 rounded-2xl shadow-lg p-12 text-center border border-slate-200/80">
          <div className="text-6xl mb-4 opacity-50">📦</div>
          <h2 className="text-2xl font-bold text-slate-500 tracking-tight">
            {searchTerm
              ? `ไม่พบเลขลอต "${searchTerm}"`
              : "ไม่มีคำสั่งฉลากในขณะนี้"}
          </h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredOrders.slice(0, visibleCount).map((order) => {
            const stockMeta = productMetaMap[order.product_id];
            const printingDisplay = deriveOrderPrintingDisplay(order);

            const canReconcileStock =
              Boolean(stockMeta?.paperType?.trim()) &&
              Number.isFinite(stockMeta?.qtyPerA3) &&
              (stockMeta?.qtyPerA3 ?? 0) > 0;

            // Status classes
            let borderLeftCls = "border-l-4 border-l-[#7C3AED]";
            let headerBgCls =
              "bg-[#F7F3FF] border-b border-[#7C3AED]/20 px-5 py-4.5 flex flex-col gap-3.5";
            if (order.is_cancelled) {
              borderLeftCls = "border-l-4 border-l-[#C8102E]";
              headerBgCls =
                "bg-[#FCEAEC] border-b border-[#C8102E]/15 px-5 py-4.5 flex flex-col gap-3.5";
            } else if (order.is_verified) {
              borderLeftCls = "border-l-4 border-l-[#00B398]";
              headerBgCls =
                "bg-[#E6F8F4] border-b border-[#00B398]/15 px-5 py-4.5 flex flex-col gap-3.5";
            } else if (order.is_no_file) {
              borderLeftCls = "border-l-4 border-l-[#FF6A13]";
              headerBgCls =
                "bg-[#FFF0E7] border-b border-[#FF6A13]/15 px-5 py-4.5 flex flex-col gap-3.5";
            } else if (order.is_printed) {
              borderLeftCls = "border-l-4 border-l-[#0057B8]";
              headerBgCls =
                "bg-[#EAF3FC] border-b border-[#0057B8]/20 px-5 py-4.5 flex flex-col gap-3.5";
            }

            return (
              <div
                id={`order-card-${order.id}`}
                key={order.id}
                className={`
                                bg-white border border-slate-200/85 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 rounded-2xl overflow-hidden flex flex-col group relative ${borderLeftCls}
                                ${order.is_cancelled ? "opacity-85" : ""}
                                ${focusedOrderId === order.id ? "ring-4 ring-[#F1C400] ring-offset-2 shadow-xl" : ""}
                            `}
              >
                {isAdmin && hasStockReconciliation(order) && (
                  <button
                    type="button"
                    onClick={() => setStockDetailOrder(order)}
                    className="relative z-20 w-full cursor-pointer rounded-none border-b border-[#008C78]/35 bg-[#00B398] px-3 py-1.5 text-left text-[#003B32] shadow-sm transition-colors hover:bg-[#00A58D] focus:outline-none focus:ring-2 focus:ring-[#00B398]/30 focus:ring-inset sm:absolute sm:top-0 sm:right-0 sm:w-[180px] sm:max-w-[50%] sm:rounded-bl-2xl sm:border-l sm:px-2.5"
                    title={`ตัดสต็อคโดย ${order.reconciled_by || "ไม่ระบุชื่อ"} เมื่อ ${formatThaiDateTimeFromISO(order.reconciled_at)}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-[10px] font-black">
                        ตัดสต็อค: {order.reconciled_by || "ไม่ระบุชื่อ"}
                      </span>
                    </div>
                  </button>
                )}
                <div className={headerBgCls}>
                  <div className="w-full">
                    <div className="flex flex-col gap-1.5 mb-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] font-black text-[#0057B8] bg-[#EAF3FC] px-2 py-0.5 rounded-lg border border-[#0057B8]/15 shrink-0 tracking-wider">
                          {order.product_id}
                        </span>
                        {order.order_type && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider shrink-0 shadow-sm border ${order.is_cancelled ? "bg-[#FCEAEC] text-[#9B0B23] border-[#C8102E]/20" : order.order_type === "พิมพ์ฉลาก" ? "bg-[#E5F8FB] text-[#007C8F] border-[#00AEC7]/25" : "bg-[#EAF3FC] text-[#0057B8] border-[#0057B8]/20"}`}
                          >
                            {order.order_type === "พิมพ์ฉลาก"
                              ? "🖨️ พิมพ์ฉลาก"
                              : "🔖 ปั๊มถุง"}
                          </span>
                        )}
                        {order.is_cancelled && (
                          <span className="bg-[#C8102E] text-white text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest shrink-0 shadow-sm">
                            ยกเลิกแล้ว
                          </span>
                        )}
                        {order.updated_at &&
                          !order.is_verified &&
                          !order.is_cancelled && (
                            <span className="bg-[#F1C400] text-[#101820] text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm animate-pulse">
                              แก้ไขแล้ว
                            </span>
                          )}
                        {(() => {
                          const isPending =
                            !order.is_printed &&
                            !order.is_verified &&
                            !order.is_cancelled;
                          const isRecent =
                            new Date().getTime() -
                              new Date(order.created_at).getTime() <
                            5 * 60 * 1000;
                          return (
                            isPending &&
                            isRecent && (
                              <span className="bg-[#7C3AED] text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm animate-bounce">
                                New
                              </span>
                            )
                          );
                        })()}
                      </div>
                      <h3 className="text-[16px] md:text-[17px] font-black text-[#00263A] leading-snug break-words">
                        {order.product_name}
                      </h3>
                    </div>
                    <h4 className="text-[14px] font-black text-[#00263A] tracking-tight flex items-center gap-2.5 mt-2.5">
                      <span className="text-[10px] font-bold text-[#0057B8] uppercase tracking-wider bg-[#EAF3FC] px-2 py-0.5 rounded-lg border border-[#0057B8]/15 shrink-0">
                        LOT NO.
                      </span>
                      <span className="text-[#00263A] font-black text-[16px] tracking-wide">
                        {order.lot_number}
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(order.lot_number);
                            setCopiedId(order.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="ml-1 w-6 h-6 flex items-center justify-center rounded-md text-[#0057B8]/60 hover:text-[#0057B8] hover:bg-[#EAF3FC] border border-transparent hover:border-[#0057B8]/15 transition-all duration-200"
                          title="คัดลอกเลขลอต"
                        >
                          {copiedId === order.id ? (
                            <Check className="w-4 h-4 text-[#00B398]" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </h4>
                  </div>
                  <div className="flex gap-1.5 items-center flex-wrap w-full bg-slate-100/60 border border-slate-200/40 rounded-xl p-1 shrink-0 justify-center">
                    {isAdmin && !order.is_cancelled && (
                      <>
                        {!order.is_verified ? (
                          <>
                            {!order.is_printed ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => markPrinted(order)}
                                  className="w-8 h-8 rounded-lg bg-transparent text-[#0057B8] hover:bg-[#EAF3FC] border border-transparent hover:border-[#0057B8]/20 flex items-center justify-center transition-all duration-200"
                                  title="พิมพ์แล้ว"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                                {!order.is_no_file ? (
                                  <button
                                    type="button"
                                    onClick={() => markNoFile(order)}
                                    className="w-8 h-8 rounded-lg bg-transparent text-[#FF6A13] hover:bg-[#FFF0E7] border border-transparent hover:border-[#FF6A13]/25 flex items-center justify-center transition-all duration-200"
                                    title="ไม่มีไฟล์"
                                  >
                                    <FileQuestion className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => unmarkNoFile(order)}
                                    className="w-8 h-8 rounded-lg bg-[#FFF0E7] text-[#FF6A13] hover:bg-[#FF6A13]/15 border border-[#FF6A13]/25 flex items-center justify-center transition-all duration-200 shadow-sm"
                                    title="ยกเลิกการแจ้งเตือนไม่มีไฟล์"
                                  >
                                    <Undo className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => unmarkPrinted(order)}
                                className="w-8 h-8 rounded-lg bg-transparent text-slate-600 hover:bg-slate-200/60 border border-transparent hover:border-slate-300/50 flex items-center justify-center transition-all duration-200"
                                title="ยกเลิกการพิมพ์"
                              >
                                <Undo className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => verifyOrder(order)}
                              className="w-8 h-8 rounded-lg bg-transparent text-[#00B398] hover:bg-[#E6F8F4] border border-transparent hover:border-[#00B398]/25 flex items-center justify-center transition-all duration-200"
                              title="ตรวจสอบเสร็จและตัดงานจบ"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => unverifyOrder(order)}
                            className="w-8 h-8 rounded-lg bg-transparent text-[#A88700] hover:bg-[#FFF8D6] border border-transparent hover:border-[#F1C400]/35 flex items-center justify-center transition-all duration-200"
                            title="ยกเลิกการตรวจสอบ"
                          >
                            <Undo className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                    {!order.is_cancelled &&
                      !order.is_verified &&
                      (isAdmin ||
                        order.created_by_user_id === currentUserId) && (
                        <button
                          type="button"
                          onClick={() => startEdit(order)}
                          className="w-8 h-8 rounded-lg bg-transparent text-[#0057B8] hover:bg-[#EAF3FC] border border-transparent hover:border-[#0057B8]/20 flex items-center justify-center transition-all duration-200"
                          title="แก้ไข"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    {isAdmin &&
                      !order.is_cancelled &&
                      (hasStockReconciliation(order) ? (
                        <button
                          type="button"
                          onClick={() => undoReconcile(order)}
                          className="w-8 h-8 rounded-lg bg-transparent text-[#C8102E] hover:bg-[#FCEAEC] border border-transparent hover:border-[#C8102E]/20 flex items-center justify-center transition-all duration-200"
                          title="ยกเลิกการตัดสต็อคกระดาษ"
                        >
                          <Undo className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startReconcile(order)}
                          disabled={!canReconcileStock}
                          className={`w-8 h-8 rounded-lg border border-transparent flex items-center justify-center transition-all duration-200 ${
                            canReconcileStock
                              ? "bg-transparent text-[#A88700] hover:bg-[#FFF8D6] hover:border-[#F1C400]/35"
                              : "bg-[#F0F3F4] text-[#B8C4C8] cursor-not-allowed"
                          }`}
                          title={
                            canReconcileStock
                              ? "บันทึกผลผลิต / ตัดสต็อคกระดาษ"
                              : "ต้องตั้งค่าประเภทกระดาษและจำนวนชิ้นต่อ A3 ที่หน้า Product ก่อน"
                          }
                        >
                          <Layers className="w-4 h-4" />
                        </button>
                      ))}

                    {!order.is_cancelled &&
                      !order.is_verified &&
                      (isAdmin ||
                        order.created_by_user_id === currentUserId) && (
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(order)}
                          className="w-8 h-8 rounded-lg bg-transparent text-[#C8102E] hover:bg-[#FCEAEC] border border-transparent hover:border-[#C8102E]/20 flex items-center justify-center transition-all duration-200"
                          title="ยกเลิกการสั่งพิมพ์"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    {isAdmin && order.is_cancelled && (
                      <button
                        type="button"
                        onClick={() => restoreOrder(order)}
                        className="w-8 h-8 rounded-lg bg-transparent text-[#00B398] hover:bg-[#E6F8F4] border border-transparent hover:border-[#00B398]/25 flex items-center justify-center transition-all duration-200"
                        title="กู้คืนคำสั่งพิมพ์"
                      >
                        <Undo className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteOrder(order.id)}
                        className="w-8 h-8 rounded-lg bg-transparent text-[#C8102E] hover:bg-[#FCEAEC] border border-transparent hover:border-[#C8102E]/20 flex items-center justify-center transition-all duration-200"
                        title="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-5 flex-1 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4 text-[13px]">
                    <span className="text-[#5F6B70] font-bold uppercase tracking-wider text-[11px] shrink-0">
                      เวลาสั่ง (Order Time):
                    </span>
                    <span className="font-bold text-slate-700 sm:text-right">
                      {formatThaiDateTimeFromISO(order.created_at)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 text-[13px]">
                    <span className="text-[#5F6B70] font-bold uppercase tracking-wider text-[11px] shrink-0">
                      ผู้สั่ง (Created By):
                    </span>
                    <span className="font-bold text-slate-700 flex items-center gap-1.5 flex-wrap sm:justify-end">
                      <UserCircle className="w-4 h-4 text-slate-400 inline" />{" "}
                      {order.created_by || "-"}
                      <span className="text-[10px] font-bold text-slate-400">
                        (
                        {order.created_by_department
                          ? order.created_by_department.split(" ")[0]
                          : "ไม่ระบุ"}
                        )
                      </span>
                    </span>
                  </div>
                  <div className="my-3 border-t border-slate-100"></div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 text-[13px]">
                    <span className="text-[#5F6B70] font-bold uppercase tracking-wider text-[11px] shrink-0">
                      วันที่ผลิต (Mfg Date):
                    </span>
                    <span className="font-bold text-slate-700 sm:text-right">
                      {formatToThaiDate(order.production_date)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 text-[13px]">
                    <span className="text-[#5F6B70] font-bold uppercase tracking-wider text-[11px] shrink-0">
                      วันหมดอายุ (Exp Date):
                    </span>
                    <span className="font-bold text-[#C8102E] sm:text-right shrink-0">
                      {formatToThaiDate(order.expiry_date)}
                    </span>
                  </div>
                  <div className="grid w-full grid-cols-1 gap-y-1 text-[13px] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6">
                    <span className="block text-[#5F6B70] font-bold uppercase tracking-wider text-[11px]">
                      รูปแบบการพิมพ์ (Print Format):
                    </span>
                    {printingDisplay.state === "invalid_config" ? (
                      <span className="block font-bold text-[#C8102E] sm:justify-self-end sm:text-right">
                        รูปแบบการพิมพ์ที่บันทึกไว้ไม่ถูกต้อง
                      </span>
                    ) : printingDisplay.state === "not_configured" ? (
                      <span className="block font-bold text-slate-500 sm:justify-self-end sm:text-right">
                        ยังไม่ได้กำหนด
                      </span>
                    ) : (
                      <div className="min-w-0 space-y-1 sm:justify-self-end sm:text-right">
                        <div className="min-w-0 whitespace-pre-line text-xs font-medium leading-snug text-slate-500">
                          {printingDisplay.formatDescription}
                        </div>
                        {printingDisplay.state === "ready" ? (
                          <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="flex min-w-0 max-w-full flex-col">
                              {printingDisplay.text.split(/\r?\n/).map((line, index) => (
                                <span
                                  key={`${order.id}-${index}`}
                                  className="max-w-full whitespace-pre-wrap break-normal font-sans text-lg font-bold leading-tight tabular-nums text-[#101820]"
                                >
                                  {line}
                                </span>
                              ))}
                            </span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  void copyPrintText(order.id, printingDisplay.text)
                                }
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent text-[#0057B8]/60 transition-all duration-200 hover:border-[#0057B8]/15 hover:bg-[#EAF3FC] hover:text-[#0057B8]"
                                aria-label="คัดลอกข้อความสำหรับพิมพ์"
                                title={
                                  copiedPrintTextId === order.id
                                    ? "คัดลอกแล้ว"
                                    : "คัดลอกข้อความสำหรับพิมพ์"
                                }
                              >
                                {copiedPrintTextId === order.id ? (
                                  <Check className="h-4 w-4 text-[#00B398]" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                        ) : printingDisplay.state === "incomplete" ? (
                          <div className="mt-1 font-semibold text-[#A88700]">
                            กรุณากรอก LOT เพื่อดูข้อความสำหรับพิมพ์
                          </div>
                        ) : (
                          <div className="mt-1 font-semibold text-[#C8102E]">
                            ไม่สามารถสร้างข้อความสำหรับพิมพ์ได้
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="my-3 border-t border-slate-100"></div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4 text-[13px]">
                    <span className="text-[#5F6B70] font-bold uppercase tracking-wider text-[11px] shrink-0">
                      อายุผลิตภัณฑ์ (Shelf Life):
                    </span>
                    <span className="font-bold text-[#0057B8] shrink-0">
                      {order.product_exp} เดือน
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4 text-[13px]">
                    <span className="text-[#5F6B70] font-bold uppercase tracking-wider text-[11px] shrink-0">
                      จำนวน (Quantity):
                    </span>
                    <span className="font-black text-xl text-[#00263A] shrink-0">
                      {order.quantity}
                    </span>
                  </div>

                  <EditHistory
                    orderId={order.id}
                    updatedAt={order.updated_at}
                    auditKey={auditKey}
                  />

                  {order.notes && order.notes !== "-" && (
                    <div className="mt-3 bg-[#FFF8D6] p-3 rounded-xl border border-[#F1C400]/30 text-[12.5px] text-[#6E5B00] shadow-inner">
                      <span className="font-bold text-[#5A4A00] block mb-1">
                        📝 หมายเหตุ:
                      </span>
                      <span className="text-[#6E5B00] font-medium">
                        {order.notes}
                      </span>
                    </div>
                  )}

                  {order.image_url && (
                    <div className="mt-4 pt-4 border-t border-slate-100 relative">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">
                          📷 ภาพตัวอย่างฉลาก:
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => deleteImage(order)}
                            className="text-[10px] font-bold bg-[#FCEAEC] text-[#C8102E] hover:bg-[#C8102E] hover:text-white px-2 py-1 rounded-lg border border-[#C8102E]/20 transition-all duration-300 flex items-center gap-1 shadow-sm"
                          >
                            <Trash2 className="w-3 h-3" /> ลบรูป
                          </button>
                        )}
                      </div>
                      <div className="w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex justify-center group/img relative shadow-sm">
                        <img
                          src={order.image_url}
                          alt={`ตัวอย่างฉลาก ${order.lot_number}`}
                          className="max-h-48 object-contain w-full hover:scale-105 transition-transform duration-500 cursor-pointer"
                          onClick={() =>
                            window.open(order.image_url || "", "_blank")
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ✅ Card Footer */}
                <div
                  className={`px-4 py-3 text-center tracking-wide font-bold
                                    ${
                                      order.is_cancelled
                                        ? "bg-[#C8102E] text-white shadow-inner"
                                        : order.is_verified
                                          ? "bg-[#00B398] text-[#003B32] shadow-inner"
                                          : order.is_no_file
                                            ? "bg-[#FF6A13] text-[#4A1E00] shadow-inner"
                                            : order.is_printed
                                              ? "bg-[#0057B8] text-white shadow-inner"
                                              : "bg-[#F0F3F4] text-[#5F6B70] border-t border-[#D9E1E2]"
                                    }`}
                >
                  {order.is_cancelled ? (
                    <span className="flex items-center justify-center gap-2 text-sm tracking-widest uppercase">
                      <X className="w-5 h-5 inline mr-1" />{" "}
                      คำสั่งพิมพ์นี้ถูกยกเลิกแล้ว
                    </span>
                  ) : order.is_verified ? (
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-sm text-center">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />{" "}
                          ผู้ปฏิบัติงาน:
                        </span>
                        {order.verified_by &&
                        order.verified_by.includes("(") ? (
                          <div className="flex items-center gap-2">
                            <span>
                              {order.verified_by
                                .substring(0, order.verified_by.indexOf("("))
                                .trim()}
                            </span>
                          </div>
                        ) : (
                          <span>{order.verified_by || "-"}</span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-current/80 bg-white/35 px-3 py-1 rounded-full border border-current/10">
                        วันที่และเวลาตรวจสอบ:{" "}
                        {formatThaiDateTimeFromISO(order.verified_at)}
                      </span>
                    </div>
                  ) : order.is_no_file ? (
                    <span className="flex items-center justify-center gap-2 text-sm">
                      <FileQuestion className="w-5 h-5 inline mr-1" />{" "}
                      แจ้งเตือน: ไม่มีไฟล์ฉลากสินค้ารายการนี้
                    </span>
                  ) : order.is_printed ? (
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="flex items-center justify-center gap-2 text-sm tracking-wider">
                        <Printer className="w-4 h-4" /> พิมพ์ฉลากแล้ว
                        รอตัดชิ้นงาน
                      </span>
                      {order.printed_by && (
                        <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1">
                          <span className="flex items-center gap-1 text-[11px] text-current/80">
                            ชื่อผู้พิมพ์ชิ้นงาน:
                            {order.printed_by.includes("(") ? (
                              <>
                                <span>
                                  {order.printed_by
                                    .substring(0, order.printed_by.indexOf("("))
                                    .trim()}
                                </span>
                              </>
                            ) : (
                              <span>{order.printed_by}</span>
                            )}
                          </span>
                          {order.printed_at && (
                            <span className="text-[10px] text-current/80 bg-white/35 px-2 py-0.5 rounded-full border border-current/10">
                              วันที่และเวลาพิมพ์:{" "}
                              {formatThaiDateTimeFromISO(order.printed_at)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="flex items-center justify-center gap-2 text-[12.5px] uppercase tracking-wider font-bold">
                      <Clock className="w-4 h-4 inline mr-1" />{" "}
                      กำลังรอการจัดทำชิ้นงาน
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {visibleCount < filteredOrders.length && (
        <div
          ref={sentinelRef}
          className="flex justify-center py-8 col-span-full"
        >
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-[#00AEC7] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
            <span className="text-slate-400 text-xs font-medium ml-1">
              กำลังโหลด {Math.min(10, filteredOrders.length - visibleCount)}{" "}
              รายการถัดไป...
            </span>
          </div>
        </div>
      )}

      {visibleCount >= filteredOrders.length && filteredOrders.length > 10 && (
        <div className="text-center py-6 text-slate-400 text-xs col-span-full">
          แสดงครบทั้ง {filteredOrders.length} รายการแล้ว
        </div>
      )}

      {/* Editing Dialog Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 w-full max-w-md animate-slide-up relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-[#EAF3FC] text-[#0057B8]">
                  <Edit2 className="w-5 h-5" />
                </span>
                <h2 className="text-lg font-black text-[#00263A] tracking-tight">
                  แก้ไขข้อมูลคำสั่งชิ้นงาน
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <section className="rounded-xl border border-[#00AEC7]/20 bg-[#EAF8FA] p-3 text-[12px]">
                <h3 className="font-black uppercase tracking-wider text-[#00263A]">
                  ข้อมูลผลิตภัณฑ์ของ Order นี้
                </h3>
                <dl className="mt-2 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-[#5F6B70]">อายุผลิตภัณฑ์</dt>
                    <dd className="text-right font-bold text-[#00263A]">
                      {editingCanonicalSnapshot?.valid
                        ? `${editingOrder.product_exp} เดือน`
                        : "ข้อมูลไม่ถูกต้อง"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-[#5F6B70]">รูปแบบวันหมดอายุจริง</dt>
                    <dd className="text-right font-bold text-[#00263A]">
                      {editingCanonicalSnapshot?.valid
                        ? editingCanonicalSnapshot.actualExpiryOffsetDays === -1
                          ? "ก่อนวันปกติ 1 วัน"
                          : "ตามอายุผลิตภัณฑ์"
                        : "ข้อมูลไม่ถูกต้อง"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-[#5F6B70]">รูปแบบการพิมพ์</dt>
                    <dd className="text-right font-bold text-[#00263A]">
                      {!editingPrintingSnapshot?.valid
                        ? "ข้อมูลไม่ถูกต้อง"
                        : editingPrintingConfig === null
                          ? "ยังไม่ได้กำหนด"
                          : PRINTING_PRESET_LABELS[editingPrintingConfig.preset]}
                    </dd>
                  </div>
                  {editingHasPrintedExpiry && (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[#5F6B70]">วันที่ EXP ที่พิมพ์</dt>
                      <dd className="text-right font-bold text-[#00263A]">
                        {editingPrintingConfig?.exp_offset_days === -1
                          ? "ก่อนวันหมดอายุจริง 1 วัน"
                          : "ตรงกับวันหมดอายุจริง"}
                      </dd>
                    </div>
                  )}
                </dl>
                {!editingCanonicalSnapshot?.valid && (
                  <p className="mt-3 rounded-lg border border-[#C8102E]/25 bg-[#FCEAEC] px-2.5 py-2 font-semibold text-[#9B0B23]" role="alert">
                    {editingCanonicalSnapshot?.message}
                  </p>
                )}
                {!editingPrintingSnapshot?.valid && (
                  <p className="mt-3 rounded-lg border border-[#C8102E]/25 bg-[#FCEAEC] px-2.5 py-2 font-semibold text-[#9B0B23]" role="alert">
                    {editingPrintingSnapshot?.message}
                  </p>
                )}
              </section>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  เลขลอตสินค้า (Lot Number)
                </label>
                <input
                  type="text"
                  value={editingOrder.lot_number}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      lot_number: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#101820] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all duration-200 shadow-sm"
                />
              </div>

              {/* ประเภทคำสั่ง */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  ประเภทคำสั่ง (Order Type)
                </label>
                <div className="flex gap-3">
                  <label
                    className={`flex-1 flex cursor-pointer items-center justify-center py-3 px-4 border rounded-xl font-bold transition-all text-xs gap-2 ${editingOrder.order_type === "พิมพ์ฉลาก" ? "bg-[#0057B8] text-white border-[#0057B8] shadow-md shadow-[#0057B8]/15" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/50"}`}
                  >
                    <input
                      type="radio"
                      name="edit_orderType"
                      value="พิมพ์ฉลาก"
                      checked={editingOrder.order_type === "พิมพ์ฉลาก"}
                      onChange={(e) =>
                        setEditingOrder({
                          ...editingOrder,
                          order_type: e.target.value,
                        })
                      }
                      className="hidden"
                    />
                    🖨️ พิมพ์ฉลาก
                  </label>
                  <label
                    className={`flex-1 flex cursor-pointer items-center justify-center py-3 px-4 border rounded-xl font-bold transition-all text-xs gap-2 ${editingOrder.order_type === "ปั๊มถุง" ? "bg-[#00263A] text-white border-[#00263A] shadow-md shadow-[#00263A]/15" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/50"}`}
                  >
                    <input
                      type="radio"
                      name="edit_orderType"
                      value="ปั๊มถุง"
                      checked={editingOrder.order_type === "ปั๊มถุง"}
                      onChange={(e) =>
                        setEditingOrder({
                          ...editingOrder,
                          order_type: e.target.value,
                        })
                      }
                      className="hidden"
                    />
                    🔖 ปั๊มถุง
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  จำนวนสั่งทำ (Quantity)
                </label>
                <input
                  type="number"
                  min="1"
                  value={editingQuantity}
                  onChange={(e) => setEditingQuantity(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#101820] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all duration-200 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  วันที่ผลิต (Production Date)
                </label>
                <input
                  type="date"
                  value={editingOrder.production_date || ""}
                  onChange={(e) => {
                    if (!editingCanonicalSnapshot?.valid) return;
                    const newDate = e.target.value;
                    setEditingOrder({
                      ...editingOrder,
                      production_date: newDate,
                      expiry_date: calculateSnapshotExpiryDate(
                        newDate,
                        editingOrder,
                      ),
                    });
                  }}
                  disabled={!editingCanonicalSnapshot?.valid}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#101820] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all duration-200 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
                {!editingCanonicalSnapshot?.valid && (
                  <p className="mt-2 text-xs font-semibold text-[#C8102E]" role="alert">
                    ไม่สามารถแก้ไขวันที่ผลิตได้จนกว่าจะตรวจสอบข้อมูลผลิตภัณฑ์ของ Order นี้
                  </p>
                )}
                {editingOrder.expiry_date && (
                  <p className="mt-2 text-xs text-[#C8102E] font-bold flex items-center gap-1">
                    <span>💡</span> วันหมดอายุใหม่:{" "}
                    {formatCalendarDateForSummary(editingOrder.expiry_date)}
                  </p>
                )}
              </div>

              {editingOrder.production_date && editingOrder.expiry_date && (
                <section className="rounded-xl border border-[#0057B8]/15 bg-[#EAF3FC] p-3 text-[12px]" aria-live="polite">
                  <h3 className="font-black uppercase tracking-wider text-[#00263A]">
                    วันที่และข้อความสำหรับพิมพ์
                  </h3>
                  <dl className="mt-2 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[#5F6B70]">วันที่ผลิต</dt>
                      <dd className="text-right font-bold text-[#00263A]">
                        {formatCalendarDateForSummary(editingOrder.production_date)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[#5F6B70]">วันหมดอายุจริง</dt>
                      <dd className="text-right font-bold text-[#00263A]">
                        {formatCalendarDateForSummary(editingOrder.expiry_date)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 border-t border-[#0057B8]/15 pt-3">
                    <p className="font-semibold text-[#5F6B70]">รูปแบบที่ต้องพิมพ์</p>
                    {!editingPrintingSnapshot?.valid && (
                      <p className="mt-1 font-semibold text-[#C8102E]">
                        ไม่สามารถสร้างตัวอย่างการพิมพ์ได้ กรุณาตรวจสอบข้อมูลผลิตภัณฑ์ของ Order นี้
                      </p>
                    )}
                    {editingPrintingPreview?.status === "ready" && (
                      <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 font-mono text-[13px] text-[#00263A]">
                        {editingPrintingPreview.text}
                      </p>
                    )}
                    {editingPrintingPreview?.status === "not_configured" && (
                      <p className="mt-1 text-[#5F6B70]">ยังไม่ได้กำหนดรูปแบบการพิมพ์</p>
                    )}
                    {editingPrintingPreview?.status === "incomplete" && (
                      <p className="mt-1 font-semibold text-[#A88700]">
                        กรุณากรอก LOT เพื่อดูข้อความสำหรับพิมพ์
                      </p>
                    )}
                    {(editingPrintingPreview?.status === "invalid_config" ||
                      editingPrintingPreview?.status === "invalid_input") && (
                      <p className="mt-1 font-semibold text-[#C8102E]">
                        ไม่สามารถสร้างตัวอย่างการพิมพ์ได้ กรุณาตรวจสอบข้อมูลผลิตภัณฑ์ของ Order นี้
                      </p>
                    )}
                  </div>
                </section>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  หมายเหตุ (Notes)
                </label>
                <textarea
                  value={editingOrder.notes || ""}
                  onChange={(e) =>
                    setEditingOrder({ ...editingOrder, notes: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#101820] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all duration-200 resize-none shadow-sm"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold text-xs transition duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={isSaving}
                className="flex-1 bg-[#0057B8] hover:bg-[#004A9F] text-white py-3 rounded-xl font-bold text-xs shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition duration-300"
              >
                {isSaving ? "กำลังบันทึก..." : "💾 บันทึกการแก้ไข"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && stockDetailOrder && (
        <Modal
          id="stock-detail-modal"
          title="รายละเอียดการตัดสต็อค"
          onClose={() => setStockDetailOrder(null)}
          size="sm"
        >
          {(() => {
            const goodA3 = stockDetailOrder.good_a3 || 0;
            const wasteA3 = stockDetailOrder.waste_a3 || 0;
            const totalSheets = goodA3 + wasteA3;
            const qtyPerA3 = productMetaMap[stockDetailOrder.product_id]?.qtyPerA3 || 0;
            const excessQty = Math.max(
              0,
              goodA3 * qtyPerA3 -
                (stockDetailOrder.quantity || 0) -
                (stockDetailOrder.waste_qty || 0),
            );

            return (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#00B398]/20 bg-[#E6F8F4] p-3">
                  <div className="text-[11px] font-bold text-[#008C78]">
                    ตัดสต็อคโดย
                  </div>
                  <div className="mt-0.5 break-words text-sm font-black text-[#003B32]">
                    {stockDetailOrder.reconciled_by || "ไม่ระบุชื่อ"}
                  </div>
                  <div className="mt-1 text-[11px] text-[#008C78]">
                    {formatThaiDateTimeFromISO(stockDetailOrder.reconciled_at)}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-500">สินค้า</span>
                    <span className="max-w-[65%] text-right font-bold text-[#0057B8]">
                      {stockDetailOrder.product_name || "ไม่ระบุ"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-500">ลอต</span>
                    <span className="font-bold text-[#0057B8]">
                      {stockDetailOrder.lot_number || "ไม่ระบุ"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-500">ประเภทกระดาษ</span>
                    <span className="text-right font-bold text-[#0057B8]">
                      {stockDetailOrder.paper_type || "ไม่ระบุ"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-500">ตัดออกทั้งหมด</span>
                    <span className="font-black text-slate-800">
                      {totalSheets.toLocaleString()} ใบ
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-500">กระดาษดี</span>
                    <span className="font-bold text-[#008C78]">
                      {goodA3.toLocaleString()} ใบ
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-500">กระดาษเสีย</span>
                    <span className="font-bold text-[#C8102E]">
                      {wasteA3.toLocaleString()} ใบ
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-500">จำนวนเกิน</span>
                    <span className="font-bold text-[#A88700]">
                      {excessQty.toLocaleString()} ชิ้น
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">ชิ้นเสีย</span>
                    <span className="font-bold text-[#C8102E]">
                      {(stockDetailOrder.waste_qty || 0).toLocaleString()} ชิ้น
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ✅ Reconcile Modal — บันทึกผลผลิต/ตัดสต็อคกระดาษ (เฉพาะ isAdmin) */}
      {isAdmin && reconcilingOrder && reconcileCalculation && (
        <Modal
          id="reconcile-modal"
          title="บันทึกผลผลิต / ตัดสต็อคกระดาษ"
          onClose={() => setReconcilingOrder(null)}
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[12.5px] space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">ลอต</span>
                <span className="font-bold text-slate-700">
                  {reconcilingOrder.lot_number}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">สินค้า</span>
                <span className="font-bold text-slate-700">
                  {reconcilingOrder.product_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">จำนวนสั่งทำ (เป้าหมาย)</span>
                <span className="font-bold text-slate-700">
                  {reconcileCalculation.target}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  ประเภทกระดาษ (ล็อคจาก Product)
                </span>
                <span className="font-bold text-[#0057B8]">
                  {reconcileCalculation.paperType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">อัตราส่วน</span>
                <span className="font-bold text-slate-700">
                  {reconcileCalculation.qtyPerA3} ชิ้น/แผ่น
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  ชิ้นเสีย (Waste Qty)
                </label>
                <input
                  type="number"
                  min="0"
                  value={reconcileForm.wasteQty}
                  onChange={(e) =>
                    setReconcileForm((prev) => ({
                      ...prev,
                      wasteQty: e.target.value,
                    }))
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  กระดาษเสีย (Waste A3, ใบ)
                </label>
                <input
                  type="number"
                  min="0"
                  value={reconcileForm.wasteA3}
                  onChange={(e) =>
                    setReconcileForm((prev) => ({
                      ...prev,
                      wasteA3: e.target.value,
                    }))
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10"
                  placeholder="0"
                />
              </div>
            </div>

            {(parseInt(reconcileForm.wasteQty) || 0) > 0 && (
              <div>
                <label
                  className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                    reconcileErrors.wasteQtyRemark
                      ? "text-[#C8102E]"
                      : "text-slate-500"
                  }`}
                >
                  หมายเหตุชิ้นเสีย <span className="text-[#C8102E]">*</span>
                </label>
                <input
                  type="text"
                  value={reconcileForm.wasteQtyRemark}
                  onChange={(e) => {
                    setReconcileForm((prev) => ({
                      ...prev,
                      wasteQtyRemark: e.target.value,
                    }));
                    setReconcileErrors((prev) => ({
                      ...prev,
                      wasteQtyRemark: undefined,
                    }));
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg text-[13px] font-medium focus:outline-none transition-colors ${
                    reconcileErrors.wasteQtyRemark
                      ? "bg-[#FCEAEC] border-2 border-[#C8102E]/45 focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/15"
                      : "bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10"
                  }`}
                  placeholder="เช่น สีเพี้ยน"
                />
                {reconcileErrors.wasteQtyRemark && (
                  <p className="mt-1 text-[11px] text-[#C8102E] font-medium">
                    {reconcileErrors.wasteQtyRemark}
                  </p>
                )}
              </div>
            )}
            {(parseInt(reconcileForm.wasteA3) || 0) > 0 && (
              <div>
                <label
                  className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                    reconcileErrors.wasteA3Remark
                      ? "text-[#C8102E]"
                      : "text-slate-500"
                  }`}
                >
                  หมายเหตุกระดาษเสีย <span className="text-[#C8102E]">*</span>
                </label>

                <input
                  type="text"
                  value={reconcileForm.wasteA3Remark}
                  onChange={(e) => {
                    setReconcileForm((prev) => ({
                      ...prev,
                      wasteA3Remark: e.target.value,
                    }));

                    setReconcileErrors((prev) => ({
                      ...prev,
                      wasteA3Remark: undefined,
                    }));
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg text-[13px] font-medium focus:outline-none transition-colors ${
                    reconcileErrors.wasteA3Remark
                      ? "bg-[#FCEAEC] border-2 border-[#C8102E]/45 focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/15"
                      : "bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10"
                  }`}
                  placeholder="เช่น กระดาษยับตอนป้อนเครื่อง"
                />

                {reconcileErrors.wasteA3Remark && (
                  <p className="mt-1 text-[11px] font-medium text-[#C8102E]">
                    {reconcileErrors.wasteA3Remark}
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                กระดาษดีเพิ่มเติม (ถ้ามี, ใบ)
              </label>
              <input
                type="number"
                min="0"
                value={reconcileForm.goodA3Extra}
                onChange={(e) =>
                  setReconcileForm((prev) => ({
                    ...prev,
                    goodA3Extra: e.target.value,
                  }))
                }
                onWheel={(e) => e.currentTarget.blur()}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-medium focus:bg-white focus:outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10"
                placeholder="0"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                ปกติระบบคำนวณกระดาษดีให้อัตโนมัติจากจำนวนสั่งทำ
                ใส่ช่องนี้เฉพาะกรณีต้องการเพิ่มพิเศษ
              </p>
            </div>

            <div className="bg-[#E6F8F4] border border-[#00B398]/25 rounded-xl p-3 flex flex-col gap-1.5 text-[12.5px]">
              {/* ซ่อน ชิ้นเกิน ถ้าเป็น 0 */}
              {reconcileCalculation.excessQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#A88700]">ชิ้นเกิน (Excess)</span>
                  <span className="font-black text-[#A88700]">
                    {reconcileCalculation.excessQty} ชิ้น
                  </span>
                </div>
              )}

              {/* ซ่อน ชิ้นเสีย ถ้าเป็น 0 */}
              {reconcileCalculation.wasteQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#C8102E]">ชิ้นเสีย (Waste Qty)</span>
                  <span className="font-black text-[#C8102E]">
                    {reconcileCalculation.wasteQty} ชิ้น
                  </span>
                </div>
              )}

              {/* เส้นคั่นบางๆ จะแสดงก็ต่อเมื่อมีข้อมูลข้างบน และมีข้อมูลข้างล่าง */}
              {(reconcileCalculation.excessQty > 0 ||
                reconcileCalculation.wasteQty > 0) &&
                (reconcileCalculation.goodA3 > 0 ||
                  reconcileCalculation.wasteA3 > 0) && (
                  <div className="border-t border-[#00B398]/20 my-0.5"></div>
                )}

              {/* ซ่อน กระดาษดี ถ้าเป็น 0 (เผื่อไว้) */}
              {reconcileCalculation.goodA3 > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#008C78]">กระดาษดี (A3)</span>
                  <span className="font-black text-[#008C78]">
                    {reconcileCalculation.goodA3} ใบ
                  </span>
                </div>
              )}

              {/* ซ่อน กระดาษเสีย ถ้าเป็น 0 */}
              {reconcileCalculation.wasteA3 > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#C8102E]">กระดาษเสีย (A3)</span>
                  <span className="font-black text-[#C8102E]">
                    {reconcileCalculation.wasteA3} ใบ
                  </span>
                </div>
              )}

              <div className="border-t border-[#00B398]/20 my-0.5"></div>

              {/* สรุปยอดรวม (ให้แสดงเสมอเพื่อให้เห็นจำนวนตัดสต็อคที่ชัดเจน) */}
              <div className="flex justify-between">
                <span className="text-[#008C78] font-bold">
                  รวมตัดสต็อคทั้งหมด
                </span>
                <span className="font-black text-[#008C78]">
                  {reconcileCalculation.sheetsNeeded} ใบ
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReconcilingOrder(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold text-xs transition duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submitReconcile}
                disabled={isSubmittingReconcile}
                className="flex-1 bg-[#0057B8] hover:bg-[#004A9F] text-white py-3 rounded-xl font-bold text-xs shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition duration-300"
              >
                {isSubmittingReconcile
                  ? "กำลังบันทึก..."
                  : "📄 บันทึกและตัดสต็อค"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showScrollTop && (
        <button
          type="button"
          onClick={() =>
            document
              .querySelector("main")
              ?.scrollTo({ top: 0, behavior: "smooth" })
          }
          className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#00263A] text-white shadow-xl ring-1 ring-[#00AEC7]/20 transition-all duration-200 hover:-translate-y-1 hover:bg-[#0057B8] focus:outline-none focus:ring-4 focus:ring-[#00AEC7]/25"
          title="เลื่อนกลับด้านบน"
          aria-label="เลื่อนกลับด้านบน"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
