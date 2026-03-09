-- Simulate 30-day budget trial expiry for testing (auth.users is read-only in dashboard).
-- When true, user is treated as if account is older than 30 days for budget editing only.
-- Toggle in Table Editor: profiles.simulate_budget_expired = true/false.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS simulate_budget_expired boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.simulate_budget_expired IS 'If true, budget editing is locked (simulates post-30-day trial). For testing only.';
