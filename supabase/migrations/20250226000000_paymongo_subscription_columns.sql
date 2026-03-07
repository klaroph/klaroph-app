-- PayMongo integration: extend subscriptions table with payment provider fields
-- and relax constraints for PayMongo-managed subscription lifecycle.

-- Add PayMongo-specific columns
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paymongo_subscription_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paymongo_customer_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paymongo_checkout_session_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'manual';

-- Drop the old CHECK constraint on status and re-add with expanded values
DO $$
BEGIN
  ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'canceled', 'expired', 'trial', 'past_due', 'unpaid', 'incomplete'));
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Index for webhook lookups (idempotency + fast retrieval)
CREATE INDEX IF NOT EXISTS idx_subscriptions_paymongo_checkout
  ON subscriptions (paymongo_checkout_session_id)
  WHERE paymongo_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_paymongo_sub
  ON subscriptions (paymongo_subscription_id)
  WHERE paymongo_subscription_id IS NOT NULL;

-- Payment events log for audit trail and idempotency
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on payment_events: service_role only (webhooks use service role)
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Allow subscriptions update from service_role (webhook handler)
DROP POLICY IF EXISTS "subscriptions_service_update" ON subscriptions;
CREATE POLICY "subscriptions_service_update" ON subscriptions
  FOR UPDATE TO service_role USING (true);

DROP POLICY IF EXISTS "subscriptions_service_insert" ON subscriptions;
CREATE POLICY "subscriptions_service_insert" ON subscriptions
  FOR INSERT TO service_role WITH CHECK (true);
