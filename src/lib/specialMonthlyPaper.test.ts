import { describe, expect, it } from "vitest";
import { currentBangkokMonth, isProductMonthlyJobType, parseSpecialMonthlyDetails, parseSpecialMonthlyRows, specialMonthlyDate, specialMonthlyLabel, specialMonthlyTotal } from "./specialMonthlyPaper";
import { buildSpecialMonthlyPaperWorkbook, specialMonthlyExcelFilename } from "./specialMonthlyPaperExcel";
import ExcelJS from "exceljs";

const rows = parseSpecialMonthlyRows([
  { job_type: "note_based", paper_type: "sticky", paper_used_a3: "16", product_id: "PRIVATE", product_name_snapshot: "Private Name", notes: "Private Note" },
  { job_type: "business_card", paper_type: "300 แกรม", paper_used_a3: 18 },
  { job_type: "brochure", paper_type: "130 แกรม", paper_used_a3: 24 },
]);

describe("special monthly paper presentation", () => {
  it("uses Bangkok month including both boundary examples", () => {
    expect(currentBangkokMonth(new Date("2026-09-30T16:30:00Z"))).toBe("2026-09");
    expect(currentBangkokMonth(new Date("2026-09-30T17:10:00Z"))).toBe("2026-10");
  });
  it("uses Thai month and Gregorian year", () => {
    expect(specialMonthlyLabel("2026-09")).toBe("กันยายน 2026");
    expect(specialMonthlyDate("2026-09")).toBe("2026-09-01");
  });
  it.each(["2026-00", "2026-13", "2026-9", "", "2026-09-15", "0000-01"])("rejects invalid month %s", (value) => {
    expect(() => specialMonthlyDate(value)).toThrow();
  });
  it("accepts only Product-defined category choices", () => {
    expect(isProductMonthlyJobType("business_card")).toBe(true);
    expect(isProductMonthlyJobType("brochure")).toBe(true);
    for (const value of [null, "", "note_based", "CARD", "other", "Private Product"]) expect(isProductMonthlyJobType(value)).toBe(false);
  });
  it("projects only public columns, sorts consistently and totals correctly", () => {
    expect(rows.map((r) => r.job_type)).toEqual(["brochure", "business_card", "note_based"]);
    expect(Object.keys(rows[2])).toEqual(["job_type", "paper_type", "paper_used_a3"]);
    expect(specialMonthlyTotal(rows)).toBe(58);
    expect(specialMonthlyTotal([])).toBe(0);
  });
  it.each([null, {}, [{ job_type: "arbitrary", paper_type: "paper", paper_used_a3: 2 }], [{ job_type: "brochure", paper_type: "paper", paper_used_a3: -1 }], [{ job_type: "brochure", paper_type: "paper", paper_used_a3: 1.5 }]])("rejects malformed aggregate data", (data) => {
    expect(() => parseSpecialMonthlyRows(data)).toThrow();
  });
});

describe("special monthly Excel", () => {
  it("round-trips selected month, grouped values and total without raw details", async () => {
    const book = buildSpecialMonthlyPaperWorkbook("2026-09", rows);
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(await book.xlsx.writeBuffer());
    const sheet = reopened.worksheets[0];
    expect(sheet.getCell("A1").value).toBe("สรุปรายเดือน — งานคุณมิ้นท์");
    expect(sheet.getCell("A2").value).toBe("กันยายน 2026");
    expect(sheet.getRow(4).values).toEqual([, "ประเภทงาน", "กระดาษที่ใช้", "A3 ใช้ทั้งหมด"]);
    expect(sheet.getRow(5).values).toEqual([, "Brochure", "130 แกรม", 24]);
    expect(sheet.getRow(6).values).toEqual([, "นามบัตร", "300 แกรม", 18]);
    expect(sheet.getRow(7).values).toEqual([, "งานจากหมายเหตุ", "sticky", 16]);
    expect(sheet.getRow(8).values).toEqual([, "รวม", "", 58]);
    expect(sheet.rowCount).toBe(8);
    const values = JSON.stringify(sheet.getSheetValues());
    for (const forbidden of ["PRIVATE", "Private Name", "Private Note", "product_id", "source_paper_report_id", "LOT", "Waste", "พนักงาน"]) expect(values).not.toContain(forbidden);
    expect(specialMonthlyExcelFilename("2026-09")).toBe("Special_Job_Paper_Report_2026-09.xlsx");
  });
  it("does not export Product names or IDs supplied by the protected detail view", () => {
    const details = parseSpecialMonthlyDetails([{ job_type: "note_based", paper_type: "sticky", paper_used_a3: 10,
      snapshot_id: "9007199254740993", report_date: "2026-09-11", product_name_snapshot: "DETAIL_ONLY_NAME", notes: "RAW_NOTE" }]);
    expect(details[0].snapshot_id).toBe("9007199254740993");
    expect(details[0]).not.toHaveProperty("notes");
    const values = JSON.stringify(buildSpecialMonthlyPaperWorkbook("2026-09", details).worksheets[0].getSheetValues());
    expect(values).not.toContain("DETAIL_ONLY_NAME"); expect(values).not.toContain("9007199254740993"); expect(values).not.toContain("RAW_NOTE");
  });
  it("exports an empty month with a zero total", () => {
    const sheet = buildSpecialMonthlyPaperWorkbook("2026-10", []).worksheets[0];
    expect(sheet.getCell("A2").value).toBe("ตุลาคม 2026");
    expect(sheet.getRow(5).values).toEqual([, "รวม", "", 0]);
  });
});
