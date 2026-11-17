import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261116000000_add_departments_table.sql",
  "utf8",
).replace(/--[^\n]*/g, "");

function protectDepartmentFieldsBody(): string {
  const match = sql.match(
    /create or replace function public\.protect_department_fields\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$/,
  );
  expect(match).not.toBeNull();
  return match![1];
}

// Static checks only; live behaviour is covered by supabase/tests/departments.sql.
describe("departments migration: creator delete cleanup", () => {
  it("keeps created_by as an ON DELETE SET NULL reference to users", () => {
    expect(sql).toContain(
      "created_by uuid references public.users(id) on delete set null",
    );
  });

  it("lets the FK set-null cleanup through before the created_by guard", () => {
    const body = protectDepartmentFieldsBody();
    const cleanup = body.indexOf(
      "and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by')",
    );
    const guard = body.indexOf("Department created_by cannot be changed");
    expect(cleanup).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(cleanup);
    expect(body).toContain("old.created_by is not null");
    expect(body).toContain("new.created_by is null");
    expect(body).toMatch(
      /not exists \(\s*select 1\s*from public\.users u\s*where u\.id = old\.created_by\s*\)/,
    );
  });
});
