"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Swal from "sweetalert2";
import Modal from "../components/Modal";
import { supabase } from "@/lib/supabase";
import {
  calculateProductExpiryDate,
  parseProductShelfLifeMonths,
  type ActualExpiryOffsetDays,
} from "@/lib/productDate";
import {
  type DateFormatSpec,
  type PrintingConfigV1,
  type ProductPrintingConfig,
  validatePrintingConfig,
} from "@/lib/productPrinting";
import PrintingConfigBuilder from "./PrintingConfigBuilder";
import {
  Search,
  Plus,
  X,
  Check,
  Edit2,
  Trash2,
  Package,
  ListChecks,
} from "lucide-react";

const AppSwal = Swal.mixin({
  confirmButtonColor: "#0057B8",
  cancelButtonColor: "#75787B",
  confirmButtonText: "รับทราบ",
});

const PAPER_TYPES = [
  "สติกเกอร์ RONDA PG-88G (ไม่เหนียว)",
  "สติกเกอร์ MCL-AG-LP K-TAK (เหนียว)",
  "130 แกรม",
  "200 แกรม",
  "300 แกรม",
  "350 แกรม",
  "สติกเกอร์ PP",
];

export interface FgcodeInterface {
  id: string;
  name: string;
  exp: string;
  qty_per_a3?: number | null;
  default_paper_type?: string | null;
  expiry_offset_days?: ActualExpiryOffsetDays | null;
  printing_config?: ProductPrintingConfig;
}

const ACTUAL_EXPIRY_OPTIONS: Array<{
  value: ActualExpiryOffsetDays;
  label: string;
}> = [
  { value: 0, label: "ตามอายุผลิตภัณฑ์" },
  { value: -1, label: "ก่อนวันปกติ 1 วัน" },
];

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJsonStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}

function hasSamePrintingConfig(
  left: ProductPrintingConfig,
  right: ProductPrintingConfig,
): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function actualExpiryRuleLabel(value: ActualExpiryOffsetDays): string {
  return ACTUAL_EXPIRY_OPTIONS.find((option) => option.value === value)?.label ?? "ไม่ระบุ";
}

function isDateOnlyPrintingConfig(
  config: ProductPrintingConfig,
): config is PrintingConfigV1 {
  return (
    config !== null &&
    config.preset === "date_only" &&
    validatePrintingConfig(config).valid
  );
}

function calendarLabel(calendar: DateFormatSpec["calendar"]): string {
  return calendar === "buddhist" ? "พ.ศ." : "ค.ศ.";
}

function monthCaseLabel(monthCase: DateFormatSpec["monthCase"] | undefined): string {
  return monthCase === "upper" ? "ตัวพิมพ์ใหญ่" : "ตัวพิมพ์ปกติ";
}

function printingConfigModeLabel(config: ProductPrintingConfig): string {
  if (config === null) return "ไม่มีรูปแบบพิเศษ";
  return isDateOnlyPrintingConfig(config)
    ? "พิมพ์วันที่ผลิต"
    : "รูปแบบการพิมพ์เดิม";
}

function dateOnlyFormat(config: ProductPrintingConfig): DateFormatSpec | null {
  return isDateOnlyPrintingConfig(config) ? config.mfg_format : null;
}

function formatThaiDate(canonicalDate: string): string {
  const [year, month, day] = canonicalDate.split("-");
  return `${day}/${month}/${year}`;
}

export default function FgcodeManagement() {
  const [fgcodes, setFgcodes] = useState<FgcodeInterface[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingFgcode, setEditingFgcode] = useState<FgcodeInterface | null>(
    null,
  );
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [exp, setExp] = useState("");
  const [qtyPerA3, setQtyPerA3] = useState("");
  const [defaultPaperType, setDefaultPaperType] = useState("");
  const [expiryOffsetDays, setExpiryOffsetDays] = useState<ActualExpiryOffsetDays>(0);
  const [printingConfig, setPrintingConfig] = useState<ProductPrintingConfig>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [userRole, setUserRole] = useState<string>("user");
  const [, setUserName] = useState("");
  const [, setEmployeeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(20);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const resetForm = () => {
    setEditingFgcode(null);
    setId("");
    setName("");
    setExp("");
    setQtyPerA3("");
    setDefaultPaperType("");
    setExpiryOffsetDays(0);
    setPrintingConfig(null);
  };

  const previewDates = useMemo(() => {
    try {
      parseProductShelfLifeMonths(exp);
      return {
        actual: calculateProductExpiryDate({
          productionDate: "2026-12-12",
          shelfLifeMonths: exp,
          actualExpiryOffsetDays: expiryOffsetDays,
        }),
      };
    } catch {
      return { actual: null };
    }
  }, [exp, expiryOffsetDays]);

  const fetchUserRole = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data } = await supabase
        .from("users")
        .select("role, name, employee_id")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setUserRole(data.role || "user");
        setUserName(data.name || "");
        setEmployeeId(data.employee_id || "");
      }
    }
  };

  const fetchFgcodes = async () => {
    try {
      setIsLoading(true);
      let allData: FgcodeInterface[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("fgcode")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += pageSize;
          hasMore = data.length === pageSize;
        } else hasMore = false;
      }
      setFgcodes(allData);
    } catch {
      AppSwal.fire({
        icon: "error",
        title: "ผิดพลาด",
        text: "ไม่สามารถดึงข้อมูลรหัสสินค้าได้",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFgcodes();
    fetchUserRole();
  }, []);

  const isAdminRole =
    userRole === "moderator" || userRole === "assistant_moderator";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentEditing = editingFgcode;
    const cleanId = id.trim();
    const cleanName = name.trim();
    const cleanExp = exp.trim();
    if (!cleanId || !cleanName || !cleanExp) {
      AppSwal.fire({
        icon: "warning",
        title: "ข้อมูลไม่ครบ",
        text: "กรุณากรอกข้อมูลให้ครบทุกช่อง",
      });
      return;
    }
    try {
      parseProductShelfLifeMonths(cleanExp);
    } catch {
      AppSwal.fire({
        icon: "warning",
        title: "อายุผลิตภัณฑ์ไม่ถูกต้อง",
        text: "อายุผลิตภัณฑ์ต้องเป็นจำนวนเต็มเดือนที่มากกว่า 0",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      return;
    }
    if (expiryOffsetDays !== 0 && expiryOffsetDays !== -1) {
      await AppSwal.fire({
        icon: "warning",
        title: "รูปแบบวันหมดอายุไม่ถูกต้อง",
        text: "กรุณาเลือกรูปแบบวันหมดอายุที่กำหนดไว้",
      });
      return;
    }
    const printingConfigValidation = validatePrintingConfig(printingConfig);
    if (!printingConfigValidation.valid) {
      await AppSwal.fire({
        icon: "warning",
        title: "รูปแบบการพิมพ์ไม่ถูกต้อง",
        text: "กรุณาตรวจสอบรูปแบบการพิมพ์ก่อนบันทึก",
      });
      return;
    }
    const thaiCharRegex = /[ก-๙]/;
    if (thaiCharRegex.test(cleanId)) {
      await AppSwal.fire({
        icon: "warning",
        title: "รหัสสินค้าไม่ถูกต้อง",
        text: "รหัสสินค้าต้องเป็นภาษาอังกฤษ ตัวเลข หรือเครื่องหมายขีด (-) เท่านั้น",
        confirmButtonText: "รับทราบ",
      });
      setShowModal(true);
      return;
    }
    if (!isAdminRole && thaiCharRegex.test(cleanName)) {
      await AppSwal.fire({
        icon: "warning",
        title: "ไม่อนุญาตให้ใช้ภาษาไทย",
        text: "ชื่อสินค้าภาษาไทยไม่อนุญาตให้ใช้",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
      setShowModal(true);
      return;
    }
    if (currentEditing) {
      const cleanQtyPerA3 = isAdminRole ? qtyPerA3.trim() || null : null;
      const currentQtyPerA3 =
        currentEditing.qty_per_a3 != null
          ? String(currentEditing.qty_per_a3)
          : null;
      const noAdminFieldChange =
        !isAdminRole ||
        ((cleanQtyPerA3 ?? "") === (currentQtyPerA3 ?? "") &&
          (defaultPaperType || "") ===
            (currentEditing.default_paper_type || ""));
      if (
        cleanName === (currentEditing.name || "") &&
        cleanExp === (currentEditing.exp || "") &&
        cleanId === currentEditing.id &&
        expiryOffsetDays === (currentEditing.expiry_offset_days ?? 0) &&
        hasSamePrintingConfig(
          printingConfig,
          currentEditing.printing_config ?? null,
        ) &&
        noAdminFieldChange
      ) {
        await AppSwal.fire({
          icon: "info",
          title: "ไม่มีการเปลี่ยนแปลง",
          text: "คุณยังไม่ได้แก้ไขข้อมูลใดๆ",
          confirmButtonText: "รับทราบ",
        });
        setShowModal(true);
        return;
      }

      const escapeHtml = (value: string) =>
        value.replace(
          /[&<>'"]/g,
          (character) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              "'": "&#39;",
              '"': "&quot;",
            })[character] || character,
        );
      const changes: Array<{ label: string; from: string; to: string }> = [];
      if (cleanName !== (currentEditing.name || "")) {
        changes.push({
          label: "ชื่อสินค้า",
          from: currentEditing.name || "ไม่ระบุ",
          to: cleanName,
        });
      }
      if (cleanExp !== (currentEditing.exp || "")) {
        changes.push({
          label: "อายุผลิตภัณฑ์",
          from: `${currentEditing.exp || "ไม่ระบุ"} เดือน`,
          to: `${cleanExp} เดือน`,
        });
      }
      const currentExpiryOffsetDays = currentEditing.expiry_offset_days ?? 0;
      if (expiryOffsetDays !== currentExpiryOffsetDays) {
        changes.push({
          label: "วันหมดอายุจริง",
          from: actualExpiryRuleLabel(currentExpiryOffsetDays),
          to: actualExpiryRuleLabel(expiryOffsetDays),
        });
      }
      const currentPrintingConfig = currentEditing.printing_config ?? null;
      if (!hasSamePrintingConfig(printingConfig, currentPrintingConfig)) {
        const currentDateOnlyFormat = dateOnlyFormat(currentPrintingConfig);
        const nextDateOnlyFormat = dateOnlyFormat(printingConfig);

        if (currentDateOnlyFormat && nextDateOnlyFormat) {
          if (currentDateOnlyFormat.pattern !== nextDateOnlyFormat.pattern) {
            changes.push({
              label: "รูปแบบวันที่ผลิต",
              from: currentDateOnlyFormat.pattern,
              to: nextDateOnlyFormat.pattern,
            });
          }
          if (currentDateOnlyFormat.calendar !== nextDateOnlyFormat.calendar) {
            changes.push({
              label: "ปฏิทิน",
              from: calendarLabel(currentDateOnlyFormat.calendar),
              to: calendarLabel(nextDateOnlyFormat.calendar),
            });
          }
          if (currentDateOnlyFormat.monthCase !== nextDateOnlyFormat.monthCase) {
            changes.push({
              label: "ตัวพิมพ์ชื่อเดือน",
              from: monthCaseLabel(currentDateOnlyFormat.monthCase),
              to: monthCaseLabel(nextDateOnlyFormat.monthCase),
            });
          }
        } else {
          changes.push({
            label: "รูปแบบการพิมพ์",
            from: printingConfigModeLabel(currentPrintingConfig),
            to: printingConfigModeLabel(printingConfig),
          });

          if (nextDateOnlyFormat) {
            changes.push({
              label: "รูปแบบวันที่ผลิต",
              from: currentDateOnlyFormat?.pattern || "ไม่ระบุ",
              to: nextDateOnlyFormat.pattern,
            });
            changes.push({
              label: "ปฏิทิน",
              from: currentDateOnlyFormat
                ? calendarLabel(currentDateOnlyFormat.calendar)
                : "ไม่ระบุ",
              to: calendarLabel(nextDateOnlyFormat.calendar),
            });
          }
        }
      }
      if (isAdminRole && (cleanQtyPerA3 ?? "") !== (currentQtyPerA3 ?? "")) {
        changes.push({
          label: "จำนวนชิ้นต่อแผ่น A3",
          from: currentQtyPerA3 || "ไม่ระบุ",
          to: cleanQtyPerA3 || "ไม่ระบุ",
        });
      }
      if (
        isAdminRole &&
        (defaultPaperType || "") !== (currentEditing.default_paper_type || "")
      ) {
        changes.push({
          label: "ประเภทกระดาษ",
          from: currentEditing.default_paper_type || "ไม่ระบุ",
          to: defaultPaperType || "ไม่ระบุ",
        });
      }
      const changesHtml = changes
        .map(
          ({ label, from, to }) => `
            <tr>
              <td style="padding:7px 8px; color:#6b7280; font-weight:600;">${escapeHtml(label)}</td>
              <td style="padding:7px 8px; color:#9b0b23;">${escapeHtml(from)}</td>
              <td style="padding:7px 8px; color:#008c78; font-weight:700;">${escapeHtml(to)}</td>
            </tr>`,
        )
        .join("");

      const confirmUpdate = await AppSwal.fire({
        icon: "question",
        title: "ยืนยันการเปลี่ยนแปลงข้อมูล?",
        html: `
          <p style="margin-bottom:10px;">สินค้า <b>${escapeHtml(cleanId)}</b></p>
          <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:7px 8px; color:#6b7280;">รายการ</th>
                <th style="padding:7px 8px; color:#9b0b23;">เดิม</th>
                <th style="padding:7px 8px; color:#008c78;">ใหม่</th>
              </tr>
            </thead>
            <tbody>${changesHtml}</tbody>
          </table>
        `,
        showCancelButton: true,
        confirmButtonText: "ยืนยันการเปลี่ยนแปลง",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#0057B8",
        cancelButtonColor: "#75787B",
        customClass: { popup: "rounded-xl text-sm" },
      });
      if (!confirmUpdate.isConfirmed) {
        setShowModal(true);
        return;
      }
    }

    setSaving(true);
    try {
      if (currentEditing) {
        if (cleanId !== currentEditing.id) {
          throw new Error("รหัสสินค้าไม่สามารถแก้ไขได้");
        }

        const updatePayload: Record<string, unknown> = {
          name: cleanName,
          exp: cleanExp,
          expiry_offset_days: expiryOffsetDays,
          printing_config: printingConfig,
        };

        if (isAdminRole) {
          updatePayload.qty_per_a3 = qtyPerA3 ? parseInt(qtyPerA3, 10) : null;
          updatePayload.default_paper_type = defaultPaperType || null;
        }

        const { error: updateError } = await supabase
          .from("fgcode")
          .update(updatePayload)
          .eq("id", currentEditing.id);

        if (updateError) throw updateError;
      } else {
        const { data: existing } = await supabase
          .from("fgcode")
          .select("id")
          .eq("id", cleanId)
          .single();
        if (existing) {
          await AppSwal.fire({
            icon: "error",
            title: "รหัสสินค้าซ้ำ",
            text: "มีสินค้ารหัสนี้อยู่ในระบบเรียบร้อยแล้ว",
          });
          setShowModal(true);
          return;
        }

        // confirm create
        const confirm = await AppSwal.fire({
          icon: "question",
          title: "ยืนยันการเพิ่มสินค้า?",
          html: `
            <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
                <tr><td style="padding:5px 8px; color:#6b7280;">🏷️ รหัสสินค้า</td><td style="padding:5px 8px; font-weight:700;">${cleanId}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:5px 8px; color:#6b7280;">📝 ชื่อสินค้า</td><td style="padding:5px 8px; font-weight:700;">${cleanName}</td></tr>
                <tr><td style="padding:5px 8px; color:#6b7280;">⏳ อายุผลิตภัณฑ์</td><td style="padding:5px 8px; font-weight:700;">${cleanExp} เดือน</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:5px 8px; color:#6b7280;">🖨️ รูปแบบการพิมพ์</td><td style="padding:5px 8px; font-weight:700;">${printingConfigModeLabel(printingConfig)}</td></tr>
                ${dateOnlyFormat(printingConfig) ? `<tr><td style="padding:5px 8px; color:#6b7280;">📅 รูปแบบวันที่ผลิต</td><td style="padding:5px 8px; font-weight:700;">${dateOnlyFormat(printingConfig)?.pattern} (${calendarLabel(dateOnlyFormat(printingConfig)!.calendar)})</td></tr>` : ""}
            </table>
        `,
          showCancelButton: true,
          confirmButtonText: "ยืนยัน เพิ่มสินค้า",
          cancelButtonText: "ยกเลิก",
          confirmButtonColor: "#0057B8",
          cancelButtonColor: "#75787B",
          customClass: { popup: "rounded-xl text-sm" },
        });
        if (!confirm.isConfirmed) {
          setId(cleanId);
          setName(cleanName);
          setExp(cleanExp);
          setShowModal(true);
          return;
        }
        const createPayload: Record<string, unknown> = {
          id: cleanId,
          name: cleanName,
          exp: cleanExp,
          expiry_offset_days: expiryOffsetDays,
          printing_config: printingConfig,
        };
        if (isAdminRole) {
          createPayload.qty_per_a3 = qtyPerA3 ? parseInt(qtyPerA3) : null;
          createPayload.default_paper_type = defaultPaperType || null;
        }
        const { error } = await supabase.from("fgcode").insert(createPayload);
        if (error) throw error;
      }
      AppSwal.fire({
        icon: "success",
        title: "สำเร็จ",
        text: `${currentEditing ? "แก้ไข" : "สร้าง"}รหัสสินค้าสำเร็จ`,
        timer: 1500,
        showConfirmButton: false,
      });
      setShowModal(false);
      resetForm();
      fetchFgcodes();
    } catch (error) {
      AppSwal.fire({
        icon: "error",
        title: "ผิดพลาด",
        text:
          (error as Error).message ||
          `ไม่สามารถ${editingFgcode ? "แก้ไข" : "สร้าง"}รหัสสินค้าได้`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (fgcode: FgcodeInterface) => {
    setEditingFgcode(fgcode);
    setId(fgcode.id || "");
    setName(fgcode.name || "");
    setExp(fgcode.exp || "");
    setQtyPerA3(fgcode.qty_per_a3 != null ? String(fgcode.qty_per_a3) : "");
    setDefaultPaperType(fgcode.default_paper_type || "");
    setExpiryOffsetDays(fgcode.expiry_offset_days ?? 0);
    setPrintingConfig(fgcode.printing_config ?? null);
    setShowModal(true);
  };

  const handleDelete = async (rowId: string) => {
    if (!isAdminRole) {
      await AppSwal.fire({
        icon: "error",
        title: "ไม่มีสิทธิ์",
        text: "เฉพาะ Moderator และ Assistant Moderator เท่านั้นที่ลบสินค้าได้",
        confirmButtonText: "รับทราบ",
      });
      return;
    }

    const productName =
      fgcodes.find((fgcode) => fgcode.id === rowId)?.name || "ไม่พบชื่อสินค้า";
    const result = await AppSwal.fire({
      title: "ยืนยันการลบ",
      text: `ชื่อสินค้า: ${productName}\nรหัสสินค้า: ${rowId}\n\nต้องการลบรายการนี้ใช่หรือไม่?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#C8102E",
      cancelButtonColor: "#75787B",
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
    });
    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from("fgcode")
          .delete()
          .eq("id", rowId);
        if (error) throw error;
        setSelectedIds((current) => current.filter((id) => id !== rowId));
        AppSwal.fire({
          icon: "success",
          title: "ลบสำเร็จ",
          timer: 1500,
          showConfirmButton: false,
        });
        fetchFgcodes();
      } catch {
        AppSwal.fire({
          icon: "error",
          title: "ผิดพลาด",
          text: "ไม่สามารถลบรหัสสินค้าได้",
        });
      }
    }
  };

  const toggleSelection = (rowId: string) => {
    setSelectedIds((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId],
    );
  };

  const handleBulkDelete = async () => {
    if (!isAdminRole || selectedIds.length === 0) return;
    const idsToDelete = [...selectedIds];
    const productsToDelete = idsToDelete
      .map((id) => {
        const product = fgcodes.find((fgcode) => fgcode.id === id);
        return `${product?.name || "ไม่พบชื่อสินค้า"} (${id})`;
      })
      .join("\n");
    const result = await AppSwal.fire({
      title: "ยืนยันการลบหลายรายการ",
      text: `รายการที่จะลบ:\n${productsToDelete}\n\nยืนยันการลบ ${idsToDelete.length} รายการใช่หรือไม่?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#C8102E",
      cancelButtonColor: "#75787B",
      confirmButtonText: `ลบ ${idsToDelete.length} รายการ`,
      cancelButtonText: "ยกเลิก",
    });
    if (!result.isConfirmed) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("fgcode")
        .delete()
        .in("id", idsToDelete);
      if (error) throw error;
      setSelectedIds([]);
      setIsSelectionMode(false);
      AppSwal.fire({
        icon: "success",
        title: "ลบสำเร็จ",
        text: `ลบสินค้า ${idsToDelete.length} รายการเรียบร้อยแล้ว`,
        timer: 1500,
        showConfirmButton: false,
      });
      fetchFgcodes();
    } catch {
      AppSwal.fire({
        icon: "error",
        title: "ผิดพลาด",
        text: "ไม่สามารถลบสินค้าที่เลือกได้",
      });
    } finally {
      setDeleting(false);
    }
  };

  const filteredFgcodes = fgcodes.filter(
    (f) =>
      f.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const inputCls =
    "w-full px-3.5 py-2.5 text-[13px] bg-white border border-[#D9E1E2] rounded-lg text-[#101820] placeholder:text-[#8A9498] focus:outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10 disabled:bg-[#F0F3F4] disabled:text-[#8A9498] transition-all";

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((prev) => prev + 20);
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredFgcodes]);

  useEffect(() => {
    setVisibleCount(20);
  }, [searchTerm]);

  if (isLoading)
    return (
      <div className="w-full">
        <div className="mx-auto max-w-5xl space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-[#00AEC7]/15 bg-[#00263A] px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-white/20" />
                <div className="h-2.5 w-48 animate-pulse rounded bg-[#00AEC7]/15" />
              </div>
            </div>
            <div className="h-9 w-24 animate-pulse rounded-xl bg-[#0057B8]/60" />
          </div>

          <div className="h-14 animate-pulse rounded-xl border border-[#0057B8]/10 bg-[#EAF3FC]" />
          <div className="h-11 animate-pulse rounded-xl border border-[#D9E1E2] bg-white" />

          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[#D9E1E2] border-l-4 border-l-[#0057B8]/30 bg-white px-3.5 py-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-[#F0F3F4]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 animate-pulse rounded bg-[#D9E1E2]" />
                  <div className="h-3 w-28 animate-pulse rounded bg-[#F0F3F4]" />
                </div>
                <div className="h-7 w-16 animate-pulse rounded-lg bg-[#EAF3FC]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="w-full text-[#101820]">
      {/* ── Page header ── */}
      <div className="sticky top-0 z-30 mx-auto mb-4 max-w-5xl overflow-hidden rounded-2xl border border-[#00AEC7]/15 bg-[#00263A] px-4 py-3.5 shadow-lg sm:px-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#00AEC7]/12 blur-3xl" />

        <div className="relative flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-inner">
              <Package className="h-5 w-5 text-[#00AEC7]" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-[16px] font-black leading-tight tracking-tight text-white sm:text-[17px]">
                จัดการรหัสสินค้า
              </h1>
              <p className="mt-0.5 truncate text-[11px] text-white/60 sm:text-[11.5px]">
                เพิ่ม แก้ไข และจัดการข้อมูลสินค้าในระบบ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[#00AEC7]/20 bg-[#0057B8] px-3 py-2 text-[12px] font-bold text-white shadow-md transition-all hover:bg-[#004A9F] active:scale-95 sm:px-3.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">เพิ่มรหัสสินค้า</span>
            <span className="sm:hidden">เพิ่ม</span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl">
        {/* ── Stat strip ── */}
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#0057B8]/15 bg-[#EAF3FC] px-4 py-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white border border-[#0057B8]/10">
            <Package className="h-3.5 w-3.5 text-[#0057B8]" />
          </div>

          <div>
            <span className="mr-2 text-xl font-black text-[#0057B8]">
              {fgcodes.length}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-widest text-[#5F6B70]">
              สินค้าทั้งหมด
            </span>
          </div>

          {searchTerm && (
            <div className="ml-auto flex items-center gap-1 rounded-full border border-[#0057B8]/15 bg-white px-2 py-1 text-[11px] text-[#0057B8]">
              <Search className="h-3 w-3" />
              พบ {filteredFgcodes.length} รายการ
            </div>
          )}
        </div>

        {/* ── Search bar ── */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหารหัส หรือชื่อสินค้า..."
            className="w-full pl-10 pr-10 py-2.5 text-[13px] bg-white border border-[#D9E1E2] rounded-xl text-[#101820] placeholder:text-[#8A9498] focus:outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10 transition-all shadow-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A9498] hover:text-[#C8102E] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isAdminRole && filteredFgcodes.length > 0 && (
          <div className="flex items-center justify-end gap-3 mb-3 px-1">
            {!isSelectionMode ? (
              <button
                type="button"
                onClick={() => setIsSelectionMode(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#EAF3FC] border border-[#0057B8]/20 text-[#0057B8] hover:bg-[#0057B8] hover:text-white text-[11px] font-bold transition-all active:scale-95"
              >
                <ListChecks className="w-3.5 h-3.5" /> เลือกหลายรายการ
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#0057B8]">
                  เลือกแล้ว {selectedIds.length} รายการ
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds([]);
                    setIsSelectionMode(false);
                  }}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ยกเลิกโหมด
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={deleting || selectedIds.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FCEAEC] border border-[#C8102E]/20 text-[#C8102E] hover:bg-[#C8102E] hover:text-white hover:border-[#C8102E] disabled:opacity-60 text-[11px] font-bold transition-all active:scale-95"
                >
                  <Trash2 className="w-3 h-3" />
                  {deleting ? "กำลังลบ..." : "ลบที่เลือก"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Product cards ── */}
        {filteredFgcodes.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-white border border-[#D9E1E2] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
              <Search className="w-5 h-5 text-[#B8C4C8]" />
            </div>
            <p className="text-slate-400 text-sm">
              ไม่พบสินค้าที่ตรงกับการค้นหา
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredFgcodes.slice(0, visibleCount).map((fgcode) => (
              <div
                key={fgcode.id}
                className="bg-white border border-[#D9E1E2] border-l-4 border-l-[#0057B8] rounded-xl px-3.5 py-3 hover:shadow-md transition-all duration-200 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  {isAdminRole && isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(fgcode.id)}
                      onChange={() => toggleSelection(fgcode.id)}
                      aria-label={`เลือก ${fgcode.name}`}
                      className="h-4 w-4 accent-[#0057B8] cursor-pointer shrink-0"
                    />
                  )}
                  <div className="w-9 h-9 min-w-9 rounded-lg bg-[#00263A] border border-[#00AEC7]/20 flex items-center justify-center shadow-sm shrink-0">
                    <span className="text-[8.5px] font-extrabold text-white text-center leading-tight px-1 break-all">
                      {fgcode.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-x-2 gap-y-1 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-black text-[#00263A]">
                        {fgcode.name}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EAF3FC] text-[#0057B8] border border-[#0057B8]/15 tracking-wider">
                        {fgcode.id}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#F0F3F4] text-[#5F6B70] border border-[#D9E1E2] font-medium">
                        อายุ {fgcode.exp} เดือน
                      </span>
                      {isAdminRole && fgcode.qty_per_a3 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#FFF8D6] text-[#6E5B00] border border-[#F1C400]/30">
                          {fgcode.qty_per_a3} ชิ้น/A3
                        </span>
                      )}
                      {isAdminRole && fgcode.default_paper_type && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#FFF8D6] text-[#6E5B00] border border-[#F1C400]/30">
                          {fgcode.default_paper_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEdit(fgcode)}
                      aria-label={`แก้ไข ${fgcode.name}`}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#EAF3FC] border border-[#0057B8]/15 text-[#0057B8] hover:bg-[#0057B8] hover:text-white hover:border-[#0057B8] text-[11.5px] font-semibold transition-all active:scale-95"
                    >
                      <Edit2 className="w-3 h-3" />{" "}
                      <span className="hidden sm:inline">แก้ไข</span>
                    </button>
                    {isAdminRole && (
                      <button
                        onClick={() => handleDelete(fgcode.id)}
                        aria-label={`ลบ ${fgcode.name}`}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#FCEAEC] border border-[#C8102E]/20 text-[#C8102E] hover:bg-[#C8102E] hover:text-white hover:border-[#C8102E] text-[11.5px] font-semibold transition-all active:scale-95"
                      >
                        <Trash2 className="w-3 h-3" />{" "}
                        <span className="hidden sm:inline">ลบ</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {visibleCount < filteredFgcodes.length && (
              <div ref={sentinelRef} className="flex justify-center py-6">
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#00AEC7] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                  <span className="text-slate-400 text-xs ml-1">
                    กำลังโหลด{" "}
                    {Math.min(20, filteredFgcodes.length - visibleCount)}{" "}
                    รายการถัดไป...
                  </span>
                </div>
              </div>
            )}

            {visibleCount >= filteredFgcodes.length &&
              filteredFgcodes.length > 20 && (
                <div className="text-center py-4 text-slate-400 text-xs">
                  แสดงครบทั้ง {filteredFgcodes.length} รายการแล้ว
                </div>
              )}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <Modal
          id="fgcode-modal"
          title={editingFgcode ? "แก้ไขรหัสสินค้า" : "เพิ่มรหัสสินค้าใหม่"}
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          size="lg"
        >
          <div className="bg-[#F5F7F8] -mx-6 -mb-6 px-6 pb-6 rounded-b-2xl">
            <form onSubmit={handleSubmit} className="pt-4 space-y-4">
              <div>
                <label className="block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
                  รหัสสินค้า <span className="text-[#C8102E]">*</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={id}
                  onChange={(e) => setId(e.target.value.toUpperCase())}
                  placeholder="เช่น 01-1-001 หรือ FG-001"
                  required
                  disabled={!!editingFgcode}
                />
                {editingFgcode && (
                  <small className="text-[#8A9498] mt-1 block">
                    รหัสสินค้าไม่สามารถแก้ไขได้
                  </small>
                )}
              </div>
              <div>
                <label className="block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
                  ชื่อสินค้า <span className="text-[#C8102E]">*</span>
                  {!isAdminRole && (
                    <span className="text-[10px] text-slate-400 ml-1 normal-case">
                      (ภาษาอังกฤษเท่านั้น)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={name}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!isAdminRole)
                      setName(v.replace(/[ก-๙]/g, "").toUpperCase());
                    else setName(v.toUpperCase());
                  }}
                  placeholder={
                    isAdminRole
                      ? "ชื่อสินค้า (ภาษาไทยหรืออังกฤษ)"
                      : "เช่น TEST 25KG."
                  }
                  required
                />
                {!isAdminRole && (
                  <p className="mt-1.5 text-[11px] text-[#6E5B00] bg-[#FFF8D6] border border-[#F1C400]/30 px-2.5 py-1 rounded-lg">
                    ⚠️ สิทธิ์ของคุณอนุญาตให้ใช้ภาษาอังกฤษและตัวเลขเท่านั้น
                  </p>
                )}
              </div>
              <div>
                <label className="block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
                  อายุผลิตภัณฑ์ (เดือน){" "}
                  <span className="text-[#C8102E]">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputCls}
                  value={exp}
                  onChange={(e) => setExp(e.target.value)}
                  placeholder="เช่น 12"
                  required
                />
              </div>
              <fieldset className="space-y-3 border-t border-[#D9E1E2] pt-4">
                <legend className="text-sm font-black text-[#00263A]">
                  วันหมดอายุจริง
                </legend>
                <div className="space-y-2 text-[13px] text-slate-700">
                  {ACTUAL_EXPIRY_OPTIONS.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="actual-expiry-rule"
                        checked={expiryOffsetDays === option.value}
                        onChange={() => setExpiryOffsetDays(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {previewDates.actual ? (
                  <div className="rounded-lg border border-[#00AEC7]/20 bg-[#EAF8FA] px-3 py-2 text-[12px] text-[#00263A]">
                    <div className="flex justify-between gap-3"><span>วันผลิตตัวอย่าง</span><strong>{formatThaiDate("2026-12-12")}</strong></div>
                    <div className="mt-1 flex justify-between gap-3"><span>วันหมดอายุจริง</span><strong>{formatThaiDate(previewDates.actual)}</strong></div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-[#F1C400]/30 bg-[#FFF8D6] px-3 py-2 text-[12px] text-[#6E5B00]">
                    กรุณากำหนดอายุผลิตภัณฑ์เพื่อดูตัวอย่างวันหมดอายุ
                  </p>
                )}
              </fieldset>
              <PrintingConfigBuilder
                value={printingConfig}
                onChange={setPrintingConfig}
              />
              {isAdminRole && (
                <div className="border-t border-[#D9E1E2] pt-4 space-y-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    📄 ข้อมูลสต็อคกระดาษ (Manager only)
                  </span>
                  <div>
                    <label className="block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
                      จำนวนชิ้นต่อแผ่น A3 (Qty / A3)
                    </label>
                    <input
                      type="number"
                      min="1"
                      className={inputCls}
                      value={qtyPerA3}
                      onChange={(e) => setQtyPerA3(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="เช่น 8"
                    />
                    <small className="text-slate-400 mt-1 block">
                      ใช้คำนวณตัดสต็อคกระดาษอัตโนมัติตอนบันทึกผลผลิตใน Dashboard
                    </small>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
                      ประเภทกระดาษของสินค้านี้
                    </label>
                    <select
                      className={`${inputCls} cursor-pointer`}
                      value={defaultPaperType}
                      onChange={(e) => setDefaultPaperType(e.target.value)}
                    >
                      <option value="">ไม่กำหนดประเภทกระดาษ</option>

                      {PAPER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <small className="text-slate-400 mt-1 block">
                      ล็อคประเภทกระดาษของสินค้านี้ ใช้ตอนตัดสต็อคใน Dashboard
                      โดยอัตโนมัติ
                    </small>
                  </div>
                </div>
              )}
              <div className="border-t border-[#D9E1E2] pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-[#F0F3F4] border border-[#D9E1E2] text-[#5F6B70] font-semibold rounded-lg text-[13px] transition-all"
                >
                  <X className="w-4 h-4" /> ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#0057B8] hover:bg-[#004A9F] disabled:opacity-60 text-white font-semibold rounded-lg text-[13px] shadow-md shadow-[#0057B8]/15 transition-all active:scale-95"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>{" "}
                      กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />{" "}
                      {editingFgcode ? "บันทึกการแก้ไข" : "สร้างสินค้า"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
