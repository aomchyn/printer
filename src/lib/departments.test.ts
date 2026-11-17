import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDepartmentValue,
  getDepartmentDisplay,
  getDepartmentShortCode,
  mapDepartmentError,
  mapUserSaveError,
  validateDepartmentCode,
  validateDepartmentName,
  type Department,
} from "./departments";

const departments: Department[] = [
  {
    id: "1",
    code: "PD",
    name: "ฝ่ายผลิต",
    value: "PD ฝ่ายผลิต",
    is_active: true,
    is_system: false,
    sort_order: 1,
  },
  {
    id: "2",
    code: "OLD",
    name: "ชื่อเดิม",
    value: "OLD ชื่อเดิม",
    is_active: false,
    is_system: false,
    sort_order: 2,
  },
];

describe("department utilities", () => {
  it("validates department codes", () => {
    expect(validateDepartmentCode("PD")).toBeNull();
    expect(validateDepartmentCode("ABC123")).toBeNull();
    expect(validateDepartmentCode("pd")).not.toBeNull();
    expect(validateDepartmentCode("P D")).not.toBeNull();
    expect(validateDepartmentCode("A")).not.toBeNull();
    expect(validateDepartmentCode("TOOLONG")).not.toBeNull();
    expect(validateDepartmentCode("QAX")).toContain("สงวน");
  });

  it("validates names and builds historical values", () => {
    expect(validateDepartmentName("")).not.toBeNull();
    expect(validateDepartmentName("   ")).not.toBeNull();
    expect(validateDepartmentName("ก".repeat(61))).not.toBeNull();
    expect(validateDepartmentName(" ฝ่ายใหม่ ")).toBeNull();
    expect(buildDepartmentValue("NX", " ฝ่ายใหม่ ")).toBe("NX ฝ่ายใหม่");
  });

  it("preserves the existing short-code behavior", () => {
    expect(getDepartmentShortCode("PD ฝ่ายผลิต")).toBe("PD");
  });

  it("displays active, inactive, and unknown values without throwing", () => {
    expect(getDepartmentDisplay(departments, "PD ฝ่ายผลิต")).toEqual({
      code: "PD",
      name: "ฝ่ายผลิต",
      value: "PD ฝ่ายผลิต",
    });
    expect(getDepartmentDisplay(departments, "OLD ชื่อเดิม").name).toBe(
      "ชื่อเดิม",
    );
    expect(getDepartmentDisplay(departments, "LEGACY หน่วยงาน").name).toBe(
      "LEGACY หน่วยงาน",
    );
    expect(getDepartmentDisplay(departments, null).value).toBe("");
    expect(getDepartmentDisplay(departments, "").code).toBe("");
  });

  it("maps database errors to Thai messages", () => {
    expect(mapDepartmentError({ code: "23505" })).toBe(
      "รหัสแผนกนี้ถูกใช้แล้ว",
    );
    expect(mapDepartmentError({ code: "23514" })).toBe(
      "รหัสหรือชื่อแผนกไม่ถูกต้อง",
    );
    expect(mapDepartmentError({ message: "Invalid active department" })).toBe(
      "แผนกนี้ถูกปิดใช้งานหรือไม่มีในระบบ",
    );
    expect(mapDepartmentError({ code: "42501" })).toBe(
      "ไม่มีสิทธิ์ทำรายการนี้",
    );
  });
});

describe("mapUserSaveError", () => {
  it("maps department validation failures from the DB trigger and the API", () => {
    expect(
      mapUserSaveError({ message: "Invalid active department" }),
    ).toBe("แผนกนี้ถูกปิดใช้งานหรือไม่มีในระบบ");
    expect(mapUserSaveError(new Error("Invalid department"))).toBe(
      "แผนกนี้ถูกปิดใช้งานหรือไม่มีในระบบ",
    );
  });

  it("keeps the duplicate-email message for users_id_fkey", () => {
    expect(
      mapUserSaveError(
        new Error(
          'insert or update on table "users" violates foreign key constraint "users_id_fkey"',
        ),
      ),
    ).toBe("ไม่สามารถสร้างผู้ใช้ได้ เนื่องจากอีเมลนี้ถูกใช้งานไปแล้ว");
  });

  it("does not describe user unique violations as department errors", () => {
    const duplicateName = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "users_name_key"',
    };
    expect(mapUserSaveError(duplicateName)).toBe("มีชื่อผู้ใช้นี้ในระบบแล้ว");
    expect(mapUserSaveError({ code: "23505", message: "other dup" })).toBe(
      "other dup",
    );
    expect(mapUserSaveError({ code: "23514", message: "check failed" })).toBe(
      "check failed",
    );
  });

  it("passes through other messages and falls back when empty", () => {
    expect(mapUserSaveError(new Error("Session expired"))).toBe(
      "Session expired",
    );
    expect(mapUserSaveError({})).toBe("Failed to save user");
    expect(mapUserSaveError(null)).toBe("Failed to save user");
  });

  it("is what the user management page uses for save errors", () => {
    const page = readFileSync("src/app/printer/user/page.tsx", "utf8");
    expect(page.match(/text: mapUserSaveError\(error\)/g)).toHaveLength(2);
    expect(page).not.toContain("mapDepartmentError");
  });
});
