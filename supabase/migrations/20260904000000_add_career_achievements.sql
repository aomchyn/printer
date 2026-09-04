-- Before applying: verify the LIVE public.is_user_moderator() definition is
-- strictly public.users.role = 'moderator'. Production application needs approval.
BEGIN;

CREATE TABLE public.career_achievements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    problem text NOT NULL CHECK (char_length(btrim(problem)) BETWEEN 1 AND 5000),
    action text NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 5000),
    result text NOT NULL CHECK (char_length(btrim(result)) BETWEEN 1 AND 5000),
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'implemented', 'portfolio_ready')),
    period_start date CHECK (isfinite(period_start) AND EXTRACT(DAY FROM period_start) = 1),
    period_end date CHECK (isfinite(period_end) AND EXTRACT(DAY FROM period_end) = 1),
    metric_keys text[] NOT NULL DEFAULT '{}'::text[],
    evidence_notes text CHECK (char_length(evidence_notes) <= 5000),
    portfolio_summary text CHECK (char_length(portfolio_summary) <= 1000),
    -- Retain provenance without cascading history deletion or blocking account deletion.
    created_by uuid NOT NULL DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT career_achievements_period_order CHECK (
        period_start IS NULL OR period_end IS NULL OR period_end >= period_start
    ),
    CONSTRAINT career_achievements_metric_keys CHECK (
        array_position(metric_keys, NULL) IS NULL AND metric_keys <@ ARRAY[
            'total_sku', 'ordered_sku', 'total_orders', 'printing_quantity',
            'active_order_days', 'average_orders_per_active_day', 'paper_reports',
            'total_paper_used', 'paper_waste_a3', 'waste_incidents', 'waste_rate'
        ]::text[]
    )
);

CREATE INDEX career_achievements_updated_id_idx
ON public.career_achievements (updated_at DESC, id DESC);

-- Column privileges protect immutable fields. This invoker trigger only maintains
-- updated_at; it does not need elevated privileges or a creator-assignment trigger.
CREATE FUNCTION public.set_career_achievement_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_career_achievement_updated_at()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER career_achievements_updated_at
BEFORE UPDATE ON public.career_achievements
FOR EACH ROW EXECUTE FUNCTION public.set_career_achievement_updated_at();

ALTER TABLE public.career_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY career_achievements_select_moderator
ON public.career_achievements FOR SELECT TO authenticated
USING (public.is_user_moderator());

CREATE POLICY career_achievements_insert_moderator
ON public.career_achievements FOR INSERT TO authenticated
WITH CHECK (public.is_user_moderator() AND created_by = auth.uid());

CREATE POLICY career_achievements_update_moderator
ON public.career_achievements FOR UPDATE TO authenticated
USING (public.is_user_moderator())
WITH CHECK (public.is_user_moderator());

CREATE POLICY career_achievements_delete_moderator
ON public.career_achievements FOR DELETE TO authenticated
USING (public.is_user_moderator());

-- Override broad existing default privileges explicitly.
REVOKE ALL ON TABLE public.career_achievements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, DELETE ON TABLE public.career_achievements TO authenticated;
GRANT INSERT (title, problem, action, result, status, period_start, period_end,
    metric_keys, evidence_notes, portfolio_summary)
ON TABLE public.career_achievements TO authenticated;
GRANT UPDATE (title, problem, action, result, status, period_start, period_end,
    metric_keys, evidence_notes, portfolio_summary)
ON TABLE public.career_achievements TO authenticated;

COMMENT ON TABLE public.career_achievements IS
    'Private career case studies shared only among exact moderators. Text evidence references only.';
COMMENT ON COLUMN public.career_achievements.period_start IS 'Month precision, stored as first day; not an exact event date.';
COMMENT ON COLUMN public.career_achievements.period_end IS 'Month precision; NULL means unspecified, not necessarily ongoing.';
COMMIT;
