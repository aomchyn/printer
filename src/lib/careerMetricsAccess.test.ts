import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isCareerMetricsModerator,
  shouldShowCareerMetricsNavigation,
} from "./careerMetricsAccess";

describe("Career Metrics authorization", () => {
  it("allows a moderator to access Career Metrics", () => {
    expect(isCareerMetricsModerator("moderator")).toBe(true);
  });

  it("denies an assistant moderator", () => {
    expect(isCareerMetricsModerator("assistant_moderator")).toBe(false);
  });

  it("denies a normal user and an unauthenticated caller", () => {
    expect(isCareerMetricsModerator("user")).toBe(false);
    expect(isCareerMetricsModerator(undefined)).toBe(false);
  });

  it("shows Career Metrics navigation only to moderators", () => {
    expect(shouldShowCareerMetricsNavigation("moderator")).toBe(true);
    expect(shouldShowCareerMetricsNavigation("assistant_moderator")).toBe(false);
    expect(shouldShowCareerMetricsNavigation("operator")).toBe(false);
    expect(shouldShowCareerMetricsNavigation("user")).toBe(false);
  });
});

describe("Career Metrics aggregate route authorization", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@supabase/supabase-js");

    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalAnonKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    if (originalServiceKey === undefined)
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  });

  it.each(["assistant_moderator", "user"])(
    "returns 403 before historical queries for the non-moderator role %s",
    async (role) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    const userClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    };
    const roleQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { role },
        error: null,
      }),
    };
    roleQuery.select.mockReturnValue(roleQuery);
    roleQuery.eq.mockReturnValue(roleQuery);

    const adminFrom = vi.fn((table: string) => {
      if (table === "users") return roleQuery;
      throw new Error(`Unexpected query before authorization: ${table}`);
    });
    const adminClient = { from: adminFrom };
    const createClient = vi
      .fn()
      .mockReturnValueOnce(userClient)
      .mockReturnValueOnce(adminClient);

    vi.doMock("@supabase/supabase-js", () => ({ createClient }));

    const [{ NextRequest }, { GET }] = await Promise.all([
      import("next/server"),
      import("../app/api/career-metrics/route"),
    ]);
    const response = await GET(
      new NextRequest(
        "http://localhost/api/career-metrics?year=2026&month=9",
        { headers: { Authorization: "Bearer test-token" } },
      ),
    );

    expect(response.status).toBe(403);
    expect(adminFrom).toHaveBeenCalledTimes(1);
    expect(adminFrom).toHaveBeenCalledWith("users");
    expect(adminFrom).not.toHaveBeenCalledWith("orders");
    expect(adminFrom).not.toHaveBeenCalledWith("paper_reports");
    },
  );
});
