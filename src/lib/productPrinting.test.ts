import { describe, expect, it } from "vitest";
import {
  formatProductDate,
  renderPrintingTemplate,
  validatePrintingConfig,
  type DateFormatSpec,
  type PrintingConfigV1,
} from "./productPrinting";

const gregorianDay: DateFormatSpec = { pattern: "DD/MM/YYYY", calendar: "gregorian" };

function config(overrides: Partial<PrintingConfigV1> = {}): PrintingConfigV1 {
  return {
    version: 1,
    preset: "mfg_exp",
    template: "MFG {MFG_DATE} / EXP {EXP_DATE}",
    mfg_format: gregorianDay,
    exp_format: gregorianDay,
    exp_offset_days: 0,
    ...overrides,
  };
}

describe("productPrinting", () => {
  it("matches the DB V1 validator for null, required fields, placeholders, and LOT context", () => {
    expect(validatePrintingConfig(null)).toEqual({ valid: true });
    expect(validatePrintingConfig(config({ template: "MFG {MFG_DATE} / Lot {LOT}" }))).toEqual({ valid: true });
    expect(validatePrintingConfig(config({ template: "{UNKNOWN}", exp_format: null }))).toMatchObject({ valid: false });
    expect(validatePrintingConfig(config({ template: "{MFG_DATE}", exp_offset_days: -1 }))).toMatchObject({ valid: false });
    expect(validatePrintingConfig(config({ template: "{EXP_DATE}", exp_format: null }))).toMatchObject({ valid: false });
  });

  it("formats supported deterministic Gregorian and Buddhist formats", () => {
    expect(formatProductDate("2025-08-25", { pattern: "MMM YYYY", calendar: "gregorian", monthCase: "upper" })).toBe("AUG 2025");
    expect(formatProductDate("2026-06-03", { pattern: "DD MMM,YYYY", calendar: "gregorian", monthCase: "upper" })).toBe("03 JUN,2026");
    expect(formatProductDate("2027-06-03", { pattern: "DD MMM.,YYYY", calendar: "gregorian", monthCase: "upper" })).toBe("03 JUN.,2027");
    expect(formatProductDate("2024-12-13", { pattern: "DD/MM/YY", calendar: "buddhist" })).toBe("13/12/67");
    expect(formatProductDate("2025-07-23", { pattern: "MM/YY", calendar: "gregorian" })).toBe("07/25");
    expect(formatProductDate("2025-07-02", { pattern: "YYYY/MM/DD", calendar: "gregorian" })).toBe("2025/07/02");
  });

  it("renders date-only labels", () => {
    expect(renderPrintingTemplate({
      config: config({ preset: "date_only", template: "พิมพ์วันที่ {MFG_DATE}", exp_format: null }),
      productionDate: "2026-06-03",
      canonicalExpiryDate: "2027-06-03",
    })).toEqual({ status: "ready", text: "พิมพ์วันที่ 03/06/2026" });

    expect(renderPrintingTemplate({
      config: config({ preset: "date_only", template: "พิมพ์วันที่ {MFG_DATE}", mfg_format: { pattern: "YYYYMMDD", calendar: "gregorian" }, exp_format: null }),
      productionDate: "2026-06-03",
      canonicalExpiryDate: "2027-06-03",
    })).toEqual({ status: "ready", text: "พิมพ์วันที่ 20260603" });

    expect(renderPrintingTemplate({
      config: config({ preset: "date_only", template: "พิมพ์วันที่ {MFG_DATE}", mfg_format: { pattern: "MMM YYYY", calendar: "gregorian", monthCase: "upper" }, exp_format: null }),
      productionDate: "2025-08-25",
      canonicalExpiryDate: "2026-08-25",
    })).toEqual({ status: "ready", text: "พิมพ์วันที่ AUG 2025" });
  });

  it("supports different MFG and EXP punctuation formats", () => {
    expect(renderPrintingTemplate({
      config: config({
        preset: "mfg_exp_unlabeled",
        template: "{MFG_DATE} / {EXP_DATE}",
        mfg_format: { pattern: "DD MMM,YYYY", calendar: "gregorian", monthCase: "upper" },
        exp_format: { pattern: "DD MMM.,YYYY", calendar: "gregorian", monthCase: "upper" },
      }),
      productionDate: "2026-06-03",
      canonicalExpiryDate: "2027-06-03",
    })).toEqual({ status: "ready", text: "03 JUN,2026 / 03 JUN.,2027" });
  });

  it("uses a printing-only EXP offset without mutating canonical expiry", () => {
    const canonicalExpiryDate = "2026-12-18";
    expect(renderPrintingTemplate({
      config: config({
        template: "Man.date: {MFG_DATE} / Exp. date: {EXP_DATE} / Lot {LOT}",
        preset: "mfg_exp_lot",
        exp_offset_days: -1,
      }),
      productionDate: "2025-06-18",
      canonicalExpiryDate,
      lot: "25061804",
    })).toEqual({ status: "ready", text: "Man.date: 18/06/2025 / Exp. date: 17/12/2026 / Lot 25061804" });
    expect(canonicalExpiryDate).toBe("2026-12-18");
  });

  it("returns typed non-rendered states", () => {
    expect(renderPrintingTemplate({ config: null, productionDate: "2026-06-03", canonicalExpiryDate: "2027-06-03" })).toEqual({ status: "not_configured", message: "ยังไม่กำหนดรูปแบบการพิมพ์" });
    expect(renderPrintingTemplate({
      config: config({ preset: "date_and_lot", template: "{MFG_DATE} / Lot {LOT}", exp_format: null }),
      productionDate: "2026-06-03",
      canonicalExpiryDate: "2027-06-03",
    })).toEqual({ status: "incomplete", missing: ["LOT"] });
  });

  it("renders MFG plus LOT when the runtime context is complete", () => {
    expect(renderPrintingTemplate({
      config: config({ preset: "date_and_lot", template: "{MFG_DATE} / Lot {LOT}", exp_format: null }),
      productionDate: "2026-06-03",
      canonicalExpiryDate: "2027-06-03",
      lot: "2606042",
    })).toEqual({ status: "ready", text: "03/06/2026 / Lot 2606042" });
  });
});
