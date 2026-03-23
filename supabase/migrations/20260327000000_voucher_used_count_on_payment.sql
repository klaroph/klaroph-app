-- Redeem records redemption only; used_count increments after successful payment (webhook).

CREATE OR REPLACE FUNCTION public.redeem_voucher (p_code text, p_user_id uuid)
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

  BEGIN
    INSERT INTO voucher_redemptions (user_id, voucher_id)
    VALUES (p_user_id, v.id);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'code', 'already_redeemed');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'type', v.type,
    'value', v.value
  );
END;
$$;

-- Called from PayMongo webhook after successful Pro payment (best-effort; does not block fulfillment).
CREATE OR REPLACE FUNCTION public.increment_voucher_used_count (p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE vouchers
  SET used_count = used_count + 1
  WHERE code = upper(trim(p_code));
END;
$$;

REVOKE ALL ON FUNCTION public.increment_voucher_used_count (text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_voucher_used_count (text) TO service_role;
