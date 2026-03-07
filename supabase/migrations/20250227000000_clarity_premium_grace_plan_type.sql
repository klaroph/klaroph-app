-- Clarity Premium: plan_type (free|monthly|annual), 3-day grace, auto_renew, status 'free'
-- Both monthly and annual map to plan_name 'clarity_premium'. No refunds; cancel anytime; access until period end.

-- 1) Add new columns to subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'free';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_until timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_used boolean NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;

-- 2) Constrain plan_type
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (plan_type IN ('free', 'monthly', 'annual'));

-- 3) Add status 'free' to existing constraint (drop + re-add)
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('free', 'active', 'canceled', 'expired', 'trial', 'past_due', 'unpaid', 'incomplete'));

-- 4) Seed plan clarity_premium (same capabilities as pro; used for PayMongo checkouts)
INSERT INTO plans (name, max_goals, has_simulator, has_scenarios, has_smart_insights, has_export, has_analytics)
VALUES
  ('clarity_premium', 20, true, true, true, true, true)
ON CONFLICT (name) DO UPDATE SET
  max_goals = EXCLUDED.max_goals,
  has_simulator = EXCLUDED.has_simulator,
  has_scenarios = EXCLUDED.has_scenarios,
  has_smart_insights = EXCLUDED.has_smart_insights,
  has_export = EXCLUDED.has_export,
  has_analytics = EXCLUDED.has_analytics;

-- 5) get_user_features: return plan features; consider active/past_due/grace/expired/free
-- Returns: plan_name, max_goals, has_*, is_grace (true if past_due and in grace), can_create_goals
CREATE OR REPLACE FUNCTION get_user_features(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_row subscriptions%ROWTYPE;
  plan_row plans%ROWTYPE;
  in_grace boolean;
  effective_plan_name text;
  effective_max_goals int;
BEGIN
  SELECT * INTO sub_row FROM subscriptions WHERE user_id = p_user_id LIMIT 1;

  IF NOT FOUND THEN
    SELECT name, max_goals, has_simulator, has_scenarios, has_smart_insights, has_export, has_analytics
      INTO plan_row FROM plans WHERE name = 'free' LIMIT 1;
    RETURN jsonb_build_object(
      'plan_name', 'free',
      'max_goals', COALESCE(plan_row.max_goals, 2),
      'has_simulator', COALESCE(plan_row.has_simulator, false),
      'has_scenarios', COALESCE(plan_row.has_scenarios, false),
      'has_smart_insights', COALESCE(plan_row.has_smart_insights, false),
      'has_export', COALESCE(plan_row.has_export, false),
      'has_analytics', COALESCE(plan_row.has_analytics, false),
      'is_grace', false,
      'can_create_goals', true
    );
  END IF;

  -- Past due and grace expired → return free (API/cron should set status = 'expired')
  IF sub_row.status = 'past_due' AND sub_row.grace_period_until IS NOT NULL
     AND now() >= sub_row.grace_period_until THEN
    sub_row.status := 'expired';
  END IF;

  in_grace := (sub_row.status = 'past_due' AND sub_row.grace_period_until IS NOT NULL AND now() < sub_row.grace_period_until);

  IF sub_row.status = 'active' OR in_grace THEN
    SELECT name, max_goals, has_simulator, has_scenarios, has_smart_insights, has_export, has_analytics
      INTO plan_row FROM plans WHERE id = sub_row.plan_id LIMIT 1;
    IF FOUND THEN
      effective_plan_name := plan_row.name;
      effective_max_goals := plan_row.max_goals;
      -- Map legacy 'pro' to 'clarity_premium' for display
      IF effective_plan_name = 'pro' THEN
        effective_plan_name := 'clarity_premium';
      END IF;
      RETURN jsonb_build_object(
        'plan_name', effective_plan_name,
        'max_goals', effective_max_goals,
        'has_simulator', plan_row.has_simulator,
        'has_scenarios', plan_row.has_scenarios,
        'has_smart_insights', plan_row.has_smart_insights,
        'has_export', plan_row.has_export,
        'has_analytics', plan_row.has_analytics,
        'is_grace', in_grace,
        'can_create_goals', NOT in_grace
      );
    END IF;
  END IF;

  -- Free / expired / canceled
  SELECT name, max_goals, has_simulator, has_scenarios, has_smart_insights, has_export, has_analytics
    INTO plan_row FROM plans WHERE name = 'free' LIMIT 1;
  RETURN jsonb_build_object(
    'plan_name', 'free',
    'max_goals', COALESCE(plan_row.max_goals, 2),
    'has_simulator', COALESCE(plan_row.has_simulator, false),
    'has_scenarios', COALESCE(plan_row.has_scenarios, false),
    'has_smart_insights', COALESCE(plan_row.has_smart_insights, false),
    'has_export', COALESCE(plan_row.has_export, false),
    'has_analytics', COALESCE(plan_row.has_analytics, false),
    'is_grace', false,
    'can_create_goals', true
  );
END;
$$;

-- 6) New user: create free subscription with status 'free', plan_type 'free'
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
    INSERT INTO subscriptions (user_id, plan_id, status, plan_type, current_period_start, current_period_end, auto_renew)
    VALUES (NEW.id, free_plan_id, 'free', 'free', now(), now() + interval '1 year', false);
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_features(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_features(uuid) TO service_role;
