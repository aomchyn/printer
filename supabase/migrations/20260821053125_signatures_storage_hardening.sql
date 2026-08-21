-- Ensure signatures bucket exists and is private.
INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'signatures',
    'signatures',
    false,
    2097152,
    ARRAY['image/png', 'image/jpeg']::text[]
)
ON CONFLICT (id)
DO UPDATE SET
    public = false,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg']::text[];


-- Remove old/broad policies if they exist.
DROP POLICY IF EXISTS "Allow authenticated uploads 1h6xdx7_0"
ON storage.objects;

DROP POLICY IF EXISTS "Allow authenticated uploads 1h6xdx7_1"
ON storage.objects;

DROP POLICY IF EXISTS "Allow authenticated uploads 1h6xdx7_2"
ON storage.objects;

DROP POLICY IF EXISTS "Allow authenticated uploads 1h6xdx7_3"
ON storage.objects;


-- Recreate the intended hardened policies.
DROP POLICY IF EXISTS signatures_select_authenticated
ON storage.objects;

DROP POLICY IF EXISTS signatures_insert_moderator
ON storage.objects;

DROP POLICY IF EXISTS signatures_update_moderator
ON storage.objects;

DROP POLICY IF EXISTS signatures_delete_moderator
ON storage.objects;


CREATE POLICY signatures_select_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'signatures'
);


CREATE POLICY signatures_insert_moderator
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'signatures'
    AND public.is_user_moderator()
);


CREATE POLICY signatures_update_moderator
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'signatures'
    AND public.is_user_moderator()
)
WITH CHECK (
    bucket_id = 'signatures'
    AND public.is_user_moderator()
);


CREATE POLICY signatures_delete_moderator
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'signatures'
    AND public.is_user_moderator()
);