"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import {
  achievementInput, emptyAchievement, isAchievementDirty,
  type Achievement, type AchievementErrors, type AchievementInput, type AchievementList,
} from "../../../../lib/careerAchievements";
import { CareerNavigation } from "../CareerNavigation";
import { AchievementForm, confirmAchievementDiscard } from "./AchievementForm";
import { AchievementCard, AchievementDetail, AchievementEmpty, AchievementSummary, buttonClass, primaryButtonClass, confirmAchievementDelete } from "./AchievementViews";
import { ACHIEVEMENT_COPY as COPY } from "./copy";

type Mode = "list" | "detail" | "edit" | "new";
class ApiError extends Error {
  constructor(message: string, public errors?: AchievementErrors) { super(message); }
}

export default function AchievementsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [list, setList] = useState<AchievementList | null>(null);
  const [record, setRecord] = useState<Achievement | null>(null);
  const [mode, setMode] = useState<Mode>("list");
  const [initial, setInitial] = useState(emptyAchievement);
  const [draft, setDraft] = useState(emptyAchievement);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<AchievementErrors>({});
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dirty = (mode === "new" || mode === "edit") && isAchievementDirty(initial, draft);

  const request = useCallback(async (path = "", options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const deny = (unauthenticated: boolean) => {
      setList(null); setRecord(null); setDraft(emptyAchievement()); setInitial(emptyAchievement());
      setMode("list"); setStatus("denied"); setAccessConfirmed(false);
      if (unauthenticated) router.replace("/login");
    };
    if (!session) { deny(true); throw new ApiError("กรุณาเข้าสู่ระบบ"); }
    const response = await fetch(`/api/career-metrics/achievements${path}`, {
      ...options, cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    });
    if (response.status === 401 || response.status === 403) {
      deny(response.status === 401);
      throw new ApiError("ต้องใช้สิทธิ์ Moderator");
    }
    // The API's missing-table 503 is only emitted after exact moderator authorization.
    // Keep the way back to Overview available while deployment is pending.
    if (response.ok || response.status === 503) setAccessConfirmed(true);
    const body = await response.json();
    if (!response.ok) throw new ApiError(body.error ?? "ดำเนินการไม่สำเร็จ", body.errors);
    return body;
  }, [router]);

  const loadList = useCallback(async (page = 1, signal?: AbortSignal) => {
    setBusy(true); setError(null);
    try {
      const body = await request(`?page=${page}`, { signal }) as AchievementList;
      setList(body); setStatus("ready");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof ApiError ? caught.message : "โหลดบันทึกผลงานไม่สำเร็จ กรุณาลองใหม่");
      setStatus((previous) => previous === "denied" ? previous : "error");
    } finally { if (!signal?.aborted) setBusy(false); }
  }, [request]);

  useEffect(() => {
    const controller = new AbortController();
    // Fetching the protected list is intentionally tied to this page's mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList(1, controller.signal);
    return () => controller.abort();
  }, [loadList]);
  useEffect(() => { root.current?.querySelector<HTMLElement>("[data-achievement-focus]")?.focus(); }, [mode]);

  const confirmDiscard = useCallback(() => confirmAchievementDiscard(dirty), [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    let replaying = false;
    let confirming = false;
    const interceptNavigation = (event: MouseEvent) => {
      if (replaying || !(event.target instanceof Element)) return;
      // Cover Career links and existing sidebar navigation without changing the sidebar.
      const target = event.target.closest<HTMLElement>('a[href], nav button');
      if (!target || target.closest(".swal2-container")) return;
      if (target instanceof HTMLAnchorElement && (target.target === "_blank" || event.metaKey || event.ctrlKey)) return;
      event.preventDefault(); event.stopPropagation();
      if (busy || confirming) return;
      confirming = true;
      void confirmDiscard().then((confirmed) => {
        confirming = false;
        if (confirmed) { replaying = true; target.click(); replaying = false; }
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", interceptNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", interceptNavigation, true);
    };
  }, [dirty, busy, confirmDiscard]);

  function beginNew() {
    setInitial(emptyAchievement()); setDraft(emptyAchievement()); setRecord(null);
    setError(null); setErrors({}); setMode("new");
  }
  async function openRecord(id: string, nextMode: "edit" | "detail") {
    if (busy) return;
    setBusy(true); setError(null); setErrors({});
    try {
      const body = await request(`/${id}`) as { achievement: Achievement };
      setRecord(body.achievement);
      setInitial(achievementInput(body.achievement)); setDraft(achievementInput(body.achievement));
      setMode(nextMode);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "โหลดรายละเอียดไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function save(value: AchievementInput) {
    if (busy) return;
    setBusy(true); setError(null); setErrors({});
    try {
      const body = await request(mode === "edit" && record ? `/${record.id}` : "", {
        method: mode === "edit" ? "PATCH" : "POST", body: JSON.stringify(value),
      }) as { achievement: Achievement };
      setRecord(body.achievement); setInitial(achievementInput(body.achievement)); setDraft(achievementInput(body.achievement));
      setMode("detail");
      await loadList(1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      if (caught instanceof ApiError) setErrors(caught.errors ?? {});
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!record || busy) return;
    if (!await confirmAchievementDelete()) return;
    setBusy(true); setError(null);
    try {
      await request(`/${record.id}`, { method: "DELETE" });
      setRecord(null); setMode("list"); await loadList(1);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "ลบผลงานไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  if (status === "denied") return <section className="rounded-3xl bg-white p-8 text-center"><h1 className="text-xl font-black">ต้องใช้สิทธิ์ Moderator</h1><p className="mt-3">บันทึกผลงานเป็นข้อมูลส่วนตัวสำหรับ Moderator เท่านั้น</p></section>;
  return <div ref={root} className="mx-auto w-full max-w-5xl text-[#00263A]">
    {accessConfirmed && <CareerNavigation current="achievements" />}
    <header className="mb-6 rounded-3xl bg-[#00263A] px-5 py-7 text-white sm:px-8">
      <p className="mb-2 text-xs font-bold text-[#6DDAE8]">เฉพาะ Moderator · ข้อมูลส่วนตัว</p>
      <h1 className="text-2xl font-black sm:text-3xl">{COPY.title}</h1><p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#6DDAE8]">{COPY.englishTitle}</p>
      <p className="mt-3 text-sm leading-relaxed text-white/80">{COPY.subtitle}</p>
    </header>
    {error && <div role="alert" className="mb-5 rounded-xl bg-[#FCEAEC] p-4 text-sm text-[#C8102E]">{error}{status === "error" && <button className={`${buttonClass} ml-3`} onClick={() => void loadList()} disabled={busy}>ลองใหม่</button>}</div>}
    {status === "loading" && <p role="status" className="p-8 text-center">กำลังโหลดบันทึกผลงาน…</p>}
    {status === "ready" && <>
      {mode === "list" && list && <>
        <div className="mb-5 flex items-center justify-between gap-3"><h2 data-achievement-focus tabIndex={-1} className="font-black">ผลงานของ Career Portfolio</h2><button type="button" className={primaryButtonClass} onClick={beginNew} disabled={busy}>เพิ่มผลงาน</button></div>
        <AchievementSummary data={list} />
        {list.total === 0 ? <AchievementEmpty onAdd={beginNew} /> : <>
          <div className="grid gap-5 lg:grid-cols-2">{list.items.map((item) => <AchievementCard key={item.id} item={item} onDetail={() => void openRecord(item.id, "detail")} onEdit={() => void openRecord(item.id, "edit")} />)}</div>
          {!list.items.length && <p className="p-5">ไม่มีผลงานในหน้านี้ กรุณากลับไปหน้าก่อนหน้า</p>}
          <div aria-label="หน้ารายการผลงาน" className="my-6 flex flex-wrap items-center justify-center gap-3">
            <button className={buttonClass} disabled={busy || list.page <= 1} onClick={() => void loadList(list.page - 1)}>ก่อนหน้า</button>
            <span className="text-sm">หน้า {list.page} / {Math.max(1, Math.ceil(list.total / list.pageSize))}</span>
            <button className={buttonClass} disabled={busy || list.page * list.pageSize >= list.total} onClick={() => void loadList(list.page + 1)}>ถัดไป</button>
          </div>
        </>}
      </>}
      {(mode === "new" || mode === "edit") && <AchievementForm key={`${mode}-${record?.id ?? "new"}`} draft={draft} editing={mode === "edit"} busy={busy} serverErrors={errors}
        onChange={(value) => { setDraft(value); setErrors({}); }} onSave={save}
        onCancel={() => { void confirmDiscard().then((confirmed) => { if (confirmed) { setDraft(initial); setMode(record ? "detail" : "list"); setError(null); } }); }} />}
      {mode === "detail" && record && <AchievementDetail item={record} busy={busy} onBack={() => setMode("list")} onEdit={() => { setInitial(achievementInput(record)); setDraft(achievementInput(record)); setError(null); setErrors({}); setMode("edit"); }} onDelete={() => void remove()} />}
    </>}
  </div>;
}
