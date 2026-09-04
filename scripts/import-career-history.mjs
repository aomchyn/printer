import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const MAIN_SHEET = "รายการคำสั่งพิมพ์";
const CANCELLED_SHEET = "คำสั่งที่ยกเลิก";
const REQUIRED_HEADERS = [
  "ลำดับ",
  "วันที่สั่ง",
  "เวลาสั่ง",
  "ประเภทคำสั่ง",
  "เลขลอต",
  "รหัสสินค้า",
  "จำนวน",
];

const TARGETS = {
  may: {
    year: 2026,
    month: 5,
    label: "May 2026",
    nonCancelledOrders: 477,
    cancelledOrders: 3,
    totalOrders: 480,
    printingQuantity: 50_623,
    activeOrderDays: 25,
    orderedSku: 205,
  },
  june: {
    year: 2026,
    month: 6,
    label: "June 2026",
    nonCancelledOrders: 467,
    cancelledOrders: 1,
    totalOrders: 468,
    printingQuantity: 50_597,
    activeOrderDays: 25,
    orderedSku: 205,
  },
  july: {
    year: 2026,
    month: 7,
    label: "July 2026",
    nonCancelledOrders: 369,
    cancelledOrders: 4,
    totalOrders: 373,
    printingQuantity: 48_539,
    activeOrderDays: 24,
    orderedSku: 174,
  },
  august: {
    year: 2026,
    month: 8,
    label: "August 2026 legacy",
    nonCancelledOrders: 128,
    cancelledOrders: 0,
    totalOrders: 128,
    printingQuantity: 16_016,
    activeOrderDays: 8,
    orderedSku: 95,
  },
};

const THAI_DIGITS = new Map(
  Array.from("๐๑๒๓๔๕๖๗๘๙", (digit, index) => [digit, String(index)]),
);

function normalizeThaiDigits(value) {
  return String(value).replace(/[๐-๙]/g, (digit) => THAI_DIGITS.get(digit));
}

function unwrapCellValue(value) {
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    "result" in value
  ) {
    return value.result;
  }
  return value;
}

function excelSerialToDateParts(serial) {
  const milliseconds = Math.round((serial - 25_569) * 86_400_000);
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid Excel date");
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function assertCalendarDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${day}/${month}/${year}`);
  }
}

export function parseOrderDate(value) {
  const unwrapped = unwrapCellValue(value);
  let parts;

  if (unwrapped instanceof Date) {
    parts = {
      year: unwrapped.getUTCFullYear(),
      month: unwrapped.getUTCMonth() + 1,
      day: unwrapped.getUTCDate(),
    };
  } else if (typeof unwrapped === "number") {
    parts = excelSerialToDateParts(unwrapped);
  } else if (typeof unwrapped === "string") {
    const normalized = normalizeThaiDigits(unwrapped).trim();
    const thaiMatch = normalized.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (thaiMatch) {
      parts = {
        year: Number(thaiMatch[3]),
        month: Number(thaiMatch[2]),
        day: Number(thaiMatch[1]),
      };
    } else if (isoMatch) {
      parts = {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      };
    } else {
      throw new Error(`Unsupported order date: ${normalized || "<empty>"}`);
    }
  } else {
    throw new Error("Order date is missing or unsupported");
  }

  if (parts.year >= 2_400) parts.year -= 543;
  assertCalendarDate(parts.year, parts.month, parts.day);

  return {
    ...parts,
    businessDate: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
  };
}

export function parseOrderTime(value) {
  const unwrapped = unwrapCellValue(value);
  let hour;
  let minute;
  let second = 0;

  if (unwrapped instanceof Date) {
    hour = unwrapped.getUTCHours();
    minute = unwrapped.getUTCMinutes();
    second = unwrapped.getUTCSeconds();
  } else if (typeof unwrapped === "number") {
    const seconds = Math.round((unwrapped % 1) * 86_400);
    hour = Math.floor(seconds / 3_600) % 24;
    minute = Math.floor((seconds % 3_600) / 60);
    second = seconds % 60;
  } else if (typeof unwrapped === "string") {
    const normalized = normalizeThaiDigits(unwrapped)
      .replace(/\s*น\.?\s*$/u, "")
      .trim();
    const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) throw new Error(`Unsupported order time: ${normalized || "<empty>"}`);
    hour = Number(match[1]);
    minute = Number(match[2]);
    second = Number(match[3] ?? 0);
  } else {
    throw new Error("Order time is missing or unsupported");
  }

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new Error("Invalid order time");
  }

  return { hour, minute, second };
}

function parsePositiveInteger(value, field) {
  const unwrapped = unwrapCellValue(value);
  const normalized =
    typeof unwrapped === "string"
      ? normalizeThaiDigits(unwrapped).replace(/,/g, "").trim()
      : unwrapped;
  const number = Number(normalized);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return number;
}

function cellText(value) {
  const unwrapped = unwrapCellValue(value);
  if (unwrapped == null) return "";
  if (typeof unwrapped === "object" && "richText" in unwrapped) {
    return unwrapped.richText.map((part) => part.text).join("").trim();
  }
  return normalizeThaiDigits(unwrapped).trim();
}

function getHeaderMap(worksheet) {
  const headers = new Map();
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    const header = cellText(cell.value);
    if (header) headers.set(header, column);
  });
  return headers;
}

function requireHeaders(worksheet, required = REQUIRED_HEADERS) {
  const headers = getHeaderMap(worksheet);
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length > 0) {
    throw new Error(
      `Worksheet ${worksheet.name} is missing headers: ${missing.join(", ")}`,
    );
  }
  return headers;
}

function rowValue(row, headers, header) {
  return row.getCell(headers.get(header)).value;
}

function parseWorksheetOrders(worksheet, year, month, allowSummaryRow) {
  const headers = requireHeaders(worksheet);
  const orders = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const sequenceText = cellText(rowValue(row, headers, "ลำดับ"));
    const dateText = cellText(rowValue(row, headers, "วันที่สั่ง"));
    if (!sequenceText && !dateText) continue;
    if (allowSummaryRow && !sequenceText && dateText.startsWith("รวมทั้งหมด")) {
      continue;
    }

    try {
      parsePositiveInteger(sequenceText, "ลำดับ");
      const date = parseOrderDate(rowValue(row, headers, "วันที่สั่ง"));
      const time = parseOrderTime(rowValue(row, headers, "เวลาสั่ง"));
      if (date.year !== year || date.month !== month) {
        throw new Error(
          `row belongs to ${date.year}-${String(date.month).padStart(2, "0")}`,
        );
      }
      const quantity = parsePositiveInteger(
        rowValue(row, headers, "จำนวน"),
        "จำนวน",
      );
      const productId = cellText(rowValue(row, headers, "รหัสสินค้า"));
      if (!productId) throw new Error("รหัสสินค้า is empty");
      const orderType = cellText(rowValue(row, headers, "ประเภทคำสั่ง"));
      const lot = cellText(rowValue(row, headers, "เลขลอต"));
      const timestamp = Date.UTC(
        date.year,
        date.month - 1,
        date.day,
        time.hour - 7,
        time.minute,
        time.second,
      );
      const matchKey = JSON.stringify([
        date.businessDate,
        time.hour,
        time.minute,
        time.second,
        orderType,
        lot,
        productId,
        quantity,
      ]);

      orders.push({
        businessDate: date.businessDate,
        timestamp,
        quantity,
        productId,
        matchKey,
      });
    } catch (error) {
      throw new Error(
        `${worksheet.name} row ${rowNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return orders;
}

function reconcileCancellations(allOrders, cancelledOrders) {
  const available = new Map();
  allOrders.forEach((order) =>
    available.set(order.matchKey, (available.get(order.matchKey) ?? 0) + 1),
  );

  cancelledOrders.forEach((order) => {
    const count = available.get(order.matchKey) ?? 0;
    if (count <= 0) {
      throw new Error("A cancelled order could not be reconciled with the main sheet");
    }
    available.set(order.matchKey, count - 1);
  });
}

export async function parseStatisticsWorkbookBuffer(
  buffer,
  { year, month },
) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const main = workbook.getWorksheet(MAIN_SHEET);
  const cancelled = workbook.getWorksheet(CANCELLED_SHEET);
  if (!main) throw new Error(`Missing worksheet: ${MAIN_SHEET}`);
  if (!cancelled) throw new Error(`Missing worksheet: ${CANCELLED_SHEET}`);

  const allOrders = parseWorksheetOrders(main, year, month, false);
  const cancelledOrders = parseWorksheetOrders(cancelled, year, month, true);
  reconcileCancellations(allOrders, cancelledOrders);

  const cancelledByDate = new Map();
  cancelledOrders.forEach((order) =>
    cancelledByDate.set(
      order.businessDate,
      (cancelledByDate.get(order.businessDate) ?? 0) + 1,
    ),
  );
  const daily = new Map();
  allOrders.forEach((order) => {
    const entry = daily.get(order.businessDate) ?? {
      businessDate: order.businessDate,
      totalOrders: 0,
      printingQuantity: 0,
    };
    entry.totalOrders += 1;
    entry.printingQuantity += order.quantity;
    daily.set(order.businessDate, entry);
  });

  const dailyMetrics = Array.from(daily.values())
    .map((entry) => {
      const cancelledOrdersForDay = cancelledByDate.get(entry.businessDate) ?? 0;
      return {
        businessDate: entry.businessDate,
        nonCancelledOrders: entry.totalOrders - cancelledOrdersForDay,
        cancelledOrders: cancelledOrdersForDay,
        totalOrders: entry.totalOrders,
        printingQuantity: entry.printingQuantity,
      };
    })
    .sort((first, second) =>
      first.businessDate.localeCompare(second.businessDate),
    );
  const nonCancelledOrders =
    allOrders.length - cancelledOrders.length;

  return {
    dailyMetrics,
    nonCancelledOrders,
    cancelledOrders: cancelledOrders.length,
    totalOrders: allOrders.length,
    printingQuantity: allOrders.reduce(
      (sum, order) => sum + order.quantity,
      0,
    ),
    activeOrderDays: dailyMetrics.filter(
      (day) => day.nonCancelledOrders > 0,
    ).length,
    orderedSku: new Set(allOrders.map((order) => order.productId)).size,
    productIds: new Set(allOrders.map((order) => order.productId)),
    minTimestamp: Math.min(...allOrders.map((order) => order.timestamp)),
    maxTimestamp: Math.max(...allOrders.map((order) => order.timestamp)),
  };
}

export function validateParsedMetrics(parsed, target) {
  const fields = [
    "nonCancelledOrders",
    "cancelledOrders",
    "totalOrders",
    "printingQuantity",
    "activeOrderDays",
    "orderedSku",
  ];
  const mismatches = fields.filter((field) => parsed[field] !== target[field]);
  if (mismatches.length > 0) {
    throw new Error(
      `${target.label} validation failed: ${mismatches
        .map((field) => `${field} expected ${target[field]}, got ${parsed[field]}`)
        .join("; ")}`,
    );
  }
}

function aggregateCurrentAugust(orders) {
  const days = new Map();
  orders.forEach((order) => {
    const date = new Date(order.created_at);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const mapped = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
    );
    const businessDate = `${mapped.year}-${mapped.month}-${mapped.day}`;
    const entry = days.get(businessDate) ?? {
      businessDate,
      nonCancelledOrders: 0,
      cancelledOrders: 0,
      totalOrders: 0,
      printingQuantity: 0,
    };
    entry.totalOrders += 1;
    if (order.is_cancelled) entry.cancelledOrders += 1;
    else entry.nonCancelledOrders += 1;
    entry.printingQuantity += order.quantity || 0;
    days.set(businessDate, entry);
  });
  return Array.from(days.values());
}

export function mergeAugustMetrics(legacy, currentOrders) {
  const currentDays = aggregateCurrentAugust(currentOrders);
  const days = new Map();
  [...legacy.dailyMetrics, ...currentDays].forEach((day) => {
    const entry = days.get(day.businessDate) ?? {
      businessDate: day.businessDate,
      nonCancelledOrders: 0,
      cancelledOrders: 0,
      totalOrders: 0,
      printingQuantity: 0,
    };
    entry.nonCancelledOrders += day.nonCancelledOrders;
    entry.cancelledOrders += day.cancelledOrders;
    entry.totalOrders += day.totalOrders;
    entry.printingQuantity += day.printingQuantity;
    days.set(day.businessDate, entry);
  });
  const mergedDays = Array.from(days.values());
  const currentProductIds = currentOrders
    .map((order) => (typeof order.product_id === "string" ? order.product_id.trim() : ""))
    .filter(Boolean);
  const orderedSku = new Set([...legacy.productIds, ...currentProductIds]).size;

  return {
    totalOrders: mergedDays.reduce((sum, day) => sum + day.totalOrders, 0),
    printingQuantity: mergedDays.reduce(
      (sum, day) => sum + day.printingQuantity,
      0,
    ),
    activeOrderDays: mergedDays.filter((day) => day.nonCancelledOrders > 0).length,
    orderedSku,
  };
}

export async function writeLegacyMetrics({
  mode,
  supabase,
  parsedFiles,
  augustMergedOrderedSku,
}) {
  if (mode !== "execute") return { wrote: false };

  const dailyRows = parsedFiles.flatMap(({ parsed, hash }) =>
    parsed.dailyMetrics.map((day) => ({
      business_date: day.businessDate,
      non_cancelled_orders: day.nonCancelledOrders,
      cancelled_orders: day.cancelledOrders,
      printing_quantity: day.printingQuantity,
      source: "printer_statistics_excel",
      archive_sha256: hash,
    })),
  );
  const monthlyRows = parsedFiles.map(({ key, parsed, hash, target }) => ({
    snapshot_month: `${target.year}-${String(target.month).padStart(2, "0")}-01`,
    ordered_sku_count:
      key === "august" ? augustMergedOrderedSku : parsed.orderedSku,
    source:
      key === "august"
        ? "printer_statistics_excel+supabase_orders"
        : "printer_statistics_excel",
    archive_sha256: hash,
  }));

  const dailyResult = await supabase
    .from("career_legacy_daily_metrics")
    .upsert(dailyRows, { onConflict: "business_date" });
  if (dailyResult.error) throw dailyResult.error;
  const monthlyResult = await supabase
    .from("career_legacy_monthly_metrics")
    .upsert(monthlyRows, { onConflict: "snapshot_month" });
  if (monthlyResult.error) throw monthlyResult.error;

  return { wrote: true, dailyRows: dailyRows.length, monthlyRows: monthlyRows.length };
}

function parseArguments(argv) {
  const values = new Map();
  argv.forEach((argument, index) => {
    if (argument.startsWith("--")) values.set(argument, argv[index + 1]);
  });
  const dryRun = argv.includes("--dry-run");
  const execute = argv.includes("--execute");
  if (dryRun === execute) {
    throw new Error("Specify exactly one of --dry-run or --execute");
  }
  const files = Object.fromEntries(
    Object.keys(TARGETS).map((key) => {
      const value = values.get(`--${key}`);
      if (!value || value.startsWith("--")) throw new Error(`Missing --${key} path`);
      return [key, value];
    }),
  );
  return { mode: execute ? "execute" : "dry-run", files };
}

async function loadLocalEnvironment() {
  try {
    const content = await readFile(".env.local", "utf8");
    content.split(/\r?\n/).forEach((line) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) return;
      const separator = line.indexOf("=");
      const key = line.slice(0, separator);
      if (process.env[key] !== undefined) return;
      process.env[key] = line
        .slice(separator + 1)
        .replace(/^['"]|['"]$/g, "");
    });
  } catch {
    // Environment variables may already be supplied by the caller.
  }
}

async function loadCurrentAugustOrders(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase
      .from("orders")
      .select("created_at, quantity, is_cancelled, product_id")
      .gte("created_at", "2026-07-31T17:00:00.000Z")
      .lt("created_at", "2026-08-31T17:00:00.000Z")
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1_000) break;
  }
  return rows;
}

function formatBangkokTimestamp(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

async function main() {
  const { mode, files } = parseArguments(process.argv.slice(2));
  const parsedFiles = [];

  for (const [key, target] of Object.entries(TARGETS)) {
    const buffer = await readFile(files[key]);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const parsed = await parseStatisticsWorkbookBuffer(buffer, target);
    validateParsedMetrics(parsed, target);
    parsedFiles.push({ key, target, parsed, hash });
  }

  await loadLocalEnvironment();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin configuration is required for August reconciliation");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const currentAugust = await loadCurrentAugustOrders(supabase);
  const august = parsedFiles.find((file) => file.key === "august");
  const currentMinTimestamp = Math.min(
    ...currentAugust.map((order) => new Date(order.created_at).getTime()),
  );
  if (!Number.isFinite(currentMinTimestamp)) {
    throw new Error("Current August orders are unavailable");
  }
  if (august.parsed.maxTimestamp >= currentMinTimestamp) {
    throw new Error("Legacy and current August timestamps overlap");
  }

  const currentAugustQuantity = currentAugust.reduce(
    (sum, order) => sum + (order.quantity || 0),
    0,
  );
  if (currentAugust.length !== 417 || currentAugustQuantity !== 38_195) {
    throw new Error(
      `Current August validation failed: expected 417 orders / 38195 quantity, got ${currentAugust.length} / ${currentAugustQuantity}`,
    );
  }
  const mergedAugust = mergeAugustMetrics(august.parsed, currentAugust);
  if (
    mergedAugust.totalOrders !== 545 ||
    mergedAugust.printingQuantity !== 54_211
  ) {
    throw new Error(
      `Merged August validation failed: expected 545 orders / 54211 quantity, got ${mergedAugust.totalOrders} / ${mergedAugust.printingQuantity}`,
    );
  }

  parsedFiles.forEach(({ target, parsed, hash }) => {
    console.log(`\n${target.label}`);
    console.log(`non-cancelled: ${parsed.nonCancelledOrders}`);
    console.log(`cancelled: ${parsed.cancelledOrders}`);
    console.log(`total: ${parsed.totalOrders}`);
    console.log(`quantity: ${parsed.printingQuantity}`);
    console.log(`active days: ${parsed.activeOrderDays}`);
    console.log(`ordered SKU: ${parsed.orderedSku}`);
    console.log(`SHA-256: ${hash}`);
    console.log("validation: PASS");
  });

  const currentDistinctSku = new Set(
    currentAugust
      .map((order) =>
        typeof order.product_id === "string" ? order.product_id.trim() : "",
      )
      .filter(Boolean),
  ).size;
  console.log("\nAugust 2026 current DB");
  console.log(`first timestamp: ${formatBangkokTimestamp(currentMinTimestamp)}`);
  console.log(`orders: ${currentAugust.length}`);
  console.log(`quantity: ${currentAugustQuantity}`);
  console.log(`distinct SKU: ${currentDistinctSku}`);
  console.log("\nAugust 2026 merged");
  console.log(`total orders: ${mergedAugust.totalOrders}`);
  console.log(`quantity: ${mergedAugust.printingQuantity}`);
  console.log(`active days: ${mergedAugust.activeOrderDays}`);
  console.log(`ordered SKU: ${mergedAugust.orderedSku}`);
  console.log(`legacy max timestamp: ${formatBangkokTimestamp(august.parsed.maxTimestamp)}`);
  console.log(`current DB min timestamp: ${formatBangkokTimestamp(currentMinTimestamp)}`);
  console.log(`source gap: ${formatDuration(currentMinTimestamp - august.parsed.maxTimestamp)}`);

  const writeResult = await writeLegacyMetrics({
    mode,
    supabase,
    parsedFiles,
    augustMergedOrderedSku: mergedAugust.orderedSku,
  });
  console.log(
    mode === "dry-run"
      ? "\nDRY RUN: no database writes performed"
      : `\nIMPORT COMPLETE: ${writeResult.dailyRows} daily rows and ${writeResult.monthlyRows} monthly rows upserted`,
  );
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(`IMPORT FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
