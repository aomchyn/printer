const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const BANGKOK_UTC_OFFSET_HOURS = 7;

const bangkokDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BANGKOK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export interface StatisticsMetricOrder {
  created_at: string;
  quantity: number | null;
  is_cancelled?: boolean | null;
}

export interface HourlyOrderMetric {
  hour: number;
  label: string;
  orders: number;
  quantity: number;
}

export interface DailyOrderMetric {
  key: string;
  date: string;
  orders: number;
  quantity: number;
  peakHour: string;
  peakOrders: number;
}

export interface PeakDayMetric extends DailyOrderMetric {
  hourlyData: HourlyOrderMetric[];
}

export interface StatisticsMetrics {
  totalOrders: number;
  totalQuantity: number;
  activeOrderCount: number;
  totalCancelled: number;
  cancellationRate: number;
  averageOrdersPerDay: number;
  averageOrdersPerActiveHour: number;
  hourlyOrderData: HourlyOrderMetric[];
  dailyOrderData: DailyOrderMetric[];
  peakDayData: PeakDayMetric[];
  busiestDay?: DailyOrderMetric;
  busiestHour: HourlyOrderMetric;
}

type BangkokDateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
};

export function getBangkokDateParts(value: string): BangkokDateParts {
  const parts = bangkokDateFormatter.formatToParts(new Date(value));
  const mapped = parts.reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});

  return {
    year: mapped.year,
    month: mapped.month,
    day: mapped.day,
    hour: mapped.hour,
  };
}

export function getBangkokMonthRange(year: number, monthIndex: number) {
  const offsetMilliseconds = BANGKOK_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const start = new Date(Date.UTC(year, monthIndex, 1) - offsetMilliseconds);
  const endExclusive = new Date(
    Date.UTC(year, monthIndex + 1, 1) - offsetMilliseconds,
  );

  return {
    startIso: start.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
  };
}

export function getBangkokYearMonth(value: string) {
  const parts = getBangkokDateParts(value);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
  };
}

export function calculateStatisticsMetrics(
  orders: readonly StatisticsMetricOrder[],
): StatisticsMetrics {
  const hourlyOrderData: HourlyOrderMetric[] = Array.from(
    { length: 24 },
    (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      orders: 0,
      quantity: 0,
    }),
  );
  const dailyOrderMap: Record<
    string,
    {
      date: string;
      orders: number;
      quantity: number;
      hours: Record<number, number>;
    }
  > = {};

  const activeOrders = orders.filter((order) => !order.is_cancelled);

  activeOrders.forEach((order) => {
    const parts = getBangkokDateParts(order.created_at);
    const hour = Number(parts.hour);
    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
    const dateLabel = `${parts.day}/${parts.month}/${Number(parts.year) + 543}`;

    hourlyOrderData[hour].orders += 1;
    hourlyOrderData[hour].quantity += order.quantity || 0;

    if (!dailyOrderMap[dateKey]) {
      dailyOrderMap[dateKey] = {
        date: dateLabel,
        orders: 0,
        quantity: 0,
        hours: {},
      };
    }

    dailyOrderMap[dateKey].orders += 1;
    dailyOrderMap[dateKey].quantity += order.quantity || 0;
    dailyOrderMap[dateKey].hours[hour] =
      (dailyOrderMap[dateKey].hours[hour] || 0) + 1;
  });

  const dailyOrderData = Object.entries(dailyOrderMap)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => {
      const peak = Object.entries(value.hours).sort(
        ([, first], [, second]) => second - first,
      )[0];

      return {
        key,
        date: value.date,
        orders: value.orders,
        quantity: value.quantity,
        peakHour: peak ? `${String(peak[0]).padStart(2, "0")}:00` : "-",
        peakOrders: peak?.[1] || 0,
      };
    });

  const peakDayData = dailyOrderData.map((day) => ({
    ...day,
    hourlyData: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      orders: dailyOrderMap[day.key].hours[hour] || 0,
      quantity: 0,
    })),
  }));
  const activeHourCount = hourlyOrderData.filter(
    (item) => item.orders > 0,
  ).length;
  const totalCancelled = orders.filter((order) => order.is_cancelled).length;

  return {
    totalOrders: orders.length,
    totalQuantity: orders.reduce(
      (sum, order) => sum + (order.quantity || 0),
      0,
    ),
    activeOrderCount: activeOrders.length,
    totalCancelled,
    cancellationRate:
      orders.length > 0 ? (totalCancelled / orders.length) * 100 : 0,
    averageOrdersPerDay:
      dailyOrderData.length > 0
        ? activeOrders.length / dailyOrderData.length
        : 0,
    averageOrdersPerActiveHour:
      activeHourCount > 0 ? activeOrders.length / activeHourCount : 0,
    hourlyOrderData,
    dailyOrderData,
    peakDayData,
    busiestDay: [...dailyOrderData].sort(
      (first, second) => second.orders - first.orders,
    )[0],
    busiestHour: [...hourlyOrderData].sort(
      (first, second) => second.orders - first.orders,
    )[0],
  };
}
