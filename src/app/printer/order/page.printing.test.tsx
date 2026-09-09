import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeProductPrintingConfig, type PrintingConfigV1 } from "../../../lib/productPrinting";
import { buildDateOnlyPrintingConfig } from "../../../lib/printingDateFormatRegistry";

// Keep the real page, selection handlers, validation, and renderer. A small hook
// harness follows the repository's server-rendered component test convention.
const harness = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  mounted: false,
  effects: [] as Array<() => void>,
  products: [] as Array<Record<string, unknown>>,
  from: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const index = harness.cursor++;
      if (!(index in harness.state)) {
        harness.state[index] = typeof initial === "function"
          ? (initial as () => T)()
          : initial;
      }
      return [harness.state[index], (next: T | ((previous: T) => T)) => {
        harness.state[index] = typeof next === "function"
          ? (next as (previous: T) => T)(harness.state[index] as T)
          : next;
      }];
    },
    useEffect: (effect: () => void) => {
      if (!harness.mounted) harness.effects.push(effect);
    },
    useMemo: <T,>(factory: () => T) => factory(),
    useRef: <T,>(current: T) => ({ current }),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: harness.from,
  },
}));

vi.mock("sweetalert2", () => ({
  default: { mixin: () => ({ fire: vi.fn() }) },
}));

// Vitest has no project alias configuration; resolve these to the real modules.
vi.mock("@/lib/productDate", () => import("../../../lib/productDate"));
vi.mock("@/lib/productPrinting", () => import("../../../lib/productPrinting"));

import OrderPage from "./page";

type ElementProps = {
  children?: ReactNode;
  placeholder?: string;
  type?: string;
  tabIndex?: number;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
};

function renderPage() {
  harness.cursor = 0;
  const tree = OrderPage();
  harness.mounted = true;
  for (const effect of harness.effects.splice(0)) effect();
  return tree;
}

function elements(node: ReactNode): ReactElement<ElementProps>[] {
  const result: ReactElement<ElementProps>[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<ElementProps>(child)) return;
    result.push(child, ...elements(child.props.children));
  });
  return result;
}

function findElement(predicate: (element: ReactElement<ElementProps>) => boolean) {
  const element = elements(renderPage()).find(predicate);
  if (!element) throw new Error("Expected Order form element was not rendered");
  return element;
}

function searchProduct(value: string) {
  findElement((element) => element.props.placeholder === "ค้นหาด้วยรหัส หรือชื่อสินค้า...")
    .props.onChange!({ target: { value } });
}

function selectProduct(id: string) {
  searchProduct(id);
  findElement((element) => element.type === "button" && element.key === id).props.onClick!();
}

function panelDescription() {
  const row = elements(renderPage()).find((element) => {
    if (element.type !== "div") return false;
    return Children.toArray(element.props.children).some((child) => (
      isValidElement<ElementProps>(child)
      && child.type === "dt"
      && child.props.children === "รูปแบบการพิมพ์"
    ));
  });
  if (!row) return null;
  const value = elements(row.props.children).find((element) => element.type === "dd");
  return value?.props.children;
}

const dotConfig = buildDateOnlyPrintingConfig({ pattern: "DD.MM.YYYY", calendar: "gregorian" });
const slashConfig = buildDateOnlyPrintingConfig({ pattern: "DD/MM/YYYY", calendar: "gregorian" });
const multiConfig: PrintingConfigV1 = {
  version: 1,
  preset: "mfg_exp_lot",
  template: "MFG {MFG_DATE} / EXP {EXP_DATE} / LOT {LOT}",
  mfg_format: { pattern: "DD/MM/YYYY", calendar: "gregorian" },
  exp_format: { pattern: "MM/YYYY", calendar: "gregorian" },
  exp_offset_days: 0,
};

beforeEach(async () => {
  harness.state = [];
  harness.cursor = 0;
  harness.mounted = false;
  harness.effects = [];
  harness.products = [
    ["DOT", dotConfig],
    ["SLASH", slashConfig],
    ["MULTI", multiConfig],
    ["NONE", null],
    ["EMBEDDED", buildDateOnlyPrintingConfig({ pattern: "YY,MMM.D", calendar: "gregorian" })],
  ].map(([id, printing_config]) => ({ id, name: `Product ${id}`, exp: "12", expiry_offset_days: 0, printing_config }));
  harness.from.mockReset();
  harness.from.mockImplementation((table: string) => {
    if (table !== "fgcode") throw new Error(`Unexpected database query: ${table}`);
    return { select: () => ({ range: async () => ({ data: harness.products, error: null }) }) };
  });
  renderPage();
  await vi.waitFor(() => {
    expect(elements(renderPage()).some((element) => element.props.placeholder === "ค้นหาด้วยรหัส หรือชื่อสินค้า...")).toBe(true);
  });
});

describe("New Order product printing-format panel", () => {
  it("shows the embedded dotted pattern before dates are entered and preserves the rendered preview", () => {
    selectProduct("DOT");
    expect(panelDescription()).toBe("DD.MM.YYYY");
    expect(renderToStaticMarkup(renderPage())).not.toContain("วันที่ผลิตอย่างเดียว");

    findElement((element) => element.type === "input" && element.props.type === "date")
      .props.onChange!({ target: { value: "2026-09-09" } });

    const markup = renderToStaticMarkup(renderPage());
    expect(markup).toContain("รูปแบบที่ต้องพิมพ์");
    expect(markup).toContain(">09.09.2026</p>");
    expect(panelDescription()).toBe("DD.MM.YYYY");
  });

  it("shows another Product's configured pattern", () => {
    selectProduct("SLASH");
    expect(panelDescription()).toBe("DD/MM/YYYY");
  });

  it("uses the established description for multiple dates and LOT", () => {
    selectProduct("MULTI");
    expect(panelDescription()).toBe(describeProductPrintingConfig(multiConfig));
    expect(panelDescription()).toBe("MFG DD/MM/YYYY · EXP MM/YYYY · LOT");
  });

  it("preserves the existing null-config label", () => {
    selectProduct("NONE");
    expect(panelDescription()).toBe("ยังไม่ได้กำหนด");
  });

  it("updates the description when switching selected Products", () => {
    selectProduct("DOT");
    expect(panelDescription()).toBe("DD.MM.YYYY");
    selectProduct("SLASH");
    expect(panelDescription()).toBe("DD/MM/YYYY");
    expect(renderToStaticMarkup(renderPage())).not.toContain("DD.MM.YYYY");
  });

  it.each(["empty search", "clear button"])("removes the previous description when clearing via %s", (method) => {
    selectProduct("DOT");
    if (method === "empty search") searchProduct("");
    else findElement((element) => element.type === "button" && element.props.tabIndex === -1).props.onClick!();
    expect(panelDescription()).toBeNull();
    expect(renderToStaticMarkup(renderPage())).not.toContain("DD.MM.YYYY");
  });

  it("uses a valid embedded pattern without querying an enabled registry row", () => {
    selectProduct("EMBEDDED");
    expect(panelDescription()).toBe("YY,MMM.D");
    expect(harness.from.mock.calls.map(([table]) => table)).toEqual(["fgcode"]);
  });
});
