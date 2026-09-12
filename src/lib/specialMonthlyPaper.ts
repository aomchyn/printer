export const SPECIAL_MONTHLY_JOB_LABELS = {
  business_card: "นามบัตร",
  brochure: "Brochure",
  note_based: "งานจากหมายเหตุ",
} as const;

export type SpecialMonthlyJobType = keyof typeof SPECIAL_MONTHLY_JOB_LABELS;
export type ProductMonthlyJobType = Exclude<SpecialMonthlyJobType, "note_based">;
export interface SpecialMonthlyPaperRow {
  job_type: SpecialMonthlyJobType;
  paper_type: string;
  paper_used_a3: number;
}

export function isProductMonthlyJobType(value: unknown): value is ProductMonthlyJobType {
  return value === "business_card" || value === "brochure";
}

export function currentBangkokMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

export function specialMonthlyDate(month: string): string {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
  return `${month}-01`;
}

export function specialMonthlyLabel(month: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "Asia/Bangkok", month: "long", year: "numeric",
  }).format(new Date(`${specialMonthlyDate(month)}T00:00:00+07:00`));
}

// The RPC aggregates in the database. Accept only the three public output fields.
export function parseSpecialMonthlyRows(data: unknown): SpecialMonthlyPaperRow[] {
  if (!Array.isArray(data)) throw new Error("Invalid monthly response");
  return data.map((row) => {
    const amount = Number(row.paper_used_a3);
    if (!(row.job_type === "note_based" || isProductMonthlyJobType(row.job_type)) ||
        typeof row.paper_type !== "string" || !Number.isSafeInteger(amount) || amount < 0) {
      throw new Error("Invalid monthly row");
    }
    return { job_type: row.job_type as SpecialMonthlyJobType, paper_type: row.paper_type, paper_used_a3: amount };
  }).sort((a, b) => {
    // Match the database's job-type order, then sort paper labels consistently.
    if (a.job_type !== b.job_type) return a.job_type < b.job_type ? -1 : 1;
    return a.paper_type < b.paper_type ? -1 : a.paper_type > b.paper_type ? 1 : 0;
  });
}

export function specialMonthlyTotal(rows: readonly SpecialMonthlyPaperRow[]): number {
  return rows.reduce((sum, row) => sum + row.paper_used_a3, 0);
}

export interface SpecialMonthlyPaperDetail extends SpecialMonthlyPaperRow {
  // Snapshot ID is internal to selection/deletion; never rendered or exported.
  snapshot_id: string;
  report_date: string;
  product_name_snapshot: string | null;
}

export function parseSpecialMonthlyDetails(data: unknown): SpecialMonthlyPaperDetail[] {
  if (!Array.isArray(data)) throw new Error("Invalid monthly detail response");
  return data.map((row) => {
    const [summary] = parseSpecialMonthlyRows([row]);
    if (typeof row.snapshot_id !== "string" || !/^[1-9]\d*$/.test(row.snapshot_id) ||
        typeof row.report_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.report_date) ||
        !(row.product_name_snapshot === null || typeof row.product_name_snapshot === "string")) {
      throw new Error("Invalid monthly detail row");
    }
    return { ...summary, snapshot_id: row.snapshot_id, report_date: row.report_date,
      product_name_snapshot: row.product_name_snapshot };
  });
}

export function specialMonthlyReportDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
