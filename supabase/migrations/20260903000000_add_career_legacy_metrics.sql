CREATE TABLE public.career_legacy_daily_metrics (
    business_date date PRIMARY KEY,
    non_cancelled_orders integer NOT NULL,
    cancelled_orders integer NOT NULL,
    total_orders integer GENERATED ALWAYS AS (
        non_cancelled_orders + cancelled_orders
    ) STORED,
    printing_quantity bigint NOT NULL,
    source text NOT NULL,
    archive_sha256 text NOT NULL,
    imported_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT career_legacy_daily_non_cancelled_check
        CHECK (non_cancelled_orders >= 0),
    CONSTRAINT career_legacy_daily_cancelled_check
        CHECK (cancelled_orders >= 0),
    CONSTRAINT career_legacy_daily_printing_quantity_check
        CHECK (printing_quantity >= 0),
    CONSTRAINT career_legacy_daily_source_check
        CHECK (btrim(source) <> '' AND char_length(source) <= 120),
    CONSTRAINT career_legacy_daily_archive_sha256_check
        CHECK (archive_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE public.career_legacy_monthly_metrics (
    snapshot_month date PRIMARY KEY,
    ordered_sku_count integer NOT NULL,
    source text NOT NULL,
    archive_sha256 text NOT NULL,
    imported_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT career_legacy_monthly_snapshot_month_check
        CHECK (snapshot_month = date_trunc('month', snapshot_month)::date),
    CONSTRAINT career_legacy_monthly_ordered_sku_check
        CHECK (ordered_sku_count >= 0),
    CONSTRAINT career_legacy_monthly_source_check
        CHECK (btrim(source) <> '' AND char_length(source) <= 120),
    CONSTRAINT career_legacy_monthly_archive_sha256_check
        CHECK (archive_sha256 ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.career_legacy_daily_metrics
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.career_legacy_monthly_metrics
ENABLE ROW LEVEL SECURITY;

CREATE POLICY career_legacy_daily_select_moderator
ON public.career_legacy_daily_metrics
FOR SELECT
TO authenticated
USING (public.is_user_moderator());

CREATE POLICY career_legacy_monthly_select_moderator
ON public.career_legacy_monthly_metrics
FOR SELECT
TO authenticated
USING (public.is_user_moderator());

REVOKE ALL ON TABLE public.career_legacy_daily_metrics FROM PUBLIC;
REVOKE ALL ON TABLE public.career_legacy_daily_metrics FROM anon;
REVOKE ALL ON TABLE public.career_legacy_daily_metrics FROM authenticated;
REVOKE ALL ON TABLE public.career_legacy_daily_metrics FROM service_role;

REVOKE ALL ON TABLE public.career_legacy_monthly_metrics FROM PUBLIC;
REVOKE ALL ON TABLE public.career_legacy_monthly_metrics FROM anon;
REVOKE ALL ON TABLE public.career_legacy_monthly_metrics FROM authenticated;
REVOKE ALL ON TABLE public.career_legacy_monthly_metrics FROM service_role;

GRANT SELECT ON TABLE public.career_legacy_daily_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.career_legacy_daily_metrics
TO service_role;

GRANT SELECT ON TABLE public.career_legacy_monthly_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.career_legacy_monthly_metrics
TO service_role;

COMMENT ON TABLE public.career_legacy_daily_metrics IS
    'Sanitized daily aggregates imported exclusively for moderator-only Career Metrics.';

COMMENT ON TABLE public.career_legacy_monthly_metrics IS
    'Sanitized monthly non-additive aggregates imported exclusively for moderator-only Career Metrics.';
