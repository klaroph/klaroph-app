-- Fix get_user_features: grant Pro when status = 'active' AND current_period_end > now().
-- UUID columns (subscriptions.plan_id, plans.id) only compared/joined to each other.
-- Plan display name comes from plans.name (text); never compare UUID to 'pro' or 'free'.
-- Force replacement so old buggy body (ROWTYPE / positional INTO) is removed.

DROP FUNCTION IF EXISTS get_user_features(uuid);

CREATE OR REPLACE FUNCTION get_user_features(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_plan_id uuid;
  plan_name_text text;
  plan_max_goals int;
  plan_has_simulator boolean;
  plan_has_scenarios boolean;
  plan_has_smart_insights boolean;
  plan_has_export boolean;
  plan_has_analytics boolean;
BEGIN
  -- 1) Active subscription in period: s.plan_id (uuid) JOIN plans.id (uuid), use plans.name (text) for result
  SELECT s.plan_id INTO sub_plan_id
  FROM subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.current_period_end > now()
  ORDER BY s.current_period_end DESC
  LIMIT 1;

  IF FOUND AND sub_plan_id IS NOT NULL THEN
    SELECT p.name, p.max_goals, p.has_simulator, p.has_scenarios, p.has_smart_insights, p.has_export, p.has_analytics
      INTO plan_name_text, plan_max_goals, plan_has_simulator, plan_has_scenarios, plan_has_smart_insights, plan_has_export, plan_has_analytics
      FROM plans p
      WHERE p.id = sub_plan_id
      LIMIT 1;
    IF FOUND THEN
      IF plan_name_text = 'pro' THEN
        plan_name_text := 'clarity_premium';
      END IF;
      RETURN jsonb_build_object(
        'plan_name', plan_name_text,
        'max_goals', plan_max_goals,
        'has_simulator', plan_has_simulator,
        'has_scenarios', plan_has_scenarios,
        'has_smart_insights', plan_has_smart_insights,
        'has_export', plan_has_export,
        'has_analytics', plan_has_analytics,
        'is_grace', false,
        'can_create_goals', true
      );
    END IF;
  END IF;

  -- 2) Past due but in grace: same, plan_id (uuid) -> plans.id (uuid), plans.name (text)
  SELECT s.plan_id INTO sub_plan_id
  FROM subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'past_due'
    AND s.grace_period_until IS NOT NULL
    AND now() < s.grace_period_until
  ORDER BY s.grace_period_until DESC
  LIMIT 1;

  IF FOUND AND sub_plan_id IS NOT NULL THEN
    SELECT p.name, p.max_goals, p.has_simulator, p.has_scenarios, p.has_smart_insights, p.has_export, p.has_analytics
      INTO plan_name_text, plan_max_goals, plan_has_simulator, plan_has_scenarios, plan_has_smart_insights, plan_has_export, plan_has_analytics
      FROM plans p
      WHERE p.id = sub_plan_id
      LIMIT 1;
    IF FOUND THEN
      IF plan_name_text = 'pro' THEN
        plan_name_text := 'clarity_premium';
      END IF;
      RETURN jsonb_build_object(
        'plan_name', plan_name_text,
        'max_goals', plan_max_goals,
        'has_simulator', plan_has_simulator,
        'has_scenarios', plan_has_scenarios,
        'has_smart_insights', plan_has_smart_insights,
        'has_export', plan_has_export,
        'has_analytics', plan_has_analytics,
        'is_grace', true,
        'can_create_goals', false
      );
    END IF;
  END IF;

  -- 3) No active or grace row: return free (lookup by plans.name text, not UUID)
  SELECT p.max_goals, p.has_simulator, p.has_scenarios, p.has_smart_insights, p.has_export, p.has_analytics
    INTO plan_max_goals, plan_has_simulator, plan_has_scenarios, plan_has_smart_insights, plan_has_export, plan_has_analytics
    FROM plans p
    WHERE p.name = 'free'
    LIMIT 1;
  RETURN jsonb_build_object(
    'plan_name', 'free',
    'max_goals', COALESCE(plan_max_goals, 2),
    'has_simulator', COALESCE(plan_has_simulator, false),
    'has_scenarios', COALESCE(plan_has_scenarios, false),
    'has_smart_insights', COALESCE(plan_has_smart_insights, false),
    'has_export', COALESCE(plan_has_export, false),
    'has_analytics', COALESCE(plan_has_analytics, false),
    'is_grace', false,
    'can_create_goals', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_features(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_features(uuid) TO service_role;
