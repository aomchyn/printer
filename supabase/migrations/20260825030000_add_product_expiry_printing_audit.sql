-- Product expiry/printing audit coverage. Requires Phase 1A columns.
-- Preserve the existing audit contract while retaining explicit JSON null snapshots.

CREATE OR REPLACE FUNCTION public.audit_fgcode_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_previous_audit_flag text;
    v_changes jsonb;
BEGIN

    -- rename_fgcode() creates its own single UPDATE_PRODUCT event.
    IF COALESCE(
        current_setting('app.fgcode_rename', true),
        'off'
    ) = 'on' THEN
        RETURN NEW;
    END IF;


    -- Skip updates that do not change any audited Product field.
    IF TG_OP = 'UPDATE'
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.exp IS NOT DISTINCT FROM OLD.exp
       AND NEW.default_paper_type IS NOT DISTINCT FROM OLD.default_paper_type
       AND NEW.qty_per_a3 IS NOT DISTINCT FROM OLD.qty_per_a3
       AND NEW.expiry_offset_days IS NOT DISTINCT FROM OLD.expiry_offset_days
       AND NEW.printing_config IS NOT DISTINCT FROM OLD.printing_config THEN

        RETURN NEW;
    END IF;


    IF TG_OP = 'UPDATE' THEN
        -- Concatenate only changed top-level fields. Unlike jsonb_strip_nulls(),
        -- this preserves nested explicit nulls in old/new snapshots.
        v_changes := '{}'::jsonb
            || CASE
                WHEN NEW.name IS DISTINCT FROM OLD.name THEN
                    jsonb_build_object(
                        'name',
                        jsonb_build_object('old', OLD.name, 'new', NEW.name)
                    )
                ELSE '{}'::jsonb
            END
            || CASE
                WHEN NEW.exp IS DISTINCT FROM OLD.exp THEN
                    jsonb_build_object(
                        'exp',
                        jsonb_build_object('old', OLD.exp, 'new', NEW.exp)
                    )
                ELSE '{}'::jsonb
            END
            || CASE
                WHEN NEW.default_paper_type IS DISTINCT FROM OLD.default_paper_type THEN
                    jsonb_build_object(
                        'default_paper_type',
                        jsonb_build_object(
                            'old', OLD.default_paper_type,
                            'new', NEW.default_paper_type
                        )
                    )
                ELSE '{}'::jsonb
            END
            || CASE
                WHEN NEW.qty_per_a3 IS DISTINCT FROM OLD.qty_per_a3 THEN
                    jsonb_build_object(
                        'qty_per_a3',
                        jsonb_build_object('old', OLD.qty_per_a3, 'new', NEW.qty_per_a3)
                    )
                ELSE '{}'::jsonb
            END
            || CASE
                WHEN NEW.expiry_offset_days IS DISTINCT FROM OLD.expiry_offset_days THEN
                    jsonb_build_object(
                        'expiry_offset_days',
                        jsonb_build_object(
                            'old', OLD.expiry_offset_days,
                            'new', NEW.expiry_offset_days
                        )
                    )
                ELSE '{}'::jsonb
            END
            || CASE
                WHEN NEW.printing_config IS DISTINCT FROM OLD.printing_config THEN
                    jsonb_build_object(
                        'printing_config',
                        jsonb_build_object(
                            'old', OLD.printing_config,
                            'new', NEW.printing_config
                        )
                    )
                ELSE '{}'::jsonb
            END;
    ELSE
        v_changes := NULL;
    END IF;


    v_previous_audit_flag := current_setting('app.audit_internal', true);

    PERFORM set_config(
        'app.audit_internal',
        'on',
        true
    );


    INSERT INTO public.audit_logs (
        action,
        details,
        changes
    )
    VALUES (
        CASE
            WHEN TG_OP = 'INSERT' THEN 'CREATE_PRODUCT'
            ELSE 'UPDATE_PRODUCT'
        END,

        jsonb_build_object(
            'id', NEW.id,
            'name', NEW.name,
            'exp', NEW.exp,
            'default_paper_type', NEW.default_paper_type,
            'qty_per_a3', NEW.qty_per_a3,
            'expiry_offset_days', NEW.expiry_offset_days,
            'printing_config', NEW.printing_config
        ),

        v_changes
    );


    PERFORM set_config(
        'app.audit_internal',
        COALESCE(v_previous_audit_flag, ''),
        true
    );


    RETURN NEW;
END;
$function$;
