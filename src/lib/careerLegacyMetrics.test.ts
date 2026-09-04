import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  aggregateCurrentOrdersByDay,
  countDistinctOrderedSku,
  mergeDailyOrderMetrics,
  summarizeCombinedOrderDays,
} from "./careerLegacyMetrics";

describe("Career legacy order aggregation", () => {
  it("groups current orders by Bangkok business date", () => {
    expect(
      aggregateCurrentOrdersByDay([
        { created_at: "2026-08-31T16:59:00.000Z", quantity: 10 },
        { created_at: "2026-08-31T17:01:00.000Z", quantity: 20 },
      ]).map((row) => [row.businessDate, row.totalOrders]),
    ).toEqual([
      ["2026-08-31", 1],
      ["2026-09-01", 1],
    ]);
  });

  it("keeps cancelled orders in totals and quantity", () => {
    const [day] = aggregateCurrentOrdersByDay([
      {
        created_at: "2026-08-10T07:00:00.000Z",
        quantity: 100,
        is_cancelled: false,
      },
      {
        created_at: "2026-08-10T08:00:00.000Z",
        quantity: 50,
        is_cancelled: true,
      },
    ]);

    expect(day).toEqual({
      businessDate: "2026-08-10",
      nonCancelledOrders: 1,
      cancelledOrders: 1,
      totalOrders: 2,
      printingQuantity: 150,
    });
  });

  it("merges the August overlap into one active calendar day", () => {
    const merged = mergeDailyOrderMetrics(
      [
        {
          businessDate: "2026-08-10",
          nonCancelledOrders: 3,
          cancelledOrders: 0,
          totalOrders: 3,
          printingQuantity: 300,
        },
      ],
      [
        {
          business_date: "2026-08-10",
          non_cancelled_orders: 2,
          cancelled_orders: 0,
          total_orders: 2,
          printing_quantity: 200,
        },
      ],
    );

    expect(merged).toEqual([
      {
        businessDate: "2026-08-10",
        nonCancelledOrders: 5,
        cancelledOrders: 0,
        totalOrders: 5,
        printingQuantity: 500,
      },
    ]);
    expect(summarizeCombinedOrderDays(merged).activeOrderDays).toBe(1);
  });

  it("uses combined non-cancelled orders for the active-day average", () => {
    expect(
      summarizeCombinedOrderDays([
        {
          businessDate: "2026-08-10",
          nonCancelledOrders: 4,
          cancelledOrders: 1,
          totalOrders: 5,
          printingQuantity: 100,
        },
        {
          businessDate: "2026-08-11",
          nonCancelledOrders: 0,
          cancelledOrders: 1,
          totalOrders: 1,
          printingQuantity: 20,
        },
      ]),
    ).toMatchObject({
      totalOrders: 6,
      activeOrderDays: 1,
      averageOrdersPerActiveDay: 4,
    });
  });

  it("counts a trimmed, case-sensitive Ordered SKU set union", () => {
    expect(
      countDistinctOrderedSku([
        " SKU-1 ",
        "SKU-1",
        "sku-1",
        "SKU-2",
        "",
        null,
      ]),
    ).toBe(3);
  });
});

describe("Career legacy migration security", () => {
  it("grants authenticated users SELECT only behind exact moderator RLS", async () => {
    const migration = await readFile(
      new URL(
        "../../supabase/migrations/20260903000000_add_career_legacy_metrics.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain("USING (public.is_user_moderator())");
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.career_legacy_daily_metrics TO authenticated;",
    );
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.career_legacy_monthly_metrics TO authenticated;",
    );
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE)[^;]*TO authenticated/i,
    );
    expect(migration).not.toMatch(/GRANT[^;]*DELETE[^;]*TO service_role/i);
  });

  it("relies on the existing helper that accepts only the moderator role", async () => {
    const baseline = await readFile(
      new URL(
        "../../supabase/migrations/20260821051320_security_hardening_20260821.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const helper = baseline.match(
      /create or replace function public\.is_user_moderator\(\)[\s\S]*?\$function\$;/i,
    )?.[0];

    expect(helper).toContain("u.role = 'moderator'");
    expect(helper).not.toContain("assistant_moderator");
  });
});
