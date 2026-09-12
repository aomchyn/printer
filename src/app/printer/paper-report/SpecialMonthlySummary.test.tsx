import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0, effects: [] as Array<() => unknown>,
  rpc: vi.fn(), fire: vi.fn(), save: vi.fn(), buildWorkbook: vi.fn(), lock: { current: false },
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useRef: (initial: unknown) => initial === false ? harness.lock : { current: initial },
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial;
      return [harness.states[index], (value: unknown) => { harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value; }];
    }, useEffect: (effect: () => unknown) => { harness.effects.push(effect); },
  };
});
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: harness.rpc } }));
vi.mock("sweetalert2", () => ({ default: { fire: harness.fire } }));
vi.mock("file-saver", () => ({ saveAs: harness.save }));
vi.mock("@/lib/specialMonthlyPaper", async () => import("../../../lib/specialMonthlyPaper"));
vi.mock("@/lib/specialMonthlyPaperExcel", async () => {
  const actual = await import("../../../lib/specialMonthlyPaperExcel");
  return { ...actual, buildSpecialMonthlyPaperWorkbook: harness.buildWorkbook };
});
import Summary from "./SpecialMonthlySummary";
import Details from "./SpecialMonthlyDetails";

function render(allowed = true) {
  harness.cursor = 0; harness.effects = [];
  return Summary({ allowed, revision: 0 });
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function button(label: string) {
  const tree = render();
  const found = elements(tree).find((node) => node.type === "button" && node.props.children === label);
  if (!found) throw new Error("Button missing: " + label);
  return found.props.onClick as () => Promise<void>;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(() => {
  harness.states = ["2026-09", [{ job_type: "note_based", paper_type: "sticky", paper_used_a3: 16 }], false, false, false, 0];
  harness.cursor = 0; harness.effects = []; harness.lock.current = false;
  harness.rpc.mockReset().mockResolvedValue({ data: [{ job_type: "note_based", paper_type: "sticky", paper_used_a3: 16 }], error: null });
  harness.fire.mockReset().mockResolvedValue({ isConfirmed: true }); harness.save.mockReset();
  harness.buildWorkbook.mockReset().mockReturnValue({ xlsx: { writeBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1)) } });
});

describe("monthly summary integration", () => {
  it("uses the parent's weekly gate for all visible monthly controls", () => {
    expect(render(false)).toBeNull();
    const html = renderToStaticMarkup(render()!);
    expect(html).toContain("ส่งออก Excel"); expect(html).toContain("ล้างข้อมูลเดือนนี้");
    expect(html).toContain("งานจากหมายเหตุ"); expect(html).toContain("กันยายน 2026");
    for (const text of ["Waste", "A3 เสีย", "Good", "Product ID", "ชิ้น", "<canvas", "<svg"]) expect(html).not.toContain(text);
  });
  it("opens protected contributor detail without a destructive aggregate action", () => {
    const tree = render();
    const opener = elements(tree).find((node) => node.type === "button" && node.props.children === "ดูรายการ")!;
    expect(opener.props["aria-expanded"]).toBe(false);
    (opener.props.onClick as (event: unknown) => void)({ currentTarget: { focus: vi.fn() } });
    const opened = elements(render()).find((node) => node.type === Details)!;
    expect(opened.props.month).toBe("2026-09");
    expect(opened.props.group).toEqual({ job_type: "note_based", paper_type: "sticky", paper_used_a3: 16 });
    expect(elements(tree).some((node) => node.type === "button" && node.props.children === "ลบ")).toBe(false);
  });
  it("loads aggregates for the selected month through the guarded RPC", async () => {
    render(); harness.effects[0](); await flush();
    expect(harness.rpc).toHaveBeenCalledWith("get_special_job_paper_month", { p_month: "2026-09-01" });
  });
  it("does not request monthly data when access is denied", () => {
    render(false); harness.effects[0](); expect(harness.rpc).not.toHaveBeenCalled();
  });
  it("rechecks backend authorization and selected month when exporting", async () => {
    await button("ส่งออก Excel")();
    expect(harness.rpc).toHaveBeenCalledWith("get_special_job_paper_month", { p_month: "2026-09-01" });
    expect(harness.buildWorkbook).toHaveBeenCalledWith("2026-09", [{ job_type: "note_based", paper_type: "sticky", paper_used_a3: 16 }]);
    expect(harness.save).toHaveBeenCalledWith(expect.any(Blob), "Special_Job_Paper_Report_2026-09.xlsx");
  });
  it("shows no-data feedback and does not build or save an empty export", async () => {
    harness.states[1] = [];
    harness.rpc.mockResolvedValue({ data: [], error: null });
    const exportButton = elements(render()).find((node) => node.type === "button" && node.props.children === "ส่งออก Excel")!;
    expect(exportButton.props.disabled).toBe(false);
    await (exportButton.props.onClick as () => Promise<void>)();
    expect(harness.rpc).toHaveBeenCalledExactlyOnceWith("get_special_job_paper_month", { p_month: "2026-09-01" });
    expect(harness.fire).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: "ไม่มีข้อมูล" }));
    expect(harness.buildWorkbook).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
  });
  it("does not export previously loaded data when authorization is revoked", async () => {
    harness.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await button("ส่งออก Excel")(); expect(harness.save).not.toHaveBeenCalled();
    expect(harness.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: "error" }));
  });
  it("uses cancel focus and resets only the selected month, refreshing monthly state only", async () => {
    await button("ล้างข้อมูลเดือนนี้")();
    expect(harness.fire).toHaveBeenCalledWith(expect.objectContaining({ focusCancel: true, text: expect.stringContaining("กันยายน 2026") }));
    expect(harness.rpc).toHaveBeenNthCalledWith(1, "get_special_job_paper_month", { p_month: "2026-09-01" });
    expect(harness.rpc).toHaveBeenNthCalledWith(2, "reset_special_job_paper_month", { p_month: "2026-09-01" });
    expect(harness.states[5]).toBe(1);
  });
  it("cancel causes no reset request", async () => {
    harness.fire.mockResolvedValue({ isConfirmed: false });
    await button("ล้างข้อมูลเดือนนี้")();
    expect(harness.rpc).toHaveBeenCalledExactlyOnceWith("get_special_job_paper_month", { p_month: "2026-09-01" });
    expect(harness.rpc.mock.calls.some(([name]) => name === "reset_special_job_paper_month")).toBe(false);
  });
  it("shows no-data feedback and does not confirm or reset an empty month", async () => {
    harness.states[1] = [];
    harness.rpc.mockResolvedValue({ data: [], error: null });
    const resetButton = elements(render()).find((node) => node.type === "button" && node.props.children === "ล้างข้อมูลเดือนนี้")!;
    expect(resetButton.props.disabled).toBe(false);
    await (resetButton.props.onClick as () => Promise<void>)();
    expect(harness.rpc).toHaveBeenCalledExactlyOnceWith("get_special_job_paper_month", { p_month: "2026-09-01" });
    expect(harness.rpc.mock.calls.some(([name]) => name === "reset_special_job_paper_month")).toBe(false);
    expect(harness.fire).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: "ไม่มีข้อมูล" }));
    expect(harness.fire).not.toHaveBeenCalledWith(expect.objectContaining({ title: "ล้างข้อมูลสรุปรายเดือน?" }));
    expect(harness.fire).not.toHaveBeenCalledWith(expect.objectContaining({ title: "ล้างข้อมูลเดือนที่เลือกแล้ว" }));
  });
  it("shows empty state and zero, and keeps read failure distinct", () => {
    harness.states[1] = [];
    expect(renderToStaticMarkup(render()!)).toContain("ไม่มีข้อมูลในเดือนที่เลือก");
    harness.states[3] = true;
    const html = renderToStaticMarkup(render()!);
    expect(html).toContain("โหลดสรุปรายเดือนไม่สำเร็จ"); expect(html).not.toContain("ไม่มีข้อมูลในเดือนที่เลือก");
  });
  it("discards a stale month response after changing selection", async () => {
    let finish!: (value: unknown) => void;
    harness.rpc.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(); const cleanup = harness.effects[0]() as () => void; cleanup();
    harness.states[1] = [];
    finish({ data: [{ job_type: "brochure", paper_type: "old", paper_used_a3: 99 }], error: null });
    await flush(); expect(harness.states[1]).toEqual([]);
  });
});
