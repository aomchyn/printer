import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isCareerMetricsModerator } from "../careerMetricsAccess";
import {
  ACHIEVEMENT_STATUSES, achievementDatabaseValues, achievementResponse,
  isAchievementId, validateAchievement, type Achievement, type AchievementListItem,
} from "../careerAchievements";

const TABLE = "career_achievements";
const FIELDS = "id,title,problem,action,result,status,period_start,period_end,metric_keys,evidence_notes,portfolio_summary,created_at,updated_at";
const LIST_FIELDS = "id,title,problem,result,status,period_start,period_end,metric_keys,updated_at";
const PAGE_SIZE = 20;
const MAX_BODY_BYTES = 128 * 1024;
class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function authorizedClient(request: NextRequest): Promise<SupabaseClient> {
  const match = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) throw new RequestError(401, "Unauthorized");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new RequestError(500, "Server configuration error");
  const token = match[1];
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw new RequestError(401, "Unauthorized");
  const role = await client.from("users").select("role").eq("id", user.id).single();
  if (role.error || !isCareerMetricsModerator(role.data?.role)) throw new RequestError(403, "Forbidden");
  return client;
}

async function protect(request: NextRequest, action: (client: SupabaseClient) => Promise<NextResponse>) {
  try {
    return await action(await authorizedClient(request));
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    // PostgREST errors can contain user text in details. Never log or echo them.
    return json({ error: "ไม่สามารถดำเนินการกับบันทึกผลงานได้ กรุณาลองใหม่" }, 500);
  }
}

async function readBody(request: NextRequest): Promise<unknown> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RequestError(415, "กรุณาส่งข้อมูล JSON");
  }
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new RequestError(413, "ข้อมูลมีขนาดใหญ่เกินกำหนด");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "ข้อมูล JSON ไม่ถูกต้อง");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, "ข้อมูลมีขนาดใหญ่เกินกำหนด");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new RequestError(400, "ข้อมูล JSON ไม่ถูกต้อง"); }
}

function checkDatabaseError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new RequestError(403, "Forbidden");
  if (error.code === "42P01" || error.code === "PGRST205") {
    throw new RequestError(503, "บันทึกผลงานยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
  }
  throw new Error("Achievement database operation failed");
}
function requireId(id: string) {
  if (!isAchievementId(id)) throw new RequestError(400, "รหัสผลงานไม่ถูกต้อง");
}

export function listAchievements(request: NextRequest) {
  return protect(request, async (client) => {
    const rawPage = request.nextUrl.searchParams.get("page") ?? "1";
    if (!/^[1-9]\d{0,5}$/.test(rawPage)) throw new RequestError(400, "หน้ารายการไม่ถูกต้อง");
    const page = Number(rawPage);
    const start = (page - 1) * PAGE_SIZE;
    const [rows, ...counts] = await Promise.all([
      client.from(TABLE).select(LIST_FIELDS, { count: "exact" })
        .order("updated_at", { ascending: false }).order("id", { ascending: false })
        .range(start, start + PAGE_SIZE - 1),
      ...ACHIEVEMENT_STATUSES.map((status) => client.from(TABLE)
        .select("id", { head: true, count: "exact" }).eq("status", status)),
    ]);
    checkDatabaseError(rows.error);
    counts.forEach((count) => checkDatabaseError(count.error));
    const items: AchievementListItem[] = (rows.data ?? []).map((row) => ({
      id: row.id, title: row.title, status: row.status,
      period_start: row.period_start?.slice(0, 7) ?? null,
      period_end: row.period_end?.slice(0, 7) ?? null,
      metric_keys: row.metric_keys, updated_at: row.updated_at,
      problem_preview: Array.from(row.problem as string).slice(0, 180).join(""),
      result_preview: Array.from(row.result as string).slice(0, 180).join(""),
    }));
    return json({ items, page, pageSize: PAGE_SIZE, total: rows.count ?? 0,
      summary: Object.fromEntries(ACHIEVEMENT_STATUSES.map((status, i) => [status, counts[i].count ?? 0])),
    });
  });
}

export function createAchievement(request: NextRequest) {
  return protect(request, async (client) => {
    const validated = validateAchievement(await readBody(request));
    if (!validated.valid) return json({ error: "กรุณาตรวจสอบข้อมูล", errors: validated.errors }, 400);
    const { data, error } = await client.from(TABLE).insert(achievementDatabaseValues(validated.data)).select(FIELDS).single();
    checkDatabaseError(error);
    return json({ achievement: achievementResponse(data as Achievement) }, 201);
  });
}

export type AchievementRouteContext = { params: Promise<{ id: string }> };
export function getAchievement(request: NextRequest, context: AchievementRouteContext) {
  return protect(request, async (client) => {
    const { id } = await context.params;
    requireId(id);
    const { data, error } = await client.from(TABLE).select(FIELDS).eq("id", id).maybeSingle();
    checkDatabaseError(error);
    if (!data) throw new RequestError(404, "ไม่พบผลงาน");
    return json({ achievement: achievementResponse(data as Achievement) });
  });
}
export function updateAchievement(request: NextRequest, context: AchievementRouteContext) {
  return protect(request, async (client) => {
    const { id } = await context.params;
    requireId(id);
    const body = await readBody(request);
    const current = await client.from(TABLE).select(FIELDS).eq("id", id).maybeSingle();
    checkDatabaseError(current.error);
    if (!current.data) throw new RequestError(404, "ไม่พบผลงาน");
    const validated = validateAchievement(body, achievementResponse(current.data as Achievement));
    if (!validated.valid) return json({ error: "กรุณาตรวจสอบข้อมูล", errors: validated.errors }, 400);
    const { data, error } = await client.from(TABLE).update(achievementDatabaseValues(validated.data))
      .eq("id", id).select(FIELDS).maybeSingle();
    checkDatabaseError(error);
    if (!data) throw new RequestError(404, "ไม่พบผลงาน");
    return json({ achievement: achievementResponse(data as Achievement) });
  });
}
export function deleteAchievement(request: NextRequest, context: AchievementRouteContext) {
  return protect(request, async (client) => {
    const { id } = await context.params;
    requireId(id);
    const { data, error } = await client.from(TABLE).delete().eq("id", id).select("id").maybeSingle();
    checkDatabaseError(error);
    if (!data) throw new RequestError(404, "ไม่พบผลงาน");
    return json({ success: true });
  });
}
