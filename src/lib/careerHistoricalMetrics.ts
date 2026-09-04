import {
  getBangkokDateParts,
  getBangkokMonthRange,
} from "./statisticsMetrics";
import { sanitizePaperMetricNumber } from "./paperWasteMetrics";
import {
  aggregateCurrentOrdersByDay,
  countDistinctOrderedSku,
  mergeDailyOrderMetrics,
  summarizeCombinedOrderDays,
  type CurrentHistoricalOrder,
  type LegacyDailyMetricRow,
  type LegacyMonthlyMetricRow,
} from "./careerLegacyMetrics";

export type HistoricalCoverage = "full" | "partial" | "none";

export interface HistoricalPaperReportRow {
  created_at: unknown;
  good_a3: unknown;
  waste_a3: unknown;
}

export interface CareerHistoricalMonth {
  year: number;
  month: number;
  key: string;
  isCurrentMonth: boolean;
  isCalendarComplete: boolean;
  isComparableMonth: boolean;
  orderCoverage: HistoricalCoverage;
  paperCoverage: HistoricalCoverage;
  orders: number | null;
  printingQuantity: number | null;
  activeOrderDays: number | null;
  averageOrdersPerActiveDay: number | null;
  orderedSku: number | null;
  paperReportCount: number | null;
  totalPaperUsed: number | null;
  paperWasteA3: number | null;
  wasteIncidents: number | null;
  wasteRate: number | null;
}

export interface CareerHistory {
  requestedMonths: number;
  from: string | null;
  to: string;
  asOf: string;
  coverage: {
    ordersFrom: string | null;
    paperReportsFrom: string | null;
  };
  months: CareerHistoricalMonth[];
}

export interface CareerHistoryInput {
  selectedYear: number;
  selectedMonth: number;
  now: string;
  ordersFrom: string | null;
  paperReportsFrom: string | null;
  orders: readonly CurrentHistoricalOrder[];
  paperReports: readonly HistoricalPaperReportRow[];
  legacyDailyMetrics?: readonly LegacyDailyMetricRow[];
  legacyMonthlyMetrics?: readonly LegacyMonthlyMetricRow[];
  requestedMonths?: number;
}

type BangkokDate = {
  year: number;
  month: number;
  day: number;
  key: string;
  date: string;
};

const DEFAULT_HISTORY_MONTHS = 12;

function monthIndex(year: number, month: number): number {
  return year * 12 + month - 1;
}

function monthFromIndex(index: number) {
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseBangkokDate(value: unknown): BangkokDate | null {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return null;

  const parts = getBangkokDateParts(value);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  return {
    year,
    month,
    day,
    key: monthKey(year, month),
    date: `${year}-${parts.month}-${parts.day}`,
  };
}

function getCoverage(
  bucketIndex: number,
  sourceStart: BangkokDate | null,
  isCalendarComplete: boolean,
): HistoricalCoverage {
  if (!sourceStart) return "none";

  const sourceIndex = monthIndex(sourceStart.year, sourceStart.month);
  if (bucketIndex < sourceIndex) return "none";
  if (!isCalendarComplete) return "partial";
  if (bucketIndex === sourceIndex && sourceStart.day > 1) return "partial";
  return "full";
}

function groupByBangkokMonth<T extends { created_at: unknown }>(
  rows: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  rows.forEach((row) => {
    const date = parseBangkokDate(row.created_at);
    if (!date) return;
    const bucket = grouped.get(date.key) ?? [];
    bucket.push(row);
    grouped.set(date.key, bucket);
  });

  return grouped;
}

function groupLegacyDailyByMonth(
  rows: readonly LegacyDailyMetricRow[],
): Map<string, LegacyDailyMetricRow[]> {
  const grouped = new Map<string, LegacyDailyMetricRow[]>();

  rows.forEach((row) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.business_date)) return;
    const key = row.business_date.slice(0, 7);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  });

  return grouped;
}

export function getCareerHistoryRange(
  selectedYear: number,
  selectedMonth: number,
  requestedMonths = DEFAULT_HISTORY_MONTHS,
) {
  const safeRequestedMonths = Math.max(1, Math.trunc(requestedMonths));
  const selectedIndex = monthIndex(selectedYear, selectedMonth);
  const start = monthFromIndex(selectedIndex - safeRequestedMonths + 1);
  const startRange = getBangkokMonthRange(start.year, start.month - 1);
  const endRange = getBangkokMonthRange(selectedYear, selectedMonth - 1);

  return {
    startIso: startRange.startIso,
    endExclusiveIso: endRange.endExclusiveIso,
  };
}

export function buildCareerHistory({
  selectedYear,
  selectedMonth,
  now,
  ordersFrom,
  paperReportsFrom,
  orders,
  paperReports,
  legacyDailyMetrics = [],
  legacyMonthlyMetrics = [],
  requestedMonths = DEFAULT_HISTORY_MONTHS,
}: CareerHistoryInput): CareerHistory {
  const safeRequestedMonths = Math.max(1, Math.trunc(requestedMonths));
  const selectedIndex = monthIndex(selectedYear, selectedMonth);
  const requestedStartIndex = selectedIndex - safeRequestedMonths + 1;
  const nowDate = parseBangkokDate(now);
  if (!nowDate) throw new Error("A valid current timestamp is required");

  const currentOrderStart = parseBangkokDate(ordersFrom);
  const paperStart = parseBangkokDate(paperReportsFrom);
  const legacyMonthlyByKey = new Map(
    legacyMonthlyMetrics.map((row) => [row.snapshot_month.slice(0, 7), row]),
  );
  const legacyOrderStart = legacyMonthlyMetrics
    .map((row) => parseBangkokDate(`${row.snapshot_month}T00:00:00+07:00`))
    .filter((date): date is BangkokDate => date !== null)
    .sort((first, second) => first.date.localeCompare(second.date))[0] ?? null;
  const effectiveOrderStart =
    !currentOrderStart ||
    (legacyOrderStart && legacyOrderStart.date < currentOrderStart.date)
      ? legacyOrderStart
      : currentOrderStart;
  const sourceStartIndexes = [effectiveOrderStart, paperStart]
    .filter((date): date is BangkokDate => date !== null)
    .map((date) => monthIndex(date.year, date.month));
  const earliestSourceIndex =
    sourceStartIndexes.length > 0 ? Math.min(...sourceStartIndexes) : null;
  const firstIndex =
    earliestSourceIndex === null
      ? null
      : Math.max(requestedStartIndex, earliestSourceIndex);

  const groupedOrders = groupByBangkokMonth(orders);
  const groupedPaperReports = groupByBangkokMonth(paperReports);
  const groupedLegacyDaily = groupLegacyDailyByMonth(legacyDailyMetrics);
  const nowIndex = monthIndex(nowDate.year, nowDate.month);
  const months: CareerHistoricalMonth[] = [];

  if (firstIndex !== null && firstIndex <= selectedIndex) {
    for (let index = firstIndex; index <= selectedIndex; index += 1) {
      const { year, month } = monthFromIndex(index);
      const key = monthKey(year, month);
      const isCurrentMonth = index === nowIndex;
      const isCalendarComplete = index < nowIndex;
      const legacyMonthly = legacyMonthlyByKey.get(key);
      const orderCoverage = legacyMonthly
        ? isCalendarComplete
          ? "full"
          : "partial"
        : getCoverage(index, currentOrderStart, isCalendarComplete);
      const paperCoverage = getCoverage(
        index,
        paperStart,
        isCalendarComplete,
      );
      const orderRows = groupedOrders.get(key) ?? [];
      const legacyRows = legacyMonthly
        ? (groupedLegacyDaily.get(key) ?? [])
        : [];
      const paperRows = groupedPaperReports.get(key) ?? [];

      let orderValues: Pick<
        CareerHistoricalMonth,
        | "orders"
        | "printingQuantity"
        | "activeOrderDays"
        | "averageOrdersPerActiveDay"
        | "orderedSku"
      > = {
        orders: null,
        printingQuantity: null,
        activeOrderDays: null,
        averageOrdersPerActiveDay: null,
        orderedSku: null,
      };

      if (orderCoverage !== "none") {
        const combinedDays = mergeDailyOrderMetrics(
          aggregateCurrentOrdersByDay(orderRows),
          legacyRows,
        );
        const metrics = summarizeCombinedOrderDays(combinedDays);
        orderValues = {
          orders: metrics.totalOrders,
          printingQuantity: metrics.printingQuantity,
          activeOrderDays: metrics.activeOrderDays,
          averageOrdersPerActiveDay: metrics.averageOrdersPerActiveDay,
          orderedSku: legacyMonthly
            ? legacyMonthly.ordered_sku_count
            : countDistinctOrderedSku(
                orderRows.map((order) => order.product_id),
              ),
        };
      }

      let paperValues: Pick<
        CareerHistoricalMonth,
        | "paperReportCount"
        | "totalPaperUsed"
        | "paperWasteA3"
        | "wasteIncidents"
        | "wasteRate"
      > = {
        paperReportCount: null,
        totalPaperUsed: null,
        paperWasteA3: null,
        wasteIncidents: null,
        wasteRate: null,
      };

      if (paperCoverage !== "none") {
        paperValues.paperReportCount = paperRows.length;

        if (paperRows.length > 0) {
          let totalPaperUsed = 0;
          let paperWasteA3 = 0;
          let wasteIncidents = 0;

          paperRows.forEach((row) => {
            const goodA3 = sanitizePaperMetricNumber(row.good_a3);
            const wasteA3 = sanitizePaperMetricNumber(row.waste_a3);
            totalPaperUsed += goodA3 + wasteA3;
            paperWasteA3 += wasteA3;
            if (wasteA3 > 0) wasteIncidents += 1;
          });

          paperValues = {
            paperReportCount: paperRows.length,
            totalPaperUsed,
            paperWasteA3,
            wasteIncidents,
            wasteRate:
              totalPaperUsed > 0
                ? (paperWasteA3 / totalPaperUsed) * 100
                : null,
          };
        }
      }

      months.push({
        year,
        month,
        key,
        isCurrentMonth,
        isCalendarComplete,
        isComparableMonth:
          isCalendarComplete &&
          orderCoverage === "full" &&
          paperCoverage === "full",
        orderCoverage,
        paperCoverage,
        ...orderValues,
        ...paperValues,
      });
    }
  }

  return {
    requestedMonths: safeRequestedMonths,
    from: months[0]?.key ?? null,
    to: monthKey(selectedYear, selectedMonth),
    asOf: nowDate.date,
    coverage: {
      ordersFrom: effectiveOrderStart?.date ?? null,
      paperReportsFrom: paperStart?.date ?? null,
    },
    months,
  };
}
