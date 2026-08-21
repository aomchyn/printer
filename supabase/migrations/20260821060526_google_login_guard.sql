CREATE OR REPLACE FUNCTION public.google_login_access_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_method text;
    v_user_id uuid;
    v_role text;
BEGIN
    v_method :=
        trim(
            both '"'
            from COALESCE(
                event ->> 'authentication_method',
                ''
            )
        );

    -- Password / OTP / วิธีอื่น ใช้ระบบเดิมตามปกติ
    IF v_method <> 'oauth' THEN
        RETURN event;
    END IF;

    v_user_id :=
        NULLIF(event ->> 'user_id', '')::uuid;

    -- เช็กว่าบัญชีนี้มี profile เดิมหรือไม่
    SELECT u.role
    INTO v_role
    FROM public.users u
    WHERE u.id = v_user_id;

    -- ถ้ามีบัญชีเดิมที่เป็น staff/manager
    -- ห้ามเข้าสู่ระบบผ่าน Google
    IF FOUND
       AND COALESCE(v_role, 'user') <> 'user'
    THEN
        RETURN jsonb_build_object(
            'error',
            jsonb_build_object(
                'http_code', 403,
                'message',
                'Google sign-in is available for user accounts only. Staff must use email and password.'
            )
        );
    END IF;

    -- Google user ใหม่ หรือบัญชี role=user
    RETURN event;
END;
$$;

REVOKE ALL
ON FUNCTION public.google_login_access_hook(jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.google_login_access_hook(jsonb)
TO supabase_auth_admin;