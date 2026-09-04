import { getBangkokDateParts } from "./statisticsMetrics";

export const PAPER_WASTE_CAUSE_LABELS = {
  dieCutTest: "ลองไดคัต",
  colorMismatch: "สีไม่ตรงตามความต้องการ",
  incorrectDieCut: "ไดคัตผิด",
  unspecified: "ไม่ระบุสาเหตุ",
  other: "อื่น ๆ",
} as const;

export type PaperWasteCauseLabel =
  (typeof PAPER_WASTE_CAUSE_LABELS)[keyof typeof PAPER_WASTE_CAUSE_LABELS];

export interface PaperWasteMetricRow {
  created_at: unknown;
  good_a3: unknown;
  waste_a3: unknown;
  waste_a3_remark: unknown;
  paper_type: unknown;
}

export interface PaperWasteBreakdownItem {
  label: string;
  quantity: number;
  percentage: number;
}

export interface DailyPaperWasteMetric {
  date: string;
  label: string;
  quantity: number;
}

export interface PaperWasteMetrics {
  reportCount: number;
  totalWaste: number;
  incidentCount: number;
  averageWastePerIncident: number | null;
  totalPaperUsed: number;
  wasteRate: number | null;
  topCause: PaperWasteBreakdownItem | null;
  causes: PaperWasteBreakdownItem[];
  byPaperType: PaperWasteBreakdownItem[];
  dailyTrend: DailyPaperWasteMetric[];
}

const ALLOWED_CAUSES = new Set<string>([
  PAPER_WASTE_CAUSE_LABELS.dieCutTest,
  PAPER_WASTE_CAUSE_LABELS.colorMismatch,
  PAPER_WASTE_CAUSE_LABELS.incorrectDieCut,
]);

export function sanitizePaperMetricNumber(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  if (typeof value === "string" && value.trim() === "") return 0;

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;
}

export function normalizePaperWasteCause(
  value: unknown,
): PaperWasteCauseLabel {
  if (typeof value !== "string") {
    return value == null
      ? PAPER_WASTE_CAUSE_LABELS.unspecified
      : PAPER_WASTE_CAUSE_LABELS.other;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return PAPER_WASTE_CAUSE_LABELS.unspecified;

  return ALLOWED_CAUSES.has(normalized)
    ? (normalized as PaperWasteCauseLabel)
    : PAPER_WASTE_CAUSE_LABELS.other;
}

function normalizePaperType(value: unknown): string {
  if (typeof value !== "string") return "ไม่ระบุ";
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || "ไม่ระบุ";
}

function toSortedBreakdown(
  values: ReadonlyMap<string, number>,
  totalWaste: number,
): PaperWasteBreakdownItem[] {
  return Array.from(values, ([label, quantity]) => ({
    label,
    quantity,
    percentage: totalWaste > 0 ? (quantity / totalWaste) * 100 : 0,
  })).sort(
    (first, second) =>
      second.quantity - first.quantity ||
      first.label.localeCompare(second.label, "th"),
  );
}

export function calculatePaperWasteMetrics(
  rows: readonly PaperWasteMetricRow[],
): PaperWasteMetrics {
  let totalWaste = 0;
  let totalPaperUsed = 0;
  let incidentCount = 0;
  const causes = new Map<string, number>();
  const paperTypes = new Map<string, number>();
  const dailyWaste = new Map<string, number>();

  rows.forEach((row) => {
    const goodA3 = sanitizePaperMetricNumber(row.good_a3);
    const wasteA3 = sanitizePaperMetricNumber(row.waste_a3);
    totalPaperUsed += goodA3 + wasteA3;
    totalWaste += wasteA3;

    const paperType = normalizePaperType(row.paper_type);
    paperTypes.set(paperType, (paperTypes.get(paperType) ?? 0) + wasteA3);

    if (wasteA3 > 0) {
      incidentCount += 1;

      const cause = normalizePaperWasteCause(row.waste_a3_remark);
      causes.set(cause, (causes.get(cause) ?? 0) + wasteA3);
    }

    if (typeof row.created_at !== "string") return;
    const timestamp = new Date(row.created_at);
    if (!Number.isFinite(timestamp.getTime())) return;

    const parts = getBangkokDateParts(row.created_at);
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    dailyWaste.set(date, (dailyWaste.get(date) ?? 0) + wasteA3);
  });

  const causeBreakdown = toSortedBreakdown(causes, totalWaste);
  const paperTypeBreakdown = toSortedBreakdown(paperTypes, totalWaste);
  const dailyTrend = Array.from(dailyWaste, ([date, quantity]) => ({
    date,
    label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
    quantity,
  })).sort((first, second) => first.date.localeCompare(second.date));

  return {
    reportCount: rows.length,
    totalWaste,
    incidentCount,
    averageWastePerIncident:
      incidentCount > 0 ? totalWaste / incidentCount : null,
    totalPaperUsed,
    wasteRate:
      totalPaperUsed > 0 ? (totalWaste / totalPaperUsed) * 100 : null,
    topCause: causeBreakdown[0] ?? null,
    causes: causeBreakdown,
    byPaperType: paperTypeBreakdown,
    dailyTrend,
  };
}
