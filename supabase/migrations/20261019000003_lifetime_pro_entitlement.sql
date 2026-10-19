-- Lifetime is Pro on its own: is_lifetime OR the previous condition.
-- A lifetime row stays Pro when its plan is free, its status is expired or
-- canceled, or current_period_end is in the past.
--
-- CREATE OR REPLACE only. Signatures, security, search_path, and grants match
-- main. get_user_features stays revoked from PUBLIC, anon, and authenticated
-- (20261019000000). get_founder_metrics stays executable by service_role.
--
-- Migration A counted is_lifetime only together with a pro or clarity_premium
-- plan name, so a lifetime row on the free plan was left out of pro_users.
-- This replaces that predicate with is_lifetime OR (active period AND a pro
-- plan name).
--
-- Do not db push. Apply with the other one-time Pro files, after A and B:
--   supabase db query -f supabase/migrations/20261019000003_lifetime_pro_entitlement.sql
--   supabase migration repair --status applied 20261019000003

CREATE OR REPLACE FUNCTION public.is_free_analytics_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT NOT (
        COALESCE(s.is_lifetime, false)
        OR (
          p.name IS DISTINCT FROM 'free'
          AND s.status IN ('active', 'past_due', 'free')
          AND (s.status <> 'past_due' OR s.grace_period_until IS NULL OR now() < s.grace_period_until)
        )
      )
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = p_user_id
       AND (
         COALESCE(s.is_lifetime, false)
         OR (
           s.status IN ('active', 'past_due', 'free')
           AND (s.status <> 'past_due' OR s.grace_period_until IS NULL OR now() < s.grace_period_until)
         )
       )
     LIMIT 1),
    true
  );
$$;

COMMENT ON FUNCTION public.is_free_analytics_user(uuid) IS
  'True when the user is on the free analytics window. False when is_lifetime, or when the previous active/grace plan is not free.';

GRANT EXECUTE ON FUNCTION public.is_free_analytics_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_free_analytics_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_goal_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_status text;
  v_plan_name text;
  v_plan_max int;
  v_max_goals int := 2;
BEGIN
  -- Serialize this user even when they have no subscriptions row (FOR UPDATE would match nothing).
  PERFORM pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  -- A signed-in user inserting another user's id cannot pass RLS. Do not lock that row.
  -- service_role (auth.uid() null), including onboarding, is still enforced below.
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM new.user_id THEN
    RETURN new;
  END IF;

  SELECT
    s.status,
    s.plan_id,
    s.current_period_end,
    s.grace_period_until,
    s.is_lifetime
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = new.user_id
  ORDER BY s.current_period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_status := lower(v_sub.status);

    IF COALESCE(v_sub.is_lifetime, false) THEN
      -- Lifetime is Pro even on the free plan, or when status or the end date has expired.
      SELECT COALESCE(p.max_goals, 20)
        INTO v_plan_max
      FROM public.plans p
      WHERE lower(btrim(p.name)) IN ('pro', 'clarity_premium')
      ORDER BY CASE WHEN lower(btrim(p.name)) = 'pro' THEN 0 ELSE 1 END
      LIMIT 1;
      v_max_goals := COALESCE(v_plan_max, 20);
    ELSE
      -- Same grace rule as normalizeSubscriptionFromRow: past_due and still inside grace.
      IF v_status = 'past_due'
         AND v_sub.grace_period_until IS NOT NULL
         AND now() < v_sub.grace_period_until THEN
        RAISE EXCEPTION 'GOAL_CREATION_GRACE: goal creation is blocked while the subscription is past due and still in grace'
          USING ERRCODE = 'P0001';
      END IF;

      -- Active prepaid period and a premium plan. Anything else keeps the free default of 2.
      IF v_status = 'active'
         AND v_sub.plan_id IS NOT NULL
         AND v_sub.current_period_end IS NOT NULL
         AND v_sub.current_period_end > now() THEN
        SELECT lower(btrim(p.name)), p.max_goals
          INTO v_plan_name, v_plan_max
        FROM public.plans p
        WHERE p.id = v_sub.plan_id;

        IF FOUND AND v_plan_name IN ('pro', 'clarity_premium') THEN
          v_max_goals := COALESCE(v_plan_max, 20);
        END IF;
      END IF;
    END IF;
  END IF;

  IF (
    SELECT count(*)
    FROM public.goals g
    WHERE g.user_id = new.user_id
  ) >= v_max_goals THEN
    RAISE EXCEPTION 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.enforce_goal_plan_limit() IS
  'BEFORE INSERT on goals. Lifetime uses the pro max. Other rows keep the previous active-period rule. Free default is 2.';

REVOKE ALL ON FUNCTION public.enforce_goal_plan_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_goal_plan_limit() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_import_quota()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sub record;
  v_status text;
  v_plan_name text;
  v_is_pro boolean := false;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT p.import_count
    INTO v_count
  FROM public.profiles p
  WHERE p.id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  -- is_lifetime is Pro. Otherwise the previous rule: pro plan name and an active period.
  SELECT
    s.status,
    s.plan_id,
    s.current_period_end,
    s.is_lifetime
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = v_uid
  ORDER BY s.current_period_end DESC
  LIMIT 1;

  IF FOUND THEN
    v_status := lower(v_sub.status);

    IF COALESCE(v_sub.is_lifetime, false) THEN
      v_is_pro := true;
    ELSIF v_status = 'active'
       AND v_sub.plan_id IS NOT NULL
       AND v_sub.current_period_end IS NOT NULL
       AND v_sub.current_period_end > now() THEN
      SELECT lower(btrim(p.name))
        INTO v_plan_name
      FROM public.plans p
      WHERE p.id = v_sub.plan_id;

      IF FOUND AND v_plan_name IN ('pro', 'clarity_premium') THEN
        v_is_pro := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_pro AND COALESCE(v_count, 0) >= 2 THEN
    RAISE EXCEPTION 'IMPORT_QUOTA_EXCEEDED: free import quota is already used'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('klaroph.allow_import_count_write', '1', true);
  UPDATE public.profiles
  SET import_count = import_count + 1
  WHERE id = v_uid
  RETURNING import_count INTO v_count;
  PERFORM set_config('klaroph.allow_import_count_write', '', true);

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.consume_import_quota() IS
  'Increments profiles.import_count for auth.uid(). Lifetime is unlimited. Other Pro rows still need an active period. Free stops at 2.';

REVOKE ALL ON FUNCTION public.consume_import_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_import_quota() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_features(p_user_id uuid)
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
  -- Lifetime is Pro without reading status or current_period_end.
  -- A free plan still returns the pro plan's features.
  SELECT s.plan_id INTO sub_plan_id
  FROM subscriptions s
  WHERE s.user_id = p_user_id
    AND s.is_lifetime IS TRUE
  ORDER BY s.current_period_end DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT p.name, p.max_goals, p.has_simulator, p.has_scenarios, p.has_smart_insights, p.has_export, p.has_analytics
      INTO plan_name_text, plan_max_goals, plan_has_simulator, plan_has_scenarios, plan_has_smart_insights, plan_has_export, plan_has_analytics
    FROM plans p
    WHERE p.id = sub_plan_id
      AND lower(btrim(p.name)) IN ('pro', 'clarity_premium')
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT p.name, p.max_goals, p.has_simulator, p.has_scenarios, p.has_smart_insights, p.has_export, p.has_analytics
        INTO plan_name_text, plan_max_goals, plan_has_simulator, plan_has_scenarios, plan_has_smart_insights, plan_has_export, plan_has_analytics
      FROM plans p
      WHERE lower(btrim(p.name)) IN ('pro', 'clarity_premium')
      ORDER BY CASE WHEN lower(btrim(p.name)) = 'pro' THEN 0 ELSE 1 END
      LIMIT 1;
    END IF;

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

COMMENT ON FUNCTION public.get_user_features(uuid) IS
  'Plan features. is_lifetime returns Pro without reading status or current_period_end. Executable by service_role only.';

REVOKE EXECUTE ON FUNCTION public.get_user_features(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_features(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_features(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_features(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_founder_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH real_users AS (
    SELECT id FROM public.profiles WHERE user_type = 'user'
  ),
  today_utc AS (
    SELECT (now() AT TIME ZONE 'UTC')::date AS d
  ),
  window_7 AS (
    SELECT (now() AT TIME ZONE 'UTC')::date + interval '1 day' AS end_utc,
           (now() AT TIME ZONE 'UTC')::date - interval '7 days' AS start_utc
  ),
  window_30 AS (
    SELECT (now() AT TIME ZONE 'UTC')::date + interval '1 day' AS end_utc,
           (now() AT TIME ZONE 'UTC')::date - interval '30 days' AS start_utc
  ),
  dau_activity AS (
    SELECT user_id FROM public.expenses e, today_utc t WHERE (e.created_at AT TIME ZONE 'UTC')::date = t.d AND e.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.income_records i, today_utc t WHERE (i.created_at AT TIME ZONE 'UTC')::date = t.d AND i.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.goals g, today_utc t WHERE (g.created_at AT TIME ZONE 'UTC')::date = t.d AND g.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.budget_plans bp, today_utc t WHERE (bp.created_at AT TIME ZONE 'UTC')::date = t.d AND bp.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.budget_overrides bo, today_utc t WHERE (bo.created_at AT TIME ZONE 'UTC')::date = t.d AND bo.user_id IN (SELECT id FROM real_users)
  ),
  wau_activity AS (
    SELECT user_id FROM public.expenses e, window_7 w WHERE e.created_at >= w.start_utc AND e.created_at < w.end_utc AND e.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.income_records i, window_7 w WHERE i.created_at >= w.start_utc AND i.created_at < w.end_utc AND i.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.goals g, window_7 w WHERE g.created_at >= w.start_utc AND g.created_at < w.end_utc AND g.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.budget_plans bp, window_7 w WHERE bp.created_at >= w.start_utc AND bp.created_at < w.end_utc AND bp.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.budget_overrides bo, window_7 w WHERE bo.created_at >= w.start_utc AND bo.created_at < w.end_utc AND bo.user_id IN (SELECT id FROM real_users)
  ),
  mau_activity AS (
    SELECT user_id FROM public.expenses e, window_30 w WHERE e.created_at >= w.start_utc AND e.created_at < w.end_utc AND e.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.income_records i, window_30 w WHERE i.created_at >= w.start_utc AND i.created_at < w.end_utc AND i.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.goals g, window_30 w WHERE g.created_at >= w.start_utc AND g.created_at < w.end_utc AND g.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.budget_plans bp, window_30 w WHERE bp.created_at >= w.start_utc AND bp.created_at < w.end_utc AND bp.user_id IN (SELECT id FROM real_users)
    UNION
    SELECT user_id FROM public.budget_overrides bo, window_30 w WHERE bo.created_at >= w.start_utc AND bo.created_at < w.end_utc AND bo.user_id IN (SELECT id FROM real_users)
  ),
  retention_cohort AS (
    SELECT p.id AS user_id, p.created_at AS signup_at
    FROM public.profiles p
    WHERE p.id IN (SELECT id FROM real_users)
      AND p.created_at >= (now() AT TIME ZONE 'UTC')::date - interval '14 days'
  ),
  retention_returned AS (
    SELECT c.user_id
    FROM retention_cohort c
    JOIN auth.users u ON u.id = c.user_id
    WHERE u.last_sign_in_at IS NOT NULL
      AND u.last_sign_in_at > c.signup_at
      AND u.last_sign_in_at <= c.signup_at + interval '7 days'
  ),
  retention_activity_returned AS (
    SELECT c.user_id
    FROM retention_cohort c
    WHERE EXISTS (SELECT 1 FROM public.expenses e WHERE e.user_id = c.user_id AND e.created_at > c.signup_at AND e.created_at <= c.signup_at + interval '7 days')
       OR EXISTS (SELECT 1 FROM public.income_records i WHERE i.user_id = c.user_id AND i.created_at > c.signup_at AND i.created_at <= c.signup_at + interval '7 days')
       OR EXISTS (SELECT 1 FROM public.goals g WHERE g.user_id = c.user_id AND g.created_at > c.signup_at AND g.created_at <= c.signup_at + interval '7 days')
       OR EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.user_id = c.user_id AND bp.created_at > c.signup_at AND bp.created_at <= c.signup_at + interval '7 days')
       OR EXISTS (SELECT 1 FROM public.budget_overrides bo WHERE bo.user_id = c.user_id AND bo.created_at > c.signup_at AND bo.created_at <= c.signup_at + interval '7 days')
  ),
  first_expense_agg AS (
    SELECT fe.user_id, fe.first_ts, p.created_at AS signup_at
    FROM (SELECT user_id, MIN(created_at) AS first_ts FROM public.expenses WHERE user_id IN (SELECT id FROM real_users) GROUP BY user_id) fe
    JOIN public.profiles p ON p.id = fe.user_id
  )
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*)::int FROM real_users),
    'new_users_today', (SELECT COUNT(*)::int FROM public.profiles WHERE user_type = 'user' AND (created_at AT TIME ZONE 'UTC')::date = (SELECT d FROM today_utc)),
    'dau', (SELECT COUNT(DISTINCT user_id)::int FROM dau_activity),
    'wau', (SELECT COUNT(DISTINCT user_id)::int FROM wau_activity),
    'mau', (SELECT COUNT(DISTINCT user_id)::int FROM mau_activity),
    'total_expenses', (SELECT COUNT(*)::int FROM public.expenses WHERE user_id IN (SELECT id FROM real_users)),
    'active_budget_users', (SELECT COUNT(DISTINCT user_id)::int FROM public.budget_plans WHERE user_id IN (SELECT id FROM real_users) AND updated_at >= (now() AT TIME ZONE 'UTC') - interval '90 days'),
    'pro_users', (SELECT COUNT(DISTINCT s.user_id)::int FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id WHERE s.user_id IN (SELECT id FROM real_users) AND (s.is_lifetime = true OR (s.status = 'active' AND s.current_period_end > now() AND p.name IN ('pro', 'clarity_premium')))),
    'free_to_pro_conversion', (SELECT ROUND(100.0 * (SELECT COUNT(DISTINCT s.user_id) FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id WHERE s.user_id IN (SELECT id FROM real_users) AND (s.is_lifetime = true OR (s.status = 'active' AND s.current_period_end > now() AND p.name IN ('pro', 'clarity_premium')))) / NULLIF((SELECT COUNT(*) FROM real_users), 0), 2)),
    'seven_day_retention', (SELECT ROUND(100.0 * (SELECT COUNT(*) FROM retention_returned) / NULLIF((SELECT COUNT(*) FROM retention_cohort), 0), 2)),
    'auth_audit', (SELECT jsonb_build_object(
      'auth_users_count', (SELECT COUNT(*)::int FROM auth.users),
      'profiles_count', (SELECT COUNT(*)::int FROM public.profiles),
      'auth_minus_profiles', (SELECT COUNT(*)::int FROM auth.users) - (SELECT COUNT(*)::int FROM public.profiles),
      'auth_without_profile', (SELECT COUNT(*)::int FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id))
    )),
    'first_value_moment', (SELECT jsonb_build_object(
      'avg_days_to_first_expense', (SELECT ROUND(AVG(EXTRACT(epoch FROM (fe.first_ts - fe.signup_at)) / 86400)::numeric, 2) FROM first_expense_agg fe),
      'avg_hours_to_first_expense', (SELECT ROUND(AVG(EXTRACT(epoch FROM (fe.first_ts - fe.signup_at)) / 3600)::numeric, 2) FROM first_expense_agg fe)
    )),
    'seven_day_retention_activity', (SELECT ROUND(100.0 * (SELECT COUNT(*) FROM retention_activity_returned) / NULLIF((SELECT COUNT(*) FROM retention_cohort), 0), 2))
  );
$$;

COMMENT ON FUNCTION public.get_founder_metrics() IS 'Founder dashboard: all metrics in one call. Counts only real users (profiles.user_type = user). pro_users counts is_lifetime, including a free plan, or an active pro period. auth_audit uses full profiles count. Use service_role or backend only.';

GRANT EXECUTE ON FUNCTION public.get_founder_metrics() TO service_role;

