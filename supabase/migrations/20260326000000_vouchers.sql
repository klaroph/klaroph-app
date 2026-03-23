-- Lightweight voucher / promo codes (server-side redeem via service role).

CREATE TABLE IF NOT EXISTS vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value numeric NOT NULL,
  max_uses int,
  used_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers (code);

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  voucher_id uuid NOT NULL REFERENCES vouchers (id) ON DELETE RESTRICT,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, voucher_id)
);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user ON voucher_redemptions (user_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON voucher_redemptions (voucher_id);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated: access only via service_role (API routes).

-- Atomically validate, record redemption, and bump usage (avoids partial updates under concurrency).
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

  UPDATE vouchers
  SET used_count = used_count + 1
  WHERE id = v.id;

  RETURN jsonb_build_object(
    'ok', true,
    'type', v.type,
    'value', v.value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_voucher (text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_voucher (text, uuid) TO service_role;
