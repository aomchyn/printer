-- ============================================================
-- PRODUCT -> ORDER EDIT HISTORY
-- ============================================================


-- ============================================================
-- 1. สร้าง edit_summary จาก product fields ที่เปลี่ยนจริง
--
-- รองรับ:
-- - เปลี่ยนรหัสสินค้า
-- - เปลี่ยนชื่อสินค้า
-- - เปลี่ยนอายุผลิตภัณฑ์
-- - เปลี่ยนหลายอย่างพร้อมกัน
-- ============================================================

CREATE OR REPLACE FUNCTION public.prepare_order_product_edit_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_changes text;
BEGIN

    -- ไม่มี product field เปลี่ยนจริง
    IF NEW.product_id IS NOT DISTINCT FROM OLD.product_id
       AND NEW.product_name IS NOT DISTINCT FROM OLD.product_name
       AND NEW.product_exp IS NOT DISTINCT FROM OLD.product_exp
    THEN
        RETURN NEW;
    END IF;


    v_changes := concat_ws(
        ' | ',

        CASE
            WHEN NEW.product_id IS DISTINCT FROM OLD.product_id
            THEN format(
                'รหัสสินค้า: %s ➡️ %s',
                COALESCE(OLD.product_id, 'ไม่มี'),
                COALESCE(NEW.product_id, 'ไม่มี')
            )
        END,

        CASE
            WHEN NEW.product_name IS DISTINCT FROM OLD.product_name
            THEN format(
                'ชื่อสินค้า: %s ➡️ %s',
                COALESCE(OLD.product_name, 'ไม่มี'),
                COALESCE(NEW.product_name, 'ไม่มี')
            )
        END,

        CASE
            WHEN NEW.product_exp IS DISTINCT FROM OLD.product_exp
            THEN format(
                'อายุผลิตภัณฑ์: %s ➡️ %s เดือน',
                COALESCE(OLD.product_exp, 'ไม่มี'),
                COALESCE(NEW.product_exp, 'ไม่มี')
            )
        END
    );


    IF NULLIF(btrim(v_changes), '') IS NOT NULL THEN
        NEW.edit_summary := 'แก้ไข: ' || v_changes;
    END IF;


    RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS trg_prepare_order_product_edit_summary
ON public.orders;

CREATE TRIGGER trg_prepare_order_product_edit_summary
BEFORE UPDATE OF
    product_id,
    product_name,
    product_exp
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prepare_order_product_edit_summary();


-- ============================================================
-- 2. Audit เฉพาะ internal Product -> Order sync
--
-- audit_orders_changes() เดิมตั้งใจ skip internal write
-- ดังนั้นสร้าง audit เฉพาะ product field sync ตรงนี้
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_order_product_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_previous_audit_flag text;
BEGIN

    -- ทำงานเฉพาะ internal order sync
    IF COALESCE(
        current_setting(
            'app.order_internal_write',
            true
        ),
        'off'
    ) <> 'on'
    THEN
        RETURN NEW;
    END IF;


    -- ไม่มี product field เปลี่ยนจริง
    IF NEW.product_id IS NOT DISTINCT FROM OLD.product_id
       AND NEW.product_name IS NOT DISTINCT FROM OLD.product_name
       AND NEW.product_exp IS NOT DISTINCT FROM OLD.product_exp
    THEN
        RETURN NEW;
    END IF;


    -- ต้องมี summary ที่สร้างจาก trigger ก่อนหน้า
    IF NULLIF(
        btrim(
            COALESCE(
                NEW.edit_summary,
                ''
            )
        ),
        ''
    ) IS NULL
    THEN
        RETURN NEW;
    END IF;


    v_previous_audit_flag :=
        current_setting(
            'app.audit_internal',
            true
        );


    PERFORM set_config(
        'app.audit_internal',
        'on',
        true
    );


    INSERT INTO public.audit_logs (
        order_id,
        action,
        summary,
        details
    )
    VALUES (
        NEW.id,
        'UPDATE',
        NEW.edit_summary,
        jsonb_build_object(
            'source',
            'product_sync',

            'product_id',
            NEW.product_id,

            'product_name',
            NEW.product_name,

            'product_exp',
            NEW.product_exp
        )
    );


    PERFORM set_config(
        'app.audit_internal',
        COALESCE(
            v_previous_audit_flag,
            ''
        ),
        true
    );


    RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS trg_audit_order_product_sync
ON public.orders;

CREATE TRIGGER trg_audit_order_product_sync
AFTER UPDATE OF
    product_id,
    product_name,
    product_exp
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.audit_order_product_sync();