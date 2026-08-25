-- Phase 1A: additive schema only.
-- No triggers, sync behavior, audit behavior, or existing date values are changed here.

ALTER TABLE public.fgcode
    ADD COLUMN expiry_offset_days integer NOT NULL DEFAULT 0,
    ADD COLUMN printing_config jsonb;

ALTER TABLE public.orders
    ADD COLUMN expiry_offset_days_used integer NOT NULL DEFAULT 0,
    ADD COLUMN printing_config_used jsonb;

ALTER TABLE public.fgcode
    ADD CONSTRAINT fgcode_expiry_offset_days_v1_check
        CHECK (expiry_offset_days IN (0, -1)),
    ADD CONSTRAINT fgcode_printing_config_v1_basic_check
        CHECK (
            printing_config IS NULL
            OR (
                jsonb_typeof(printing_config) = 'object'
                AND printing_config ? 'version'
                AND jsonb_typeof(printing_config -> 'version') = 'number'
                AND printing_config ->> 'version' = '1'
                AND (
                    NOT (printing_config ? 'exp_offset_days')
                    OR (
                        jsonb_typeof(printing_config -> 'exp_offset_days') = 'number'
                        AND printing_config ->> 'exp_offset_days' IN ('0', '-1')
                    )
                )
            )
        );

ALTER TABLE public.orders
    ADD CONSTRAINT orders_expiry_offset_days_used_v1_check
        CHECK (expiry_offset_days_used IN (0, -1)),
    ADD CONSTRAINT orders_printing_config_used_v1_basic_check
        CHECK (
            printing_config_used IS NULL
            OR (
                jsonb_typeof(printing_config_used) = 'object'
                AND printing_config_used ? 'version'
                AND jsonb_typeof(printing_config_used -> 'version') = 'number'
                AND printing_config_used ->> 'version' = '1'
                AND (
                    NOT (printing_config_used ? 'exp_offset_days')
                    OR (
                        jsonb_typeof(printing_config_used -> 'exp_offset_days') = 'number'
                        AND printing_config_used ->> 'exp_offset_days' IN ('0', '-1')
                    )
                )
            )
        );
