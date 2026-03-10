-- Idempotency for welcome email: send at most once per user.
-- auth/callback sends welcome email when this column is null, then sets it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.welcome_email_sent_at IS 'When the welcome email was sent (Resend). Null = not sent yet. Set after first successful send.';
