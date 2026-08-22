-- ============================================================
-- USER DELETE FK CLEANUP
-- ============================================================


-- ============================================================
-- 1. QA reviewer ต้องไม่ขวางการลบ user
-- ============================================================

ALTER TABLE public.qa_department_requests
DROP CONSTRAINT IF EXISTS qa_department_requests_reviewed_by_fkey;

ALTER TABLE public.qa_department_requests
ADD CONSTRAINT qa_department_requests_reviewed_by_fkey
FOREIGN KEY (reviewed_by)
REFERENCES public.users(id)
ON DELETE SET NULL;


-- ============================================================
-- 2. PAPER TRANSACTIONS
-- อนุญาต FK ON DELETE SET NULL เฉพาะตอน auth user ถูกลบจริง
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_paper_transaction_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_name text;
BEGIN

    -- FK cleanup จาก auth.users ON DELETE SET NULL
    IF TG_OP = 'UPDATE'
       AND OLD.user_id IS NOT NULL
       AND NEW.user_id IS NULL
       AND (to_jsonb(NEW) - 'user_id')
           = (to_jsonb(OLD) - 'user_id')
       AND NOT EXISTS (
           SELECT 1
           FROM auth.users au
           WHERE au.id = OLD.user_id
       )
    THEN
        RETURN NEW;
    END IF;


    IF auth.role() <> 'authenticated' THEN
        RETURN NEW;
    END IF;


    SELECT u.name
    INTO v_name
    FROM public.users u
    WHERE u.id = auth.uid();


    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;


    IF NEW.qty IS NULL OR NEW.qty <= 0 THEN
        RAISE EXCEPTION
            'Paper transaction quantity must be greater than 0';
    END IF;


    IF NEW.transaction_type = 'IN'
       AND NEW.transaction_category IS NOT NULL THEN

        RAISE EXCEPTION
            'IN transaction cannot have transaction_category';

    END IF;


    -- ========================================================
    -- INSERT
    -- ========================================================

    IF TG_OP = 'INSERT' THEN

        NEW.user_id := auth.uid();
        NEW.created_by := v_name;

        NEW.created_at := now();

        NEW.date :=
            (now() AT TIME ZONE 'Asia/Bangkok')::date;

        RETURN NEW;

    END IF;


    -- ========================================================
    -- UPDATE
    -- ========================================================

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION
            'Paper transaction ID cannot be changed';
    END IF;


    IF NEW.transaction_type
       IS DISTINCT FROM OLD.transaction_type THEN

        RAISE EXCEPTION
            'transaction_type cannot be changed';

    END IF;


    IF NEW.reference_id
       IS DISTINCT FROM OLD.reference_id THEN

        RAISE EXCEPTION
            'reference_id cannot be changed';

    END IF;


    IF NEW.user_id
       IS DISTINCT FROM OLD.user_id THEN

        RAISE EXCEPTION
            'user_id cannot be changed';

    END IF;


    IF NEW.created_by
       IS DISTINCT FROM OLD.created_by THEN

        RAISE EXCEPTION
            'created_by cannot be changed';

    END IF;


    IF NEW.created_at
       IS DISTINCT FROM OLD.created_at THEN

        RAISE EXCEPTION
            'created_at cannot be changed';

    END IF;


    IF NEW.date
       IS DISTINCT FROM OLD.date THEN

        RAISE EXCEPTION
            'transaction date cannot be changed';

    END IF;


    RETURN NEW;
END;
$function$;


-- ============================================================
-- 3. ORDERS
-- อนุญาต FK cleanup ของ *_by_user_id -> NULL เท่านั้น
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_orders_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_is_manager boolean := false;
    v_name text;
    v_employee_id text;
    v_editor text;
    v_cancelling boolean := false;
    v_restoring boolean := false;
BEGIN

    IF current_setting(
        'app.order_internal_write',
        true
    ) = 'on' THEN
        RETURN NEW;
    END IF;


    -- =====================================================
    -- FK CLEANUP
    -- =====================================================

    IF TG_OP = 'UPDATE'

       AND (
            NEW.created_by_user_id
                IS DISTINCT FROM OLD.created_by_user_id
         OR NEW.printed_by_user_id
                IS DISTINCT FROM OLD.printed_by_user_id
         OR NEW.updated_by_user_id
                IS DISTINCT FROM OLD.updated_by_user_id
         OR NEW.verified_by_user_id
                IS DISTINCT FROM OLD.verified_by_user_id
       )

       AND (
            to_jsonb(NEW)
            - ARRAY[
                'created_by_user_id',
                'printed_by_user_id',
                'updated_by_user_id',
                'verified_by_user_id'
            ]
       )
       =
       (
            to_jsonb(OLD)
            - ARRAY[
                'created_by_user_id',
                'printed_by_user_id',
                'updated_by_user_id',
                'verified_by_user_id'
            ]
       )

       AND (
            NEW.created_by_user_id
                IS NOT DISTINCT FROM OLD.created_by_user_id
            OR (
                OLD.created_by_user_id IS NOT NULL
                AND NEW.created_by_user_id IS NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = OLD.created_by_user_id
                )
            )
       )

       AND (
            NEW.printed_by_user_id
                IS NOT DISTINCT FROM OLD.printed_by_user_id
            OR (
                OLD.printed_by_user_id IS NOT NULL
                AND NEW.printed_by_user_id IS NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = OLD.printed_by_user_id
                )
            )
       )

       AND (
            NEW.updated_by_user_id
                IS NOT DISTINCT FROM OLD.updated_by_user_id
            OR (
                OLD.updated_by_user_id IS NOT NULL
                AND NEW.updated_by_user_id IS NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = OLD.updated_by_user_id
                )
            )
       )

       AND (
            NEW.verified_by_user_id
                IS NOT DISTINCT FROM OLD.verified_by_user_id
            OR (
                OLD.verified_by_user_id IS NOT NULL
                AND NEW.verified_by_user_id IS NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.users u
                    WHERE u.id = OLD.verified_by_user_id
                )
            )
       )

    THEN
        RETURN NEW;
    END IF;


    IF auth.role() <> 'authenticated' THEN
        RETURN NEW;
    END IF;


    v_is_manager := public.is_user_manager();


    SELECT
        u.name,
        u.employee_id
    INTO
        v_name,
        v_employee_id
    FROM public.users u
    WHERE u.id = auth.uid();


    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;


    v_editor :=
        CASE
            WHEN v_employee_id IS NOT NULL
                 AND btrim(v_employee_id) <> ''
            THEN v_name || ' (' || v_employee_id || ')'
            ELSE v_name
        END;


    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Order ID cannot be changed';
    END IF;

    IF NEW.created_by_user_id
       IS DISTINCT FROM OLD.created_by_user_id THEN
        RAISE EXCEPTION 'Order creator cannot be changed';
    END IF;

    IF NEW.created_by
       IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Order creator cannot be changed';
    END IF;

    IF NEW.created_by_department
       IS DISTINCT FROM OLD.created_by_department THEN
        RAISE EXCEPTION
            'Order creator department cannot be changed';
    END IF;

    IF NEW.created_at
       IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'created_at cannot be changed';
    END IF;


    v_cancelling :=
        COALESCE(NEW.is_cancelled, false)
        AND NOT COALESCE(OLD.is_cancelled, false);

    v_restoring :=
        NOT COALESCE(NEW.is_cancelled, false)
        AND COALESCE(OLD.is_cancelled, false);


    IF NOT v_is_manager THEN

        IF OLD.created_by_user_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION
                'You can only update your own order';
        END IF;

        IF OLD.is_verified = true THEN
            RAISE EXCEPTION
                'Verified order cannot be edited';
        END IF;

        IF COALESCE(OLD.is_cancelled, false) = true THEN
            RAISE EXCEPTION
                'Cancelled order cannot be edited';
        END IF;

        IF COALESCE(OLD.is_deleted, false) = true THEN
            RAISE EXCEPTION
                'Deleted order cannot be edited';
        END IF;


        IF (
            to_jsonb(NEW)
            - ARRAY[
                'order_type',
                'lot_number',
                'quantity',
                'production_date',
                'expiry_date',
                'notes',
                'is_cancelled',
                'is_printed',
                'updated_at',
                'updated_by',
                'edit_summary'
            ]
        )
        IS DISTINCT FROM
        (
            to_jsonb(OLD)
            - ARRAY[
                'order_type',
                'lot_number',
                'quantity',
                'production_date',
                'expiry_date',
                'notes',
                'is_cancelled',
                'is_printed',
                'updated_at',
                'updated_by',
                'edit_summary'
            ]
        ) THEN
            RAISE EXCEPTION
                'You are not allowed to change protected order fields';
        END IF;


        IF NEW.is_cancelled IS DISTINCT FROM OLD.is_cancelled
           AND NOT v_cancelling THEN
            RAISE EXCEPTION
                'Only Moderator can restore an order';
        END IF;


        IF NEW.is_printed IS DISTINCT FROM OLD.is_printed
           AND NOT v_cancelling THEN
            RAISE EXCEPTION
                'Print status can only be changed by Moderator';
        END IF;


        NEW.updated_at := now();
        NEW.updated_by := v_editor;
        NEW.updated_by_user_id := auth.uid();

    END IF;


    IF v_cancelling THEN

        IF OLD.is_verified = true THEN
            RAISE EXCEPTION
                'Verified order must be unverified before cancellation';
        END IF;

        NEW.is_verified := false;
        NEW.verified_by := NULL;
        NEW.verified_by_user_id := NULL;
        NEW.verified_at := NULL;

        NEW.is_printed := false;
        NEW.printed_by := NULL;
        NEW.printed_by_user_id := NULL;
        NEW.printed_at := NULL;

        NEW.is_no_file := false;
        NEW.no_file_at := NULL;

    END IF;


    IF v_restoring THEN

        IF NOT v_is_manager THEN
            RAISE EXCEPTION
                'Only Moderator can restore orders';
        END IF;

        NEW.is_verified := false;
        NEW.verified_by := NULL;
        NEW.verified_by_user_id := NULL;
        NEW.verified_at := NULL;

        NEW.is_printed := false;
        NEW.printed_by := NULL;
        NEW.printed_by_user_id := NULL;
        NEW.printed_at := NULL;

        NEW.is_no_file := false;
        NEW.no_file_at := NULL;

    END IF;


    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN

        IF NOT v_is_manager THEN
            RAISE EXCEPTION
                'Only Moderator can verify orders';
        END IF;


        IF NEW.is_verified = true THEN

            IF COALESCE(OLD.is_cancelled, false) = true THEN
                RAISE EXCEPTION
                    'Cancelled order cannot be verified';
            END IF;

            NEW.verified_by := v_editor;
            NEW.verified_by_user_id := auth.uid();
            NEW.verified_at := now();

        ELSE

            IF OLD.verified_by_user_id
               IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION
                    'Only the original verifier can unverify this order';
            END IF;

            NEW.verified_by := NULL;
            NEW.verified_by_user_id := NULL;
            NEW.verified_at := NULL;

        END IF;

    ELSE

        IF NEW.verified_by
              IS DISTINCT FROM OLD.verified_by
           OR NEW.verified_by_user_id
              IS DISTINCT FROM OLD.verified_by_user_id
           OR NEW.verified_at
              IS DISTINCT FROM OLD.verified_at THEN

            RAISE EXCEPTION
                'Verification metadata cannot be changed directly';

        END IF;

    END IF;


    IF NEW.is_printed IS DISTINCT FROM OLD.is_printed THEN

        IF v_cancelling THEN

            NEW.is_printed := false;
            NEW.printed_by := NULL;
            NEW.printed_by_user_id := NULL;
            NEW.printed_at := NULL;

        ELSE

            IF NOT v_is_manager THEN
                RAISE EXCEPTION
                    'Only Moderator can change print status';
            END IF;


            IF COALESCE(NEW.is_printed, false) = true THEN

                IF OLD.is_verified = true
                   OR COALESCE(OLD.is_cancelled, false) = true THEN
                    RAISE EXCEPTION
                        'This order cannot be marked as printed';
                END IF;

                NEW.printed_by := v_editor;
                NEW.printed_by_user_id := auth.uid();
                NEW.printed_at := now();

            ELSE

                IF OLD.printed_by_user_id
                   IS DISTINCT FROM auth.uid() THEN
                    RAISE EXCEPTION
                        'Only the original printer can undo printing';
                END IF;

                NEW.printed_by := NULL;
                NEW.printed_by_user_id := NULL;
                NEW.printed_at := NULL;

            END IF;

        END IF;

    ELSE

        IF NEW.printed_by
              IS DISTINCT FROM OLD.printed_by
           OR NEW.printed_by_user_id
              IS DISTINCT FROM OLD.printed_by_user_id
           OR NEW.printed_at
              IS DISTINCT FROM OLD.printed_at THEN

            RAISE EXCEPTION
                'Print metadata cannot be changed directly';

        END IF;

    END IF;


    IF NEW.is_no_file IS DISTINCT FROM OLD.is_no_file THEN

        IF NOT v_is_manager AND NOT v_cancelling THEN
            RAISE EXCEPTION
                'Only Moderator can change no-file status';
        END IF;

        IF COALESCE(NEW.is_no_file, false) = true THEN
            NEW.no_file_at := now();
        ELSE
            NEW.no_file_at := NULL;
        END IF;

    ELSE

        IF NEW.no_file_at
           IS DISTINCT FROM OLD.no_file_at THEN
            RAISE EXCEPTION
                'no_file_at cannot be changed directly';
        END IF;

    END IF;


    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN

        IF NOT v_is_manager THEN
            RAISE EXCEPTION
                'Only Moderator can delete orders';
        END IF;

        IF COALESCE(NEW.is_deleted, false) = true THEN

            NEW.deleted_at := now();
            NEW.deleted_by := v_editor;

        ELSE

            NEW.deleted_at := NULL;
            NEW.deleted_by := NULL;

        END IF;

    ELSE

        IF NEW.deleted_at
              IS DISTINCT FROM OLD.deleted_at
           OR NEW.deleted_by
              IS DISTINCT FROM OLD.deleted_by THEN

            RAISE EXCEPTION
                'Delete metadata cannot be changed directly';

        END IF;

    END IF;


    RETURN NEW;
END;
$function$;