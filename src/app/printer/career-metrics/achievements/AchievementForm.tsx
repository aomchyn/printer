import { useState, type FormEvent } from "react";
import Swal from "sweetalert2";
import {
  ACHIEVEMENT_METRICS, ACHIEVEMENT_METRIC_KEYS, ACHIEVEMENT_STATUS_LABELS,
  ACHIEVEMENT_STATUSES, ACHIEVEMENT_TEXT_LIMITS, validateAchievement,
  type AchievementErrors, type AchievementInput, type AchievementStatus,
} from "../../../../lib/careerAchievements";
import { ACHIEVEMENT_COPY as COPY } from "./copy";
import { buttonClass, panelClass, primaryButtonClass } from "./AchievementViews";

const inputClass = "mt-2 w-full min-w-0 rounded-xl border border-[#D9E1E2] bg-white px-3 py-3 text-base text-[#00263A] focus:border-[#0057B8] focus:outline-2 focus:outline-[#0057B8]/20";
export async function confirmAchievementDiscard(dirty: boolean): Promise<boolean> {
  if (!dirty) return true;
  const result = await Swal.fire({ icon: "warning", title: COPY.unsavedTitle, text: COPY.unsavedText,
    showCancelButton: true, confirmButtonText: "ออกโดยไม่บันทึก", cancelButtonText: "แก้ไขต่อ", focusCancel: true,
  });
  return result.isConfirmed;
}

export function AchievementForm({ draft, onChange, onSave, onCancel, editing, busy, serverErrors = {} }: {
  draft: AchievementInput; onChange: (value: AchievementInput) => void;
  onSave: (value: AchievementInput) => Promise<void>; onCancel: () => void;
  editing: boolean; busy: boolean; serverErrors?: AchievementErrors;
}) {
  const [localErrors, setLocalErrors] = useState<AchievementErrors>({});
  const errors = { ...serverErrors, ...localErrors };
  function update<K extends keyof AchievementInput>(key: K, value: AchievementInput[K]) {
    onChange({ ...draft, [key]: value });
    setLocalErrors((previous) => ({ ...previous, [key]: undefined }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validateAchievement(draft);
    if (!checked.valid) {
      setLocalErrors(checked.errors);
      const field = Object.keys(checked.errors)[0];
      event.currentTarget.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
      return;
    }
    setLocalErrors({});
    await onSave(checked.data);
  }
  function textField(key: keyof typeof ACHIEVEMENT_TEXT_LIMITS, label: string, required = false) {
    const props = {
      id: `achievement-${key}`, name: key, className: inputClass,
      value: draft[key] ?? "", required,
      "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `${key}-error` : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, event.target.value),
    };
    return <div><label htmlFor={props.id} className="text-sm font-bold">{label}{required && " *"}</label>
      {key === "title" ? <input {...props} /> : <textarea {...props} rows={5} />}
      <p className="mt-1 text-xs text-[#5F6B70]">ไม่เกิน {ACHIEVEMENT_TEXT_LIMITS[key].toLocaleString("en-US")} ตัวอักษร</p>
      {errors[key] && <p id={`${key}-error`} role="alert" className="mt-1 text-sm text-[#C8102E]">{errors[key]}</p>}
    </div>;
  }
  return <form onSubmit={submit} noValidate className="space-y-5">
    <h2 tabIndex={-1} data-achievement-focus className="text-xl font-black">{editing ? "แก้ไขผลงาน" : "เพิ่มผลงาน"}</h2>
    <p className="rounded-xl bg-[#FFF8D6] p-4 text-sm leading-relaxed text-[#806A00]">{COPY.privacy}</p>
    {errors.form && <p role="alert" className="text-sm text-[#C8102E]">{errors.form}</p>}
    <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-70">
      <section className={`${panelClass} space-y-5`}><h3 className="font-black">1. เรื่องที่เกิดขึ้น</h3>
        {textField("title", "ชื่อผลงาน", true)}{textField("problem", "ปัญหา / บริบท", true)}
        <fieldset><legend className="text-sm font-bold">ช่วงเวลา (เดือน ค.ศ.)</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {([ ["period_start", "เดือนเริ่มต้น"], ["period_end", "เดือนสิ้นสุด"] ] as const).map(([key, label]) => <div key={key}>
              <label htmlFor={key} className="text-sm">{label}</label><input type="month" min="0001-01" max="9999-12" id={key} name={key} className={inputClass} value={draft[key] ?? ""} onChange={(e) => update(key, e.target.value || null)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} />
              {errors[key] && <p id={`${key}-error`} role="alert" className="text-sm text-[#C8102E]">{errors[key]}</p>}
            </div>)}
          </div><p className="mt-2 text-xs text-[#5F6B70]">ไม่ทราบช่วงเวลาสามารถเว้นว่างได้ เดือนสิ้นสุดที่เว้นว่างหมายถึงยังไม่ระบุ</p>
        </fieldset>
      </section>
      <section className={`${panelClass} space-y-4`}><h3 className="font-black">2. สิ่งที่ฉันทำ</h3><p className="text-sm text-[#5F6B70]">อธิบายส่วนที่คุณรับผิดชอบและลงมือทำด้วยตนเอง</p>{textField("action", "สิ่งที่ฉันทำ", true)}</section>
      <section className={`${panelClass} space-y-4`}><h3 className="font-black">3. ผลลัพธ์</h3><p className="text-sm text-[#5F6B70]">บอกผลที่เกิดขึ้นจริง ไม่จำเป็นต้องมีเปอร์เซ็นต์หรือตัวเลข</p>{textField("result", "ผลลัพธ์", true)}</section>
      <section className={`${panelClass} space-y-5`}><h3 className="font-black">4. หลักฐาน</h3>
        <fieldset aria-describedby="metric-help"><legend className="text-sm font-bold">Metric ที่เกี่ยวข้อง</legend><p id="metric-help" className="my-3 text-xs leading-relaxed text-[#5F6B70]">{COPY.references}</p>
          <div className="grid gap-2 sm:grid-cols-2">{ACHIEVEMENT_METRIC_KEYS.map((key) => <label key={key} className="flex items-start gap-3 rounded-xl bg-[#F5F7F8] p-3 text-sm">
            <input type="checkbox" name="metric_keys" className="mt-1 h-4 w-4 shrink-0 accent-[#0057B8]" checked={draft.metric_keys.includes(key)} onChange={(e) => update("metric_keys", ACHIEVEMENT_METRIC_KEYS.filter((k) => k === key ? e.target.checked : draft.metric_keys.includes(k)))} />{ACHIEVEMENT_METRICS[key]}
          </label>)}</div>
          {errors.metric_keys && <p role="alert" className="text-sm text-[#C8102E]">{errors.metric_keys}</p>}
        </fieldset>
        {textField("evidence_notes", "หลักฐาน")}<p className="text-xs text-[#5F6B70]">บันทึกคำอธิบายหลักฐานที่ปิดข้อมูลลับแล้ว เช่น Git commit หรือผลการทดสอบ ยังไม่รองรับไฟล์แนบ</p>
      </section>
      <section className={`${panelClass} space-y-5`}><h3 className="font-black">5. สำหรับ Portfolio</h3>{textField("portfolio_summary", "ข้อความสำหรับพอร์ต")}
        <div><label htmlFor="achievement-status" className="text-sm font-bold">สถานะ</label><select id="achievement-status" name="status" className={inputClass} value={draft.status} onChange={(e) => update("status", e.target.value as AchievementStatus)} aria-invalid={Boolean(errors.status)}>
          {ACHIEVEMENT_STATUSES.map((status) => <option key={status} value={status}>{ACHIEVEMENT_STATUS_LABELS[status]}</option>)}
        </select>{errors.status && <p role="alert" className="text-sm text-[#C8102E]">{errors.status}</p>}</div>
      </section>
    </fieldset>
    <div className="flex flex-wrap gap-3 pb-6"><button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? "กำลังบันทึก…" : "บันทึกผลงาน"}</button><button type="button" disabled={busy} onClick={onCancel} className={buttonClass}>ยกเลิก</button></div>
  </form>;
}
