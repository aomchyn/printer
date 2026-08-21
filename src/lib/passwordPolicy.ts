export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_POLICY_MESSAGE =
  "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร และประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ";

export function validatePassword(password: string) {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("ตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("ตัวพิมพ์เล็กอย่างน้อย 1 ตัว");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("ตัวเลขอย่างน้อย 1 ตัว");
  }

  if (!/[^A-Za-z0-9\s]/.test(password)) {
    errors.push("อักขระพิเศษอย่างน้อย 1 ตัว");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}