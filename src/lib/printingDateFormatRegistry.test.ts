import { describe, expect, it } from "vitest";
import {
  buildDateOnlyPrintingConfig,
  isPrintingDateFormatEnabled,
  isPrintingDateFormatDeletable,
  isRetiredPrintingDatePattern,
  sortPrintingDateFormats,
  usesMonthNameInPrintingDatePattern,
} from "./printingDateFormatRegistry";

const formats = [
  { id: "b", pattern: "YY-MM-DD", display_label: "Dynamic", enabled: true, sort_order: 20 },
  { id: "a", pattern: "DD/MM/YYYY", display_label: "Seed", enabled: false, sort_order: 10 },
  { id: "c", pattern: "MMM YYYY", display_label: "Month", enabled: true, sort_order: 20 },
];

describe("printingDateFormatRegistry", () => {
  it("sorts deterministically and maps enabled versus retired patterns", () => {
    expect(sortPrintingDateFormats(formats).map((format) => format.id)).toEqual(["a", "b", "c"]);
    expect(isPrintingDateFormatEnabled(formats, "YY-MM-DD")).toBe(true);
    expect(isPrintingDateFormatEnabled(formats, "DD/MM/YYYY")).toBe(false);
    expect(isRetiredPrintingDatePattern(formats, "DD/MM/YYYY")).toBe(true);
    expect(isRetiredPrintingDatePattern(formats, "YYYYMMDD")).toBe(false);
  });

  it("detects month-name patterns without limiting dynamic grammar", () => {
    expect(usesMonthNameInPrintingDatePattern("MMMM YYYY")).toBe(true);
    expect(usesMonthNameInPrintingDatePattern("YY-MM-DD")).toBe(false);
  });

  it("builds the exact date_only config for a dynamic selected pattern", () => {
    expect(buildDateOnlyPrintingConfig({ pattern: "YY-MM-DD", calendar: "buddhist", monthCase: "upper" })).toEqual({
      version: 1,
      preset: "date_only",
      template: "{MFG_DATE}",
      mfg_format: { pattern: "YY-MM-DD", calendar: "buddhist" },
      exp_format: null,
      exp_offset_days: 0,
    });
  });

  it("allows permanent deletion only when no current Product uses the pattern", () => {
    expect(isPrintingDateFormatDeletable({ product_usage_count: 0 })).toBe(true);
    expect(isPrintingDateFormatDeletable({ product_usage_count: 1 })).toBe(false);
    expect(isPrintingDateFormatDeletable({ product_usage_count: 12 })).toBe(false);
  });
});
