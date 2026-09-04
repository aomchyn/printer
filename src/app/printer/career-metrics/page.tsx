"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  LockKeyhole,
  Percent,
  Printer,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { getBangkokYearMonth } from "@/lib/statisticsMetrics";
import type { CareerMetrics } from "@/lib/careerMetrics";
import type {
  CareerHistory,
  CareerHistoricalMonth,
  HistoricalCoverage,
} from "@/lib/careerHistoricalMetrics";
import type { PaperWasteMetrics } from "@/lib/paperWasteMetrics";
import { CAREER_METRICS_COPY, THAI_MONTHS } from "./copy";
import { CareerChartContainer, CareerChartTooltip, MetricValue } from "./presentation";

type AvailablePeriod = {
  year: number;
  month: number;
};

type CareerMetricsResponse = {
  period: AvailablePeriod & { timeZone: "Asia/Bangkok" };
  availablePeriods: AvailablePeriod[];
  metrics: CareerMetrics;
  paperWaste: PaperWasteMetrics;
  history: CareerHistory;
  unavailableMetrics: {
    activeSku: string;
    activeUsers: string;
  };
};

type PageStatus = "loading" | "ready" | "denied" | "error";

const numberFormatter = new Intl.NumberFormat("en-US");

type HistoricalChartKey =
  | "orderedSku"
  | "orders"
  | "printingQuantity"
  | "wasteRate"
  | "paperWasteA3";

type HistoricalChartPoint = CareerHistoricalMonth & {
  chartLabel: string;
};

function formatThaiDate(value: string | null): string {
  if (!value) return "ไม่มีข้อมูล";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || !THAI_MONTHS[month - 1]) return "ไม่มีข้อมูล";
  return `${day} ${THAI_MONTHS[month - 1]} ${year}`;
}

function formatThaiMonth(value: string | null): string {
  if (!value) return "ไม่มีข้อมูล";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month || !THAI_MONTHS[month - 1]) return "ไม่มีข้อมูล";
  return `${THAI_MONTHS[month - 1]} ${year}`;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "ไม่มีข้อมูล" : numberFormatter.format(value);
}

function formatNullableRate(value: number | null): string {
  return value === null ? "ไม่มีข้อมูล" : `${value.toFixed(2)}%`;
}

function coverageLabel(
  coverage: HistoricalCoverage,
  isCurrentMonth: boolean,
): string {
  if (coverage === "none") return "ไม่มีข้อมูล";
  if (coverage === "full") return "ข้อมูลเต็มเดือน";
  return isCurrentMonth ? "ข้อมูลถึงปัจจุบัน" : "ข้อมูลไม่เต็มเดือน";
}

function HistoricalChartCard({
  title,
  englishTitle,
  data,
  dataKey,
  coverageKey,
  color,
  unit,
  fractionDigits = 0,
}: {
  title: string;
  englishTitle: string;
  data: HistoricalChartPoint[];
  dataKey: HistoricalChartKey;
  coverageKey: "orderCoverage" | "paperCoverage";
  color: string;
  unit: string;
  fractionDigits?: number;
}) {
  return (
    <article className="min-w-0 rounded-3xl border border-[#D9E1E2] bg-white p-5 shadow-sm sm:p-6">
      <h3 className="font-black text-[#00263A]">{title}</h3>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9498]">
        {englishTitle}
      </p>
      <p className="mt-2 text-[10px] leading-relaxed text-[#5F6B70]">
        แท่งสีจางหมายถึงข้อมูลของแหล่งนี้ไม่เต็มเดือน
      </p>
      <div className="mt-4 h-64 w-full" aria-label={title}>
        <CareerChartContainer height={256}>
          <BarChart data={data} margin={{ left: 0, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D9E1E2" />
            <XAxis
              dataKey="chartLabel"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#5F6B70", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              allowDecimals={fractionDigits > 0}
              tick={{ fill: "#5F6B70", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: "#F5F7F8" }}
              content={<CareerChartTooltip title={title} unit={unit} fractionDigits={fractionDigits} />}
            />
            <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} barSize={28}>
              {data.map((point) => (
                <Cell
                  key={`${dataKey}-${point.key}`}
                  fillOpacity={point[coverageKey] === "full" ? 1 : 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </CareerChartContainer>
      </div>
    </article>
  );
}

function MetricCard({
  label,
  englishLabel,
  value,
  detail,
  icon,
  tone = "blue",
  valueKind = "number",
}: {
  label: string;
  englishLabel?: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: "blue" | "cyan" | "emerald" | "amber" | "rose";
  valueKind?: "number" | "date";
}) {
  const styles = {
    blue: "border-[#0057B8]/15 bg-[#EAF3FC] text-[#0057B8]",
    cyan: "border-[#00AEC7]/20 bg-[#E5F8FB] text-[#008BA0]",
    emerald: "border-[#00B398]/20 bg-[#E6F8F4] text-[#008C78]",
    amber: "border-[#F1C400]/30 bg-[#FFF8D6] text-[#806A00]",
    rose: "border-[#C8102E]/15 bg-[#FCEAEC] text-[#C8102E]",
  }[tone];

  return (
    <article className="group relative overflow-hidden rounded-3xl border border-[#D9E1E2] bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className={`mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border ${styles}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="text-[12px] font-black leading-snug text-[#5F6B70]">
        {label}
      </p>
      {englishLabel && (
        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8A9498]">
          {englishLabel}
        </p>
      )}
      <MetricValue kind={valueKind}>{value}</MetricValue>
      <p className="mt-2 text-xs font-medium leading-relaxed text-[#5F6B70]">
        {detail}
      </p>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="กำลังโหลดตัวชี้วัดสายอาชีพ">
      <div className="h-28 animate-pulse rounded-3xl bg-white" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className="h-52 animate-pulse rounded-3xl bg-white"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

export default function CareerMetricsPage() {
  const router = useRouter();
  const currentPeriod = useMemo(
    () => getBangkokYearMonth(new Date().toISOString()),
    [],
  );
  const [selectedYear, setSelectedYear] = useState(currentPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(currentPeriod.month);
  const [data, setData] = useState<CareerMetricsResponse | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");

  const loadMetrics = useCallback(
    async (signal?: AbortSignal) => {
      setStatus("loading");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        const response = await fetch(
          `/api/career-metrics?year=${selectedYear}&month=${selectedMonth}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
            signal,
          },
        );

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (response.status === 403) {
          setData(null);
          setStatus("denied");
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load Career Metrics");
        }

        const payload = (await response.json()) as CareerMetricsResponse;
        setData(payload);
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Career Metrics request failed:", error);
        setStatus("error");
      }
    },
    [router, selectedMonth, selectedYear],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Data loading is intentionally tied to the selected reporting period.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMetrics(controller.signal);
    return () => controller.abort();
  }, [loadMetrics]);

  const availableYears = useMemo(() => {
    return Array.from(
      new Set([
        selectedYear,
        ...(data?.availablePeriods.map((period) => period.year) ?? []),
      ]),
    ).sort((first, second) => second - first);
  }, [data?.availablePeriods, selectedYear]);
  const availableMonths = useMemo(() => {
    const periodMonths =
      data?.availablePeriods
        .filter((period) => period.year === selectedYear)
        .map((period) => period.month) ?? [];

    return Array.from(
      new Set([selectedMonth, ...periodMonths]),
    ).sort((first, second) => second - first);
  }, [data?.availablePeriods, selectedMonth, selectedYear]);
  const isCurrentBangkokMonth =
    data?.period.year === currentPeriod.year &&
    data.period.month === currentPeriod.month;
  const historyChartData = useMemo<HistoricalChartPoint[]>(
    () =>
      data?.history.months.map((month) => ({
        ...month,
        chartLabel: `${month.month}/${String(month.year).slice(-2)}`,
      })) ?? [],
    [data?.history.months],
  );

  if (status === "denied") {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-3xl border border-[#C8102E]/20 bg-white p-8 text-center shadow-xl">
          <LockKeyhole className="mx-auto h-12 w-12 text-[#C8102E]" />
          <h1 className="mt-5 text-2xl font-black text-[#00263A]">
            ต้องใช้สิทธิ์ Moderator
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#5F6B70]">
            ตัวชี้วัดสายอาชีพเป็นข้อมูลส่วนตัวสำหรับผู้ที่มีบทบาท Moderator เท่านั้น
          </p>
          <button
            type="button"
            onClick={() => router.replace("/printer/dashboard")}
            className="mt-6 rounded-xl bg-[#0057B8] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#004A9F] focus:outline-none focus:ring-2 focus:ring-[#00AEC7] focus:ring-offset-2"
          >
            กลับไปหน้า Dashboard
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="relative mb-6 overflow-hidden rounded-3xl bg-[#00263A] px-5 py-7 text-white shadow-xl sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#00AEC7]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-52 w-52 rounded-full bg-[#00B398]/15 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00B398]/30 bg-[#00B398]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#7FE4D0]">
                <ShieldCheck className="h-3.5 w-3.5" /> เฉพาะ Moderator
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/65">
                <LockKeyhole className="h-3.5 w-3.5" /> ข้อมูลวิเคราะห์ส่วนตัว
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                <BriefcaseBusiness className="h-6 w-6 text-[#00AEC7]" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  {CAREER_METRICS_COPY.title}
                </h1>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6DDAE8]">
                  {CAREER_METRICS_COPY.englishTitle}
                </p>
                <p className="mt-2 max-w-xl text-xs font-medium leading-relaxed text-white/60 sm:text-sm">
                  <span className="block">สรุปผลงานและขนาดการดำเนินงาน</span>
                  <span className="block">คำนวณอัตโนมัติจากข้อมูลในระบบ Printer</span>
                </p>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <label className="min-w-0 text-[10px] font-black uppercase tracking-wider text-white/55">
              ปี <span className="font-medium normal-case text-white/40">(Year)</span>
              <select
                value={selectedYear}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);
                  const firstAvailableMonth = data?.availablePeriods.find(
                    (period) => period.year === nextYear,
                  )?.month;
                  setSelectedYear(nextYear);
                  if (firstAvailableMonth) setSelectedMonth(firstAvailableMonth);
                }}
                className="mt-1.5 block w-full min-w-0 rounded-xl border border-white/15 bg-[#0A354A] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-[#00AEC7] focus:ring-2 focus:ring-[#00AEC7]/30"
              >
                {availableYears.map((year) => (
                  <option value={year} key={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-[10px] font-black uppercase tracking-wider text-white/55">
              เดือน <span className="font-medium normal-case text-white/40">(Month)</span>
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(Number(event.target.value))}
                className="mt-1.5 block w-full min-w-0 rounded-xl border border-white/15 bg-[#0A354A] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-[#00AEC7] focus:ring-2 focus:ring-[#00AEC7]/30"
              >
                {availableMonths.map((month) => (
                  <option value={month} key={month}>
                    {THAI_MONTHS[month - 1]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      {status === "loading" && <DashboardSkeleton />}

      {status === "error" && (
        <section className="rounded-3xl border border-[#C8102E]/20 bg-white p-8 text-center">
          <p className="font-bold text-[#00263A]">ไม่สามารถโหลดตัวชี้วัดสายอาชีพได้</p>
          <p className="mt-1 text-sm text-[#5F6B70]">กรุณาลองอีกครั้ง</p>
          <button
            type="button"
            onClick={() => loadMetrics()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0057B8] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#004A9F] focus:outline-none focus:ring-2 focus:ring-[#00AEC7] focus:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" /> ลองอีกครั้ง
          </button>
        </section>
      )}

      {status === "ready" && data && (
        <>
          <section aria-labelledby="primary-metrics-heading">
            <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div>
                <h2 id="primary-metrics-heading" className="text-lg font-black text-[#00263A]">
                  {CAREER_METRICS_COPY.operationalScale}
                  <span className="ml-1.5 text-xs font-bold text-[#8A9498]">(Operational Scale)</span>
                </h2>
                <p className="text-xs font-medium text-[#5F6B70]">
                  {THAI_MONTHS[data.period.month - 1]} {data.period.year} · เวลาไทย (Asia/Bangkok)
                </p>
                {isCurrentBangkokMonth && (
                  <p className="mt-1 text-[10px] font-black text-[#008C78]">
                    ข้อมูลถึงปัจจุบัน <span className="font-bold text-[#5F6B70]">(Month-to-date)</span>
                  </p>
                )}
              </div>
              <span className="rounded-full bg-[#EAF3FC] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#0057B8]">
                คำนวณจากข้อมูลจริง
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label={CAREER_METRICS_COPY.totalSku}
                englishLabel="Total SKU"
                value={numberFormatter.format(data.metrics.totalSku)}
                detail="จำนวนรหัสสินค้าปัจจุบันทั้งหมดใน Product Master ไม่ใช่ SKU ที่มีการสั่งงาน"
                icon={<Boxes className="h-5 w-5" />}
              />
              <MetricCard
                label={CAREER_METRICS_COPY.totalOrders}
                englishLabel="Total Orders"
                value={numberFormatter.format(data.metrics.totalOrders)}
                detail="คำสั่งทั้งหมดที่สร้างในเดือนที่เลือก"
                icon={<ShoppingCart className="h-5 w-5" />}
                tone="cyan"
              />
              <MetricCard
                label={CAREER_METRICS_COPY.printingQuantity}
                englishLabel="Printing Quantity"
                value={numberFormatter.format(data.metrics.totalQuantity)}
                detail="จำนวนรวมที่สั่งพิมพ์ในเดือนที่เลือก"
                icon={<Printer className="h-5 w-5" />}
                tone="emerald"
              />
              <MetricCard
                label={CAREER_METRICS_COPY.averageActiveDay}
                englishLabel="Avg. Orders / Active Day"
                value={data.metrics.averageOrdersPerDay.toFixed(1)}
                detail="จำนวนคำสั่งเฉลี่ยเฉพาะวันที่มีคำสั่งพิมพ์"
                icon={<TrendingUp className="h-5 w-5" />}
                tone="amber"
              />
            </div>
          </section>

          <section className="mt-8" aria-labelledby="secondary-metrics-heading">
            <div className="mb-4">
              <h2 id="secondary-metrics-heading" className="text-lg font-black text-[#00263A]">
                สัญญาณประสิทธิภาพ
                <span className="ml-1.5 text-xs font-bold text-[#8A9498]">(Performance Signals)</span>
              </h2>
              <p className="text-xs font-medium text-[#5F6B70]">
                การคำนวณช่วงสูงสุดไม่นับคำสั่งที่ยกเลิก
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label={CAREER_METRICS_COPY.peakDay}
                englishLabel="Peak Order Day"
                valueKind="date"
                value={data.metrics.peakDay?.displayDate ?? "—"}
                detail={data.metrics.peakDay ? `${numberFormatter.format(data.metrics.peakDay.orders)} คำสั่ง` : "ไม่มีคำสั่งที่ใช้งาน"}
                icon={<CalendarDays className="h-5 w-5" />}
                tone="cyan"
              />
              <MetricCard
                label={CAREER_METRICS_COPY.peakHour}
                englishLabel="Peak Order Hour"
                value={data.metrics.peakHour?.label ?? "—"}
                detail={data.metrics.peakHour ? `${numberFormatter.format(data.metrics.peakHour.orders)} คำสั่ง` : "ไม่มีคำสั่งที่ใช้งาน"}
                icon={<Clock3 className="h-5 w-5" />}
              />
              <MetricCard
                label={CAREER_METRICS_COPY.cancelledOrders}
                englishLabel="Cancelled Orders"
                value={numberFormatter.format(data.metrics.cancelledOrders)}
                detail="คำสั่งที่ยกเลิกในเดือนที่เลือก"
                icon={<Ban className="h-5 w-5" />}
                tone="rose"
              />
              <MetricCard
                label={CAREER_METRICS_COPY.cancellationRate}
                englishLabel="Cancellation Rate"
                value={`${data.metrics.cancellationRate.toFixed(1)}%`}
                detail="คำสั่งที่ยกเลิก ÷ คำสั่งทั้งหมด"
                icon={<Percent className="h-5 w-5" />}
                tone="rose"
              />
            </div>
          </section>

          <section className="mt-8" aria-labelledby="quality-waste-heading">
            <div className="mb-4">
              <h2 id="quality-waste-heading" className="text-lg font-black text-[#00263A]">
                {CAREER_METRICS_COPY.qualityAndWaste}
                <span className="ml-1.5 text-xs font-bold text-[#8A9498]">(Quality &amp; Waste)</span>
              </h2>
              <p className="text-xs font-medium text-[#5F6B70]">
                สรุปจากรายงานการใช้กระดาษในเดือนที่เลือก
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label={CAREER_METRICS_COPY.totalPaperWaste}
                englishLabel="Total Paper Waste"
                value={`${numberFormatter.format(data.paperWaste.totalWaste)} แผ่น A3`}
                detail={`จากรายงานการใช้กระดาษ ${numberFormatter.format(data.paperWaste.reportCount)} รายการ`}
                icon={<Trash2 className="h-5 w-5" />}
                tone="rose"
              />
              <MetricCard
                label={CAREER_METRICS_COPY.wasteIncidents}
                englishLabel="Waste Incidents"
                value={`${numberFormatter.format(data.paperWaste.incidentCount)} ครั้ง`}
                detail="นับรายงานที่มีกระดาษเสียมากกว่า 0 แผ่น A3"
                icon={<Ban className="h-5 w-5" />}
                tone="amber"
              />
              <MetricCard
                label={CAREER_METRICS_COPY.averageWastePerIncident}
                englishLabel="Average Waste / Incident"
                value={
                  data.paperWaste.averageWastePerIncident === null
                    ? "—"
                    : `${data.paperWaste.averageWastePerIncident.toFixed(1)} แผ่น A3`
                }
                detail="กระดาษเสียทั้งหมด ÷ เหตุการณ์กระดาษเสีย"
                icon={<TrendingUp className="h-5 w-5" />}
                tone="cyan"
              />
              <MetricCard
                label={CAREER_METRICS_COPY.wasteRate}
                englishLabel="Waste Rate"
                value={
                  data.paperWaste.wasteRate === null
                    ? "—"
                    : `${data.paperWaste.wasteRate.toFixed(2)}%`
                }
                detail={`กระดาษใช้ทั้งหมด ${numberFormatter.format(data.paperWaste.totalPaperUsed)} แผ่น A3`}
                icon={<Percent className="h-5 w-5" />}
                tone="emerald"
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
              <article className="rounded-3xl border border-[#D9E1E2] bg-white p-5 shadow-sm sm:p-6">
                <h3 className="font-black text-[#00263A]">
                  {CAREER_METRICS_COPY.wasteCauses}
                  <span className="ml-1.5 text-[10px] font-bold text-[#8A9498]">(Waste Causes)</span>
                </h3>
                <p className="mt-1 text-xs text-[#5F6B70]">
                  แสดงเฉพาะข้อความที่ผ่านการจัดกลุ่มเพื่อความเป็นส่วนตัว
                </p>

                {data.paperWaste.causes.length > 0 ? (
                  <ol className="mt-5 space-y-4">
                    {data.paperWaste.causes.map((cause, index) => (
                      <li key={cause.label}>
                        <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <span className="min-w-0 font-bold text-[#00263A]">
                            {index + 1}. {cause.label}
                          </span>
                          <span className="shrink-0 font-black tabular-nums text-[#C8102E]">
                            {numberFormatter.format(cause.quantity)} แผ่น A3 · {cause.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F0F3F4]">
                          <div
                            className="h-full rounded-full bg-[#C8102E]"
                            style={{ width: `${Math.min(cause.percentage, 100)}%` }}
                            aria-hidden="true"
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-5 rounded-2xl bg-[#F5F7F8] p-5 text-center text-sm font-medium text-[#5F6B70]">
                    ไม่พบกระดาษเสียในช่วงเวลาที่เลือก
                  </p>
                )}
              </article>

              <article className="rounded-3xl border border-[#D9E1E2] bg-white p-5 shadow-sm sm:p-6">
                <h3 className="font-black text-[#00263A]">
                  {CAREER_METRICS_COPY.wasteByPaperType}
                  <span className="ml-1.5 text-[10px] font-bold text-[#8A9498]">(Waste by Paper Type)</span>
                </h3>
                <p className="mt-1 text-xs text-[#5F6B70]">
                  สัดส่วนคำนวณจากกระดาษเสียทั้งหมดในเดือนที่เลือก
                </p>

                {data.paperWaste.byPaperType.length > 0 ? (
                  <ul className="mt-5 space-y-4">
                    {data.paperWaste.byPaperType.map((paperType) => (
                      <li key={paperType.label}>
                        <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <span className="min-w-0 font-bold text-[#00263A]">
                            {paperType.label}
                          </span>
                          <span className="shrink-0 font-black tabular-nums text-[#0057B8]">
                            {numberFormatter.format(paperType.quantity)} แผ่น A3 · {paperType.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F0F3F4]">
                          <div
                            className="h-full rounded-full bg-[#0057B8]"
                            style={{ width: `${Math.min(paperType.percentage, 100)}%` }}
                            aria-hidden="true"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-5 rounded-2xl bg-[#F5F7F8] p-5 text-center text-sm font-medium text-[#5F6B70]">
                    ไม่มีข้อมูลของเสียแยกตามประเภทกระดาษ
                  </p>
                )}
              </article>
            </div>

            <article className="mt-5 rounded-3xl border border-[#D9E1E2] bg-white p-5 shadow-sm sm:p-6">
              <h3 className="font-black text-[#00263A]">
                {CAREER_METRICS_COPY.dailyWasteTrend}
                <span className="ml-1.5 text-[10px] font-bold text-[#8A9498]">(Daily Waste Trend)</span>
              </h3>
              <p className="mt-1 text-xs text-[#5F6B70]">
                จัดกลุ่มตามวันที่บันทึกรายงานในเวลาไทย ไม่ใช่วันที่ผลิตหรือวันที่สร้างคำสั่งซื้อ
              </p>

              {data.paperWaste.dailyTrend.length > 0 ? (
                <div className="mt-5 h-72 w-full" aria-label="กราฟแนวโน้มกระดาษเสียรายวัน">
                  <CareerChartContainer height={288}>
                    <BarChart data={data.paperWaste.dailyTrend} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D9E1E2" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#5F6B70", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#5F6B70", fontSize: 11 }} />
                      <Tooltip
                        cursor={{ fill: "#FCEAEC" }}
                        content={<CareerChartTooltip title="กระดาษเสีย" unit=" แผ่น A3" />}
                      />
                      <Bar dataKey="quantity" name="กระดาษเสีย" fill="#C8102E" radius={[6, 6, 0, 0]} barSize={28} />
                    </BarChart>
                  </CareerChartContainer>
                </div>
              ) : (
                <p className="mt-5 rounded-2xl bg-[#F5F7F8] p-5 text-center text-sm font-medium text-[#5F6B70]">
                  ไม่มีรายงานการใช้กระดาษในช่วงเวลาที่เลือก
                </p>
              )}
            </article>
          </section>

          <section className="mt-8" aria-labelledby="historical-performance-heading">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="historical-performance-heading" className="text-lg font-black text-[#00263A]">
                  {CAREER_METRICS_COPY.historicalPerformance}
                  <span className="ml-1.5 text-xs font-bold text-[#8A9498]">(Historical Performance)</span>
                </h2>
                <p className="text-xs font-medium text-[#5F6B70]">
                  {data.history.from
                    ? `${formatThaiMonth(data.history.from)} – ${formatThaiMonth(data.history.to)} · ${data.history.months.length} เดือนที่มีแหล่งข้อมูล`
                    : "ยังไม่มีข้อมูลย้อนหลังที่เชื่อถือได้"}
                </p>
                {data.history.months.some((month) => month.isCurrentMonth) && (
                  <p className="mt-1 text-[10px] font-black text-[#008C78]">
                    ข้อมูลถึง {formatThaiDate(data.history.asOf)}{" "}
                    <span className="font-bold text-[#5F6B70]">(Month-to-date)</span>
                  </p>
                )}
              </div>
              <span className="w-fit rounded-full bg-[#F5F7F8] px-3 py-1 text-[10px] font-black text-[#5F6B70]">
                สูงสุด {data.history.requestedMonths} เดือนย้อนหลัง
              </span>
            </div>

            <div className="rounded-3xl border border-[#F1C400]/35 bg-[#FFF8D6] p-5 text-xs leading-relaxed text-[#5F6B70] shadow-sm">
              <p className="font-black text-[#665500]">ขอบเขตความครอบคลุมของข้อมูล</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <p>
                  <strong className="text-[#00263A]">คำสั่ง:</strong>{" "}
                  เริ่มมีข้อมูล {formatThaiDate(data.history.coverage.ordersFrom)}
                </p>
                <p>
                  <strong className="text-[#00263A]">Paper Reports:</strong>{" "}
                  เริ่มมีข้อมูล {formatThaiDate(data.history.coverage.paperReportsFrom)}
                </p>
              </div>
              <p className="mt-2 text-[10px] font-bold text-[#806A00]">
                เดือนที่แหล่งข้อมูลเริ่มระหว่างเดือนเป็นข้อมูลไม่เต็มเดือน และไม่ใช่ฐานเปรียบเทียบแบบเต็มเดือน
              </p>
            </div>

            {historyChartData.length > 0 ? (
              <>
                <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
                  <HistoricalChartCard
                    title={CAREER_METRICS_COPY.orderedSku}
                    englishTitle="Ordered SKU"
                    data={historyChartData}
                    dataKey="orderedSku"
                    coverageKey="orderCoverage"
                    color="#00AEC7"
                    unit=" SKU"
                  />
                  <HistoricalChartCard
                    title={CAREER_METRICS_COPY.monthlyOrders}
                    englishTitle="Monthly Orders"
                    data={historyChartData}
                    dataKey="orders"
                    coverageKey="orderCoverage"
                    color="#0057B8"
                    unit=" รายการ"
                  />
                  <HistoricalChartCard
                    title={CAREER_METRICS_COPY.monthlyPrintingQuantity}
                    englishTitle="Monthly Printing Quantity"
                    data={historyChartData}
                    dataKey="printingQuantity"
                    coverageKey="orderCoverage"
                    color="#00B398"
                    unit=" หน่วย"
                  />
                  <HistoricalChartCard
                    title={CAREER_METRICS_COPY.historicalWasteRate}
                    englishTitle="Waste Rate"
                    data={historyChartData}
                    dataKey="wasteRate"
                    coverageKey="paperCoverage"
                    color="#F1C400"
                    unit="%"
                    fractionDigits={2}
                  />
                  <HistoricalChartCard
                    title={CAREER_METRICS_COPY.monthlyPaperWaste}
                    englishTitle="Paper Waste"
                    data={historyChartData}
                    dataKey="paperWasteA3"
                    coverageKey="paperCoverage"
                    color="#C8102E"
                    unit=" แผ่น A3"
                  />
                </div>

                <article className="mt-5 rounded-3xl border border-[#D9E1E2] bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="font-black text-[#00263A]">
                    {CAREER_METRICS_COPY.monthlyDetails}
                    <span className="ml-1.5 text-[10px] font-bold text-[#8A9498]">(Monthly Details)</span>
                  </h3>

                  <div className="mt-5 space-y-4 md:hidden">
                    {data.history.months.map((month) => {
                      const orderStartedThisMonth = data.history.coverage.ordersFrom?.startsWith(month.key);
                      const paperStartedThisMonth = data.history.coverage.paperReportsFrom?.startsWith(month.key);

                      return (
                        <section className="rounded-2xl border border-[#D9E1E2] p-4" key={month.key}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-black text-[#00263A]">
                                {THAI_MONTHS[month.month - 1]} {month.year}
                              </h4>
                              {month.isCurrentMonth && (
                                <p className="mt-0.5 text-[10px] font-black text-[#008C78]">ข้อมูลถึงปัจจุบัน · MTD</p>
                              )}
                            </div>
                            {!month.isComparableMonth && (
                              <span className="rounded-full bg-[#FFF8D6] px-2.5 py-1 text-[9px] font-black text-[#806A00]">
                                ไม่ใช่ฐานเต็มเดือน
                              </span>
                            )}
                          </div>

                          <div className="mt-3 grid gap-2 rounded-xl bg-[#F5F7F8] p-3 text-[10px]">
                            <p>
                              <strong className="text-[#00263A]">คำสั่ง:</strong>{" "}
                              {coverageLabel(month.orderCoverage, month.isCurrentMonth)}
                              {orderStartedThisMonth && ` · เริ่ม ${formatThaiDate(data.history.coverage.ordersFrom)}`}
                            </p>
                            <p>
                              <strong className="text-[#00263A]">กระดาษ:</strong>{" "}
                              {coverageLabel(month.paperCoverage, month.isCurrentMonth)}
                              {paperStartedThisMonth && ` · เริ่ม ${formatThaiDate(data.history.coverage.paperReportsFrom)}`}
                            </p>
                          </div>

                          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                            {[
                              ["คำสั่ง", formatNullableNumber(month.orders)],
                              ["SKU ที่มีการสั่งงาน", formatNullableNumber(month.orderedSku)],
                              ["จำนวนงานพิมพ์", formatNullableNumber(month.printingQuantity)],
                              ["วันที่มีงาน", formatNullableNumber(month.activeOrderDays)],
                              ["เฉลี่ย/วันที่มีงาน", month.averageOrdersPerActiveDay === null ? "ไม่มีข้อมูล" : month.averageOrdersPerActiveDay.toFixed(1)],
                              ["A3 ใช้รวม", month.totalPaperUsed === null ? "ไม่มีข้อมูล" : `${numberFormatter.format(month.totalPaperUsed)} แผ่น`],
                              ["A3 เสีย", month.paperWasteA3 === null ? "ไม่มีข้อมูล" : `${numberFormatter.format(month.paperWasteA3)} แผ่น`],
                              ["อัตราของเสีย", formatNullableRate(month.wasteRate)],
                              ["เหตุการณ์เสีย", formatNullableNumber(month.wasteIncidents)],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <dt className="text-[10px] font-bold text-[#8A9498]">{label}</dt>
                                <dd className="mt-0.5 font-black tabular-nums text-[#00263A]">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      );
                    })}
                  </div>

                  <div className="mt-5 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[1160px] border-separate border-spacing-0 text-left text-xs">
                      <thead>
                        <tr className="text-[10px] font-black text-[#5F6B70]">
                          {[
                            "เดือน",
                            "ความครอบคลุม",
                            "คำสั่ง",
                            "Ordered SKU",
                            "จำนวนงานพิมพ์",
                            "วันที่มีงาน",
                            "เฉลี่ย/วันที่มีงาน",
                            "A3 ใช้รวม",
                            "A3 เสีย",
                            "Waste Rate",
                            "เหตุการณ์เสีย",
                          ].map((heading) => (
                            <th className="border-b border-[#D9E1E2] px-3 py-3" key={heading}>{heading}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.months.map((month) => (
                          <tr className="align-top text-[#00263A]" key={month.key}>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black">
                              {THAI_MONTHS[month.month - 1]} {month.year}
                              {month.isCurrentMonth && (
                                <span className="mt-1 block text-[9px] font-black text-[#008C78]">MTD</span>
                              )}
                            </td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 text-[10px] leading-relaxed">
                              <span className="block">คำสั่ง: {coverageLabel(month.orderCoverage, month.isCurrentMonth)}</span>
                              <span className="block">กระดาษ: {coverageLabel(month.paperCoverage, month.isCurrentMonth)}</span>
                            </td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{formatNullableNumber(month.orders)}</td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{formatNullableNumber(month.orderedSku)}</td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{formatNullableNumber(month.printingQuantity)}</td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{formatNullableNumber(month.activeOrderDays)}</td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{month.averageOrdersPerActiveDay === null ? "—" : month.averageOrdersPerActiveDay.toFixed(1)}</td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{month.totalPaperUsed === null ? "—" : numberFormatter.format(month.totalPaperUsed)}</td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{month.paperWasteA3 === null ? "—" : numberFormatter.format(month.paperWasteA3)}</td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{month.wasteRate === null ? "—" : `${month.wasteRate.toFixed(2)}%`}</td>
                            <td className="border-b border-[#EEF1F2] px-3 py-4 font-black tabular-nums">{month.wasteIncidents === null ? "—" : numberFormatter.format(month.wasteIncidents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </>
            ) : (
              <p className="mt-5 rounded-3xl border border-[#D9E1E2] bg-white p-8 text-center text-sm font-medium text-[#5F6B70]">
                ยังไม่มีข้อมูลย้อนหลังที่เชื่อถือได้
              </p>
            )}
          </section>

          <section className="mt-8 overflow-hidden rounded-3xl border border-[#00AEC7]/20 bg-gradient-to-br from-[#00263A] to-[#063F55] text-white shadow-xl" aria-labelledby="portfolio-snapshot-heading">
            <div className="grid lg:grid-cols-[0.75fr_1.25fr]">
              <div className="border-b border-white/10 p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#00AEC7]/25 bg-[#00AEC7]/10 text-[#6DDAE8]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 id="portfolio-snapshot-heading" className="mt-5 text-xl font-black">
                  {CAREER_METRICS_COPY.portfolioSnapshot}
                  <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#6DDAE8]">Portfolio Snapshot</span>
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">
                  สรุปขนาดงานที่รับผิดชอบจากตัวชี้วัดที่กำลังแสดงผล
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
                {[
                  ["ดูแลรายการสินค้า", `${numberFormatter.format(data.metrics.totalSku)} SKU`],
                  ["รองรับคำสั่งพิมพ์", `${numberFormatter.format(data.metrics.totalOrders)} รายการ`],
                  ["จำนวนงานพิมพ์รวม", `${numberFormatter.format(data.metrics.totalQuantity)} หน่วย`],
                  ["เฉลี่ยต่อวันที่มีงาน", `${data.metrics.averageOrdersPerDay.toFixed(1)} คำสั่ง`],
                  ["ติดตามรายงานการใช้กระดาษ", `${numberFormatter.format(data.paperWaste.reportCount)} รายการ`],
                  ["ติดตามเหตุการณ์กระดาษเสีย", `${numberFormatter.format(data.paperWaste.incidentCount)} ครั้ง`],
                  ["กระดาษเสียรวม", `${numberFormatter.format(data.paperWaste.totalWaste)} แผ่น A3`],
                  ["อัตรากระดาษเสีย", data.paperWaste.wasteRate === null ? "ยังไม่มีข้อมูล" : `${data.paperWaste.wasteRate.toFixed(2)}%`],
                ].map(([label, value]) => (
                  <div className="bg-[#06384C]/95 p-5 sm:p-6" key={label}>
                    <dt className="text-[10px] font-black leading-snug text-[#6DDAE8]">
                      {label}
                    </dt>
                    <dd className="mt-2 text-2xl font-black tabular-nums sm:text-3xl">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <aside className="mt-5 rounded-2xl border border-[#D9E1E2] bg-white px-5 py-4 text-xs leading-relaxed text-[#5F6B70]">
            <strong className="text-[#00263A]">ตัวชี้วัดที่ยังไม่แสดง:</strong> Active SKU และ Active Users ยังไม่สามารถคำนวณจากข้อมูลปัจจุบันได้อย่างน่าเชื่อถือ
          </aside>
        </>
      )}
    </div>
  );
}
