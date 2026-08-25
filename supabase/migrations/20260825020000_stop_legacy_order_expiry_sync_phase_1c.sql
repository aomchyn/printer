-- Phase 1C: keep legacy Product name sync while preserving Order snapshots.
-- Requires Phase 1A and Phase 1B to have run first.

CREATE OR REPLACE FUNCTION public.sync_orders_from_fgcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_editor text;
    v_summary text;
    v_previous_internal_flag text;
BEGIN
    IF NEW.name IS NOT DISTINCT FROM OLD.name THEN
        RETURN NEW;
    END IF;

    SELECT
        CASE
            WHEN u.employee_id IS NOT NULL
                 AND btrim(u.employee_id) <> ''
            THEN u.name || ' (' || u.employee_id || ')'
            ELSE u.name
        END
    INTO v_editor
    FROM public.users u
    WHERE u.id = auth.uid();

    v_editor := COALESCE(v_editor, 'System');
    v_summary := format(
        'ชื่อสินค้าเปลี่ยน: %s ➡️ %s',
        OLD.name,
        NEW.name
    );

    v_previous_internal_flag := current_setting(
        'app.order_internal_write',
        true
    );

    PERFORM set_config(
        'app.order_internal_write',
        'on',
        true
    );

    UPDATE public.orders o
    SET
        previous_product_name = o.product_name,
        product_name = NEW.name,
        updated_at = now(),
        updated_by = v_editor,
        edit_summary = v_summary
    WHERE o.product_id = NEW.id
      AND o.is_verified = false
      AND COALESCE(o.is_cancelled, false) = false;

    PERFORM set_config(
        'app.order_internal_write',
        COALESCE(v_previous_internal_flag, ''),
        true
    );

    RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS trg_sync_orders_from_fgcode
ON public.fgcode;

CREATE TRIGGER trg_sync_orders_from_fgcode
AFTER UPDATE OF name ON public.fgcode
FOR EACH ROW
EXECUTE FUNCTION public.sync_orders_from_fgcode();


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

    -- Product replacement is not a supported Order workflow. Keep this check
    -- before the internal-write bypass so no internal path can change it.
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
        RAISE EXCEPTION 'Order product cannot be changed';
    END IF;

    -- These snapshots are historical data. Check them before the legacy
    -- internal-write bypass because that path has no valid reason to alter them.
    IF TG_OP = 'UPDATE'
       AND (
            NEW.expiry_offset_days_used
                IS DISTINCT FROM OLD.expiry_offset_days_used
            OR NEW.printing_config_used
                IS DISTINCT FROM OLD.printing_config_used
       ) THEN
        RAISE EXCEPTION
            'Order product configuration snapshots cannot be changed';
    END IF;

    -- The shelf-life snapshot is immutable for every normal and internal path.
    IF NEW.product_exp IS DISTINCT FROM OLD.product_exp THEN
        RAISE EXCEPTION
            'Order product shelf-life snapshot cannot be changed';
    END IF;

    -- Phase 1C: internal writes remain only for legacy Product name sync.
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
