"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import { ImagePlus, X } from "lucide-react";
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
  id?: number;
  orderDate: string;
  orderTime: string;
  orderDateTime: string;
  orderType: string;
  lotNumber: string;
  productId: string;
  productName: string;
  productExp: string;
  actualExpiryOffsetDays: ActualExpiryOffsetDays;
  printingConfig: ProductPrintingConfig;
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
  expiry_offset_days?: number | null;
  printing_config?: unknown;
}

interface InsertedOrderSnapshot {
  id: number;
  product_exp: string;
  expiry_offset_days_used: unknown;
  printing_config_used: unknown;
  production_date: string;
  expiry_date: string;
}

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

function actualExpiryRuleLabel(value: ActualExpiryOffsetDays): string {
  return value === -1 ? "ก่อนวันปกติ 1 วัน" : "ตามอายุผลิตภัณฑ์";
}

function printingConfigLabel(config: ProductPrintingConfig): string {
  return config === null
    ? "ยังไม่ได้กำหนด"
    : PRINTING_PRESET_LABELS[config.preset];
}

function printedExpiryRuleLabel(config: ProductPrintingConfig): string | null {
  if (config === null || !config.template.includes("{EXP_DATE}")) return null;
  return config.exp_offset_days === -1
    ? "ก่อนวันหมดอายุจริง 1 วัน"
    : "ตรงกับวันหมดอายุจริง";
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}

function formatOrderDate(canonicalDate: string): string {
  return formatProductDate(canonicalDate, {
    pattern: "DD/MM/YYYY",
    calendar: "gregorian",
  });
}

function createInitialOrderData(): OrderInterface {
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
    actualExpiryOffsetDays: 0,
    printingConfig: null,
    productionDate: "",
    expiryDate: "",
    quantity: 0,
    notes: "",
  };
}

export default function OrderPage() {
  // ✅ ใส่ค่า initial time ตรงนี้แทน useEffect เพื่อหลีกเลี่ยง setState in effect
  const [orderData, setOrderData] = useState<OrderInterface>(
    createInitialOrderData,
  );
  const [products, setProducts] = useState<FgcodeInterface[]>([]);
  const [username, setUsername] = useState("Unknown User");
  const [department, setDepartment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [productSearch, setProductSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [productConfigurationError, setProductConfigurationError] = useState<
    string | null
  >(null);
  const [hasValidActualExpiryOffset, setHasValidActualExpiryOffset] =
    useState(true);

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

  // ✅ useEffect เดียว ไม่มี setState โดยตรง
  useEffect(() => {
    Promise.all([fetchUserInfo(), fetchProducts()]).finally(() =>
      setLoading(false),
    );
  }, []);

  const calculateCanonicalExpiry = (
    productionDate: string,
    shelfLifeMonths: string,
    actualExpiryOffsetDays: ActualExpiryOffsetDays,
  ): string => {
    if (!productionDate) return "";
    try {
      parseProductShelfLifeMonths(shelfLifeMonths);
      return calculateProductExpiryDate({
        productionDate,
        shelfLifeMonths,
        actualExpiryOffsetDays,
      });
    } catch {
      return "";
    }
  };

  const clearSelectedProduct = () => {
    setProductConfigurationError(null);
    setHasValidActualExpiryOffset(true);
    setOrderData((prev) => ({
      ...prev,
      productId: "",
      productName: "",
      productExp: "",
      actualExpiryOffsetDays: 0,
      printingConfig: null,
      expiryDate: "",
    }));
  };

  const handleProductSelection = (product: FgcodeInterface) => {
    const productExp = typeof product.exp === "string" ? product.exp : "";
    const expiryOffsetCandidate = product.expiry_offset_days ?? 0;
    const hasValidExpiryOffset = isActualExpiryOffsetDays(
      expiryOffsetCandidate,
    );
    const printingConfigCandidate = product.printing_config ?? null;
    const printingConfigValidation = validatePrintingConfig(
      printingConfigCandidate,
    );
    const printingConfig = printingConfigValidation.valid
      ? (printingConfigCandidate as ProductPrintingConfig)
      : null;

    let shelfLifeError: string | null = null;
    try {
      parseProductShelfLifeMonths(productExp);
    } catch {
      shelfLifeError = `รหัสสินค้า "${product.id}" ไม่มีข้อมูลอายุผลิตภัณฑ์ที่ถูกต้อง กรุณาตรวจสอบข้อมูลใน Product`;
    }

    const configurationError = !hasValidExpiryOffset
      ? "รูปแบบวันหมดอายุของสินค้าไม่ถูกต้อง กรุณาตรวจสอบข้อมูลใน Product"
      : !printingConfigValidation.valid
        ? "รูปแบบการพิมพ์ของสินค้าไม่ถูกต้อง กรุณาตรวจสอบข้อมูลใน Product"
        : null;

    setProductSearch(product.id);
    setShowDropdown(false);
    setProductConfigurationError(shelfLifeError ?? configurationError);
    setHasValidActualExpiryOffset(hasValidExpiryOffset);
    setOrderData((prev) => ({
      ...prev,
      productId: product.id,
      productName: product.name,
      productExp,
      actualExpiryOffsetDays: hasValidExpiryOffset
        ? expiryOffsetCandidate
        : 0,
      printingConfig,
      expiryDate:
        shelfLifeError || !hasValidExpiryOffset
          ? ""
          : calculateCanonicalExpiry(
              prev.productionDate,
              productExp,
              expiryOffsetCandidate,
            ),
    }));

    const warning = shelfLifeError ?? configurationError;
    if (warning) {
      AppSwal.fire({
        icon: "warning",
        title: shelfLifeError ? "ไม่มีอายุผลิตภัณฑ์" : "ข้อมูลสินค้าไม่ถูกต้อง",
        text: warning,
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#0057B8",
      });
    }
  };

  const handleProductionDateChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const mfgDate = e.target.value;
    setOrderData((prev) => ({
      ...prev,
      productionDate: mfgDate,
      expiryDate:
        prev.productId && hasValidActualExpiryOffset
          ? calculateCanonicalExpiry(
              mfgDate,
              prev.productExp,
              prev.actualExpiryOffsetDays,
            )
          : "",
    }));
  };

  const printingPreview = useMemo(() => {
    if (
      productConfigurationError ||
      !orderData.productId ||
      !orderData.productionDate ||
      !orderData.expiryDate
    ) {
      return null;
    }

    return renderPrintingTemplate({
      config: orderData.printingConfig,
      productionDate: orderData.productionDate,
      canonicalExpiryDate: orderData.expiryDate,
      lot: orderData.lotNumber,
    });
  }, [
    orderData.expiryDate,
    orderData.lotNumber,
    orderData.printingConfig,
    orderData.productionDate,
    orderData.productId,
    productConfigurationError,
  ]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      AppSwal.fire({
        icon: "error",
        title: "ไฟล์ไม่ถูกต้อง",
        text: "กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WEBP)",
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      AppSwal.fire({
        icon: "error",
        title: "ไฟล์ใหญ่เกินไป",
        text: "ขนาดไฟล์ต้องไม่เกิน 2 MB",
      });
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetOrderForm = () => {
    removeImage();
    setProductSearch("");
    setShowDropdown(false);
    setProductConfigurationError(null);
    setHasValidActualExpiryOffset(true);
    setOrderData(createInitialOrderData());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !orderData.lotNumber.trim() ||
      !orderData.productId ||
      !orderData.productionDate ||
      !orderData.quantity
    ) {
      await AppSwal.fire({
        icon: "warning",
        title: "ข้อมูลไม่ครบ",
        text: "กรุณากรอกเลข LOT, สินค้า, วันที่ผลิต และจำนวนสั่งทำให้ครบถ้วน",
      });
      return;
    }

    if (productConfigurationError) {
      await AppSwal.fire({
        icon: "error",
        title: "ข้อมูลสินค้าไม่ถูกต้อง",
        text: productConfigurationError,
      });
      return;
    }

    if (
      !hasValidActualExpiryOffset ||
      !isActualExpiryOffsetDays(orderData.actualExpiryOffsetDays)
    ) {
      await AppSwal.fire({
        icon: "error",
        title: "ข้อมูลสินค้าไม่ถูกต้อง",
        text: "รูปแบบวันหมดอายุของสินค้าไม่ถูกต้อง กรุณาตรวจสอบข้อมูลใน Product",
      });
      return;
    }

    try {
      parseProductShelfLifeMonths(orderData.productExp);
    } catch {
      await AppSwal.fire({
        icon: "error",
        title: "ไม่สามารถบันทึกได้",
        text: "สินค้านี้ไม่มีข้อมูลอายุผลิตภัณฑ์ที่ถูกต้อง กรุณาตรวจสอบข้อมูลใน Product",
      });
      return;
    }

    const printingConfigValidation = validatePrintingConfig(
      orderData.printingConfig,
    );
    if (!printingConfigValidation.valid) {
      await AppSwal.fire({
        icon: "error",
        title: "ข้อมูลสินค้าไม่ถูกต้อง",
        text: "รูปแบบการพิมพ์ของสินค้าไม่ถูกต้อง กรุณาตรวจสอบข้อมูลใน Product",
      });
      return;
    }

    const canonicalExpiryDate = calculateCanonicalExpiry(
      orderData.productionDate,
      orderData.productExp,
      orderData.actualExpiryOffsetDays,
    );
    if (!canonicalExpiryDate) {
      await AppSwal.fire({
        icon: "error",
        title: "ไม่สามารถคำนวณวันหมดอายุได้",
        text: "กรุณาตรวจสอบวันที่ผลิตและอายุผลิตภัณฑ์",
      });
      return;
    }

    if (orderData.expiryDate !== canonicalExpiryDate) {
      setOrderData((prev) => ({ ...prev, expiryDate: canonicalExpiryDate }));
    }

    let imageHtml = "";
    if (imagePreview) {
      imageHtml = `
                <div style="margin-top:12px; display:flex; justify-content:center;">
                    <div style="text-align:center;">
                        <div style="font-size:12px; color:#6b7280; margin-bottom:2px;">📷 ภาพตัวอย่างฉลาก</div>
                        <img src="${imagePreview}" alt="ตัวอย่างฉลาก"
                             style="max-width:100%; max-height:160px; object-fit:contain; border-radius:8px; border:1px solid #ddd;" />
                    </div>
                </div>
            `;
    }

    const confirm = await AppSwal.fire({
      icon: "question",
      title: "ยืนยันการบันทึก?",
      html: `
                <div style="font-family: sans-serif;">
                    <table style="width:100%; border-collapse:collapse; font-size:13px; margin:auto;">
                        <tr><td style="padding:4px 6px; color:#4b5563;">📦 ประเภท</td><td style="padding:4px 6px; font-weight:600;">${orderData.orderType}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">🔢 เลขลอต</td><td style="padding:4px 6px; font-weight:600;">${orderData.lotNumber}</td></tr>
                        <tr><td style="padding:4px 6px; color:#4b5563;">🏷️ รหัสสินค้า</td><td style="padding:4px 6px; font-weight:600;">${orderData.productId}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">📝 ชื่อสินค้า</td><td style="padding:4px 6px; font-weight:600;">${orderData.productName}</td></tr>
                        <tr><td style="padding:4px 6px; color:#4b5563;">🔢 จำนวน</td><td style="padding:4px 6px; font-weight:600;">${orderData.quantity}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">📅 วันที่ผลิต</td><td style="padding:4px 6px; font-weight:600;">${orderData.productionDate}</td></tr>
                        <tr><td style="padding:4px 6px; color:#4b5563;">📅 วันหมดอายุจริง</td><td style="padding:4px 6px; font-weight:600;">${canonicalExpiryDate}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">📋 หมายเหตุ</td><td style="padding:4px 6px; font-weight:600;">${orderData.notes || "-"}</td></tr>
                    </table>
                    ${imageHtml}
                </div>
            `,
      showCancelButton: true,
      confirmButtonText: "ยืนยัน",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#0057B8",
      cancelButtonColor: "#75787B",
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
      setUploading(true);

      let imageUrl: string | null = null;
      if (imageFile) {
        if (!imageFile.type.startsWith("image/"))
          throw new Error("ไฟล์ที่เลือกไม่ใช่รูปภาพ");

        const fileExt = imageFile.name.split(".").pop() || "jpg";
        const rawName = orderData.productName?.trim() || "";
        const hasThai = /[ก-๙]/.test(rawName);

        let safeName: string;
        if (hasThai || !rawName) {
          const rawId = orderData.productId?.trim() || "unknown-product";
          safeName = rawId.replace(/[^a-zA-Z0-9\-_]/g, "_").substring(0, 50);
        } else {
          safeName = rawName
            .replace(/[^a-zA-Z0-9\-_]/g, "_")
            .replace(/_+/g, "_")
            .substring(0, 50);
        }

        const now = new Date();
        const dateStr = now.toISOString().replace(/[-:T]/g, "").slice(0, 15);
        const fileName = `${safeName}_${dateStr}.${fileExt}`;
        const filePath = `labels/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("order-images")
          .upload(filePath, imageFile);
        if (uploadError)
          throw new Error(`อัปโหลดรูปภาพไม่สำเร็จ: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from("order-images")
          .getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      }

      const { data: insertedOrder, error } = await supabase
        .from("orders")
        .insert({
          order_date: orderData.orderDate,
          order_time: orderData.orderTime,
          order_datetime: orderData.orderDateTime,
          order_type: orderData.orderType,
          lot_number: orderData.lotNumber,
          product_id: orderData.productId,
          product_name: orderData.productName,
          product_exp: orderData.productExp,
          production_date: orderData.productionDate,
          expiry_date: canonicalExpiryDate,
          quantity: orderData.quantity,
          notes: orderData.notes || "-",
          created_by: username,
          created_by_department: department || "ไม่ระบุหน่วยงาน",
          is_verified: false,
          verified_by: null,
          verified_at: null,
          image_url: imageUrl,
        })
        .select(
          "id, product_exp, expiry_offset_days_used, printing_config_used, production_date, expiry_date",
        )
        .single();

      if (error) throw new Error(error.message);
      if (!insertedOrder) {
        throw new Error("ไม่ได้รับข้อมูล Order ที่บันทึกแล้ว");
      }

      const stored = insertedOrder as unknown as InsertedOrderSnapshot;
      const storedOffsetIsValid = isActualExpiryOffsetDays(
        stored.expiry_offset_days_used,
      );
      const storedConfigCandidate = Object.prototype.hasOwnProperty.call(
        stored,
        "printing_config_used",
      )
        ? stored.printing_config_used
        : undefined;
      const storedConfigValidation = validatePrintingConfig(
        storedConfigCandidate,
      );
      const storedDataIsValid =
        typeof stored.product_exp === "string" &&
        typeof stored.production_date === "string" &&
        typeof stored.expiry_date === "string" &&
        storedOffsetIsValid &&
        storedConfigValidation.valid;

      const usedLatestProductConfig =
        storedDataIsValid &&
        (stored.product_exp !== orderData.productExp ||
          stored.expiry_offset_days_used !==
            orderData.actualExpiryOffsetDays ||
          stableJsonStringify(storedConfigCandidate) !==
            stableJsonStringify(orderData.printingConfig) ||
          stored.expiry_date !== canonicalExpiryDate);

      let successText = "บันทึกคำสั่งพิมพ์ชิ้นงานสำเร็จแล้ว";
      let successIcon: "success" | "warning" = "success";
      let successTitle = "บันทึกสำเร็จ";

      if (!storedDataIsValid) {
        successIcon = "warning";
        successTitle = "บันทึกสำเร็จ แต่ข้อมูลที่บันทึกกลับมาไม่สมบูรณ์";
        successText =
          "กรุณาตรวจสอบ Order ที่สร้างแล้ว เนื่องจากระบบได้รับข้อมูล snapshot ที่ไม่เป็นไปตามที่คาดไว้";
      } else if (usedLatestProductConfig) {
        successText =
          "ข้อมูลสินค้าถูกปรับปรุงระหว่างสร้าง Order ระบบได้บันทึกโดยใช้ข้อมูลสินค้าล่าสุดแล้ว";
        const finalPrintingOutput = renderPrintingTemplate({
          config: storedConfigCandidate as ProductPrintingConfig,
          productionDate: stored.production_date,
          canonicalExpiryDate: stored.expiry_date,
          lot: orderData.lotNumber,
        });
        if (finalPrintingOutput.status === "ready") {
          successText += `\nข้อความที่ต้องพิมพ์: ${finalPrintingOutput.text}`;
        }
      }

      await AppSwal.fire({
        icon: successIcon,
        title: successTitle,
        text: successText,
      });

      resetOrderForm();
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

    return `${base} border-[#C8102E]/25 focus:border-[#C8102E] focus:ring-4 focus:ring-[#C8102E]/10 bg-[#FCEAEC]/35 placeholder:text-[#C8102E]/45`;
  };

  const renderDateLabels = (dateString: string) => {
    if (!dateString) return null;
    const [year, month, day] = dateString.split("-");
    const thaiYear = parseInt(year) + 543;
    return (
      <div className="mt-1 text-xs text-gray-500 space-y-0.5 md:hidden">
        <p>
          (ค.ศ.) : {day}/{month}/{year}
        </p>
        <p>
          (พ.ศ.) : {day}/{month}/{thaiYear}
        </p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full max-w-3xl animate-pulse overflow-hidden rounded-2xl border border-[#D9E1E2] bg-white shadow-sm md:rounded-3xl">
          {/* Header */}
          <div className="border-b border-[#D9E1E2] bg-[#00263A] px-5 py-6 md:px-8">
            <div className="flex flex-col items-center">
              <div className="mb-3 h-12 w-12 rounded-2xl bg-white/10" />
              <div className="mb-2 h-5 w-56 rounded-md bg-white/20" />
              <div className="h-3 w-40 rounded-md bg-[#00AEC7]/20" />
            </div>
          </div>

          <div className="p-4 md:p-8">
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="mb-2 h-3 w-48 rounded bg-[#D9E1E2]" />
                <div className="h-12 w-full rounded-xl bg-[#F0F3F4]" />
              </div>

              <div className="md:col-span-2">
                <div className="mb-3 h-3 w-40 rounded bg-[#D9E1E2]" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="h-12 rounded-xl bg-[#F0F3F4]" />
                  <div className="h-12 rounded-xl bg-[#F0F3F4]" />
                </div>
              </div>

              {[0, 1, 2, 3].map((item) => (
                <div key={item}>
                  <div className="mb-2 h-3 w-32 rounded bg-[#D9E1E2]" />
                  <div className="h-12 rounded-xl bg-[#F0F3F4]" />
                </div>
              ))}

              <div className="md:col-span-2">
                <div className="mb-2 h-3 w-24 rounded bg-[#D9E1E2]" />
                <div className="h-20 rounded-xl bg-[#F0F3F4]" />
              </div>

              <div className="md:col-span-2">
                <div className="mb-2 h-3 w-48 rounded bg-[#D9E1E2]" />
                <div className="h-44 rounded-2xl bg-[#F0F3F4]" />
              </div>

              <div className="pt-4 md:col-span-2">
                <div className="h-[52px] w-full rounded-xl bg-[#EAF3FC]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full text-[#101820]">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-[#D9E1E2] bg-white shadow-sm md:rounded-3xl">
        <div className="relative overflow-hidden border-b border-[#00AEC7]/20 bg-[#00263A] px-5 py-6 md:px-8">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#00AEC7]/12 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col items-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner">
              <svg
                className="h-6 w-6 text-[#00AEC7]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>

            <h1 className="text-center text-[20px] font-black tracking-tight text-white md:text-[22px]">
              สร้างคำสั่งชิ้นงานใหม่
            </h1>

            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-[#00AEC7]/80">
              Create New Production Order
            </p>
          </div>
        </div>

        <div className="p-4 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* วันที่และเวลา */}
              <div className="md:col-span-2">
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  วันที่และเวลาสั่ง (Order Date & Time)
                </label>
                <div className="w-full px-4 py-3 bg-[#F0F3F4] border border-[#D9E1E2] rounded-xl text-[#101820] text-[13.5px] font-semibold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B398] animate-pulse" />
                  {formatThaiDateTime()}
                </div>
              </div>

              {/* ประเภทคำสั่ง */}
              <div className="md:col-span-2">
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                  ประเภทคำสั่ง (Order Type)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex cursor-pointer items-center justify-center gap-2 py-3.5 px-4 border rounded-xl font-bold text-[13px] transition-all duration-300 ${orderData.orderType === "พิมพ์ฉลาก" ? "bg-[#0057B8] text-white border-[#0057B8] shadow-md shadow-[#0057B8]/15" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/50 hover:text-slate-700"}`}
                  >
                    <input
                      type="radio"
                      name="orderType"
                      value="พิมพ์ฉลาก"
                      checked={orderData.orderType === "พิมพ์ฉลาก"}
                      onChange={(e) =>
                        setOrderData((prev) => ({
                          ...prev,
                          orderType: e.target.value,
                        }))
                      }
                      className="hidden"
                    />
                    🖨️ พิมพ์ฉลาก (Label Print)
                  </label>
                  <label
                    className={`flex cursor-pointer items-center justify-center gap-2 py-3.5 px-4 border rounded-xl font-bold text-[13px] transition-all duration-300 ${orderData.orderType === "ปั๊มถุง" ? "bg-[#00263A] text-white border-[#00263A] shadow-md shadow-[#00263A]/15" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/50 hover:text-slate-700"}`}
                  >
                    <input
                      type="radio"
                      name="orderType"
                      value="ปั๊มถุง"
                      checked={orderData.orderType === "ปั๊มถุง"}
                      onChange={(e) =>
                        setOrderData((prev) => ({
                          ...prev,
                          orderType: e.target.value,
                        }))
                      }
                      className="hidden"
                    />
                    🔖 ปั๊มถุง (Bag Stamp)
                  </label>
                </div>
              </div>

              {/* เลขลอต */}
              <div>
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  เลขลอตสินค้า (Lot Number){" "}
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
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  รหัสสินค้า (Product ID){" "}
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
                        clearSelectedProduct();
                      }
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="ค้นหาด้วยรหัส หรือชื่อสินค้า..."
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
                          clearSelectedProduct();
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
                      className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100"
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
                            onClick={() => handleProductSelection(product)}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
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
                        <div className="px-4 py-3 text-slate-400 text-[12.5px] text-center font-medium">
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
                  <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    ชื่อสินค้า (Product Name)
                  </label>
                  <input
                    type="text"
                    value={orderData.productName}
                    readOnly
                    className="w-full px-4 py-3 bg-[#F0F3F4] border border-[#D9E1E2] rounded-xl text-[#5F6B70] text-[13.5px] font-semibold cursor-not-allowed"
                  />
                </div>
              )}

              {orderData.productId && (
                <div className="md:col-span-2 min-w-0 rounded-xl border border-[#00AEC7]/20 bg-[#EAF8FA] p-4">
                  <h2 className="text-[12px] font-black uppercase tracking-wider text-[#00263A]">
                    ข้อมูลสินค้าและกฎที่ใช้กับ Order นี้
                  </h2>
                  {productConfigurationError ? (
                    <p className="mt-2 rounded-lg border border-[#C8102E]/25 bg-[#FCEAEC] px-3 py-2 text-[12px] font-semibold text-[#9B0B23]" role="alert">
                      {productConfigurationError}
                    </p>
                  ) : (
                    <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                      <div className="flex items-start justify-between gap-3"><dt className="text-[#5F6B70]">อายุผลิตภัณฑ์</dt><dd className="font-bold text-[#00263A]">{orderData.productExp ? `${orderData.productExp} เดือน` : "ไม่ระบุ"}</dd></div>
                      <div className="flex items-start justify-between gap-3"><dt className="text-[#5F6B70]">รูปแบบวันหมดอายุ</dt><dd className="font-bold text-[#00263A]">{actualExpiryRuleLabel(orderData.actualExpiryOffsetDays)}</dd></div>
                      <div className="flex items-start justify-between gap-3"><dt className="text-[#5F6B70]">รูปแบบการพิมพ์</dt><dd className="font-bold text-[#00263A]">{printingConfigLabel(orderData.printingConfig)}</dd></div>
                      {printedExpiryRuleLabel(orderData.printingConfig) && (
                        <div className="flex items-start justify-between gap-3"><dt className="text-[#5F6B70]">วันที่ EXP ที่พิมพ์</dt><dd className="font-bold text-[#00263A]">{printedExpiryRuleLabel(orderData.printingConfig)}</dd></div>
                      )}
                    </dl>
                  )}
                </div>
              )}

              {/* อายุผลิตภัณฑ์ */}
              {orderData.productExp && (
                <div>
                  <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    อายุผลิตภัณฑ์ (Shelf Life)
                  </label>
                  <input
                    type="text"
                    value={`${orderData.productExp} เดือน`}
                    readOnly
                    className="w-full px-4 py-3 bg-[#E6F8F4] border border-[#00B398]/20 rounded-xl text-[#008C78] text-[13.5px] font-bold cursor-not-allowed"
                  />
                </div>
              )}

              {/* วันที่ผลิต */}
              <div>
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  วันที่ผลิต (Production Date){" "}
                  <span className="text-[#C8102E] font-bold">*</span>
                </label>
                <input
                  type="date"
                  value={orderData.productionDate}
                  onChange={handleProductionDateChange}
                  onKeyDown={(e) => {
                    if (e.key !== "Tab") e.preventDefault();
                  }}
                  disabled={!orderData.productId || !orderData.productExp}
                  required
                  className={
                    !orderData.productId || !orderData.productExp
                      ? "w-full px-4 py-3 rounded-xl text-[13.5px] font-medium border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed shadow-inner select-none"
                      : getRequiredFieldStyle(orderData.productionDate)
                  }
                />
                {(!orderData.productId || !orderData.productExp) && (
                  <p className="mt-1.5 text-[11.5px] text-[#A88700] font-semibold flex items-center gap-1">
                    ⚠️ กรุณาเลือกรหัสสินค้าที่มีอายุผลิตภัณฑ์ก่อน
                  </p>
                )}
                {renderDateLabels(orderData.productionDate)}
              </div>

              {/* วันหมดอายุ */}
              {orderData.expiryDate && (
                <div>
                  <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    วันหมดอายุจริง (Canonical Expiry Date)
                  </label>
                  <input
                    type="date"
                    value={orderData.expiryDate}
                    readOnly
                    className="w-full px-4 py-3 bg-[#E6F8F4] border border-[#00B398]/20 rounded-xl text-[#008C78] text-[13.5px] font-bold cursor-not-allowed"
                  />
                  {renderDateLabels(orderData.expiryDate)}
                </div>
              )}

              {orderData.productionDate && orderData.expiryDate && (
                <div className="md:col-span-2 min-w-0 rounded-xl border border-[#0057B8]/15 bg-[#EAF3FC] p-4" aria-live="polite">
                  <h2 className="text-[12px] font-black uppercase tracking-wider text-[#00263A]">
                    วันที่และข้อความสำหรับพิมพ์
                  </h2>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                    <div className="flex items-start justify-between gap-3"><dt className="text-[#5F6B70]">วันที่ผลิต</dt><dd className="font-bold text-[#00263A]">{formatOrderDate(orderData.productionDate)}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="text-[#5F6B70]">วันหมดอายุจริง</dt><dd className="font-bold text-[#00263A]">{formatOrderDate(orderData.expiryDate)}</dd></div>
                  </dl>
                  <div className="mt-3 border-t border-[#0057B8]/15 pt-3">
                    <p className="text-[12px] font-semibold text-[#5F6B70]">รูปแบบที่ต้องพิมพ์</p>
                    {printingPreview?.status === "ready" && (
                      <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 font-mono text-[13px] text-[#00263A]">{printingPreview.text}</p>
                    )}
                    {printingPreview?.status === "not_configured" && (
                      <p className="mt-1 text-[13px] text-[#5F6B70]">ยังไม่ได้กำหนดรูปแบบการพิมพ์</p>
                    )}
                    {printingPreview?.status === "incomplete" && (
                      <p className="mt-1 text-[13px] font-semibold text-[#A88700]">กรุณากรอก LOT เพื่อดูข้อความสำหรับพิมพ์</p>
                    )}
                    {(printingPreview?.status === "invalid_config" || printingPreview?.status === "invalid_input") && (
                      <p className="mt-1 text-[13px] font-semibold text-[#C8102E]">ไม่สามารถสร้างตัวอย่างการพิมพ์ได้ กรุณาตรวจสอบข้อมูลสินค้า</p>
                    )}
                  </div>
                </div>
              )}

              {/* จำนวน */}
              <div>
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  จำนวนสั่งทำ (Quantity){" "}
                  <span className="text-[#C8102E] font-bold">*</span>
                </label>
                <input
                  type="number"
                  value={orderData.quantity || ""}
                  onChange={(e) => {
                    const rawValue = e.target.value;

                    if (rawValue === "") {
                      setOrderData((prev) => ({ ...prev, quantity: 0 }));
                      return;
                    }

                    const parsedValue = parseInt(rawValue);

                    if (isNaN(parsedValue)) {
                      setOrderData((prev) => ({ ...prev, quantity: 0 }));
                      return;
                    }

                    if (parsedValue < 0) {
                      AppSwal.fire({
                        icon: "warning",
                        title: "จำนวนไม่ถูกต้อง",
                        text: "จำนวนสั่งทำห้ามน้อยกว่า 0",
                        confirmButtonText: "รับทราบ",
                        confirmButtonColor: "#0057B8",
                      });
                      setOrderData((prev) => ({ ...prev, quantity: 0 }));
                      return;
                    }

                    setOrderData((prev) => ({
                      ...prev,
                      quantity: parsedValue,
                    }));
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="กรอกจำนวนที่ต้องการสั่งผลิต..."
                  min="1"
                  required
                  className={`${getRequiredFieldStyle(orderData.quantity)} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                />
              </div>

              {/* หมายเหตุ */}
              <div className="md:col-span-2">
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  หมายเหตุ (Notes)
                </label>
                <textarea
                  value={orderData.notes || ""}
                  onChange={(e) =>
                    setOrderData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="กรอกรายละเอียดเพิ่มเติมหรือหมายเหตุพิเศษ..."
                  rows={3}
                  className="w-full px-4 py-3 bg-white border border-[#D9E1E2] rounded-xl text-[#101820] text-[13.5px] font-medium focus:outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10 transition-all duration-200 resize-none shadow-sm"
                />
              </div>

              {/* Image Upload */}
              <div className="md:col-span-2">
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  📷 ภาพตัวอย่างฉลาก (Label Image Proof){" "}
                  <span className="text-slate-400 font-normal lowercase">
                    (optional, max 2 MB)
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  id="label-image-input"
                />
                {!imagePreview ? (
                  <label
                    htmlFor="label-image-input"
                    className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-[#D9E1E2] rounded-2xl cursor-pointer hover:border-[#00AEC7] hover:bg-[#E5F8FB]/40 transition-all duration-300 group bg-[#F0F3F4]/50"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-[#8A9498] group-hover:text-[#00AEC7] group-hover:shadow-md transition-all duration-300 mb-3 border border-[#D9E1E2]">
                      <ImagePlus className="w-6 h-6" />
                    </div>
                    <span className="text-[13px] font-bold text-[#5F6B70] group-hover:text-[#0057B8] transition-colors">
                      อัปโหลดภาพตัวอย่างฉลาก
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium mt-1">
                      JPG, PNG, WEBP (สูงสุด 2 MB)
                    </span>
                  </label>
                ) : (
                  <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="ตัวอย่างฉลาก"
                      className="w-full max-h-60 object-contain mx-auto"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2.5 right-2.5 bg-[#C8102E] hover:bg-[#9B0B23] text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-colors active:scale-95"
                      title="ลบรูปภาพ"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[11.5px] py-2 px-3 text-center truncate">
                      {imageFile?.name}
                    </div>
                  </div>
                )}
              </div>

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
                    !orderData.expiryDate ||
                    !orderData.quantity ||
                    !!productConfigurationError ||
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
                      บันทึกคำสั่ง{orderData.orderType}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
