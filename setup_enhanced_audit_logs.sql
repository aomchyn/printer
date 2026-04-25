-- =============================================================================
-- แก้ไขปัญหา: ตาราง audit_logs มีอยู่แล้ว แต่ไม่มีคอลัมน์ order_id 
-- จึงต้องใช้ ALTER TABLE เพื่อเพิ่มคอลัมน์เข้าไปแทนการ CREATE TABLE ใหม่
-- =============================================================================

-- 1. เพิ่มคอลัมน์ที่จำเป็นเข้าไปในตารางเดิมที่มีอยู่แล้ว
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS order_id BIGINT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS changes JSONB;

-- 2. สร้าง Index เพื่อให้ค้นหาดึงประวัติได้เร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_audit_logs_order_id ON public.audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- สำเร็จ! นำโค้ดนี้ไปรันได้เลย
