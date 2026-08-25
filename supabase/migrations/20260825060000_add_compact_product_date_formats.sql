-- Add compact MFG date patterns without changing the PrintingConfigV1 contract.

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
        'DDMMYYYY',
        'DD/MM/YY',
        'DDMMYY',
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
