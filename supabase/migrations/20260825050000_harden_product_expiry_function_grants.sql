-- Defense in depth: Phase 1B helpers and trigger functions are not RPCs.
-- Keep direct execution restricted to trusted database contexts only.

REVOKE ALL ON FUNCTION public.parse_product_exp_months(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parse_product_exp_months(text) FROM anon;
REVOKE ALL ON FUNCTION public.parse_product_exp_months(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.parse_product_exp_months(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.parse_product_exp_months(text) TO service_role;

REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_printing_date_format_spec_v1(jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.validate_printing_config_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_printing_config_v1(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.validate_printing_config_v1(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_printing_config_v1(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_printing_config_v1(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.calculate_order_canonical_expiry_date(date, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_order_canonical_expiry_date(date, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.calculate_order_canonical_expiry_date(date, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_order_canonical_expiry_date(date, text, integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.calculate_order_canonical_expiry_date(date, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.validate_fgcode_printing_config_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_fgcode_printing_config_v1() FROM anon;
REVOKE ALL ON FUNCTION public.validate_fgcode_printing_config_v1() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_fgcode_printing_config_v1() TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_fgcode_printing_config_v1() TO service_role;

REVOKE ALL ON FUNCTION public.set_order_product_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_product_snapshot() FROM anon;
REVOKE ALL ON FUNCTION public.set_order_product_snapshot() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_product_snapshot() TO postgres;
GRANT EXECUTE ON FUNCTION public.set_order_product_snapshot() TO service_role;
