-- เพิ่มสถานะ is_printed เพื่อรองรับสถานะ "พิมพ์ฉลากแล้ว รอตัดชิ้นงาน"
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false;
