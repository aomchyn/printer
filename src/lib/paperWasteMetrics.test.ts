import { describe, expect, it } from "vitest";
import {
  calculatePaperWasteMetrics,
  normalizePaperWasteCause,
  PAPER_WASTE_CAUSE_LABELS,
  type PaperWasteMetricRow,
} from "./paperWasteMetrics";

function row(
  overrides: Partial<PaperWasteMetricRow> = {},
): PaperWasteMetricRow {
  return {
    created_at: "2026-09-01T02:00:00.000Z",
    good_a3: 90,
    waste_a3: 10,
    waste_a3_remark: "ลองไดคัต",
    paper_type: "130 แกรม",
    ...overrides,
  };
}

describe("normalizePaperWasteCause", () => {
  it.each([
    ["ลองไดคัต", PAPER_WASTE_CAUSE_LABELS.dieCutTest],
    ["สีไม่ตรงตามความต้องการ", PAPER_WASTE_CAUSE_LABELS.colorMismatch],
    ["ไดคัตผิด", PAPER_WASTE_CAUSE_LABELS.incorrectDieCut],
  ])("preserves the allowlisted cause %s", (input, expected) => {
    expect(normalizePaperWasteCause(input)).toBe(expected);
  });

  it("trims and collapses whitespace before allowlist matching", () => {
    expect(normalizePaperWasteCause(" \n  ลองไดคัต \t ")).toBe(
      PAPER_WASTE_CAUSE_LABELS.dieCutTest,
    );
  });

  it.each([null, undefined, "", "   ", "\n\t"])(
    "maps null, empty, and whitespace-only values to unspecified",
    (input) => {
      expect(normalizePaperWasteCause(input)).toBe(
        PAPER_WASTE_CAUSE_LABELS.unspecified,
      );
    },
  );

  it.each(["เครื่องพิมพ์มีปัญหา", "ชื่อลูกค้า ABC", 123])(
    "maps every non-allowlisted value to other without exposing it",
    (input) => {
      expect(normalizePaperWasteCause(input)).toBe(
        PAPER_WASTE_CAUSE_LABELS.other,
      );
    },
  );
});

describe("calculatePaperWasteMetrics", () => {
  const rows = [
    row({ waste_a3: 10, good_a3: 90, waste_a3_remark: "ลองไดคัต" }),
    row({
      created_at: "2026-09-01T18:00:00.000Z",
      waste_a3: 25,
      good_a3: 75,
      waste_a3_remark: "ไดคัตผิด",
      paper_type: "สติกเกอร์ RONDA PG-88G (ไม่เหนียว)",
    }),
    row({
      created_at: "2026-09-02T18:00:00.000Z",
      waste_a3: 20,
      good_a3: 80,
      waste_a3_remark: "ลองไดคัต",
    }),
    row({
      created_at: "2026-09-03T02:00:00.000Z",
      waste_a3: 0,
      good_a3: 50,
      waste_a3_remark: null,
    }),
  ];

  it("calculates total waste using only waste_a3", () => {
    const withUnrelatedPieceWaste = rows.map((item) => ({
      ...item,
      waste_qty: 9_999,
    }));

    expect(calculatePaperWasteMetrics(withUnrelatedPieceWaste).totalWaste).toBe(
      55,
    );
  });

  it("counts only positive waste_a3 rows as waste incidents", () => {
    expect(calculatePaperWasteMetrics(rows).incidentCount).toBe(3);
  });

  it("calculates average waste per incident", () => {
    expect(calculatePaperWasteMetrics(rows).averageWastePerIncident).toBeCloseTo(
      55 / 3,
    );
  });

  it("groups allowlisted reasons and sorts them by waste descending", () => {
    const metrics = calculatePaperWasteMetrics(rows);

    expect(metrics.causes).toEqual([
      { label: "ลองไดคัต", quantity: 30, percentage: (30 / 55) * 100 },
      { label: "ไดคัตผิด", quantity: 25, percentage: (25 / 55) * 100 },
    ]);
  });

  it("returns the highest-quantity cause as the top cause", () => {
    const metrics = calculatePaperWasteMetrics([
      ...rows,
      row({ waste_a3: 1, waste_a3_remark: "สีไม่ตรงตามความต้องการ" }),
    ]);

    expect(metrics.topCause).toMatchObject({
      label: "ลองไดคัต",
      quantity: 30,
    });
  });

  it("calculates cause percentages from total waste_a3", () => {
    expect(calculatePaperWasteMetrics(rows).causes[0].percentage).toBeCloseTo(
      (30 / 55) * 100,
    );
  });

  it("groups waste and percentages by paper_reports.paper_type", () => {
    expect(calculatePaperWasteMetrics(rows).byPaperType).toEqual([
      {
        label: "130 แกรม",
        quantity: 30,
        percentage: (30 / 55) * 100,
      },
      {
        label: "สติกเกอร์ RONDA PG-88G (ไม่เหนียว)",
        quantity: 25,
        percentage: (25 / 55) * 100,
      },
    ]);
  });

  it("groups daily waste by created_at in Asia/Bangkok", () => {
    const metrics = calculatePaperWasteMetrics([
      row({ created_at: "2026-08-31T16:59:00.000Z", waste_a3: 2 }),
      row({ created_at: "2026-08-31T17:01:00.000Z", waste_a3: 3 }),
    ]);

    expect(metrics.dailyTrend).toEqual([
      { date: "2026-08-31", label: "31/08", quantity: 2 },
      { date: "2026-09-01", label: "01/09", quantity: 3 },
    ]);
  });

  it("uses good_a3 plus waste_a3 as the sole waste-rate denominator", () => {
    const metrics = calculatePaperWasteMetrics(rows);

    expect(metrics.totalPaperUsed).toBe(350);
    expect(metrics.wasteRate).toBeCloseTo((55 / 350) * 100);
  });

  it("handles a zero-waste period without fake incidents or percentages", () => {
    const metrics = calculatePaperWasteMetrics([
      row({ good_a3: 100, waste_a3: 0, waste_a3_remark: null }),
    ]);

    expect(metrics).toMatchObject({
      totalWaste: 0,
      incidentCount: 0,
      averageWastePerIncident: null,
      totalPaperUsed: 100,
      wasteRate: 0,
      topCause: null,
      causes: [],
      byPaperType: [{ label: "130 แกรม", quantity: 0, percentage: 0 }],
    });
  });

  it("groups null and empty incident reasons as unspecified", () => {
    const metrics = calculatePaperWasteMetrics([
      row({ waste_a3: 2, waste_a3_remark: null }),
      row({ waste_a3: 3, waste_a3_remark: "   " }),
    ]);

    expect(metrics.causes).toEqual([
      { label: "ไม่ระบุสาเหตุ", quantity: 5, percentage: 100 },
    ]);
  });

  it("sanitizes malformed, negative, and unavailable numeric values", () => {
    const metrics = calculatePaperWasteMetrics([
      row({ good_a3: -5, waste_a3: Number.NaN }),
      row({ good_a3: "invalid", waste_a3: -10 }),
      row({ good_a3: null, waste_a3: "4" }),
      row({ created_at: "not-a-date", good_a3: 6, waste_a3: 1 }),
    ]);

    expect(metrics.totalWaste).toBe(5);
    expect(metrics.totalPaperUsed).toBe(11);
    expect(metrics.incidentCount).toBe(2);
    expect(metrics.dailyTrend).toHaveLength(1);
  });

  it("returns null waste rate when no valid paper-use denominator exists", () => {
    expect(calculatePaperWasteMetrics([]).wasteRate).toBeNull();
  });
});
