import { describe, expect, it } from "vitest";
import {
  PRODUCT_DATE_FORMATS,
  describeProductPrintingConfig,
  formatEnglishOrdinalDay,
  formatProductDate,
  renderPrintingTemplate,
  tokenizeProductDatePattern,
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
  it("describes stored Product printing formats without the live registry", () => {
    expect(describeProductPrintingConfig(null)).toBe("ไม่มีรูปแบบพิเศษ");
    expect(describeProductPrintingConfig(config({
      preset: "date_only",
      template: "{MFG_DATE}",
      mfg_format: { pattern: "MM/YYYY", calendar: "gregorian" },
      exp_format: null,
    }))).toBe("MM/YYYY");
    expect(describeProductPrintingConfig(config({
      preset: "date_only",
      template: "{MFG_DATE}",
      mfg_format: { pattern: "DDMMYY", calendar: "gregorian" },
      exp_format: null,
    }))).toBe("DDMMYY");
    expect(describeProductPrintingConfig(config({
      preset: "mfg_exp",
      template: "MFG {MFG_DATE} / EXP {EXP_DATE}",
      mfg_format: { pattern: "DD/MM/YYYY", calendar: "gregorian" },
      exp_format: { pattern: "MM/YYYY", calendar: "gregorian" },
    }))).toBe("MFG DD/MM/YYYY · EXP MM/YYYY");
  });

  it("matches the DB V1 validator for null, required fields, placeholders, and LOT context", () => {
    expect(validatePrintingConfig(null)).toEqual({ valid: true });
    expect(validatePrintingConfig(config({ template: "MFG {MFG_DATE} / Lot {LOT}" }))).toEqual({ valid: true });
    expect(validatePrintingConfig(config({ template: "{UNKNOWN}", exp_format: null }))).toMatchObject({ valid: false });
    expect(validatePrintingConfig(config({ template: "{MFG_DATE}", exp_offset_days: -1 }))).toMatchObject({ valid: false });
    expect(validatePrintingConfig(config({ template: "{EXP_DATE}", exp_format: null }))).toMatchObject({ valid: false });
    expect(validatePrintingConfig(config({
      preset: "date_only",
      template: "{MFG_DATE}",
      mfg_format: { pattern: "MMM.Do,YYYY", calendar: "gregorian", monthCase: "lower" },
      exp_format: null,
    }))).toEqual({ valid: true });
  });

  it("formats supported deterministic Gregorian and Buddhist formats", () => {
    expect(formatProductDate("2025-08-25", { pattern: "MMM YYYY", calendar: "gregorian", monthCase: "upper" })).toBe("AUG 2025");
    expect(formatProductDate("2026-06-03", { pattern: "DD MMM,YYYY", calendar: "gregorian", monthCase: "upper" })).toBe("03 JUN,2026");
    expect(formatProductDate("2027-06-03", { pattern: "DD MMM.,YYYY", calendar: "gregorian", monthCase: "upper" })).toBe("03 JUN.,2027");
    expect(formatProductDate("2024-12-13", { pattern: "DD/MM/YY", calendar: "buddhist" })).toBe("13/12/67");
    expect(formatProductDate("2025-07-23", { pattern: "MM/YY", calendar: "gregorian" })).toBe("07/25");
    expect(formatProductDate("2025-07-02", { pattern: "YYYY/MM/DD", calendar: "gregorian" })).toBe("2025/07/02");
  });

  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [10, "10th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [20, "20th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [28, "28th"],
    [29, "29th"],
    [30, "30th"],
    [31, "31st"],
  ])("formats day %i with the English ordinal suffix %s", (day, expected) => {
    expect(formatEnglishOrdinalDay(day)).toBe(expected);
  });

  it("formats full English month and ordinal-day patterns", () => {
    const format: DateFormatSpec = {
      pattern: "MMM.Do,YYYY",
      calendar: "gregorian",
      monthCase: "title",
    };

    expect(formatProductDate("2026-06-29", format)).toBe("Jun.29th,2026");
    expect(formatProductDate("2027-06-28", format)).toBe("Jun.28th,2027");
    expect(formatProductDate("2026-06-01", format)).toBe("Jun.1st,2026");
    expect(formatProductDate("2026-06-02", format)).toBe("Jun.2nd,2026");
    expect(formatProductDate("2026-06-03", format)).toBe("Jun.3rd,2026");
    expect(formatProductDate("2026-06-04", format)).toBe("Jun.4th,2026");
    expect(formatProductDate("2026-06-11", format)).toBe("Jun.11th,2026");
    expect(formatProductDate("2026-06-12", format)).toBe("Jun.12th,2026");
    expect(formatProductDate("2026-06-13", format)).toBe("Jun.13th,2026");
    expect(formatProductDate("2026-06-21", format)).toBe("Jun.21st,2026");
    expect(formatProductDate("2026-06-22", format)).toBe("Jun.22nd,2026");
    expect(formatProductDate("2026-06-23", format)).toBe("Jun.23rd,2026");
    expect(formatProductDate("2026-01-31", format)).toBe("Jan.31st,2026");
  });

  it("formats compact DDMMYY and DDMMYYYY dates across Gregorian and Buddhist calendars", () => {
    expect(formatProductDate("2025-06-18", { pattern: "DDMMYY", calendar: "gregorian" })).toBe("180625");
    expect(formatProductDate("2025-06-18", { pattern: "DDMMYYYY", calendar: "gregorian" })).toBe("18062025");
    expect(formatProductDate("2025-01-03", { pattern: "DDMMYY", calendar: "gregorian" })).toBe("030125");
    expect(formatProductDate("2025-01-03", { pattern: "DDMMYYYY", calendar: "gregorian" })).toBe("03012025");
    expect(formatProductDate("2025-06-18", { pattern: "DDMMYY", calendar: "buddhist" })).toBe("180668");
    expect(formatProductDate("2025-06-18", { pattern: "DDMMYYYY", calendar: "buddhist" })).toBe("18062568");
    for (const pattern of ["DDMMYY", "DDMMYYYY"] as const) {
      expect(validatePrintingConfig(config({
        preset: "date_only",
        template: "{MFG_DATE}",
        mfg_format: { pattern, calendar: "gregorian" },
        exp_format: null,
      }))).toEqual({ valid: true });
    }
  });

  it("tokenizes every current Product seed pattern in its exact stored order", () => {
    expect(PRODUCT_DATE_FORMATS).toEqual([
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
      "MMM.Do,YYYY",
    ]);

    for (const pattern of PRODUCT_DATE_FORMATS) {
      expect(tokenizeProductDatePattern(pattern).map((segment) => segment.value).join("")).toBe(pattern);
    }
  });

  it("accepts grammar-valid dynamic patterns outside the current Product choices", () => {
    for (const pattern of ["YY-MM-DD", "D/M/YY", "YYYY,M,D", "YY.MM"]) {
      expect(PRODUCT_DATE_FORMATS).not.toContain(pattern as never);
      expect(tokenizeProductDatePattern(pattern).map((segment) => segment.value).join("")).toBe(pattern);
    }

    expect(validatePrintingConfig(config({
      preset: "date_only",
      template: "{MFG_DATE}",
      mfg_format: { pattern: "YY-MM-DD", calendar: "gregorian" },
      exp_format: null,
    }))).toEqual({ valid: true });
  });

  it("rejects patterns outside the shared DB grammar", () => {
    for (const pattern of [
      "",
      "   ",
      "DD/MM",
      "YYYY",
      "DD//MM/YYYY",
      "DD..MM.YYYY",
      "DD  MM YYYY",
      "DD_MM_YYYY",
      "DD/MM/YYYY<script>",
      "DD/MM/YYYY HH",
      "YYYYMMDDDD",
      "DD/MM/YYYY/",
      "/DD/MM/YYYY",
      "YYYYYYYYMM",
      "DDMMYYYYYYYY",
      "DD/MM/YYYYวัน",
      "DD/'MM'/YYYY",
      "DD\\MM\\YYYY",
    ]) {
      expect(() => tokenizeProductDatePattern(pattern)).toThrow();
    }
  });

  it("renders grammar-valid dynamic Gregorian and Buddhist patterns", () => {
    expect(formatProductDate("2025-06-18", { pattern: "YY-MM-DD", calendar: "gregorian" })).toBe("25-06-18");
    expect(formatProductDate("2025-06-18", { pattern: "D/M/YYYY", calendar: "gregorian" })).toBe("18/6/2025");
    expect(formatProductDate("2025-01-03", { pattern: "D/M/YY", calendar: "gregorian" })).toBe("3/1/25");
    expect(formatProductDate("2025-06-18", { pattern: "YY-MM-DD", calendar: "buddhist" })).toBe("68-06-18");
    expect(formatProductDate("2025-06-18", { pattern: "D/M/YYYY", calendar: "buddhist" })).toBe("18/6/2568");
    expect(formatProductDate("2025-06-18", { pattern: "YY,MMM.D", calendar: "gregorian", monthCase: "upper" })).toBe("25,JUN.18");
    expect(formatProductDate("2025-06-18", { pattern: "YY,MMM.D", calendar: "gregorian", monthCase: "title" })).toBe("25,Jun.18");
    expect(formatProductDate("2026-06-29", { pattern: "MMM.Do,YYYY", calendar: "gregorian", monthCase: "lower" })).toBe("jun.29th,2026");
    expect(formatProductDate("2025-06-18", { pattern: "MMMM YYYY", calendar: "gregorian", monthCase: "upper" })).toBe("JUNE 2025");
    expect(formatProductDate("2025-06-18", { pattern: "MMMM YYYY", calendar: "gregorian", monthCase: "title" })).toBe("June 2025");
    expect(formatProductDate("2025-06-18", { pattern: "MMMM YYYY", calendar: "gregorian", monthCase: "lower" })).toBe("june 2025");
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

  it("renders compact MFG-only formats", () => {
    expect(renderPrintingTemplate({
      config: config({
        preset: "date_only",
        template: "{MFG_DATE}",
        mfg_format: { pattern: "DDMMYY", calendar: "gregorian" },
        exp_format: null,
      }),
      productionDate: "2025-06-18",
      canonicalExpiryDate: "2026-06-18",
    })).toEqual({ status: "ready", text: "180625" });

    expect(renderPrintingTemplate({
      config: config({
        preset: "date_only",
        template: "{MFG_DATE}",
        mfg_format: { pattern: "DDMMYYYY", calendar: "gregorian" },
        exp_format: null,
      }),
      productionDate: "2025-06-18",
      canonicalExpiryDate: "2026-06-18",
    })).toEqual({ status: "ready", text: "18062025" });
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

  it("renders ordinal-day formats through the shared MFG and EXP formatter", () => {
    const ordinalFormat: DateFormatSpec = {
      pattern: "MMM.Do,YYYY",
      calendar: "gregorian",
      monthCase: "title",
    };

    expect(renderPrintingTemplate({
      config: config({
        template: "Mfg.date: {MFG_DATE}\nExp.date: {EXP_DATE}",
        mfg_format: ordinalFormat,
        exp_format: ordinalFormat,
      }),
      productionDate: "2026-06-29",
      canonicalExpiryDate: "2027-06-28",
    })).toEqual({
      status: "ready",
      text: "Mfg.date: Jun.29th,2026\nExp.date: Jun.28th,2027",
    });
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

  it("renders a grammar-valid dynamic historical-style snapshot", () => {
    expect(renderPrintingTemplate({
      config: config({
        preset: "date_only",
        template: "MFG {MFG_DATE}",
        mfg_format: { pattern: "YY-MM-DD", calendar: "gregorian" },
        exp_format: null,
      }),
      productionDate: "2025-06-18",
      canonicalExpiryDate: "2026-06-18",
    })).toEqual({ status: "ready", text: "MFG 25-06-18" });
  });
});
