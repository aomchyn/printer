import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_METRIC_KEYS } from "./careerAchievements";

const sql = readFileSync("supabase/migrations/20260904000000_add_career_achievements.sql", "utf8").replace(/--[^\n]*/g, "");
describe("Achievement migration security (static checks, not a live RLS test)", () => {
  it("enables RLS with four explicit exact-moderator policies", () => {
    expect(sql).toMatch(/ALTER TABLE public.career_achievements ENABLE ROW LEVEL SECURITY/);
    for (const command of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(sql).toMatch(new RegExp(`CREATE POLICY career_achievements_${command.toLowerCase()}_moderator\\s+ON public.career_achievements FOR ${command} TO authenticated`));
    }
    expect(sql.match(/public\.is_user_moderator\(\)/g)).toHaveLength(5);
    expect(sql).toContain("WITH CHECK (public.is_user_moderator() AND created_by = auth.uid())");
    expect(sql).not.toContain("assistant_moderator");
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public.is_user_moderator/);
  });
  it("revokes defaults and grants writes only on the ten editable columns", () => {
    expect(sql).toContain("REVOKE ALL ON TABLE public.career_achievements FROM PUBLIC, anon, authenticated, service_role");
    expect(sql).toContain("GRANT SELECT, DELETE ON TABLE public.career_achievements TO authenticated");
    for (const operation of ["INSERT", "UPDATE"]) {
      const match = sql.match(new RegExp(`GRANT ${operation} \\(([^)]+)\\)\\s+ON TABLE public.career_achievements TO authenticated`));
      expect(match).not.toBeNull();
      expect(match![1].split(",").map((value) => value.trim())).toEqual(["title", "problem", "action", "result", "status", "period_start", "period_end", "metric_keys", "evidence_notes", "portfolio_summary"]);
    }
    expect(sql).not.toMatch(/GRANT[^;]*TO (anon|PUBLIC|service_role)/);
  });
  it("uses default caller provenance, immutable timestamps via grants, and an invoker update trigger", () => {
    expect(sql).toContain("created_by uuid NOT NULL DEFAULT auth.uid()");
    expect(sql).toContain("created_at timestamptz NOT NULL DEFAULT now()");
    expect(sql).toContain("updated_at timestamptz NOT NULL DEFAULT now()");
    expect(sql).toContain("NEW.updated_at := now()");
    expect(sql).toContain("BEFORE UPDATE ON public.career_achievements");
    expect(sql).toContain("SECURITY INVOKER SET search_path TO ''");
    expect(sql).not.toContain("SECURITY DEFINER");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public.set_career_achievement_updated_at\(\)\s+FROM PUBLIC, anon, authenticated, service_role/);
  });
  it("enforces month precision and ordered bounds", () => {
    expect(sql).toContain("EXTRACT(DAY FROM period_start) = 1");
    expect(sql).toContain("EXTRACT(DAY FROM period_end) = 1");
    expect(sql).toContain("period_start IS NULL OR period_end IS NULL OR period_end >= period_start");
  });
  it("enforces status and metric allowlists without database uniqueness machinery", () => {
    expect(sql).toContain("status IN ('draft', 'implemented', 'portfolio_ready')");
    const keys = sql.match(/metric_keys <@ ARRAY\[([\s\S]*?)\]::text\[\]/)![1].match(/'[^']+'/g)!.map((key) => key.slice(1, -1));
    expect(keys).toEqual(ACHIEVEMENT_METRIC_KEYS);
    expect(sql).toContain("array_position(metric_keys, NULL) IS NULL");
    expect(sql).not.toMatch(/\bUNIQUE\b/i);
  });
});
