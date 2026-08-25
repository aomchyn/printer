import type { DateFormatSpec, PrintingConfigV1 } from "./productPrinting";

export interface PrintingDateFormatRegistryRow {
  id: string;
  pattern: string;
  display_label: string;
  enabled: boolean;
  sort_order: number;
}

export interface PrintingDateFormatManagementRow extends PrintingDateFormatRegistryRow {
  product_usage_count: number;
}

export function sortPrintingDateFormats<T extends PrintingDateFormatRegistryRow>(
  formats: readonly T[],
): T[] {
  return [...formats].sort((left, right) => (
    left.sort_order - right.sort_order || left.id.localeCompare(right.id)
  ));
}

export function isPrintingDateFormatEnabled(
  formats: readonly PrintingDateFormatRegistryRow[],
  pattern: string,
): boolean {
  return formats.some((format) => format.pattern === pattern && format.enabled);
}

export function isRetiredPrintingDatePattern(
  formats: readonly PrintingDateFormatRegistryRow[],
  pattern: string,
): boolean {
  return formats.some((format) => format.pattern === pattern) && !isPrintingDateFormatEnabled(formats, pattern);
}

export function usesMonthNameInPrintingDatePattern(pattern: string): boolean {
  return pattern.includes("MMM");
}

export function isPrintingDateFormatDeletable(
  format: Pick<PrintingDateFormatManagementRow, "product_usage_count">,
): boolean {
  return format.product_usage_count === 0;
}

export function buildDateOnlyPrintingConfig(format: DateFormatSpec): PrintingConfigV1 {
  const mfgFormat = usesMonthNameInPrintingDatePattern(format.pattern)
    ? { ...format, monthCase: format.monthCase ?? "title" }
    : (() => {
      const { monthCase: _monthCase, ...withoutMonthCase } = format;
      return withoutMonthCase;
    })();

  return {
    version: 1,
    preset: "date_only",
    template: "{MFG_DATE}",
    mfg_format: mfgFormat,
    exp_format: null,
    exp_offset_days: 0,
  };
}
