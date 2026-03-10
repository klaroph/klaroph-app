-- Idempotency for premium payment confirmation email: one send per webhook event.
-- Webhook inserts event_id before sending; duplicate events skip send.

CREATE TABLE IF NOT EXISTS premium_confirmation_emails (
  event_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE premium_confirmation_emails IS 'Tracks premium confirmation email sent per PayMongo webhook event_id. Prevents duplicate sends.';
