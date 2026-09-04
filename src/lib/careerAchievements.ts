export const ACHIEVEMENT_STATUSES = ["draft", "implemented", "portfolio_ready"] as const;
export type AchievementStatus = (typeof ACHIEVEMENT_STATUSES)[number];
export const ACHIEVEMENT_STATUS_LABELS: Record<AchievementStatus, string> = {
  draft: "กำลังรวบรวม", implemented: "ใช้งานจริง", portfolio_ready: "พร้อมใช้ในพอร์ต",
};
export const ACHIEVEMENT_METRICS = {
  total_sku: "จำนวน SKU ทั้งหมด",
  ordered_sku: "SKU ที่มีการสั่งงาน",
  total_orders: "คำสั่งทั้งหมด",
  printing_quantity: "จำนวนงานพิมพ์",
  active_order_days: "วันที่มีคำสั่งพิมพ์",
  average_orders_per_active_day: "คำสั่งเฉลี่ยต่อวันที่มีงาน",
  paper_reports: "รายงานการใช้กระดาษ",
  total_paper_used: "กระดาษใช้ทั้งหมด · แผ่น A3",
  paper_waste_a3: "กระดาษเสีย · แผ่น A3",
  waste_incidents: "เหตุการณ์กระดาษเสีย",
  waste_rate: "อัตรากระดาษเสีย",
} as const;
export type AchievementMetricKey = keyof typeof ACHIEVEMENT_METRICS;
export const ACHIEVEMENT_METRIC_KEYS = Object.keys(ACHIEVEMENT_METRICS) as AchievementMetricKey[];
export const ACHIEVEMENT_TEXT_LIMITS = {
  title: 200, problem: 5000, action: 5000, result: 5000,
  evidence_notes: 5000, portfolio_summary: 1000,
} as const;

/** Request/editor periods have month precision; database periods use YYYY-MM-01. */
export interface AchievementInput {
  title: string;
  problem: string;
  action: string;
  result: string;
  status: AchievementStatus;
  period_start: string | null;
  period_end: string | null;
  metric_keys: AchievementMetricKey[];
  evidence_notes: string | null;
  portfolio_summary: string | null;
}
export interface Achievement extends AchievementInput {
  id: string;
  created_at: string;
  updated_at: string;
}
export type AchievementListItem = Pick<Achievement,
  "id" | "title" | "status" | "period_start" | "period_end" | "metric_keys" | "updated_at"
> & { problem_preview: string; result_preview: string };
export interface AchievementList {
  items: AchievementListItem[];
  page: number;
  pageSize: number;
  total: number;
  summary: Record<AchievementStatus, number>;
}
export type AchievementErrors = Partial<Record<keyof AchievementInput | "form", string>>;
export const emptyAchievement = (): AchievementInput => ({
  title: "", problem: "", action: "", result: "", status: "draft",
  period_start: null, period_end: null, metric_keys: [], evidence_notes: null, portfolio_summary: null,
});
export function achievementInput(record: AchievementInput): AchievementInput {
  return {
    title: record.title, problem: record.problem, action: record.action, result: record.result,
    status: record.status, period_start: record.period_start, period_end: record.period_end,
    metric_keys: [...record.metric_keys], evidence_notes: record.evidence_notes,
    portfolio_summary: record.portfolio_summary,
  };
}
export function isAchievementDirty(initial: AchievementInput, draft: AchievementInput): boolean {
  return JSON.stringify(achievementInput(initial)) !== JSON.stringify(achievementInput(draft));
}
export function isAchievementId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function validateAchievement(
  value: unknown,
  existing?: AchievementInput,
): { valid: true; data: AchievementInput } | { valid: false; errors: AchievementErrors } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: { form: "ข้อมูลต้องเป็น JSON object" } };
  }
  const fields = Object.keys(emptyAchievement());
  const supplied = value as Record<string, unknown>;
  if (Object.keys(supplied).some((key) => !fields.includes(key))) {
    // Do not echo unknown field names or values, which may contain private text.
    return { valid: false, errors: { form: "พบฟิลด์ที่ไม่อนุญาต" } };
  }
  if (existing && Object.keys(supplied).length === 0) {
    return { valid: false, errors: { form: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" } };
  }
  const raw: Record<string, unknown> = { ...(existing ? achievementInput(existing) : emptyAchievement()), ...supplied };
  const data = emptyAchievement();
  const errors: AchievementErrors = {};
  for (const [key, max] of Object.entries(ACHIEVEMENT_TEXT_LIMITS)) {
    const field = key as keyof typeof ACHIEVEMENT_TEXT_LIMITS;
    const optional = field === "evidence_notes" || field === "portfolio_summary";
    const input = raw[field];
    if (!(typeof input === "string" || (optional && input === null))) {
      errors[field] = "กรุณาระบุข้อความ";
      continue;
    }
    const clean = typeof input === "string" ? input.trim() : "";
    // Count Unicode code points, matching PostgreSQL char_length.
    if (!optional && clean.length === 0) errors[field] = "กรุณากรอกข้อมูลนี้";
    else if (Array.from(clean).length > max) errors[field] = `ระบุได้ไม่เกิน ${max} ตัวอักษร`;
    if (optional) data[field] = clean || null;
    else data[field] = clean;
  }
  if (!ACHIEVEMENT_STATUSES.includes(raw.status as AchievementStatus)) errors.status = "สถานะไม่ถูกต้อง";
  else data.status = raw.status as AchievementStatus;
  if (!Array.isArray(raw.metric_keys) || raw.metric_keys.some((key) =>
    typeof key !== "string" || !ACHIEVEMENT_METRIC_KEYS.includes(key as AchievementMetricKey))) {
    errors.metric_keys = "Metric ที่เกี่ยวข้องไม่ถูกต้อง";
  } else {
    const selected = new Set(raw.metric_keys);
    data.metric_keys = ACHIEVEMENT_METRIC_KEYS.filter((key) => selected.has(key));
  }
  for (const field of ["period_start", "period_end"] as const) {
    const month = raw[field];
    if (month === null || month === "") data[field] = null;
    else if (typeof month !== "string" || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      errors[field] = "ระบุเดือน ค.ศ. ในรูปแบบ YYYY-MM";
    } else data[field] = month;
  }
  if (data.period_start && data.period_end && data.period_end < data.period_start) {
    errors.period_end = "เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่มต้น";
  }
  return Object.keys(errors).length ? { valid: false, errors } : { valid: true, data };
}

export function achievementDatabaseValues(data: AchievementInput) {
  return {
    ...achievementInput(data),
    period_start: data.period_start ? `${data.period_start}-01` : null,
    period_end: data.period_end ? `${data.period_end}-01` : null,
  };
}

/** Explicit projection keeps creator UUIDs and any future private columns off the client. */
export function achievementResponse(row: Achievement): Achievement {
  return {
    ...achievementInput(row),
    period_start: row.period_start?.slice(0, 7) ?? null,
    period_end: row.period_end?.slice(0, 7) ?? null,
    id: row.id, created_at: row.created_at, updated_at: row.updated_at,
  };
}
