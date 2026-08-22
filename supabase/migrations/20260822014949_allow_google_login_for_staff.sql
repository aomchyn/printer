CREATE OR REPLACE FUNCTION public.google_login_access_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

    -- Password / OTP / วิธีอื่น ใช้ระบบเดิม
    IF v_method <> 'oauth' THEN
        RETURN event;
    END IF;

    v_user_id :=
        NULLIF(event ->> 'user_id', '')::uuid;

    -- ใช้ role จาก public.users เท่านั้น
    SELECT u.role
    INTO v_role
    FROM public.users u
    WHERE u.id = v_user_id;

    -- ถ้ามี profile เดิม ต้องเป็น role ที่ระบบรองรับ
    IF FOUND
       AND v_role NOT IN (
           'user',
           'operator',
           'moderator',
           'assistant_moderator'
       )
    THEN
        RETURN jsonb_build_object(
            'error',
            jsonb_build_object(
                'http_code', 403,
                'message',
                'This account has an invalid role and cannot sign in with Google.'
            )
        );
    END IF;

    -- Google user ใหม่ หรือ role ที่ระบบรองรับ ผ่านได้
    -- function นี้ไม่เปลี่ยน role
    RETURN event;
END;
$function$;