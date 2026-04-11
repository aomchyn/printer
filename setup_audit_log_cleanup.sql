-- เปิดใช้งาน Extension pg_cron (ถ้ายังไม่เปิด)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ยกเลิก Job เดิม (ถ้ามี) เพื่อเขียนทับใหม่
SELECT cron.unschedule('delete_old_audit_logs');

-- สร้าง Job ให้ทำงานทุกวันเที่ยงคืน (00:00) 
-- เพื่อลบ Audit Logs ที่มีอายุมากกว่า 7 วัน
SELECT cron.schedule(
  'delete_old_audit_logs',  -- ชื่อ Job
  '0 0 * * *',             -- รันทุกวัน เวลา 00:00 น.
  $$ DELETE FROM public.audit_logs WHERE created_at < NOW() - INTERVAL '7 days'; $$
);

-- =========================================================================
-- หมายเหตุ: หากต้องการจะ "ลบประวัติทั้งหมดแบบเกลี้ยงตารางทุกสัปดาห์" 
-- (เช่น ลบทุกคืนวันอาทิตย์) ให้ใช้คำสั่งด้านล่างนี้แทน (นำเครื่องหมาย -- ออก)
-- =========================================================================
-- SELECT cron.schedule(
--   'delete_all_audit_logs_weekly',  
--   '0 0 * * 0',  -- รันทุกวันอาทิตย์ เวลา 00:00 น.           
--   $$ DELETE FROM public.audit_logs; $$
-- );
