-- CSV import usage: free users get 2 successful imports lifetime; Pro unlimited.
-- Failed/cancelled imports do not count. Server enforces quota.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS import_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.import_count IS 'Number of successful CSV imports (expenses). Free plan limit 2; Pro unlimited.';
