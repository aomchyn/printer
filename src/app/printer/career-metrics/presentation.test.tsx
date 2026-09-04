import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CareerChartContainer, CareerChartTooltip, MetricValue } from "./presentation";

describe("Career Metrics presentation", () => {
  it("keeps dates nonbreaking with responsive, date-only typography", () => {
    const date = renderToStaticMarkup(<MetricValue kind="date">01/09/2569</MetricValue>);
    expect(date).toContain("01/09/2569");
    expect(date).toContain("white-space:nowrap");
    expect(date).toContain("font-size:clamp(");
    const count = renderToStaticMarkup(<MetricValue>51,079</MetricValue>);
    expect(count).not.toContain("font-size:clamp(");
    expect(count).not.toContain("white-space:nowrap");
  });

  it("constrains tooltip width and wraps long labels without truncating values", () => {
    const html = renderToStaticMarkup(
      <CareerChartTooltip active label="ส.ค. 2026" title="ปริมาณงานพิมพ์รายเดือน"
        payload={[{ value: 54211 }]} unit=" หน่วย" />,
    );
    expect(html).toContain("max-width:min(220px, calc(100vw - 96px))");
    expect(html).toContain("white-space:normal");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("ปริมาณงานพิมพ์รายเดือน");
    expect(html).toContain("54,211 หน่วย");
  });

  it("formats rates and real zero values while keeping unavailable points empty", () => {
    const props = { active: true, title: "อัตรากระดาษเสีย", unit: "%", fractionDigits: 2 };
    expect(renderToStaticMarkup(<CareerChartTooltip {...props} payload={[{ value: 1.567 }]} />)).toContain("1.57%");
    expect(renderToStaticMarkup(<CareerChartTooltip {...props} payload={[{ value: 0 }]} />)).toContain("0.00%");
    for (const value of [null, undefined, NaN, Infinity]) {
      expect(renderToStaticMarkup(<CareerChartTooltip {...props} payload={[{ value }]} />)).toBe("");
    }
    expect(renderToStaticMarkup(<CareerChartTooltip {...props} active={false} payload={[{ value: 1 }]} />)).toBe("");
  });

  it.each([256, 288] as const)("reserves height %s without rendering an unmeasured chart or warning", (height) => {
    const warn = vi.spyOn(console, "warn");
    const chart = vi.fn(() => <span>measured chart</span>);
    const Chart = chart;
    try {
      const html = renderToStaticMarkup(<CareerChartContainer height={height}><Chart /></CareerChartContainer>);
      expect(html).toContain(`height:${height}px`);
      expect(html).toContain("width:100%");
      expect(html).toContain("min-width:0");
      expect(chart).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
