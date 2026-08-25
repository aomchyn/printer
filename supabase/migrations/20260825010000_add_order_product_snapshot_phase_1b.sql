-- Phase 1B: authoritative Product -> Order snapshots on INSERT.
-- This migration intentionally does not change Product -> Order legacy sync,
-- audit behavior, Product ID rename behavior, frontend behavior, or Stability.

CREATE OR REPLACE FUNCTION public.parse_product_exp_months(
    p_exp text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_exp text := btrim(COALESCE(p_exp, ''));
BEGIN
    -- Accept only a positive base-10 integer that is safe to cast to integer.
    IF v_exp !~ '^[1-9][0-9]*$'
       OR char_length(v_exp) > 10
       OR (
            char_length(v_exp) = 10
            AND v_exp > '2147483647'
       ) THEN
        RAISE EXCEPTION
            'Product shelf life must be a positive integer number of months'
            USING ERRCODE = '22023';
    END IF;

    RETURN v_exp::integer;
END;
$function$;


CREATE OR REPLACE FUNCTION public.validate_printing_date_format_spec_v1(
    p_format jsonb,
    p_field_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    IF p_format IS NULL
       OR jsonb_typeof(p_format) <> 'object' THEN
        RAISE EXCEPTION
            '% must be a DateFormatSpec object',
            p_field_name
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_format) AS format_key(key_name)
        WHERE key_name NOT IN ('pattern', 'calendar', 'monthCase')
    ) THEN
        RAISE EXCEPTION
            '% contains unsupported DateFormatSpec keys',
            p_field_name
            USING ERRCODE = '22023';
    END IF;

    IF NOT (p_format ?& ARRAY['pattern', 'calendar'])
       OR jsonb_typeof(p_format -> 'pattern') <> 'string'
       OR jsonb_typeof(p_format -> 'calendar') <> 'string' THEN
        RAISE EXCEPTION
            '% must include string pattern and calendar values',
            p_field_name
            USING ERRCODE = '22023';
    END IF;

    IF p_format ->> 'pattern' NOT IN (
        'DD/MM/YYYY',
        'DD/MM/YY',
        'YYYY/MM/DD',
        'YYYY/M/D',
        'YYYY-MM-DD',
        'YYYYMMDD',
        'DD-MM-YYYY',
        'DD.MM.YYYY',
        'MM/YY',
        'MM YYYY',
        'MMM YYYY',
        'MMMM YYYY',
        'DD MMM,YYYY',
        'DD MMM.,YYYY',
        'DD,MMM.,YYYY',
        'MMM,DD,YYYY'
    ) THEN
        RAISE EXCEPTION
            '% has an unsupported date pattern',
            p_field_name
            USING ERRCODE = '22023';
    END IF;

    IF p_format ->> 'calendar' NOT IN ('gregorian', 'buddhist') THEN
        RAISE EXCEPTION
            '% has an unsupported calendar',
            p_field_name
            USING ERRCODE = '22023';
    END IF;

    IF p_format ? 'monthCase'
       AND (
            jsonb_typeof(p_format -> 'monthCase') <> 'string'
            OR p_format ->> 'monthCase' NOT IN ('upper', 'title')
       ) THEN
        RAISE EXCEPTION
            '% has an unsupported monthCase',
            p_field_name
            USING ERRCODE = '22023';
    END IF;
END;
$function$;


CREATE OR REPLACE FUNCTION public.validate_printing_config_v1(
    p_config jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_template text;
    v_template_without_allowed_placeholders text;
    v_exp_offset text;
BEGIN
    -- A missing printing configuration is an intentional valid state.
    IF p_config IS NULL THEN
        RETURN;
    END IF;

    IF jsonb_typeof(p_config) <> 'object' THEN
        RAISE EXCEPTION
            'printing_config must be an object or null'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_config) AS config_key(key_name)
        WHERE key_name NOT IN (
            'version',
            'preset',
            'template',
            'mfg_format',
            'exp_format',
            'exp_offset_days'
        )
    ) THEN
        RAISE EXCEPTION
            'printing_config contains unsupported V1 keys'
            USING ERRCODE = '22023';
    END IF;

    IF NOT (
        p_config ?& ARRAY[
            'version',
            'preset',
            'template',
            'mfg_format',
            'exp_format',
            'exp_offset_days'
        ]
    ) THEN
        RAISE EXCEPTION
            'printing_config is missing required V1 keys'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_config -> 'version') <> 'number'
       OR p_config ->> 'version' <> '1' THEN
        RAISE EXCEPTION
            'printing_config.version must be numeric 1'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_config -> 'preset') <> 'string'
       OR p_config ->> 'preset' NOT IN (
            'date_only',
            'date_and_lot',
            'mfg_exp',
            'mfg_exp_lot',
            'mfg_exp_unlabeled',
            'custom'
       ) THEN
        RAISE EXCEPTION
            'printing_config.preset is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_config -> 'template') <> 'string' THEN
        RAISE EXCEPTION
            'printing_config.template must be a string'
            USING ERRCODE = '22023';
    END IF;

    v_template := p_config ->> 'template';

    -- 1,000 characters leaves ample space for all known label examples while
    -- preventing unbounded configuration payloads.
    IF btrim(v_template) = ''
       OR char_length(v_template) > 1000 THEN
        RAISE EXCEPTION
            'printing_config.template must be non-empty and at most 1000 characters'
            USING ERRCODE = '22023';
    END IF;

    v_template_without_allowed_placeholders := replace(
        replace(
            replace(v_template, '{MFG_DATE}', ''),
            '{EXP_DATE}',
            ''
        ),
        '{LOT}',
        ''
    );

    IF position('{' IN v_template_without_allowed_placeholders) > 0
       OR position('}' IN v_template_without_allowed_placeholders) > 0 THEN
        RAISE EXCEPTION
            'printing_config.template contains an unknown or malformed placeholder'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_config -> 'mfg_format') <> 'null' THEN
        PERFORM public.validate_printing_date_format_spec_v1(
            p_config -> 'mfg_format',
            'printing_config.mfg_format'
        );
    END IF;

    IF jsonb_typeof(p_config -> 'exp_format') <> 'null' THEN
        PERFORM public.validate_printing_date_format_spec_v1(
            p_config -> 'exp_format',
            'printing_config.exp_format'
        );
    END IF;

    IF position('{MFG_DATE}' IN v_template) > 0
       AND jsonb_typeof(p_config -> 'mfg_format') = 'null' THEN
        RAISE EXCEPTION
            'printing_config.mfg_format is required by {MFG_DATE}'
            USING ERRCODE = '22023';
    END IF;

    IF position('{EXP_DATE}' IN v_template) > 0
       AND jsonb_typeof(p_config -> 'exp_format') = 'null' THEN
        RAISE EXCEPTION
            'printing_config.exp_format is required by {EXP_DATE}'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_config -> 'exp_offset_days') <> 'number' THEN
        RAISE EXCEPTION
            'printing_config.exp_offset_days must be numeric 0 or -1'
            USING ERRCODE = '22023';
    END IF;

    v_exp_offset := p_config ->> 'exp_offset_days';

    IF v_exp_offset NOT IN ('0', '-1') THEN
        RAISE EXCEPTION
            'printing_config.exp_offset_days must be 0 or -1'
            USING ERRCODE = '22023';
    END IF;

    IF position('{EXP_DATE}' IN v_template) = 0
       AND v_exp_offset <> '0' THEN
        RAISE EXCEPTION
            'printing_config.exp_offset_days must be 0 without {EXP_DATE}'
            USING ERRCODE = '22023';
    END IF;

    -- {LOT} is configuration-valid regardless of whether a renderer context
    -- currently supplies a lot value.
END;
$function$;


CREATE OR REPLACE FUNCTION public.calculate_order_canonical_expiry_date(
    p_production_date date,
    p_product_exp text,
    p_expiry_offset_days integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_months integer;
BEGIN
    IF p_production_date IS NULL THEN
        RAISE EXCEPTION
            'Production date is required'
            USING ERRCODE = '23502';
    END IF;

    IF p_expiry_offset_days IS NULL
       OR p_expiry_offset_days NOT IN (0, -1) THEN
        RAISE EXCEPTION
            'Actual expiry offset must be 0 or -1'
            USING ERRCODE = '22023';
    END IF;

    v_months := public.parse_product_exp_months(p_product_exp);

    -- PostgreSQL applies month-end clamping before the calendar-day offset.
    RETURN (
        (p_production_date + make_interval(months => v_months))::date
        + p_expiry_offset_days
    );
END;
$function$;


CREATE OR REPLACE FUNCTION public.validate_fgcode_printing_config_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    PERFORM public.validate_printing_config_v1(NEW.printing_config);
    RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.set_order_product_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_product public.fgcode%ROWTYPE;
BEGIN
    IF NEW.product_id IS NULL
       OR btrim(NEW.product_id) = '' THEN
        RAISE EXCEPTION
            'Product ID is required'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.production_date IS NULL THEN
        RAISE EXCEPTION
            'Production date is required'
            USING ERRCODE = '23502';
    END IF;

    SELECT *
    INTO v_product
    FROM public.fgcode
    WHERE id = NEW.product_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Product ID "%" was not found',
            NEW.product_id
            USING ERRCODE = '23503';
    END IF;

    -- Validate the source values before assigning authoritative snapshots.
    PERFORM public.parse_product_exp_months(v_product.exp);
    PERFORM public.validate_printing_config_v1(v_product.printing_config);

    -- Do not trust any snapshot candidates or expiry date supplied by a client.
    NEW.product_exp := v_product.exp;
    NEW.expiry_offset_days_used := v_product.expiry_offset_days;
    NEW.printing_config_used := v_product.printing_config;
    NEW.expiry_date := public.calculate_order_canonical_expiry_date(
        NEW.production_date,
        v_product.exp,
        v_product.expiry_offset_days
    );

    -- printing_config.exp_offset_days is deliberately not used here. It is a
    -- printing-renderer concern and must never alter canonical expiry_date.
    RETURN NEW;
END;
$function$;


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

    -- Phase 1B temporary compatibility behavior:
    -- sync_orders_from_fgcode() still uses this bypass to update product_exp
    -- and expiry_date. Phase 1C is mandatory before Product configuration UI
    -- activation: stop those legacy exp syncs, then make product_exp immutable
    -- for both normal and internal update paths while preserving name sync.
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


    -- product_exp is immutable for all external clients, including Managers.
    -- The legacy internal exception above is removed in mandatory Phase 1C.
    IF NEW.product_exp IS DISTINCT FROM OLD.product_exp THEN
        RAISE EXCEPTION
            'Order product shelf-life snapshot cannot be changed';
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


CREATE TRIGGER trg_set_order_product_snapshot
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_product_snapshot();


CREATE TRIGGER trg_validate_fgcode_printing_config_v1
BEFORE INSERT OR UPDATE ON public.fgcode
FOR EACH ROW
EXECUTE FUNCTION public.validate_fgcode_printing_config_v1();


REVOKE ALL ON FUNCTION public.parse_product_exp_months(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parse_product_exp_months(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.parse_product_exp_months(text)
    TO postgres, service_role;

REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text)
    TO postgres, service_role;

REVOKE ALL ON FUNCTION public.validate_printing_config_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_printing_config_v1(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_printing_config_v1(jsonb)
    TO postgres, service_role;

REVOKE ALL ON FUNCTION public.calculate_order_canonical_expiry_date(date, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_order_canonical_expiry_date(date, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_order_canonical_expiry_date(date, text, integer)
    TO postgres, service_role;

REVOKE ALL ON FUNCTION public.validate_fgcode_printing_config_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_fgcode_printing_config_v1() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_fgcode_printing_config_v1()
    TO postgres, service_role;

REVOKE ALL ON FUNCTION public.set_order_product_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_product_snapshot() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_product_snapshot()
    TO postgres, service_role;
