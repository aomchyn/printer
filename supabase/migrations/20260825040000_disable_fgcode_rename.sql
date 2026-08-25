-- Retire the legacy Product-ID rename RPC. Product IDs are immutable.
-- Keep the exact public signature so stale clients fail explicitly instead of
-- falling through to an undefined-function error or a compatibility rename.

CREATE OR REPLACE FUNCTION public.rename_fgcode(
    p_old_id             text,
    p_new_id             text,
    p_name               text,
    p_exp                text,
    p_default_paper_type text DEFAULT NULL::text,
    p_qty_per_a3         integer DEFAULT NULL::integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    RAISE EXCEPTION 'Product ID cannot be changed';
END;
$function$;

-- This RPC is retired. Revoke all application-facing invocation paths.
REVOKE ALL ON FUNCTION public.rename_fgcode(text, text, text, text, text, integer)
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.rename_fgcode(text, text, text, text, text, integer)
FROM anon, authenticated, service_role;
