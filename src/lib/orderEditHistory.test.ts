import { describe, expect, it } from "vitest";
import { isVisibleHistoryEntry, type HistoryEntry } from "./orderEditHistory";

const entry = (
  action: string,
  summary: string,
): HistoryEntry => ({
  id: 1,
  action,
  user_name: "ผู้ทดสอบ",
  summary,
  created_at: "2026-08-26T00:00:00.000Z",
});

describe("Dashboard Order Edit History projection", () => {
  it.each([
    "เพิ่มรูปภาพคำสั่งพิมพ์",
    "ลบรูปภาพคำสั่งพิมพ์",
    "เปลี่ยนรูปภาพคำสั่งพิมพ์",
  ])("excludes image-only operational audit: %s", (summary) => {
    expect(isVisibleHistoryEntry(entry("UPDATE_ORDER_IMAGE", summary))).toBe(false);
  });

  it.each([
    "แก้ไข: จำนวน: 10 ➡️ 20",
    "แก้ไข: LOT: A ➡️ B",
    "แก้ไขคำสั่งพิมพ์",
  ])("keeps real Order metadata edits: %s", (summary) => {
    expect(isVisibleHistoryEntry(entry("UPDATE", summary))).toBe(true);
  });

  it("keeps cancel and restore history unchanged", () => {
    expect(isVisibleHistoryEntry(entry("CANCEL", "ยกเลิกคำสั่งพิมพ์"))).toBe(true);
    expect(
      isVisibleHistoryEntry(entry("RESTORE_FROM_TRASH", "กู้คืนคำสั่งพิมพ์")),
    ).toBe(true);
  });
});
