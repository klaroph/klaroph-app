-- Lifetime Pro support for founders promo purchasers.

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS is_lifetime boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_subscriptions_is_lifetime
ON subscriptions (is_lifetime)
WHERE is_lifetime = true;
