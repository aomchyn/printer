import { readFileSync } from "node:fs";
import ts from "typescript";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { calculatePaperWasteMetrics } from "../../../lib/paperWasteMetrics";

// Exercise existing in-page functions without moving/refactoring production logic.
const source = ts.createSourceFile("page.tsx", readFileSync("src/app/printer/paper-report/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function evaluate<T>(name: string, context: Record<string, unknown>): T {
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!expression) throw new Error(`Missing production function ${name}`);
  const js = ts.transpileModule(`const value = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn value;`)(...Object.values(context));
}
const groups = ["CARD", "OTHER"].map((productId, index) => ({
  id: String(index), productId, productName: productId, department: "test", lotName: "lot",
  sheetsNeeded: index === 0 ? 10 : 6, wasteA3: index === 0 ? 2 : 0,
  totalPrinted: index === 0 ? 8 : 6, targetQty: index === 0 ? 8 : 6,
  excessQty: 0, wasteQty: 0, remarks: [],
  entries: [{ id: String(index), product_id: productId, paper_type: "paper", sheets_needed: index === 0 ? 10 : 6, good_a3: index === 0 ? 8 : 6, waste_a3: index === 0 ? 2 : 0, date: "2026-09-11", target_qty: index === 0 ? 8 : 6 }],
}));
function weekly() {
  return evaluate<{ byDept: Record<string, { sheetsUsed: number; sheetsGood: number; sheetsWaste: number }>; byPaperType: Record<string, { sheetsUsed: number; sheetsGood: number; sheetsWaste: number }> }>("weeklySummary", { printOrders: groups, useMemo: (fn: () => unknown) => fn() });
}

describe("existing Paper Reports regression", () => {
  it("weekly totals still include classified and ordinary Products exactly once", () => {
    expect(weekly().byDept.test).toMatchObject({ sheetsUsed: 16, sheetsGood: 14, sheetsWaste: 2 });
    expect(weekly().byPaperType.paper).toEqual({ sheetsUsed: 16, sheetsGood: 14, sheetsWaste: 2 });
    const metrics = calculatePaperWasteMetrics(groups.flatMap((g) => g.entries.map((r) => ({ ...r, created_at: "2026-09-11T00:00:00Z", waste_a3_remark: null }))));
    expect(metrics.totalPaperUsed).toBe(16); expect(metrics.totalWaste).toBe(2);
  });
  it("manual actual consumption still includes extra good sheets and waste once", () => {
    const result = evaluate("manualDeductCalc", { productsList: [{ id: "CARD", qty_per_a3: 1 }], mdProduct: "CARD", mdTargetQty: "8", mdWasteQty: "0", mdWasteA3: "2", mdQty: "8", mdGoodA3: "3", useMemo: (fn: () => unknown) => fn() });
    expect(result).toMatchObject({ goodA3: 11, totalA3: 13 });
  });
  it("weekly reset keeps its existing mutation sequence and carry-forward amount", async () => {
    const writes: Array<{ table: string; operation: string; value?: unknown }> = [];
    const from = vi.fn((table: string) => ({
      select: async () => ({ data: [{ paper_type: "paper", transaction_type: "IN", qty: 100 }, { paper_type: "paper", transaction_type: "OUT", qty: 16 }], error: null }),
      delete: () => ({ neq: async () => { writes.push({ table, operation: "delete" }); return { error: null }; }, gt: async () => { writes.push({ table, operation: "delete" }); return { error: null }; } }),
      insert: async (value: unknown) => { writes.push({ table, operation: "insert", value }); return { error: null }; },
    }));
    const fetchOrders = vi.fn();
    const lock = { current: false };
    const reset = evaluate<() => Promise<void>>("handleResetWeekly", { actionLock: lock, Swal: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }), showLoading: vi.fn() }, supabase: { from }, fetchOrders });
    await reset();
    expect(writes.map(({ table, operation }) => [table, operation])).toEqual([["paper_transactions", "delete"], ["paper_reports", "delete"], ["paper_transactions", "insert"]]);
    expect(writes[2].value).toEqual([expect.objectContaining({ paper_type: "paper", qty: 84, transaction_type: "IN" })]);
    expect(fetchOrders).toHaveBeenCalledOnce(); expect(lock.current).toBe(false);
  });
  it("existing Excel keeps its sheets, detailed rows and original total", async () => {
    const saveAs = vi.fn(); const fire = vi.fn();
    const exportExcel = evaluate<() => Promise<void>>("handleExportExcel", {
      actionLock: { current: false }, setIsExporting: vi.fn(), ExcelJS,
      printOrders: groups, weeklySummary: weekly(),
      supabase: { from: vi.fn(() => ({ select: async () => ({ data: [{ paper_type: "paper", transaction_type: "IN", qty: 100 }] }) })) },
      saveAs, Swal: { fire },
    });
    await exportExcel();
    expect(saveAs).toHaveBeenCalledOnce();
    const [blob, filename] = saveAs.mock.calls[0] as [Blob, string];
    expect(filename).toBe("WorkTracker_2026-09-11_2026-09-11.xlsx");
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await blob.arrayBuffer());
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["สต็อคกระดาษ", "สรุปรายสัปดาห์", "test"]);
    const stock = workbook.worksheets[0]; expect(stock.getCell("C4").value).toBe(16);
    const detail = JSON.stringify(workbook.worksheets[2].getSheetValues());
    expect(detail).toContain("CARD"); expect(detail).toContain("OTHER");
  });
});
