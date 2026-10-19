-- Server reads of synced tables skip tombstones.
-- Latest bodies are enforce_goal_plan_limit and get_founder_metrics from
-- 20261019000003, and get_clarity_level from 20250225100000.
-- /api/cron/week-in-pesos is not in this repo. The payday summary cron reads
-- expenses and income_records in application code, which filters deleted_at.

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
      AND g.deleted_at IS NULL
  ) >= v_max_goals THEN
    RAISE EXCEPTION 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.enforce_goal_plan_limit() IS
  'BEFORE INSERT on goals. Counts live goals only. Lifetime uses the pro max. Other rows keep the previous active-period rule. Free default is 2.';

REVOKE ALL ON FUNCTION public.enforce_goal_plan_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_goal_plan_limit() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_clarity_level(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  goal_count int;
  completion int;
  streak int;
  level int := 1;
BEGIN
  SELECT COUNT(*) INTO goal_count
  FROM goals
  WHERE user_id = p_user_id
    AND deleted_at IS NULL;
  SELECT get_profile_completion_percentage(p_user_id) INTO completion;
  SELECT COALESCE((SELECT streak_days FROM profiles WHERE id = p_user_id), 0) INTO streak;

  IF goal_count >= 3 AND streak >= 7 THEN
    level := 5;
  ELSIF streak >= 30 THEN
    level := 4;
  ELSIF completion >= 100 THEN
    level := 3;
  ELSIF goal_count >= 1 THEN
    level := 2;
  END IF;

  RETURN level;
END;
$$;

COMMENT ON FUNCTION public.get_clarity_level(uuid) IS
  'Clarity level from live goals, profile completion, and streak. Soft-deleted goals are not counted.';

GRANT EXECUTE ON FUNCTION public.get_clarity_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clarity_level(uuid) TO service_role;

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
    SELECT user_id FROM public.expenses e, today_utc t WHERE (e.created_at AT TIME ZONE 'UTC')::date = t.d AND e.user_id IN (SELECT id FROM real_users) AND e.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.income_records i, today_utc t WHERE (i.created_at AT TIME ZONE 'UTC')::date = t.d AND i.user_id IN (SELECT id FROM real_users) AND i.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.goals g, today_utc t WHERE (g.created_at AT TIME ZONE 'UTC')::date = t.d AND g.user_id IN (SELECT id FROM real_users) AND g.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.budget_plans bp, today_utc t WHERE (bp.created_at AT TIME ZONE 'UTC')::date = t.d AND bp.user_id IN (SELECT id FROM real_users) AND bp.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.budget_overrides bo, today_utc t WHERE (bo.created_at AT TIME ZONE 'UTC')::date = t.d AND bo.user_id IN (SELECT id FROM real_users) AND bo.deleted_at IS NULL
  ),
  wau_activity AS (
    SELECT user_id FROM public.expenses e, window_7 w WHERE e.created_at >= w.start_utc AND e.created_at < w.end_utc AND e.user_id IN (SELECT id FROM real_users) AND e.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.income_records i, window_7 w WHERE i.created_at >= w.start_utc AND i.created_at < w.end_utc AND i.user_id IN (SELECT id FROM real_users) AND i.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.goals g, window_7 w WHERE g.created_at >= w.start_utc AND g.created_at < w.end_utc AND g.user_id IN (SELECT id FROM real_users) AND g.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.budget_plans bp, window_7 w WHERE bp.created_at >= w.start_utc AND bp.created_at < w.end_utc AND bp.user_id IN (SELECT id FROM real_users) AND bp.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.budget_overrides bo, window_7 w WHERE bo.created_at >= w.start_utc AND bo.created_at < w.end_utc AND bo.user_id IN (SELECT id FROM real_users) AND bo.deleted_at IS NULL
  ),
  mau_activity AS (
    SELECT user_id FROM public.expenses e, window_30 w WHERE e.created_at >= w.start_utc AND e.created_at < w.end_utc AND e.user_id IN (SELECT id FROM real_users) AND e.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.income_records i, window_30 w WHERE i.created_at >= w.start_utc AND i.created_at < w.end_utc AND i.user_id IN (SELECT id FROM real_users) AND i.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.goals g, window_30 w WHERE g.created_at >= w.start_utc AND g.created_at < w.end_utc AND g.user_id IN (SELECT id FROM real_users) AND g.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.budget_plans bp, window_30 w WHERE bp.created_at >= w.start_utc AND bp.created_at < w.end_utc AND bp.user_id IN (SELECT id FROM real_users) AND bp.deleted_at IS NULL
    UNION
    SELECT user_id FROM public.budget_overrides bo, window_30 w WHERE bo.created_at >= w.start_utc AND bo.created_at < w.end_utc AND bo.user_id IN (SELECT id FROM real_users) AND bo.deleted_at IS NULL
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
    WHERE EXISTS (SELECT 1 FROM public.expenses e WHERE e.user_id = c.user_id AND e.deleted_at IS NULL AND e.created_at > c.signup_at AND e.created_at <= c.signup_at + interval '7 days')
       OR EXISTS (SELECT 1 FROM public.income_records i WHERE i.user_id = c.user_id AND i.deleted_at IS NULL AND i.created_at > c.signup_at AND i.created_at <= c.signup_at + interval '7 days')
       OR EXISTS (SELECT 1 FROM public.goals g WHERE g.user_id = c.user_id AND g.deleted_at IS NULL AND g.created_at > c.signup_at AND g.created_at <= c.signup_at + interval '7 days')
       OR EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.user_id = c.user_id AND bp.deleted_at IS NULL AND bp.created_at > c.signup_at AND bp.created_at <= c.signup_at + interval '7 days')
       OR EXISTS (SELECT 1 FROM public.budget_overrides bo WHERE bo.user_id = c.user_id AND bo.deleted_at IS NULL AND bo.created_at > c.signup_at AND bo.created_at <= c.signup_at + interval '7 days')
  ),
  first_expense_agg AS (
    SELECT fe.user_id, fe.first_ts, p.created_at AS signup_at
    FROM (SELECT user_id, MIN(created_at) AS first_ts FROM public.expenses WHERE user_id IN (SELECT id FROM real_users) AND deleted_at IS NULL GROUP BY user_id) fe
    JOIN public.profiles p ON p.id = fe.user_id
  )
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*)::int FROM real_users),
    'new_users_today', (SELECT COUNT(*)::int FROM public.profiles WHERE user_type = 'user' AND (created_at AT TIME ZONE 'UTC')::date = (SELECT d FROM today_utc)),
    'dau', (SELECT COUNT(DISTINCT user_id)::int FROM dau_activity),
    'wau', (SELECT COUNT(DISTINCT user_id)::int FROM wau_activity),
    'mau', (SELECT COUNT(DISTINCT user_id)::int FROM mau_activity),
    'total_expenses', (SELECT COUNT(*)::int FROM public.expenses WHERE user_id IN (SELECT id FROM real_users) AND deleted_at IS NULL),
    'active_budget_users', (SELECT COUNT(DISTINCT user_id)::int FROM public.budget_plans WHERE user_id IN (SELECT id FROM real_users) AND deleted_at IS NULL AND updated_at >= (now() AT TIME ZONE 'UTC') - interval '90 days'),
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

COMMENT ON FUNCTION public.get_founder_metrics() IS
  'Founder dashboard: all metrics in one call. Counts only real users and live synced rows. pro_users counts is_lifetime, including a free plan, or an active pro period. auth_audit uses full profiles count. Use service_role or backend only.';

REVOKE ALL ON FUNCTION public.get_founder_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_founder_metrics() TO service_role;
