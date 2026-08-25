"use client";

import {
  PRODUCT_DATE_FORMATS,
  type DateFormatSpec,
  type PrintingConfigV1,
  type PrintingPresetV1,
  type ProductDateFormat,
  type ProductPrintingConfig,
  renderPrintingTemplate,
  validatePrintingConfig,
  formatProductDate,
} from "@/lib/productPrinting";

interface PrintingConfigBuilderProps {
  value: ProductPrintingConfig;
  onChange: (value: ProductPrintingConfig) => void;
  canonicalExpiryDate: string | null;
}

const DEFAULT_FORMAT: DateFormatSpec = {
  pattern: "DD/MM/YYYY",
  calendar: "gregorian",
};
const SAMPLE_PRODUCTION_DATE = "2025-06-18";
const SAMPLE_LOT = "25061804";

const PRESET_OPTIONS: Array<{ value: PrintingPresetV1; label: string }> = [
  { value: "date_only", label: "วันที่ผลิตอย่างเดียว" },
  { value: "date_and_lot", label: "วันที่ผลิต + LOT" },
  { value: "mfg_exp", label: "MFG + EXP" },
  { value: "mfg_exp_lot", label: "MFG + EXP + LOT" },
  { value: "mfg_exp_unlabeled", label: "MFG + EXP ไม่มี label" },
  { value: "custom", label: "กำหนดรูปแบบเอง" },
];

function createPresetConfig(preset: PrintingPresetV1): PrintingConfigV1 {
  const mfgFormat = { ...DEFAULT_FORMAT };
  const expFormat = { ...DEFAULT_FORMAT };

  switch (preset) {
    case "date_only":
      return {
        version: 1,
        preset,
        template: "พิมพ์วันที่ {MFG_DATE}",
        mfg_format: mfgFormat,
        exp_format: null,
        exp_offset_days: 0,
      };
    case "date_and_lot":
      return {
        version: 1,
        preset,
        template: "พิมพ์วันที่ {MFG_DATE} / Lot {LOT}",
        mfg_format: mfgFormat,
        exp_format: null,
        exp_offset_days: 0,
      };
    case "mfg_exp":
      return {
        version: 1,
        preset,
        template: "MFG {MFG_DATE} / EXP {EXP_DATE}",
        mfg_format: mfgFormat,
        exp_format: expFormat,
        exp_offset_days: 0,
      };
    case "mfg_exp_lot":
      return {
        version: 1,
        preset,
        template: "MFG {MFG_DATE} / EXP {EXP_DATE} / Lot {LOT}",
        mfg_format: mfgFormat,
        exp_format: expFormat,
        exp_offset_days: 0,
      };
    case "mfg_exp_unlabeled":
      return {
        version: 1,
        preset,
        template: "{MFG_DATE} / {EXP_DATE}",
        mfg_format: mfgFormat,
        exp_format: expFormat,
        exp_offset_days: 0,
      };
    case "custom":
      return {
        version: 1,
        preset,
        template: "MFG {MFG_DATE} / EXP {EXP_DATE}",
        mfg_format: mfgFormat,
        exp_format: expFormat,
        exp_offset_days: 0,
      };
  }
}

function formatOptionLabel(pattern: ProductDateFormat): string {
  const sample = formatProductDate(SAMPLE_PRODUCTION_DATE, {
    pattern,
    calendar: "gregorian",
    monthCase: "upper",
  });
  return `${pattern} — ${sample}`;
}

function usesMonthName(pattern: ProductDateFormat): boolean {
  return pattern.includes("MMM");
}

function updateFormat(
  config: PrintingConfigV1,
  field: "mfg_format" | "exp_format",
  update: Partial<DateFormatSpec>,
): PrintingConfigV1 {
  const current = config[field] ?? { ...DEFAULT_FORMAT };
  return { ...config, [field]: { ...current, ...update } };
}

export default function PrintingConfigBuilder({
  value,
  onChange,
  canonicalExpiryDate,
}: PrintingConfigBuilderProps) {
  const config = value;
  const configValidation = validatePrintingConfig(config);
  const activePreset = config?.preset ?? "none";
  const template = config?.template ?? "";
  const needsMfgFormat = template.includes("{MFG_DATE}");
  const needsExpFormat = template.includes("{EXP_DATE}");

  const setPreset = (next: string) => {
    if (next === "none") {
      onChange(null);
      return;
    }
    onChange(createPresetConfig(next as PrintingPresetV1));
  };

  const updateConfig = (update: (current: PrintingConfigV1) => PrintingConfigV1) => {
    if (config === null) return;
    onChange(update(config));
  };

  const renderPreview = () => {
    if (config === null) return <p className="text-sm text-slate-500">ยังไม่ได้กำหนดรูปแบบการพิมพ์</p>;
    if (!canonicalExpiryDate) {
      return <p className="text-sm text-amber-700">กรุณากำหนดอายุผลิตภัณฑ์เพื่อดูตัวอย่างวันหมดอายุ</p>;
    }
    const preview = renderPrintingTemplate({
      config,
      productionDate: SAMPLE_PRODUCTION_DATE,
      canonicalExpiryDate,
      lot: SAMPLE_LOT,
    });
    if (preview.status === "ready") {
      return <p className="rounded-lg bg-white px-3 py-2 font-mono text-sm text-[#00263A]">{preview.text}</p>;
    }
    if (preview.status === "incomplete") {
      return <p className="text-sm text-amber-700">ยังขาดข้อมูล: เลข LOT</p>;
    }
    if (preview.status === "invalid_config") {
      return <p className="text-sm text-[#C8102E]">รูปแบบการพิมพ์ไม่ถูกต้อง</p>;
    }
    return <p className="text-sm text-[#C8102E]">ไม่สามารถสร้างตัวอย่างการพิมพ์ได้</p>;
  };

  const formatControls = (
    label: string,
    field: "mfg_format" | "exp_format",
    format: DateFormatSpec | null,
  ) => {
    if (config === null) return null;
    const current = format ?? { ...DEFAULT_FORMAT };
    return (
      <div className="rounded-lg border border-[#D9E1E2] bg-white p-3 space-y-3">
        <p className="text-[12px] font-bold text-[#00263A]">{label}</p>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-500">รูปแบบวันที่</label>
          <select
            className="w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
            value={current.pattern}
            onChange={(event) => updateConfig((existing) => updateFormat(existing, field, { pattern: event.target.value as ProductDateFormat }))}
          >
            {PRODUCT_DATE_FORMATS.map((pattern) => (
              <option key={pattern} value={pattern}>{formatOptionLabel(pattern)}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">ปฏิทิน</label>
            <select
              className="w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
              value={current.calendar}
              onChange={(event) => updateConfig((existing) => updateFormat(existing, field, { calendar: event.target.value as DateFormatSpec["calendar"] }))}
            >
              <option value="gregorian">ค.ศ.</option>
              <option value="buddhist">พ.ศ.</option>
            </select>
          </div>
          {usesMonthName(current.pattern) && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">ตัวพิมพ์ชื่อเดือน</label>
              <select
                className="w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
                value={current.monthCase ?? "title"}
                onChange={(event) => updateConfig((existing) => updateFormat(existing, field, { monthCase: event.target.value as DateFormatSpec["monthCase"] }))}
              >
                <option value="upper">ตัวพิมพ์ใหญ่</option>
                <option value="title">ตัวพิมพ์ต้นคำใหญ่</option>
              </select>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <fieldset className="space-y-4 border-t border-[#D9E1E2] pt-4">
      <legend className="text-sm font-black text-[#00263A]">การพิมพ์วันที่</legend>
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-slate-500">รูปแบบการพิมพ์</label>
        <select
          className="w-full cursor-pointer rounded-lg border border-[#D9E1E2] bg-white px-3.5 py-2.5 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
          value={activePreset}
          onChange={(event) => setPreset(event.target.value)}
        >
          <option value="none">ไม่มีรูปแบบพิเศษ</option>
          {PRESET_OPTIONS.map((preset) => (
            <option key={preset.value} value={preset.value}>{preset.label}</option>
          ))}
        </select>
      </div>

      {config !== null && (
        <div className="space-y-3">
          {config.preset === "custom" && (
            <div className="rounded-lg border border-[#D9E1E2] bg-[#F5F7F8] p-3">
              <label className="mb-1.5 block text-[12px] font-semibold text-slate-500">Template</label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-[13px] text-[#101820] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/10"
                value={config.template}
                onChange={(event) => updateConfig((current) => ({ ...current, template: event.target.value }))}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {["{MFG_DATE}", "{EXP_DATE}", "{LOT}"].map((placeholder) => (
                  <button
                    key={placeholder}
                    type="button"
                    className="rounded-md border border-[#0057B8]/25 bg-white px-2 py-1 text-[11px] font-semibold text-[#0057B8] hover:bg-[#EAF3FC]"
                    onClick={() => updateConfig((current) => ({ ...current, template: `${current.template}${placeholder}` }))}
                  >
                    {placeholder}
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsMfgFormat && formatControls("รูปแบบวันที่ผลิต", "mfg_format", config.mfg_format)}
          {needsExpFormat && formatControls("รูปแบบวันหมดอายุ", "exp_format", config.exp_format)}

          {needsExpFormat && (
            <div className="rounded-lg border border-[#D9E1E2] bg-white p-3">
              <p className="mb-2 text-[12px] font-bold text-[#00263A]">วันที่ EXP ที่พิมพ์</p>
              <div className="space-y-2 text-[13px] text-slate-700">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="printed-exp-rule"
                    checked={config.exp_offset_days === 0}
                    onChange={() => updateConfig((current) => ({ ...current, exp_offset_days: 0 }))}
                  />
                  ตรงกับวันหมดอายุจริง
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="printed-exp-rule"
                    checked={config.exp_offset_days === -1}
                    onChange={() => updateConfig((current) => ({ ...current, exp_offset_days: -1 }))}
                  />
                  ก่อนวันหมดอายุจริง 1 วัน
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {!configValidation.valid && (
        <div className="rounded-lg border border-[#C8102E]/25 bg-[#FCEAEC] px-3 py-2 text-[12px] text-[#9B0B23]">
          <p className="font-bold">รูปแบบการพิมพ์ปัจจุบันไม่ถูกต้อง</p>
          <ul className="mt-1 list-disc pl-4">
            {configValidation.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-[#00AEC7]/20 bg-[#EAF8FA] p-3">
        <p className="mb-1 text-[12px] font-bold text-[#00263A]">ตัวอย่างการพิมพ์</p>
        {renderPreview()}
      </div>
    </fieldset>
  );
}
