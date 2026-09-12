import ExcelJS from "exceljs";
import {
  SPECIAL_MONTHLY_JOB_LABELS, specialMonthlyDate, specialMonthlyLabel,
  specialMonthlyTotal, type SpecialMonthlyPaperRow,
} from "./specialMonthlyPaper";

export function buildSpecialMonthlyPaperWorkbook(month: string, rows: readonly SpecialMonthlyPaperRow[]) {
  specialMonthlyDate(month);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("สรุปรายเดือน");
  sheet.columns = [{ width: 26 }, { width: 48 }, { width: 22 }];
  sheet.mergeCells("A1:C1");
  sheet.getCell("A1").value = "สรุปรายเดือน — งานคุณมิ้นท์";
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.mergeCells("A2:C2");
  sheet.getCell("A2").value = specialMonthlyLabel(month);
  sheet.addRow([]);
  sheet.addRow(["ประเภทงาน", "กระดาษที่ใช้", "A3 ใช้ทั้งหมด"]);
  sheet.getRow(4).font = { bold: true };
  for (const row of rows) {
    // Explicit projection: no raw records, identifiers, Product names or notes.
    sheet.addRow([SPECIAL_MONTHLY_JOB_LABELS[row.job_type], row.paper_type, row.paper_used_a3]);
  }
  sheet.addRow(["รวม", "", specialMonthlyTotal(rows)]).font = { bold: true };
  sheet.getColumn(3).numFmt = "#,##0";
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  return workbook;
}

export function specialMonthlyExcelFilename(month: string): string {
  specialMonthlyDate(month);
  return `Special_Job_Paper_Report_${month}.xlsx`;
}
