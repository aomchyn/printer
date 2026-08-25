-- Manager-only registry management. Direct application writes remain revoked.

CREATE OR REPLACE FUNCTION public.create_printing_date_format(
    p_pattern text,
    p_display_label text
)
RETURNS TABLE (
    id uuid,
    pattern text,
    display_label text,
    enabled boolean,
    sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_pattern text := btrim(COALESCE(p_pattern, ''));
    v_display_label text := btrim(COALESCE(p_display_label, ''));
    v_code text;
    v_sort_order integer;
BEGIN
    IF COALESCE(auth.role(), '') <> 'authenticated'
       OR auth.uid() IS NULL
       OR NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Manager permission is required';
    END IF;

    PERFORM public.validate_printing_date_pattern_v1(v_pattern);

    IF v_display_label = ''
       OR char_length(v_display_label) > 120 THEN
        RAISE EXCEPTION 'Printing date format display label must be non-empty and at most 120 characters'
            USING ERRCODE = '22023';
    END IF;

    -- Serialize rare management writes so end placement remains deterministic.
    LOCK TABLE public.printing_date_formats IN SHARE ROW EXCLUSIVE MODE;

    IF EXISTS (
        SELECT 1
        FROM public.printing_date_formats f
        WHERE f.pattern = v_pattern
    ) THEN
        RAISE EXCEPTION 'Printing date format pattern already exists'
            USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(MAX(f.sort_order), 0) + 10
    INTO v_sort_order
    FROM public.printing_date_formats f;

    IF v_sort_order > 1000000 THEN
        RAISE EXCEPTION 'Printing date format ordering capacity reached; reorder formats first';
    END IF;

    v_code := 'fmt_' || replace(gen_random_uuid()::text, '-', '');

    RETURN QUERY
    INSERT INTO public.printing_date_formats AS f (
        code,
        pattern,
        display_label,
        enabled,
        sort_order
    )
    VALUES (
        v_code,
        v_pattern,
        v_display_label,
        true,
        v_sort_order
    )
    RETURNING f.id, f.pattern, f.display_label, f.enabled, f.sort_order;
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_printing_date_format(
    p_id uuid,
    p_display_label text,
    p_enabled boolean
)
RETURNS TABLE (
    id uuid,
    pattern text,
    display_label text,
    enabled boolean,
    sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_display_label text := btrim(COALESCE(p_display_label, ''));
BEGIN
    IF COALESCE(auth.role(), '') <> 'authenticated'
       OR auth.uid() IS NULL
       OR NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Manager permission is required';
    END IF;

    IF p_id IS NULL
       OR v_display_label = ''
       OR char_length(v_display_label) > 120
       OR p_enabled IS NULL THEN
        RAISE EXCEPTION 'Invalid printing date format update'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    UPDATE public.printing_date_formats AS f
    SET
        display_label = v_display_label,
        enabled = p_enabled
    WHERE f.id = p_id
    RETURNING f.id, f.pattern, f.display_label, f.enabled, f.sort_order;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Printing date format was not found'
            USING ERRCODE = 'P0002';
    END IF;
END;
$function$;


CREATE OR REPLACE FUNCTION public.reorder_printing_date_formats(
    p_ordered_ids uuid[]
)
RETURNS TABLE (
    id uuid,
    pattern text,
    display_label text,
    enabled boolean,
    sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_total_count integer;
    v_input_count integer;
    v_distinct_count integer;
BEGIN
    IF COALESCE(auth.role(), '') <> 'authenticated'
       OR auth.uid() IS NULL
       OR NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Manager permission is required';
    END IF;

    IF p_ordered_ids IS NULL THEN
        RAISE EXCEPTION 'A complete printing date format order is required'
            USING ERRCODE = '22023';
    END IF;

    LOCK TABLE public.printing_date_formats IN SHARE ROW EXCLUSIVE MODE;

    SELECT
        cardinality(p_ordered_ids),
        count(DISTINCT ordered_id)
    INTO v_input_count, v_distinct_count
    FROM unnest(p_ordered_ids) AS input(ordered_id);

    SELECT count(*)
    INTO v_total_count
    FROM public.printing_date_formats;

    IF v_input_count <> v_total_count
       OR v_distinct_count <> v_input_count THEN
        RAISE EXCEPTION 'Printing date format order must contain each registry row exactly once'
            USING ERRCODE = '22023';
    END IF;

    IF v_total_count > 100000 THEN
        RAISE EXCEPTION 'Printing date format ordering capacity reached'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(p_ordered_ids) AS input(ordered_id)
        LEFT JOIN public.printing_date_formats f ON f.id = input.ordered_id
        WHERE f.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Printing date format order contains an unknown row'
            USING ERRCODE = '22023';
    END IF;

    WITH ordered AS (
        SELECT ordered_id AS id, ordinality::integer * 10 AS next_sort_order
        FROM unnest(p_ordered_ids) WITH ORDINALITY AS input(ordered_id, ordinality)
    )
    UPDATE public.printing_date_formats AS f
    SET sort_order = ordered.next_sort_order
    FROM ordered
    WHERE f.id = ordered.id;

    RETURN QUERY
    SELECT f.id, f.pattern, f.display_label, f.enabled, f.sort_order
    FROM public.printing_date_formats f
    ORDER BY f.sort_order ASC, f.id ASC;
END;
$function$;


REVOKE ALL ON FUNCTION public.create_printing_date_format(text, text)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_printing_date_format(text, text)
TO authenticated;

REVOKE ALL ON FUNCTION public.update_printing_date_format(uuid, text, boolean)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_printing_date_format(uuid, text, boolean)
TO authenticated;

REVOKE ALL ON FUNCTION public.reorder_printing_date_formats(uuid[])
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_printing_date_formats(uuid[])
TO authenticated;
