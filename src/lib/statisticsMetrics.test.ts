import { describe, expect, it } from "vitest";
import {
  calculateStatisticsMetrics,
  getBangkokMonthRange,
} from "./statisticsMetrics";

describe("calculateStatisticsMetrics", () => {
  const orders = [
    {
      created_at: "2026-08-31T17:30:00.000Z",
      quantity: 100,
      is_cancelled: false,
    },
    {
      created_at: "2026-08-31T18:45:00.000Z",
      quantity: 200,
      is_cancelled: false,
    },
    {
      created_at: "2026-09-01T17:10:00.000Z",
      quantity: 50,
      is_cancelled: true,
    },
    {
      created_at: "2026-09-02T17:15:00.000Z",
      quantity: 25,
      is_cancelled: false,
    },
  ];

  it("calculates total orders and printing quantity using Statistics semantics", () => {
    const metrics = calculateStatisticsMetrics(orders);

    expect(metrics.totalOrders).toBe(4);
    expect(metrics.totalQuantity).toBe(375);
  });

  it("calculates cancelled orders and cancellation rate from all orders", () => {
    const metrics = calculateStatisticsMetrics(orders);

    expect(metrics.totalCancelled).toBe(1);
    expect(metrics.cancellationRate).toBe(25);
  });

  it("calculates active-day average and excludes cancelled orders", () => {
    const metrics = calculateStatisticsMetrics(orders);

    expect(metrics.activeOrderCount).toBe(3);
    expect(metrics.averageOrdersPerDay).toBe(1.5);
  });

  it("finds the peak Bangkok business day", () => {
    const metrics = calculateStatisticsMetrics(orders);

    expect(metrics.busiestDay).toMatchObject({
      key: "2026-09-01",
      orders: 2,
    });
  });

  it("finds the peak Bangkok hour", () => {
    const metrics = calculateStatisticsMetrics(orders);

    expect(metrics.busiestHour).toMatchObject({
      hour: 0,
      label: "00:00",
      orders: 2,
    });
  });

  it("groups a UTC timestamp after midnight in Asia/Bangkok on the next date", () => {
    const metrics = calculateStatisticsMetrics([
      {
        created_at: "2026-08-31T18:00:00.000Z",
        quantity: 1,
        is_cancelled: false,
      },
    ]);

    expect(metrics.dailyOrderData[0].key).toBe("2026-09-01");
    expect(metrics.hourlyOrderData[1].orders).toBe(1);
  });

  it("creates a Bangkok calendar-month range as UTC instants", () => {
    expect(getBangkokMonthRange(2026, 8)).toEqual({
      startIso: "2026-08-31T17:00:00.000Z",
      endExclusiveIso: "2026-09-30T17:00:00.000Z",
    });
  });
});
