import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import {
  mergeAugustMetrics,
  parseOrderDate,
  parseStatisticsWorkbookBuffer,
  writeLegacyMetrics,
} from "./import-career-history.mjs";

const MAIN_HEADERS = [
  "ลำดับ",
  "วันที่สั่ง",
  "เวลาสั่ง",
  "ประเภทคำสั่ง",
  "เลขลอต",
  "รหัสสินค้า",
  "จำนวน",
];

async function workbookBuffer({
  mainRows = [],
  cancelledRows = [],
  mainHeaders = MAIN_HEADERS,
  includeCancelledSheet = true,
} = {}) {
  const workbook = new ExcelJS.Workbook();
  const main = workbook.addWorksheet("รายการคำสั่งพิมพ์");
  main.addRow(mainHeaders);
  mainRows.forEach((row) => main.addRow(row));
  if (includeCancelledSheet) {
    const cancelled = workbook.addWorksheet("คำสั่งที่ยกเลิก");
    cancelled.addRow(MAIN_HEADERS);
    cancelledRows.forEach((row) => cancelled.addRow(row));
  }
  return workbook.xlsx.writeBuffer();
}

const order = (
  sequence,
  date = "1/5/2569",
  time = "08:30",
  productId = "SKU-1",
  quantity = 10,
) => [sequence, date, time, "พิมพ์ฉลาก", "LOT-1", productId, quantity];

describe("legacy Statistics workbook parsing", () => {
  it("requires both source worksheets", async () => {
    const buffer = await workbookBuffer({ includeCancelledSheet: false });
    await expect(
      parseStatisticsWorkbookBuffer(buffer, { year: 2026, month: 5 }),
    ).rejects.toThrow("Missing worksheet: คำสั่งที่ยกเลิก");
  });

  it("requires every parser header", async () => {
    const buffer = await workbookBuffer({
      mainHeaders: MAIN_HEADERS.filter((header) => header !== "รหัสสินค้า"),
    });
    await expect(
      parseStatisticsWorkbookBuffer(buffer, { year: 2026, month: 5 }),
    ).rejects.toThrow("รหัสสินค้า");
  });

  it("parses Buddhist Era dates and Thai numerals", () => {
    expect(parseOrderDate("๑๕/๕/๒๕๖๙")).toMatchObject({
      year: 2026,
      month: 5,
      day: 15,
      businessDate: "2026-05-15",
    });
  });

  it("parses Excel date values", () => {
    expect(parseOrderDate(new Date(Date.UTC(2026, 4, 20)))).toMatchObject({
      year: 2026,
      month: 5,
      day: 20,
    });
  });

  it("rejects malformed dates", () => {
    expect(() => parseOrderDate("31/2/2569")).toThrow("Invalid calendar date");
  });

  it("rejects negative quantities", async () => {
    const buffer = await workbookBuffer({ mainRows: [order(1, undefined, undefined, undefined, -1)] });
    await expect(
      parseStatisticsWorkbookBuffer(buffer, { year: 2026, month: 5 }),
    ).rejects.toThrow("จำนวน must be a positive integer");
  });

  it("rejects a cancelled row that cannot be reconciled", async () => {
    const buffer = await workbookBuffer({
      mainRows: [order(1)],
      cancelledRows: [order(1, "1/5/2569", "09:00")],
    });
    await expect(
      parseStatisticsWorkbookBuffer(buffer, { year: 2026, month: 5 }),
    ).rejects.toThrow("could not be reconciled");
  });

  it("uses multiset counts for duplicate cancelled rows", async () => {
    const duplicate = order(1);
    const parsed = await parseStatisticsWorkbookBuffer(
      await workbookBuffer({
        mainRows: [duplicate, order(2)],
        cancelledRows: [duplicate, order(2)],
      }),
      { year: 2026, month: 5 },
    );
    expect(parsed).toMatchObject({ totalOrders: 2, cancelledOrders: 2 });
  });

  it("rejects rows from the wrong month", async () => {
    const buffer = await workbookBuffer({ mainRows: [order(1, "1/6/2569")] });
    await expect(
      parseStatisticsWorkbookBuffer(buffer, { year: 2026, month: 5 }),
    ).rejects.toThrow("row belongs to 2026-06");
  });

  it("classifies reconciled cancellations without adding orders or quantity twice", async () => {
    const parsed = await parseStatisticsWorkbookBuffer(
      await workbookBuffer({
        mainRows: [
          order(1, "1/5/2569", "08:00", " SKU-1 ", 10),
          order(2, "1/5/2569", "09:00", "SKU-1", 20),
          order(3, "2/5/2569", "10:00", "SKU-2", 30),
        ],
        cancelledRows: [order(2, "1/5/2569", "09:00", "SKU-1", 20)],
      }),
      { year: 2026, month: 5 },
    );

    expect(parsed).toMatchObject({
      nonCancelledOrders: 2,
      cancelledOrders: 1,
      totalOrders: 3,
      printingQuantity: 60,
      activeOrderDays: 2,
      orderedSku: 2,
    });
  });
});

describe("August legacy and database merge", () => {
  it("deduplicates the shared active date and unions product identifiers", () => {
    const legacy = {
      dailyMetrics: [
        {
          businessDate: "2026-08-10",
          nonCancelledOrders: 2,
          cancelledOrders: 0,
          totalOrders: 2,
          printingQuantity: 200,
        },
      ],
      productIds: new Set(["SKU-1", "SKU-2"]),
    };
    const merged = mergeAugustMetrics(legacy, [
      {
        created_at: "2026-08-10T07:15:00.000Z",
        quantity: 100,
        is_cancelled: false,
        product_id: "SKU-2",
      },
      {
        created_at: "2026-08-11T07:15:00.000Z",
        quantity: 50,
        is_cancelled: false,
        product_id: "SKU-3",
      },
    ]);

    expect(merged).toEqual({
      totalOrders: 4,
      printingQuantity: 350,
      activeOrderDays: 2,
      orderedSku: 3,
    });
  });
});

describe("import write safety", () => {
  it("performs no database operations in dry-run mode", async () => {
    const from = vi.fn();
    const result = await writeLegacyMetrics({
      mode: "dry-run",
      supabase: { from },
      parsedFiles: [],
      augustMergedOrderedSku: 0,
    });
    expect(result).toEqual({ wrote: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("uses deterministic conflict keys for idempotent upserts", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    await writeLegacyMetrics({
      mode: "execute",
      supabase: { from },
      parsedFiles: [
        {
          key: "may",
          target: { year: 2026, month: 5 },
          hash: "a".repeat(64),
          parsed: {
            orderedSku: 1,
            dailyMetrics: [
              {
                businessDate: "2026-05-01",
                nonCancelledOrders: 1,
                cancelledOrders: 0,
                printingQuantity: 10,
              },
            ],
          },
        },
      ],
      augustMergedOrderedSku: 0,
    });

    expect(upsert).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      { onConflict: "business_date" },
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      { onConflict: "snapshot_month" },
    );
  });
});
