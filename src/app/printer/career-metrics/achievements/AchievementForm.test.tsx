import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Swal from "sweetalert2";
import { emptyAchievement } from "../../../../lib/careerAchievements";
import { AchievementForm, confirmAchievementDiscard } from "./AchievementForm";
import { ACHIEVEMENT_COPY } from "./copy";

const props = { draft: emptyAchievement(), onChange: () => {}, onSave: async () => {}, onCancel: () => {}, editing: false, busy: false };
afterEach(() => vi.restoreAllMocks());
describe("Achievement in-page editor", () => {
  it("renders semantic sections and associated labels without a modal or uploads", () => {
    const html = renderToStaticMarkup(<AchievementForm {...props} />);
    for (const label of ["1. เรื่องที่เกิดขึ้น", "2. สิ่งที่ฉันทำ", "3. ผลลัพธ์", "4. หลักฐาน", "5. สำหรับ Portfolio", "ชื่อผลงาน", "ปัญหา / บริบท", "Metric ที่เกี่ยวข้อง", "สถานะ"]) expect(html).toContain(label);
    expect(html).toContain("<form"); expect(html).toContain('for="achievement-title"');
    expect(html).toContain('id="achievement-title"'); expect(html).toContain('type="month"');
    expect(html).toContain(ACHIEVEMENT_COPY.privacy); expect(html).toContain(ACHIEVEMENT_COPY.references);
    expect(html).not.toContain('role="dialog"'); expect(html).not.toContain('type="file"');
    expect(html).not.toContain('name="created_by"');
  });
  it("prefills edit values and renders accessible validation errors", () => {
    const html = renderToStaticMarkup(<AchievementForm {...props} editing draft={{ ...props.draft, title: "ผลงานเดิม", status: "implemented" }} serverErrors={{ title: "กรุณากรอกข้อมูลนี้", period_end: "เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่มต้น" }} />);
    expect(html).toContain("แก้ไขผลงาน"); expect(html).toContain('value="ผลงานเดิม"');
    expect(html).toContain('value="implemented" selected');
    expect(html).toContain('aria-invalid="true"'); expect(html).toContain('aria-describedby="title-error"');
    expect(html).toContain('role="alert"'); expect(html).toContain("เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่มต้น");
  });
  it("disables editing/submission while saving", () => {
    const html = renderToStaticMarkup(<AchievementForm {...props} busy />);
    expect(html).toContain("<fieldset disabled"); expect(html).toContain('type="submit" disabled');
    expect(html).toContain("กำลังบันทึก…");
  });
  it("preserves unsaved work unless leaving is explicitly confirmed", async () => {
    const fire = vi.spyOn(Swal, "fire").mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true });
    expect(await confirmAchievementDiscard(false)).toBe(true); expect(fire).not.toHaveBeenCalled();
    expect(await confirmAchievementDiscard(true)).toBe(false);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ title: ACHIEVEMENT_COPY.unsavedTitle, focusCancel: true, cancelButtonText: "แก้ไขต่อ" }));
    fire.mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false });
    expect(await confirmAchievementDiscard(true)).toBe(true);
  });
});
