import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { getStatisticsOrderNote } from "./statisticsExcel";

describe("getStatisticsOrderNote", () => {
  it("exports a normal note and preserves Thai text", () => {
    expect(getStatisticsOrderNote({ notes: "มีฉลากแล้ว" })).toBe(
      "มีฉลากแล้ว",
    );
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["   \n\t  "],
    ["-"],
  ])("normalizes an absent note (%s) to an empty string", (notes) => {
    expect(getStatisticsOrderNote({ notes })).toBe("");
  });

  it("preserves newlines and special characters inside a note", () => {
    const notes = "บรรทัดแรก\nบรรทัดที่สอง & <พร้อม> #1";

    expect(getStatisticsOrderNote({ notes })).toBe(notes);
  });

  it("round-trips a long Thai note through an xlsx workbook", async () => {
    const notes = `${"ข้อความหมายเหตุภาษาไทย & <พิเศษ> ".repeat(80)}\nบรรทัดสุดท้าย`;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("รายการคำสั่งพิมพ์");
    const cell = worksheet.getCell("A1");
    cell.value = getStatisticsOrderNote({ notes });
    cell.alignment = { wrapText: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const reopenedWorkbook = new ExcelJS.Workbook();
    await reopenedWorkbook.xlsx.load(buffer);
    const reopenedCell = reopenedWorkbook
      .getWorksheet("รายการคำสั่งพิมพ์")
      ?.getCell("A1");

    expect(reopenedCell?.value).toBe(notes);
    expect(reopenedCell?.alignment.wrapText).toBe(true);
  });

  it("keeps each note mapped to its source order", () => {
    const orders = [
      { id: 101, notes: "หมายเหตุออเดอร์แรก" },
      { id: 202, notes: "หมายเหตุออเดอร์ที่สอง" },
    ];

    expect(
      orders.map((order) => ({
        id: order.id,
        note: getStatisticsOrderNote(order),
      })),
    ).toEqual([
      { id: 101, note: "หมายเหตุออเดอร์แรก" },
      { id: 202, note: "หมายเหตุออเดอร์ที่สอง" },
    ]);
  });

  it.each(["=1+1", "+SUM(A1:A2)", "-1+2", "@SUM(A1:A2)"])(
    "writes formula-like note %s as an Excel string cell",
    async (notes) => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("test");
      const cell = worksheet.getCell("A1");

      cell.value = getStatisticsOrderNote({ notes });

      expect(cell.type).toBe(ExcelJS.ValueType.String);
      expect(cell.formula).toBeUndefined();
      expect(cell.value).toBe(notes);

      const buffer = await workbook.xlsx.writeBuffer();
      const reopenedWorkbook = new ExcelJS.Workbook();
      await reopenedWorkbook.xlsx.load(buffer);
      const reopenedCell = reopenedWorkbook.getWorksheet("test")?.getCell("A1");

      expect(reopenedCell?.type).toBe(ExcelJS.ValueType.String);
      expect(reopenedCell?.formula).toBeUndefined();
      expect(reopenedCell?.value).toBe(notes);
    },
  );
});
