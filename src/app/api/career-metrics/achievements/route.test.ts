import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { emptyAchievement } from "../../../../lib/careerAchievements";

const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const valid = { ...emptyAchievement(), title: "จริง", problem: "บริบท", action: "ทำเอง", result: "ผลจริง", period_start: "2026-08", period_end: "2026-09" };
const stored = { ...valid, period_start: "2026-08-01", period_end: "2026-09-01", id, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z", created_by: "PRIVATE_CREATOR" };
let role = "moderator";
let authenticated = true;
let dbError: { code: string; message: string; details: string } | null = null;
let missing = false;
let events: string[] = [];
let queryCalls: { table: string; method: string; args: unknown[] }[] = [];
let writes: unknown[] = [];
const createClient = vi.fn();
type Result = { data: unknown; count: number | null; error: unknown };

function from(table: string) {
  events.push(table);
  let operation = "select";
  let single = false;
  let head = false;
  const result = (): Result => table === "users"
    ? { data: { role }, count: null, error: null }
    : { data: missing ? null : head ? null : single ? stored : [stored], count: head ? 8 : 24, error: dbError };
  const query = {
    select: (...args: unknown[]) => { queryCalls.push({ table, method: "select", args }); head = Boolean((args[1] as { head?: boolean } | undefined)?.head); return query; },
    eq: (...args: unknown[]) => { queryCalls.push({ table, method: "eq", args }); return query; },
    order: (...args: unknown[]) => { queryCalls.push({ table, method: "order", args }); return query; },
    range: (...args: unknown[]) => { queryCalls.push({ table, method: "range", args }); return query; },
    single: () => { single = true; return query; },
    maybeSingle: () => { single = true; return query; },
    insert: (value: unknown) => { operation = "insert"; writes.push(value); events.push(operation); return query; },
    update: (value: unknown) => { operation = "update"; writes.push(value); events.push(operation); return query; },
    delete: () => { operation = "delete"; events.push(operation); return query; },
    then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(result).then(resolve, reject),
  };
  return query;
}

beforeEach(() => {
  role = "moderator"; authenticated = true; dbError = null; missing = false; events = []; queryCalls = []; writes = [];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
  createClient.mockReset().mockReturnValue({ from, auth: { getUser: vi.fn(async () => {
    events.push("auth.getUser");
    return { data: { user: authenticated ? { id: "verified-caller" } : null }, error: authenticated ? null : new Error("invalid") };
  }) } });
  vi.doMock("@supabase/supabase-js", () => ({ createClient }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock("@supabase/supabase-js"); vi.restoreAllMocks(); });

const operations = ["list", "create", "detail", "update", "delete"] as const;
type Operation = (typeof operations)[number];
async function call(operation: Operation, body: unknown = valid, token: string | null = "valid-token", routeId = id, suffix = "") {
  const collection = await import("./route");
  const item = await import("./[id]/route");
  const method = { list: "GET", create: "POST", detail: "GET", update: "PATCH", delete: "DELETE" }[operation];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new NextRequest(`http://localhost/api/career-metrics/achievements${suffix}`, {
    method, headers, ...(method === "POST" || method === "PATCH" ? { body: JSON.stringify(body) } : {}),
  });
  const context = { params: Promise.resolve({ id: routeId }) };
  switch (operation) {
    case "list": return collection.GET(request);
    case "create": return collection.POST(request);
    case "detail": return item.GET(request, context);
    case "update": return item.PATCH(request, context);
    case "delete": return item.DELETE(request, context);
  }
}

describe("Achievement routes: authorization before every SELECT/INSERT/UPDATE/DELETE", () => {
  it.each(operations)("allows moderator %s with caller-token RLS and private caching", async (operation) => {
    const response = await call(operation);
    expect(response.status).toBe(operation === "create" ? 201 : 200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(events.slice(0, 3)).toEqual(["auth.getUser", "users", "career_achievements"]);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "public-anon-key", expect.objectContaining({
      global: { headers: { Authorization: "Bearer valid-token" } },
    }));
    const text = await response.text();
    expect(text).not.toContain("PRIVATE_CREATOR");
    expect(text).not.toContain('"created_by"');
    for (const write of writes) {
      for (const system of ["id", "created_by", "created_at", "updated_at"]) expect(write).not.toHaveProperty(system);
      expect(write).toMatchObject({ period_start: "2026-08-01", period_end: "2026-09-01" });
    }
  });
  for (const deniedRole of ["assistant_moderator", "operator", "user", "other"]) {
    it.each(operations)(`denies ${deniedRole} %s before achievement access`, async (operation) => {
      role = deniedRole;
      expect((await call(operation)).status).toBe(403);
      expect(events).toEqual(["auth.getUser", "users"]);
      expect(writes).toEqual([]);
    });
  }
  it.each(operations)("denies missing/invalid authentication for %s without queries", async (operation) => {
    expect((await call(operation, valid, null)).status).toBe(401);
    expect(events).toEqual([]);
    authenticated = false;
    expect((await call(operation)).status).toBe(401);
    expect(events).toEqual(["auth.getUser"]);
  });
});

describe("Achievement route validation and privacy", () => {
  it.each(["create", "update"] as const)("rejects spoofed/unknown fields for %s without writing", async (operation) => {
    for (const key of ["created_by", "created_at", "updated_at", "id", "unknown"]) {
      expect((await call(operation, { ...valid, [key]: "PRIVATE_TEXT" })).status).toBe(400);
    }
    expect(writes).toEqual([]);
  });
  it("validates partial update against existing month bounds", async () => {
    const response = await call("update", { period_end: "2026-07" });
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("errors.period_end");
    expect(events).not.toContain("update");
    expect((await call("update", { result: "ผลใหม่" })).status).toBe(200);
    expect(writes[0]).toMatchObject({ result: "ผลใหม่", period_start: "2026-08-01", action: valid.action });
  });
  it.each(["detail", "update", "delete"] as const)("rejects invalid UUID for %s before achievement query", async (operation) => {
    expect((await call(operation, valid, "token", "bad-id")).status).toBe(400);
    expect(events).not.toContain("career_achievements");
  });
  it("bounds pagination at 20 rows and orders by updated_at then id", async () => {
    const response = await call("list", undefined, "token", id, "?page=2");
    const body = await response.json();
    expect(body).toMatchObject({ page: 2, pageSize: 20, total: 24, summary: { draft: 8, implemented: 8, portfolio_ready: 8 } });
    expect(queryCalls.filter((c) => c.method === "range").map((c) => c.args)).toEqual([[20, 39]]);
    expect(queryCalls.filter((c) => c.method === "order").map((c) => c.args)).toEqual([["updated_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(body.items[0]).not.toHaveProperty("action");
    expect(body.items[0]).not.toHaveProperty("evidence_notes");
    expect((await call("list", undefined, "token", id, "?page=-1")).status).toBe(400);
  });
  it.each(["detail", "update", "delete"] as const)("returns 404 for absent %s records", async (operation) => {
    missing = true; expect((await call(operation)).status).toBe(404);
  });
  it.each(operations)("never logs or returns raw achievement text on %s errors", async (operation) => {
    dbError = { code: "XX000", message: "PRIVATE_TEXT", details: "SECRET_ACHIEVEMENT" };
    const log = vi.spyOn(console, "error"); const warn = vi.spyOn(console, "warn");
    const response = await call(operation);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("PRIVATE_TEXT"); expect(text).not.toContain("SECRET_ACHIEVEMENT");
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
  });
  it("returns a safe unavailable state before migration and fails closed on RLS denial", async () => {
    dbError = { code: "PGRST205", message: "private", details: "private" };
    expect((await call("list")).status).toBe(503);
    dbError.code = "42501";
    expect((await call("create")).status).toBe(403);
  });
  it("rejects malformed/oversized JSON, including bodies without Content-Length", async () => {
    const { POST } = await import("./route");
    for (const [body, expected] of [["{broken", 400], [JSON.stringify({ title: "x".repeat(128 * 1024) }), 413]] as const) {
      const response = await POST(new NextRequest("http://localhost/api/career-metrics/achievements", {
        method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" }, body,
      }));
      expect(response.status).toBe(expected);
    }
    expect(writes).toEqual([]);
  });
});
