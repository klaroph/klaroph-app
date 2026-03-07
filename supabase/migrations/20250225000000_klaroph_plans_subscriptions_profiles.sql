-- KlaroPH: profiles, plans, subscriptions, goals alignment + RLS + get_user_features + new user trigger
-- Free: max 2 goals. Pro: max 20 goals. Backend enforces; frontend uses get_user_features only.

-- 1) Profiles (id = auth.users.id; do NOT store plan_type here)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Onboarding / plan summary (optional)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_income numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS income_frequency text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS savings_percent numeric;

-- 2) Plans (seed free + pro)
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  max_goals int NOT NULL,
  has_simulator boolean NOT NULL DEFAULT false,
  has_scenarios boolean NOT NULL DEFAULT false,
  has_smart_insights boolean NOT NULL DEFAULT false,
  has_export boolean NOT NULL DEFAULT false,
  has_analytics boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed plans (idempotent)
INSERT INTO plans (name, max_goals, has_simulator, has_scenarios, has_smart_insights, has_export, has_analytics)
VALUES
  ('free', 2, false, false, false, false, false),
  ('pro', 20, true, true, true, true, true)
ON CONFLICT (name) DO UPDATE SET
  max_goals = EXCLUDED.max_goals,
  has_simulator = EXCLUDED.has_simulator,
  has_scenarios = EXCLUDED.has_scenarios,
  has_smart_insights = EXCLUDED.has_smart_insights,
  has_export = EXCLUDED.has_export,
  has_analytics = EXCLUDED.has_analytics;

-- 3) Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL CHECK (status IN ('active', 'canceled', 'expired', 'trial')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '1 year'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 4) Goals: ensure table exists with required columns (saved_amount, created_at; optional pinned_at for focus order)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'goals') THEN
    CREATE TABLE goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      name text NOT NULL,
      target_amount numeric NOT NULL CHECK (target_amount > 0),
      saved_amount numeric NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      pinned_at timestamptz
    );
  ELSE
    ALTER TABLE goals ADD COLUMN IF NOT EXISTS saved_amount numeric NOT NULL DEFAULT 0;
    ALTER TABLE goals ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE goals ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
    -- Ensure constraint exists (ignore if already present)
    BEGIN
      ALTER TABLE goals ADD CONSTRAINT goals_saved_amount_nonneg CHECK (saved_amount >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 5) RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- Profiles: own row only
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Plans: read for all authenticated
DROP POLICY IF EXISTS "plans_select_all" ON plans;
CREATE POLICY "plans_select_all" ON plans FOR SELECT TO authenticated USING (true);

-- Subscriptions: own only
DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Goals: own only (select, insert, update, delete)
DROP POLICY IF EXISTS "goals_select_own" ON goals;
CREATE POLICY "goals_select_own" ON goals FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "goals_insert_own" ON goals;
CREATE POLICY "goals_insert_own" ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "goals_update_own" ON goals;
CREATE POLICY "goals_update_own" ON goals FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "goals_delete_own" ON goals;
CREATE POLICY "goals_delete_own" ON goals FOR DELETE USING (auth.uid() = user_id);

-- 6) get_user_features(user_id) → plan_name, max_goals, has_simulator, has_scenarios, has_smart_insights, has_export, has_analytics
CREATE OR REPLACE FUNCTION get_user_features(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'plan_name', p.name,
        'max_goals', p.max_goals,
        'has_simulator', p.has_simulator,
        'has_scenarios', p.has_scenarios,
        'has_smart_insights', p.has_smart_insights,
        'has_export', p.has_export,
        'has_analytics', p.has_analytics
      )
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = p_user_id AND s.status = 'active'
      LIMIT 1
    ),
    -- default to free if no active subscription
    (SELECT jsonb_build_object(
      'plan_name', 'free',
      'max_goals', 2,
      'has_simulator', false,
      'has_scenarios', false,
      'has_smart_insights', false,
      'has_export', false,
      'has_analytics', false
    ) FROM plans WHERE name = 'free' LIMIT 1)
  );
$$;

-- 7) New user: create profile + free subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_plan_id uuid;
BEGIN
  INSERT INTO profiles (id, full_name, created_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), now());

  SELECT id INTO free_plan_id FROM plans WHERE name = 'free' LIMIT 1;
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (NEW.id, free_plan_id, 'active', now(), now() + interval '1 year');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant execute to authenticated users (for get_user_features from client or server)
GRANT EXECUTE ON FUNCTION get_user_features(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_features(uuid) TO service_role;
