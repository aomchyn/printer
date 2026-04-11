-- 1. ลบข้อจำกัดและเพิ่มใหม่ให้ public.users ลบตาม auth.users 
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. เปลี่ยนข้อจำกัดเรื่อง Audit Logs ให้บันทึกไม่หายไปแม้ผู้ใช้ถูกลบ (เซ็ตเป็น NULL แทน)
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
