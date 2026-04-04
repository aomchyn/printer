-- ============================================================
-- เพิ่มคอลัมน์ image_url ในตาราง orders
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- 1. เพิ่มคอลัมน์ image_url
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. สร้าง Storage Bucket สำหรับเก็บรูปภาพฉลาก
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-images', 'order-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Policy: ทุกคนที่ล็อกอินสามารถอัปโหลดรูปได้
CREATE POLICY "Authenticated users can upload order images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'order-images' AND auth.role() = 'authenticated'
);

-- 4. Policy: ทุกคนอ่านรูปได้ (public bucket)
CREATE POLICY "Public can view order images"
ON storage.objects FOR SELECT
USING (bucket_id = 'order-images');

-- 5. Policy: Admin สามารถลบรูปได้
CREATE POLICY "Admins can delete order images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'order-images' AND
    auth.uid() IN (
        SELECT id FROM public.users WHERE role IN ('moderator', 'assistant_moderator')
    )
);
