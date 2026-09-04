import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_METRIC_KEYS, ACHIEVEMENT_STATUSES, ACHIEVEMENT_TEXT_LIMITS,
  achievementDatabaseValues, achievementInput, achievementResponse, emptyAchievement,
  isAchievementDirty, isAchievementId, validateAchievement,
} from "./careerAchievements";

const valid = () => ({ ...emptyAchievement(), title: " เรื่องจริง ", problem: "ปัญหา", action: "ฉันลงมือทำ", result: "ผลที่เกิดขึ้น" });
describe("Achievement validation", () => {
  it.each(["title", "problem", "action", "result"])("requires trimmed %s", (field) => {
    expect(validateAchievement({ ...valid(), [field]: " \n\t " })).toMatchObject({ valid: false, errors: { [field]: expect.any(String) } });
    const missing: Record<string, unknown> = valid(); delete missing[field];
    expect(validateAchievement(missing).valid).toBe(false);
  });
  it.each(Object.entries(ACHIEVEMENT_TEXT_LIMITS))("enforces %s length", (field, max) => {
    expect(validateAchievement({ ...valid(), [field]: "ก".repeat(max) }).valid).toBe(true);
    expect(validateAchievement({ ...valid(), [field]: "ก".repeat(max + 1) }).valid).toBe(false);
  });
  it("trims boundaries only and converts optional blanks to null", () => {
    expect(validateAchievement({ ...valid(), action: "  บรรทัดแรก\n\n  บรรทัดถัดมา  ", evidence_notes: " \n ", portfolio_summary: "" })).toMatchObject({ valid: true, data: { title: "เรื่องจริง", action: "บรรทัดแรก\n\n  บรรทัดถัดมา", evidence_notes: null, portfolio_summary: null } });
  });
  it("allows factual nonnumeric results and controlled statuses", () => {
    for (const status of ACHIEVEMENT_STATUSES) expect(validateAchievement({ ...valid(), status }).valid).toBe(true);
    expect(validateAchievement({ ...valid(), status: "improved" }).valid).toBe(false);
  });
  it("validates all metric keys, deduplicating in canonical allowlist order", () => {
    expect(validateAchievement({ ...valid(), metric_keys: [...ACHIEVEMENT_METRIC_KEYS].reverse().concat(ACHIEVEMENT_METRIC_KEYS) })).toMatchObject({ valid: true, data: { metric_keys: ACHIEVEMENT_METRIC_KEYS } });
    for (const metric_keys of [["unknown"], ["toString"], [null], "waste_rate"]) {
      expect(validateAchievement({ ...valid(), metric_keys }).valid).toBe(false);
    }
  });
  it.each([null, [], "text", 1])("rejects a non-object request %s", (body) => {
    expect(validateAchievement(body).valid).toBe(false);
  });
  it.each(["created_by", "created_at", "updated_at", "id", "unexpected"])("rejects client field %s", (key) => {
    expect(validateAchievement({ ...valid(), [key]: "SENSITIVE" })).toMatchObject({ valid: false, errors: { form: "พบฟิลด์ที่ไม่อนุญาต" } });
  });
  it.each(["2026-00", "2026-13", "2026-2", "2026-02-01", "0000-01", "2026-01T00:00:00Z", 202609])("rejects invalid month %s", (month) => {
    expect(validateAchievement({ ...valid(), period_start: month }).valid).toBe(false);
  });
  it("accepts optional or equal months and converts only to first-of-month storage", () => {
    const checked = validateAchievement({ ...valid(), period_start: "2026-08", period_end: "2026-08" });
    expect(checked.valid).toBe(true);
    if (!checked.valid) throw new Error("Invalid fixture");
    expect(achievementDatabaseValues(checked.data)).toMatchObject({ period_start: "2026-08-01", period_end: "2026-08-01" });
    expect(validateAchievement({ ...valid(), period_start: null, period_end: "2026-08" }).valid).toBe(true);
  });
  it("validates PATCH against stored bounds and rejects empty patches", () => {
    const existing = { ...valid(), period_start: "2026-08", period_end: "2026-09" };
    expect(validateAchievement({ period_end: "2026-07" }, existing).valid).toBe(false);
    expect(validateAchievement({ period_start: "2026-10" }, existing).valid).toBe(false);
    expect(validateAchievement({ result: "ผลใหม่" }, existing)).toMatchObject({ valid: true, data: { result: "ผลใหม่", action: existing.action } });
    expect(validateAchievement({}, existing).valid).toBe(false);
  });
  it("keeps system columns and copied metrics out of write/response projections", () => {
    const row = { ...valid(), id: "id", created_at: "date", updated_at: "date", created_by: "PRIVATE", metric_values: [999], period_start: "2026-08-01" };
    expect(achievementResponse(row).period_start).toBe("2026-08");
    expect(JSON.stringify(achievementResponse(row))).not.toContain("PRIVATE");
    expect(achievementDatabaseValues(achievementInput(row))).not.toHaveProperty("id");
    expect(achievementResponse(row)).not.toHaveProperty("metric_values");
  });
  it("detects unsaved edits but ignores record metadata", () => {
    expect(isAchievementDirty(valid(), valid())).toBe(false);
    expect(isAchievementDirty(valid(), { ...valid(), problem: "ยังไม่บันทึก" })).toBe(true);
    expect(isAchievementDirty(valid(), { ...valid(), metric_keys: ["waste_rate"] })).toBe(true);
    const record = { ...valid(), id: "id", updated_at: "time" };
    expect(isAchievementDirty(valid(), record)).toBe(false);
  });
  it("accepts only UUID route identifiers", () => {
    expect(isAchievementId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toBe(true);
    for (const id of ["123", "../orders", "", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/extra"]) expect(isAchievementId(id)).toBe(false);
  });
});
