-- Dynamic Product printing-date format registry.
--
-- PrintingConfigV1 deliberately retains pattern strings (not registry IDs) so
-- historical Order snapshots remain self-contained and renderable after a
-- registry format has been retired.

CREATE OR REPLACE FUNCTION public.validate_printing_date_pattern_v1(
    p_pattern text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_length integer;
    v_position integer := 1;
    v_token text;
    v_character text;
    v_previous_literal text := NULL;
    v_has_year boolean := false;
    v_has_month boolean := false;
    v_has_day boolean := false;
BEGIN
    IF p_pattern IS NULL
       OR btrim(p_pattern) = '' THEN
        RAISE EXCEPTION
            'Printing date pattern must be non-empty'
            USING ERRCODE = '22023';
    END IF;

    v_length := char_length(p_pattern);

    IF v_length > 32 THEN
        RAISE EXCEPTION
            'Printing date pattern must be at most 32 characters'
            USING ERRCODE = '22023';
    END IF;

    WHILE v_position <= v_length LOOP
        v_token := NULL;

        -- Resolve overlapping tokens longest-first.
        IF substr(p_pattern, v_position, 4) = 'MMMM' THEN
            v_token := 'MMMM';
        ELSIF substr(p_pattern, v_position, 4) = 'YYYY' THEN
            v_token := 'YYYY';
        ELSIF substr(p_pattern, v_position, 3) = 'MMM' THEN
            v_token := 'MMM';
        ELSIF substr(p_pattern, v_position, 2) = 'DD' THEN
            v_token := 'DD';
        ELSIF substr(p_pattern, v_position, 2) = 'MM' THEN
            v_token := 'MM';
        ELSIF substr(p_pattern, v_position, 2) = 'YY' THEN
            v_token := 'YY';
        ELSIF substr(p_pattern, v_position, 1) = 'D' THEN
            v_token := 'D';
        ELSIF substr(p_pattern, v_position, 1) = 'M' THEN
            v_token := 'M';
        END IF;

        IF v_token IS NULL THEN
            v_character := substr(p_pattern, v_position, 1);

            IF v_character NOT IN (' ', '/', '-', '.', ',') THEN
                RAISE EXCEPTION
                    'Printing date pattern contains an unsupported token or literal'
                    USING ERRCODE = '22023';
            END IF;

            -- A format must start and end with date tokens, not a separator.
            IF v_position = 1
               OR v_position = v_length THEN
                RAISE EXCEPTION
                    'Printing date pattern cannot start or end with a literal'
                    USING ERRCODE = '22023';
            END IF;

            -- Reject accidental duplicate literals such as DD//MM//YYYY while
            -- retaining known multi-literal forms such as DD MMM.,YYYY.
            IF v_character = v_previous_literal THEN
                RAISE EXCEPTION
                    'Printing date pattern contains repeated adjacent literals'
                    USING ERRCODE = '22023';
            END IF;

            v_previous_literal := v_character;
            v_position := v_position + 1;
            CONTINUE;
        END IF;

        IF v_token IN ('YYYY', 'YY') THEN
            IF v_has_year THEN
                RAISE EXCEPTION
                    'Printing date pattern must contain exactly one year token'
                    USING ERRCODE = '22023';
            END IF;

            v_has_year := true;
        ELSIF v_token IN ('MMMM', 'MMM', 'MM', 'M') THEN
            IF v_has_month THEN
                RAISE EXCEPTION
                    'Printing date pattern must contain exactly one month token'
                    USING ERRCODE = '22023';
            END IF;

            v_has_month := true;
        ELSE
            IF v_has_day THEN
                RAISE EXCEPTION
                    'Printing date pattern can contain at most one day token'
                    USING ERRCODE = '22023';
            END IF;

            v_has_day := true;
        END IF;

        v_previous_literal := NULL;
        v_position := v_position + char_length(v_token);
    END LOOP;

    IF NOT v_has_year
       OR NOT v_has_month THEN
        RAISE EXCEPTION
            'Printing date pattern must contain exactly one year and one month token'
            USING ERRCODE = '22023';
    END IF;
END;
$function$;


CREATE TABLE public.printing_date_formats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    pattern text NOT NULL UNIQUE,
    display_label text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT printing_date_formats_code_check
        CHECK (code ~ '^[a-z][a-z0-9_]{0,63}$'),
    CONSTRAINT printing_date_formats_display_label_check
        CHECK (
            btrim(display_label) <> ''
            AND char_length(display_label) <= 120
        ),
    CONSTRAINT printing_date_formats_sort_order_check
        CHECK (sort_order BETWEEN -1000000 AND 1000000)
);

ALTER TABLE public.printing_date_formats
ENABLE ROW LEVEL SECURITY;


CREATE OR REPLACE FUNCTION public.protect_printing_date_format_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Printing date format ID cannot be changed';
        END IF;

        IF NEW.code IS DISTINCT FROM OLD.code THEN
            RAISE EXCEPTION 'Printing date format code cannot be changed';
        END IF;

        IF NEW.pattern IS DISTINCT FROM OLD.pattern THEN
            RAISE EXCEPTION 'Printing date format pattern cannot be changed';
        END IF;

        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Printing date format created_at cannot be changed';
        END IF;

        NEW.updated_at := now();
    ELSE
        NEW.created_at := now();
        NEW.updated_at := now();
    END IF;

    IF NEW.code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
        RAISE EXCEPTION
            'Printing date format code must be a lowercase safe identifier'
            USING ERRCODE = '22023';
    END IF;

    IF btrim(NEW.display_label) = ''
       OR char_length(NEW.display_label) > 120 THEN
        RAISE EXCEPTION
            'Printing date format display_label must be non-empty and at most 120 characters'
            USING ERRCODE = '22023';
    END IF;

    IF NEW.sort_order NOT BETWEEN -1000000 AND 1000000 THEN
        RAISE EXCEPTION
            'Printing date format sort_order must be between -1000000 and 1000000'
            USING ERRCODE = '22023';
    END IF;

    PERFORM public.validate_printing_date_pattern_v1(NEW.pattern);

    RETURN NEW;
END;
$function$;


CREATE TRIGGER trg_protect_printing_date_format_fields
BEFORE INSERT OR UPDATE ON public.printing_date_formats
FOR EACH ROW
EXECUTE FUNCTION public.protect_printing_date_format_fields();


INSERT INTO public.printing_date_formats (
    code,
    pattern,
    display_label,
    sort_order
)
VALUES
    ('dd_mm_yyyy', 'DD/MM/YYYY', 'DD/MM/YYYY', 10),
    ('ddmmyyyy', 'DDMMYYYY', 'DDMMYYYY', 20),
    ('dd_mm_yy', 'DD/MM/YY', 'DD/MM/YY', 30),
    ('ddmmyy', 'DDMMYY', 'DDMMYY', 40),
    ('yyyy_mm_dd', 'YYYY/MM/DD', 'YYYY/MM/DD', 50),
    ('yyyy_m_d', 'YYYY/M/D', 'YYYY/M/D', 60),
    ('yyyy_dash_mm_dash_dd', 'YYYY-MM-DD', 'YYYY-MM-DD', 70),
    ('yyyymmdd', 'YYYYMMDD', 'YYYYMMDD', 80),
    ('dd_dash_mm_dash_yyyy', 'DD-MM-YYYY', 'DD-MM-YYYY', 90),
    ('dd_dot_mm_dot_yyyy', 'DD.MM.YYYY', 'DD.MM.YYYY', 100),
    ('mm_yy', 'MM/YY', 'MM/YY', 110),
    ('mm_yyyy', 'MM YYYY', 'MM YYYY', 120),
    ('mmm_yyyy', 'MMM YYYY', 'MMM YYYY', 130),
    ('mmmm_yyyy', 'MMMM YYYY', 'MMMM YYYY', 140),
    ('dd_mmm_comma_yyyy', 'DD MMM,YYYY', 'DD MMM,YYYY', 150),
    ('dd_mmm_dot_comma_yyyy', 'DD MMM.,YYYY', 'DD MMM.,YYYY', 160),
    ('dd_comma_mmm_dot_comma_yyyy', 'DD,MMM.,YYYY', 'DD,MMM.,YYYY', 170),
    ('mmm_comma_dd_comma_yyyy', 'MMM,DD,YYYY', 'MMM,DD,YYYY', 180);


CREATE POLICY printing_date_formats_select_enabled_or_manager
ON public.printing_date_formats
FOR SELECT
TO authenticated
USING (enabled OR public.is_user_manager());

-- Phase A intentionally exposes a read-only catalog. A later migration may
-- add Manager-only write policies after the TypeScript renderer is dynamic.
REVOKE ALL ON TABLE public.printing_date_formats FROM PUBLIC;
REVOKE ALL ON TABLE public.printing_date_formats FROM anon;
REVOKE ALL ON TABLE public.printing_date_formats FROM authenticated;
REVOKE ALL ON TABLE public.printing_date_formats FROM service_role;
GRANT SELECT ON TABLE public.printing_date_formats TO authenticated;


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

    PERFORM public.validate_printing_date_pattern_v1(p_format ->> 'pattern');

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


CREATE OR REPLACE FUNCTION public.validate_fgcode_printing_config_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_mfg_pattern text;
    v_exp_pattern text;
BEGIN
    PERFORM public.validate_printing_config_v1(NEW.printing_config);

    -- A retired registry entry must not prevent unrelated Product edits. The
    -- unchanged configuration remains grammar-valid, while historical
    -- snapshots are never registry-dependent.
    IF TG_OP = 'UPDATE'
       AND NEW.printing_config IS NOT DISTINCT FROM OLD.printing_config THEN
        RETURN NEW;
    END IF;

    IF NEW.printing_config IS NULL THEN
        RETURN NEW;
    END IF;

    IF jsonb_typeof(NEW.printing_config -> 'mfg_format') <> 'null' THEN
        v_mfg_pattern := NEW.printing_config -> 'mfg_format' ->> 'pattern';

        IF NOT EXISTS (
            SELECT 1
            FROM public.printing_date_formats f
            WHERE f.pattern = v_mfg_pattern
              AND f.enabled
        ) THEN
            RAISE EXCEPTION
                'printing_config.mfg_format pattern must be an enabled registry format'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF jsonb_typeof(NEW.printing_config -> 'exp_format') <> 'null' THEN
        v_exp_pattern := NEW.printing_config -> 'exp_format' ->> 'pattern';

        IF NOT EXISTS (
            SELECT 1
            FROM public.printing_date_formats f
            WHERE f.pattern = v_exp_pattern
              AND f.enabled
        ) THEN
            RAISE EXCEPTION
                'printing_config.exp_format pattern must be an enabled registry format'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.audit_printing_date_formats_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_previous_audit_flag text;
    v_changes jsonb;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.display_label IS NOT DISTINCT FROM OLD.display_label
       AND NEW.enabled IS NOT DISTINCT FROM OLD.enabled
       AND NEW.sort_order IS NOT DISTINCT FROM OLD.sort_order THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_changes := '{}'::jsonb
            || CASE
                WHEN NEW.display_label IS DISTINCT FROM OLD.display_label THEN
                    jsonb_build_object(
                        'display_label',
                        jsonb_build_object(
                            'old', OLD.display_label,
                            'new', NEW.display_label
                        )
                    )
                ELSE '{}'::jsonb
            END
            || CASE
                WHEN NEW.enabled IS DISTINCT FROM OLD.enabled THEN
                    jsonb_build_object(
                        'enabled',
                        jsonb_build_object('old', OLD.enabled, 'new', NEW.enabled)
                    )
                ELSE '{}'::jsonb
            END
            || CASE
                WHEN NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
                    jsonb_build_object(
                        'sort_order',
                        jsonb_build_object('old', OLD.sort_order, 'new', NEW.sort_order)
                    )
                ELSE '{}'::jsonb
            END;
    ELSE
        v_changes := NULL;
    END IF;

    v_previous_audit_flag := current_setting('app.audit_internal', true);
    PERFORM set_config('app.audit_internal', 'on', true);

    INSERT INTO public.audit_logs (
        action,
        details,
        changes
    )
    VALUES (
        CASE
            WHEN TG_OP = 'INSERT' THEN 'CREATE_PRINTING_DATE_FORMAT'
            ELSE 'UPDATE_PRINTING_DATE_FORMAT'
        END,
        jsonb_build_object(
            'id', NEW.id,
            'code', NEW.code,
            'pattern', NEW.pattern,
            'display_label', NEW.display_label,
            'enabled', NEW.enabled,
            'sort_order', NEW.sort_order
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


-- Seed rows define the initial catalog baseline; audit subsequent management
-- changes only, rather than writing eighteen migration-time audit events.
CREATE TRIGGER trg_audit_printing_date_formats_write
AFTER INSERT OR UPDATE ON public.printing_date_formats
FOR EACH ROW
EXECUTE FUNCTION public.audit_printing_date_formats_write();


-- Internal helpers and trigger functions are not RPCs. Triggers execute with
-- their established trusted context; application roles need no direct EXECUTE.
REVOKE ALL ON FUNCTION public.validate_printing_date_pattern_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_printing_date_pattern_v1(text) FROM anon;
REVOKE ALL ON FUNCTION public.validate_printing_date_pattern_v1(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_printing_date_pattern_v1(text)
TO postgres, service_role;

REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text)
TO postgres, service_role;

REVOKE ALL ON FUNCTION public.validate_fgcode_printing_config_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_fgcode_printing_config_v1() FROM anon;
REVOKE ALL ON FUNCTION public.validate_fgcode_printing_config_v1() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_fgcode_printing_config_v1()
TO postgres, service_role;

REVOKE ALL ON FUNCTION public.protect_printing_date_format_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_printing_date_format_fields() FROM anon;
REVOKE ALL ON FUNCTION public.protect_printing_date_format_fields() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.protect_printing_date_format_fields()
TO postgres, service_role;

REVOKE ALL ON FUNCTION public.audit_printing_date_formats_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_printing_date_formats_write() FROM anon;
REVOKE ALL ON FUNCTION public.audit_printing_date_formats_write() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_printing_date_formats_write()
TO postgres, service_role;
