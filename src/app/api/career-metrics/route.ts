import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildCareerMetrics } from "../../../lib/careerMetrics";
import { isCareerMetricsModerator } from "../../../lib/careerMetricsAccess";
import {
  getBangkokDateParts,
  getBangkokMonthRange,
  getBangkokYearMonth,
} from "../../../lib/statisticsMetrics";
import {
  calculatePaperWasteMetrics,
  type PaperWasteMetricRow,
} from "../../../lib/paperWasteMetrics";
import {
  buildCareerHistory,
  getCareerHistoryRange,
} from "../../../lib/careerHistoricalMetrics";
import type {
  CurrentHistoricalOrder,
  LegacyDailyMetricRow,
  LegacyMonthlyMetricRow,
} from "../../../lib/careerLegacyMetrics";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1_000;

type AvailablePeriod = {
  year: number;
  month: number;
};

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function loadOrderMetricsRows(
  supabaseAdmin: SupabaseClient,
  startIso: string,
  endExclusiveIso: string,
) {
  const rows: CurrentHistoricalOrder[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("created_at, quantity, is_cancelled, product_id")
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as CurrentHistoricalOrder[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function loadAvailablePeriods(supabaseAdmin: SupabaseClient) {
  const periodKeys = new Set<string>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as { created_at: string }[];
    page.forEach((row) => {
      const period = getBangkokYearMonth(row.created_at);
      periodKeys.add(`${period.year}-${period.month}`);
    });

    if (page.length < PAGE_SIZE) break;
  }

  return Array.from(periodKeys)
    .map((key): AvailablePeriod => {
      const [year, month] = key.split("-").map(Number);
      return { year, month };
    })
    .sort((first, second) =>
      first.year === second.year
        ? second.month - first.month
        : second.year - first.year,
    );
}

async function loadPaperWasteRows(
  supabaseAdmin: SupabaseClient,
  startIso: string,
  endExclusiveIso: string,
) {
  const rows: PaperWasteMetricRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("paper_reports")
      .select(
        "created_at, good_a3, waste_a3, waste_a3_remark, paper_type",
      )
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as PaperWasteMetricRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function loadEarliestCreatedAt(
  supabaseAdmin: SupabaseClient,
  table: "orders" | "paper_reports",
) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return (data?.[0]?.created_at as string | undefined) ?? null;
}

function isMissingLegacyTableError(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

async function loadLegacyDailyMetrics(
  supabaseAdmin: SupabaseClient,
  startDate: string,
  endExclusiveDate: string,
) {
  const { data, error } = await supabaseAdmin
    .from("career_legacy_daily_metrics")
    .select(
      "business_date, non_cancelled_orders, cancelled_orders, total_orders, printing_quantity",
    )
    .gte("business_date", startDate)
    .lt("business_date", endExclusiveDate)
    .order("business_date", { ascending: true });

  if (isMissingLegacyTableError(error)) return [];
  if (error) throw error;
  return (data ?? []) as LegacyDailyMetricRow[];
}

async function loadLegacyMonthlyMetrics(
  supabaseAdmin: SupabaseClient,
  startDate: string,
  endExclusiveDate: string,
) {
  const { data, error } = await supabaseAdmin
    .from("career_legacy_monthly_metrics")
    .select("snapshot_month, ordered_sku_count")
    .gte("snapshot_month", startDate)
    .lt("snapshot_month", endExclusiveDate)
    .order("snapshot_month", { ascending: true });

  if (isMissingLegacyTableError(error)) return [];
  if (error) throw error;
  return (data ?? []) as LegacyMonthlyMetricRow[];
}

function getBangkokDate(value: string): string {
  const parts = getBangkokDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function filterRowsByRange<T extends { created_at: unknown }>(
  rows: readonly T[],
  startIso: string,
  endExclusiveIso: string,
) {
  const start = new Date(startIso).getTime();
  const endExclusive = new Date(endExclusiveIso).getTime();

  return rows.filter((row) => {
    if (typeof row.created_at !== "string") return false;
    const timestamp = new Date(row.created_at).getTime();
    return (
      Number.isFinite(timestamp) && timestamp >= start && timestamp < endExclusive
    );
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return noStoreJson({ error: "Server configuration error" }, 500);
    }

    const token = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return noStoreJson({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      callerError ||
      !caller ||
      !isCareerMetricsModerator(caller.role)
    ) {
      return noStoreJson({ error: "Forbidden" }, 403);
    }

    const nowIso = new Date().toISOString();
    const nowInBangkok = getBangkokYearMonth(nowIso);
    const requestedYear = Number(
      request.nextUrl.searchParams.get("year") ?? nowInBangkok.year,
    );
    const requestedMonth = Number(
      request.nextUrl.searchParams.get("month") ?? nowInBangkok.month,
    );

    if (
      !Number.isInteger(requestedYear) ||
      requestedYear < 2000 ||
      requestedYear > 2200 ||
      !Number.isInteger(requestedMonth) ||
      requestedMonth < 1 ||
      requestedMonth > 12
    ) {
      return noStoreJson({ error: "Invalid reporting period" }, 400);
    }

    const selectedRange = getBangkokMonthRange(
      requestedYear,
      requestedMonth - 1,
    );
    const historyRange = getCareerHistoryRange(
      requestedYear,
      requestedMonth,
    );
    const [
      skuResult,
      historicalOrders,
      availablePeriods,
      historicalPaperRows,
      ordersFrom,
      paperReportsFrom,
      legacyDailyMetrics,
      legacyMonthlyMetrics,
    ] = await Promise.all([
      supabaseAdmin.from("fgcode").select("id", { count: "exact", head: true }),
      loadOrderMetricsRows(
        supabaseAdmin,
        historyRange.startIso,
        historyRange.endExclusiveIso,
      ),
      loadAvailablePeriods(supabaseAdmin),
      loadPaperWasteRows(
        supabaseAdmin,
        historyRange.startIso,
        historyRange.endExclusiveIso,
      ),
      loadEarliestCreatedAt(supabaseAdmin, "orders"),
      loadEarliestCreatedAt(supabaseAdmin, "paper_reports"),
      loadLegacyDailyMetrics(
        supabaseAdmin,
        getBangkokDate(historyRange.startIso),
        getBangkokDate(historyRange.endExclusiveIso),
      ),
      loadLegacyMonthlyMetrics(
        supabaseAdmin,
        getBangkokDate(historyRange.startIso),
        getBangkokDate(historyRange.endExclusiveIso),
      ),
    ]);

    if (skuResult.error) throw skuResult.error;

    const orders = filterRowsByRange(
      historicalOrders,
      selectedRange.startIso,
      selectedRange.endExclusiveIso,
    );
    const paperWasteRows = filterRowsByRange(
      historicalPaperRows,
      selectedRange.startIso,
      selectedRange.endExclusiveIso,
    );

    return noStoreJson({
      period: {
        year: requestedYear,
        month: requestedMonth,
        timeZone: "Asia/Bangkok",
      },
      availablePeriods,
      metrics: buildCareerMetrics(skuResult.count ?? 0, orders),
      paperWaste: calculatePaperWasteMetrics(paperWasteRows),
      history: buildCareerHistory({
        selectedYear: requestedYear,
        selectedMonth: requestedMonth,
        now: nowIso,
        ordersFrom,
        paperReportsFrom,
        orders: historicalOrders,
        paperReports: historicalPaperRows,
        legacyDailyMetrics,
        legacyMonthlyMetrics,
      }),
      unavailableMetrics: {
        activeSku:
          "Product Master has no trustworthy active or enabled field.",
        activeUsers:
          "User records have no trustworthy active status or activity timestamp.",
      },
    });
  } catch (error) {
    console.error("Career Metrics load failed:", error);
    return noStoreJson({ error: "Unable to load Career Metrics" }, 500);
  }
}
