"use client";

import { useMemo } from "react";
import {
  type DateFormatSpec,
  type PrintingConfigV1,
  type ProductPrintingConfig,
  formatProductDate,
  renderPrintingTemplate,
  validatePrintingConfig,
} from "@/lib/productPrinting";
import {
  buildDateOnlyPrintingConfig,
  isPrintingDateFormatEnabled,
  isRetiredPrintingDatePattern,
  sortPrintingDateFormats,
  usesMonthNameInPrintingDatePattern,
  type PrintingDateFormatRegistryRow,
} from "@/lib/printingDateFormatRegistry";
import SearchableSelect, {
  type SearchableSelectOption,
} from "../components/SearchableSelect";

interface PrintingConfigBuilderProps {
  value: ProductPrintingConfig;
  onChange: (value: ProductPrintingConfig) => void;
  formats: readonly PrintingDateFormatRegistryRow[];
  registryStatus: "loading" | "loaded" | "error";
  onRetryRegistryLoad: () => void;
}

type ProductPrintingMode = "none" | "date_only" | "legacy";

const DEFAULT_FORMAT: DateFormatSpec = {
  pattern: "DD/MM/YYYY",
  calendar: "gregorian",
};
const SAMPLE_PRODUCTION_DATE = "2025-06-18";

function createDateOnlyConfig(
  sourceFormat: DateFormatSpec | null | undefined,
  fallbackPattern: string,
): PrintingConfigV1 {
  return buildDateOnlyPrintingConfig({
    ...(sourceFormat ?? { ...DEFAULT_FORMAT, pattern: fallbackPattern }),
  });
}

function isDateOnlyConfig(
  config: ProductPrintingConfig,
): config is PrintingConfigV1 {
  return (
    config !== null &&
    config.preset === "date_only" &&
    validatePrintingConfig(config).valid
  );
}

function formatOptionLabel(format: PrintingDateFormatRegistryRow): string {
  const sample = formatProductDate(SAMPLE_PRODUCTION_DATE, {
    pattern: format.pattern,
    calendar: "gregorian",
    monthCase: usesMonthNameInPrintingDatePattern(format.pattern) ? "title" : undefined,
  });
  return `${format.display_label} — ${format.pattern} (${sample})`;
}

export default function PrintingConfigBuilder({
  value,
  onChange,
  formats,
  registryStatus,
  onRetryRegistryLoad,
}: PrintingConfigBuilderProps) {
  const configValidation = validatePrintingConfig(value);
  const mode: ProductPrintingMode =
    value === null ? "none" : isDateOnlyConfig(value) ? "date_only" : "legacy";
  const dateOnlyConfig = mode === "date_only" ? value : null;
  const currentFormat = dateOnlyConfig?.mfg_format ?? DEFAULT_FORMAT;
  const enabledFormats = useMemo(
    () => sortPrintingDateFormats(formats.filter((format) => format.enabled)),
    [formats],
  );
  const registryReady = registryStatus === "loaded" && enabledFormats.length > 0;
  const unavailableCurrentPattern = mode === "date_only"
    && registryStatus === "loaded"
    && !isPrintingDateFormatEnabled(formats, currentFormat.pattern);
  const retiredCurrentPattern = unavailableCurrentPattern
    && isRetiredPrintingDatePattern(formats, currentFormat.pattern);
  const currentPatternIsEnabled = registryStatus === "loaded"
    && isPrintingDateFormatEnabled(formats, currentFormat.pattern);
  const formatOptions = useMemo<readonly SearchableSelectOption[]>(() => {
    const enabledOptions = enabledFormats.map((format) => ({
      value: format.pattern,
      label: formatOptionLabel(format),
    }));

    if (!unavailableCurrentPattern) return enabledOptions;

    return [
      {
        value: currentFormat.pattern,
        label: `${currentFormat.pattern} — ไม่พร้อมเลือกใหม่`,
        disabled: true,
      },
      ...enabledOptions,
    ];
  }, [currentFormat.pattern, enabledFormats, unavailableCurrentPattern]);

  const selectMode = (nextMode: Exclude<ProductPrintingMode, "legacy">) => {
    if (nextMode === "none") {
      onChange(null);
      return;
    }

    if (!registryReady) return;

    onChange(
      createDateOnlyConfig(
        mode === "date_only" && currentPatternIsEnabled
          ? dateOnlyConfig?.mfg_format
          : null,
        enabledFormats[0].pattern,
      ),
    );
  };

  const updateDateOnlyFormat = (update: Partial<DateFormatSpec>) => {
    if (dateOnlyConfig === null) return;
    if (unavailableCurrentPattern && update.pattern === undefined) return;
    onChange(
      createDateOnlyConfig(
        { ...currentFormat, ...update },
        enabledFormats[0]?.pattern ?? DEFAULT_FORMAT.pattern,
      ),
    );
  };

  const renderPreview = () => {
    if (mode === "none") {
      return <p className="text-sm text-slate-500">ยังไม่ได้กำหนดรูปแบบการพิมพ์</p>;
    }
    if (mode === "legacy") {
      return <p className="text-sm text-amber-700">รูปแบบการพิมพ์เดิมจะถูกเก็บไว้จนกว่าจะเลือกการตั้งค่าใหม่</p>;
    }

    const preview = renderPrintingTemplate({
      config: dateOnlyConfig,
      productionDate: SAMPLE_PRODUCTION_DATE,
      canonicalExpiryDate: SAMPLE_PRODUCTION_DATE,
    });
    if (preview.status === "ready") {
      return <p className="rounded-lg bg-white px-3 py-2 font-mono text-sm text-[#00263A]">{preview.text}</p>;
    }

    return <p className="text-sm text-[#C8102E]">ไม่สามารถสร้างตัวอย่างการพิมพ์ได้</p>;
  };

  return (
    <fieldset className="space-y-4 border-t border-[#D9E1E2] pt-4">
      <legend className="text-sm font-black text-[#00263A]">การพิมพ์วันที่</legend>

      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-slate-500">รูปแบบการพิมพ์</p>
        <div className="space-y-2 text-[13px] text-slate-700">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="product-printing-mode"
              checked={mode === "none"}
              onChange={() => selectMode("none")}
            />
            ไม่มีรูปแบบพิเศษ
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="product-printing-mode"
              checked={mode === "date_only"}
              onChange={() => selectMode("date_only")}
            />
            มีรูปแบบพิเศษ
          </label>
        </div>
      </div>

      {mode === "legacy" && (
        <div className="rounded-lg border border-[#F1C400]/30 bg-[#FFF8D6] px-3 py-2 text-[12px] text-[#6E5B00]" role="alert">
          <p className="font-bold">รูปแบบการพิมพ์เดิม</p>
          <p className="mt-1">สินค้านี้มีรูปแบบการพิมพ์เดิมที่ไม่ได้ใช้ใน Product UI รุ่นปัจจุบัน หากเปลี่ยนการตั้งค่าการพิมพ์ ระบบจะเปลี่ยนเป็น “มีรูปแบบพิเศษ” หรือ “ไม่มีรูปแบบพิเศษ”</p>
          {!configValidation.valid && (
            <p className="mt-1 font-semibold text-[#9B0B23]">รูปแบบการพิมพ์เดิมที่บันทึกไว้ไม่ถูกต้อง</p>
          )}
        </div>
      )}

      {mode === "none" && (
        <p className="rounded-lg border border-[#D9E1E2] bg-[#F5F7F8] px-3 py-2 text-[12px] text-slate-600">
          สินค้านี้ไม่มีรูปแบบวันที่สำหรับพิมพ์เฉพาะ
        </p>
      )}

      {mode === "date_only" && (
        <div className="rounded-lg border border-[#D9E1E2] bg-white p-3 space-y-3">
          <p className="text-[12px] font-bold text-[#00263A]">รูปแบบวันที่ผลิต</p>
          {registryStatus === "loading" && <p className="text-[12px] text-slate-500">กำลังโหลดรูปแบบวันที่...</p>}
          {registryStatus === "error" && (
            <div className="rounded-lg border border-[#C8102E]/25 bg-[#FCEAEC] px-3 py-2 text-[12px] text-[#9B0B23]" role="alert">
              ไม่สามารถโหลดรูปแบบวันที่ได้ การตั้งค่าปัจจุบันจะไม่ถูกเปลี่ยน
              <button type="button" onClick={onRetryRegistryLoad} className="ml-2 font-bold underline">ลองใหม่</button>
            </div>
          )}
          {unavailableCurrentPattern && (
            <p className="rounded-lg border border-[#F1C400]/30 bg-[#FFF8D6] px-3 py-2 text-[12px] text-[#6E5B00]" role="alert">
              {retiredCurrentPattern
                ? "รูปแบบวันที่ปัจจุบันถูกปิดใช้งานแล้ว"
                : "ไม่พบรูปแบบวันที่ปัจจุบันในรายการที่ใช้งานได้"} ระบบจะเก็บค่าเดิมไว้จนกว่าจะเลือกรูปแบบใหม่หรือเลือกไม่มีรูปแบบพิเศษ
            </p>
          )}
          <div>
            <label
              htmlFor="product-printing-date-format"
              className="mb-1 block text-[11px] font-semibold text-slate-500"
            >
              รูปแบบวันที่ผลิต
            </label>
            <SearchableSelect
              id="product-printing-date-format"
              value={currentFormat.pattern}
              disabled={!registryReady}
              options={formatOptions}
              ariaLabel="รูปแบบวันที่ผลิต"
              searchPlaceholder="ค้นหารูปแบบการพิมพ์..."
              emptyMessage="ไม่พบรูปแบบการพิมพ์"
              onChange={(pattern) =>
                updateDateOnlyFormat({
                  pattern,
                })
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">ปฏิทิน</label>
              <select
                className="w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
                value={currentFormat.calendar}
                disabled={!registryReady || unavailableCurrentPattern}
                onChange={(event) =>
                  updateDateOnlyFormat({
                    calendar: event.target.value as DateFormatSpec["calendar"],
                  })
                }
              >
                <option value="gregorian">ค.ศ.</option>
                <option value="buddhist">พ.ศ.</option>
              </select>
            </div>
            {usesMonthNameInPrintingDatePattern(currentFormat.pattern) && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">ตัวพิมพ์ชื่อเดือน</label>
                <select
                  className="w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
                  value={currentFormat.monthCase ?? "title"}
                  disabled={!registryReady || unavailableCurrentPattern}
                  onChange={(event) =>
                    updateDateOnlyFormat({
                      monthCase: event.target.value as DateFormatSpec["monthCase"],
                    })
                  }
                >
                  <option value="upper">ตัวพิมพ์ใหญ่</option>
                  <option value="title">ตัวพิมพ์ปกติ</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#00AEC7]/20 bg-[#EAF8FA] p-3">
        <p className="mb-1 text-[12px] font-bold text-[#00263A]">ตัวอย่างการพิมพ์</p>
        {renderPreview()}
      </div>
    </fieldset>
  );
}
