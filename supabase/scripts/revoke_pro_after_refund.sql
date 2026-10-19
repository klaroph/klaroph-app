-- Manual refund. One transaction. Edit the four values in the block below.
-- Does not listen for a PayMongo refund webhook.
--
-- Migration B excludes a payment when another payment_events row has
-- event_type ILIKE '%refund%' and names the same payment id at either
--   payload #>> '{data,attributes,data,id}'
--   payload #>> '{data,attributes,data,attributes,payment_id}'
-- This insert sets both paths, and event_type 'manual.refund' matches that
-- filter, so a later run of migration B does not grant that payment.
--
-- Run with psql or: supabase db query -f supabase/scripts/revoke_pro_after_refund.sql
-- See supabase/scripts/REFUND_RUNBOOK.md.

BEGIN;

DO $refund$
DECLARE
  -- EDIT THESE FOUR VALUES.
  v_user_id uuid := '00000000-0000-0000-0000-000000000000';
  v_payment_id text := 'pay_replace_me';
  v_reason text := 'replace with the refund reason';
  v_operator text := 'replace with the operator name';
  v_free uuid;
  v_updated int;
BEGIN
  IF v_user_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR v_payment_id = 'pay_replace_me'
     OR v_reason = 'replace with the refund reason'
     OR v_operator = 'replace with the operator name' THEN
    RAISE EXCEPTION 'edit user_id, payment id, reason, and operator before running';
  END IF;

  SELECT id INTO v_free FROM public.plans WHERE name = 'free' LIMIT 1;
  IF v_free IS NULL THEN
    RAISE EXCEPTION 'free plan is missing';
  END IF;

  UPDATE public.subscriptions
  SET is_lifetime = false,
      plan_id = v_free,
      status = 'canceled'
  WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'expected one subscription for %, updated %', v_user_id, v_updated;
  END IF;

  INSERT INTO public.payment_events (event_id, event_type, payload)
  VALUES (
    'manual.refund:' || v_payment_id,
    'manual.refund',
    jsonb_build_object(
      'data', jsonb_build_object(
        'attributes', jsonb_build_object(
          'data', jsonb_build_object(
            'id', v_payment_id,
            'attributes', jsonb_build_object(
              'payment_id', v_payment_id,
              'reason', v_reason,
              'operator', v_operator
            )
          )
        )
      )
    )
  );
END $refund$;

COMMIT;
