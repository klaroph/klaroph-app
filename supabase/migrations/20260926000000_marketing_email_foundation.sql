-- Marketing email foundation (KlaroPH V2 campaigns delivered through Resend).
-- KlaroPH stays the source of truth for recipients; Resend only delivers.
--
-- 1. profiles.marketing_emails_unsubscribed_at
--    Set once when a user unsubscribes from marketing email. Campaign audiences
--    exclude every profile where this is NOT NULL. Transactional email is unaffected.
--
-- 2. public.marketing_email_sends
--    One row per (campaign, user). The primary key is the duplicate-send guard:
--    a user is claimed ('pending') before delivery and marked 'sent' afterwards,
--    so re-running a campaign never emails the same user twice.
--    Service role only: RLS enabled with no policies.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_emails_unsubscribed_at timestamptz;

COMMENT ON COLUMN public.profiles.marketing_emails_unsubscribed_at IS
  'When the user unsubscribed from KlaroPH marketing email. NULL = still subscribed.';

CREATE TABLE IF NOT EXISTS public.marketing_email_sends (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  resend_email_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (campaign_id, user_id)
);

COMMENT ON TABLE public.marketing_email_sends IS
  'Marketing campaign delivery log and duplicate-send guard. Service role only.';

ALTER TABLE public.marketing_email_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketing_email_sends FROM anon, authenticated;
