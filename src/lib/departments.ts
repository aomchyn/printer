export type Department = {
  id: string;
  code: string;
  name: string;
  value: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
};

export function validateDepartmentCode(code: string): string | null {
  const normalized = code.trim();
  if (!/^[A-Z0-9]{2,6}$/.test(normalized)) {
    return "รหัสแผนกต้องเป็นตัวพิมพ์ใหญ่หรือตัวเลข 2-6 ตัว และห้ามมีช่องว่าง";
  }
  if (normalized.startsWith("QA")) {
    return "รหัสที่ขึ้นต้นด้วย QA เป็นรหัสสงวน";
  }
  return null;
}

export function validateDepartmentName(name: string): string | null {
  const normalized = name.trim();
  if (!normalized) return "ชื่อแผนกห้ามว่าง";
  if (Array.from(normalized).length > 60) {
    return "ชื่อแผนกต้องไม่เกิน 60 ตัวอักษร";
  }
  return null;
}

export function buildDepartmentValue(code: string, name: string): string {
  return `${code} ${name.trim()}`;
}

export function getDepartmentShortCode(value: string): string {
  return value.split(" ")[0];
}

export function getDepartmentDisplay(
  departments: Department[],
  value: string | null | undefined,
): { code: string; name: string; value: string } {
  const fallback = value ?? "";
  const department = departments.find((item) => item.value === fallback);
  if (department) {
    return {
      code: department.code,
      name: department.name,
      value: department.value,
    };
  }
  return {
    code: fallback ? getDepartmentShortCode(fallback) : "",
    name: fallback,
    value: fallback,
  };
}

type DepartmentError = {
  code?: string;
  message?: string;
};

export function mapDepartmentError(error: unknown): string {
  const candidate = error as DepartmentError | null;
  const code = candidate?.code;
  const message = candidate?.message ?? "";

  if (code === "23505") return "รหัสแผนกนี้ถูกใช้แล้ว";
  if (code === "23514") return "รหัสหรือชื่อแผนกไม่ถูกต้อง";
  if (message.includes("Invalid active department")) {
    return "แผนกนี้ถูกปิดใช้งานหรือไม่มีในระบบ";
  }
  if (
    code === "42501" ||
    /row-level security|permission denied|rls/i.test(message)
  ) {
    return "ไม่มีสิทธิ์ทำรายการนี้";
  }
  return message || "ไม่สามารถทำรายการแผนกได้";
}

/**
 * Error text for creating/updating a user. Only department-validation
 * failures get department wording; other errors keep their own meaning.
 */
export function mapUserSaveError(error: unknown): string {
  const message = (error as DepartmentError | null)?.message ?? "";

  if (
    message.includes("Invalid active department") ||
    message === "Invalid department"
  ) {
    return "แผนกนี้ถูกปิดใช้งานหรือไม่มีในระบบ";
  }
  if (message.includes("users_id_fkey")) {
    return "ไม่สามารถสร้างผู้ใช้ได้ เนื่องจากอีเมลนี้ถูกใช้งานไปแล้ว";
  }
  if (message.includes("users_name_key")) {
    return "มีชื่อผู้ใช้นี้ในระบบแล้ว";
  }
  return message || "Failed to save user";
}
