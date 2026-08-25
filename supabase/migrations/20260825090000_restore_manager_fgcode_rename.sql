-- Restore a narrowly-scoped, Manager-only Product-ID correction path.
-- This migration intentionally leaves the retired six-argument rename_fgcode()
-- RPC disabled and preserves all Order snapshots.

CREATE TABLE public.fgcode_rename_capabilities (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    actor_id uuid NOT NULL,
    old_product_id text NOT NULL,
    new_product_id text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (backend_pid, transaction_id)
);

ALTER TABLE public.fgcode_rename_capabilities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fgcode_rename_capabilities FROM PUBLIC;
REVOKE ALL ON TABLE public.fgcode_rename_capabilities FROM anon;
REVOKE ALL ON TABLE public.fgcode_rename_capabilities FROM authenticated;
REVOKE ALL ON TABLE public.fgcode_rename_capabilities FROM service_role;

CREATE OR REPLACE FUNCTION public.is_trusted_fgcode_rename_context(
    p_old_product_id text,
    p_new_product_id text
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT
        current_user = 'postgres'
        AND auth.role() = 'authenticated'
        AND auth.uid() IS NOT NULL
        AND current_setting('app.fgcode_rename', true) = 'on'
        AND current_setting('app.fgcode_rename_old_id', true) = p_old_product_id
        AND current_setting('app.fgcode_rename_new_id', true) = p_new_product_id
        AND EXISTS (
            SELECT 1
            FROM public.fgcode_rename_capabilities c
            WHERE c.backend_pid = pg_backend_pid()
              AND c.transaction_id = txid_current()
              AND c.actor_id = auth.uid()
              AND c.old_product_id = p_old_product_id
              AND c.new_product_id = p_new_product_id
        );
$function$;

REVOKE ALL ON FUNCTION public.is_trusted_fgcode_rename_context(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_trusted_fgcode_rename_context(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.is_trusted_fgcode_rename_context(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_trusted_fgcode_rename_context(text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.is_trusted_fgcode_rename_context(text, text) TO postgres;

CREATE OR REPLACE FUNCTION public.protect_fgcode_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_is_manager boolean := false;
BEGIN
    IF auth.role() = 'authenticated' THEN
        v_is_manager := public.is_user_manager();

        IF TG_OP = 'INSERT' THEN
            IF NOT v_is_manager THEN
                IF NEW.default_paper_type IS NOT NULL THEN
                    RAISE EXCEPTION 'Only moderator or assistant_moderator can set default_paper_type';
                END IF;
                IF NEW.qty_per_a3 IS NOT NULL THEN
                    RAISE EXCEPTION 'Only moderator or assistant_moderator can set qty_per_a3';
                END IF;
            END IF;
            RETURN NEW;
        END IF;

        IF TG_OP = 'UPDATE' THEN
            IF NEW.id IS DISTINCT FROM OLD.id THEN
                IF NOT public.is_trusted_fgcode_rename_context(OLD.id, NEW.id)
                   OR (to_jsonb(NEW) - 'id') IS DISTINCT FROM (to_jsonb(OLD) - 'id') THEN
                    RAISE EXCEPTION 'Product ID must be changed through rename_fgcode_manager()';
                END IF;
            END IF;

            IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                RAISE EXCEPTION 'created_at cannot be modified';
            END IF;

            IF NOT v_is_manager THEN
                IF NEW.default_paper_type IS DISTINCT FROM OLD.default_paper_type THEN
                    RAISE EXCEPTION 'Only moderator or assistant_moderator can change default_paper_type';
                END IF;
                IF NEW.qty_per_a3 IS DISTINCT FROM OLD.qty_per_a3 THEN
                    RAISE EXCEPTION 'Only moderator or assistant_moderator can change qty_per_a3';
                END IF;
            END IF;
            RETURN NEW;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_order_product_edit_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_changes text;
BEGIN
    IF NEW.product_id IS DISTINCT FROM OLD.product_id
       AND public.is_trusted_fgcode_rename_context(OLD.product_id, NEW.product_id) THEN
        RETURN NEW;
    END IF;

    IF NEW.product_id IS NOT DISTINCT FROM OLD.product_id
       AND NEW.product_name IS NOT DISTINCT FROM OLD.product_name
       AND NEW.product_exp IS NOT DISTINCT FROM OLD.product_exp THEN
        RETURN NEW;
    END IF;

    v_changes := concat_ws(
        ' | ',
        CASE WHEN NEW.product_id IS DISTINCT FROM OLD.product_id THEN format('รหัสสินค้า: %s ➡️ %s', COALESCE(OLD.product_id, 'ไม่มี'), COALESCE(NEW.product_id, 'ไม่มี')) END,
        CASE WHEN NEW.product_name IS DISTINCT FROM OLD.product_name THEN format('ชื่อสินค้า: %s ➡️ %s', COALESCE(OLD.product_name, 'ไม่มี'), COALESCE(NEW.product_name, 'ไม่มี')) END,
        CASE WHEN NEW.product_exp IS DISTINCT FROM OLD.product_exp THEN format('อายุผลิตภัณฑ์: %s ➡️ %s เดือน', COALESCE(OLD.product_exp, 'ไม่มี'), COALESCE(NEW.product_exp, 'ไม่มี')) END
    );
    IF NULLIF(btrim(v_changes), '') IS NOT NULL THEN
        NEW.edit_summary := 'แก้ไข: ' || v_changes;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_orders_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_is_manager boolean := false;
    v_name text;
    v_employee_id text;
    v_editor text;
    v_cancelling boolean := false;
    v_restoring boolean := false;
BEGIN
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
        IF public.is_trusted_fgcode_rename_context(OLD.product_id, NEW.product_id)
           AND (to_jsonb(NEW) - 'product_id') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'product_id') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Order product cannot be changed';
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.expiry_offset_days_used IS DISTINCT FROM OLD.expiry_offset_days_used
        OR NEW.printing_config_used IS DISTINCT FROM OLD.printing_config_used
    ) THEN
        RAISE EXCEPTION 'Order product configuration snapshots cannot be changed';
    END IF;

    IF NEW.product_exp IS DISTINCT FROM OLD.product_exp THEN
        RAISE EXCEPTION 'Order product shelf-life snapshot cannot be changed';
    END IF;

    IF current_setting('app.order_internal_write', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND (
            NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
            OR NEW.printed_by_user_id IS DISTINCT FROM OLD.printed_by_user_id
            OR NEW.updated_by_user_id IS DISTINCT FROM OLD.updated_by_user_id
            OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id
       )
       AND (to_jsonb(NEW) - ARRAY['created_by_user_id','printed_by_user_id','updated_by_user_id','verified_by_user_id'])
           = (to_jsonb(OLD) - ARRAY['created_by_user_id','printed_by_user_id','updated_by_user_id','verified_by_user_id'])
       AND (NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id OR (OLD.created_by_user_id IS NOT NULL AND NEW.created_by_user_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.created_by_user_id)))
       AND (NEW.printed_by_user_id IS NOT DISTINCT FROM OLD.printed_by_user_id OR (OLD.printed_by_user_id IS NOT NULL AND NEW.printed_by_user_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.printed_by_user_id)))
       AND (NEW.updated_by_user_id IS NOT DISTINCT FROM OLD.updated_by_user_id OR (OLD.updated_by_user_id IS NOT NULL AND NEW.updated_by_user_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.updated_by_user_id)))
       AND (NEW.verified_by_user_id IS NOT DISTINCT FROM OLD.verified_by_user_id OR (OLD.verified_by_user_id IS NOT NULL AND NEW.verified_by_user_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.verified_by_user_id)))
    THEN
        RETURN NEW;
    END IF;

    IF auth.role() <> 'authenticated' THEN RETURN NEW; END IF;
    v_is_manager := public.is_user_manager();
    SELECT u.name, u.employee_id INTO v_name, v_employee_id FROM public.users u WHERE u.id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;
    v_editor := CASE WHEN v_employee_id IS NOT NULL AND btrim(v_employee_id) <> '' THEN v_name || ' (' || v_employee_id || ')' ELSE v_name END;

    IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Order ID cannot be changed'; END IF;
    IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN RAISE EXCEPTION 'Order creator cannot be changed'; END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Order creator cannot be changed'; END IF;
    IF NEW.created_by_department IS DISTINCT FROM OLD.created_by_department THEN RAISE EXCEPTION 'Order creator department cannot be changed'; END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at cannot be changed'; END IF;

    v_cancelling := COALESCE(NEW.is_cancelled, false) AND NOT COALESCE(OLD.is_cancelled, false);
    v_restoring := NOT COALESCE(NEW.is_cancelled, false) AND COALESCE(OLD.is_cancelled, false);

    IF NOT v_is_manager THEN
        IF OLD.created_by_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only update your own order'; END IF;
        IF OLD.is_verified = true THEN RAISE EXCEPTION 'Verified order cannot be edited'; END IF;
        IF COALESCE(OLD.is_cancelled, false) = true THEN RAISE EXCEPTION 'Cancelled order cannot be edited'; END IF;
        IF COALESCE(OLD.is_deleted, false) = true THEN RAISE EXCEPTION 'Deleted order cannot be edited'; END IF;
        IF (to_jsonb(NEW) - ARRAY['order_type','lot_number','quantity','production_date','expiry_date','notes','is_cancelled','is_printed','updated_at','updated_by','edit_summary'])
           IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['order_type','lot_number','quantity','production_date','expiry_date','notes','is_cancelled','is_printed','updated_at','updated_by','edit_summary']) THEN
            RAISE EXCEPTION 'You are not allowed to change protected order fields';
        END IF;
        IF NEW.is_cancelled IS DISTINCT FROM OLD.is_cancelled AND NOT v_cancelling THEN RAISE EXCEPTION 'Only Moderator can restore an order'; END IF;
        IF NEW.is_printed IS DISTINCT FROM OLD.is_printed AND NOT v_cancelling THEN RAISE EXCEPTION 'Print status can only be changed by Moderator'; END IF;
        NEW.updated_at := now(); NEW.updated_by := v_editor; NEW.updated_by_user_id := auth.uid();
    END IF;

    IF v_cancelling THEN
        IF OLD.is_verified = true THEN RAISE EXCEPTION 'Verified order must be unverified before cancellation'; END IF;
        NEW.is_verified := false; NEW.verified_by := NULL; NEW.verified_by_user_id := NULL; NEW.verified_at := NULL;
        NEW.is_printed := false; NEW.printed_by := NULL; NEW.printed_by_user_id := NULL; NEW.printed_at := NULL;
        NEW.is_no_file := false; NEW.no_file_at := NULL;
    END IF;
    IF v_restoring THEN
        IF NOT v_is_manager THEN RAISE EXCEPTION 'Only Moderator can restore orders'; END IF;
        NEW.is_verified := false; NEW.verified_by := NULL; NEW.verified_by_user_id := NULL; NEW.verified_at := NULL;
        NEW.is_printed := false; NEW.printed_by := NULL; NEW.printed_by_user_id := NULL; NEW.printed_at := NULL;
        NEW.is_no_file := false; NEW.no_file_at := NULL;
    END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
        IF NOT v_is_manager THEN RAISE EXCEPTION 'Only Moderator can verify orders'; END IF;
        IF NEW.is_verified = true THEN
            IF COALESCE(OLD.is_cancelled, false) = true THEN RAISE EXCEPTION 'Cancelled order cannot be verified'; END IF;
            NEW.verified_by := v_editor; NEW.verified_by_user_id := auth.uid(); NEW.verified_at := now();
        ELSE
            IF OLD.verified_by_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the original verifier can unverify this order'; END IF;
            NEW.verified_by := NULL; NEW.verified_by_user_id := NULL; NEW.verified_at := NULL;
        END IF;
    ELSIF NEW.verified_by IS DISTINCT FROM OLD.verified_by OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
        RAISE EXCEPTION 'Verification metadata cannot be changed directly';
    END IF;
    IF NEW.is_printed IS DISTINCT FROM OLD.is_printed THEN
        IF v_cancelling THEN
            NEW.is_printed := false; NEW.printed_by := NULL; NEW.printed_by_user_id := NULL; NEW.printed_at := NULL;
        ELSE
            IF NOT v_is_manager THEN RAISE EXCEPTION 'Only Moderator can change print status'; END IF;
            IF COALESCE(NEW.is_printed, false) = true THEN
                IF OLD.is_verified = true OR COALESCE(OLD.is_cancelled, false) = true THEN RAISE EXCEPTION 'This order cannot be marked as printed'; END IF;
                NEW.printed_by := v_editor; NEW.printed_by_user_id := auth.uid(); NEW.printed_at := now();
            ELSE
                IF OLD.printed_by_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the original printer can undo printing'; END IF;
                NEW.printed_by := NULL; NEW.printed_by_user_id := NULL; NEW.printed_at := NULL;
            END IF;
        END IF;
    ELSIF NEW.printed_by IS DISTINCT FROM OLD.printed_by OR NEW.printed_by_user_id IS DISTINCT FROM OLD.printed_by_user_id OR NEW.printed_at IS DISTINCT FROM OLD.printed_at THEN
        RAISE EXCEPTION 'Print metadata cannot be changed directly';
    END IF;
    IF NEW.is_no_file IS DISTINCT FROM OLD.is_no_file THEN
        IF NOT v_is_manager AND NOT v_cancelling THEN RAISE EXCEPTION 'Only Moderator can change no-file status'; END IF;
        IF COALESCE(NEW.is_no_file, false) = true THEN NEW.no_file_at := now(); ELSE NEW.no_file_at := NULL; END IF;
    ELSIF NEW.no_file_at IS DISTINCT FROM OLD.no_file_at THEN
        RAISE EXCEPTION 'no_file_at cannot be changed directly';
    END IF;
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
        IF NOT v_is_manager THEN RAISE EXCEPTION 'Only Moderator can delete orders'; END IF;
        IF COALESCE(NEW.is_deleted, false) = true THEN
            NEW.deleted_by := v_editor; NEW.deleted_at := now();
        ELSE
            NEW.deleted_by := NULL; NEW.deleted_at := NULL;
        END IF;
    ELSIF NEW.deleted_by IS DISTINCT FROM OLD.deleted_by OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RAISE EXCEPTION 'Delete metadata cannot be changed directly';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_orders_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_action text;
    v_summary text;
    v_details jsonb;
    v_previous_audit_flag text;
    v_auto_summary text;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.product_id IS DISTINCT FROM OLD.product_id
       AND public.is_trusted_fgcode_rename_context(OLD.product_id, NEW.product_id) THEN
        RETURN NEW;
    END IF;

    IF COALESCE(current_setting('app.order_internal_write', true), 'off') = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := 'CREATE_ORDER'; v_summary := 'สร้างคำสั่งพิมพ์';
        v_details := jsonb_build_object('order_id', NEW.id, 'product_id', NEW.product_id, 'product_name', NEW.product_name, 'lot_number', NEW.lot_number, 'quantity', NEW.quantity);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'PERMANENT_DELETE_ORDER'; v_summary := 'ลบคำสั่งพิมพ์ถาวร';
        v_details := jsonb_build_object('order_id', OLD.id, 'product_id', OLD.product_id, 'product_name', OLD.product_name, 'lot_number', OLD.lot_number, 'quantity', OLD.quantity, 'created_by', OLD.created_by, 'deleted_by', OLD.deleted_by, 'deleted_at', OLD.deleted_at);
    ELSE
        IF COALESCE(OLD.is_deleted, false) = false AND COALESCE(NEW.is_deleted, false) = true THEN
            v_action := 'DELETE_ORDER'; v_summary := CASE WHEN NEW.edit_summary IS DISTINCT FROM OLD.edit_summary AND NULLIF(btrim(NEW.edit_summary), '') IS NOT NULL THEN NEW.edit_summary ELSE 'ย้ายคำสั่งพิมพ์ไปถังขยะ' END;
            v_details := jsonb_build_object('order_id', NEW.id, 'product_id', NEW.product_id, 'product_name', NEW.product_name, 'lot_number', NEW.lot_number, 'quantity', NEW.quantity, 'created_by', NEW.created_by, 'deleted_by', NEW.deleted_by, 'deleted_at', NEW.deleted_at);
        ELSIF COALESCE(OLD.is_deleted, false) = true AND COALESCE(NEW.is_deleted, false) = false THEN
            v_action := 'RESTORE_FROM_TRASH'; v_summary := CASE WHEN NEW.edit_summary IS DISTINCT FROM OLD.edit_summary AND NULLIF(btrim(NEW.edit_summary), '') IS NOT NULL THEN NEW.edit_summary ELSE 'กู้คืนคำสั่งพิมพ์จากถังขยะ' END;
            v_details := jsonb_build_object('order_id', NEW.id, 'product_id', NEW.product_id, 'product_name', NEW.product_name, 'lot_number', NEW.lot_number);
        ELSIF COALESCE(OLD.is_verified, false) = false AND COALESCE(NEW.is_verified, false) = true THEN
            v_action := 'VERIFY'; v_summary := 'ตรวจสอบและยืนยันคำสั่งพิมพ์'; v_details := NULL;
        ELSIF COALESCE(OLD.is_verified, false) = true AND COALESCE(NEW.is_verified, false) = false THEN
            v_action := 'UNVERIFY'; v_summary := 'ยกเลิกการยืนยันคำสั่งพิมพ์'; v_details := NULL;
        ELSIF COALESCE(OLD.is_cancelled, false) = false AND COALESCE(NEW.is_cancelled, false) = true THEN
            v_action := 'CANCEL'; v_summary := CASE WHEN NEW.edit_summary IS DISTINCT FROM OLD.edit_summary AND NULLIF(btrim(NEW.edit_summary), '') IS NOT NULL THEN NEW.edit_summary ELSE 'ยกเลิกคำสั่งพิมพ์' END; v_details := NULL;
        ELSIF OLD.reconciled_at IS NULL AND NEW.reconciled_at IS NOT NULL THEN
            v_action := 'RECONCILE'; v_summary := 'บันทึกผลผลิต: กระดาษดี ' || COALESCE(NEW.good_a3, 0)::text || ' ใบ, เสีย ' || COALESCE(NEW.waste_a3, 0)::text || ' ใบ'; v_details := NULL;
        ELSIF OLD.reconciled_at IS NOT NULL AND NEW.reconciled_at IS NULL THEN
            v_action := 'CANCEL_RECONCILE'; v_summary := 'ยกเลิกการตัดสต็อคกระดาษ'; v_details := NULL;
        ELSE
            IF (to_jsonb(OLD) - ARRAY['updated_at','updated_by','updated_by_user_id','edit_summary','is_verified','verified_by','verified_by_user_id','verified_at','is_printed','printed_by','printed_by_user_id','printed_at','is_cancelled','is_deleted','deleted_by','deleted_at','is_no_file','no_file_at','paper_type','good_a3','waste_a3','waste_a3_remark','waste_qty','waste_qty_remark','reconciled_by','reconciled_at','qty_per_a3_used'])
                = (to_jsonb(NEW) - ARRAY['updated_at','updated_by','updated_by_user_id','edit_summary','is_verified','verified_by','verified_by_user_id','verified_at','is_printed','printed_by','printed_by_user_id','printed_at','is_cancelled','is_deleted','deleted_by','deleted_at','is_no_file','no_file_at','paper_type','good_a3','waste_a3','waste_a3_remark','waste_qty','waste_qty_remark','reconciled_by','reconciled_at','qty_per_a3_used']) THEN
                RETURN NEW;
            END IF;
            v_action := 'UPDATE';
            IF NEW.edit_summary IS DISTINCT FROM OLD.edit_summary AND NULLIF(btrim(NEW.edit_summary), '') IS NOT NULL THEN
                v_summary := NEW.edit_summary;
            ELSE
                v_auto_summary := concat_ws(', ',
                    CASE WHEN NEW.order_type IS DISTINCT FROM OLD.order_type THEN 'ประเภท: ' || COALESCE(OLD.order_type::text, 'ไม่มี') || ' ➡️ ' || COALESCE(NEW.order_type::text, 'ไม่มี') END,
                    CASE WHEN NEW.product_id IS DISTINCT FROM OLD.product_id THEN 'รหัสสินค้า: ' || COALESCE(OLD.product_id::text, 'ไม่มี') || ' ➡️ ' || COALESCE(NEW.product_id::text, 'ไม่มี') END,
                    CASE WHEN NEW.product_name IS DISTINCT FROM OLD.product_name THEN 'สินค้า: ' || COALESCE(OLD.product_name::text, 'ไม่มี') || ' ➡️ ' || COALESCE(NEW.product_name::text, 'ไม่มี') END,
                    CASE WHEN NEW.lot_number IS DISTINCT FROM OLD.lot_number THEN 'LOT: ' || COALESCE(OLD.lot_number::text, 'ไม่มี') || ' ➡️ ' || COALESCE(NEW.lot_number::text, 'ไม่มี') END,
                    CASE WHEN NEW.quantity IS DISTINCT FROM OLD.quantity THEN 'จำนวน: ' || COALESCE(OLD.quantity::text, 'ไม่มี') || ' ➡️ ' || COALESCE(NEW.quantity::text, 'ไม่มี') END,
                    CASE WHEN NEW.production_date IS DISTINCT FROM OLD.production_date THEN 'วันที่ผลิต: ' || COALESCE(OLD.production_date::text, 'ไม่มี') || ' ➡️ ' || COALESCE(NEW.production_date::text, 'ไม่มี') END,
                    CASE WHEN NEW.expiry_date IS DISTINCT FROM OLD.expiry_date THEN 'วันหมดอายุ: ' || COALESCE(OLD.expiry_date::text, 'ไม่มี') || ' ➡️ ' || COALESCE(NEW.expiry_date::text, 'ไม่มี') END,
                    CASE WHEN NEW.notes IS DISTINCT FROM OLD.notes THEN 'หมายเหตุ: ' || COALESCE(NULLIF(OLD.notes::text, ''), 'ไม่มี') || ' ➡️ ' || COALESCE(NULLIF(NEW.notes::text, ''), 'ไม่มี') END
                );
                v_summary := CASE WHEN NULLIF(btrim(v_auto_summary), '') IS NOT NULL THEN 'แก้ไข: ' || v_auto_summary ELSE 'แก้ไขคำสั่งพิมพ์' END;
            END IF;
            v_details := NULL;
        END IF;
    END IF;

    v_previous_audit_flag := current_setting('app.audit_internal', true);
    PERFORM set_config('app.audit_internal', 'on', true);
    INSERT INTO public.audit_logs (user_id, order_id, action, summary, details)
    VALUES (auth.uid(), CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END, v_action, v_summary, v_details);
    PERFORM set_config('app.audit_internal', COALESCE(v_previous_audit_flag, ''), true);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_audit_log_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_name text;
    v_employee_id text;
    v_is_internal boolean;
BEGIN
    v_is_internal := COALESCE(current_setting('app.audit_internal', true), 'off') = 'on';
    IF auth.role() = 'authenticated' THEN
        IF NEW.action IN ('CREATE_ORDER','UPDATE','VERIFY','UNVERIFY','RECONCILE','CANCEL_RECONCILE','CANCEL','DELETE_ORDER','RESTORE_FROM_TRASH','PERMANENT_DELETE_ORDER','CREATE_PRODUCT','UPDATE_PRODUCT','RENAME_PRODUCT','DELETE_PRODUCT','DELETE_PRODUCTS','CREATE_USER','UPDATE_USER','UPDATE_PROFILE','DELETE_USER','CREATE_STABILITY_FEED','UPDATE_STABILITY_FEED','DELETE_STABILITY_FEED','STOCK_IN','STOCK_DELETE')
           AND NOT v_is_internal THEN
            RAISE EXCEPTION 'This audit action must be generated by the database or trusted server';
        END IF;
        SELECT u.name, u.employee_id INTO v_name, v_employee_id FROM public.users u WHERE u.id = auth.uid();
        IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;
        NEW.user_id := auth.uid();
        NEW.user_name := CASE WHEN NULLIF(btrim(v_employee_id), '') IS NOT NULL THEN v_name || ' (' || v_employee_id || ')' ELSE v_name END;
        NEW.created_at := now(); NEW.ip_address := NULL;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rename_fgcode_manager(
    p_old_id text,
    p_new_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_product public.fgcode%ROWTYPE;
    v_affected_orders integer;
    v_backend_pid integer := pg_backend_pid();
    v_transaction_id bigint := txid_current();
    v_previous_rename_flag text := current_setting('app.fgcode_rename', true);
    v_previous_old_id text := current_setting('app.fgcode_rename_old_id', true);
    v_previous_new_id text := current_setting('app.fgcode_rename_new_id', true);
    v_previous_audit_flag text := current_setting('app.audit_internal', true);
BEGIN
    IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT public.is_user_manager() THEN
        RAISE EXCEPTION 'Only Moderator or Assistant Moderator can change Product ID';
    END IF;

    p_old_id := btrim(p_old_id);
    p_new_id := btrim(p_new_id);
    IF p_old_id = '' OR p_new_id = '' THEN RAISE EXCEPTION 'Product ID cannot be empty'; END IF;
    IF p_old_id = p_new_id THEN RAISE EXCEPTION 'New Product ID must be different'; END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_old_id, p_new_id), 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(GREATEST(p_old_id, p_new_id), 0));

    SELECT * INTO v_product FROM public.fgcode WHERE id = p_old_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product ID "%" not found', p_old_id; END IF;
    IF EXISTS (SELECT 1 FROM public.fgcode WHERE id = p_new_id) THEN RAISE EXCEPTION 'Product ID "%" already exists', p_new_id; END IF;

    SELECT count(*) INTO v_affected_orders FROM public.orders WHERE product_id = p_old_id;

    INSERT INTO public.fgcode_rename_capabilities (
        backend_pid, transaction_id, actor_id, old_product_id, new_product_id
    ) VALUES (
        v_backend_pid, v_transaction_id, auth.uid(), p_old_id, p_new_id
    );
    PERFORM set_config('app.fgcode_rename', 'on', true);
    PERFORM set_config('app.fgcode_rename_old_id', p_old_id, true);
    PERFORM set_config('app.fgcode_rename_new_id', p_new_id, true);

    UPDATE public.fgcode SET id = p_new_id WHERE id = p_old_id;

    PERFORM set_config('app.audit_internal', 'on', true);
    INSERT INTO public.audit_logs (action, details, changes)
    VALUES (
        'RENAME_PRODUCT',
        jsonb_build_object('old_product_id', p_old_id, 'new_product_id', p_new_id, 'product_name', v_product.name, 'affected_orders', v_affected_orders),
        jsonb_build_object('id', jsonb_build_object('old', p_old_id, 'new', p_new_id))
    );
    PERFORM set_config('app.audit_internal', COALESCE(v_previous_audit_flag, ''), true);

    DELETE FROM public.fgcode_rename_capabilities
    WHERE backend_pid = v_backend_pid AND transaction_id = v_transaction_id;
    PERFORM set_config('app.fgcode_rename', COALESCE(v_previous_rename_flag, ''), true);
    PERFORM set_config('app.fgcode_rename_old_id', COALESCE(v_previous_old_id, ''), true);
    PERFORM set_config('app.fgcode_rename_new_id', COALESCE(v_previous_new_id, ''), true);
    RETURN v_affected_orders;
END;
$function$;

REVOKE ALL ON FUNCTION public.rename_fgcode_manager(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rename_fgcode_manager(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rename_fgcode_manager(text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rename_fgcode_manager(text, text) TO authenticated;
