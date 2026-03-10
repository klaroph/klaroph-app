-- Auditability: store user_id with each confirmation email record.
-- Idempotency unchanged (event_id remains primary key).

ALTER TABLE premium_confirmation_emails
  ADD COLUMN IF NOT EXISTS user_id uuid NULL;

COMMENT ON COLUMN premium_confirmation_emails.user_id IS 'User who received the premium confirmation email. Optional, for auditability.';
