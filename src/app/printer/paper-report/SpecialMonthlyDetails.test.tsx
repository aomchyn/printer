import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0, effects: [] as Array<() => unknown>,
  rpc: vi.fn(), fire: vi.fn(), lock: { current: false },
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
vi.mock("@/lib/specialMonthlyPaper", async () => import("../../../lib/specialMonthlyPaper"));
import Details from "./SpecialMonthlyDetails";
const row = { snapshot_id: "123", report_date: "2026-09-11", product_name_snapshot: "Snapshot Product <example>", job_type: "note_based", paper_type: "sticky", paper_used_a3: 10 };
const changed = vi.fn(); const close = vi.fn();
function render() {
  harness.cursor = 0; harness.effects = [];
  return Details({ month: "2026-09", group: { job_type: "note_based", paper_type: "sticky", paper_used_a3: 16 }, revision: 0, onChanged: changed, onClose: close });
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function remove() {
  return (elements(render()).find((node) => node.type === "button" && node.props.children === "ลบ")!.props.onClick as () => Promise<void>)();
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(() => {
  harness.states = [[row], false, false, false, 0]; harness.lock.current = false;
  harness.rpc.mockReset().mockResolvedValue({ data: [row], error: null });
  harness.fire.mockReset().mockResolvedValue({ isConfirmed: true }); changed.mockReset(); close.mockReset();
});
describe("protected monthly contributor detail", () => {
  it("shows snapshot name, date, paper, A3 and classification, with no sensitive fields", () => {
    harness.states[0] = [{ ...row, notes: "RAW_NOTE", source_paper_report_id: "SOURCE_SECRET", lot_number: "LOT_SECRET", employee: "EMPLOYEE_SECRET" }];
    const html = renderToStaticMarkup(render());
    for (const text of ["Snapshot Product &lt;example&gt;", "11/09/2026", "sticky", "10", "งานจากหมายเหตุ", "ปิดรายการ"]) expect(html).toContain(text);
    for (const text of ["RAW_NOTE", "SOURCE_SECRET", "LOT_SECRET", "EMPLOYEE_SECRET", ">123<"]) expect(html).not.toContain(text);
  });
  it("reads only guarded snapshot details with exact month/group parameters", async () => {
    render(); harness.effects[1](); await flush();
    expect(harness.rpc).toHaveBeenCalledExactlyOnceWith("get_special_job_paper_details", { p_month: "2026-09-01", p_job_type: "note_based", p_paper_type: "sticky", p_after_id: "0" });
  });
  it("deletes one snapshot by internal ID and month with safe context and cancel focus", async () => {
    await remove();
    expect(harness.fire).toHaveBeenCalledWith(expect.objectContaining({ focusCancel: true, text: expect.stringContaining("Snapshot Product <example>") }));
    expect(harness.fire.mock.calls[0][0]).not.toHaveProperty("html");
    expect(harness.rpc).toHaveBeenCalledExactlyOnceWith("delete_special_job_paper_snapshot", { p_snapshot_id: "123", p_month: "2026-09-01" });
    expect(changed).toHaveBeenCalledOnce();
  });
  it("Cancel preserves contributor and performs no mutation or refresh", async () => {
    harness.fire.mockResolvedValue({ isConfirmed: false });
    await remove(); expect(harness.rpc).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    expect(harness.states[0]).toEqual([row]);
  });
  it("denied deletion keeps the row and displays an error", async () => {
    harness.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await remove(); expect(changed).not.toHaveBeenCalled(); expect(harness.states[0]).toEqual([row]);
    expect(harness.fire).toHaveBeenLastCalledWith(expect.objectContaining({ icon: "error" }));
  });
  it("handles pagination without losing large IDs", async () => {
    const page = Array.from({ length: 200 }, (_, i) => ({ ...row, snapshot_id: String(BigInt("9007199254740993") + BigInt(i)) }));
    harness.rpc.mockResolvedValueOnce({ data: page, error: null }).mockResolvedValueOnce({ data: [], error: null });
    render(); harness.effects[1](); await flush();
    expect(harness.rpc.mock.calls[1][1].p_after_id).toBe(page[199].snapshot_id);
    expect((harness.states[0] as unknown[]).length).toBe(200);
  });
  it("does not show stale detail response after closing or changing group", async () => {
    let finish!: (value: unknown) => void;
    harness.rpc.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(); const cleanup = harness.effects[1]() as () => void; cleanup();
    harness.states[0] = [];
    finish({ data: [row], error: null }); await flush(); expect(harness.states[0]).toEqual([]);
  });
});
