-- Apply/validate must not insert voucher_redemptions; consumption is webhook-only (used_count + optional redemption row later).

CREATE OR REPLACE FUNCTION public.validate_voucher (p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v vouchers%ROWTYPE;
BEGIN
  SELECT *
  INTO v
  FROM vouchers
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF NOT v.is_active THEN
    RETURN jsonb_build_object('ok', false, 'code', 'inactive');
  END IF;

  IF v.expires_at IS NOT NULL AND v.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  IF v.max_uses IS NOT NULL AND v.used_count >= v.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'code', 'limit_reached');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'type', v.type,
    'value', v.value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_voucher (text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_voucher (text) TO service_role;

DROP FUNCTION IF EXISTS public.redeem_voucher (text, uuid);
