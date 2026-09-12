-- Additional reporting only. Apply together with the matching UI release.
-- No historical paper_reports are copied. Enable capture last, after Product setup.
BEGIN;

ALTER TABLE public.fgcode
    ADD COLUMN special_monthly_report_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN special_monthly_job_type text;
ALTER TABLE public.fgcode ADD CONSTRAINT fgcode_special_monthly_job_check CHECK (
    (special_monthly_job_type IS NULL OR special_monthly_job_type IN ('business_card', 'brochure'))
    AND (NOT special_monthly_report_enabled OR special_monthly_job_type IS NOT NULL)
);

-- Same field authorization as the existing paper settings, not generic name editing.
CREATE FUNCTION public.protect_special_monthly_product_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
    IF auth.role() = 'authenticated' AND NOT public.is_user_manager() THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.special_monthly_report_enabled OR NEW.special_monthly_job_type IS NOT NULL THEN
                RAISE EXCEPTION 'Not allowed to configure monthly reporting' USING ERRCODE = '42501';
            END IF;
        ELSIF NEW.special_monthly_report_enabled IS DISTINCT FROM OLD.special_monthly_report_enabled
           OR NEW.special_monthly_job_type IS DISTINCT FROM OLD.special_monthly_job_type THEN
            RAISE EXCEPTION 'Not allowed to configure monthly reporting' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_special_monthly_product_fields
BEFORE INSERT OR UPDATE ON public.fgcode
FOR EACH ROW EXECUTE FUNCTION public.protect_special_monthly_product_fields();

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
       AND NEW.printing_config IS NOT DISTINCT FROM OLD.printing_config
       AND NEW.special_monthly_report_enabled IS NOT DISTINCT FROM OLD.special_monthly_report_enabled
       AND NEW.special_monthly_job_type IS NOT DISTINCT FROM OLD.special_monthly_job_type THEN

        RETURN NEW;
    END IF;


    IF TG_OP = 'UPDATE' THEN
        -- Concatenate only changed top-level fields. Unlike jsonb_strip_nulls(),
        -- this preserves nested explicit nulls in old/new snapshots.
        v_changes := '{}'::jsonb
            || CASE WHEN NEW.special_monthly_report_enabled IS DISTINCT FROM OLD.special_monthly_report_enabled THEN
                jsonb_build_object('special_monthly_report_enabled', jsonb_build_object('old', OLD.special_monthly_report_enabled, 'new', NEW.special_monthly_report_enabled))
                ELSE '{}'::jsonb END
            || CASE WHEN NEW.special_monthly_job_type IS DISTINCT FROM OLD.special_monthly_job_type THEN
                jsonb_build_object('special_monthly_job_type', jsonb_build_object('old', OLD.special_monthly_job_type, 'new', NEW.special_monthly_job_type))
                ELSE '{}'::jsonb END
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
            'printing_config', NEW.printing_config,
            'special_monthly_report_enabled', NEW.special_monthly_report_enabled,
            'special_monthly_job_type', NEW.special_monthly_job_type
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

-- These are explicit, reviewed Product assignments, never name matching.
UPDATE public.fgcode SET special_monthly_report_enabled = true,
    special_monthly_job_type = 'business_card' WHERE id = 'CARD';
UPDATE public.fgcode SET special_monthly_report_enabled = true,
    special_monthly_job_type = 'brochure' WHERE id = 'BROCHUREA4';

CREATE TABLE public.special_job_paper_reports (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_paper_report_id bigint NOT NULL UNIQUE,
    report_date date NOT NULL,
    source_kind text NOT NULL,
    job_type text NOT NULL,
    product_id text NOT NULL,
    product_name_snapshot text,
    paper_type text NOT NULL,
    paper_used_a3 bigint NOT NULL CHECK (paper_used_a3 >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT special_job_paper_reports_classification_check CHECK (
        (source_kind = 'product_classified' AND job_type IN ('business_card', 'brochure'))
        OR (source_kind = 'note_matched' AND job_type = 'note_based')
    )
);
COMMENT ON COLUMN public.special_job_paper_reports.source_paper_report_id IS
    'Immutable source ID, deliberately no FK: weekly reset deletes source reports.';
CREATE INDEX special_job_paper_reports_month_category_paper_idx
    ON public.special_job_paper_reports (report_date, job_type, paper_type);
ALTER TABLE public.special_job_paper_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY special_job_paper_reports_select ON public.special_job_paper_reports
    FOR SELECT TO authenticated USING (public.is_user_manager());

-- English token boundaries prevent peppermint, minting, mint_123, etc.
-- Thai names can occur directly after Thai text, e.g. งานคุณมิ้นท์.
CREATE FUNCTION public.special_monthly_note_matches(p_note text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
    SELECT regexp_replace(btrim(coalesce(p_note, '')), '[[:space:]]+', ' ', 'g')
        ~* '(คุณมิ้นท์|มิ้นท์|มิ้น|(^|[^[:alnum:]_])mint($|[^[:alnum:]_]))';
$$;

-- Internal only. UPDATE paths can never insert, even after reset or loss of eligibility.
CREATE FUNCTION public.sync_special_job_paper_report(
    p_report public.paper_reports, p_order_note text, p_capture boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
    v_product public.fgcode%ROWTYPE;
    v_snapshot public.special_job_paper_reports%ROWTYPE;
    v_source_kind text;
    v_job_type text;
BEGIN
    IF NOT p_capture THEN
        SELECT * INTO v_snapshot FROM public.special_job_paper_reports
        WHERE source_paper_report_id = p_report.id FOR UPDATE;
        IF NOT FOUND THEN RETURN; END IF;
    END IF;

    SELECT * INTO v_product FROM public.fgcode WHERE id = p_report.product_id;
    -- Master renames/settings edits must not rewrite a captured Product category.
    -- An explicit Product correction on the report still re-evaluates eligibility.
    IF NOT p_capture AND v_snapshot.source_kind = 'product_classified'
       AND v_snapshot.product_id = p_report.product_id THEN
        v_source_kind := v_snapshot.source_kind;
        v_job_type := v_snapshot.job_type;
    ELSIF v_product.special_monthly_report_enabled THEN
        v_source_kind := 'product_classified';
        v_job_type := v_product.special_monthly_job_type;
    ELSIF public.special_monthly_note_matches(p_report.remark)
       OR (p_report.order_id IS NOT NULL AND public.special_monthly_note_matches(p_order_note)) THEN
        v_source_kind := 'note_matched';
        v_job_type := 'note_based';
    ELSE
        IF NOT p_capture THEN
            DELETE FROM public.special_job_paper_reports
            WHERE source_paper_report_id = p_report.id;
        END IF;
        RETURN;
    END IF;

    IF p_capture THEN
        INSERT INTO public.special_job_paper_reports (
            source_paper_report_id, report_date, source_kind, job_type,
            product_id, product_name_snapshot, paper_type, paper_used_a3
        ) VALUES (
            p_report.id, (p_report.created_at AT TIME ZONE 'Asia/Bangkok')::date,
            v_source_kind, v_job_type, p_report.product_id, v_product.name,
            p_report.paper_type, coalesce(p_report.good_a3, 0)::bigint + coalesce(p_report.waste_a3, 0)::bigint
        );
    ELSE
        UPDATE public.special_job_paper_reports SET
            source_kind = v_source_kind, job_type = v_job_type,
            product_id = p_report.product_id,
            product_name_snapshot = CASE WHEN product_id IS DISTINCT FROM p_report.product_id
                THEN v_product.name ELSE product_name_snapshot END,
            paper_type = p_report.paper_type,
            paper_used_a3 = coalesce(p_report.good_a3, 0)::bigint + coalesce(p_report.waste_a3, 0)::bigint
        WHERE source_paper_report_id = p_report.id;
        -- report_date, source ID and creation timestamp are immutable.
    END IF;
END;
$$;

CREATE FUNCTION public.capture_special_job_paper_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_order_note text;
BEGIN
    IF NEW.order_id IS NOT NULL THEN
        -- Serialize with orders.notes edits so capture cannot commit a stale note match.
        SELECT notes INTO v_order_note FROM public.orders WHERE id = NEW.order_id FOR SHARE;
    END IF;
    PERFORM public.sync_special_job_paper_report(NEW, v_order_note, TG_OP = 'INSERT');
    RETURN NEW;
END;
$$;

-- orders.notes is independently editable and is NOT copied by reconciliation.
-- Keep existing captured reports in sync without writing to paper_reports.
CREATE FUNCTION public.correct_special_job_order_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_report public.paper_reports%ROWTYPE;
BEGIN
    FOR v_report IN SELECT r.* FROM public.paper_reports r
        JOIN public.special_job_paper_reports s ON s.source_paper_report_id = r.id
        WHERE r.order_id = NEW.id ORDER BY r.id
    LOOP
        PERFORM public.sync_special_job_paper_report(v_report, NEW.notes, false);
    END LOOP;
    RETURN NEW;
END;
$$;

-- The verified weekly reset gate and paper RLS both use these exact two roles
-- through is_user_manager(). No role-name inference and no browser write grants.
CREATE FUNCTION public.get_special_job_paper_month(p_month date)
RETURNS TABLE(job_type text, paper_type text, paper_used_a3 bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Not allowed to read monthly reports' USING ERRCODE = '42501';
    END IF;
    IF p_month IS NULL OR extract(day FROM p_month) <> 1 OR NOT isfinite(p_month) THEN
        RAISE EXCEPTION 'Expected first day of month' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT s.job_type, s.paper_type, sum(s.paper_used_a3)::bigint
        FROM public.special_job_paper_reports s
        WHERE s.report_date >= p_month AND s.report_date < (p_month + interval '1 month')::date
        GROUP BY s.job_type, s.paper_type ORDER BY s.job_type, s.paper_type COLLATE "C";
END;
$$;

CREATE FUNCTION public.reset_special_job_paper_month(p_month date)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_count bigint;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Not allowed to reset monthly reports' USING ERRCODE = '42501';
    END IF;
    IF p_month IS NULL OR extract(day FROM p_month) <> 1 OR NOT isfinite(p_month) THEN
        RAISE EXCEPTION 'Expected first day of month' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.special_job_paper_reports
    WHERE report_date >= p_month AND report_date < (p_month + interval '1 month')::date;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Explicit erroneous source deletion ONLY. Dashboard undo/cancellation and weekly
-- reset retain their existing paths and MUST NOT invoke this operation.
CREATE FUNCTION public.delete_paper_reports_individually(p_report_ids bigint[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_ids bigint[]; v_refs bigint[];
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Not allowed to delete paper reports' USING ERRCODE = '42501';
    END IF;
    IF p_report_ids IS NULL THEN
        RAISE EXCEPTION 'Supply report IDs' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(r.id), array_agg(r.order_id) INTO v_ids, v_refs
    FROM (SELECT id, order_id FROM public.paper_reports
        WHERE id = ANY(p_report_ids) ORDER BY id FOR UPDATE) r;
    DELETE FROM public.paper_transactions WHERE reference_id = ANY(v_ids || v_refs);
    DELETE FROM public.special_job_paper_reports WHERE source_paper_report_id = ANY(v_ids);
    DELETE FROM public.paper_reports WHERE id = ANY(v_ids);
END;
$$;

-- Product names are exposed ONLY through this protected contributor drill-down.
-- Keyset pagination avoids PostgREST's response limit truncating large groups.
CREATE FUNCTION public.get_special_job_paper_details(
    p_month date, p_job_type text, p_paper_type text, p_after_id bigint DEFAULT 0
) RETURNS TABLE(snapshot_id text, report_date date, product_name_snapshot text,
    paper_type text, paper_used_a3 bigint, job_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Not allowed to read monthly details' USING ERRCODE = '42501';
    END IF;
    IF p_month IS NULL OR extract(day FROM p_month) <> 1 OR NOT isfinite(p_month)
       OR p_job_type IS NULL OR p_job_type NOT IN ('business_card','brochure','note_based')
       OR p_paper_type IS NULL OR p_after_id IS NULL OR p_after_id < 0 THEN
        RAISE EXCEPTION 'Invalid monthly detail selection' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT s.id::text, s.report_date, s.product_name_snapshot,
        s.paper_type, s.paper_used_a3, s.job_type
    FROM public.special_job_paper_reports s
    WHERE s.report_date >= p_month AND s.report_date < (p_month + interval '1 month')::date
      AND s.job_type = p_job_type AND s.paper_type = p_paper_type AND s.id > p_after_id
    ORDER BY s.id LIMIT 200;
END;
$$;

-- Deletes one monthly contribution ONLY; does not touch source reports or orders.
CREATE FUNCTION public.delete_special_job_paper_snapshot(p_snapshot_id bigint, p_month date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_count bigint;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Not allowed to delete monthly snapshot' USING ERRCODE = '42501';
    END IF;
    IF p_month IS NULL OR extract(day FROM p_month) <> 1 OR NOT isfinite(p_month)
       OR p_snapshot_id IS NULL OR p_snapshot_id <= 0 THEN
        RAISE EXCEPTION 'Invalid monthly snapshot selection' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.special_job_paper_reports
    WHERE id = p_snapshot_id AND report_date >= p_month
      AND report_date < (p_month + interval '1 month')::date;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

-- Override inherited broad Supabase defaults on EVERY new object.
REVOKE ALL ON TABLE public.special_job_paper_reports FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.special_job_paper_reports_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (report_date, source_kind, job_type, paper_type, paper_used_a3)
    ON public.special_job_paper_reports TO authenticated;
REVOKE ALL ON FUNCTION public.protect_special_monthly_product_fields() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.special_monthly_note_matches(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_special_job_paper_report(public.paper_reports, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.capture_special_job_paper_report() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.correct_special_job_order_note() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_special_job_paper_month(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reset_special_job_paper_month(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_paper_reports_individually(bigint[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_special_job_paper_details(date, text, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_special_job_paper_snapshot(bigint, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_special_job_paper_details(date, text, text, bigint),
    public.delete_special_job_paper_snapshot(bigint, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_special_job_paper_month(date),
    public.reset_special_job_paper_month(date), public.delete_paper_reports_individually(bigint[]) TO authenticated;

CREATE TRIGGER trg_capture_special_job_paper_report
AFTER INSERT OR UPDATE OF product_id, order_id, remark, good_a3, waste_a3, paper_type
ON public.paper_reports FOR EACH ROW EXECUTE FUNCTION public.capture_special_job_paper_report();
CREATE TRIGGER trg_correct_special_job_order_note
AFTER UPDATE OF notes ON public.orders FOR EACH ROW
WHEN (OLD.notes IS DISTINCT FROM NEW.notes)
EXECUTE FUNCTION public.correct_special_job_order_note();
-- No DELETE trigger, Product update capture, backfill, or source-row FK.
COMMIT;
