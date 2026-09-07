import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dashboardState = vi.hoisted(() => ({
  isPendingFilePanelOpen: false,
  orders: [] as Array<Record<string, unknown>>,
  stateCallIndex: 0,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    default: actual,
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
      callback,
    useEffect: vi.fn(),
    useMemo: <T,>(factory: () => T) => factory(),
    useRef: <T,>(initialValue: T) => ({ current: initialValue }),
    useState: <T,>(initialValue: T) => {
      const stateIndex = dashboardState.stateCallIndex++;
      let value: unknown = initialValue;

      if (stateIndex === 0) value = dashboardState.orders;
      if (stateIndex === 5) value = "moderator";
      if (stateIndex === 11) value = false;
      if (stateIndex === 17) value = dashboardState.isPendingFilePanelOpen;

      return [value, vi.fn()];
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

vi.mock("@/lib/productDate", () => ({
  calculateProductExpiryDate: vi.fn(),
  parseProductShelfLifeMonths: vi.fn(),
}));

vi.mock("@/lib/productPrinting", () => ({
  formatProductDate: (date: string) => date,
  renderPrintingTemplate: () => ({ status: "unavailable" }),
  validatePrintingConfig: () => ({ valid: true }),
}));

vi.mock("sweetalert2", () => ({
  default: {
    mixin: () => ({ fire: vi.fn() }),
  },
}));

vi.mock("../components/EditHistory", () => ({ default: () => null }));
vi.mock("../components/Modal", () => ({ default: () => null }));

import DashboardPage from "./page";

function createOrder(isNoFile: boolean) {
  return {
    id: 1,
    order_date: "2026-09-07",
    order_time: "09:00",
    order_datetime: "2026-09-07T09:00:00.000Z",
    lot_number: "LOT-001",
    product_id: "PRODUCT-001",
    product_name: "Test product",
    product_exp: "12",
    expiry_offset_days_used: 0,
    printing_config_used: null,
    production_date: "2026-09-07",
    expiry_date: "2027-09-07",
    quantity: 100,
    created_by: "Test user",
    is_verified: false,
    is_printed: false,
    is_cancelled: false,
    is_no_file: isNoFile,
    created_at: "2026-09-07T09:00:00.000Z",
    updated_at: "2026-09-07T09:00:00.000Z",
  };
}

function renderDashboard() {
  dashboardState.stateCallIndex = 0;
  return renderToStaticMarkup(<DashboardPage />);
}

describe("Dashboard pending-file section visibility", () => {
  beforeEach(() => {
    dashboardState.isPendingFilePanelOpen = false;
    dashboardState.orders = [];
  });

  it("does not render the section when there are no pending no-file orders", () => {
    dashboardState.orders = [createOrder(false)];

    const html = renderDashboard();

    expect(html).not.toContain("คำสั่งรอไฟล์");
    expect(html).not.toContain("0 คำสั่ง");
    expect(html).toContain("LOT-001");
  });

  it("renders the existing section and count when a pending no-file order exists", () => {
    dashboardState.orders = [createOrder(true)];

    const html = renderDashboard();

    expect(html).toContain("คำสั่งรอไฟล์");
    expect(html).toContain("1 คำสั่ง");
    expect(html).toContain('aria-expanded="false"');
  });

  it("keeps the existing pending-file contents when the section is expanded", () => {
    dashboardState.isPendingFilePanelOpen = true;
    dashboardState.orders = [createOrder(true)];

    const html = renderDashboard();

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('title="ไปยังคำสั่งล็อต LOT-001"');
    expect(html).toContain("ผู้สั่ง: Test user");
  });
});
