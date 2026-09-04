import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("@supabase/supabase-js");
});

it("serializes only Career Metrics aggregates, never raw source rows or confidential fields", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");

  // Deliberately over-supply source fields so accidental object spreading is caught,
  // even though the real queries select a narrower set of columns.
  const privateFields = {
    product_id: "PRIVATE_PRODUCT_ID",
    product_name: "PRIVATE_PRODUCT_NAME",
    lot: "PRIVATE_LOT",
    employee_name: "PRIVATE_EMPLOYEE",
    created_by: "PRIVATE_CREATOR",
    notes: "PRIVATE_NOTES",
    waste_a3_remark: "PRIVATE_RAW_A3_REMARK",
    waste_qty_remark: "PRIVATE_RAW_QTY_REMARK",
  };
  const order = { ...privateFields, created_at: "2026-09-01T02:00:00Z", quantity: 100, is_cancelled: false };
  const paper = { ...privateFields, created_at: "2026-09-01T03:00:00Z", good_a3: 18, waste_a3: 2, paper_type: "Allowed paper type" };
  const sourceRows: Record<string, unknown> = {
    users: { role: "moderator" },
    orders: [order],
    paper_reports: [paper],
    fgcode: null,
    career_legacy_daily_metrics: [{ business_date: "2026-05-01", non_cancelled_orders: 2, cancelled_orders: 0, total_orders: 2, printing_quantity: 20 }],
    career_legacy_monthly_metrics: [{ snapshot_month: "2026-05-01", ordered_sku_count: 2 }],
  };
  const from = vi.fn((table: string) => {
    if (!(table in sourceRows)) throw new Error(`Unexpected table: ${table}`);
    const result = Promise.resolve({ data: sourceRows[table], count: table === "fgcode" ? 10 : null, error: null });
    const query = {
      select: vi.fn(() => query), eq: vi.fn(() => query),
      gte: vi.fn(() => query), lt: vi.fn(() => query),
      order: vi.fn(() => query), range: vi.fn(() => query),
      limit: vi.fn(() => query), single: vi.fn(() => query),
      then: result.then.bind(result),
    };
    return query;
  });
  const createClient = vi.fn()
    .mockReturnValueOnce({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "moderator-test" } }, error: null }) } })
    .mockReturnValueOnce({ from });
  vi.doMock("@supabase/supabase-js", () => ({ createClient }));

  const [{ NextRequest }, { GET }] = await Promise.all([import("next/server"), import("./route")]);
  const response = await GET(new NextRequest("http://localhost/api/career-metrics?year=2026&month=9", {
    headers: { Authorization: "Bearer test-token" },
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const serialized = await response.text();
  const body = JSON.parse(serialized);
  expect(body.metrics).toMatchObject({ totalSku: 10, totalOrders: 1, totalQuantity: 100 });
  expect(body.paperWaste).toMatchObject({ reportCount: 1, totalWaste: 2, wasteRate: 10, causes: [{ label: "อื่น ๆ", quantity: 2, percentage: 100 }] });
  expect(body.history.months.at(-1)).toMatchObject({ orderedSku: 1, orders: 1, paperWasteA3: 2 });
  for (const [key, value] of Object.entries(privateFields)) {
    expect(serialized).not.toContain(`"${key}"`);
    expect(serialized).not.toContain(value);
  }
  for (const key of ["productIds", "product_ids", "legacyProductIds", "rawOrders", "paperReports", "paper_reports", "historicalOrders", "historicalPaperRows"]) {
    expect(serialized).not.toContain(`"${key}"`);
  }
  expect(serialized).not.toContain(JSON.stringify(order));
  expect(serialized).not.toContain(JSON.stringify(paper));
});
