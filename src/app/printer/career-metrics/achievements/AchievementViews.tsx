import {
  ACHIEVEMENT_METRICS, ACHIEVEMENT_STATUS_LABELS, ACHIEVEMENT_STATUSES,
  type Achievement, type AchievementList, type AchievementListItem, type AchievementMetricKey,
  type AchievementStatus,
} from "../../../../lib/careerAchievements";
import { THAI_MONTHS } from "../copy";
import { ACHIEVEMENT_COPY as COPY } from "./copy";
import Swal from "sweetalert2";

export const panelClass = "min-w-0 rounded-3xl border border-[#D9E1E2] bg-white p-5 shadow-sm sm:p-7";
export const buttonClass = "rounded-xl border border-[#D9E1E2] bg-white px-4 py-2.5 text-sm font-bold text-[#00263A] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0057B8]";
export const primaryButtonClass = `${buttonClass} !border-[#0057B8] !bg-[#0057B8] !text-white`;

export async function confirmAchievementDelete(): Promise<boolean> {
  const result = await Swal.fire({ icon: "warning", title: COPY.deleteTitle, text: COPY.deleteText,
    showCancelButton: true, cancelButtonText: "ยกเลิก", confirmButtonText: "ลบผลงาน",
    confirmButtonColor: "#C8102E", focusCancel: true,
  });
  return result.isConfirmed;
}

export function formatAchievementMonth(value: string | null): string {
  if (!value) return "ไม่ระบุ";
  const [year, month] = value.split("-").map(Number);
  return THAI_MONTHS[month - 1] ? `${THAI_MONTHS[month - 1]} ${year}` : "ไม่ระบุ";
}
export function achievementPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "ไม่ระบุช่วงเวลา";
  return `${start ? formatAchievementMonth(start) : "ไม่ระบุเดือนเริ่มต้น"} – ${end ? formatAchievementMonth(end) : "ไม่ระบุเดือนสิ้นสุด"}`;
}
export function StatusBadge({ status }: { status: AchievementStatus }) {
  const tone = { draft: "bg-[#FFF8D6] text-[#806A00]", implemented: "bg-[#EAF3FC] text-[#0057B8]", portfolio_ready: "bg-[#E6F8F4] text-[#008C78]" }[status];
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{ACHIEVEMENT_STATUS_LABELS[status]}</span>;
}
export function MetricTags({ keys }: { keys: AchievementMetricKey[] }) {
  return <ul aria-label="Metric ที่เกี่ยวข้อง" className="flex flex-wrap gap-2">
    {keys.map((key) => <li key={key} className="rounded-lg bg-[#F5F7F8] px-2 py-1 text-xs text-[#5F6B70]">{ACHIEVEMENT_METRICS[key]}</li>)}
  </ul>;
}
export function AchievementSummary({ data }: { data: AchievementList }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
    {[["ผลงานทั้งหมด", data.total], ...ACHIEVEMENT_STATUSES.map((status) => [ACHIEVEMENT_STATUS_LABELS[status], data.summary[status]])].map(([label, count]) =>
      <div key={label} className={panelClass}><p className="text-xs font-bold text-[#5F6B70]">{label}</p><p className="mt-2 text-3xl font-black tabular-nums text-[#00263A]">{Number(count).toLocaleString("en-US")}</p></div>)}
  </div>;
}
export function AchievementEmpty({ onAdd }: { onAdd: () => void }) {
  return <section className={`${panelClass} py-12 text-center`}>
    <h2 className="text-lg font-black">{COPY.empty}</h2><p className="mx-auto my-4 max-w-lg text-sm text-[#5F6B70]">{COPY.emptyHelp}</p>
    <button type="button" onClick={onAdd} className={primaryButtonClass}>เพิ่มผลงาน</button>
  </section>;
}
export function AchievementCard({ item, onDetail, onEdit }: {
  item: AchievementListItem; onDetail: () => void; onEdit: () => void;
}) {
  return <article className={`${panelClass} space-y-4`}>
    <StatusBadge status={item.status} />
    <h2 className="break-words text-lg font-black text-[#00263A]">{item.title}</h2>
    <p className="text-xs text-[#5F6B70]">{achievementPeriod(item.period_start, item.period_end)}</p>
    <p className="break-words text-sm leading-relaxed"><strong>ปัญหา / บริบท: </strong>{item.problem_preview}</p>
    <p className="break-words text-sm leading-relaxed"><strong>ผลลัพธ์: </strong>{item.result_preview}</p>
    <MetricTags keys={item.metric_keys} />
    <p className="text-xs text-[#5F6B70]">อัปเดต {new Date(item.updated_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={onDetail}>ดูรายละเอียด</button><button type="button" className={buttonClass} onClick={onEdit}>แก้ไข</button></div>
  </article>;
}
export function AchievementDetail({ item, onBack, onEdit, onDelete, busy }: {
  item: Achievement; onBack: () => void; onEdit: () => void; onDelete: () => void; busy: boolean;
}) {
  return <article className={`${panelClass} space-y-6`}>
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={onBack}>กลับไปรายการ</button><button type="button" className={primaryButtonClass} onClick={onEdit} disabled={busy}>แก้ไข</button></div>
    <h2 tabIndex={-1} data-achievement-focus className="break-words text-2xl font-black">{item.title}</h2>
    <StatusBadge status={item.status} />
    <p className="text-sm text-[#5F6B70]">{achievementPeriod(item.period_start, item.period_end)}</p>
    {[["ปัญหา / บริบท", item.problem], ["สิ่งที่ฉันทำ", item.action], ["ผลลัพธ์", item.result]].map(([label, value]) =>
      <section key={label}><h3 className="mb-2 font-black">{label}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{value}</p></section>)}
    <section><h3 className="mb-2 font-black">Metric ที่เกี่ยวข้อง</h3><MetricTags keys={item.metric_keys} /><p className="mt-2 text-xs text-[#5F6B70]">{COPY.references}</p></section>
    {[["หลักฐาน", item.evidence_notes], ["ข้อความสำหรับพอร์ต", item.portfolio_summary]].map(([label, value]) =>
      <section key={label}><h3 className="mb-2 font-black">{label}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{value || "ยังไม่ระบุ"}</p></section>)}
    <div className="border-t border-[#D9E1E2] pt-5"><button type="button" onClick={onDelete} disabled={busy} className={`${buttonClass} !text-[#C8102E]`}>ลบผลงาน</button></div>
  </article>;
}
