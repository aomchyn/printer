import { describe, expect, it } from "vitest";
import {
  buildCareerHistory,
  getCareerHistoryRange,
  type CareerHistoryInput,
} from "./careerHistoricalMetrics";

const now = "2026-09-03T05:00:00.000Z";

function build(
  overrides: Partial<CareerHistoryInput> = {},
): ReturnType<typeof buildCareerHistory> {
  return buildCareerHistory({
    selectedYear: 2026,
    selectedMonth: 9,
    now,
    ordersFrom: "2026-08-10T07:13:43.505Z",
    paperReportsFrom: "2026-08-31T01:06:39.644Z",
    orders: [],
    paperReports: [],
    ...overrides,
  });
}

describe("Career Historical Metrics range", () => {
  it("creates a 12-month Bangkok range across a year boundary", () => {
    expect(getCareerHistoryRange(2026, 9)).toEqual({
      startIso: "2025-09-30T17:00:00.000Z",
      endExclusiveIso: "2026-09-30T17:00:00.000Z",
    });
  });

  it("groups December and January into separate Bangkok years", () => {
    const history = build({
      selectedYear: 2027,
      selectedMonth: 1,
      now: "2027-01-05T05:00:00.000Z",
      ordersFrom: "2026-12-01T00:00:00.000Z",
      paperReportsFrom: null,
      orders: [
        { created_at: "2026-12-31T16:59:00.000Z", quantity: 10 },
        { created_at: "2026-12-31T17:01:00.000Z", quantity: 20 },
      ],
    });

    expect(history.months.map((month) => [month.key, month.orders])).toEqual([
      ["2026-12", 1],
      ["2027-01", 1],
    ]);
  });
});

describe("Career Historical Metrics calculations", () => {
  it("uses Bangkok month grouping at the UTC boundary", () => {
    const history = build({
      orders: [
        { created_at: "2026-08-31T16:59:00.000Z", quantity: 10 },
        { created_at: "2026-08-31T17:01:00.000Z", quantity: 20 },
      ],
    });

    expect(history.months.map((month) => month.orders)).toEqual([1, 1]);
  });

  it("calculates monthly order totals, quantity, active days, and average", () => {
    const history = build({
      orders: [
        {
          created_at: "2026-08-10T02:00:00.000Z",
          quantity: 100,
          is_cancelled: false,
        },
        {
          created_at: "2026-08-11T02:00:00.000Z",
          quantity: 200,
          is_cancelled: false,
        },
        {
          created_at: "2026-08-11T03:00:00.000Z",
          quantity: 50,
          is_cancelled: true,
        },
      ],
    });
    const august = history.months[0];

    expect(august).toMatchObject({
      orders: 3,
      printingQuantity: 350,
      activeOrderDays: 2,
      averageOrdersPerActiveDay: 1,
      orderedSku: 0,
    });
  });

  it("calculates current Ordered SKU from distinct trimmed product IDs", () => {
    const august = build({
      orders: [
        {
          created_at: "2026-08-10T02:00:00.000Z",
          quantity: 1,
          product_id: " SKU-1 ",
        },
        {
          created_at: "2026-08-11T02:00:00.000Z",
          quantity: 1,
          product_id: "SKU-1",
        },
        {
          created_at: "2026-08-12T02:00:00.000Z",
          quantity: 1,
          product_id: "SKU-2",
        },
      ],
    }).months[0];

    expect(august.orderedSku).toBe(2);
  });

  it("includes cancelled rows in totals but excludes them from active-day averages", () => {
    const august = build({
      orders: [
        {
          created_at: "2026-08-10T02:00:00.000Z",
          quantity: 100,
          is_cancelled: false,
        },
        {
          created_at: "2026-08-10T03:00:00.000Z",
          quantity: 50,
          is_cancelled: true,
        },
        {
          created_at: "2026-08-11T03:00:00.000Z",
          quantity: 25,
          is_cancelled: true,
        },
      ],
    }).months[0];

    expect(august.orders).toBe(3);
    expect(august.printingQuantity).toBe(175);
    expect(august.activeOrderDays).toBe(1);
    expect(august.averageOrdersPerActiveDay).toBe(1);
  });

  it("calculates all monthly Paper Report metrics using A3 values", () => {
    const august = build({
      paperReports: [
        {
          created_at: "2026-08-31T02:00:00.000Z",
          good_a3: 90,
          waste_a3: 10,
        },
        {
          created_at: "2026-08-31T03:00:00.000Z",
          good_a3: 100,
          waste_a3: 0,
        },
      ],
    }).months[0];

    expect(august).toMatchObject({
      paperReportCount: 2,
      totalPaperUsed: 200,
      paperWasteA3: 10,
      wasteIncidents: 1,
      wasteRate: 5,
    });
  });

  it("keeps a real zero-waste month at zero when reports exist", () => {
    const september = build({
      paperReports: [
        {
          created_at: "2026-09-01T02:00:00.000Z",
          good_a3: 100,
          waste_a3: 0,
        },
      ],
    }).months[1];

    expect(september).toMatchObject({
      paperReportCount: 1,
      totalPaperUsed: 100,
      paperWasteA3: 0,
      wasteIncidents: 0,
      wasteRate: 0,
    });
  });

  it("does not turn zero Paper Report rows after coverage into zero waste", () => {
    const october = build({
      selectedYear: 2026,
      selectedMonth: 10,
      now: "2026-11-05T05:00:00.000Z",
    }).months.at(-1);

    expect(october).toMatchObject({
      paperCoverage: "full",
      paperReportCount: 0,
      totalPaperUsed: null,
      paperWasteA3: null,
      wasteIncidents: null,
      wasteRate: null,
    });
  });
});

describe("Career Historical Metrics coverage", () => {
  it("returns only August and September for the inspected live-data boundaries", () => {
    const history = build();

    expect(history.from).toBe("2026-08");
    expect(history.to).toBe("2026-09");
    expect(history.months.map((month) => month.key)).toEqual([
      "2026-08",
      "2026-09",
    ]);
    expect(history.coverage).toEqual({
      ordersFrom: "2026-08-10",
      paperReportsFrom: "2026-08-31",
    });
  });

  it("marks August calendar-complete but partial for both sources", () => {
    expect(build().months[0]).toMatchObject({
      key: "2026-08",
      isCurrentMonth: false,
      isCalendarComplete: true,
      isComparableMonth: false,
      orderCoverage: "partial",
      paperCoverage: "partial",
    });
  });

  it("marks current September as MTD and partial for both sources", () => {
    const september = build().months[1];

    expect(september).toMatchObject({
      key: "2026-09",
      isCurrentMonth: true,
      isCalendarComplete: false,
      isComparableMonth: false,
      orderCoverage: "partial",
      paperCoverage: "partial",
    });
  });

  it("marks a completed later month as full coverage", () => {
    const october = build({
      selectedYear: 2026,
      selectedMonth: 10,
      now: "2026-11-05T05:00:00.000Z",
    }).months.at(-1);

    expect(october).toMatchObject({
      key: "2026-10",
      isCurrentMonth: false,
      isCalendarComplete: true,
      isComparableMonth: true,
      orderCoverage: "full",
      paperCoverage: "full",
    });
  });

  it("keeps pre-order-history month metrics null", () => {
    const august = build({
      ordersFrom: "2026-09-01T00:00:00.000Z",
      paperReportsFrom: "2026-08-01T00:00:00.000Z",
    }).months[0];

    expect(august).toMatchObject({
      orderCoverage: "none",
      orders: null,
      printingQuantity: null,
      activeOrderDays: null,
      averageOrdersPerActiveDay: null,
    });
  });

  it("keeps pre-Paper-Report-history month metrics null", () => {
    const august = build({
      ordersFrom: "2026-08-01T00:00:00.000Z",
      paperReportsFrom: "2026-09-01T00:00:00.000Z",
    }).months[0];

    expect(august).toMatchObject({
      paperCoverage: "none",
      paperReportCount: null,
      totalPaperUsed: null,
      paperWasteA3: null,
      wasteIncidents: null,
      wasteRate: null,
    });
  });

  it("never treats partial coverage as a comparable complete baseline", () => {
    expect(build().months.every((month) => !month.isComparableMonth)).toBe(
      true,
    );
  });

  it("merges validated legacy days with DB days and uses the stored SKU union", () => {
    const history = build({
      orders: [
        {
          created_at: "2026-08-10T07:15:00.000Z",
          quantity: 100,
          product_id: "SKU-DB",
        },
        {
          created_at: "2026-08-11T07:15:00.000Z",
          quantity: 50,
          product_id: "SKU-DB-2",
        },
      ],
      legacyDailyMetrics: [
        {
          business_date: "2026-05-01",
          non_cancelled_orders: 3,
          cancelled_orders: 1,
          total_orders: 4,
          printing_quantity: 400,
        },
        {
          business_date: "2026-08-10",
          non_cancelled_orders: 2,
          cancelled_orders: 0,
          total_orders: 2,
          printing_quantity: 200,
        },
      ],
      legacyMonthlyMetrics: [
        { snapshot_month: "2026-05-01", ordered_sku_count: 205 },
        { snapshot_month: "2026-08-01", ordered_sku_count: 250 },
      ],
    });
    const may = history.months[0];
    const august = history.months.find((month) => month.key === "2026-08");

    expect(history.coverage.ordersFrom).toBe("2026-05-01");
    expect(may).toMatchObject({
      key: "2026-05",
      orderCoverage: "full",
      orders: 4,
      printingQuantity: 400,
      orderedSku: 205,
    });
    expect(august).toMatchObject({
      orderCoverage: "full",
      orders: 4,
      printingQuantity: 350,
      activeOrderDays: 2,
      averageOrdersPerActiveDay: 2,
      orderedSku: 250,
      paperCoverage: "partial",
    });
  });
});
