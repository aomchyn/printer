-- Keep image attachment operations traceable without presenting them as
-- meaningful Order metadata edits in the Dashboard Edit History.

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
    v_image_operation text;
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
        ELSIF NEW.image_url IS DISTINCT FROM OLD.image_url
              AND (to_jsonb(OLD) - 'image_url') = (to_jsonb(NEW) - 'image_url') THEN
            v_image_operation := CASE
                WHEN OLD.image_url IS NULL THEN 'add'
                WHEN NEW.image_url IS NULL THEN 'delete'
                ELSE 'replace'
            END;
            v_action := 'UPDATE_ORDER_IMAGE';
            v_summary := CASE v_image_operation
                WHEN 'add' THEN 'เพิ่มรูปภาพคำสั่งพิมพ์'
                WHEN 'delete' THEN 'ลบรูปภาพคำสั่งพิมพ์'
                ELSE 'เปลี่ยนรูปภาพคำสั่งพิมพ์'
            END;
            v_details := jsonb_build_object('operation', v_image_operation);
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

-- Treat the dedicated image action like the other trigger-owned audit actions.
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
        IF NEW.action IN ('CREATE_ORDER','UPDATE','UPDATE_ORDER_IMAGE','VERIFY','UNVERIFY','RECONCILE','CANCEL_RECONCILE','CANCEL','DELETE_ORDER','RESTORE_FROM_TRASH','PERMANENT_DELETE_ORDER','CREATE_PRODUCT','UPDATE_PRODUCT','RENAME_PRODUCT','DELETE_PRODUCT','DELETE_PRODUCTS','CREATE_USER','UPDATE_USER','UPDATE_PROFILE','DELETE_USER','CREATE_STABILITY_FEED','UPDATE_STABILITY_FEED','DELETE_STABILITY_FEED','STOCK_IN','STOCK_DELETE','CREATE_PRINTING_DATE_FORMAT','UPDATE_PRINTING_DATE_FORMAT','DELETE_PRINTING_DATE_FORMAT')
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
