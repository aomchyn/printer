-- =========================================================
-- Google user department onboarding
-- =========================================================

CREATE TABLE public.qa_department_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by uuid REFERENCES public.users(id),
    CONSTRAINT qa_department_requests_one_pending
        EXCLUDE USING btree (
            user_id WITH =
        )
        WHERE (status = 'pending')
);

ALTER TABLE public.qa_department_requests
ENABLE ROW LEVEL SECURITY;


-- user ดู request ของตัวเอง
CREATE POLICY qa_requests_select_own
ON public.qa_department_requests
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR public.is_user_moderator()
);


-- ห้าม client INSERT / UPDATE / DELETE ตรง ๆ
REVOKE INSERT, UPDATE, DELETE
ON public.qa_department_requests
FROM authenticated;

GRANT SELECT
ON public.qa_department_requests
TO authenticated;


-- =========================================================
-- Helper: account นี้มี Google identity หรือไม่
-- ไม่เปิดให้ client เรียกตรง
-- =========================================================

CREATE OR REPLACE FUNCTION public.is_current_user_google_account()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM auth.identities i
        WHERE i.user_id = auth.uid()
          AND i.provider = 'google'
    );
$$;

REVOKE ALL
ON FUNCTION public.is_current_user_google_account()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.is_current_user_google_account()
TO postgres, service_role;


-- =========================================================
-- ปรับ protection:
-- user ยังเปลี่ยน department ตรง ๆ ไม่ได้
-- ยกเว้น trusted RPC เปิด flag ภายใน transaction
-- =========================================================

CREATE OR REPLACE FUNCTION public.protect_users_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_manager boolean := false;
    v_department_internal boolean := false;
BEGIN
    IF auth.role() = 'authenticated' THEN

        v_is_manager := public.is_user_manager();

        v_department_internal :=
            COALESCE(
                current_setting(
                    'app.user_department_internal',
                    true
                ),
                'off'
            ) = 'on';

        -- INSERT
        IF TG_OP = 'INSERT' THEN

            IF NOT v_is_manager THEN

                IF NEW.id IS DISTINCT FROM auth.uid() THEN
                    RAISE EXCEPTION
                        'You can only create your own profile';
                END IF;

                NEW.role := 'user';
                NEW.department := NULL;

            END IF;

            RETURN NEW;
        END IF;

        -- UPDATE
        IF TG_OP = 'UPDATE' THEN

            IF NEW.id IS DISTINCT FROM OLD.id THEN
                RAISE EXCEPTION
                    'User ID cannot be changed';
            END IF;

            IF NOT v_is_manager THEN

                IF OLD.id IS DISTINCT FROM auth.uid() THEN
                    RAISE EXCEPTION
                        'You can only update your own profile';
                END IF;

                IF NEW.role IS DISTINCT FROM OLD.role THEN
                    RAISE EXCEPTION
                        'Role can only be changed by moderator';
                END IF;

                IF NEW.department IS DISTINCT FROM OLD.department
                   AND NOT v_department_internal
                THEN
                    RAISE EXCEPTION
                        'Department can only be changed through trusted workflow';
                END IF;

            END IF;

            RETURN NEW;
        END IF;

    END IF;

    RETURN NEW;
END;
$$;


-- =========================================================
-- เลือกแผนกทั่วไป
-- เลือกได้เฉพาะ Google user + role=user + department ยัง NULL
-- QA ห้ามผ่าน RPC นี้
-- =========================================================

CREATE OR REPLACE FUNCTION public.choose_google_department(
    p_department text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_department text;
BEGIN
    IF COALESCE(auth.role(), '') <> 'authenticated'
       OR auth.uid() IS NULL
    THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_current_user_google_account() THEN
        RAISE EXCEPTION 'Google account required';
    END IF;

    SELECT role, department
    INTO v_role, v_department
    FROM public.users
    WHERE id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;

    IF v_role <> 'user' THEN
        RAISE EXCEPTION 'Only user accounts can choose a department';
    END IF;

    IF v_department IS NOT NULL THEN
        RAISE EXCEPTION 'Department has already been selected';
    END IF;

    IF p_department NOT IN (
        'PD ฝ่ายผลิต',
        'WH คลังสินค้า',
        'VD ผลิตยาสัตว์'
    ) THEN
        RAISE EXCEPTION 'Invalid department';
    END IF;

    PERFORM set_config(
        'app.user_department_internal',
        'on',
        true
    );

    UPDATE public.users
    SET department = p_department
    WHERE id = auth.uid();
END;
$$;

REVOKE ALL
ON FUNCTION public.choose_google_department(text)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.choose_google_department(text)
TO authenticated;


-- =========================================================
-- ขอเข้า QA
-- ยังไม่เปลี่ยน users.department
-- =========================================================

CREATE OR REPLACE FUNCTION public.request_google_qa_department()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_department text;
    v_request_id uuid;
BEGIN
    IF COALESCE(auth.role(), '') <> 'authenticated'
       OR auth.uid() IS NULL
    THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_current_user_google_account() THEN
        RAISE EXCEPTION 'Google account required';
    END IF;

    SELECT role, department
    INTO v_role, v_department
    FROM public.users
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;

    IF v_role <> 'user' THEN
        RAISE EXCEPTION 'Only user accounts can request QA';
    END IF;

    IF v_department IS NOT NULL THEN
        RAISE EXCEPTION 'Department has already been selected';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.qa_department_requests
        WHERE user_id = auth.uid()
          AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'QA request is already pending';
    END IF;

    INSERT INTO public.qa_department_requests (
        user_id
    )
    VALUES (
        auth.uid()
    )
    RETURNING id INTO v_request_id;

    RETURN v_request_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.request_google_qa_department()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.request_google_qa_department()
TO authenticated;


-- =========================================================
-- Moderator approve/reject QA
-- assistant_moderator ไม่มีสิทธิ
-- =========================================================

CREATE OR REPLACE FUNCTION public.review_qa_department_request(
    p_request_id uuid,
    p_approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    IF COALESCE(auth.role(), '') <> 'authenticated'
       OR auth.uid() IS NULL
    THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_user_moderator() THEN
        RAISE EXCEPTION 'Moderator required';
    END IF;

    SELECT user_id
    INTO v_user_id
    FROM public.qa_department_requests
    WHERE id = p_request_id
      AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending request not found';
    END IF;

    IF p_approve THEN

        PERFORM set_config(
            'app.user_department_internal',
            'on',
            true
        );

        UPDATE public.users
        SET department = 'QA ประกันคุณภาพ'
        WHERE id = v_user_id
          AND role = 'user'
          AND department IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'User is no longer eligible for QA approval';
        END IF;

        UPDATE public.qa_department_requests
        SET
            status = 'approved',
            reviewed_at = now(),
            reviewed_by = auth.uid()
        WHERE id = p_request_id;

    ELSE

        UPDATE public.qa_department_requests
        SET
            status = 'rejected',
            reviewed_at = now(),
            reviewed_by = auth.uid()
        WHERE id = p_request_id;

    END IF;
END;
$$;

REVOKE ALL
ON FUNCTION public.review_qa_department_request(uuid, boolean)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.review_qa_department_request(uuid, boolean)
TO authenticated;