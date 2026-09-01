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

    PERFORM public.validate_printing_date_pattern_v1(
        p_format ->> 'pattern'
    );

    IF p_format ->> 'calendar' NOT IN ('gregorian', 'buddhist') THEN
        RAISE EXCEPTION
            '% has an unsupported calendar',
            p_field_name
            USING ERRCODE = '22023';
    END IF;

    IF p_format ? 'monthCase'
       AND (
            jsonb_typeof(p_format -> 'monthCase') <> 'string'
            OR p_format ->> 'monthCase' NOT IN ('upper', 'title', 'lower')
       ) THEN
        RAISE EXCEPTION
            '% has an unsupported monthCase',
            p_field_name
            USING ERRCODE = '22023';
    END IF;
END;
$function$;

-- Keep this validator internal, matching the existing hardened grants.
REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text)
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text)
FROM anon;

REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text)
FROM authenticated;

GRANT EXECUTE ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text)
TO postgres;

GRANT EXECUTE ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text)
TO service_role;