-- Clean slate: delete all user-generated data. Schema, auth, plans, and subscriptions are kept.
-- Order respects foreign keys: income_allocations -> goals; then independent tables.
--
-- CLI execution (via Supabase CLI workflow / npm):
--
-- Using Node (works without psql):
--   npm run db:fix-schema   -- adds income_source if missing
--   npm run db:clean        -- truncates user data
--
-- Requires DATABASE_URL in .env.local for remote, or local Supabase (supabase start).
-- Get DB URL: Supabase Dashboard → Settings → Database → Connection string (URI)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'income_allocations') THEN
    TRUNCATE TABLE income_allocations CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'goals') THEN
    TRUNCATE TABLE goals CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'income_records') THEN
    TRUNCATE TABLE income_records CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    TRUNCATE TABLE expenses CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'assets') THEN
    TRUNCATE TABLE assets CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'liabilities') THEN
    TRUNCATE TABLE liabilities CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'financial_accounts') THEN
    TRUNCATE TABLE financial_accounts CASCADE;
  END IF;
END $$;

-- Optional: reset profile completion/gamification (keeps profile row, clears optional fields)
-- Uncomment if you want a full profile reset too:
-- UPDATE profiles SET
--   nickname = NULL, monthly_income_range = NULL, primary_goal_category = NULL,
--   savings_confidence = NULL, dream_statement = NULL, profile_completion_percentage = 0,
--   clarity_level = 1, streak_days = 0, badges_json = '[]'
-- WHERE id IN (SELECT id FROM auth.users);
