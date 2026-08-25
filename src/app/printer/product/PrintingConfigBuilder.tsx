"use client";

import {
  PRODUCT_DATE_FORMATS,
  type DateFormatSpec,
  type PrintingConfigV1,
  type ProductDateFormat,
  type ProductPrintingConfig,
  formatProductDate,
  renderPrintingTemplate,
  validatePrintingConfig,
} from "@/lib/productPrinting";

interface PrintingConfigBuilderProps {
  value: ProductPrintingConfig;
  onChange: (value: ProductPrintingConfig) => void;
}

type ProductPrintingMode = "none" | "date_only" | "legacy";

const DEFAULT_FORMAT: DateFormatSpec = {
  pattern: "DD/MM/YYYY",
  calendar: "gregorian",
};
const SAMPLE_PRODUCTION_DATE = "2025-06-18";

function usesMonthName(pattern: string): boolean {
  return pattern.includes("MMM");
}

function withRelevantMonthCase(format: DateFormatSpec): DateFormatSpec {
  if (usesMonthName(format.pattern)) {
    return {
      ...format,
      monthCase: format.monthCase ?? "title",
    };
  }

  const { monthCase: _monthCase, ...withoutMonthCase } = format;
  return withoutMonthCase;
}

function createDateOnlyConfig(
  sourceFormat?: DateFormatSpec | null,
): PrintingConfigV1 {
  return {
    version: 1,
    preset: "date_only",
    template: "{MFG_DATE}",
    mfg_format: withRelevantMonthCase({
      ...(sourceFormat ?? DEFAULT_FORMAT),
    }),
    exp_format: null,
    exp_offset_days: 0,
  };
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

function formatOptionLabel(pattern: ProductDateFormat): string {
  const sample = formatProductDate(SAMPLE_PRODUCTION_DATE, {
    pattern,
    calendar: "gregorian",
    monthCase: pattern === "MMMM YYYY" ? "title" : "upper",
  });
  return `${pattern} — ${sample}`;
}

export default function PrintingConfigBuilder({
  value,
  onChange,
}: PrintingConfigBuilderProps) {
  const configValidation = validatePrintingConfig(value);
  const mode: ProductPrintingMode =
    value === null ? "none" : isDateOnlyConfig(value) ? "date_only" : "legacy";
  const dateOnlyConfig = mode === "date_only" ? value : null;
  const currentFormat = dateOnlyConfig?.mfg_format ?? DEFAULT_FORMAT;

  const selectMode = (nextMode: Exclude<ProductPrintingMode, "legacy">) => {
    if (nextMode === "none") {
      onChange(null);
      return;
    }

    onChange(
      createDateOnlyConfig(
        value !== null && configValidation.valid ? value.mfg_format : null,
      ),
    );
  };

  const updateDateOnlyFormat = (update: Partial<DateFormatSpec>) => {
    if (dateOnlyConfig === null) return;
    onChange(
      createDateOnlyConfig(
        withRelevantMonthCase({ ...currentFormat, ...update }),
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
            พิมพ์วันที่ผลิต
          </label>
        </div>
      </div>

      {mode === "legacy" && (
        <div className="rounded-lg border border-[#F1C400]/30 bg-[#FFF8D6] px-3 py-2 text-[12px] text-[#6E5B00]" role="alert">
          <p className="font-bold">รูปแบบการพิมพ์เดิม</p>
          <p className="mt-1">สินค้านี้มีรูปแบบการพิมพ์เดิมที่ไม่ได้ใช้ใน Product UI รุ่นปัจจุบัน หากเปลี่ยนการตั้งค่าการพิมพ์ ระบบจะเปลี่ยนเป็น “พิมพ์วันที่ผลิต” หรือ “ไม่มีรูปแบบพิเศษ”</p>
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
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">รูปแบบวันที่ผลิต</label>
            <select
              className="w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
              value={currentFormat.pattern}
              onChange={(event) =>
                updateDateOnlyFormat({
                  pattern: event.target.value as ProductDateFormat,
                })
              }
            >
              {PRODUCT_DATE_FORMATS.map((pattern) => (
                <option key={pattern} value={pattern}>{formatOptionLabel(pattern)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">ปฏิทิน</label>
              <select
                className="w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
                value={currentFormat.calendar}
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
            {usesMonthName(currentFormat.pattern) && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">ตัวพิมพ์ชื่อเดือน</label>
                <select
                  className="w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
                  value={currentFormat.monthCase ?? "title"}
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
