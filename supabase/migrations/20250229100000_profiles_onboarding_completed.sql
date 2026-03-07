-- First-time onboarding completion stored in DB so modal triggers even if localStorage is cleared.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN profiles.onboarding_completed IS 'Set true after user completes first-time flow; used to show FirstTimeFlow on first login.';
