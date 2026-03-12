-- auth_audit: use full profiles count so audit reflects auth vs profiles sync (not real_users).
-- profiles_count = all profiles; auth_minus_profiles = auth.users - profiles. Other metrics unchanged.

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
    'pro_users', (SELECT COUNT(DISTINCT s.user_id)::int FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id WHERE s.user_id IN (SELECT id FROM real_users) AND s.status = 'active' AND s.current_period_end > now() AND p.name IN ('pro', 'clarity_premium')),
    'free_to_pro_conversion', (SELECT ROUND(100.0 * (SELECT COUNT(DISTINCT s.user_id) FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id WHERE s.user_id IN (SELECT id FROM real_users) AND s.status = 'active' AND s.current_period_end > now() AND p.name IN ('pro', 'clarity_premium')) / NULLIF((SELECT COUNT(*) FROM real_users), 0), 2)),
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

COMMENT ON FUNCTION public.get_founder_metrics() IS 'Founder dashboard: all metrics in one call. Counts only real users (profiles.user_type = user). auth_audit uses full profiles count. Use service_role or backend only.';

GRANT EXECUTE ON FUNCTION public.get_founder_metrics() TO service_role;
