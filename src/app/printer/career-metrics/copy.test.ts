import { describe, expect, it } from "vitest";
import { CAREER_METRICS_COPY, THAI_MONTHS } from "./copy";

describe("Career Metrics Thai UI copy", () => {
  it("provides Thai-first labels for the page and every Phase 1 metric", () => {
    expect(CAREER_METRICS_COPY).toMatchObject({
      title: "ตัวชี้วัดสายอาชีพ",
      sidebarLabel: "พอร์ตผลงาน",
      operationalScale: "ขนาดการดำเนินงาน",
      totalSku: "จำนวน SKU ทั้งหมด",
      totalOrders: "คำสั่งทั้งหมด",
      printingQuantity: "จำนวนงานพิมพ์",
      averageActiveDay: "คำสั่งเฉลี่ยต่อวันที่มีงาน",
      peakDay: "วันที่มีคำสั่งสูงสุด",
      peakHour: "ช่วงเวลาที่มีคำสั่งสูงสุด",
      cancelledOrders: "คำสั่งที่ยกเลิก",
      cancellationRate: "อัตราการยกเลิก",
      qualityAndWaste: "คุณภาพและของเสีย",
      totalPaperWaste: "กระดาษเสียทั้งหมด",
      wasteIncidents: "เหตุการณ์กระดาษเสีย",
      averageWastePerIncident: "เฉลี่ยต่อเหตุการณ์",
      wasteRate: "อัตรากระดาษเสีย",
      wasteCauses: "สาเหตุกระดาษเสีย",
      wasteByPaperType: "ของเสียแยกตามประเภทกระดาษ",
      dailyWasteTrend: "แนวโน้มกระดาษเสียรายวัน",
      historicalPerformance: "แนวโน้มผลงานย้อนหลัง",
      orderedSku: "SKU ที่มีการสั่งงาน",
      monthlyOrders: "ปริมาณคำสั่งรายเดือน",
      monthlyPrintingQuantity: "ปริมาณงานพิมพ์รายเดือน",
      historicalWasteRate: "อัตรากระดาษเสียรายเดือน",
      monthlyPaperWaste: "กระดาษเสียรายเดือน",
      monthlyDetails: "รายละเอียดรายเดือน",
      portfolioSnapshot: "สรุปสำหรับพอร์ตผลงาน",
    });
  });

  it("maps month positions to Thai display names without changing month values", () => {
    expect(THAI_MONTHS).toEqual([
      "มกราคม",
      "กุมภาพันธ์",
      "มีนาคม",
      "เมษายน",
      "พฤษภาคม",
      "มิถุนายน",
      "กรกฎาคม",
      "สิงหาคม",
      "กันยายน",
      "ตุลาคม",
      "พฤศจิกายน",
      "ธันวาคม",
    ]);
    expect(THAI_MONTHS[8]).toBe("กันยายน");
  });
});
