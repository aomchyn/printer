import { addCalendarDays, parseCalendarDate } from "./productDate";

export const PRODUCT_DATE_FORMATS = [
  "DD/MM/YYYY",
  "DDMMYYYY",
  "DD/MM/YY",
  "DDMMYY",
  "YYYY/MM/DD",
  "YYYY/M/D",
  "YYYY-MM-DD",
  "YYYYMMDD",
  "DD-MM-YYYY",
  "DD.MM.YYYY",
  "MM/YY",
  "MM YYYY",
  "MMM YYYY",
  "MMMM YYYY",
  "DD MMM,YYYY",
  "DD MMM.,YYYY",
  "DD,MMM.,YYYY",
  "MMM,DD,YYYY",
] as const;

export type ProductDateFormat = (typeof PRODUCT_DATE_FORMATS)[number];
export type ProductDateCalendar = "gregorian" | "buddhist";
export type ProductDateMonthCase = "upper" | "title";
export type PrintingPresetV1 =
  | "date_only"
  | "date_and_lot"
  | "mfg_exp"
  | "mfg_exp_lot"
  | "mfg_exp_unlabeled"
  | "custom";

export interface DateFormatSpec {
  pattern: ProductDateFormat;
  calendar: ProductDateCalendar;
  monthCase?: ProductDateMonthCase;
}

export interface PrintingConfigV1 {
  version: 1;
  preset: PrintingPresetV1;
  template: string;
  mfg_format: DateFormatSpec | null;
  exp_format: DateFormatSpec | null;
  exp_offset_days: 0 | -1;
}

export type ProductPrintingConfig = PrintingConfigV1 | null;

export interface PrintingConfigValidationSuccess {
  valid: true;
}

export interface PrintingConfigValidationFailure {
  valid: false;
  errors: string[];
}

export type PrintingConfigValidationResult =
  | PrintingConfigValidationSuccess
  | PrintingConfigValidationFailure;

export interface RenderPrintingTemplateInput {
  config: ProductPrintingConfig;
  productionDate: string;
  canonicalExpiryDate: string;
  lot?: string | null;
}

export type PrintingRenderResult =
  | { status: "not_configured"; message: "ยังไม่กำหนดรูปแบบการพิมพ์" }
  | { status: "invalid_config"; errors: string[] }
  | { status: "invalid_input"; message: string }
  | { status: "incomplete"; missing: Array<"LOT"> }
  | { status: "ready"; text: string };

const PRINTING_CONFIG_KEYS = [
  "version",
  "preset",
  "template",
  "mfg_format",
  "exp_format",
  "exp_offset_days",
] as const;
const DATE_FORMAT_SPEC_KEYS = ["pattern", "calendar", "monthCase"] as const;
const PRESETS: readonly PrintingPresetV1[] = [
  "date_only",
  "date_and_lot",
  "mfg_exp",
  "mfg_exp_lot",
  "mfg_exp_unlabeled",
  "custom",
];
const ALLOWED_PLACEHOLDERS = ["{MFG_DATE}", "{EXP_DATE}", "{LOT}"] as const;
const TEMPLATE_MAX_LENGTH = 1000;
const UPPERCASE_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const TITLECASE_SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TITLECASE_LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasRequiredKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function includesPlaceholder(template: string, placeholder: (typeof ALLOWED_PLACEHOLDERS)[number]): boolean {
  return template.includes(placeholder);
}

function validateDateFormatSpec(value: unknown, fieldName: string): string[] {
  if (!isRecord(value)) return [`${fieldName} must be a DateFormatSpec object`];

  const errors: string[] = [];
  if (!hasOnlyKeys(value, DATE_FORMAT_SPEC_KEYS)) {
    errors.push(`${fieldName} contains unsupported DateFormatSpec keys`);
  }
  if (!hasRequiredKeys(value, ["pattern", "calendar"]) || typeof value.pattern !== "string" || typeof value.calendar !== "string") {
    errors.push(`${fieldName} must include string pattern and calendar values`);
  } else {
    if (!PRODUCT_DATE_FORMATS.includes(value.pattern as ProductDateFormat)) {
      errors.push(`${fieldName} has an unsupported date pattern`);
    }
    if (value.calendar !== "gregorian" && value.calendar !== "buddhist") {
      errors.push(`${fieldName} has an unsupported calendar`);
    }
  }
  if ("monthCase" in value && value.monthCase !== "upper" && value.monthCase !== "title") {
    errors.push(`${fieldName} has an unsupported monthCase`);
  }
  return errors;
}

/** Validates config persistence rules only; LOT is deliberately a runtime concern. */
export function validatePrintingConfig(config: unknown): PrintingConfigValidationResult {
  if (config === null) return { valid: true };
  if (!isRecord(config)) return { valid: false, errors: ["printing_config must be an object or null"] };

  const errors: string[] = [];
  if (!hasOnlyKeys(config, PRINTING_CONFIG_KEYS)) errors.push("printing_config contains unsupported V1 keys");
  if (!hasRequiredKeys(config, PRINTING_CONFIG_KEYS)) errors.push("printing_config is missing required V1 keys");
  if (config.version !== 1) errors.push("printing_config.version must be numeric 1");
  if (typeof config.preset !== "string" || !PRESETS.includes(config.preset as PrintingPresetV1)) errors.push("printing_config.preset is invalid");
  if (typeof config.template !== "string") {
    errors.push("printing_config.template must be a string");
  } else {
    if (config.template.trim() === "" || Array.from(config.template).length > TEMPLATE_MAX_LENGTH) {
      errors.push("printing_config.template must be non-empty and at most 1000 characters");
    }
    const withoutAllowedPlaceholders = ALLOWED_PLACEHOLDERS.reduce(
      (template, placeholder) => template.replaceAll(placeholder, ""),
      config.template,
    );
    if (withoutAllowedPlaceholders.includes("{") || withoutAllowedPlaceholders.includes("}")) {
      errors.push("printing_config.template contains an unknown or malformed placeholder");
    }
    if (includesPlaceholder(config.template, "{MFG_DATE}") && config.mfg_format === null) {
      errors.push("printing_config.mfg_format is required by {MFG_DATE}");
    }
    if (includesPlaceholder(config.template, "{EXP_DATE}") && config.exp_format === null) {
      errors.push("printing_config.exp_format is required by {EXP_DATE}");
    }
    if (!includesPlaceholder(config.template, "{EXP_DATE}") && config.exp_offset_days !== 0) {
      errors.push("printing_config.exp_offset_days must be 0 without {EXP_DATE}");
    }
  }

  if (config.mfg_format !== null) errors.push(...validateDateFormatSpec(config.mfg_format, "printing_config.mfg_format"));
  if (config.exp_format !== null) errors.push(...validateDateFormatSpec(config.exp_format, "printing_config.exp_format"));
  if (config.exp_offset_days !== 0 && config.exp_offset_days !== -1) {
    errors.push("printing_config.exp_offset_days must be 0 or -1");
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/** Formats a canonical calendar date using a deterministic PrintingConfigV1 date format. */
export function formatProductDate(canonicalDate: string, format: DateFormatSpec): string {
  const { year, month, day } = parseCalendarDate(canonicalDate);
  const formattedYear = year + (format.calendar === "buddhist" ? 543 : 0);
  const yyyy = String(formattedYear).padStart(4, "0");
  const yy = yyyy.slice(-2);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const titleMonths = format.monthCase === "upper" ? UPPERCASE_MONTHS : TITLECASE_SHORT_MONTHS;
  const shortMonth = titleMonths[month - 1];
  const longMonth = format.monthCase === "upper" ? TITLECASE_LONG_MONTHS[month - 1].toUpperCase() : TITLECASE_LONG_MONTHS[month - 1];

  switch (format.pattern) {
    case "DD/MM/YYYY": return `${dd}/${mm}/${yyyy}`;
    case "DDMMYYYY": return `${dd}${mm}${yyyy}`;
    case "DD/MM/YY": return `${dd}/${mm}/${yy}`;
    case "DDMMYY": return `${dd}${mm}${yy}`;
    case "YYYY/MM/DD": return `${yyyy}/${mm}/${dd}`;
    case "YYYY/M/D": return `${yyyy}/${month}/${day}`;
    case "YYYY-MM-DD": return `${yyyy}-${mm}-${dd}`;
    case "YYYYMMDD": return `${yyyy}${mm}${dd}`;
    case "DD-MM-YYYY": return `${dd}-${mm}-${yyyy}`;
    case "DD.MM.YYYY": return `${dd}.${mm}.${yyyy}`;
    case "MM/YY": return `${mm}/${yy}`;
    case "MM YYYY": return `${mm} ${yyyy}`;
    case "MMM YYYY": return `${shortMonth} ${yyyy}`;
    case "MMMM YYYY": return `${longMonth} ${yyyy}`;
    case "DD MMM,YYYY": return `${dd} ${shortMonth},${yyyy}`;
    case "DD MMM.,YYYY": return `${dd} ${shortMonth}.,${yyyy}`;
    case "DD,MMM.,YYYY": return `${dd},${shortMonth}.,${yyyy}`;
    case "MMM,DD,YYYY": return `${shortMonth},${dd},${yyyy}`;
  }
}

/** Renders only whitelisted placeholders and keeps canonical expiry separate from printed expiry. */
export function renderPrintingTemplate({
  config,
  productionDate,
  canonicalExpiryDate,
  lot,
}: RenderPrintingTemplateInput): PrintingRenderResult {
  if (config === null) return { status: "not_configured", message: "ยังไม่กำหนดรูปแบบการพิมพ์" };

  const validation = validatePrintingConfig(config);
  if (!validation.valid) return { status: "invalid_config", errors: validation.errors };

  const missing: Array<"LOT"> = [];
  if (config.template.includes("{LOT}") && (!lot || lot.trim() === "")) missing.push("LOT");
  if (missing.length > 0) return { status: "incomplete", missing };

  try {
    let text = config.template;
    if (text.includes("{MFG_DATE}")) text = text.replaceAll("{MFG_DATE}", formatProductDate(productionDate, config.mfg_format!));
    if (text.includes("{EXP_DATE}")) {
      const printedExpiryDate = addCalendarDays(canonicalExpiryDate, config.exp_offset_days);
      text = text.replaceAll("{EXP_DATE}", formatProductDate(printedExpiryDate, config.exp_format!));
    }
    if (text.includes("{LOT}")) text = text.replaceAll("{LOT}", lot!.trim());
    return { status: "ready", text };
  } catch (error) {
    return { status: "invalid_input", message: error instanceof Error ? error.message : "Invalid printing input" };
  }
}
