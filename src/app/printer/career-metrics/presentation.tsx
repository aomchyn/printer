import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

export function MetricValue({
  children,
  kind = "number",
}: {
  children: ReactNode;
  kind?: "number" | "date";
}) {
  return (
    <p
      className={`mt-2 font-black tracking-tight text-[#00263A] tabular-nums ${kind === "number" ? "break-words text-3xl sm:text-4xl" : ""}`}
      style={kind === "date" ? {
        whiteSpace: "nowrap",
        fontSize: "clamp(1.5rem, 1.8vw, 1.875rem)",
        lineHeight: 1.2,
      } : undefined}
    >
      {children}
    </p>
  );
}

export function CareerChartContainer({
  children,
  height,
}: {
  children: ReactNode;
  height: 256 | 288;
}) {
  // Match the chart's reserved layout height. Recharts waits for a positive
  // measured width before rendering children; neither dimension is guessed.
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      {children}
    </ResponsiveContainer>
  );
}

export function CareerChartTooltip({
  active,
  label,
  payload,
  title,
  unit,
  fractionDigits = 0,
}: {
  active?: boolean;
  label?: ReactNode;
  payload?: readonly { value?: unknown }[];
  title: string;
  unit: string;
  fractionDigits?: number;
}) {
  const value = payload?.[0]?.value;
  if (!active || typeof value !== "number" || !Number.isFinite(value)) return null;

  return (
    <div
      className="rounded-xl border border-[#D9E1E2] bg-white p-3 text-xs leading-relaxed text-[#00263A] shadow-sm"
      style={{
        maxWidth: "min(220px, calc(100vw - 96px))",
        whiteSpace: "normal",
        overflowWrap: "anywhere",
      }}
    >
      <p className="font-bold">{label}</p>
      <p className="mt-1 text-[#5F6B70]">{title}</p>
      <p className="font-bold tabular-nums">
        {value.toLocaleString("en-US", {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        })}{unit}
      </p>
    </div>
  );
}
