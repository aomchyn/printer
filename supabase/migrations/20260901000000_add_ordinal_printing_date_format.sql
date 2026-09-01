-- Add English ordinal-day support to the shared printing date-pattern grammar.

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

        -- Resolve overlapping tokens longest-first. Do is an English ordinal day.
        IF substr(p_pattern, v_position, 4) = 'MMMM' THEN
            v_token := 'MMMM';
        ELSIF substr(p_pattern, v_position, 4) = 'YYYY' THEN
            v_token := 'YYYY';
        ELSIF substr(p_pattern, v_position, 3) = 'MMM' THEN
            v_token := 'MMM';
        ELSIF substr(p_pattern, v_position, 2) = 'DD' THEN
            v_token := 'DD';
        ELSIF substr(p_pattern, v_position, 2) = 'Do' THEN
            v_token := 'Do';
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

            IF v_position = 1
               OR v_position = v_length THEN
                RAISE EXCEPTION
                    'Printing date pattern cannot start or end with a literal'
                    USING ERRCODE = '22023';
            END IF;

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


INSERT INTO public.printing_date_formats (
    code,
    pattern,
    display_label,
    sort_order
)
SELECT
    'mmm_dot_ordinal_day_comma_yyyy',
    'MMM.Do,YYYY',
    'Jun.18th,2025',
    COALESCE(MAX(sort_order), 0) + 10
FROM public.printing_date_formats
ON CONFLICT DO NOTHING;
