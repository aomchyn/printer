import { getBangkokDateParts } from "./statisticsMetrics";

export interface LegacyDailyMetricRow {
  business_date: string;
  non_cancelled_orders: number;
  cancelled_orders: number;
  total_orders?: number;
  printing_quantity: number;
}

export interface LegacyMonthlyMetricRow {
  snapshot_month: string;
  ordered_sku_count: number;
}

export interface CurrentHistoricalOrder {
  created_at: string;
  quantity: number | null;
  is_cancelled?: boolean | null;
  product_id?: string | null;
}

export interface CombinedDailyOrderMetric {
  businessDate: string;
  nonCancelledOrders: number;
  cancelledOrders: number;
  totalOrders: number;
  printingQuantity: number;
}

export interface CombinedMonthlyOrderMetric {
  nonCancelledOrders: number;
  cancelledOrders: number;
  totalOrders: number;
  printingQuantity: number;
  activeOrderDays: number;
  averageOrdersPerActiveDay: number | null;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getBangkokBusinessDate(value: string): string | null {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return null;
  const parts = getBangkokDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

export function countDistinctOrderedSku(
  identifiers: readonly (string | null | undefined)[],
): number {
  return new Set(
    identifiers
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  ).size;
}

export function aggregateCurrentOrdersByDay(
  orders: readonly CurrentHistoricalOrder[],
): CombinedDailyOrderMetric[] {
  const daily = new Map<string, CombinedDailyOrderMetric>();

  orders.forEach((order) => {
    const businessDate = getBangkokBusinessDate(order.created_at);
    if (!businessDate) return;
    const existing = daily.get(businessDate) ?? {
      businessDate,
      nonCancelledOrders: 0,
      cancelledOrders: 0,
      totalOrders: 0,
      printingQuantity: 0,
    };

    existing.totalOrders += 1;
    if (order.is_cancelled) existing.cancelledOrders += 1;
    else existing.nonCancelledOrders += 1;
    existing.printingQuantity += order.quantity || 0;
    daily.set(businessDate, existing);
  });

  return Array.from(daily.values()).sort((first, second) =>
    first.businessDate.localeCompare(second.businessDate),
  );
}

export function mergeDailyOrderMetrics(
  current: readonly CombinedDailyOrderMetric[],
  legacy: readonly LegacyDailyMetricRow[],
): CombinedDailyOrderMetric[] {
  const merged = new Map<string, CombinedDailyOrderMetric>();

  const add = (
    businessDate: string,
    nonCancelledOrders: number,
    cancelledOrders: number,
    printingQuantity: number,
  ) => {
    if (!isValidDate(businessDate)) return;
    const existing = merged.get(businessDate) ?? {
      businessDate,
      nonCancelledOrders: 0,
      cancelledOrders: 0,
      totalOrders: 0,
      printingQuantity: 0,
    };
    existing.nonCancelledOrders += safeCount(nonCancelledOrders);
    existing.cancelledOrders += safeCount(cancelledOrders);
    existing.totalOrders =
      existing.nonCancelledOrders + existing.cancelledOrders;
    existing.printingQuantity += safeCount(printingQuantity);
    merged.set(businessDate, existing);
  };

  current.forEach((row) =>
    add(
      row.businessDate,
      row.nonCancelledOrders,
      row.cancelledOrders,
      row.printingQuantity,
    ),
  );
  legacy.forEach((row) =>
    add(
      row.business_date,
      row.non_cancelled_orders,
      row.cancelled_orders,
      row.printing_quantity,
    ),
  );

  return Array.from(merged.values()).sort((first, second) =>
    first.businessDate.localeCompare(second.businessDate),
  );
}

export function summarizeCombinedOrderDays(
  days: readonly CombinedDailyOrderMetric[],
): CombinedMonthlyOrderMetric {
  const totals = days.reduce(
    (result, day) => ({
      nonCancelledOrders:
        result.nonCancelledOrders + day.nonCancelledOrders,
      cancelledOrders: result.cancelledOrders + day.cancelledOrders,
      totalOrders: result.totalOrders + day.totalOrders,
      printingQuantity: result.printingQuantity + day.printingQuantity,
    }),
    {
      nonCancelledOrders: 0,
      cancelledOrders: 0,
      totalOrders: 0,
      printingQuantity: 0,
    },
  );
  const activeOrderDays = days.filter(
    (day) => day.nonCancelledOrders > 0,
  ).length;

  return {
    ...totals,
    activeOrderDays,
    averageOrdersPerActiveDay:
      activeOrderDays > 0
        ? totals.nonCancelledOrders / activeOrderDays
        : null,
  };
}
