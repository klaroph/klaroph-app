-- Legal consent tracking on profiles (nullable for existing users).
-- Do not overwrite existing values; set only when recording new consent.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_version text;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'When the user last accepted the Terms & Conditions.';
COMMENT ON COLUMN public.profiles.privacy_accepted_at IS 'When the user last accepted the Privacy Policy.';
COMMENT ON COLUMN public.profiles.terms_version IS 'Version of Terms accepted (e.g. 2025-02).';
COMMENT ON COLUMN public.profiles.privacy_version IS 'Version of Privacy Policy accepted (e.g. 2025-02).';
