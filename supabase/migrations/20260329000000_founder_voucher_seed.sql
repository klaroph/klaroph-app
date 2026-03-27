-- Founder promo voucher: fixed-amount code with capped paid activations.
-- Note: checkout uses server-side founder final-price logic (₱1299).

INSERT INTO vouchers (code, type, value, max_uses, used_count, expires_at, is_active)
VALUES ('FNDRUSER1299', 'fixed', 1299, 300, 0, NULL, true)
ON CONFLICT (code)
DO UPDATE SET
  type = EXCLUDED.type,
  value = EXCLUDED.value,
  max_uses = EXCLUDED.max_uses,
  expires_at = EXCLUDED.expires_at,
  is_active = EXCLUDED.is_active;
