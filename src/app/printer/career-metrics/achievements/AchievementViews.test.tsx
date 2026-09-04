import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Swal from "sweetalert2";
import { CareerNavigation } from "../CareerNavigation";
import { ACHIEVEMENT_METRICS, ACHIEVEMENT_METRIC_KEYS, ACHIEVEMENT_STATUSES, ACHIEVEMENT_STATUS_LABELS, emptyAchievement, type Achievement } from "../../../../lib/careerAchievements";
import { AchievementCard, AchievementDetail, AchievementEmpty, AchievementSummary, MetricTags, StatusBadge, achievementPeriod, confirmAchievementDelete } from "./AchievementViews";
import { ACHIEVEMENT_COPY } from "./copy";

const noop = () => {};
const item: Achievement = { ...emptyAchievement(), id: "id", title: "ติดตามฉลาก", problem: "บริบทจริง", action: "สิ่งที่ฉันทำจริง", result: "ตรวจสอบได้", created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z", metric_keys: ["waste_rate"] };
afterEach(() => vi.restoreAllMocks());
describe("Achievement Thai views", () => {
  it("links overview and achievements internally without a new sidebar entry", () => {
    for (const current of ["overview", "achievements"] as const) {
      const html = renderToStaticMarkup(<CareerNavigation current={current} />);
      expect(html).toContain('aria-label="Career Portfolio"');
      expect(html).toContain('href="/printer/career-metrics"');
      expect(html).toContain('href="/printer/career-metrics/achievements"');
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      expect(html).toContain("ภาพรวม"); expect(html).toContain("บันทึกผลงาน");
    }
  });
  it("renders the empty state and add action", () => {
    const html = renderToStaticMarkup(<AchievementEmpty onAdd={noop} />);
    expect(html).toContain(ACHIEVEMENT_COPY.empty); expect(html).toContain("เพิ่มผลงาน");
  });
  it("maps every controlled status and metric label", () => {
    for (const status of ACHIEVEMENT_STATUSES) expect(renderToStaticMarkup(<StatusBadge status={status} />)).toContain(ACHIEVEMENT_STATUS_LABELS[status]);
    const html = renderToStaticMarkup(<MetricTags keys={ACHIEVEMENT_METRIC_KEYS} />);
    for (const label of Object.values(ACHIEVEMENT_METRICS)) expect(html).toContain(label);
  });
  it("uses server summary counts rather than the current page size", () => {
    const html = renderToStaticMarkup(<AchievementSummary data={{ items: [], page: 2, pageSize: 20, total: 41, summary: { draft: 20, implemented: 11, portfolio_ready: 10 } }} />);
    expect(html).toContain("ผลงานทั้งหมด"); expect(html).toContain(">41<");
  });
  it("renders previews and case-study details without causal claims or raw HTML", () => {
    const card = renderToStaticMarkup(<AchievementCard item={{ ...item, problem_preview: "ปัญหาย่อ", result_preview: "ผลย่อ" }} onDetail={noop} onEdit={noop} />);
    expect(card).toContain("ดูรายละเอียด"); expect(card).toContain("แก้ไข"); expect(card).not.toContain("ลบผลงาน");
    const html = renderToStaticMarkup(<AchievementDetail item={{ ...item, evidence_notes: "<script>secret()</script>" }} onBack={noop} onEdit={noop} onDelete={noop} busy={false} />);
    for (const text of [item.title, item.problem, item.action, item.result, "หลักฐาน", "ข้อความสำหรับพอร์ต", ACHIEVEMENT_COPY.references]) expect(html).toContain(text);
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("ลด Waste Rate");
  });
  it("never interprets missing end month as ongoing", () => {
    expect(achievementPeriod(null, null)).toBe("ไม่ระบุช่วงเวลา");
    expect(achievementPeriod("2026-08", null)).toBe("สิงหาคม 2026 – ไม่ระบุเดือนสิ้นสุด");
    expect(achievementPeriod(null, "2026-09")).toBe("ไม่ระบุเดือนเริ่มต้น – กันยายน 2026");
  });
  it("requires explicit delete confirmation with Cancel focused", async () => {
    const fire = vi.spyOn(Swal, "fire").mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true });
    expect(await confirmAchievementDelete()).toBe(false);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ title: "ลบผลงานนี้?", text: "ข้อมูลผลงานจะถูกลบออกจาก Career Portfolio", showCancelButton: true, focusCancel: true }));
    fire.mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false });
    expect(await confirmAchievementDelete()).toBe(true);
  });
});
