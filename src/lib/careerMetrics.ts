import {
  calculateStatisticsMetrics,
  type StatisticsMetricOrder,
} from "./statisticsMetrics";

export interface ProductMasterSku {
  id: string;
}

export function countUniqueProductIds(
  products: readonly ProductMasterSku[],
): number {
  return new Set(products.map((product) => product.id)).size;
}

export function buildCareerMetrics(
  totalSku: number,
  orders: readonly StatisticsMetricOrder[],
) {
  const metrics = calculateStatisticsMetrics(orders);

  return {
    totalSku,
    totalOrders: metrics.totalOrders,
    totalQuantity: metrics.totalQuantity,
    averageOrdersPerDay: metrics.averageOrdersPerDay,
    peakDay: metrics.busiestDay
      ? {
          date: metrics.busiestDay.key,
          displayDate: metrics.busiestDay.date,
          orders: metrics.busiestDay.orders,
        }
      : null,
    peakHour:
      metrics.activeOrderCount > 0
        ? {
            hour: metrics.busiestHour.hour,
            label: metrics.busiestHour.label,
            orders: metrics.busiestHour.orders,
          }
        : null,
    cancelledOrders: metrics.totalCancelled,
    cancellationRate: metrics.cancellationRate,
  };
}

export type CareerMetrics = ReturnType<typeof buildCareerMetrics>;
